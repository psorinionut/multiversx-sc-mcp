export type NetworkName = "mainnet" | "testnet" | "devnet" | "localnet";

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
  // Local chain-simulator. Override via MULTIVERSX_API_URL / MULTIVERSX_GATEWAY_URL
  // if you expose the simulator on a non-default host/port.
  localnet: {
    name: "localnet",
    apiUrl: "http://localhost:8085",
    gatewayUrl: "http://localhost:8085",
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
      `Unknown network "${name}". Use: mainnet, testnet, devnet, or localnet.`
    );
  }

  // Allow env overrides for custom URLs
  return {
    ...config,
    apiUrl: process.env.MULTIVERSX_API_URL || config.apiUrl,
    gatewayUrl: process.env.MULTIVERSX_GATEWAY_URL || config.gatewayUrl,
  };
}

export function getChainId(network?: string): string {
  const net = (network || process.env.MULTIVERSX_NETWORK || "mainnet").toLowerCase();
  switch (net) {
    case "mainnet":
      return "1";
    case "testnet":
      return "T";
    case "devnet":
      return "D";
    case "localnet":
      // MultiversX chain-simulator default chain ID
      return "chain";
    default:
      return "1";
  }
}

export function getExplorerUrl(network: string | undefined, path: string): string {
  const net = (network || process.env.MULTIVERSX_NETWORK || "mainnet").toLowerCase();
  // Chain simulator has no public explorer; return a local placeholder
  if (net === "localnet") {
    return `http://localhost:8085${path}`;
  }
  const explorerPrefix = net === "mainnet" ? "" : `${net}-`;
  return `https://${explorerPrefix}explorer.multiversx.com${path}`;
}
