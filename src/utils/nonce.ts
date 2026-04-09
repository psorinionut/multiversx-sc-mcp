import { resolveNetwork, type NetworkName } from "./networks.js";
import { fetchWithTimeout } from "./fetch.js";

// Local nonce cache: address → { nonce, lastFetchTime }
const nonceCache = new Map<string, { nonce: bigint; timestamp: number }>();

// How long to trust the local cache before re-fetching (ms)
const CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Get the next nonce for an address.
 * Uses local tracking: if we recently sent a tx from this address,
 * returns the incremented local nonce instead of re-fetching.
 * Re-fetches from gateway if cache is stale (>30s).
 */
export async function getAccountNonce(address: string, network?: NetworkName): Promise<bigint> {
  const key = `${network || "mainnet"}:${address}`;
  const cached = nonceCache.get(key);
  const now = Date.now();

  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    // Use local nonce and increment
    const nonce = cached.nonce;
    nonceCache.set(key, { nonce: nonce + 1n, timestamp: now });
    return nonce;
  }

  // Fetch fresh from gateway
  const config = resolveNetwork(network);
  const url = `${config.gatewayUrl}/address/${address}`;
  const response = await fetchWithTimeout(url, undefined, 30000, 2);
  if (!response.ok) {
    throw new Error(`Failed to fetch nonce from gateway: ${response.status}`);
  }
  const body = await response.json() as { data?: { account?: { nonce?: number } } };
  const nonce = body?.data?.account?.nonce;
  if (nonce === undefined) {
    throw new Error(`Could not get nonce for ${address}`);
  }

  const freshNonce = BigInt(nonce);
  // Store nonce+1 for next call (we're about to use freshNonce)
  nonceCache.set(key, { nonce: freshNonce + 1n, timestamp: now });
  return freshNonce;
}

/**
 * Reset the local nonce cache for an address.
 * Call this if a transaction fails and nonce needs to be re-fetched.
 */
export function resetNonceCache(address?: string, network?: NetworkName): void {
  if (address) {
    const key = `${network || "mainnet"}:${address}`;
    nonceCache.delete(key);
  } else {
    nonceCache.clear();
  }
}
