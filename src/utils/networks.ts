export type NetworkName = "mainnet" | "testnet" | "devnet";

export interface NetworkConfig {
  name: NetworkName;
  apiUrl: string;
  gatewayUrl: string;
}

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  mainnet: {
    name: "mainnet",
    apiUrl: "https://api.multiversx.com",
    gatewayUrl: "https://gateway.multiversx.com",
  },
  testnet: {
    name: "testnet",
    apiUrl: "https://testnet-api.multiversx.com",
    gatewayUrl: "https://testnet-gateway.multiversx.com",
  },
  devnet: {
    name: "devnet",
    apiUrl: "https://devnet-api.multiversx.com",
    gatewayUrl: "https://devnet-gateway.multiversx.com",
  },
};

export function resolveNetwork(network?: string): NetworkConfig {
  const name = (
    network ||
    process.env.MULTIVERSX_NETWORK ||
    "mainnet"
  ).toLowerCase() as NetworkName;

  const config = NETWORKS[name];
  if (!config) {
    throw new Error(
      `Unknown network "${name}". Use: mainnet, testnet, or devnet.`
    );
  }

  // Allow env overrides for custom URLs
  return {
    ...config,
    apiUrl: process.env.MULTIVERSX_API_URL || config.apiUrl,
    gatewayUrl: process.env.MULTIVERSX_GATEWAY_URL || config.gatewayUrl,
  };
}
