import { resolveNetwork, type NetworkName } from "../utils/networks.js";
import { fetchWithTimeout } from "../utils/fetch.js";

interface NetworkInfo {
  network: string;
  apiUrl: string;
  constants: {
    chainId: string;
    gasPerDataByte: number;
    minGasLimit: number;
    minGasPrice: number;
    minTransactionVersion: number;
    [key: string]: unknown;
  };
  stats: {
    epoch: number;
    roundsPassed: number;
    roundsPerEpoch: number;
    blocks: number;
    accounts: number;
    transactions: number;
    shards: number;
    refreshRate: number;
    [key: string]: unknown;
  };
}

export async function getNetworkConfig(params: {
  network?: NetworkName;
}): Promise<NetworkInfo> {
  const { network } = params;
  const config = resolveNetwork(network);

  // Fetch constants and stats in parallel
  const [constantsRes, statsRes] = await Promise.all([
    fetchWithTimeout(`${config.apiUrl}/constants`),
    fetchWithTimeout(`${config.apiUrl}/stats`),
  ]);

  if (!constantsRes.ok) {
    throw new Error(
      `Failed to fetch network constants: ${constantsRes.status} ${constantsRes.statusText}`
    );
  }

  if (!statsRes.ok) {
    throw new Error(
      `Failed to fetch network stats: ${statsRes.status} ${statsRes.statusText}`
    );
  }

  const constants = (await constantsRes.json()) as Record<string, unknown>;
  const stats = (await statsRes.json()) as Record<string, unknown>;

  return {
    network: config.name,
    apiUrl: config.apiUrl,
    constants: {
      chainId: (constants.chainId as string) || "",
      gasPerDataByte: (constants.gasPerDataByte as number) || 0,
      minGasLimit: (constants.minGasLimit as number) || 0,
      minGasPrice: (constants.minGasPrice as number) || 0,
      minTransactionVersion: (constants.minTransactionVersion as number) || 0,
      ...(constants.esdtCost !== undefined && { esdtCost: constants.esdtCost }),
      ...(constants.builtInCost !== undefined && { builtInCost: constants.builtInCost }),
    },
    stats: {
      epoch: (stats.epoch as number) || 0,
      roundsPassed: (stats.roundsPassed as number) || 0,
      roundsPerEpoch: (stats.roundsPerEpoch as number) || 0,
      blocks: (stats.blocks as number) || 0,
      accounts: (stats.accounts as number) || 0,
      transactions: (stats.transactions as number) || 0,
      shards: (stats.shards as number) || 0,
      refreshRate: (stats.refreshRate as number) || 0,
      ...(stats.scResults !== undefined && { scResults: stats.scResults }),
    },
  };
}
