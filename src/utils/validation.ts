export function validateAddress(address: string): void {
  if (!address || !address.startsWith("erd1") || address.length !== 62) {
    throw new Error(`Invalid MultiversX address: "${address}". Must start with "erd1" and be 62 characters.`);
  }
}
