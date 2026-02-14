# Bounce

## Overview

Bounce is a collaborative trading app for active trenchers and passive investors. Trade proposers put up 20% of the position and invite funders to provide the remaining 80%.

**Profit sharing:**

- Proposer gets 20% of profits + 10% carry = 30% total
- Funder gets 70% of profits

**Loss protection:**

- Proposer absorbs losses first (up to their 20%)
- Funder is protected until losses exceed 20%

## Architecture

```
thesis-app/
├── apps/
│   ├── api/          # Fastify backend API
│   └── web/          # Next.js frontend
├── packages/
│   ├── contracts/    # Contract ABIs and addresses
│   └── shared/       # Shared types and utilities
└── src/              # Solidity smart contracts
```

## Prerequisites

- Node.js >= 18
- pnpm >= 8
- A Privy account with App ID (https://dashboard.privy.io)
- Monad RPC access

## Setup

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Configure environment variables:**

   API (`apps/api/.env`):

   ```env
   MONAD_RPC_URL=https://rpc.monad.xyz
   TRADE_ESCROW_FACTORY_ADDRESS=0x...
   USDC_ADDRESS=0x...
   ZERO_X_API_KEY=your-0x-api-key
   PORT=3001
   FRONTEND_URL=http://localhost:3000
   ```

   Web (`apps/web/.env.local`):

   ```env
   NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
   NEXT_PUBLIC_API_URL=http://localhost:3001
   NEXT_PUBLIC_TRADE_ESCROW_FACTORY_ADDRESS=0x...
   NEXT_PUBLIC_USDC_ADDRESS=0x...
   NEXT_PUBLIC_CHAIN_ID=143
   ```

3. **Build packages:**

   ```bash
   pnpm run build
   ```

4. **Run development servers:**

   ```bash
   pnpm run dev
   ```

   This starts:
   - API at http://localhost:3001
   - Web at http://localhost:3000

## Smart Contracts

Deploy contracts using Foundry:

```bash
forge script script/Deploy.s.sol --rpc-url $MONAD_RPC_URL --broadcast
```

After deployment, update the contract addresses in the environment files.

## API Endpoints

| Endpoint                              | Description                                |
| ------------------------------------- | ------------------------------------------ |
| `GET /health`                         | Health check                               |
| `GET /trades`                         | List all trades (optional: `?status=OPEN`) |
| `GET /trades/:escrow`                 | Get trade details                          |
| `GET /trades/user/:address`           | Get user's trades                          |
| `GET /tokens/:address`                | Get token metadata                         |
| `GET /tokens/:token/balance/:account` | Get token balance                          |

## Trade Lifecycle

1. **Create Trade**: Proposer approves USDC → calls `createTradeEscrow`
2. **Fund Trade**: Funder approves USDC → calls `buy` to execute swap
3. **Sell Position**: Proposer or funder calls `sell` to exit position
4. **Withdraw**: Both parties withdraw their respective payouts

## Tech Stack

- **Frontend**: Next.js 14, React 18, TailwindCSS, Framer Motion
- **Backend**: Fastify, Pino logger
- **Blockchain**: viem, Privy, 0x Swap API
- **Contracts**: Solidity, Foundry, Solady

## License

UNLICENSED
