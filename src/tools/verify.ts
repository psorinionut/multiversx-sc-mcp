import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { createHash } from "crypto";
import { UserSigner, Message, MessageComputer } from "@multiversx/sdk-core";
import { resolveNetwork, type NetworkName } from "../utils/networks.js";
import { validateAddress } from "../utils/validation.js";
import { fetchWithTimeout } from "../utils/fetch.js";

/**
 * Probe the explorer's account API for the `isVerified` flag.
 * The verifier service marks tasks "success" several minutes before the
 * explorer indexer flips this flag. Returning both lets callers see the lag.
 */
async function checkExplorerVerifiedFlag(
  address: string,
  network: NetworkName | undefined,
): Promise<{ isVerified: boolean | null; codeHash?: string }> {
  try {
    const apiUrl = resolveNetwork(network).apiUrl;
    const resp = await fetchWithTimeout(
      `${apiUrl}/accounts/${address}?fields=isVerified,codeHash`,
      undefined,
      15_000,
    );
    if (!resp.ok) return { isVerified: null };
    const data = (await resp.json()) as { isVerified?: boolean; codeHash?: string };
    return {
      isVerified: data.isVerified === true ? true : data.isVerified === false ? false : null,
      codeHash: data.codeHash,
    };
  } catch {
    return { isVerified: null };
  }
}

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
      ? `Verification queued. The verifier runs a reproducible Docker build on its servers, which takes 3-10 minutes. Wait at least 2-3 minutes before calling mvx_sc_verify_status with taskId "${taskId}".`
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

  // When the verifier reports success, also probe the account API to see if
  // the explorer's `isVerified` flag has propagated. The two systems are
  // separate indexers; the flag can lag the verifier by several minutes.
  let propagation: { explorerIsVerified: boolean | null; codeHash?: string } | undefined;
  if (status === "finished" && result?.status === "success" && address) {
    const probe = await checkExplorerVerifiedFlag(address, network);
    propagation = { explorerIsVerified: probe.isVerified, codeHash: probe.codeHash };
  }

  let note: string;
  if (status === "finished" && result?.status === "success") {
    if (propagation?.explorerIsVerified === true) {
      note = "Contract verified successfully — source visible on the explorer (isVerified=true confirmed).";
    } else if (propagation?.explorerIsVerified === false || propagation?.explorerIsVerified === null) {
      note = "Verifier accepted the build (status=success), but the explorer indexer hasn't flipped isVerified yet. This usually takes 2-15 minutes after task completion. The contract IS verified from the verifier's side; only the UI flag is lagging.";
    } else {
      note = "Contract verified successfully! Source code and ABI are now visible on the explorer.";
    }
  } else if (status === "finished" && result?.status !== "success") {
    note = `Verification finished with status: ${result?.status}. Check the explorer.`;
  } else {
    note = `Verification still in progress (${status}). Reproducible builds take 3-10 minutes — wait at least 2 minutes between checks. Do not poll rapidly.`;
  }

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
    ...(propagation ? { propagation } : {}),
    note,
  };
}