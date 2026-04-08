/**
 * Setup tool — returns the recommended permissions configuration.
 * The AI agent uses this to configure auto-approve for read-only tools.
 */

const READ_ONLY_TOOLS = [
  "mcp__multiversx-sc__mvx_account",
  "mcp__multiversx-sc__mvx_sc_abi",
  "mcp__multiversx-sc__mvx_sc_query",
  "mcp__multiversx-sc__mvx_sc_storage",
  "mcp__multiversx-sc__mvx_sc_storage_keys",
  "mcp__multiversx-sc__mvx_tx_result",
  "mcp__multiversx-sc__mvx_sc_decode",
  "mcp__multiversx-sc__mvx_search",
  "mcp__multiversx-sc__mvx_token_info",
  "mcp__multiversx-sc__mvx_network_config",
  "mcp__multiversx-sc__mvx_convert",
  "mcp__multiversx-sc__mvx_format_amount",
  "mcp__multiversx-sc__mvx_verify_sig",
  "mcp__multiversx-sc__mvx_native_auth_decode",
  "mcp__multiversx-sc__mvx_wallet_info",
  "mcp__multiversx-sc__mvx_sc_simulate",
  "mcp__multiversx-sc__mvx_sc_estimate_gas",
  "mcp__multiversx-sc__mvx_sc_verify_status",
  "mcp__multiversx-sc__mvx_sc_compare",
];

const WRITE_TOOLS = [
  "mcp__multiversx-sc__mvx_sc_call",
  "mcp__multiversx-sc__mvx_sc_deploy",
  "mcp__multiversx-sc__mvx_sc_upgrade",
  "mcp__multiversx-sc__mvx_sc_verify",
  "mcp__multiversx-sc__mvx_transfer",
  "mcp__multiversx-sc__mvx_sign_message",
  "mcp__multiversx-sc__mvx_native_auth_generate",
  "mcp__multiversx-sc__mvx_wallet_new",
  "mcp__multiversx-sc__mvx_sc_build",
  "mcp__multiversx-sc__mvx_sc_test",
  "mcp__multiversx-sc__mvx_sc_new",
  "mcp__multiversx-sc__mvx_sc_proxy",
  "mcp__multiversx-sc__mvx_sc_reproducible_build",
];

export async function getSetupConfig(params: {
  mode: "safe" | "allow-all";
}) {
  const { mode } = params;

  const allTools = [...READ_ONLY_TOOLS, ...WRITE_TOOLS];

  if (mode === "allow-all") {
    return {
      mode: "allow-all",
      description: "MultiversX SC MCP — Allow All Tools (no confirmation for any tool)",
      warning: "This allows ALL tools without confirmation, including deploy, upgrade, call, and transfer. Only use this in development/testnet environments.",
      toolCount: allTools.length,
      permissionsAllow: allTools,
    };
  }

  return {
    mode: "safe",
    description: "MultiversX SC MCP — Safe Mode (read-only auto-approved, writes need confirmation)",
    readOnly: {
      count: READ_ONLY_TOOLS.length,
      action: "Auto-approved (no confirmation)",
      examples: "query, storage, abi, search, simulate, decode, convert, token_info, account",
      tools: READ_ONLY_TOOLS,
    },
    writeRequiresConfirmation: {
      count: WRITE_TOOLS.length,
      action: "Requires confirmation each time",
      examples: "deploy, upgrade, call, transfer, sign, wallet_new, build, test",
      tools: WRITE_TOOLS,
    },
    permissionsAllow: READ_ONLY_TOOLS,
  };
}