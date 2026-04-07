# multiversx-sc-mcp

MCP server for interacting with the MultiversX blockchain. Query smart contracts, read storage, send transactions, deploy contracts, manage wallets, convert data, and more — all ABI-aware with auto-discovery.

**26 tools** for full blockchain and smart contract interaction from AI agents like Claude.

## Features

### Smart Contract Tools (`mvx_sc_*`)

| Tool | Description | Wallet |
|------|-------------|:------:|
| `mvx_sc_query` | Query view/endpoint with ABI encoding/decoding | No |
| `mvx_sc_storage` | Read a storage key (mapper name or hex) | No |
| `mvx_sc_storage_keys` | List all storage keys | No |
| `mvx_sc_abi` | Inspect contract ABI (endpoints, views, types) | No |
| `mvx_sc_decode` | Decode hex data using ABI types | No |
| `mvx_sc_simulate` | Simulate a SC call (gas, results, errors) | No |
| `mvx_sc_estimate_gas` | Estimate gas cost for a SC call | No |
| `mvx_sc_call` | Call a SC endpoint (transaction) | Yes |
| `mvx_sc_deploy` | Deploy a new smart contract | Yes |
| `mvx_sc_upgrade` | Upgrade an existing smart contract | Yes |
| `mvx_sc_verify` | Submit contract verification to explorer | Yes |
| `mvx_sc_verify_status` | Check verification task progress | No |

### General Blockchain Tools (`mvx_*`)

| Tool | Description | Wallet |
|------|-------------|:------:|
| `mvx_account` | Account/contract info (balance, owner, properties) | No |
| `mvx_search` | Search contracts by name on the network | No |
| `mvx_transfer` | Send EGLD or ESDT tokens | Yes |
| `mvx_tx_result` | Get transaction results with decoded outputs | No |
| `mvx_token_info` | ESDT/NFT token details (decimals, supply, roles) | No |
| `mvx_network_config` | Chain config, epoch, gas parameters, stats | No |
| `mvx_convert` | Convert between bech32, hex, decimal, string, base64 | No |
| `mvx_format_amount` | Denominate/nominate token amounts (raw/human) | No |
| `mvx_sign_message` | Sign a message with PEM wallet | Yes |
| `mvx_verify_sig` | Verify a message signature | No |
| `mvx_native_auth_decode` | Decode a native auth token | No |
| `mvx_native_auth_generate` | Generate a native auth token | Yes |
| `mvx_wallet_new` | Create a new wallet (PEM or JSON) | No |
| `mvx_wallet_info` | Get address from a PEM file | No |

### Key Capabilities

- **ABI auto-discovery** — just provide a contract address; ABI is fetched automatically for verified contracts
- **Human-readable I/O** — pass native values, get decoded results
- **Multi-network** — mainnet, testnet, devnet with per-request override
- **Zero config for reads** — no wallet needed for queries, storage, or ABI inspection
- **Safe by default** — write operations require explicit wallet configuration

## Quick Start

### Claude Code

```bash
claude mcp add multiversx-sc -- npx -y multiversx-sc-mcp
```

### Manual Setup

```bash
git clone https://github.com/multiversx/multiversx-sc-mcp.git
cd multiversx-sc-mcp
npm install
```

Then add to your Claude Code, Claude Desktop, or Cursor config:

```json
{
  "mcpServers": {
    "multiversx-sc": {
      "command": "node",
      "args": ["/path/to/multiversx-sc-mcp/dist/index.js"],
      "env": {
        "MULTIVERSX_NETWORK": "mainnet"
      }
    }
  }
}
```

### Global Install

```bash
npm install -g multiversx-sc-mcp
claude mcp add multiversx-sc -- multiversx-sc-mcp
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MULTIVERSX_NETWORK` | `mainnet` | Default network (mainnet, testnet, devnet) |
| `MULTIVERSX_API_URL` | (auto) | Custom API URL (overrides network default) |
| `MULTIVERSX_GATEWAY_URL` | (auto) | Custom gateway URL |
| `MULTIVERSX_WALLET_PEM` | (none) | Path to PEM wallet (for write operations) |

## Usage Examples

### Query a contract view
```
"What are the reserves on the WEGLD/USDC pair?"
→ mvx_sc_query(address, "getReservesAndTotalSupply")
```

### Read contract storage
```
"What's the LP token for pair erd1qqq...?"
→ mvx_sc_storage(address, "lpTokenIdentifier")
```

### Search for a contract
```
"Find the xExchange fees collector"
→ mvx_search("xExchange fees collector")
```

### Get token info
```
"What are the details of WEGLD?"
→ mvx_token_info("WEGLD-bd4d79")
```

### Convert values
```
"Convert erd1qqq... to hex"
→ mvx_convert(value, from: "bech32", to: "hex")
```

### Deploy and verify a contract
```
→ mvx_sc_deploy(wasmPath, abiPath, network: "testnet")
→ mvx_sc_verify(address, packagedSrc, dockerImage, network: "testnet")
→ mvx_sc_verify_status(taskId)
```

### Simulate before sending
```
"Simulate calling addLiquidity on pair erd1qqq..."
→ mvx_sc_simulate(address, "addLiquidity", args, gasLimit)
```

## How ABI Resolution Works

1. If `abiPath` is provided → loads from local file
2. If only `address` is provided → fetches from MultiversX API (`/accounts/{addr}/verification`)
3. If ABI is found → arguments are encoded/decoded automatically
4. If no ABI → raw mode (hex in, hex out)

ABIs are cached in memory for the session duration.

## Architecture

```
src/
├── index.ts                # MCP server setup, 26 tool registrations
├── core/
│   ├── provider.ts         # Network provider factory (mainnet/testnet/devnet)
│   └── abi-loader.ts       # ABI fetch (API auto-discovery + local + cache)
├── tools/
│   ├── query.ts            # mvx_sc_query
│   ├── storage.ts          # mvx_sc_storage, mvx_sc_storage_keys
│   ├── call.ts             # mvx_sc_call
│   ├── deploy.ts           # mvx_sc_deploy, mvx_sc_upgrade
│   ├── verify.ts           # mvx_sc_verify, mvx_sc_verify_status
│   ├── simulate.ts         # mvx_sc_simulate, mvx_sc_estimate_gas
│   ├── abi.ts              # mvx_sc_abi
│   ├── decode.ts           # mvx_sc_decode
│   ├── account.ts          # mvx_account
│   ├── search.ts           # mvx_search
│   ├── transfer.ts         # mvx_transfer
│   ├── tx-result.ts        # mvx_tx_result
│   ├── token-info.ts       # mvx_token_info
│   ├── network-config.ts   # mvx_network_config
│   ├── convert.ts          # mvx_convert, mvx_format_amount
│   ├── sign-message.ts     # mvx_sign_message
│   ├── verify-message.ts   # mvx_verify_sig
│   ├── native-auth.ts      # mvx_native_auth_decode, mvx_native_auth_generate
│   └── wallet.ts           # mvx_wallet_new, mvx_wallet_info
└── utils/
    └── networks.ts         # Network URL constants
```

## Supported Networks

| Network | API | Gateway |
|---------|-----|---------|
| Mainnet | https://api.multiversx.com | https://gateway.multiversx.com |
| Testnet | https://testnet-api.multiversx.com | https://testnet-gateway.multiversx.com |
| Devnet | https://devnet-api.multiversx.com | https://devnet-gateway.multiversx.com |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run build` to verify
5. Submit a pull request

## License

MIT
