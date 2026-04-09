import {
  Address,
  Transaction,
  TransactionComputer,
  UserSigner,
} from "@multiversx/sdk-core";
import { readFile } from "fs/promises";
import { getApiProvider } from "../core/provider.js";
import { getAccountNonce } from "../utils/nonce.js";
import { getChainId, getExplorerUrl, type NetworkName } from "../utils/networks.js";
import { validateAddress } from "../utils/validation.js";

async function loadSignerFromPem(pemPath: string): Promise<UserSigner> {
  try {
    const pemContent = await readFile(pemPath, "utf-8");
    return UserSigner.fromPem(pemContent);
  } catch (err) {
    throw new Error(`Failed to load wallet from "${pemPath}": ${(err as Error).message}`);
  }
}

// ─── Relayed V3 Transaction ────────────────────────────────────────────────

export async function createRelayedTransaction(params: {
  senderPem: string;
  relayerPem: string;
  receiver: string;
  value?: string;
  data?: string;
  gasLimit?: number;
  network?: NetworkName;
}) {
  const {
    senderPem,
    relayerPem,
    receiver,
    value = "0",
    data = "",
    gasLimit = 50000000,
    network,
  } = params;

  validateAddress(receiver);

  const senderSigner = await loadSignerFromPem(senderPem);
  const relayerSigner = await loadSignerFromPem(relayerPem);

  const senderAddress = senderSigner.getAddress();
  const relayerAddress = relayerSigner.getAddress();
  const receiverAddress = Address.newFromBech32(receiver);

  const chainID = getChainId(network);

  // Build the inner transaction with relayer set
  const tx = new Transaction({
    sender: senderAddress,
    receiver: receiverAddress,
    value: BigInt(value),
    gasLimit: BigInt(gasLimit),
    chainID,
    data: data ? new Uint8Array(Buffer.from(data)) : new Uint8Array(),
    relayer: relayerAddress,
  });

  // Set nonce from the sender's account
  tx.nonce = await getAccountNonce(senderAddress.toBech32(), network);

  const computer = new TransactionComputer();

  // Step 1: Sender signs the transaction
  const senderBytes = computer.computeBytesForSigning(tx);
  tx.signature = await senderSigner.sign(senderBytes);

  // Step 2: Relayer signs the transaction (the SDK includes relayer in serialization)
  const relayerBytes = computer.computeBytesForSigning(tx);
  tx.relayerSignature = await relayerSigner.sign(relayerBytes);

  // Send the transaction
  const provider = getApiProvider(network);
  const txHash = await provider.sendTransaction(tx);

  return {
    txHash,
    status: "sent",
    sender: senderAddress.toBech32(),
    relayer: relayerAddress.toBech32(),
    receiver,
    gasLimit,
    explorerUrl: getExplorerUrl(network, `/transactions/${txHash}`),
    note: "Relayed V3 transaction: gas is paid by the relayer.",
  };
}
