import { resolveNetwork, type NetworkName } from "./networks.js";
import { fetchWithTimeout } from "./fetch.js";

// Local nonce cache: address → { nextNonce, lastFetchTime }
// nextNonce is the nonce to hand out on the NEXT call.
const nonceCache = new Map<string, { nextNonce: bigint; timestamp: number }>();

// Per-key serialization chain. Ensures concurrent callers for the same
// (network, address) get distinct, monotonically increasing nonces — even
// when they arrive in the same event-loop tick and all miss the cache.
const pendingChain = new Map<string, Promise<bigint>>();

const CACHE_TTL_MS = 30000; // 30 seconds

async function fetchFreshNonce(address: string, network?: NetworkName): Promise<bigint> {
  const config = resolveNetwork(network);
  const url = `${config.gatewayUrl}/address/${address}`;
  const response = await fetchWithTimeout(url, undefined, 30000, 2);
  if (!response.ok) {
    throw new Error(`Failed to fetch nonce from gateway: ${response.status}`);
  }
  const body = (await response.json()) as { data?: { account?: { nonce?: number } } };
  const nonce = body?.data?.account?.nonce;
  if (nonce === undefined) {
    throw new Error(`Could not get nonce for ${address}`);
  }
  return BigInt(nonce);
}

/**
 * Get the next nonce for an address.
 *
 * Serializes per (network, address) via a promise chain so parallel callers
 * never observe the same nonce — the second call waits for the first to
 * update the cache before reading it.
 *
 * Uses the local cache (TTL: 30s) to avoid refetching after recent sends.
 */
export async function getAccountNonce(address: string, network?: NetworkName): Promise<bigint> {
  const key = `${network || "mainnet"}:${address}`;
  const prev = pendingChain.get(key) ?? Promise.resolve(0n);

  const next = prev
    .catch(() => 0n) // don't propagate a previous caller's failure
    .then(async () => {
      const cached = nonceCache.get(key);
      const now = Date.now();
      let nonce: bigint;
      if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        nonce = cached.nextNonce;
      } else {
        nonce = await fetchFreshNonce(address, network);
      }
      nonceCache.set(key, { nextNonce: nonce + 1n, timestamp: now });
      return nonce;
    });

  // Record the chain so the next caller waits for this one.
  // Use .catch to keep the chain alive even if this call fails — the next
  // caller will observe the failure, retry the fetch, and move forward.
  pendingChain.set(
    key,
    next.catch(() => 0n),
  );
  return next;
}

/**
 * Reset the local nonce cache for an address.
 * Call this if a transaction fails and nonce needs to be re-fetched.
 */
export function resetNonceCache(address?: string, network?: NetworkName): void {
  if (address) {
    const key = `${network || "mainnet"}:${address}`;
    nonceCache.delete(key);
    pendingChain.delete(key);
  } else {
    nonceCache.clear();
    pendingChain.clear();
  }
}
