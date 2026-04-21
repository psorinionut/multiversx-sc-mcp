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

  // The API flavor (api.multiversx.com/accounts/<addr>) and the Gateway flavor
  // (gateway.multiversx.com/address/<addr>) return the same info in different
  // shapes. Mainnet/testnet/devnet default to the API flavor; the chain
  // simulator (localnet) only serves the Gateway flavor on port 8085.
  const useGateway = (network || "mainnet") === "localnet";

  const url = useGateway
    ? `${config.gatewayUrl}/address/${address}`
    : `${config.apiUrl}/accounts/${address}`;

  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Account not found or API error: ${response.status}`);
  }

  const raw = (await response.json()) as Record<string, unknown>;
  const data = useGateway
    ? ((raw.data as Record<string, unknown>)?.account as Record<string, unknown>) || {}
    : raw;

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

  if (assets.name) result.name = assets.name;
  if (assets.description) result.description = assets.description;
  if (assets.website) result.website = assets.website;
  if (assets.tags) result.tags = assets.tags;
  if (assets.social && typeof assets.social === "object") {
    result.social = assets.social;
  }

  return result;
}
