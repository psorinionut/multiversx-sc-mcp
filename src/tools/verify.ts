import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { createHash } from "crypto";
import { UserSigner, Message, MessageComputer } from "@multiversx/sdk-core";
import type { NetworkName } from "../utils/networks.js";
import { validateAddress } from "../utils/validation.js";
import { fetchWithTimeout } from "../utils/fetch.js";

const VERIFIER_URLS: Record<string, string> = {
  mainnet: "https://play-api.multiversx.com",
  testnet: "https://testnet-play-api.multiversx.com",
  devnet: "https://devnet-play-api.multiversx.com",
};

function getVerifierUrl(network?: NetworkName): { url: string; net: string } {
  const net = (network || process.env.MULTIVERSX_NETWORK || "mainnet").toLowerCase();
  const url = VERIFIER_URLS[net];
  if (!url) {
    throw new Error(`No verifier URL known for network "${net}".`);
  }
  return { url, net };
}

/**
 * Submit a verification request. Returns immediately with taskId.
 * Use checkVerificationStatus() to poll for completion.
 */
export async function verifyContract(params: {
  address: string;
  packagedSrc: string;
  dockerImage: string;
  contractVariant?: string;
  walletPem?: string;
  network?: NetworkName;
}) {
  const { address, packagedSrc, dockerImage, contractVariant, walletPem, network } = params;
  validateAddress(address);

  if (!existsSync(packagedSrc)) {
    throw new Error(`Packaged source file not found: ${packagedSrc}`);
  }

  const pemPath = walletPem || process.env.MULTIVERSX_WALLET_PEM;
  if (!pemPath) {
    throw new Error(
      "Wallet required for verification. Set MULTIVERSX_WALLET_PEM env var or provide 'walletPem' parameter."
    );
  }

  const { url: verifierUrl, net } = getVerifierUrl(network);

  // Read packaged source
  const sourceContent = await readFile(packagedSrc, "utf-8");
  const sourceCode = JSON.parse(sourceContent);

  // Load signer
  let signer: UserSigner;
  try {
    const pemContent = await readFile(pemPath, "utf-8");
    signer = UserSigner.fromPem(pemContent);
  } catch (err) {
    throw new Error(`Failed to load wallet from "${pemPath}": ${(err as Error).message}`);
  }

  // Compact JSON (no spaces after separators) — matches Python's separators=(',', ':')
  const compactPayload = JSON.stringify({
    contract: address,
    dockerImage: dockerImage,
    sourceCode: sourceCode,
    contractVariant: contractVariant || null,
  });

  // Sign: SHA256(payload) → hex → concatenate with address → sign as message
  // mxpy's Account.sign_message() uses MessageComputer which adds the
  // "\x17Elrond Signed Message:\n" prefix + length + keccak256 before ed25519 signing.
  const payloadHash = createHash("sha256").update(compactPayload).digest("hex");
  const rawDataToSign = `${address}${payloadHash}`;

  const messageComputer = new MessageComputer();
  const message = new Message({ data: new TextEncoder().encode(rawDataToSign) });
  const serializedForSigning = messageComputer.computeBytesForSigning(message);
  const signature = await signer.sign(serializedForSigning);

  // Build request
  const request = {
    signature: Buffer.from(signature).toString("hex"),
    payload: {
      contract: address,
      dockerImage: dockerImage,
      sourceCode: sourceCode,
      contractVariant: contractVariant || null,
    },
  };

  // Submit (longer timeout — source JSON can be large)
  const response = await fetchWithTimeout(`${verifierUrl}/verifier`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }, 120000);

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok && response.status !== 408) {
    throw new Error(`Verification request failed (${response.status}): ${JSON.stringify(data)}`);
  }

  const taskId = data.taskId as string | undefined;
  const status = data.status as string | undefined;
  const explorerPrefix = net === "mainnet" ? "" : `${net}-`;

  return {
    status: status || "submitted",
    taskId: taskId || null,
    address,
    network: net,
    explorerUrl: `https://${explorerPrefix}explorer.multiversx.com/accounts/${address}`,
    note: taskId
      ? `Verification queued. Use mvx_verify_status with taskId "${taskId}" to check progress.`
      : status === "finished"
        ? "Verification completed immediately."
        : "Verification submitted.",
  };
}

/**
 * Check the status of a verification task.
 */
export async function checkVerificationStatus(params: {
  taskId: string;
  address?: string;
  network?: NetworkName;
}) {
  const { taskId, address, network } = params;
  const { url: verifierUrl, net } = getVerifierUrl(network);

  const response = await fetchWithTimeout(`${verifierUrl}/tasks/${taskId}`);
  if (!response.ok) {
    throw new Error(`Failed to check task status: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const status = data.status as string;
  const result = data.result as Record<string, unknown> | undefined;
  const explorerPrefix = net === "mainnet" ? "" : `${net}-`;

  return {
    taskId,
    status,
    queued: data.queued,
    started: data.started,
    finished: data.finished,
    result: result || null,
    address: address || null,
    explorerUrl: address
      ? `https://${explorerPrefix}explorer.multiversx.com/accounts/${address}`
      : null,
    note: status === "finished" && result?.status === "success"
      ? "Contract verified successfully! Source code and ABI are now visible on the explorer."
      : status === "finished" && result?.status !== "success"
        ? `Verification finished with status: ${result?.status}. Check the explorer.`
        : `Verification still in progress (${status}). Check again in a minute.`,
  };
}