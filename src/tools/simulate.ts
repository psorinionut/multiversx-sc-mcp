import {
  Address,
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
import type { NetworkName } from "../utils/networks.js";

// Zero bech32 address used as default caller when no wallet is provided
const ZERO_ADDRESS =
  "erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4hu";

/**
 * Simulate a smart contract call without broadcasting it.
 * Builds the transaction exactly like mvx_sc_call, but sends it to the
 * simulation endpoint instead.  Returns estimated gas, SC results, return
 * data, events, and any errors.
 *
 * If a wallet PEM is provided the transaction is signed and the simulation
 * runs with signature verification.  Otherwise a zero-address caller is used
 * and signature verification is skipped (checkSignature: false).
 */
export async function simulateTransaction(params: {
  address: string;
  endpoint: string;
  arguments?: unknown[];
  gasLimit?: number;
  value?: string;
  esdtTransfers?: Array<{ token: string; nonce?: number; amount: string }>;
  callerAddress?: string;
  abiPath?: string;
  walletPem?: string;
  network?: NetworkName;
}) {
  const {
    address,
    endpoint,
    arguments: args = [],
    gasLimit = 30_000_000,
    value = "0",
    esdtTransfers = [],
    callerAddress: callerOverride,
    abiPath,
    walletPem,
    network,
  } = params;

  const provider = getApiProvider(network);
  const contractAddress = Address.newFromBech32(address);
  const chainId = getChainId(network);

  // ── Resolve caller & optional signer ────────────────────────────────
  let callerAddress: Address;
  let signer: UserSigner | null = null;
  let checkSignature = false;

  const pemPath = walletPem || process.env.MULTIVERSX_WALLET_PEM;

  if (pemPath) {
    // Wallet available — build a properly signed transaction
    const pemContent = await readFile(pemPath, "utf-8");
    signer = UserSigner.fromPem(pemContent);
    callerAddress = signer.getAddress();
    checkSignature = true;
  } else if (callerOverride) {
    callerAddress = Address.newFromBech32(callerOverride);
  } else {
    callerAddress = Address.newFromBech32(ZERO_ADDRESS);
  }

  // ── Load ABI ────────────────────────────────────────────────────────
  const abi = await loadAbi({ address, abiPath, network });

  // ── Build token transfers ───────────────────────────────────────────
  const tokenTransfers = esdtTransfers.map(
    (t) =>
      new TokenTransfer({
        token: new Token({ identifier: t.token, nonce: BigInt(t.nonce || 0) }),
        amount: BigInt(t.amount),
      })
  );

  // ── Build transaction ───────────────────────────────────────────────
  const factory = new SmartContractTransactionsFactory({
    config: new TransactionsFactoryConfig({ chainID: chainId }),
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

  // Set nonce — needed even for simulation
  if (signer) {
    const account = await provider.getAccount(callerAddress);
    tx.nonce = BigInt(account.nonce);
  } else {
    tx.nonce = BigInt(0);
  }

  // ── Sign if wallet available ────────────────────────────────────────
  if (signer) {
    const computer = new TransactionComputer();
    const serialized = computer.computeBytesForSigning(tx);
    const signature = await signer.sign(serialized);
    tx.signature = signature;
  }

  // ── Simulate ────────────────────────────────────────────────────────
  const simulationResult = await provider.simulateTransaction(
    tx,
    checkSignature
  );

  return {
    status: "simulated",
    caller: callerAddress.toBech32(),
    receiver: address,
    endpoint,
    gasLimit,
    simulation: simulationResult,
  };
}

/**
 * Estimate the gas cost of a smart contract call using the gateway's
 * `/transaction/cost` endpoint.
 *
 * This is a lighter-weight alternative to full simulation — it only returns
 * the estimated gas limit and a status, without SC results or events.
 *
 * No wallet is required; a zero-address caller is used by default.
 */
export async function estimateGas(params: {
  address: string;
  endpoint: string;
  arguments?: unknown[];
  value?: string;
  esdtTransfers?: Array<{ token: string; nonce?: number; amount: string }>;
  callerAddress?: string;
  abiPath?: string;
  network?: NetworkName;
}) {
  const {
    address,
    endpoint,
    arguments: args = [],
    value = "0",
    esdtTransfers = [],
    callerAddress: callerOverride,
    abiPath,
    network,
  } = params;

  const provider = getApiProvider(network);
  const contractAddress = Address.newFromBech32(address);
  const chainId = getChainId(network);

  // Resolve caller (no signing needed for cost estimation)
  const callerAddress = callerOverride
    ? Address.newFromBech32(callerOverride)
    : Address.newFromBech32(ZERO_ADDRESS);

  // Load ABI
  const abi = await loadAbi({ address, abiPath, network });

  // Build token transfers
  const tokenTransfers = esdtTransfers.map(
    (t) =>
      new TokenTransfer({
        token: new Token({ identifier: t.token, nonce: BigInt(t.nonce || 0) }),
        amount: BigInt(t.amount),
      })
  );

  // Build transaction (gas limit set high — the endpoint returns the actual cost)
  const factory = new SmartContractTransactionsFactory({
    config: new TransactionsFactoryConfig({ chainID: chainId }),
    abi: abi || undefined,
  });

  const tx = await factory.createTransactionForExecute(callerAddress, {
    contract: contractAddress,
    gasLimit: BigInt(600_000_000),
    function: endpoint,
    arguments: args,
    nativeTransferAmount: BigInt(value),
    tokenTransfers: tokenTransfers.length > 0 ? tokenTransfers : undefined,
  });

  tx.nonce = BigInt(0);

  // ── Estimate ────────────────────────────────────────────────────────
  const costResponse = await provider.estimateTransactionCost(tx);

  return {
    status: "estimated",
    caller: callerAddress.toBech32(),
    receiver: address,
    endpoint,
    estimatedGasLimit: costResponse.gasLimit,
    transactionStatus: costResponse.status.toString(),
    raw: costResponse.raw,
  };
}

function getChainId(network?: NetworkName): string {
  const net = (
    network ||
    process.env.MULTIVERSX_NETWORK ||
    "mainnet"
  ).toLowerCase();
  switch (net) {
    case "mainnet":
      return "1";
    case "testnet":
      return "T";
    case "devnet":
      return "D";
    default:
      return "1";
  }
}
