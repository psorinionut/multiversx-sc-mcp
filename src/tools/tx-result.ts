import {
  Address,
  SmartContractTransactionsOutcomeParser,
  TransactionEventsParser,
  TransactionEvent,
  gatherAllEvents,
} from "@multiversx/sdk-core";
import { loadAbi } from "../core/abi-loader.js";
import { getApiProvider } from "../core/provider.js";
import type { NetworkName } from "../utils/networks.js";
import { validateAddress } from "../utils/validation.js";
import { serializeValue } from "../utils/serialize.js";

const TOKEN_ID_RE = /^[A-Z0-9]{3,10}-[0-9a-f]{6}$/;

function tryDecodeTopic(raw: Buffer): string | null {
  if (raw.length === 0) return "";

  // 32-byte topic — likely an address
  if (raw.length === 32) {
    try {
      return Address.newFromHex(raw.toString("hex")).toBech32();
    } catch {
      // fall through
    }
  }

  // Try ASCII / UTF-8 decoding for printable strings (token IDs, error messages, event names)
  const utf8 = raw.toString("utf-8");
  // eslint-disable-next-line no-control-regex
  const isPrintable = /^[\x20-\x7E]+$/.test(utf8);
  if (isPrintable) {
    return utf8;
  }

  return null;
}

function looksLikeTokenId(s: string | null): boolean {
  return !!s && TOKEN_ID_RE.test(s);
}

function decodeTopics(topics: Buffer[] | undefined): {
  raw: string[];
  decoded: Array<string | number | null>;
} {
  if (!topics) return { raw: [], decoded: [] };
  const raw = topics.map((t) => t.toString("base64"));
  const decoded = topics.map((t) => {
    if (t.length === 0) return "";
    // Small buffers (<=8 bytes) might be a u64/amount — try numeric
    if (t.length > 0 && t.length <= 32) {
      const asString = tryDecodeTopic(t);
      if (asString !== null && asString !== "") return asString;
    }
    // Fallback: hex
    return t.toString("hex");
  });
  return { raw, decoded };
}

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

  // Detect on-chain failure and surface the error message before anything else.
  // Two patterns to cover:
  //   (a) signalError / internalVMErrors event with the message in topic[1]
  //   (b) SCR data starts with "@<errcode>@<msg-hex>" (e.g. "@04@<hex of error string>")
  const errorEvents: Array<{ source: string; identifier: string; message: string }> = [];
  const allRawEvents = gatherAllEvents(txOnNetwork);
  for (const e of allRawEvents) {
    if (e.identifier === "signalError" || e.identifier === "internalVMErrors") {
      const msgTopic = e.topics?.[1];
      const msg = msgTopic ? Buffer.from(msgTopic).toString("utf-8") : "";
      errorEvents.push({ source: "event", identifier: e.identifier, message: msg });
    }
  }
  for (const scr of txOnNetwork.smartContractResults ?? []) {
    const dataStr = Buffer.from(scr.data).toString("utf-8");
    // Pattern: @<2-hex-status>@<hex-message>...   status != "6f6b" (not "ok") signals an error
    const match = dataStr.match(/^@([0-9a-fA-F]{2})@([0-9a-fA-F]+)/);
    if (match && match[1] !== "6f6b") {
      try {
        const errMsg = Buffer.from(match[2], "hex").toString("utf-8");
        if (errMsg) {
          errorEvents.push({ source: "scr", identifier: `code@${match[1]}`, message: errMsg });
        }
      } catch {
        // ignore
      }
    }
  }
  if (errorEvents.length > 0) {
    // Pick the most informative message — prefer a non-empty event one over the SCR fallback
    const primary = errorEvents.find((e) => e.message && e.source === "event") ?? errorEvents[0];
    result.errorMessage = primary.message || "(empty)";
    result.errorSource = primary.source;
    result.allErrorEvents = errorEvents;
  }

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

  // Include events with both raw (base64) and decoded (utf-8/bech32/hex) topics.
  // This auto-surfaces token identifiers, addresses, error messages, etc.
  if (txOnNetwork.logs?.events) {
    result.events = txOnNetwork.logs.events.map((e: TransactionEvent) => {
      const { raw, decoded } = decodeTopics(
        e.topics?.map((t) => (Buffer.isBuffer(t) ? t : Buffer.from(t)))
      );
      const event: Record<string, unknown> = {
        identifier: e.identifier,
        topics: raw,
        topicsDecoded: decoded,
      };
      // Convenience: surface token identifier if present in topic[0]
      if (decoded[0] && typeof decoded[0] === "string" && looksLikeTokenId(decoded[0])) {
        event.tokenIdentifier = decoded[0];
      }
      return event;
    });
  }

  return result;
}
