# Robinhood Chain Fair Launchpad ("RobinPump")

A decentralized fair-launch bonding curve launchpad engineered specifically for **Robinhood Chain** (an Arbitrum Orbit EVM Layer-2).

Featuring a **2.0 ETH Graduation Target**, automated liquidity seeding into **Uniswap v4**, **Custom Token Logo Image Upload**, and **Configurable Creator & Holder Reflection Taxes**.

---

## 🚀 Key Features

1. **Token Logo Image Upload**:
   * Creators can upload their own token image (PNG, JPG, SVG, WebP, GIF) via drag-and-drop or file picker.
   * Instant thumbnail preview in the creation modal before deployment.
   * Renders high-resolution logos across the feed cards, King of the Hill banner, and trading terminal.
   * Optional fallback emoji support if the creator does not have an image file.

2. **2.0 ETH Bonding Curve Graduation Target**:
   * Calibrated for fast velocity launches: when real ETH raised reaches **2.00 ETH**, trading halts on the bonding curve.
   * Virtual ETH floor: $0.5 \text{ ETH}$ establishing a safe initial price without zero-division.
   * Creator bounty: $0.02 \text{ ETH}$ graduation bonus paid to creator upon hitting the 2.0 ETH milestone.
   * The remaining ~1.98 ETH + 200,000,000 reserved tokens are bundled and sent to Uniswap v4.

3. **Automated Uniswap v4 Singleton Migration & LP Burn**:
   * Uses the **Uniswap v4 PoolManager** architecture.
   * Deploys full-range liquidity via `modifyLiquidity` with native ETH (`address(0)`) and the launched token.
   * LP ownership is minted to `0x000000000000000000000000000000000000dEaD` (or null salt), ensuring liquidity is **permanently and irrevocably locked**.
   * Standard 0.30% fee tier with tickSpacing 60 and zero unverified hooks.

4. **Configurable Creator Royalty & Holder Dividends**:
   * **Choice at Launch**:
     * ⚡ **0% Pure Fair Launch** (0% Dev / 0% Holder)
     * 👑 **Creator Supported** (2% Dev / 0% Holder)
     * 💎 **Diamond Hands Reflection** (0% Dev / 2% Holders)
     * 🛠️ **Custom Split** (0% to 5% Creator / 0% to 5% Holders)
   * **Synthetix-Style Cumulative Dividends**: $O(1)$ gas-efficient reward claims in native ETH without looping.

5. **PC & Mobile Phone Responsive Interface**:
   * Designed with Robinhood's signature **Electric Neon Green & Dark Mode** design system.
   * **Desktop View**: Split terminal with real-time interactive price chart, 2.0 ETH progress bar, instant swap widget, live trade tape, and community chat.
   * **Mobile View**: Bottom navigation bar, touch-first card drawer, compact stats, and dedicated phone viewport simulator.
   * **Built-in Device Switcher**: Toggle between `🔄 Auto`, `💻 PC`, and `📱 Phone` viewports right from the top header!

---

## 📁 Repository Structure

```
robinhood-launchpad/
├── contracts/
│   ├── interfaces/
│   │   └── IERC20.sol                           # Standalone ERC-20 interface
│   ├── RobinhoodToken.sol                       # 1B supply, tax metadata
│   ├── RobinhoodBondingCurve.sol                # 2.0 ETH Target, Virtual AMM, Uniswap v4 trigger
│   ├── RobinhoodUniswapV4MigrationRouter.sol    # Uniswap v4 Singleton PoolManager router & LP burner
│   └── RobinhoodTokenFactory.sol                # Factory registry supporting tax & v4 router
├── backend/
│   ├── db.js                                    # Universal DB adapter (PostgreSQL + SQLite)
│   ├── indexer.js                               # Viem Robinhood Chain event listener
│   ├── server.js                                # Express API, WebSockets & monolith frontend host
│   ├── schema.sql                               # PostgreSQL & TimescaleDB schema
│   └── uploads/                                 # Persistent directory for token logos
├── frontend/
│   ├── index.html                               # Responsive UI with Logo File Upload & v4 labels
│   ├── app.js                                   # Web3 provider, 2.0 ETH AMM math, logo FileReader
│   └── styles.css                               # Robinhood theme styles and animations
├── Dockerfile                                   # Multi-platform production container
├── docker-compose.yml                           # 1-command startup with persistent PostgreSQL
├── render.yaml                                  # 1-click cloud deploy blueprint for Render.com
├── package.json                                 # Root scripts (npm start, postinstall)
├── DEPLOYMENT_GUIDE.md                          # Complete cloud hosting & database guide
├── foundry.toml                                 # Foundry deployment config for Robinhood Chain Testnet
└── README.md                                    # Project documentation
```

---

## 🌐 Production Hosting & Database Deployment

For a detailed step-by-step walkthrough on hosting online with persistent PostgreSQL (Neon, Render, Railway, or Docker), see the [Deployment Guide](file:///C:/Users/Ananda%20Yoga/.gemini/antigravity/scratch/robinhood-launchpad/DEPLOYMENT_GUIDE.md).

### Quick Start (Local Full-Stack Server)
```bash
cd "C:\Users\Ananda Yoga\.gemini\antigravity\scratch\robinhood-launchpad"
npm install
npm start
```
Access the application at `http://localhost:3001`!

### Quick Start (Docker Compose with PostgreSQL)
```bash
docker compose up -d
```
All-in-one containerization with PostgreSQL 16 and persistent volumes on `http://localhost:3001`.

