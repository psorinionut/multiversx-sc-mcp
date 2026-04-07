import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer) {

  // ─── On-Chain SC Audit ──────────────────────────────────────────────────
  server.prompt(
    "mvx_audit_onchain",
    "Audit a deployed MultiversX smart contract using on-chain data. Queries views, reads storage, checks properties, and analyzes the ABI for vulnerabilities.",
    { address: z.string().describe("Contract address to audit (erd1...)"), network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: mainnet)") },
    async ({ address, network }) => {
      const net = network || "mainnet";
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `You are a MultiversX smart contract security auditor. Perform a comprehensive on-chain audit of the contract at \`${address}\` on ${net}.

## Phase 1: Reconnaissance (use MCP tools)

1. **Account info**: Use \`mvx_account\` to get owner, properties (upgradeable, payable, readable), deploy info, verification status.

2. **ABI inspection**: Use \`mvx_sc_abi\` to get the full interface. Document:
   - All endpoints with their access control (look for onlyOwner in ABI)
   - All views
   - All events
   - All custom types
   - Constructor and upgrade parameters

3. **Permission matrix**: For each endpoint, classify:
   - Public (anyone can call)
   - Owner-only (#[only_owner])
   - Payable (accepts tokens)
   - Admin (custom role check — may need source to verify)

## Phase 2: State Analysis (use MCP tools)

4. **Query all views**: Use \`mvx_sc_query\` for every view endpoint. Document current state:
   - Configuration values
   - Balances/reserves
   - Token identifiers
   - Counts, indices, flags

5. **Storage inspection**: Use \`mvx_sc_storage\` and \`mvx_sc_storage_keys\` to:
   - Read key storage mappers
   - Look for suspicious values (zero where non-zero expected, max values)
   - Check if state is consistent (e.g., total supply matches sum of parts)

## Phase 3: Vulnerability Analysis

Analyze the ABI and state for these patterns:

**Access Control**:
- Endpoints missing #[only_owner] that modify state
- Public payable endpoints — what tokens can be sent?
- Are there admin functions without role checks?

**Token Safety**:
- Which tokens does the contract manage?
- Are payable endpoints restricted to specific tokens?
- Can unexpected tokens be sent?

**State Consistency**:
- Do balances match expected values?
- Are configuration values within reasonable ranges?
- Is the contract paused/active as expected?

**Properties**:
- Is the contract upgradeable? (owner trust assumption)
- Is it payable? (can receive EGLD directly)
- Is it payable by SC? (cross-contract payments)

**Economic Analysis** (if DeFi):
- Check reserves, rates, fees
- Look for manipulation vectors
- Verify invariants (k = x * y, supply consistency)

## Phase 4: Simulation (use MCP tools)

6. **Simulate critical calls**: Use \`mvx_sc_simulate\` to test:
   - What happens if someone calls each public endpoint?
   - What happens with edge case inputs (0, max values)?
   - Can any public function drain funds or break state?

## Output

Produce a security report with:
1. Contract overview (address, owner, properties, deploy date)
2. Interface summary (endpoints, views, events)
3. Permission matrix
4. Current state summary
5. Findings by severity (Critical/High/Medium/Low)
6. Risk assessment

For each finding:
- Title, severity, category
- Description (what's wrong)
- Evidence (which tool call revealed it)
- Impact (what could go wrong)
- Recommendation

**If you find zero issues, you missed something. Re-check.**`
          }
        }]
      };
    }
  );

  // ─── Source Code SC Audit ───────────────────────────────────────────────
  server.prompt(
    "mvx_audit_source",
    "Audit MultiversX smart contract source code. Full vulnerability analysis with patterns A-M, access control, ESDT safety, async callbacks, storage lifecycle, and DeFi-specific checks.",
    { path: z.string().optional().describe("Path to contract source directory (default: current directory)") },
    async ({ path }) => {
      const contractPath = path || ".";
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `You are a MultiversX smart contract security auditor. Hunt for vulnerabilities in the source code at \`${contractPath}\`.

## Phase 1: Reconnaissance

1. **Map the system**: Identify core logic, value flows, access controls, external dependencies, cross-contract calls.
2. **Enumerate entry points**: Inventory all \`#[endpoint]\`, \`#[view]\`, \`#[payable]\`, \`#[init]\`, \`#[upgrade]\`, \`#[callback]\`. Tag risk: Critical (payable/state-changing), High (admin), Low (read-only).
3. **ESDT tokenomics**: List all tokens managed. Identify roles (Mint, Burn, NFTCreate). Check if TokenIdentifier is hardcoded, stored, or argument-passed.
4. **Async call graph**: Map contract-to-contract calls and callbacks.
5. **Scope**: Is this an upgrade? DeFi? Multi-contract?

## Phase 2: Differential Review (if upgrade)

Check storage layout compatibility, new mappers in upgrade(), removed mappers cleaned, regression risks.

## Phase 3: Bug Pattern Search (A-M)

| ID | Pattern | What It Catches |
|----|---------|-----------------|
| A | Incomplete Balance | Available calc missing storage |
| B | Single-Period Update | Multi-period gap loses data |
| C | Unprotected Removal | Critical items removable |
| D | Removal Orphans Current | Current period stuck |
| E | Permissionless Special | Energy inflation |
| F | Storage Not Cleaned | Old key not in upgrade — CHECK GIT HISTORY |
| G | Unbounded Collection | Gas DoS |
| H | Dead Code | Unnecessary attack surface |
| I | Early Period Blocking | First N periods blocked |
| J | Removal Orphans Multi-Period | K periods inaccessible |
| K | Sync Call Reentrancy | Reentrant call via sync |
| L | Unverified Async Returns | Silent failure on cross-contract call |
| M | Re-initialization | Init callable post-deploy |

Search for each pattern using grep on the source files.

## Phase 4: MultiversX-Specific

- Async callbacks: state NOT auto-reverted on failure. Check CEI pattern.
- ESDT safety: mint/burn limits, token ID verification in payable endpoints.
- Storage: VecMapper/SetMapper iterated? Gas DoS risk.
- Access control: all admin endpoints guarded?
- Math: BigUint for financial math, multiply before divide, zero denominator checks.

## Phase 5: DeFi-Specific (if applicable)

- Flash loan resistance (internal accounting vs live balance)
- Oracle/price feed safety (TWAP vs spot)
- Governance timelocks
- Invariant testing

## Phase 6: Dynamic Verification

- Run \`cargo test\` and document results
- Check WASM build reproducibility
- Score test quality (coverage, negative tests, edge cases)

## Output Format

Pattern Results (A-M): FOUND/CLEAN for each
Test Quality Score: 1-10
Vulnerability Matrix: #, Title, Severity, Category, Remediation, PoC
Finding details for Critical/High with description, impact, PoC, recommendation.

**Zero major issues in DeFi = rare. Re-check.**`
          }
        }]
      };
    }
  );

  // ─── Test Deployed Contract ─────────────────────────────────────────────
  server.prompt(
    "mvx_test_contract",
    "Automated testing of a deployed MultiversX smart contract. Queries all views, reads storage, simulates calls, and generates a test report.",
    { address: z.string().describe("Contract address (erd1...)"), network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: mainnet)") },
    async ({ address, network }) => {
      const net = network || "mainnet";
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `You are a MultiversX smart contract testing agent. Perform comprehensive testing of the contract at \`${address}\` on ${net}.

## Step 1: Discovery
Use \`mvx_sc_abi\` to get the full ABI. List all endpoints and views.

## Step 2: Query All Views
For each view endpoint in the ABI, call \`mvx_sc_query\` and record the result. If a view requires arguments and you don't have them, skip it and note it.

## Step 3: Storage Spot Check
Use \`mvx_sc_storage_keys\` to list storage keys. For important-looking keys, read them with \`mvx_sc_storage\`.

## Step 4: Account State
Use \`mvx_account\` to check balance, owner, properties.

## Step 5: Simulate Public Endpoints
For each public (non-owner) endpoint, use \`mvx_sc_simulate\` to test with default/zero arguments. Document which succeed and which fail (and why).

## Step 6: Report
Generate a test report:
- Contract summary (address, owner, type, endpoints count)
- View results table (endpoint → result)
- Storage summary
- Simulation results table (endpoint → success/failure → reason)
- Issues found (unexpected errors, suspicious values, etc.)
- Overall health assessment`
          }
        }]
      };
    }
  );

  // ─── Deploy & Verify Flow ──────────────────────────────────────────────
  server.prompt(
    "mvx_deploy_flow",
    "Guided smart contract deployment workflow: build, deploy, verify, and test.",
    { wasmPath: z.string().describe("Path to .wasm file"), abiPath: z.string().optional().describe("Path to .abi.json"), network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: testnet)") },
    async ({ wasmPath, abiPath, network }) => {
      const net = network || "testnet";
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Guide me through deploying a smart contract on ${net}.

WASM: ${wasmPath}
ABI: ${abiPath || "not provided"}

## Steps:
1. **Pre-check**: Verify the WASM file exists and check wallet balance with \`mvx_account\`.
2. **Deploy**: Use \`mvx_sc_deploy\` with the WASM path. Show me the contract address and tx hash.
3. **Verify deployment**: Use \`mvx_account\` on the new contract address to confirm it's deployed.
4. **Test**: Use \`mvx_sc_query\` to call a few view endpoints and verify the contract is working.
5. **Verify on explorer** (if source.json available): Use \`mvx_sc_verify\` and monitor with \`mvx_sc_verify_status\`.

Ask me for any missing information (constructor arguments, wallet path, etc.) before proceeding.`
          }
        }]
      };
    }
  );

  // ─── Debug Transaction ─────────────────────────────────────────────────
  server.prompt(
    "mvx_debug_tx",
    "Debug a MultiversX transaction — decode results, events, and identify why it failed.",
    { txHash: z.string().describe("Transaction hash to debug"), network: z.enum(["mainnet", "testnet", "devnet"]).optional().describe("Network (default: mainnet)") },
    async ({ txHash, network }) => {
      const net = network || "mainnet";
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Debug the transaction \`${txHash}\` on ${net}.

## Steps:
1. Use \`mvx_tx_result\` to get the full transaction details (status, sender, receiver, value, SC results, events).
2. If there's a contract address, use \`mvx_sc_abi\` to fetch the ABI for decoding.
3. Decode any hex return data using \`mvx_sc_decode\`.
4. If the transaction failed, explain WHY:
   - Out of gas? Check gas used vs gas limit.
   - SC error? Decode the error message.
   - Wrong arguments? Check against ABI expected types.
   - Access control? Check if caller has permission.
5. If it succeeded, explain what happened:
   - What tokens were transferred?
   - What storage changed?
   - What events were emitted?

Provide a clear explanation of the transaction outcome.`
          }
        }]
      };
    }
  );
}
