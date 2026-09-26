# 🚀 Production Hosting & Database Deployment Guide

This guide explains how to host your **Robinhood Chain Launchpad** online with a permanent, production-ready database so your tokens, trades, charts, and uploaded logos are never lost.

---

## ❓ Will the "Offline Database" (SQLite) Work on Cloud Hosting?

| Hosting Type | SQLite (`launchpad.db`) Behavior | Cloud PostgreSQL (`DATABASE_URL`) Behavior |
| :--- | :--- | :--- |
| **Local PC / Laptop** | ✅ Works 100% permanently. Saved to disk. | ✅ Works if PostgreSQL installed. |
| **VPS / Dedicated Server (Docker)** | ✅ Works if mounted with persistent volume. | ✅ Recommended. High performance. |
| **Cloud Hosting (Render, Railway, Vercel, Heroku)** | ⚠️ **Temporary / Ephemeral**. When the server sleeps or restarts, SQLite is reset to default! | 🌟 **100% Permanent & Safe**. Data survives all restarts, deploys, and traffic spikes. |

> **Summary:** Free cloud hosts (Render, Railway, Fly.io, Vercel) use **ephemeral filesystems**. Any file saved locally (like `launchpad.db` or local logo files) gets erased when the container spins down or reboots.
> 
> **The Solution:** We already configured the project with a **Universal Database Layer** (`backend/db.js`). You simply paste a free **PostgreSQL connection string** into your cloud environment variable `DATABASE_URL`, and the server automatically connects, builds tables, and saves everything permanently in the cloud!

---

## 🌟 Method 1: The Easiest Free Cloud Setup (Render + Neon)

This method is **100% Free**, requires **no credit card**, and takes less than 5 minutes.

### Step 1: Get a Free Cloud PostgreSQL Database (Neon)
1. Go to [Neon.tech](https://neon.tech) and sign up (Free forever tier).
2. Click **Create Project** (e.g., `robinhood-launchpad`).
3. On the dashboard, copy the **Connection string** (it looks like this):
   ```text
   postgresql://alex:AbCdEf123@ep-royal-firefly-9988.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Save this string — you will use it as your `DATABASE_URL`.

---

### Step 2: Upload Your Code to GitHub
1. Create a new repository on [GitHub](https://github.com/new) named `robinhood-launchpad`.
2. In your terminal inside `robinhood-launchpad`, push your code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Robinhood Launchpad with 2.0 ETH Target & Uniswap v4"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/robinhood-launchpad.git
   git push -u origin main
   ```

---

### Step 3: Deploy to Render.com (Free Web Service)
1. Go to [Render.com](https://render.com) and log in with your GitHub account.
2. Click **New +** → **Web Service**.
3. Select your `robinhood-launchpad` GitHub repository.
4. Fill in the settings:
   - **Name**: `robinhood-pump` (or any name)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
5. Scroll down to **Environment Variables** and add:
   - Key: `DATABASE_URL`
   - Value: `[Paste your Neon connection string from Step 1]`
   - Key: `ROBINHOOD_RPC_URL`
   - Value: `https://rpc.testnet.chain.robinhood.com`
6. Click **Deploy Web Service**.

🎉 **That's it!** Render will automatically build the server, connect to your cloud database, and provide you with a live URL (e.g. `https://robinhood-pump.onrender.com`). Both the frontend UI, real-time WebSockets, REST APIs, and database will be live together!

---

## 🐳 Method 2: Deploy on VPS or Cloud Server with Docker

If you have a Linux server (Ubuntu/Debian on DigitalOcean, Linode, Hetzner, AWS EC2, or your home server):

1. **Clone the repository onto the server**:
   ```bash
   git clone https://github.com/YOUR_GITHUB_USERNAME/robinhood-launchpad.git
   cd robinhood-launchpad
   ```

2. **Start everything with one command**:
   ```bash
   docker compose up -d
   ```

3. Docker will automatically:
   - Start a persistent PostgreSQL 16 container (`robinhood_postgres`) with dedicated volume storage (`pgdata`).
   - Build and start the Launchpad application container (`robinhood_launchpad_app`).
   - Mount persistent volume `uploads_data` so uploaded token logos are never lost.
   - Expose the app on port `3001`.

4. Access your launchpad at `http://YOUR_SERVER_IP:3001`!

---

## 💻 Method 3: Local Offline Testing (Zero-Setup SQLite)

If you just want to run and test everything on your current Windows machine without creating any cloud accounts:

1. Open PowerShell or Terminal in the project folder:
   ```bash
   cd "C:\Users\Ananda Yoga\.gemini\antigravity\scratch\robinhood-launchpad"
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open your browser at:
   ```text
   http://localhost:3001
   ```
The app will automatically initialize `backend/launchpad.db` (local SQLite) and seed initial tokens for instant testing.

---

## 📁 Key Files Reference

- [package.json](file:///C:/Users/Ananda%20Yoga/.gemini/antigravity/scratch/robinhood-launchpad/package.json): Root scripts for cloud deployment (`npm start`, `postinstall`).
- [backend/server.js](file:///C:/Users/Ananda%20Yoga/.gemini/antigravity/scratch/robinhood-launchpad/backend/server.js): Monolith server hosting frontend, logo uploads, and APIs.
- [backend/db.js](file:///C:/Users/Ananda%20Yoga/.gemini/antigravity/scratch/robinhood-launchpad/backend/db.js): Universal database adapter (Cloud PostgreSQL with SSL + SQLite fallback).
- [Dockerfile](file:///C:/Users/Ananda%20Yoga/.gemini/antigravity/scratch/robinhood-launchpad/Dockerfile): Production container configuration.
- [docker-compose.yml](file:///C:/Users/Ananda%20Yoga/.gemini/antigravity/scratch/robinhood-launchpad/docker-compose.yml): Production Docker Compose with PostgreSQL & persistent volume.
- [render.yaml](file:///C:/Users/Ananda%20Yoga/.gemini/antigravity/scratch/robinhood-launchpad/render.yaml): Render Blueprint for automated cloud setup.
- [.env.example](file:///C:/Users/Ananda%20Yoga/.gemini/antigravity/scratch/robinhood-launchpad/.env.example): Environment variables template.
