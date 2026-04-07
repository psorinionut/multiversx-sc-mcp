import { Address } from "@multiversx/sdk-core";

type Format = "bech32" | "hex" | "decimal" | "string" | "base64";

export async function convert(params: {
  value: string;
  from: Format;
  to: Format;
}): Promise<{ input: string; from: string; to: string; result: string; description: string }> {
  const { value, from, to } = params;

  if (from === to) {
    return {
      input: value,
      from,
      to,
      result: value,
      description: "No conversion needed (same format).",
    };
  }

  // Normalize to an intermediate hex representation, then convert to target
  const hexIntermediate = toHex(value, from);
  const result = fromHex(hexIntermediate, to);

  return {
    input: value,
    from,
    to,
    result,
    description: `Converted ${from} to ${to}.`,
  };
}

/**
 * Convert from any supported format to hex (intermediate representation).
 */
function toHex(value: string, from: Format): string {
  switch (from) {
    case "hex":
      return normalizeHex(value);

    case "bech32": {
      const addr = Address.newFromBech32(value);
      return addr.toHex();
    }

    case "decimal": {
      const n = BigInt(value);
      if (n < 0n) {
        throw new Error("Negative decimal values are not supported.");
      }
      if (n === 0n) return "00";
      let hex = n.toString(16);
      if (hex.length % 2 !== 0) hex = "0" + hex;
      return hex;
    }

    case "string":
      return Buffer.from(value, "utf-8").toString("hex");

    case "base64":
      return Buffer.from(value, "base64").toString("hex");

    default:
      throw new Error(`Unsupported source format: ${from}`);
  }
}

/**
 * Convert from hex (intermediate representation) to any supported format.
 */
function fromHex(hex: string, to: Format): string {
  switch (to) {
    case "hex":
      return hex;

    case "bech32": {
      if (hex.length !== 64) {
        throw new Error(
          `Cannot convert to bech32: hex value must be 64 characters (32 bytes) for an address, got ${hex.length} characters.`
        );
      }
      const addr = Address.newFromHex(hex);
      return addr.toBech32();
    }

    case "decimal": {
      if (hex === "") return "0";
      return BigInt("0x" + hex).toString(10);
    }

    case "string":
      return Buffer.from(hex, "hex").toString("utf-8");

    case "base64":
      return Buffer.from(hex, "hex").toString("base64");

    default:
      throw new Error(`Unsupported target format: ${to}`);
  }
}

/**
 * Strip optional 0x prefix and validate hex.
 */
function normalizeHex(value: string): string {
  const hex = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error(`Invalid hex string: "${value}"`);
  }
  if (hex.length % 2 !== 0) {
    return "0" + hex;
  }
  return hex;
}

export async function formatAmount(params: {
  value: string;
  decimals: number;
  operation: "denominate" | "nominate";
}): Promise<{ input: string; decimals: number; operation: string; result: string; description: string }> {
  const { value, decimals, operation } = params;

  if (decimals < 0 || !Number.isInteger(decimals)) {
    throw new Error("Decimals must be a non-negative integer.");
  }

  if (operation === "denominate") {
    // raw → human-readable: divide by 10^decimals
    const raw = BigInt(value);
    const divisor = 10n ** BigInt(decimals);
    const wholePart = raw / divisor;
    const remainder = raw % divisor;

    let result: string;
    if (remainder === 0n) {
      result = wholePart.toString();
    } else {
      const remainderStr = remainder.toString().padStart(decimals, "0");
      // Trim trailing zeros
      const trimmed = remainderStr.replace(/0+$/, "");
      result = `${wholePart}.${trimmed}`;
    }

    return {
      input: value,
      decimals,
      operation,
      result,
      description: `Denominated ${value} with ${decimals} decimals → ${result} (divided by 10^${decimals}).`,
    };
  } else {
    // human-readable → raw: multiply by 10^decimals
    const parts = value.split(".");
    const wholePart = parts[0];
    const fracPart = parts[1] || "";

    if (fracPart.length > decimals) {
      throw new Error(
        `Too many decimal places: "${value}" has ${fracPart.length} decimals, but token has ${decimals}.`
      );
    }

    const paddedFrac = fracPart.padEnd(decimals, "0");
    const combined = wholePart + paddedFrac;
    // Remove leading zeros but keep at least "0"
    const result = combined.replace(/^0+/, "") || "0";

    return {
      input: value,
      decimals,
      operation,
      result,
      description: `Nominated ${value} with ${decimals} decimals → ${result} (multiplied by 10^${decimals}).`,
    };
  }
}
