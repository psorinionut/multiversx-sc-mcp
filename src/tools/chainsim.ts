import { execSync } from "child_process";
import { Address } from "@multiversx/sdk-core";
import { resolveNetwork, type NetworkName } from "../utils/networks.js";
import { validateAddress } from "../utils/validation.js";
import { fetchWithTimeout } from "../utils/fetch.js";

const DEFAULT_CONTAINER = "chainsim";
const DEFAULT_PORT = 8085;
const DEFAULT_IMAGE_TAG = "multiversx/chainsimulator:v1.11.3";
const EXEC_OPTS = { encoding: "utf-8" as const, maxBuffer: 10 * 1024 * 1024 };

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

// ─── Lifecycle (docker wrappers) ───────────────────────────────────────────

function containerExists(name: string): boolean {
  try {
    const out = execSync(`docker ps -a --filter name=^${name}$ --format "{{.Names}}"`, EXEC_OPTS);
    return out.trim() === name;
  } catch {
    return false;
  }
}

function containerRunning(name: string): boolean {
  try {
    const out = execSync(`docker ps --filter name=^${name}$ --format "{{.Names}}"`, EXEC_OPTS);
    return out.trim() === name;
  } catch {
    return false;
  }
}

/**
 * Start the chain simulator as a Docker container. Idempotent: if the
 * container already exists running, returns immediately. If it exists stopped,
 * starts it. Otherwise runs a fresh container.
 */
export async function start(params: {
  imageTag?: string;
  containerName?: string;
  port?: number;
  waitForReady?: boolean;
}) {
  const {
    imageTag = DEFAULT_IMAGE_TAG,
    containerName = DEFAULT_CONTAINER,
    port = DEFAULT_PORT,
    waitForReady = true,
  } = params;

  // Sanity-check docker is reachable
  try {
    execSync(`docker version --format '{{.Server.Version}}'`, EXEC_OPTS);
  } catch (err) {
    throw new Error(
      `Docker daemon not reachable. Start Docker Desktop (or the daemon) and retry. Details: ${(err as Error).message}`,
    );
  }

  let action: "started-new" | "started-existing" | "already-running";

  if (containerRunning(containerName)) {
    action = "already-running";
  } else if (containerExists(containerName)) {
    execSync(`docker start ${containerName}`, EXEC_OPTS);
    action = "started-existing";
  } else {
    execSync(
      `docker run -d --name ${containerName} -p ${port}:${DEFAULT_PORT} ${imageTag}`,
      EXEC_OPTS,
    );
    action = "started-new";
  }

  // Optionally poll /network/config until it responds
  let ready = false;
  if (waitForReady) {
    const deadline = Date.now() + 30_000;
    const url = `http://localhost:${port}/network/config`;
    while (Date.now() < deadline) {
      try {
        const r = await fetchWithTimeout(url, undefined, 2_000);
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {
        // ignore; container is still booting
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }

  return {
    success: true,
    action,
    containerName,
    imageTag,
    port,
    url: `http://localhost:${port}`,
    ready,
  };
}

export async function stop(params: { containerName?: string; remove?: boolean } = {}) {
  const { containerName = DEFAULT_CONTAINER, remove = true } = params;

  if (!containerExists(containerName)) {
    return { success: true, action: "noop", containerName, note: "Container doesn't exist" };
  }

  if (containerRunning(containerName)) {
    execSync(`docker stop ${containerName}`, EXEC_OPTS);
  }
  if (remove) {
    execSync(`docker rm ${containerName}`, EXEC_OPTS);
  }

  return {
    success: true,
    action: remove ? "stopped-and-removed" : "stopped",
    containerName,
  };
}

export async function status(params: { containerName?: string; port?: number } = {}) {
  const { containerName = DEFAULT_CONTAINER, port = DEFAULT_PORT } = params;

  const exists = containerExists(containerName);
  const running = exists && containerRunning(containerName);

  let httpReachable = false;
  let networkConfig: unknown = null;
  if (running) {
    try {
      const r = await fetchWithTimeout(
        `http://localhost:${port}/network/config`,
        undefined,
        2_000,
      );
      httpReachable = r.ok;
      if (r.ok) {
        const body = (await r.json()) as { data?: { config?: unknown } };
        networkConfig = body.data?.config ?? null;
      }
    } catch {
      // ignore
    }
  }

  return {
    containerName,
    exists,
    running,
    httpReachable,
    port,
    networkConfig,
  };
}

// ─── Initial (pre-funded genesis) wallets ─────────────────────────────────

/**
 * GET /simulator/initial-wallets. Returns the pre-funded genesis wallets that
 * ship with the simulator (system owner, validators, plus a list of stake /
 * initial-wallet addresses). Use these instead of mvx_chainsim_fund when you
 * just need a funded address.
 */
export async function initialWallets(params: { network?: NetworkName } = {}) {
  const { network } = params;
  const url = `${baseUrl(network)}/simulator/initial-wallets`;
  const resp = await fetchWithTimeout(url, undefined, 15_000);
  const body = await resp.text();
  if (!resp.ok) {
    throw new Error(`Simulator rejected initial-wallets: ${resp.status} ${body}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    return { raw: body };
  }
}

// ─── Storage pre-seeding ──────────────────────────────────────────────────

/**
 * POST /simulator/set-keys. Write raw storage keys on one or more accounts
 * without deploying anything. Great for pre-seeding contract state for tests
 * (pool reserves, farm snapshots, etc).
 *
 * Pass either a mapper name (auto hex-encoded) or a raw hex key. Values are
 * always raw hex.
 */
export async function setKeys(params: {
  address: string;
  pairs: Array<{ key: string; value: string }>;
  network?: NetworkName;
}) {
  const { address, pairs, network } = params;
  validateAddress(address);
  // The simulator exposes /simulator/set-state; a payload with only pairs
  // is treated as a keys-only patch (balance and nonce on the account stay
  // intact). There is no dedicated /simulator/set-keys endpoint.
  const url = `${baseUrl(network)}/simulator/set-state`;
  const bech32 = Address.newFromBech32(address).toBech32();

  const encodedPairs: Record<string, string> = {};
  for (const p of pairs) {
    const keyHex = /^[0-9a-fA-F]+$/.test(p.key) && p.key.length % 2 === 0
      ? p.key
      : Buffer.from(p.key).toString("hex");
    const valueHex = p.value.startsWith("0x") ? p.value.slice(2) : p.value;
    encodedPairs[keyHex] = valueHex;
  }

  const payload = [{ address: bech32, pairs: encodedPairs }];
  const resp = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    30_000,
  );
  const body = await resp.text();
  if (!resp.ok) {
    throw new Error(`Simulator rejected set-keys: ${resp.status} ${body}`);
  }
  return {
    success: true,
    address: bech32,
    pairsApplied: pairs.length,
    response: body,
  };
}

// ─── Force-epoch transition ───────────────────────────────────────────────

/**
 * Jump the simulator to the next epoch (or to a specific target epoch) as fast
 * as the simulator allows. Under the hood this calls
 * /simulator/generate-blocks-until-epoch-reached/{epoch} — the simulator
 * generates all the intermediate blocks at max speed (no real-time wait). This
 * is still much faster than calling /generate-blocks/{n} and counting blocks
 * yourself, and it's the right primitive for epoch-gated tests.
 *
 * If `targetEpoch` is omitted, advances exactly one epoch past the current.
 */
export async function forceEpoch(params: { targetEpoch?: number; network?: NetworkName } = {}) {
  const { targetEpoch, network } = params;
  const url = baseUrl(network);

  const currentEpoch = async (): Promise<number> => {
    const r = await fetchWithTimeout(`${url}/network/status/1`, undefined, 5_000);
    if (!r.ok) throw new Error(`Failed to read network status: ${r.status}`);
    const body = (await r.json()) as { data?: { status?: { erd_epoch_number?: number } } };
    return body.data?.status?.erd_epoch_number ?? 0;
  };

  const startEpoch = await currentEpoch();
  const actualTarget = targetEpoch ?? startEpoch + 1;

  if (actualTarget <= startEpoch) {
    return {
      success: true,
      startEpoch,
      endEpoch: startEpoch,
      targetEpoch: actualTarget,
      transitions: 0,
      reachedTarget: true,
      note: "Target epoch already reached.",
    };
  }

  const r = await fetchWithTimeout(
    `${url}/simulator/generate-blocks-until-epoch-reached/${actualTarget}`,
    { method: "POST" },
    120_000,
  );
  const body = await r.text();
  if (!r.ok) {
    throw new Error(`Simulator rejected generate-blocks-until-epoch-reached: ${r.status} ${body}`);
  }
  const endEpoch = await currentEpoch();

  return {
    success: true,
    startEpoch,
    endEpoch,
    targetEpoch: actualTarget,
    transitions: endEpoch - startEpoch,
    reachedTarget: endEpoch >= actualTarget,
  };
}
