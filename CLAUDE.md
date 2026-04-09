# multiversx-sc-mcp

MCP server for MultiversX smart contract development.

## Project Structure

```
src/
  index.ts              # MCP server — 41 tools + 8 prompts
  core/                 # Provider factory, ABI loader
  tools/                # 41 tool implementations (incl. sc-meta.ts, setup.ts, token-management.ts, batch-transfer.ts, relayed.ts)
  prompts/              # Loads skill files, registers MCP prompts
  utils/                # Shared utilities (networks, validation, fetch, serialize, nonce)
skills/                 # 8 standalone markdown workflow files
```

## Build & Test

```bash
npm install       # installs deps + auto-builds via prepare script
npm run build     # compile TypeScript
npm run dev       # run with tsx (hot reload)
npm start         # run compiled dist/index.js
```

Verify tools register:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

## Architecture

- **Tools** (src/tools/*.ts): Each file exports async functions. Registered in src/index.ts with zod schemas.
- **Prompts** (src/prompts/index.ts): Loads markdown from skills/, substitutes `{{variables}}`, registers as MCP prompts.
- **Skills** (skills/*.md): Standalone workflow files. Can be used via MCP prompts or copied to `.claude/commands/`.
- **Utils** (src/utils/): Shared code — `networks.ts` (URLs, chainId, explorer), `validation.ts` (address check), `fetch.ts` (timeout wrapper), `serialize.ts` (BigInt/Address safe serialization), `nonce.ts` (gateway nonce fetch).

## Key Patterns

- **Nonce**: Local cache with 30s TTL. After sending a tx, nonce increments locally. Re-fetches from gateway after 30s or on cache miss. See `utils/nonce.ts`.
- **Retries**: Gateway nonce fetch retries 2x on 500 errors with exponential backoff.
- **ABI**: Auto-fetched from API for verified contracts (`/accounts/{addr}/verification`), cached in memory. Local path via `abiPath` param.
- **Storage keys**: Treated as mapper names by default. Only `0x`-prefixed strings are treated as raw hex.
- **Timeouts**: All fetch calls use `fetchWithTimeout` (30s default, 120s for verify).
- **Gas**: Default 50M for SC calls, configurable via `MULTIVERSX_DEFAULT_GAS_LIMIT` env var.
- **Mainnet safety**: Skills instruct the agent to ask for explicit user confirmation before any mainnet write operation.

## Adding a New Tool

1. Create `src/tools/my-tool.ts` with exported async function
2. Register in `src/index.ts` with `server.tool("mvx_sc_my_tool", description, zodSchema, handler)`
3. SC-specific tools use `mvx_sc_` prefix, general tools use `mvx_` prefix
4. Use `validateAddress()` on address inputs, `fetchWithTimeout()` for network calls
5. Use `safeStringify()` in the handler (handles BigInt serialization)
6. Run `npm run build` to verify

## Adding a New Skill/Prompt

1. Create `skills/my-skill.md` with `{{variable}}` placeholders
2. Register in `src/prompts/index.ts` using `loadSkill("my-skill.md", { variable: value })`
3. Add cross-references to related skills (Next Steps section)

## Git Workflow

- Push to GitHub: `git add -A && git commit -m "..." && git push`
- **Do NOT publish to npm** — npm publish requires manual token auth and should only be done by the maintainer

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MULTIVERSX_NETWORK` | `mainnet` | Default network |
| `MULTIVERSX_API_URL` | (auto) | Custom API URL |
| `MULTIVERSX_GATEWAY_URL` | (auto) | Custom gateway URL |
| `MULTIVERSX_WALLET_PEM` | (none) | PEM wallet path |
| `MULTIVERSX_DEFAULT_GAS_LIMIT` | `50000000` | Default gas limit |

## Inventory

**41 tools**: mvx_account, mvx_sc_abi, mvx_sc_query, mvx_sc_storage, mvx_sc_storage_keys, mvx_sc_call, mvx_tx_result, mvx_sc_decode, mvx_search, mvx_transfer, mvx_sc_deploy, mvx_sc_upgrade, mvx_sc_verify, mvx_sc_verify_status, mvx_wallet_new, mvx_wallet_info, mvx_convert, mvx_format_amount, mvx_token_info, mvx_network_config, mvx_sign_message, mvx_verify_sig, mvx_native_auth_decode, mvx_native_auth_generate, mvx_sc_simulate, mvx_sc_estimate_gas, mvx_sc_build, mvx_sc_test, mvx_sc_new, mvx_sc_proxy, mvx_sc_compare, mvx_sc_reproducible_build, mvx_setup, mvx_token_issue_fungible, mvx_token_issue_nft, mvx_token_issue_sft, mvx_token_issue_meta_esdt, mvx_token_create_nft, mvx_batch_transfer_egld, mvx_batch_transfer_tokens, mvx_relayed_transaction

**8 prompts**: mvx, mvx_audit_onchain, mvx_audit_source, mvx_test_contract, mvx_deploy_flow, mvx_upgrade_flow, mvx_debug_tx, mvx_token_management