import {
  Address,
  TransferTransactionsFactory,
  TransactionsFactoryConfig,
  TransactionComputer,
  UserSigner,
  TokenTransfer,
  Token,
} from "@multiversx/sdk-core";
import { readFile } from "fs/promises";
import { getApiProvider } from "../core/provider.js";
import { getAccountNonce } from "../utils/nonce.js";
import { getChainId, getExplorerUrl, type NetworkName } from "../utils/networks.js";
import { validateAddress } from "../utils/validation.js";

async function loadSigner(walletPem?: string): Promise<UserSigner> {
  const pemPath = walletPem || process.env.MULTIVERSX_WALLET_PEM;
  if (!pemPath) {
    throw new Error(
      "Wallet required for batch transfers. Set MULTIVERSX_WALLET_PEM env var or provide 'walletPem' parameter."
    );
  }

  try {
    const pemContent = await readFile(pemPath, "utf-8");
    return UserSigner.fromPem(pemContent);
  } catch (err) {
    throw new Error(`Failed to load wallet from "${pemPath}": ${(err as Error).message}`);
  }
}

// ─── Batch Transfer EGLD ───────────────────────────────────────────────────

export async function batchTransferEgld(params: {
  recipients: Array<{ address: string; amount: string }>;
  walletPem?: string;
  network?: NetworkName;
}) {
  const { recipients, walletPem, network } = params;

  if (!recipients || recipients.length === 0) {
    throw new Error("At least one recipient is required.");
  }

  for (const r of recipients) {
    validateAddress(r.address);
  }

  const signer = await loadSigner(walletPem);
  const senderAddress = signer.getAddress();
  const provider = getApiProvider(network);
  const computer = new TransactionComputer();

  const factory = new TransferTransactionsFactory({
    config: new TransactionsFactoryConfig({ chainID: getChainId(network) }),
  });

  // Fetch nonce once, then increment locally for each subsequent tx
  let nonce = await getAccountNonce(senderAddress.toBech32(), network);

  const results: Array<{ address: string; amount: string; txHash: string; explorerUrl: string }> = [];

  for (const recipient of recipients) {
    const receiverAddress = Address.newFromBech32(recipient.address);

    const tx = await factory.createTransactionForNativeTokenTransfer(senderAddress, {
      receiver: receiverAddress,
      nativeAmount: BigInt(recipient.amount),
    });

    tx.nonce = nonce;
    nonce += 1n;

    const serialized = computer.computeBytesForSigning(tx);
    const signature = await signer.sign(serialized);
    tx.signature = signature;

    const txHash = await provider.sendTransaction(tx);

    results.push({
      address: recipient.address,
      amount: recipient.amount,
      txHash,
      explorerUrl: getExplorerUrl(network, `/transactions/${txHash}`),
    });
  }

  return {
    status: "sent",
    sender: senderAddress.toBech32(),
    totalTransfers: results.length,
    transfers: results,
  };
}

// ─── Batch Transfer Tokens ─────────────────────────────────────────────────

export async function batchTransferTokens(params: {
  tokenIdentifier: string;
  recipients: Array<{ address: string; amount: string; nonce?: number }>;
  walletPem?: string;
  network?: NetworkName;
}) {
  const { tokenIdentifier, recipients, walletPem, network } = params;

  if (!recipients || recipients.length === 0) {
    throw new Error("At least one recipient is required.");
  }

  for (const r of recipients) {
    validateAddress(r.address);
  }

  const signer = await loadSigner(walletPem);
  const senderAddress = signer.getAddress();
  const provider = getApiProvider(network);
  const computer = new TransactionComputer();

  const factory = new TransferTransactionsFactory({
    config: new TransactionsFactoryConfig({ chainID: getChainId(network) }),
  });

  // Fetch nonce once, then increment locally for each subsequent tx
  let nonce = await getAccountNonce(senderAddress.toBech32(), network);

  const results: Array<{ address: string; amount: string; tokenNonce?: number; txHash: string; explorerUrl: string }> = [];

  for (const recipient of recipients) {
    const receiverAddress = Address.newFromBech32(recipient.address);

    const tokenTransfer = new TokenTransfer({
      token: new Token({
        identifier: tokenIdentifier,
        nonce: BigInt(recipient.nonce || 0),
      }),
      amount: BigInt(recipient.amount),
    });

    const tx = await factory.createTransactionForESDTTokenTransfer(senderAddress, {
      receiver: receiverAddress,
      tokenTransfers: [tokenTransfer],
    });

    tx.nonce = nonce;
    nonce += 1n;

    const serialized = computer.computeBytesForSigning(tx);
    const signature = await signer.sign(serialized);
    tx.signature = signature;

    const txHash = await provider.sendTransaction(tx);

    results.push({
      address: recipient.address,
      amount: recipient.amount,
      tokenNonce: recipient.nonce,
      txHash,
      explorerUrl: getExplorerUrl(network, `/transactions/${txHash}`),
    });
  }

  return {
    status: "sent",
    sender: senderAddress.toBech32(),
    tokenIdentifier,
    totalTransfers: results.length,
    transfers: results,
  };
}
