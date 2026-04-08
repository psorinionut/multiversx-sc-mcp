import { Abi } from "@multiversx/sdk-core";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { resolveNetwork, type NetworkName } from "../utils/networks.js";
import { fetchWithTimeout } from "../utils/fetch.js";

// In-memory ABI cache: address → Abi
const abiCache = new Map<string, Abi>();

/**
 * Load an ABI with the following resolution order:
 * 1. If abiPath provided → load from local file
 * 2. If address provided → try fetching from API (verified contracts)
 * 3. Return null if neither works
 */
export async function loadAbi(options: {
  abiPath?: string;
  address?: string;
  network?: NetworkName;
}): Promise<Abi | null> {
  const { abiPath, address, network } = options;

  // 1. Local file
  if (abiPath) {
    return loadAbiFromFile(abiPath);
  }

  // 2. From API (cached)
  if (address) {
    const cacheKey = `${network || "mainnet"}:${address}`;
    if (abiCache.has(cacheKey)) {
      return abiCache.get(cacheKey)!;
    }

    const abi = await fetchAbiFromApi(address, network);
    if (abi) {
      abiCache.set(cacheKey, abi);
      return abi;
    }
  }

  return null;
}

async function loadAbiFromFile(path: string): Promise<Abi> {
  if (!existsSync(path)) {
    throw new Error(`ABI file not found: ${path}`);
  }

  const content = await readFile(path, "utf-8");
  const json = JSON.parse(content);
  return Abi.create(json);
}

async function fetchAbiFromApi(
  address: string,
  network?: NetworkName
): Promise<Abi | null> {
  const config = resolveNetwork(network);
  const url = `${config.apiUrl}/accounts/${address}/verification`;

  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      return null;
    }

    const data = await response.json() as Record<string, unknown>;

    // ABI can be at data.abi (direct) or data.source.abi (verification endpoint)
    let abiJson: object | null = null;
    if (data?.abi) {
      abiJson = data.abi as object;
    } else if (data?.source && typeof data.source === "object") {
      const source = data.source as Record<string, unknown>;
      if (source.abi) {
        abiJson = source.abi as object;
      }
    }

    if (abiJson) {
      return Abi.create(abiJson);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse a raw ABI JSON object into an Abi instance.
 */
export function parseAbiJson(json: object): Abi {
  return Abi.create(json);
}
