import {
  Address,
  AddressComputer,
  TransactionComputer,
  UserSigner,
  SmartContractTransactionsFactory,
  TransactionsFactoryConfig,
} from "@multiversx/sdk-core";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { loadAbi } from "../core/abi-loader.js";
import { getApiProvider } from "../core/provider.js";
import { getChainId, getExplorerUrl, type NetworkName } from "../utils/networks.js";
import { validateAddress } from "../utils/validation.js";
import { getAccountNonce } from "../utils/nonce.js";

export async function deployContract(params: {
  wasmPath: string;
  arguments?: unknown[];
  gasLimit?: number;
  value?: string;
  upgradeable?: boolean;
  readable?: boolean;
  payable?: boolean;
  payableBySc?: boolean;
  abiPath?: string;
  walletPem?: string;
  network?: NetworkName;
}) {
  const {
    wasmPath,
    arguments: args = [],
    gasLimit = 150_000_000,
    value = "0",
    upgradeable = true,
    readable = true,
    payable = false,
    payableBySc = false,
    abiPath,
    walletPem,
    network,
  } = params;

  // Validate WASM file exists
  if (!existsSync(wasmPath)) {
    throw new Error(`WASM file not found: ${wasmPath}`);
  }

  // Resolve wallet
  const pemPath = walletPem || process.env.MULTIVERSX_WALLET_PEM;
  if (!pemPath) {
    throw new Error(
      "Wallet required for deployment. Set MULTIVERSX_WALLET_PEM env var or provide 'walletPem' parameter."
    );
  }

  let signer: UserSigner;
  try {
    const pemContent = await readFile(pemPath, "utf-8");
    signer = UserSigner.fromPem(pemContent);
  } catch (err) {
    throw new Error(`Failed to load wallet from "${pemPath}": ${(err as Error).message}`);
  }
  const deployerAddress = signer.getAddress();

  const provider = getApiProvider(network);
  const deployerNonce = await getAccountNonce(deployerAddress.toBech32(), network);

  // Read WASM bytecode
  const wasmCode = await readFile(wasmPath);

  // Load ABI for constructor argument encoding
  const abi = abiPath ? await loadAbi({ abiPath }) : null;

  const factory = new SmartContractTransactionsFactory({
    config: new TransactionsFactoryConfig({ chainID: getChainId(network) }),
    abi: abi || undefined,
  });

  const tx = await factory.createTransactionForDeploy(deployerAddress, {
    bytecode: wasmCode,
    gasLimit: BigInt(gasLimit),
    arguments: args,
    nativeTransferAmount: BigInt(value),
    isUpgradeable: upgradeable,
    isReadable: readable,
    isPayable: payable,
    isPayableBySmartContract: payableBySc,
  });

  tx.nonce = deployerNonce;

  // Sign
  const computer = new TransactionComputer();
  const serialized = computer.computeBytesForSigning(tx);
  const signature = await signer.sign(serialized);
  tx.signature = signature;

  // Send
  const txHash = await provider.sendTransaction(tx);

  // Compute the deployed contract address
  const addressComputer = new AddressComputer();
  const contractAddress = addressComputer.computeContractAddress(
    deployerAddress,
    deployerNonce
  );

  return {
    txHash,
    status: "sent",
    deployer: deployerAddress.toBech32(),
    contractAddress: contractAddress.toBech32(),
    gasLimit,
    properties: { upgradeable, readable, payable, payableBySc },
    explorerUrl: getExplorerUrl(network, `/transactions/${txHash}`),
  };
}

export async function upgradeContract(params: {
  address: string;
  wasmPath: string;
  arguments?: unknown[];
  gasLimit?: number;
  value?: string;
  upgradeable?: boolean;
  readable?: boolean;
  payable?: boolean;
  payableBySc?: boolean;
  abiPath?: string;
  walletPem?: string;
  network?: NetworkName;
}) {
  const {
    address,
    wasmPath,
    arguments: args = [],
    gasLimit = 150_000_000,
    value = "0",
    upgradeable = true,
    readable = true,
    payable = false,
    payableBySc = false,
    abiPath,
    walletPem,
    network,
  } = params;

  validateAddress(address);

  if (!existsSync(wasmPath)) {
    throw new Error(`WASM file not found: ${wasmPath}`);
  }

  const pemPath = walletPem || process.env.MULTIVERSX_WALLET_PEM;
  if (!pemPath) {
    throw new Error(
      "Wallet required for upgrade. Set MULTIVERSX_WALLET_PEM env var or provide 'walletPem' parameter."
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

  const wasmCode = await readFile(wasmPath);
  const contractAddress = Address.newFromBech32(address);

  const abi = abiPath ? await loadAbi({ abiPath }) : null;

  const factory = new SmartContractTransactionsFactory({
    config: new TransactionsFactoryConfig({ chainID: getChainId(network) }),
    abi: abi || undefined,
  });

  const tx = await factory.createTransactionForUpgrade(callerAddress, {
    contract: contractAddress,
    bytecode: wasmCode,
    gasLimit: BigInt(gasLimit),
    arguments: args,
    nativeTransferAmount: BigInt(value),
    isUpgradeable: upgradeable,
    isReadable: readable,
    isPayable: payable,
    isPayableBySmartContract: payableBySc,
  });

  tx.nonce = await getAccountNonce(callerAddress.toBech32(), network);

  const computer = new TransactionComputer();
  const serialized = computer.computeBytesForSigning(tx);
  const signature = await signer.sign(serialized);
  tx.signature = signature;

  const txHash = await provider.sendTransaction(tx);

  return {
    txHash,
    status: "sent",
    contractAddress: address,
    gasLimit,
    properties: { upgradeable, readable, payable, payableBySc },
    explorerUrl: getExplorerUrl(network, `/transactions/${txHash}`),
  };
}
