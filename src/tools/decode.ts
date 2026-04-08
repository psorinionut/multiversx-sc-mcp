import { BinaryCodec } from "@multiversx/sdk-core";
import { loadAbi } from "../core/abi-loader.js";
import type { NetworkName } from "../utils/networks.js";
import { serializeValue } from "../utils/serialize.js";

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

