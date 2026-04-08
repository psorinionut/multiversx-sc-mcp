import { resolveNetwork, type NetworkName } from "./networks.js";
import { fetchWithTimeout } from "./fetch.js";

/**
 * Fetch the current nonce from the GATEWAY (not API).
 * The gateway returns the authoritative on-chain nonce,
 * while the API may be behind due to indexing delays.
 */
export async function getAccountNonce(address: string, network?: NetworkName): Promise<bigint> {
  const config = resolveNetwork(network);
  const url = `${config.gatewayUrl}/address/${address}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch nonce from gateway: ${response.status}`);
  }
  const body = await response.json() as { data?: { account?: { nonce?: number } } };
  const nonce = body?.data?.account?.nonce;
  if (nonce === undefined) {
    throw new Error(`Could not get nonce for ${address}`);
  }
  return BigInt(nonce);
}
