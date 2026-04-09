import {
  Address,
  TokenManagementTransactionsFactory,
  TransactionsFactoryConfig,
  TransactionComputer,
  UserSigner,
} from "@multiversx/sdk-core";
import { readFile } from "fs/promises";
import { getApiProvider } from "../core/provider.js";
import { getAccountNonce } from "../utils/nonce.js";
import { getChainId, getExplorerUrl, type NetworkName } from "../utils/networks.js";

const ISSUE_COST = 50000000000000000n; // 0.05 EGLD
const ISSUE_GAS_LIMIT = 60000000n;
const NFT_CREATE_GAS_LIMIT = 10000000n;

async function loadSigner(walletPem?: string): Promise<UserSigner> {
  const pemPath = walletPem || process.env.MULTIVERSX_WALLET_PEM;
  if (!pemPath) {
    throw new Error(
      "Wallet required for token management. Set MULTIVERSX_WALLET_PEM env var or provide 'walletPem' parameter."
    );
  }

  try {
    const pemContent = await readFile(pemPath, "utf-8");
    return UserSigner.fromPem(pemContent);
  } catch (err) {
    throw new Error(`Failed to load wallet from "${pemPath}": ${(err as Error).message}`);
  }
}

function createFactory(network?: NetworkName): TokenManagementTransactionsFactory {
  return new TokenManagementTransactionsFactory({
    config: new TransactionsFactoryConfig({ chainID: getChainId(network) }),
  });
}

async function signAndSend(
  tx: import("@multiversx/sdk-core").Transaction,
  signer: UserSigner,
  network?: NetworkName,
) {
  const senderAddress = signer.getAddress();
  tx.nonce = await getAccountNonce(senderAddress.toBech32(), network);

  const computer = new TransactionComputer();
  const serialized = computer.computeBytesForSigning(tx);
  const signature = await signer.sign(serialized);
  tx.signature = signature;

  const provider = getApiProvider(network);
  const txHash = await provider.sendTransaction(tx);

  return {
    txHash,
    sender: senderAddress.toBech32(),
    explorerUrl: getExplorerUrl(network, `/transactions/${txHash}`),
  };
}

// ─── Issue Fungible Token ──────────────────────────────────────────────────

export async function issueFungibleToken(params: {
  tokenName: string;
  tokenTicker: string;
  initialSupply: string;
  numDecimals: number;
  canFreeze?: boolean;
  canWipe?: boolean;
  canPause?: boolean;
  canChangeOwner?: boolean;
  canUpgrade?: boolean;
  canAddSpecialRoles?: boolean;
  walletPem?: string;
  network?: NetworkName;
}) {
  const {
    tokenName,
    tokenTicker,
    initialSupply,
    numDecimals,
    canFreeze = false,
    canWipe = false,
    canPause = false,
    canChangeOwner = false,
    canUpgrade = true,
    canAddSpecialRoles = true,
    walletPem,
    network,
  } = params;

  const signer = await loadSigner(walletPem);
  const sender = signer.getAddress();
  const factory = createFactory(network);

  const tx = await factory.createTransactionForIssuingFungible(sender, {
    tokenName,
    tokenTicker,
    initialSupply: BigInt(initialSupply),
    numDecimals: BigInt(numDecimals),
    canFreeze,
    canWipe,
    canPause,
    canChangeOwner,
    canUpgrade,
    canAddSpecialRoles,
  });

  tx.value = ISSUE_COST;
  tx.gasLimit = ISSUE_GAS_LIMIT;

  const result = await signAndSend(tx, signer, network);

  return {
    ...result,
    status: "sent",
    tokenName,
    tokenTicker,
    note: "Token identifier will be available in transaction results after processing.",
  };
}

// ─── Issue NFT Collection ──────────────────────────────────────────────────

export async function issueNftCollection(params: {
  tokenName: string;
  tokenTicker: string;
  canFreeze?: boolean;
  canWipe?: boolean;
  canPause?: boolean;
  canTransferNFTCreateRole?: boolean;
  canChangeOwner?: boolean;
  canUpgrade?: boolean;
  canAddSpecialRoles?: boolean;
  walletPem?: string;
  network?: NetworkName;
}) {
  const {
    tokenName,
    tokenTicker,
    canFreeze = false,
    canWipe = false,
    canPause = false,
    canTransferNFTCreateRole = false,
    canChangeOwner = false,
    canUpgrade = true,
    canAddSpecialRoles = true,
    walletPem,
    network,
  } = params;

  const signer = await loadSigner(walletPem);
  const sender = signer.getAddress();
  const factory = createFactory(network);

  const tx = await factory.createTransactionForIssuingNonFungible(sender, {
    tokenName,
    tokenTicker,
    canFreeze,
    canWipe,
    canPause,
    canTransferNFTCreateRole,
    canChangeOwner,
    canUpgrade,
    canAddSpecialRoles,
  });

  tx.value = ISSUE_COST;
  tx.gasLimit = ISSUE_GAS_LIMIT;

  const result = await signAndSend(tx, signer, network);

  return {
    ...result,
    status: "sent",
    tokenName,
    tokenTicker,
    note: "Collection identifier will be available in transaction results after processing.",
  };
}

// ─── Issue SFT Collection ──────────────────────────────────────────────────

export async function issueSftCollection(params: {
  tokenName: string;
  tokenTicker: string;
  canFreeze?: boolean;
  canWipe?: boolean;
  canPause?: boolean;
  canTransferNFTCreateRole?: boolean;
  canChangeOwner?: boolean;
  canUpgrade?: boolean;
  canAddSpecialRoles?: boolean;
  walletPem?: string;
  network?: NetworkName;
}) {
  const {
    tokenName,
    tokenTicker,
    canFreeze = false,
    canWipe = false,
    canPause = false,
    canTransferNFTCreateRole = false,
    canChangeOwner = false,
    canUpgrade = true,
    canAddSpecialRoles = true,
    walletPem,
    network,
  } = params;

  const signer = await loadSigner(walletPem);
  const sender = signer.getAddress();
  const factory = createFactory(network);

  const tx = await factory.createTransactionForIssuingSemiFungible(sender, {
    tokenName,
    tokenTicker,
    canFreeze,
    canWipe,
    canPause,
    canTransferNFTCreateRole,
    canChangeOwner,
    canUpgrade,
    canAddSpecialRoles,
  });

  tx.value = ISSUE_COST;
  tx.gasLimit = ISSUE_GAS_LIMIT;

  const result = await signAndSend(tx, signer, network);

  return {
    ...result,
    status: "sent",
    tokenName,
    tokenTicker,
    note: "SFT collection identifier will be available in transaction results after processing.",
  };
}

// ─── Issue Meta-ESDT ───────────────────────────────────────────────────────

export async function issueMetaEsdt(params: {
  tokenName: string;
  tokenTicker: string;
  numDecimals: number;
  canFreeze?: boolean;
  canWipe?: boolean;
  canPause?: boolean;
  canTransferNFTCreateRole?: boolean;
  canChangeOwner?: boolean;
  canUpgrade?: boolean;
  canAddSpecialRoles?: boolean;
  walletPem?: string;
  network?: NetworkName;
}) {
  const {
    tokenName,
    tokenTicker,
    numDecimals,
    canFreeze = false,
    canWipe = false,
    canPause = false,
    canTransferNFTCreateRole = false,
    canChangeOwner = false,
    canUpgrade = true,
    canAddSpecialRoles = true,
    walletPem,
    network,
  } = params;

  const signer = await loadSigner(walletPem);
  const sender = signer.getAddress();
  const factory = createFactory(network);

  const tx = await factory.createTransactionForRegisteringMetaESDT(sender, {
    tokenName,
    tokenTicker,
    numDecimals: BigInt(numDecimals),
    canFreeze,
    canWipe,
    canPause,
    canTransferNFTCreateRole,
    canChangeOwner,
    canUpgrade,
    canAddSpecialRoles,
  });

  tx.value = ISSUE_COST;
  tx.gasLimit = ISSUE_GAS_LIMIT;

  const result = await signAndSend(tx, signer, network);

  return {
    ...result,
    status: "sent",
    tokenName,
    tokenTicker,
    note: "Meta-ESDT identifier will be available in transaction results after processing.",
  };
}

// ─── Create NFT ────────────────────────────────────────────────────────────

export async function createNft(params: {
  tokenIdentifier: string;
  name: string;
  initialQuantity?: number;
  royalties?: number;
  hash?: string;
  attributes?: string;
  uris?: string[];
  walletPem?: string;
  network?: NetworkName;
}) {
  const {
    tokenIdentifier,
    name,
    initialQuantity = 1,
    royalties = 0,
    hash = "",
    attributes = "",
    uris = [],
    walletPem,
    network,
  } = params;

  const signer = await loadSigner(walletPem);
  const sender = signer.getAddress();
  const factory = createFactory(network);

  // Convert attributes string to Uint8Array
  const attributesBytes = new Uint8Array(Buffer.from(attributes));

  const tx = await factory.createTransactionForCreatingNFT(sender, {
    tokenIdentifier,
    initialQuantity: BigInt(initialQuantity),
    name,
    royalties,
    hash,
    attributes: attributesBytes,
    uris,
  });

  tx.gasLimit = NFT_CREATE_GAS_LIMIT;

  const result = await signAndSend(tx, signer, network);

  return {
    ...result,
    status: "sent",
    tokenIdentifier,
    name,
    note: "NFT nonce will be available in transaction results after processing.",
  };
}
