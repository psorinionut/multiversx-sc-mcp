import {
  Address,
  Message,
  MessageComputer,
  UserVerifier,
} from "@multiversx/sdk-core";

export async function verifyMessage(params: {
  address: string;
  message: string;
  signature: string;
}) {
  const { address: bech32Address, message: messageText, signature: signatureHex } = params;

  const address = Address.newFromBech32(bech32Address);

  // Reconstruct the Message object with the original data and signature
  const messageObj = new Message({
    data: new TextEncoder().encode(messageText),
    signature: Buffer.from(signatureHex, "hex"),
    address,
  });

  // Compute the serialized bytes for verification (same prefix-based serialization as signing)
  const messageComputer = new MessageComputer();
  const serialized = messageComputer.computeBytesForVerifying(messageObj);

  // Create verifier from the signer's address (extracts the ed25519 public key)
  const verifier = UserVerifier.fromAddress(address);

  // Verify the signature against the serialized message bytes
  const valid = await verifier.verify(serialized, messageObj.signature!);

  return {
    valid,
    address: bech32Address,
    message: messageText,
  };
}
