import { UserSigner, Message, MessageComputer } from "@multiversx/sdk-core";
import { readFile } from "fs/promises";

export async function signMessage(params: {
  message: string;
  walletPem?: string;
}) {
  const { message: messageText, walletPem } = params;

  // Resolve wallet PEM
  const pemPath = walletPem || process.env.MULTIVERSX_WALLET_PEM;
  if (!pemPath) {
    throw new Error(
      "Wallet required for signing. Set MULTIVERSX_WALLET_PEM env var or provide 'walletPem' parameter."
    );
  }

  const pemContent = await readFile(pemPath, "utf-8");
  const signer = UserSigner.fromPem(pemContent);
  const address = signer.getAddress();

  // Build the Message object
  const messageObj = new Message({
    data: new TextEncoder().encode(messageText),
    address,
  });

  // Compute the serialized bytes for signing (includes the "\x19MultiversX..." prefix)
  const messageComputer = new MessageComputer();
  const serialized = messageComputer.computeBytesForSigning(messageObj);

  // Sign the serialized bytes
  const signature = await signer.sign(serialized);

  // Attach signature back to the message for packMessage
  messageObj.signature = signature;

  return {
    address: address.toBech32(),
    message: messageText,
    signature: Buffer.from(signature).toString("hex"),
  };
}
