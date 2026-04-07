import {
  Address,
  SmartContractQuery,
  SmartContractQueryResponse,
  NativeSerializer,
  ArgSerializer,
  Abi,
} from "@multiversx/sdk-core";
import type { ApiNetworkProvider } from "@multiversx/sdk-core";
import { loadAbi } from "../core/abi-loader.js";
import { getApiProvider } from "../core/provider.js";
import type { NetworkName } from "../utils/networks.js";

export async function queryContract(params: {
  address: string;
  endpoint: string;
  arguments?: unknown[];
  abiPath?: string;
  network?: NetworkName;
}) {
  const { address, endpoint, arguments: args = [], abiPath, network } = params;

  const contractAddress = Address.newFromBech32(address);
  const provider = getApiProvider(network);

  // Try to load ABI for encoding/decoding
  const abi = await loadAbi({ address, abiPath, network });

  if (abi) {
    return queryWithAbi(provider, contractAddress, endpoint, args, abi);
  } else {
    return queryRaw(provider, contractAddress, endpoint, args);
  }
}

async function queryWithAbi(
  provider: ApiNetworkProvider,
  contractAddress: Address,
  endpoint: string,
  args: unknown[],
  abi: Abi
) {
  // Validate endpoint exists and get definition
  const endpointDef = abi.getEndpoint(endpoint);

  // Encode arguments using NativeSerializer
  const typedArgs = NativeSerializer.nativeToTypedValues(args, endpointDef);
  const argSerializer = new ArgSerializer();
  const encodedArgs = argSerializer.valuesToBuffers(typedArgs);

  const scQuery = new SmartContractQuery({
    contract: contractAddress,
    function: endpoint,
    arguments: encodedArgs,
  });

  const response = await provider.queryContract(scQuery);

  if (response.returnCode !== "ok") {
    throw new Error(
      `Query failed: ${response.returnCode} — ${response.returnMessage}`
    );
  }

  // Decode using ArgSerializer
  const returnBuffers = response.returnDataParts.map((p) => Buffer.from(p));
  const decoded = argSerializer.buffersToValues(returnBuffers, endpointDef.output);

  const outputTypes = endpointDef.output.map((o) => o.type.toString());

  return {
    endpoint,
    returnCode: response.returnCode,
    decoded: formatDecodedValues(
      decoded.map((v) => v.valueOf()),
      outputTypes
    ),
    raw: response.returnDataParts.map((p) => Buffer.from(p).toString("hex")),
  };
}

async function queryRaw(
  provider: ApiNetworkProvider,
  contractAddress: Address,
  endpoint: string,
  args: unknown[]
) {
  // Without ABI, args must be hex strings or buffers
  const encodedArgs = args.map((a) => {
    if (typeof a === "string") {
      const hex = a.startsWith("0x") ? a.slice(2) : a;
      return Buffer.from(hex, "hex");
    }
    if (typeof a === "number") {
      const hex = a.toString(16);
      return Buffer.from(hex.length % 2 ? "0" + hex : hex, "hex");
    }
    return Buffer.from(String(a));
  });

  const scQuery = new SmartContractQuery({
    contract: contractAddress,
    function: endpoint,
    arguments: encodedArgs,
  });

  const response = await provider.queryContract(scQuery);

  if (response.returnCode !== "ok") {
    throw new Error(
      `Query failed: ${response.returnCode} — ${response.returnMessage}`
    );
  }

  return {
    endpoint,
    returnCode: response.returnCode,
    note: "No ABI available — results are raw hex. Provide 'abiPath' for decoded output.",
    raw: response.returnDataParts.map((p) => Buffer.from(p).toString("hex")),
  };
}

function formatDecodedValues(
  decoded: unknown[],
  outputTypes: string[]
): unknown[] {
  return decoded.map((val, i) => {
    const typeName = outputTypes[i] || "unknown";
    return {
      type: typeName,
      value: serializeValue(val),
    };
  });
}

function serializeValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === "bigint") return val.toString();
  if (typeof val === "boolean" || typeof val === "number" || typeof val === "string") return val;
  if (Buffer.isBuffer(val)) return val.toString("hex");

  if (val instanceof Uint8Array) return Buffer.from(val).toString("hex");

  if (Array.isArray(val)) return val.map(serializeValue);

  if (typeof val === "object") {
    // Handle Address-like objects
    if ("toBech32" in val && typeof (val as Record<string, unknown>).toBech32 === "function") {
      return (val as { toBech32(): string }).toBech32();
    }
    if ("bech32" in val && typeof (val as Record<string, unknown>).bech32 === "function") {
      return (val as { bech32(): string }).bech32();
    }
    // Handle BigNumber-like objects
    if ("toFixed" in val && typeof (val as Record<string, unknown>).toFixed === "function") {
      return (val as { toFixed(): string }).toFixed();
    }
    if ("toString" in val && typeof (val as Record<string, unknown>).toString === "function") {
      const str = (val as { toString(): string }).toString();
      if (str !== "[object Object]") return str;
    }
    // Recursively serialize object properties
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(val)) {
      result[key] = serializeValue(value);
    }
    return result;
  }

  return String(val);
}
