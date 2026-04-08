import { resolveNetwork, type NetworkName } from "../utils/networks.js";
import { validateAddress } from "../utils/validation.js";
import { fetchWithTimeout } from "../utils/fetch.js";

export async function queryAccount(params: {
  address: string;
  network?: NetworkName;
}) {
  const { address, network } = params;
  validateAddress(address);
  const config = resolveNetwork(network);

  // Fetch full account info directly from API (richer than SDK's getAccount)
  const response = await fetchWithTimeout(`${config.apiUrl}/accounts/${address}`);
  if (!response.ok) {
    throw new Error(`Account not found or API error: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const isSmartContract = !!data.code || !!data.codeHash;
  const assets = (data.assets || {}) as Record<string, unknown>;

  const result: Record<string, unknown> = {
    address: data.address,
    balance: data.balance,
    nonce: data.nonce,
    shard: data.shard,
    isSmartContract,
  };

  if (isSmartContract) {
    result.owner = data.ownerAddress;
    result.isUpgradeable = data.isUpgradeable;
    result.isPayable = data.isPayable;
    result.isPayableBySmartContract = data.isPayableBySmartContract;
    result.isReadable = data.isReadable;
    result.isVerified = data.isVerified;
    result.deployedAt = data.deployedAt;
    result.deployTxHash = data.deployTxHash;
    result.developerReward = data.developerReward;
  }

  // Assets metadata (name, description, website, social)
  if (assets.name) result.name = assets.name;
  if (assets.description) result.description = assets.description;
  if (assets.website) result.website = assets.website;
  if (assets.tags) result.tags = assets.tags;
  if (assets.social && typeof assets.social === "object") {
    result.social = assets.social;
  }

  return result;
}
