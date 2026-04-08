import {
  Address,
  Transaction,
  TransactionComputer,
  UserSigner,
  SmartContractTransactionsFactory,
  TransactionsFactoryConfig,
  TokenTransfer,
  Token,
} from "@multiversx/sdk-core";
import { readFile } from "fs/promises";
import { loadAbi } from "../core/abi-loader.js";
import { getApiProvider } from "../core/provider.js";
import { getChainId, getExplorerUrl, type NetworkName } from "../utils/networks.js";
import { validateAddress } from "../utils/validation.js";

export async function callContract(params: {
  address: string;
  endpoint: string;
  arguments?: unknown[];
  gasLimit?: number;
  value?: string;
  esdtTransfers?: Array<{ token: string; nonce?: number; amount: string }>;
  abiPath?: string;
  walletPem?: string;
  network?: NetworkName;
}) {
  const {
    address,
    endpoint,
    arguments: args = [],
    gasLimit = Number(process.env.MULTIVERSX_DEFAULT_GAS_LIMIT) || 50_000_000,
    value = "0",
    esdtTransfers = [],
    abiPath,
    walletPem,
    network,
  } = params;

  validateAddress(address);

  // Resolve wallet
  const pemPath = walletPem || process.env.MULTIVERSX_WALLET_PEM;
  if (!pemPath) {
    throw new Error(
      "Wallet required for transactions. Set MULTIVERSX_WALLET_PEM env var or provide 'walletPem' parameter."
    );
  }

  let signer: UserSigner;
  try {
    const pemContent = await readFile(pemPath, "utf-8");
    signer = UserSigner.fromPem(pemContent);
  } catch (err) {
    throw new Error(`Failed to load wallet from "${pemPath}": ${(err as Error).message}`);
  }
  const callerAddress = signer.getAddress();

  const provider = getApiProvider(network);
  const callerAccount = await provider.getAccount(callerAddress);

  const contractAddress = Address.newFromBech32(address);

  // Load ABI if available
  const abi = await loadAbi({ address, abiPath, network });

  // Build token transfers
  const tokenTransfers = esdtTransfers.map((t) =>
    new TokenTransfer({
      token: new Token({ identifier: t.token, nonce: BigInt(t.nonce || 0) }),
      amount: BigInt(t.amount),
    })
  );

  // Build transaction
  const factory = new SmartContractTransactionsFactory({
    config: new TransactionsFactoryConfig({ chainID: getChainId(network) }),
    abi: abi || undefined,
  });

  const tx = await factory.createTransactionForExecute(callerAddress, {
    contract: contractAddress,
    gasLimit: BigInt(gasLimit),
    function: endpoint,
    arguments: args,
    nativeTransferAmount: BigInt(value),
    tokenTransfers: tokenTransfers.length > 0 ? tokenTransfers : undefined,
  });

  tx.nonce = BigInt(callerAccount.nonce);

  // Sign
  const computer = new TransactionComputer();
  const serialized = computer.computeBytesForSigning(tx);
  const signature = await signer.sign(serialized);
  tx.signature = signature;

  // Send
  const txHash = await provider.sendTransaction(tx);

  return {
    txHash,
    sender: callerAddress.toBech32(),
    receiver: address,
    endpoint,
    gasLimit,
    status: "sent",
    explorerUrl: getExplorerUrl(network, `/transactions/${txHash}`),
  };
}
