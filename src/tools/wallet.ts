import { Mnemonic, UserWallet, UserSigner } from "@multiversx/sdk-core";
import { writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";

export async function createWallet(params: {
  outPath: string;
  format?: "pem" | "json";
  password?: string;
}) {
  const { outPath, format = "pem", password } = params;

  // Check parent directory exists
  const dir = dirname(outPath);
  if (!existsSync(dir)) {
    throw new Error(`Directory does not exist: ${dir}`);
  }

  if (existsSync(outPath)) {
    throw new Error(`File already exists: ${outPath}. Choose a different path to avoid overwriting.`);
  }

  // Generate mnemonic and derive secret key
  const mnemonic = Mnemonic.generate();
  const secretKey = mnemonic.deriveKey();
  const address = secretKey.generatePublicKey().toAddress();

  if (format === "pem") {
    const signer = new UserSigner(secretKey);
    // Build PEM content manually
    const pemContent = buildPemContent(address.toBech32(), secretKey.hex() + secretKey.generatePublicKey().hex());
    await writeFile(outPath, pemContent, "utf-8");
  } else {
    if (!password) {
      throw new Error("Password required for JSON wallet format.");
    }
    const wallet = UserWallet.fromSecretKey({ secretKey, password });
    await writeFile(outPath, JSON.stringify(wallet.toJSON(), null, 2), "utf-8");
  }

  return {
    address: address.toBech32(),
    mnemonic: mnemonic.toString(),
    format,
    path: outPath,
    note: "SECURITY WARNING: The mnemonic above is your wallet's master key. Save it securely and NEVER share it. Anyone with this mnemonic can access your funds.",
  };
}

export async function walletInfo(params: {
  pemPath: string;
}) {
  const { pemPath } = params;

  if (!existsSync(pemPath)) {
    throw new Error(`PEM file not found: ${pemPath}`);
  }

  const pemContent = await readFile(pemPath, "utf-8");
  const signer = UserSigner.fromPem(pemContent);
  const address = signer.getAddress();

  return {
    address: address.toBech32(),
    path: pemPath,
  };
}

function buildPemContent(label: string, keyHex: string): string {
  // MultiversX PEM format: base64-encode the hex STRING (not the raw bytes)
  const base64 = Buffer.from(keyHex).toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 64) {
    lines.push(base64.substring(i, i + 64));
  }
  return `-----BEGIN PRIVATE KEY for ${label}-----\n${lines.join("\n")}\n-----END PRIVATE KEY for ${label}-----\n`;
}
