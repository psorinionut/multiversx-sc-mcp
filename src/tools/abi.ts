import { loadAbi } from "../core/abi-loader.js";
import type { NetworkName } from "../utils/networks.js";
import { validateAddress } from "../utils/validation.js";

export async function inspectAbi(params: {
  address?: string;
  abiPath?: string;
  network?: NetworkName;
}) {
  const { address, abiPath, network } = params;
  if (address) {
    validateAddress(address);
  }

  if (!address && !abiPath) {
    throw new Error("Provide either 'address' (for auto-fetch) or 'abiPath' (local file).");
  }

  const abi = await loadAbi({ address, abiPath, network });
  if (!abi) {
    throw new Error(
      address
        ? `Could not fetch ABI for ${address}. The contract may not be verified. Provide 'abiPath' to a local .abi.json file instead.`
        : `Could not load ABI from ${abiPath}.`
    );
  }

  const endpoints: Array<Record<string, unknown>> = [];
  const views: Array<Record<string, unknown>> = [];

  for (const endpoint of abi.getEndpoints()) {
    const entry = {
      name: endpoint.name,
      inputs: endpoint.input.map((i: { name: string; type: { toString(): string } }) => ({
        name: i.name,
        type: i.type.toString(),
      })),
      outputs: endpoint.output.map((o: { type: { toString(): string } }) => ({
        type: o.type.toString(),
      })),
    };

    if (endpoint.modifiers.mutability === "readonly") {
      views.push(entry);
    } else {
      endpoints.push({
        ...entry,
        mutability: endpoint.modifiers.mutability,
        payableInTokens: endpoint.modifiers.payableInTokens,
      });
    }
  }

  const constructor = abi.constructorDefinition;
  const constructorInfo = constructor
    ? {
        inputs: constructor.input.map((i: { name: string; type: { toString(): string } }) => ({
          name: i.name,
          type: i.type.toString(),
        })),
      }
    : null;

  const events = abi.events.map((e: { identifier: string; inputs: Array<{ name: string; type: { toString(): string }; indexed: boolean }> }) => ({
    name: e.identifier,
    inputs: e.inputs.map((i) => ({
      name: i.name,
      type: i.type.toString(),
      indexed: i.indexed,
    })),
  }));

  const types = abi.customTypes.map((t: { getName(): string }) => t.getName());

  return {
    name: abi.name || "unknown",
    constructor: constructorInfo,
    endpoints: endpoints,
    views: views,
    events: events,
    customTypes: types,
    summary: {
      totalEndpoints: endpoints.length,
      totalViews: views.length,
      totalEvents: events.length,
      totalCustomTypes: types.length,
    },
  };
}
