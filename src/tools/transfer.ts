import {
  Address,
  Transaction,
  TransactionComputer,
  UserSigner,
  TokenTransfer,
  Token,
  TransferTransactionsFactory,
  TransactionsFactoryConfig,
} from "@multiversx/sdk-core";
import { readFile } from "fs/promises";
import { getApiProvider } from "../core/provider.js";
import { getChainId, getExplorerUrl, type NetworkName } from "../utils/networks.js";
import { validateAddress } from "../utils/validation.js";
import { getAccountNonce } from "../utils/nonce.js";

export async function transfer(params: {
  to: string;
  value?: string;
  esdtTransfers?: Array<{ token: string; nonce?: number; amount: string }>;
  gasLimit?: number;
  walletPem?: string;
  network?: NetworkName;
}) {
  const {
    to,
    value = "0",
    esdtTransfers = [],
    gasLimit,
    walletPem,
    network,
  } = params;

  validateAddress(to);

  if (value === "0" && esdtTransfers.length === 0) {
    throw new Error("Provide either 'value' (EGLD amount) or 'esdtTransfers' to send.");
  }

  const pemPath = walletPem || process.env.MULTIVERSX_WALLET_PEM;
  if (!pemPath) {
    throw new Error(
      "Wallet required for transfers. Set MULTIVERSX_WALLET_PEM env var or provide 'walletPem' parameter."
    );
  }

  let signer: UserSigner;
  try {
    const pemContent = await readFile(pemPath, "utf-8");
    signer = UserSigner.fromPem(pemContent);
  } catch (err) {
    throw new Error(`Failed to load wallet from "${pemPath}": ${(err as Error).message}`);
  }
  const senderAddress = signer.getAddress();

  const provider = getApiProvider(network);

  const receiverAddress = Address.newFromBech32(to);

  const factory = new TransferTransactionsFactory({
    config: new TransactionsFactoryConfig({ chainID: getChainId(network) }),
  });

  let tx: Transaction;

  if (esdtTransfers.length > 0) {
    // ESDT transfer(s)
    const tokenTransfers = esdtTransfers.map(
      (t) =>
        new TokenTransfer({
          token: new Token({ identifier: t.token, nonce: BigInt(t.nonce || 0) }),
          amount: BigInt(t.amount),
        })
    );

    if (tokenTransfers.length === 1) {
      tx = await factory.createTransactionForESDTTokenTransfer(senderAddress, {
        receiver: receiverAddress,
        tokenTransfers: tokenTransfers,
      });
    } else {
      tx = await factory.createTransactionForTransfer(senderAddress, {
        receiver: receiverAddress,
        nativeAmount: BigInt(value),
        tokenTransfers: tokenTransfers,
      });
    }
  } else {
    // Native EGLD transfer
    tx = await factory.createTransactionForNativeTokenTransfer(senderAddress, {
      receiver: receiverAddress,
      nativeAmount: BigInt(value),
    });
  }

  if (gasLimit) {
    tx.gasLimit = BigInt(gasLimit);
  }

  tx.nonce = await getAccountNonce(senderAddress.toBech32(), network);

  const computer = new TransactionComputer();
  const serialized = computer.computeBytesForSigning(tx);
  const signature = await signer.sign(serialized);
  tx.signature = signature;

  const txHash = await provider.sendTransaction(tx);

  return {
    txHash,
    status: "sent",
    sender: senderAddress.toBech32(),
    receiver: to,
    value: value !== "0" ? value : undefined,
    esdtTransfers: esdtTransfers.length > 0 ? esdtTransfers : undefined,
    explorerUrl: getExplorerUrl(network, `/transactions/${txHash}`),
  };
}
