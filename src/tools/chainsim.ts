import { Address } from "@multiversx/sdk-core";
import { resolveNetwork, type NetworkName } from "../utils/networks.js";
import { validateAddress } from "../utils/validation.js";
import { fetchWithTimeout } from "../utils/fetch.js";

/**
 * Helpers for MultiversX chain simulator (localnet only).
 *
 * The simulator exposes the gateway API plus a small admin surface under /simulator/*.
 * See: https://docs.multiversx.com/developers/chain-simulator
 */

function baseUrl(network: NetworkName | undefined): string {
  const net = network || "localnet";
  if (net !== "localnet") {
    throw new Error(
      `mvx_chainsim_* tools only work on the localnet chain simulator (network="localnet"). Got: "${net}".`,
    );
  }
  return resolveNetwork(net).apiUrl.replace(/\/$/, "");
}

/**
 * Advance blocks or jump to a specific epoch on the simulator.
 * Exactly one of `blocks` or `untilEpoch` must be supplied.
 */
export async function advance(params: {
  blocks?: number;
  untilEpoch?: number;
  network?: NetworkName;
}) {
  const { blocks, untilEpoch, network } = params;
  const url = baseUrl(network);

  if ((blocks === undefined) === (untilEpoch === undefined)) {
    throw new Error("Provide exactly one of: blocks, untilEpoch.");
  }

  const endpoint =
    blocks !== undefined
      ? `${url}/simulator/generate-blocks/${blocks}`
      : `${url}/simulator/generate-blocks-until-epoch-reached/${untilEpoch}`;

  const resp = await fetchWithTimeout(endpoint, { method: "POST" }, 60_000);
  const body = await resp.text();
  if (!resp.ok) {
    throw new Error(`Simulator rejected advance: ${resp.status} ${body}`);
  }
  return {
    success: true,
    endpoint,
    blocks,
    untilEpoch,
    response: body,
  };
}

/**
 * Credit an address with EGLD and/or ESDT balances on the simulator.
 * Uses POST /simulator/set-state with a minimal payload (balance + nonce).
 *
 * For ESDT credits we also set the token storage key that the protocol reads
 * on the account: "ELRONDesdt<hex token>". Amount is the atomic-unit BigInt.
 */
export async function fund(params: {
  address: string;
  egld?: string;
  nonce?: number;
  esdts?: Array<{ token: string; amount: string; nonce?: number }>;
  network?: NetworkName;
}) {
  const { address, egld, nonce, esdts = [], network } = params;
  validateAddress(address);

  const url = baseUrl(network);

  const bech32 = Address.newFromBech32(address).toBech32();

  const payload: Record<string, unknown> = { address: bech32 };
  if (egld !== undefined) payload.balance = egld;
  if (nonce !== undefined) payload.nonce = nonce;

  if (esdts.length > 0) {
    payload.pairs = {};
    for (const e of esdts) {
      // Build the protocol storage key: "ELRONDesdt<token id hex>" optionally suffixed
      // with the nonce for NFTs/SFTs/metaESDTs. The value is a protobuf-encoded
      // ESDigitalToken, but for the simulator's set-state the simple "balance-only"
      // encoding (just the amount as big-endian hex) is commonly accepted.
      const tokenHex = Buffer.from(e.token).toString("hex");
      const nonceHex =
        e.nonce && e.nonce > 0
          ? e.nonce.toString(16).padStart(2, "0").length % 2 === 0
            ? e.nonce.toString(16)
            : "0" + e.nonce.toString(16)
          : "";
      const key = "454c524f4e44657364" + tokenHex + nonceHex; // "ELRONDesdt" prefix in hex
      const amountBig = BigInt(e.amount);
      const amountHex = amountBig.toString(16).padStart(2, "0");
      // ESDigitalToken protobuf tag-3 wire-type 2, length + 0x0A (string-length) + varint; use a safe minimal form: 0x08 (varint tag for field=type) + 0x00 (type=Fungible) + 0x12 (tag for BigInt field) + length + amount bytes
      const amountBytes = Buffer.from(amountHex.length % 2 ? "0" + amountHex : amountHex, "hex");
      const lenByte = amountBytes.length.toString(16).padStart(2, "0");
      const valHex = "0800" + "12" + lenByte + amountBytes.toString("hex");
      (payload.pairs as Record<string, string>)[key] = valHex;
    }
  }

  const resp = await fetchWithTimeout(
    `${url}/simulator/set-state`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([payload]),
    },
    30_000,
  );
  const body = await resp.text();
  if (!resp.ok) {
    throw new Error(`Simulator rejected set-state: ${resp.status} ${body}`);
  }
  return {
    success: true,
    address: bech32,
    appliedBalance: egld ?? null,
    appliedNonce: nonce ?? null,
    esdtsApplied: esdts.length,
    response: body,
  };
}

/**
 * Poll the simulator until a specific tx hash is processed. The simulator
 * doesn't auto-mine, so a bare send will never finalize unless we advance
 * blocks. This helper does the advancing for you.
 */
export async function processTx(params: {
  txHash: string;
  maxBlocks?: number;
  network?: NetworkName;
}) {
  const { txHash, maxBlocks = 20, network } = params;
  const url = baseUrl(network);
  // Dedicated simulator endpoint that generates blocks until the tx is mined
  const endpoint = `${url}/simulator/generate-blocks-until-transaction-processed/${txHash}`;
  const resp = await fetchWithTimeout(endpoint, { method: "POST" }, 60_000);
  const body = await resp.text();
  if (!resp.ok) {
    throw new Error(`Simulator rejected generate-until-processed: ${resp.status} ${body}`);
  }
  return { success: true, txHash, maxBlocks, response: body };
}
