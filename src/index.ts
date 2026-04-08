#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { queryAccount } from "./tools/account.js";
import { inspectAbi } from "./tools/abi.js";
import { queryContract } from "./tools/query.js";
import { readStorage, listStorageKeys } from "./tools/storage.js";
import { callContract } from "./tools/call.js";
import { getTransactionResult } from "./tools/tx-result.js";
import { decodeValue } from "./tools/decode.js";
import { searchContracts } from "./tools/search.js";
import { transfer } from "./tools/transfer.js";
import { deployContract, upgradeContract } from "./tools/deploy.js";
import { verifyContract, checkVerificationStatus } from "./tools/verify.js";
import { createWallet, walletInfo } from "./tools/wallet.js";
import { convert, formatAmount } from "./tools/convert.js";
import { getTokenInfo } from "./tools/token-info.js";
import { getNetworkConfig } from "./tools/network-config.js";
import { signMessage } from "./tools/sign-message.js";
import { verifyMessage } from "./tools/verify-message.js";
import { decodeNativeAuth, generateNativeAuth } from "./tools/native-auth.js";
import { simulateTransaction, estimateGas } from "./tools/simulate.js";
import { getSetupConfig } from "./tools/setup.js";
import {
  buildContract,
  runTests,
  createNewContract,
  generateProxy,
  compareCodehash,
  reproducibleBuild,
} from "./tools/sc-meta.js";
import { registerPrompts } from "./prompts/index.js";

/** JSON.stringify replacer that converts BigInt to string */
function safeStringify(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  , 2);
}

const server = new McpServer({
  name: "multiversx-sc-mcp",
  version: "0.1.0",
});

// ─── mvx_account ────────────────────────────────────────────────────────
server.tool(
  "mvx_account",
  "Get MultiversX account or smart contract information — balance, nonce, owner, deploy info, verification status.",
  {
    address: z.string().describe("MultiversX address (erd1...)"),
    network: z
      .enum(["mainnet", "testnet", "devnet"])
      .optional()
      .describe("Network (default: mainnet)"),
  },
  async ({ address, network }) => {
    try {
      const result = await queryAccount({ address, network });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_abi ────────────────────────────────────────────────────────────
server.tool(
  "mvx_sc_abi",
  "Load and inspect a smart contract's ABI — list all endpoints, views, events, and custom types. Auto-fetches ABI for verified contracts.",
  {
    address: z.string().optional().describe("Contract address (auto-fetches ABI if verified)"),
    abiPath: z.string().optional().describe("Local path to .abi.json file"),
    network: z
      .enum(["mainnet", "testnet", "devnet"])
      .optional()
      .describe("Network (default: mainnet)"),
  },
  async ({ address, abiPath, network }) => {
    try {
      const result = await inspectAbi({ address, abiPath, network });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_query ──────────────────────────────────────────────────────────
server.tool(
  "mvx_sc_query",
  "Query a smart contract view/endpoint (read-only, no transaction). With ABI: pass human-readable arguments and get decoded results. Without ABI: pass hex arguments, get hex results.",
  {
    address: z.string().describe("Contract address (erd1...)"),
    endpoint: z.string().describe("Endpoint/view function name"),
    arguments: z
      .array(z.unknown())
      .optional()
      .describe(
        "Arguments as native values when ABI is available (numbers, strings, addresses). Without ABI: hex strings."
      ),
    abiPath: z.string().optional().describe("Local path to .abi.json file (auto-fetched if omitted and contract is verified)"),
    network: z
      .enum(["mainnet", "testnet", "devnet"])
      .optional()
      .describe("Network (default: mainnet)"),
  },
  async ({ address, endpoint, arguments: args, abiPath, network }) => {
    try {
      const result = await queryContract({
        address,
        endpoint,
        arguments: args || [],
        abiPath,
        network,
      });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_storage ────────────────────────────────────────────────────────
server.tool(
  "mvx_sc_storage",
  "Read a smart contract's storage. Pass a mapper name (e.g., 'reserve') or a hex key. Returns the raw value with automatic decode attempts (as number, address, string).",
  {
    address: z.string().describe("Contract address (erd1...)"),
    key: z
      .string()
      .describe(
        "Storage key — either a mapper name like 'reserve' (auto hex-encoded) or a raw hex key"
      ),
    network: z
      .enum(["mainnet", "testnet", "devnet"])
      .optional()
      .describe("Network (default: mainnet)"),
  },
  async ({ address, key, network }) => {
    try {
      const result = await readStorage({ address, key, network });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_storage_keys ───────────────────────────────────────────────────
server.tool(
  "mvx_sc_storage_keys",
  "List all storage keys for a smart contract. Returns up to 100 key-value pairs with automatic decode attempts.",
  {
    address: z.string().describe("Contract address (erd1...)"),
    network: z
      .enum(["mainnet", "testnet", "devnet"])
      .optional()
      .describe("Network (default: mainnet)"),
  },
  async ({ address, network }) => {
    try {
      const result = await listStorageKeys({ address, network });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_call ───────────────────────────────────────────────────────────
server.tool(
  "mvx_sc_call",
  "Send a transaction to a smart contract endpoint. REQUIRES a wallet (PEM). Use with caution — this sends real transactions on-chain.",
  {
    address: z.string().describe("Contract address (erd1...)"),
    endpoint: z.string().describe("Endpoint function name"),
    arguments: z
      .array(z.unknown())
      .optional()
      .describe("Arguments (native values with ABI, hex without)"),
    gasLimit: z
      .number()
      .optional()
      .describe("Gas limit (default: 30000000)"),
    value: z
      .string()
      .optional()
      .describe("EGLD value to send in atomic units (default: 0)"),
    esdtTransfers: z
      .array(
        z.object({
          token: z.string().describe("Token identifier (e.g., WEGLD-bd4d79)"),
          nonce: z.number().optional().describe("Token nonce (0 for fungible)"),
          amount: z.string().describe("Amount in atomic units"),
        })
      )
      .optional()
      .describe("ESDT token transfers to include"),
    abiPath: z.string().optional().describe("Local path to .abi.json file"),
    walletPem: z
      .string()
      .optional()
      .describe("Path to PEM wallet file (or set MULTIVERSX_WALLET_PEM env)"),
    network: z
      .enum(["mainnet", "testnet", "devnet"])
      .optional()
      .describe("Network (default: mainnet)"),
  },
  async ({
    address,
    endpoint,
    arguments: args,
    gasLimit,
    value,
    esdtTransfers,
    abiPath,
    walletPem,
    network,
  }) => {
    try {
      const result = await callContract({
        address,
        endpoint,
        arguments: args || [],
        gasLimit,
        value,
        esdtTransfers,
        abiPath,
        walletPem,
        network,
      });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_tx_result ──────────────────────────────────────────────────────
server.tool(
  "mvx_tx_result",
  "Get transaction results and decode SC outputs/events. Provide a contract address or ABI path for decoded results.",
  {
    txHash: z.string().describe("Transaction hash"),
    contractAddress: z
      .string()
      .optional()
      .describe("Contract address for ABI auto-fetch (enables decoded results)"),
    abiPath: z.string().optional().describe("Local path to .abi.json file"),
    network: z
      .enum(["mainnet", "testnet", "devnet"])
      .optional()
      .describe("Network (default: mainnet)"),
  },
  async ({ txHash, contractAddress, abiPath, network }) => {
    try {
      const result = await getTransactionResult({
        txHash,
        contractAddress,
        abiPath,
        network,
      });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_decode ─────────────────────────────────────────────────────────
server.tool(
  "mvx_sc_decode",
  "Decode a hex-encoded value using a type definition from a contract's ABI. Useful for interpreting raw storage values or transaction data.",
  {
    hex: z
      .string()
      .describe("Hex-encoded data to decode (with or without 0x prefix)"),
    typeName: z
      .string()
      .describe("Name of the type from the ABI (e.g., PriceObservation, EsdtTokenPayment)"),
    address: z
      .string()
      .optional()
      .describe("Contract address for ABI auto-fetch"),
    abiPath: z.string().optional().describe("Local path to .abi.json file"),
    network: z
      .enum(["mainnet", "testnet", "devnet"])
      .optional()
      .describe("Network (default: mainnet)"),
  },
  async ({ hex, typeName, address, abiPath, network }) => {
    try {
      const result = await decodeValue({
        hex,
        typeName,
        address,
        abiPath,
        network,
      });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_search ─────────────────────────────────────────────────────────
server.tool(
  "mvx_search",
  "Search for smart contracts by name on the MultiversX network. Returns matching contracts with address, verification status, and metadata. Use this to find contract addresses by name (e.g., 'fees collector', 'router', 'energy factory').",
  {
    query: z
      .string()
      .describe("Search query — contract name or keyword (e.g., 'xExchange router', 'fees collector')"),
    network: z
      .enum(["mainnet", "testnet", "devnet"])
      .optional()
      .describe("Network (default: mainnet)"),
    size: z
      .number()
      .optional()
      .describe("Max results to return (default: 10)"),
  },
  async ({ query, network, size }) => {
    try {
      const result = await searchContracts({ query, network, size });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_transfer ───────────────────────────────────────────────────────
server.tool(
  "mvx_transfer",
  "Send EGLD or ESDT tokens to an address. REQUIRES a wallet (PEM). For simple value transfers — no smart contract interaction.",
  {
    to: z.string().describe("Receiver address (erd1...)"),
    value: z
      .string()
      .optional()
      .describe("EGLD amount in atomic units (1 EGLD = 1000000000000000000)"),
    esdtTransfers: z
      .array(
        z.object({
          token: z.string().describe("Token identifier (e.g., USDC-c76f1f)"),
          nonce: z.number().optional().describe("Token nonce (0 for fungible)"),
          amount: z.string().describe("Amount in atomic units"),
        })
      )
      .optional()
      .describe("ESDT tokens to send"),
    gasLimit: z
      .number()
      .optional()
      .describe("Gas limit (default: auto)"),
    walletPem: z
      .string()
      .optional()
      .describe("Path to PEM wallet file (or set MULTIVERSX_WALLET_PEM env)"),
    network: z
      .enum(["mainnet", "testnet", "devnet"])
      .optional()
      .describe("Network (default: mainnet)"),
  },
  async ({ to, value, esdtTransfers, gasLimit, walletPem, network }) => {
    try {
      const result = await transfer({
        to,
        value,
        esdtTransfers,
        gasLimit,
        walletPem,
        network,
      });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_deploy ─────────────────────────────────────────────────────────
server.tool(
  "mvx_sc_deploy",
  "Deploy a new smart contract. Provide the WASM bytecode path and constructor arguments. REQUIRES a wallet (PEM). Returns the new contract address.",
  {
    wasmPath: z.string().describe("Path to the compiled .wasm file"),
    arguments: z
      .array(z.unknown())
      .optional()
      .describe("Constructor arguments (native values with ABI, hex without)"),
    gasLimit: z
      .number()
      .optional()
      .describe("Gas limit (default: 150000000)"),
    value: z
      .string()
      .optional()
      .describe("EGLD value to send in atomic units (default: 0)"),
    upgradeable: z.boolean().optional().describe("Make contract upgradeable (default: true)"),
    readable: z.boolean().optional().describe("Make contract readable (default: true)"),
    payable: z.boolean().optional().describe("Make contract payable (default: false)"),
    payableBySc: z.boolean().optional().describe("Make contract payable by SC (default: false)"),
    abiPath: z
      .string()
      .optional()
      .describe("Path to .abi.json for constructor argument encoding"),
    walletPem: z
      .string()
      .optional()
      .describe("Path to PEM wallet file (or set MULTIVERSX_WALLET_PEM env)"),
    network: z
      .enum(["mainnet", "testnet", "devnet"])
      .optional()
      .describe("Network (default: mainnet)"),
  },
  async ({ wasmPath, arguments: args, gasLimit, value, upgradeable, readable, payable, payableBySc, abiPath, walletPem, network }) => {
    try {
      const result = await deployContract({
        wasmPath,
        arguments: args || [],
        gasLimit,
        value,
        upgradeable,
        readable,
        payable,
        payableBySc,
        abiPath,
        walletPem,
        network,
      });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_upgrade ────────────────────────────────────────────────────────
server.tool(
  "mvx_sc_upgrade",
  "Upgrade an existing smart contract with new bytecode. REQUIRES a wallet (PEM) of the contract owner.",
  {
    address: z.string().describe("Contract address to upgrade (erd1...)"),
    wasmPath: z.string().describe("Path to the new compiled .wasm file"),
    arguments: z
      .array(z.unknown())
      .optional()
      .describe("Upgrade arguments (native values with ABI, hex without)"),
    gasLimit: z
      .number()
      .optional()
      .describe("Gas limit (default: 150000000)"),
    value: z
      .string()
      .optional()
      .describe("EGLD value to send in atomic units (default: 0)"),
    upgradeable: z.boolean().optional().describe("Keep contract upgradeable (default: true)"),
    readable: z.boolean().optional().describe("Keep contract readable (default: true)"),
    payable: z.boolean().optional().describe("Make contract payable (default: false)"),
    payableBySc: z.boolean().optional().describe("Make contract payable by SC (default: false)"),
    abiPath: z
      .string()
      .optional()
      .describe("Path to .abi.json for upgrade argument encoding"),
    walletPem: z
      .string()
      .optional()
      .describe("Path to PEM wallet file (or set MULTIVERSX_WALLET_PEM env)"),
    network: z
      .enum(["mainnet", "testnet", "devnet"])
      .optional()
      .describe("Network (default: mainnet)"),
  },
  async ({ address, wasmPath, arguments: args, gasLimit, value, upgradeable, readable, payable, payableBySc, abiPath, walletPem, network }) => {
    try {
      const result = await upgradeContract({
        address,
        wasmPath,
        arguments: args || [],
        gasLimit,
        value,
        upgradeable,
        readable,
        payable,
        payableBySc,
        abiPath,
        walletPem,
        network,
      });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_verify ─────────────────────────────────────────────────────────
server.tool(
  "mvx_sc_verify",
  "Verify a deployed smart contract on the MultiversX explorer. Requires the packaged source JSON from a reproducible build and the Docker image tag used. After verification, the explorer shows source code, ABI, and endpoints.",
  {
    address: z.string().describe("Deployed contract address (erd1...)"),
    packagedSrc: z
      .string()
      .describe("Path to the .source.json file from reproducible build (e.g., output-docker/router/router-0.0.0.source.json)"),
    dockerImage: z
      .string()
      .describe("Docker image tag used for the build (e.g., multiversx/sdk-rust-contract-builder:v11.0.0)"),
    walletPem: z
      .string()
      .optional()
      .describe("Path to PEM wallet file (or set MULTIVERSX_WALLET_PEM env)"),
    network: z
      .enum(["mainnet", "testnet", "devnet"])
      .optional()
      .describe("Network (default: mainnet)"),
  },
  async ({ address, packagedSrc, dockerImage, walletPem, network }) => {
    try {
      const result = await verifyContract({
        address,
        packagedSrc,
        dockerImage,
        walletPem,
        network,
      });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_verify_status ──────────────────────────────────────────────────
server.tool(
  "mvx_sc_verify_status",
  "Check the status of a contract verification task. Use the taskId returned by mvx_sc_verify.",
  {
    taskId: z.string().describe("Task ID from mvx_verify response"),
    address: z
      .string()
      .optional()
      .describe("Contract address (for explorer link)"),
    network: z
      .enum(["mainnet", "testnet", "devnet"])
      .optional()
      .describe("Network (default: mainnet)"),
  },
  async ({ taskId, address, network }) => {
    try {
      const result = await checkVerificationStatus({ taskId, address, network });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_wallet_new ─────────────────────────────────────────────────────
server.tool(
  "mvx_wallet_new",
  "Create a new MultiversX wallet (PEM or JSON format). Returns the address and mnemonic.",
  {
    outPath: z.string().describe("Output file path for the wallet (e.g., /path/to/wallet.pem)"),
    format: z
      .enum(["pem", "json"])
      .optional()
      .describe("Wallet format (default: pem)"),
    password: z
      .string()
      .optional()
      .describe("Password for JSON wallet format (required if format is json)"),
  },
  async ({ outPath, format, password }) => {
    try {
      const result = await createWallet({ outPath, format, password });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_wallet_info ────────────────────────────────────────────────────
server.tool(
  "mvx_wallet_info",
  "Get the address from a PEM wallet file.",
  {
    pemPath: z.string().describe("Path to the PEM wallet file"),
  },
  async ({ pemPath }) => {
    try {
      const result = await walletInfo({ pemPath });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_convert ────────────────────────────────────────────────────────
server.tool(
  "mvx_convert",
  "Convert values between formats: bech32, hex, decimal, string, base64. For addresses, strings, numbers, and raw data.",
  {
    value: z.string().describe("The value to convert"),
    from: z.enum(["bech32", "hex", "decimal", "string", "base64"]).describe("Source format"),
    to: z.enum(["bech32", "hex", "decimal", "string", "base64"]).describe("Target format"),
  },
  async ({ value, from, to }) => {
    try {
      const result = await convert({ value, from, to });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_format_amount ──────────────────────────────────────────────────
server.tool(
  "mvx_format_amount",
  "Format token amounts: denominate (raw→human, e.g., 1000000000000000000→1.0 EGLD) or nominate (human→raw, e.g., 1.5→1500000000000000000).",
  {
    value: z.string().describe("The amount to format"),
    decimals: z.number().describe("Token decimals (e.g., 18 for EGLD, 6 for USDC)"),
    operation: z.enum(["denominate", "nominate"]).describe("denominate: raw→human, nominate: human→raw"),
  },
  async ({ value, decimals, operation }) => {
    try {
      const result = await formatAmount({ value, decimals, operation });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_token_info ─────────────────────────────────────────────────────
server.tool(
  "mvx_token_info",
  "Get ESDT/NFT token details — name, ticker, decimals, supply, owner, properties, roles, and price if available.",
  {
    identifier: z.string().describe("Token identifier (e.g., WEGLD-bd4d79, USDC-c76f1f, XOXNO-a25cc0)"),
    network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: mainnet)"),
  },
  async ({ identifier, network }) => {
    try {
      const result = await getTokenInfo({ identifier, network });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_network_config ─────────────────────────────────────────────────
server.tool(
  "mvx_network_config",
  "Get MultiversX network configuration — chain ID, gas parameters, current epoch/round, shard count, account/transaction stats.",
  {
    network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: mainnet)"),
  },
  async ({ network }) => {
    try {
      const result = await getNetworkConfig({ network });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_sign_message ───────────────────────────────────────────────────
server.tool(
  "mvx_sign_message",
  "Sign a message using a PEM wallet. Returns the address, message, and hex signature.",
  {
    message: z.string().describe("The message to sign"),
    walletPem: z.string().optional().describe("Path to PEM wallet file (or set MULTIVERSX_WALLET_PEM env)"),
  },
  async ({ message, walletPem }) => {
    try {
      const result = await signMessage({ message, walletPem });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_verify_sig ─────────────────────────────────────────────────────
server.tool(
  "mvx_verify_sig",
  "Verify a message signature. Checks that the signature matches the address and message.",
  {
    address: z.string().describe("Signer's bech32 address (erd1...)"),
    message: z.string().describe("The signed message"),
    signature: z.string().describe("Hex signature to verify"),
  },
  async ({ address, message, signature }) => {
    try {
      const result = await verifyMessage({ address, message, signature });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_native_auth_decode ─────────────────────────────────────────────
server.tool(
  "mvx_native_auth_decode",
  "Decode a MultiversX native auth token. Shows address, origin, block hash, TTL, extra info, and signature.",
  {
    token: z.string().describe("The encoded native auth token string"),
  },
  async ({ token }) => {
    try {
      const result = await decodeNativeAuth({ token });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_native_auth_generate ───────────────────────────────────────────
server.tool(
  "mvx_native_auth_generate",
  "Generate a MultiversX native auth token. Signs with PEM wallet, fetches latest block hash from the network.",
  {
    origin: z.string().optional().describe("Origin URL (e.g., https://myapp.com, default: localhost)"),
    ttl: z.number().optional().describe("Time to live in seconds (default: 300)"),
    extraInfo: z.record(z.string(), z.unknown()).optional().describe("Extra info to include in the token"),
    walletPem: z.string().optional().describe("Path to PEM wallet file (or set MULTIVERSX_WALLET_PEM env)"),
    network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: mainnet)"),
  },
  async ({ origin, ttl, extraInfo, walletPem, network }) => {
    try {
      const result = await generateNativeAuth({ origin, ttl, extraInfo, walletPem, network });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_sc_simulate ────────────────────────────────────────────────────
server.tool(
  "mvx_sc_simulate",
  "Simulate a smart contract call without sending. Shows what would happen: gas used, return data, events, errors. No gas cost.",
  {
    address: z.string().describe("Contract address (erd1...)"),
    endpoint: z.string().describe("Endpoint function name"),
    arguments: z.array(z.unknown()).optional().describe("Arguments (native values with ABI, hex without)"),
    gasLimit: z.number().optional().describe("Gas limit (default: 50000000)"),
    value: z.string().optional().describe("EGLD value in atomic units (default: 0)"),
    esdtTransfers: z.array(z.object({
      token: z.string().describe("Token identifier"),
      nonce: z.number().optional().describe("Token nonce (0 for fungible)"),
      amount: z.string().describe("Amount in atomic units"),
    })).optional().describe("ESDT token transfers"),
    callerAddress: z.string().optional().describe("Simulated caller address (default: wallet or zero address)"),
    abiPath: z.string().optional().describe("Local path to .abi.json file"),
    walletPem: z.string().optional().describe("Path to PEM wallet (optional for simulation)"),
    network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: mainnet)"),
  },
  async ({ address, endpoint, arguments: args, gasLimit, value, esdtTransfers, callerAddress, abiPath, walletPem, network }) => {
    try {
      const result = await simulateTransaction({
        address, endpoint, arguments: args || [], gasLimit, value, esdtTransfers, callerAddress, abiPath, walletPem, network,
      });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_sc_estimate_gas ────────────────────────────────────────────────
server.tool(
  "mvx_sc_estimate_gas",
  "Estimate gas cost for a smart contract call. Lighter than full simulation.",
  {
    address: z.string().describe("Contract address (erd1...)"),
    endpoint: z.string().describe("Endpoint function name"),
    arguments: z.array(z.unknown()).optional().describe("Arguments"),
    value: z.string().optional().describe("EGLD value in atomic units (default: 0)"),
    esdtTransfers: z.array(z.object({
      token: z.string().describe("Token identifier"),
      nonce: z.number().optional().describe("Token nonce"),
      amount: z.string().describe("Amount in atomic units"),
    })).optional().describe("ESDT token transfers"),
    abiPath: z.string().optional().describe("Local path to .abi.json file"),
    network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: mainnet)"),
  },
  async ({ address, endpoint, arguments: args, value, esdtTransfers, abiPath, network }) => {
    try {
      const result = await estimateGas({
        address, endpoint, arguments: args || [], value, esdtTransfers, abiPath, network,
      });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_sc_build ──────────────────────────────────────────────────────
server.tool(
  "mvx_sc_build",
  "Build a MultiversX smart contract using sc-meta. Compiles the contract WASM, generates ABI. Provide the path to the contract directory (must contain a /meta sub-crate).",
  {
    path: z.string().describe("Path to the contract directory (e.g., /path/to/dex/router)"),
    locked: z.boolean().optional().describe("Require Cargo.lock to be up to date (--locked)"),
    wasmSymbols: z.boolean().optional().describe("Include debug symbols in WASM (--wasm-symbols)"),
    noWasmOpt: z.boolean().optional().describe("Skip wasm-opt optimization (--no-wasm-opt)"),
  },
  async ({ path, locked, wasmSymbols, noWasmOpt }) => {
    try {
      const result = await buildContract({ path, locked, wasmSymbols, noWasmOpt });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_sc_test ───────────────────────────────────────────────────────
server.tool(
  "mvx_sc_test",
  "Run tests for a MultiversX smart contract or project. Uses sc-meta test or falls back to cargo test. Returns pass/fail/ignore counts.",
  {
    path: z.string().describe("Path to the contract or project directory"),
    chainSimulator: z.boolean().optional().describe("Run chain-simulator tests (--chain-simulator)"),
    wasm: z.boolean().optional().describe("Run WASM-level tests (--wasm)"),
    nocapture: z.boolean().optional().describe("Show test stdout/stderr output (--nocapture)"),
  },
  async ({ path, chainSimulator, wasm, nocapture }) => {
    try {
      const result = await runTests({ path, chainSimulator, wasm, nocapture });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_sc_new ────────────────────────────────────────────────────────
server.tool(
  "mvx_sc_new",
  "Create a new MultiversX smart contract from a template. Templates: adder, empty, ping-pong-egld, crypto-zombies.",
  {
    template: z.string().describe("Template name (adder, empty, ping-pong-egld, crypto-zombies)"),
    name: z.string().describe("Name for the new contract"),
    path: z.string().optional().describe("Target directory (default: current directory)"),
  },
  async ({ template, name, path }) => {
    try {
      const result = await createNewContract({ template, name, path });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_sc_proxy ──────────────────────────────────────────────────────
server.tool(
  "mvx_sc_proxy",
  "Generate proxy code for a MultiversX smart contract. Runs 'cargo run proxy' in the contract's meta crate to produce typed proxy bindings.",
  {
    path: z.string().describe("Path to the contract directory (must contain a /meta sub-crate)"),
  },
  async ({ path }) => {
    try {
      const result = await generateProxy({ path });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_sc_compare ────────────────────────────────────────────────────
server.tool(
  "mvx_sc_compare",
  "Compare a local WASM file against a deployed smart contract's code on-chain. Reads both bytecodes and checks if they match. Useful for verifying that a build matches a deployment.",
  {
    wasmPath: z.string().describe("Path to the local .wasm file"),
    address: z.string().describe("Deployed contract address (erd1...)"),
    network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: mainnet)"),
  },
  async ({ wasmPath, address, network }) => {
    try {
      const result = await compareCodehash({ wasmPath, address, network });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_sc_reproducible_build ─────────────────────────────────────────
server.tool(
  "mvx_sc_reproducible_build",
  "Run a reproducible Docker build for a MultiversX smart contract using mxpy. Produces deterministic WASM output for verification. This is a LONG operation (5-10+ minutes).",
  {
    path: z.string().describe("Project root directory"),
    dockerImage: z.string().describe("Docker image tag (e.g., multiversx/sdk-rust-contract-builder:v11.0.0)"),
    contract: z.string().optional().describe("Specific contract name (for multi-contract projects)"),
    noWasmOpt: z.boolean().optional().describe("Skip wasm-opt optimization"),
  },
  async ({ path, dockerImage, contract, noWasmOpt }) => {
    try {
      const result = await reproducibleBuild({ path, dockerImage, contract, noWasmOpt });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── mvx_setup ──────────────────────────────────────────────────────────
server.tool(
  "mvx_setup",
  "IMPORTANT: Call this tool FIRST before using any other MultiversX tool. It configures permissions so read-only tools work without confirmation prompts. Ask the user to choose: 'safe' (read-only auto-approved, writes need confirmation) or 'allow-all' (no confirmation — dev/testnet only). Then write the returned permissionsAllow list to the project's .claude/settings.local.json under permissions.allow. If the user tries to use any MultiversX tool and permissions aren't configured yet, suggest running this setup first.",
  {
    mode: z.enum(["safe", "allow-all"]).describe("'safe' = read-only auto-approved, writes need confirmation. 'allow-all' = no confirmation for any tool (dev/testnet only)."),
  },
  async ({ mode }) => {
    try {
      const result = await getSetupConfig({ mode });
      return { content: [{ type: "text", text: safeStringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Register prompts (audit, test, deploy, debug) ─────────────────────
registerPrompts(server);

// ─── Start server ───────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Server error:", err);
  process.exit(1);
});
