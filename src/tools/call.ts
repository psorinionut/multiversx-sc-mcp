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
import { getAccountNonce } from "../utils/nonce.js";
import { waitForTx } from "../utils/wait.js";

const HEX_RE = /^[0-9a-fA-F]*$/;

function isHexString(s: unknown): s is string {
  return typeof s === "string" && s.length > 0 && s.length % 2 === 0 && HEX_RE.test(s);
}

function isBech32Address(s: unknown): s is string {
  return typeof s === "string" && s.startsWith("erd1") && s.length === 62;
}

function canEncodeAsRawArg(s: unknown): s is string {
  return isHexString(s) || isBech32Address(s);
}

/**
 * In raw-data mode, encode each arg to hex.
 * - Already-hex strings pass through.
 * - Bech32 addresses (erd1...) get converted to their 32-byte hex form.
 */
function encodeRawArg(arg: string): string {
  if (isBech32Address(arg)) {
    return Address.newFromBech32(arg).toHex();
  }
  return arg;
}

function allArgsRawEncodable(args: unknown[]): boolean {
  return args.length === 0 || args.every(canEncodeAsRawArg);
}

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
  waitForCompletion?: boolean;
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
    waitForCompletion = false,
  } = params;

  validateAddress(address);

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
  const contractAddress = Address.newFromBech32(address);

  const abi = await loadAbi({ address, abiPath, network });

  const tokenTransfers = esdtTransfers.map((t) =>
    new TokenTransfer({
      token: new Token({ identifier: t.token, nonce: BigInt(t.nonce || 0) }),
      amount: BigInt(t.amount),
    })
  );

  let tx: Transaction;

  // Raw-data mode: no ABI available AND every arg is either a hex string or a
  // bech32 (erd1...) address. Build the data field manually; bech32 addresses
  // get auto-converted to their 32-byte hex form. Covers system SC calls
  // (e.g. setSpecialRole) and any contract when the user pre-encodes args.
  if (!abi && args.length > 0 && allArgsRawEncodable(args)) {
    if (tokenTransfers.length > 0) {
      throw new Error(
        "Raw-data mode doesn't support esdtTransfers yet. Provide an ABI or use mvx_transfer."
      );
    }
    const encodedArgs = (args as string[]).map(encodeRawArg);
    const dataStr = [endpoint, ...encodedArgs].join("@");
    tx = new Transaction({
      sender: callerAddress,
      receiver: contractAddress,
      gasLimit: BigInt(gasLimit),
      chainID: getChainId(network),
      data: new TextEncoder().encode(dataStr),
      value: BigInt(value),
    });
  } else {
    const factory = new SmartContractTransactionsFactory({
      config: new TransactionsFactoryConfig({ chainID: getChainId(network) }),
      abi: abi || undefined,
    });

    tx = await factory.createTransactionForExecute(callerAddress, {
      contract: contractAddress,
      gasLimit: BigInt(gasLimit),
      function: endpoint,
      arguments: args,
      nativeTransferAmount: BigInt(value),
      tokenTransfers: tokenTransfers.length > 0 ? tokenTransfers : undefined,
    });
  }

  tx.nonce = await getAccountNonce(callerAddress.toBech32(), network);

  const computer = new TransactionComputer();
  const serialized = computer.computeBytesForSigning(tx);
  const signature = await signer.sign(serialized);
  tx.signature = signature;

  const txHash = await provider.sendTransaction(tx);

  const base = {
    txHash,
    sender: callerAddress.toBech32(),
    receiver: address,
    endpoint,
    gasLimit,
    explorerUrl: getExplorerUrl(network, `/transactions/${txHash}`),
  };

  if (waitForCompletion) {
    const w = await waitForTx(txHash, network);
    return {
      ...base,
      status: w.finalStatus,
      ...(w.errorMessage ? { errorMessage: w.errorMessage } : {}),
      ...(w.mintedTokens ? { mintedTokens: w.mintedTokens } : {}),
    };
  }

  return { ...base, status: "sent" as const };
}
