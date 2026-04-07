import { ApiNetworkProvider, ProxyNetworkProvider } from "@multiversx/sdk-core";
import { resolveNetwork, type NetworkName } from "../utils/networks.js";

const apiProviders = new Map<string, ApiNetworkProvider>();
const proxyProviders = new Map<string, ProxyNetworkProvider>();

export function getApiProvider(network?: NetworkName): ApiNetworkProvider {
  const config = resolveNetwork(network);
  const key = config.apiUrl;

  if (!apiProviders.has(key)) {
    apiProviders.set(
      key,
      new ApiNetworkProvider(config.apiUrl, {
        clientName: "mcp-server-multiversx-sc",
      })
    );
  }

  return apiProviders.get(key)!;
}

export function getProxyProvider(network?: NetworkName): ProxyNetworkProvider {
  const config = resolveNetwork(network);
  const key = config.gatewayUrl;

  if (!proxyProviders.has(key)) {
    proxyProviders.set(
      key,
      new ProxyNetworkProvider(config.gatewayUrl, {
        clientName: "mcp-server-multiversx-sc",
      })
    );
  }

  return proxyProviders.get(key)!;
}
