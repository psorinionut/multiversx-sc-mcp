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
import { validateAddress } from "../utils/validation.js";
import { serializeValue } from "../utils/serialize.js";

export async function queryContract(params: {
  address: string;
  endpoint: string;
  arguments?: unknown[];
  abiPath?: string;
  network?: NetworkName;
}) {
  const { address, endpoint, arguments: args = [], abiPath, network } = params;
  validateAddress(address);

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
      if (!/^[0-9a-fA-F]*$/.test(hex)) {
        throw new Error(`Without ABI, arguments must be hex strings. Got: "${a}". Provide abiPath for auto-encoding.`);
      }
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

