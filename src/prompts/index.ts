import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";

// Resolve skills/ directory: try relative to __dirname (dist/prompts/), fallback to cwd
function getSkillsDir(): string {
  // __dirname = dist/prompts/ → ../../skills/
  return join(__dirname, "..", "..", "skills");
}

function loadSkill(filename: string, replacements?: Record<string, string>): string {
  const skillsDir = getSkillsDir();
  let content = readFileSync(join(skillsDir, filename), "utf-8");
  if (replacements) {
    for (const [key, value] of Object.entries(replacements)) {
      content = content.replaceAll(`{{${key}}}`, value);
    }
  }
  return content;
}

export function registerPrompts(server: McpServer) {

  // ─── Main Orchestrator ──────────────────────────────────────────────────
  server.prompt(
    "mvx",
    "MultiversX SC development assistant — shows all available capabilities and guides you to the right workflow.",
    {},
    async () => ({
      messages: [{
        role: "user",
        content: { type: "text", text: loadSkill("mvx-orchestrator.md") }
      }]
    })
  );

  // ─── On-Chain SC Audit ──────────────────────────────────────────────────
  server.prompt(
    "mvx_audit_onchain",
    "Audit a deployed MultiversX smart contract using on-chain data. Queries views, reads storage, checks properties, and analyzes the ABI for vulnerabilities.",
    {
      address: z.string().describe("Contract address to audit (erd1...)"),
      network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: mainnet)")
    },
    async ({ address, network }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: loadSkill("mvx-audit-onchain.md", {
            address,
            network: network || "mainnet"
          })
        }
      }]
    })
  );

  // ─── Source Code SC Audit ───────────────────────────────────────────────
  server.prompt(
    "mvx_audit_source",
    "Audit MultiversX smart contract source code. Full vulnerability analysis with patterns A-M, access control, ESDT safety, async callbacks, storage lifecycle.",
    {
      path: z.string().optional().describe("Path to contract source directory (default: current directory)")
    },
    async ({ path }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: loadSkill("mvx-audit-source.md", {
            path: path || "."
          })
        }
      }]
    })
  );

  // ─── Test Deployed Contract ─────────────────────────────────────────────
  server.prompt(
    "mvx_test_contract",
    "Automated testing of a deployed MultiversX smart contract. Queries all views, reads storage, simulates calls, and generates a test report.",
    {
      address: z.string().describe("Contract address (erd1...)"),
      network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: mainnet)")
    },
    async ({ address, network }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: loadSkill("mvx-test-contract.md", {
            address,
            network: network || "mainnet"
          })
        }
      }]
    })
  );

  // ─── Deploy & Verify Flow ──────────────────────────────────────────────
  server.prompt(
    "mvx_deploy_flow",
    "Guided smart contract deployment workflow: build, deploy, verify, and test.",
    {
      wasmPath: z.string().describe("Path to .wasm file"),
      abiPath: z.string().optional().describe("Path to .abi.json"),
      network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: testnet)")
    },
    async ({ wasmPath, abiPath, network }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: loadSkill("mvx-deploy-flow.md", {
            wasmPath,
            abiPath: abiPath || "not provided",
            network: network || "testnet"
          })
        }
      }]
    })
  );

  // ─── Debug Transaction ─────────────────────────────────────────────────
  server.prompt(
    "mvx_debug_tx",
    "Debug a MultiversX transaction — decode results, events, and identify why it failed.",
    {
      txHash: z.string().describe("Transaction hash to debug"),
      network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: mainnet)")
    },
    async ({ txHash, network }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: loadSkill("mvx-debug-tx.md", {
            txHash,
            network: network || "mainnet"
          })
        }
      }]
    })
  );

  // ─── Upgrade Flow ─────────────────────────────────────────────────────
  server.prompt(
    "mvx_upgrade_flow",
    "Guided smart contract upgrade workflow with pre/post verification, mainnet safety confirmation, and diff review.",
    {
      address: z.string().describe("Contract address to upgrade (erd1...)"),
      wasmPath: z.string().describe("Path to the new compiled .wasm file"),
      abiPath: z.string().optional().describe("Path to .abi.json (for ABI diff review)"),
      network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: testnet)")
    },
    async ({ address, wasmPath, abiPath, network }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: loadSkill("mvx-upgrade-flow.md", {
            address,
            wasmPath,
            abiPath: abiPath || "not provided",
            network: network || "testnet"
          })
        }
      }]
    })
  );

  // ─── Token Management ─────────────────────────────────────────────────
  server.prompt(
    "mvx_token_management",
    "Inspect, issue, and manage ESDT tokens — query info, check roles, troubleshoot transfers, and understand token issuance flows.",
    {
      network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: mainnet)")
    },
    async ({ network }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: loadSkill("mvx-token-management.md", {
            network: network || "mainnet"
          })
        }
      }]
    })
  );
}
