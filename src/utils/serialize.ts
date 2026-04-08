export function serializeValue(val: unknown): unknown {
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
