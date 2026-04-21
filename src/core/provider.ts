import { ApiNetworkProvider, ProxyNetworkProvider } from "@multiversx/sdk-core";
import { resolveNetwork, type NetworkName } from "../utils/networks.js";

// Cache both flavors independently — one per URL.
const apiProviders = new Map<string, ApiNetworkProvider>();
const proxyProviders = new Map<string, ProxyNetworkProvider>();

/**
 * Get a network provider for the given network.
 * - localnet → ProxyNetworkProvider (gateway flavor; what the chain simulator speaks)
 * - everything else → ApiNetworkProvider (api.multiversx.com indexer flavor)
 *
 * INetworkProvider is the shared interface both implement, so downstream
 * code that calls getTransaction / sendTransaction / queryContract / etc
 * works regardless of the flavor.
 */
export function getApiProvider(network?: NetworkName) {
  const config = resolveNetwork(network);
  const isLocalnet = (network || process.env.MULTIVERSX_NETWORK || "mainnet").toLowerCase() === "localnet";

  if (isLocalnet) {
    const key = config.gatewayUrl;
    if (!proxyProviders.has(key)) {
      proxyProviders.set(
        key,
        new ProxyNetworkProvider(config.gatewayUrl, {
          clientName: "mcp-server-multiversx-sc",
        }),
      );
    }
    return proxyProviders.get(key)!;
  }

  const key = config.apiUrl;
  if (!apiProviders.has(key)) {
    apiProviders.set(
      key,
      new ApiNetworkProvider(config.apiUrl, {
        clientName: "mcp-server-multiversx-sc",
      }),
    );
  }
  return apiProviders.get(key)!;
}
