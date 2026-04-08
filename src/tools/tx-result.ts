import {
  SmartContractTransactionsOutcomeParser,
  TransactionEventsParser,
  TransactionEvent,
  TransactionOnNetwork,
  gatherAllEvents,
} from "@multiversx/sdk-core";
import { loadAbi } from "../core/abi-loader.js";
import { getApiProvider } from "../core/provider.js";
import type { NetworkName } from "../utils/networks.js";
import { validateAddress } from "../utils/validation.js";
import { serializeValue } from "../utils/serialize.js";

export async function getTransactionResult(params: {
  txHash: string;
  contractAddress?: string;
  abiPath?: string;
  network?: NetworkName;
}) {
  const { txHash, contractAddress, abiPath, network } = params;
  if (contractAddress) {
    validateAddress(contractAddress);
  }

  const provider = getApiProvider(network);
  const txOnNetwork = await provider.getTransaction(txHash);

  const result: Record<string, unknown> = {
    txHash,
    status: txOnNetwork.status.toString(),
    sender: txOnNetwork.sender.toBech32(),
    receiver: txOnNetwork.receiver.toBech32(),
    value: txOnNetwork.value.toString(),
  };

  // Try to decode SC results with ABI
  if (contractAddress || abiPath) {
    const abi = await loadAbi({
      address: contractAddress,
      abiPath,
      network,
    });

    if (abi) {
      try {
        const parser = new SmartContractTransactionsOutcomeParser({ abi });
        const outcome = parser.parseExecute({ transactionOnNetwork: txOnNetwork });
        result.decodedReturn = outcome.values?.map((p: unknown) => serializeValue(p));
        result.returnCode = outcome.returnCode;
        result.returnMessage = outcome.returnMessage;
      } catch {
        // Parsing failed, continue with raw data
      }

      try {
        const eventsParser = new TransactionEventsParser({ abi });
        const allEvents = gatherAllEvents(txOnNetwork);
        if (allEvents.length > 0) {
          const parsedEvents = eventsParser.parseEvents({ events: allEvents });
          result.decodedEvents = parsedEvents.map((e: unknown) => serializeValue(e));
        }
      } catch {
        // Event parsing failed, continue
      }
    }
  }

  // Include raw SC results
  if (txOnNetwork.smartContractResults && txOnNetwork.smartContractResults.length > 0) {
    result.smartContractResults = txOnNetwork.smartContractResults.map(
      (scr) => ({
        sender: scr.sender.toBech32(),
        receiver: scr.receiver.toBech32(),
        data: Buffer.from(scr.data).toString(),
      })
    );
  }

  // Include raw logs
  if (txOnNetwork.logs?.events) {
    result.events = txOnNetwork.logs.events.map((e: TransactionEvent) => ({
      identifier: e.identifier,
      topics: e.topics?.map((t) => Buffer.from(t).toString("base64")),
    }));
  }

  return result;
}

