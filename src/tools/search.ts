import { resolveNetwork, type NetworkName } from "../utils/networks.js";
import { fetchWithTimeout } from "../utils/fetch.js";

export async function searchContracts(params: {
  query: string;
  network?: NetworkName;
  size?: number;
}) {
  const { query, network, size = 10 } = params;
  const config = resolveNetwork(network);

  // Search via accounts API (supports name search)
  const url = `${config.apiUrl}/accounts?search=${encodeURIComponent(query)}&size=${size}&isSmartContract=true`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as Array<Record<string, unknown>>;

  const results = data.map((acc) => {
    const assets = (acc.assets || {}) as Record<string, unknown>;
    const result: Record<string, unknown> = {
      name: assets.name || null,
      address: acc.address,
      owner: acc.ownerAddress || null,
      isVerified: acc.isVerified || false,
      balance: acc.balance,
      description: assets.description || null,
      tags: assets.tags || [],
    };
    if (assets.website) result.website = assets.website;
    if (assets.social) result.social = assets.social;
    return result;
  });

  return {
    query,
    network: config.name,
    totalResults: results.length,
    results,
  };
}
