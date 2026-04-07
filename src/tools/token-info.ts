import { resolveNetwork, type NetworkName } from "../utils/networks.js";

interface TokenProperties {
  [key: string]: unknown;
}

interface TokenResult {
  source: "token" | "collection";
  identifier: string;
  name: string;
  ticker?: string;
  type?: string;
  decimals?: number;
  supply?: string;
  circulatingSupply?: string;
  minted?: string;
  burnt?: string;
  owner?: string;
  isPaused?: boolean;
  canUpgrade?: boolean;
  canMint?: boolean;
  canBurn?: boolean;
  canFreeze?: boolean;
  canWipe?: boolean;
  canPause?: boolean;
  canChangeOwner?: boolean;
  canAddSpecialRoles?: boolean;
  canTransferNftCreateRole?: boolean;
  price?: number;
  marketCap?: number;
  assets?: Record<string, unknown>;
  roles?: unknown[];
  network: string;
  [key: string]: unknown;
}

export async function getTokenInfo(params: {
  identifier: string;
  network?: NetworkName;
}): Promise<TokenResult> {
  const { identifier, network } = params;
  const config = resolveNetwork(network);

  // Try fungible token endpoint first
  const tokenResult = await tryFetchToken(config.apiUrl, identifier);
  if (tokenResult) {
    return { ...tokenResult, network: config.name } as TokenResult;
  }

  // Fall back to NFT/SFT collection endpoint
  const collectionResult = await tryFetchCollection(config.apiUrl, identifier);
  if (collectionResult) {
    return { ...collectionResult, network: config.name } as TokenResult;
  }

  throw new Error(
    `Token or collection "${identifier}" not found on ${config.name}. ` +
    `Verify the identifier is correct (e.g., WEGLD-bd4d79, XOXNO-a25cc0).`
  );
}

async function tryFetchToken(
  apiUrl: string,
  identifier: string
): Promise<Omit<TokenResult, "network"> | null> {
  const response = await fetch(`${apiUrl}/tokens/${identifier}`);
  if (!response.ok) return null;

  const data = (await response.json()) as TokenProperties;

  const result: Omit<TokenResult, "network"> = {
    source: "token",
    identifier: (data.identifier as string) || identifier,
    name: (data.name as string) || "",
    ticker: data.ticker as string | undefined,
    type: (data.type as string) || "FungibleESDT",
    decimals: data.decimals as number | undefined,
    supply: data.supply as string | undefined,
    circulatingSupply: data.circulatingSupply as string | undefined,
    minted: data.minted as string | undefined,
    burnt: data.burnt as string | undefined,
    owner: data.owner as string | undefined,
    isPaused: data.isPaused as boolean | undefined,
    canUpgrade: data.canUpgrade as boolean | undefined,
    canMint: data.canMint as boolean | undefined,
    canBurn: data.canBurn as boolean | undefined,
    canFreeze: data.canFreeze as boolean | undefined,
    canWipe: data.canWipe as boolean | undefined,
    canPause: data.canPause as boolean | undefined,
    canChangeOwner: data.canChangeOwner as boolean | undefined,
    canAddSpecialRoles: data.canAddSpecialRoles as boolean | undefined,
    canTransferNftCreateRole: data.canTransferNftCreateRole as boolean | undefined,
  };

  if (data.price !== undefined) result.price = data.price as number;
  if (data.marketCap !== undefined) result.marketCap = data.marketCap as number;
  if (data.assets) result.assets = data.assets as Record<string, unknown>;
  if (data.roles) result.roles = data.roles as unknown[];

  return result;
}

async function tryFetchCollection(
  apiUrl: string,
  identifier: string
): Promise<Omit<TokenResult, "network"> | null> {
  const response = await fetch(`${apiUrl}/collections/${identifier}`);
  if (!response.ok) return null;

  const data = (await response.json()) as TokenProperties;

  const result: Omit<TokenResult, "network"> = {
    source: "collection",
    identifier: (data.collection as string) || identifier,
    name: (data.name as string) || "",
    ticker: data.ticker as string | undefined,
    type: data.type as string | undefined,
    decimals: data.decimals as number | undefined,
    owner: data.owner as string | undefined,
    canUpgrade: data.canUpgrade as boolean | undefined,
    canFreeze: data.canFreeze as boolean | undefined,
    canWipe: data.canWipe as boolean | undefined,
    canPause: data.canPause as boolean | undefined,
    canChangeOwner: data.canChangeOwner as boolean | undefined,
    canAddSpecialRoles: data.canAddSpecialRoles as boolean | undefined,
    canTransferNftCreateRole: data.canTransferNftCreateRole as boolean | undefined,
  };

  if (data.assets) result.assets = data.assets as Record<string, unknown>;
  if (data.roles) result.roles = data.roles as unknown[];

  return result;
}
