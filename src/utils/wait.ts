import { Address, gatherAllEvents } from "@multiversx/sdk-core";
import { getApiProvider } from "../core/provider.js";
import type { NetworkName } from "./networks.js";

const POLL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 120_000;

export type CompletionResult = {
  finalStatus: "success" | "fail" | "timeout";
  errorMessage?: string;
  newContractAddress?: string;
  newCodeHash?: string;
  mintedTokens?: Array<{ token: string; nonce: string; amount: string; receiver?: string }>;
};

/**
 * Poll a tx until it lands (success/fail) or timeout.
 *
 * Extracts useful post-completion data:
 *  - signalError message (so callers see WHY it failed without a second hop)
 *  - new contract address (for deploy)
 *  - new code hash (for upgrade)
 *  - minted tokens (for create-NFT and similar flows)
 */
export async function waitForTx(
  txHash: string,
  network: NetworkName | undefined,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<CompletionResult> {
  const provider = getApiProvider(network);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const tx = await provider.getTransaction(txHash);
      const status = tx.status.toString();

      if (status === "success" || status === "fail") {
        const out: CompletionResult = {
          finalStatus: status === "success" ? "success" : "fail",
        };

        const events = gatherAllEvents(tx);

        // Look for an error message
        for (const e of events) {
          if (e.identifier === "signalError" || e.identifier === "internalVMErrors") {
            const msg = e.topics?.[1] ? Buffer.from(e.topics[1]).toString("utf-8") : "";
            if (msg) {
              out.errorMessage = msg;
              break;
            }
          }
        }

        // SCDeploy / SCUpgrade events expose the new code hash (topic[2]) and new SC address (topic[0])
        for (const e of events) {
          if (e.identifier === "SCDeploy" || e.identifier === "SCUpgrade") {
            if (e.topics?.[0]) {
              try {
                out.newContractAddress = Address.newFromHex(
                  Buffer.from(e.topics[0]).toString("hex"),
                ).toBech32();
              } catch {
                // ignore
              }
            }
            if (e.topics?.[2]) {
              out.newCodeHash = Buffer.from(e.topics[2]).toString("hex");
            }
          }
        }

        // Track minted NFTs/SFTs for create-NFT-style flows
        const minted: CompletionResult["mintedTokens"] = [];
        for (const e of events) {
          if (e.identifier === "ESDTNFTCreate" && e.topics && e.topics.length >= 3) {
            const token = Buffer.from(e.topics[0]).toString("utf-8");
            const nonce = Buffer.from(e.topics[1]).toString("hex");
            const amount = Buffer.from(e.topics[2]).toString("hex");
            minted.push({ token, nonce, amount });
          }
        }
        if (minted.length > 0) out.mintedTokens = minted;

        return out;
      }
    } catch {
      // ignore (404 while still propagating)
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return { finalStatus: "timeout" };
}
