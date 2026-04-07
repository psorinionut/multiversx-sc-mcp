import { UserSigner, Message, MessageComputer } from "@multiversx/sdk-core";
import { readFile } from "fs/promises";
import { resolveNetwork, type NetworkName } from "../utils/networks.js";

/**
 * Decode a MultiversX native auth token.
 *
 * Token format: `{address}.{bodyBase64}.{signatureHex}`
 * Body (base64-decoded): `{blockHash}.{ttl}.{origin}.{extraInfoBase64?}`
 */
export async function decodeNativeAuth(params: { token: string }) {
  const { token } = params;

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error(
      `Invalid native auth token: expected 3 dot-separated parts (address.body.signature), got ${parts.length}.`
    );
  }

  const [addressBase64, bodyBase64, signatureHex] = parts;

  // Address is base64-encoded
  const address = Buffer.from(addressBase64, "base64").toString("utf-8");

  // Body is base64-encoded: "{blockHash}.{ttl}.{origin}" or "{blockHash}.{ttl}.{origin}.{extraInfoBase64}"
  const bodyDecoded = Buffer.from(bodyBase64, "base64").toString("utf-8");
  const bodyParts = bodyDecoded.split(".");

  if (bodyParts.length < 3) {
    throw new Error(
      `Invalid native auth token body: expected at least 3 dot-separated fields (blockHash.ttl.origin), got ${bodyParts.length}.`
    );
  }

  const blockHash = bodyParts[0];
  const ttl = parseInt(bodyParts[1], 10);
  const origin = bodyParts[2];

  let extraInfo: unknown = undefined;
  if (bodyParts.length > 3 && bodyParts[3]) {
    try {
      const extraInfoDecoded = Buffer.from(bodyParts[3], "base64").toString("utf-8");
      extraInfo = JSON.parse(extraInfoDecoded);
    } catch {
      // If it's not valid JSON, return the raw base64 value
      extraInfo = bodyParts[3];
    }
  }

  return {
    address,
    body: bodyDecoded,
    signature: signatureHex,
    blockHash,
    ttl,
    origin,
    extraInfo,
  };
}

/**
 * Generate a MultiversX native auth token.
 *
 * Steps:
 * 1. Fetch the latest block hash from the API
 * 2. Build the token body: base64("{blockHash}.{ttl}.{origin}")
 * 3. Build the signable message: "{address}{body}"
 * 4. Sign using the Message + MessageComputer pattern
 * 5. Combine: base64(address).body.signature
 */
export async function generateNativeAuth(params: {
  walletPem?: string;
  origin?: string;
  ttl?: number;
  extraInfo?: Record<string, unknown>;
  network?: NetworkName;
}) {
  const {
    walletPem,
    origin = "https://wallet.multiversx.com",
    ttl = 300,
    extraInfo,
    network,
  } = params;

  // Resolve wallet PEM
  const pemPath = walletPem || process.env.MULTIVERSX_WALLET_PEM;
  if (!pemPath) {
    throw new Error(
      "Wallet required for generating native auth tokens. Set MULTIVERSX_WALLET_PEM env var or provide 'walletPem' parameter."
    );
  }

  const pemContent = await readFile(pemPath, "utf-8");
  const signer = UserSigner.fromPem(pemContent);
  const address = signer.getAddress().toBech32();

  // Fetch latest block hash from API
  const config = resolveNetwork(network);
  const blockHash = await fetchLatestBlockHash(config.apiUrl);

  // Build body: "{blockHash}.{ttl}.{origin}" or "{blockHash}.{ttl}.{origin}.{extraInfoBase64}"
  let bodyRaw = `${blockHash}.${ttl}.${origin}`;
  if (extraInfo) {
    const extraInfoBase64 = Buffer.from(JSON.stringify(extraInfo)).toString("base64");
    bodyRaw = `${bodyRaw}.${extraInfoBase64}`;
  }

  const bodyBase64 = Buffer.from(bodyRaw).toString("base64");

  // The signable message is: "{address}{body}" (address in bech32 + base64 body, concatenated)
  const signableMessage = `${address}${bodyBase64}`;

  // Sign using the Message/MessageComputer pattern
  const messageObj = new Message({
    data: new TextEncoder().encode(signableMessage),
    address: signer.getAddress(),
  });

  const messageComputer = new MessageComputer();
  const serialized = messageComputer.computeBytesForSigning(messageObj);
  const signature = await signer.sign(serialized);
  const signatureHex = Buffer.from(signature).toString("hex");

  // Assemble the token: base64(address).bodyBase64.signature
  const addressBase64 = Buffer.from(address).toString("base64");
  const token = `${addressBase64}.${bodyBase64}.${signatureHex}`;

  return {
    token,
    address,
    origin,
    ttl,
    blockHash,
    extraInfo,
  };
}

async function fetchLatestBlockHash(apiUrl: string): Promise<string> {
  const response = await fetch(`${apiUrl}/blocks?size=1&fields=hash`);
  if (!response.ok) {
    throw new Error(`Failed to fetch latest block from API: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as Array<{ hash: string }>;
  if (!data.length || !data[0].hash) {
    throw new Error("No blocks returned from API.");
  }

  return data[0].hash;
}
