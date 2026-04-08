import { Address } from "@multiversx/sdk-core";
import { resolveNetwork, type NetworkName } from "../utils/networks.js";
import { validateAddress } from "../utils/validation.js";
import { fetchWithTimeout } from "../utils/fetch.js";

export async function readStorage(params: {
  address: string;
  key: string;
  network?: NetworkName;
}) {
  const { address, key, network } = params;
  validateAddress(address);
  const config = resolveNetwork(network);

  // Convert key to hex if it has a 0x prefix; otherwise treat as mapper name
  const hexKey = key.startsWith("0x") ? key.slice(2) : Buffer.from(key).toString("hex");

  // Use gateway endpoint for storage key reads
  const url = `${config.gatewayUrl}/address/${address}/key/${hexKey}`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`Gateway error: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as { data?: { value?: string }; error?: string; code?: string };

  if (body.code !== "successful" || !body.data) {
    return {
      key,
      hexKey,
      value: null,
      note: body.error || "Storage key not found. It may not exist or the key encoding may be incorrect.",
    };
  }

  const hexValue = body.data.value || "";

  return {
    key,
    hexKey,
    raw: hexValue,
    decoded: tryDecodeValue(hexValue),
  };
}

export async function listStorageKeys(params: {
  address: string;
  network?: NetworkName;
}) {
  const { address, network } = params;
  validateAddress(address);
  const config = resolveNetwork(network);

  const url = `${config.apiUrl}/accounts/${address}/keys`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as Record<string, string>;

  const keys = Object.entries(data).map(([hexKey, hexValue]) => ({
    hexKey,
    keyDecoded: tryDecodeHexString(hexKey),
    raw: hexValue,
    decoded: tryDecodeValue(hexValue),
  }));

  return {
    totalKeys: keys.length,
    keys: keys.slice(0, 100), // Limit to first 100 to avoid huge responses
    note: keys.length > 100 ? `Showing first 100 of ${keys.length} keys.` : undefined,
  };
}

function tryDecodeHexString(hex: string): string | null {
  try {
    const buf = Buffer.from(hex, "hex");
    const str = buf.toString("utf-8");
    // Check if it's printable ASCII
    if (/^[\x20-\x7E]+$/.test(str)) {
      return str;
    }
    return null;
  } catch {
    return null;
  }
}

function tryDecodeValue(hex: string): Record<string, unknown> {
  if (!hex) return { empty: true };

  const buf = Buffer.from(hex, "hex");
  const result: Record<string, unknown> = {};

  // Try as u64
  if (buf.length <= 8) {
    let num = BigInt(0);
    for (let i = 0; i < buf.length; i++) {
      num = (num << BigInt(8)) | BigInt(buf[i]);
    }
    result.asNumber = num.toString();
  }

  // Try as bech32 address (32 bytes)
  if (buf.length === 32) {
    try {
      const addr = new Address(buf);
      result.asAddress = addr.toBech32();
    } catch {
      // Not an address
    }
  }

  // Try as UTF-8 string
  const str = buf.toString("utf-8");
  if (/^[\x20-\x7E]+$/.test(str)) {
    result.asString = str;
  }

  result.hex = hex;
  result.length = buf.length;

  return result;
}
