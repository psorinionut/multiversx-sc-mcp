import { BinaryCodec } from "@multiversx/sdk-core";
import { loadAbi } from "../core/abi-loader.js";
import type { NetworkName } from "../utils/networks.js";

export async function decodeValue(params: {
  hex: string;
  typeName: string;
  abiPath?: string;
  address?: string;
  network?: NetworkName;
}) {
  const { hex, typeName, abiPath, address, network } = params;

  const abi = await loadAbi({ address, abiPath, network });
  if (!abi) {
    throw new Error(
      "ABI required for decoding. Provide 'abiPath' or 'address' of a verified contract."
    );
  }

  const data = Buffer.from(hex.startsWith("0x") ? hex.slice(2) : hex, "hex");

  // Try to find the type in the ABI
  let customType;
  try {
    customType = abi.getStruct(typeName);
  } catch {
    try {
      customType = abi.getEnum(typeName);
    } catch {
      throw new Error(
        `Type "${typeName}" not found in ABI. Available custom types: ${abi.customTypes
          .map((t) => t.getName())
          .join(", ")}`
      );
    }
  }

  const codec = new BinaryCodec();
  const [decoded] = codec.decodeNested(data, customType);
  const value = decoded.valueOf();

  return {
    typeName,
    hex,
    decoded: serializeValue(value),
  };
}

function serializeValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === "bigint") return val.toString();
  if (typeof val === "boolean" || typeof val === "number" || typeof val === "string") return val;
  if (Buffer.isBuffer(val)) return val.toString("hex");
  if (val instanceof Uint8Array) return Buffer.from(val).toString("hex");
  if (Array.isArray(val)) return val.map(serializeValue);

  if (typeof val === "object") {
    if ("toBech32" in val && typeof (val as Record<string, unknown>).toBech32 === "function") {
      return (val as { toBech32(): string }).toBech32();
    }
    if ("bech32" in val && typeof (val as Record<string, unknown>).bech32 === "function") {
      return (val as { bech32(): string }).bech32();
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(val)) {
      result[key] = serializeValue(value);
    }
    return result;
  }

  return String(val);
}
