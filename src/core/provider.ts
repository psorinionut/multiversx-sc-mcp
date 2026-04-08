import { ApiNetworkProvider } from "@multiversx/sdk-core";
import { resolveNetwork, type NetworkName } from "../utils/networks.js";

const apiProviders = new Map<string, ApiNetworkProvider>();

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
