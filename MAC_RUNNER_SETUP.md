# 🏠 Mac Laptop Backup Runner — Complete Setup Guide

> **Purpose**: This guide sets up your Mac Laptop as a **backup CI/CD build runner** for Inhouse-Bitrise.
> When the office Mac Mini loses power → start the laptop runner in seconds and builds continue without interruption.
>
> **Key Rule**: Only ONE runner active at a time. You start/stop manually. Zero automation, zero risk.

---

## ⚙️ Architecture Overview

```
┌──────────────────────────────────────────────────┐
│              CLOUD SERVER (Always Online)         │
│  • PostgreSQL Database                            │
│  • Inhouse-Bitrise API (port 5002)                │
│  • Frontend UI (port 5174)                        │
└──────────────────┬───────────────────────────────┘
                   │ PostgreSQL LISTEN/NOTIFY
         ┌─────────┴──────────┐
┌────────▼─────────┐  ┌───────▼────────────┐
│  OFFICE MAC MINI │  │  MAC LAPTOP         │
│  (PRIMARY)       │  │  (BACKUP/FAILOVER)  │
│  PM2 ✅ ACTIVE   │  │  PM2 ❌ STOPPED     │
│  port 5099       │  │  port 5099          │
└──────────────────┘  └─────────────────────┘
```

**When power cuts happen:**
1. Mac Mini dies → builds get stuck as `running` or queue up as `pending`
2. You open laptop → run ONE command → runner starts
3. Runner auto-cleans stuck builds → picks up the queue → builds resume

---

## 📋 PHASE 1: One-Time Setup (Do This Before Any Power Cut)

### Step 1.1 — Install Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After install, follow the **"Next steps"** shown in the terminal (usually adding Homebrew to PATH):

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc
source ~/.zshrc
brew --version    # Expected: Homebrew 4.x.x
```

---

### Step 1.2 — Install Node.js v18

```bash
brew install node@18
echo 'export PATH="/opt/homebrew/opt/node@18/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
node --version    # Expected: v18.x.x
npm --version     # Expected: 10.x.x
```

---

### Step 1.3 — Install PM2 (Process Manager)

PM2 keeps your runner alive in the background and auto-restarts it if it crashes.

```bash
npm install -g pm2
pm2 --version     # Expected: 5.x.x
```

---

### Step 1.4 — Install Git

```bash
brew install git
git --version     # Expected: git version 2.x.x
```

Set global Git config (match your office Mac Mini settings):

```bash
git config --global user.name "Your Name"
git config --global user.email "you@yourcompany.com"
git config --global http.sslverify false
```

---

### Step 1.5 — Install Flutter SDK

```bash
brew install --cask flutter
```

If the above fails, use manual install:

```bash
cd ~/development
git clone https://github.com/flutter/flutter.git -b stable
echo 'export PATH="$HOME/development/flutter/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Verify:

```bash
flutter --version    # Expected: Flutter 3.x.x stable
flutter doctor       # No critical errors should appear
```

Accept Android licenses:

```bash
flutter doctor --android-licenses
# Press 'y' to accept all
```

---

### Step 1.6 — Install Xcode (For iOS Builds)

> ⚠️ This downloads ~7 GB. Do on good WiFi.

1. Open **App Store** → search **Xcode** → Install
2. After install, run:

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
sudo xcodebuild -license accept
xcodebuild -version    # Expected: Xcode 15.x (or match office version)
```

---

### Step 1.7 — Install Java 17 (For Android Builds)

```bash
brew install openjdk@17
echo 'export JAVA_HOME="$(brew --prefix openjdk@17)"' >> ~/.zshrc
echo 'export PATH="$JAVA_HOME/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
java -version    # Expected: openjdk version "17.x.x"
```

---

### Step 1.8 — Install Android Studio + SDK (For Android Builds)

```bash
brew install --cask android-studio
```

1. Open **Android Studio** → complete the setup wizard (installs Android SDK)
2. Set SDK path:

```bash
echo 'export ANDROID_HOME="$HOME/Library/Android/sdk"' >> ~/.zshrc
echo 'export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$ANDROID_HOME/platform-tools:$PATH"' >> ~/.zshrc
source ~/.zshrc
adb --version    # Expected: Android Debug Bridge version 1.x.x
```

---

### Step 1.9 — Install Ruby, CocoaPods, and Fastlane (For iOS Builds)

```bash
brew install rbenv ruby-build
rbenv install 3.2.2
rbenv global 3.2.2
echo 'eval "$(rbenv init - zsh)"' >> ~/.zshrc
source ~/.zshrc
ruby --version    # Expected: ruby 3.2.2
```

Install CocoaPods and Fastlane:

```bash
gem install cocoapods fastlane
pod --version         # Expected: 1.x.x
fastlane --version    # Expected: 2.x.x
```

---

### Step 1.10 — Clone the Repository

Use your company's GitHub Personal Access Token (PAT) in the URL:

```bash
cd ~/Desktop
git clone https://YOUR_GITHUB_PAT@github.com/YOUR_ORG/Inhouse-Bitrise.git inhouse-bitrise-laptop
cd inhouse-bitrise-laptop/backend
npm install
```

> Replace `YOUR_GITHUB_PAT` and `YOUR_ORG` with your actual PAT and GitHub organization name.

---

### Step 1.11 — Create the Backend `.env` File

> ⚠️ This file is gitignored — it does NOT exist in the repo. You must create it manually.

```bash
nano ~/Desktop/inhouse-bitrise-laptop/backend/.env
```

Paste in the following (fill in values matching your office Mac Mini's `.env`):

```env
NODE_ENV=production
PORT=5099

# Cloud PostgreSQL — same DB as office Mac Mini
DB_HOST=<YOUR_CLOUD_SERVER_IP>
DB_PORT=5432
DB_NAME=inhouse_bitrise_db
DB_USER=inhouse-bitrise
DB_PASSWORD=<YOUR_DB_PASSWORD>

# Auth
JWT_SECRET=<YOUR_JWT_SECRET>

# Runner settings
RUNNER_ENABLED=true
MASTER_URL=http://<YOUR_CLOUD_SERVER_IP>:5002

# Optional: Gemini AI
GEMINI_API_KEY=<YOUR_GEMINI_KEY>

# Disk hygiene
INHOUSE_BITRISE_REUSE_WORKSPACE=true
INHOUSE_BITRISE_KEEP_WORKSPACES=5
INHOUSE_BITRISE_KEEP_ARTIFACTS=30
RUNNER_CAPACITY=1
```

Save: Press `Ctrl+X` → `Y` → `Enter`

Verify:

```bash
cat ~/Desktop/inhouse-bitrise-laptop/backend/.env
# Should print all your env variables correctly
```

---

### Step 1.12 — Set Up PM2 Ecosystem Config

Create a PM2 config file so you never have to remember the exact `pm2 start` command:

```bash
cat > ~/Desktop/inhouse-bitrise-laptop/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'inhouse-bitrise-runner',
      script: 'server.js',
      cwd: '/Users/YOUR_MAC_USERNAME/Desktop/inhouse-bitrise-laptop/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/Users/YOUR_MAC_USERNAME/.pm2/logs/inhouse-bitrise-runner-error.log',
      out_file: '/Users/YOUR_MAC_USERNAME/.pm2/logs/inhouse-bitrise-runner-out.log',
    },
  ],
};
EOF
```

> Replace `YOUR_MAC_USERNAME` with the output of `whoami` in your terminal.

Test the config parses correctly:

```bash
cd ~/Desktop/inhouse-bitrise-laptop
pm2 start ecosystem.config.js --no-daemon 2>&1 | head -5
pm2 stop inhouse-bitrise-runner
pm2 delete inhouse-bitrise-runner
```

---

### Step 1.13 — PM2 Startup (Auto-Recover After Laptop Reboot)

This makes PM2 survive a laptop restart automatically:

```bash
pm2 startup
```

> ⚠️ PM2 will print a `sudo env ...` command. **Copy and run that exact command** in your terminal.

Example output:

```
[PM2] Init System found: launchd
[PM2] To setup the Startup Script, copy/paste the following command:
sudo env PATH=$PATH:/opt/homebrew/opt/node@18/bin /opt/homebrew/lib/node_modules/pm2/bin/pm2 startup launchd -u yourname --hp /Users/yourname
```

Run that printed command exactly, then:

```bash
pm2 save    # Saves the current process list so PM2 restores it on reboot
```

---

## ✅ PHASE 2: Pre-Flight Checks (Do Before Any Real Power Cut)

### Check 2.1 — Network Connectivity to Cloud Server

```bash
# Test DB port
nc -zv <YOUR_CLOUD_SERVER_IP> 5432
# Expected: Connection to <IP> port 5432 succeeded!

# Test API port
curl -s http://<YOUR_CLOUD_SERVER_IP>:5002/health
# Expected: {"status":"ok"} or similar JSON
```

If these fail → your current network blocks those ports. Switch to mobile hotspot.

---

### Check 2.2 — Database Connectivity

Install `psql` if you don't have it:

```bash
brew install postgresql@16
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Connect:

```bash
psql -h <YOUR_CLOUD_SERVER_IP> -p 5432 -U inhouse-bitrise -d inhouse_bitrise_db -c "SELECT COUNT(*) FROM builds;"
# Enter your DB password when prompted
# Expected: returns a number (total builds in system)
```

---

### Check 2.3 — Environment Loads Correctly

```bash
cd ~/Desktop/inhouse-bitrise-laptop/backend
node -e "require('dotenv').config(); console.log('DB_HOST:', process.env.DB_HOST); console.log('RUNNER_ENABLED:', process.env.RUNNER_ENABLED);"
# Expected:
# DB_HOST: <YOUR_CLOUD_SERVER_IP>
# RUNNER_ENABLED: true
```

---

### Check 2.4 — Toolchain Health

```bash
flutter doctor          # No critical issues
java -version           # openjdk 17.x.x
adb --version           # Android Debug Bridge 1.x.x
pod --version           # CocoaPods 1.x.x
fastlane --version      # fastlane 2.x.x
xcodebuild -version     # Xcode 15.x
```

---

### Check 2.5 — Dry Run (START and STOP the runner safely)

> ⚠️ First stop the office Mac Mini runner, do this test, then restart the office runner.

On **office Mac Mini** — stop temporarily:
```bash
pm2 stop inhouse-bitrise-runner
```

On **Mac Laptop** — start in foreground to see output:
```bash
cd ~/Desktop/inhouse-bitrise-laptop/backend
node server.js
```

Expected output within 10 seconds:
```
✅ PostgreSQL connected successfully
🚀 Inhouse-Bitrise API is running on port 5099
👷 Runner [MacBook-Pro.local-XXXXX] starting in PUSH mode (LISTEN/NOTIFY)
🧹 Cleaned up 0 stuck 'running' builds.
📡 Subscribed to new_build / new_deploy / new_testflight / abort_build
```

The `Subscribed to new_build` line confirms the runner is live.

Stop: `Ctrl+C`

On **office Mac Mini** — restart:
```bash
pm2 start inhouse-bitrise-runner
```

---

## 🚨 PHASE 3: Emergency Runbook (When Power Cut Happens)

> Do this the moment you notice office power is out and builds are failing.

```bash
# 1. Go to project folder
cd ~/Desktop/inhouse-bitrise-laptop/backend

# 2. Pull latest code (in case backend changed since last sync)
git pull origin main
npm install        # Only needed if package.json changed

# 3. Start the runner
pm2 start ecosystem.config.js

# 4. Watch logs to confirm it started
pm2 logs inhouse-bitrise-runner --lines 30
```

**Expected output:**
```
✅ PostgreSQL connected successfully
👷 Runner [MacBook-Pro.local-XXXXX] starting in PUSH mode (LISTEN/NOTIFY)
🧹 Cleaned up X stuck 'running' builds.   ← auto-fixed Mac Mini's stuck builds
📡 Subscribed to new_build / ...
```

Open `http://<YOUR_CLOUD_SERVER_IP>:5174` → verify builds are running again. ✅

---

## 🔄 PHASE 4: Switching Back (When Office Power Returns)

> ⚠️ Wait for any in-progress build on the laptop to FINISH before stopping.

```bash
# Watch logs to confirm no build is mid-run
pm2 logs inhouse-bitrise-runner -f
# Wait until you see "🎉 BUILD SUCCESSFUL!" or "❌ Build failed"

# Then stop and clean up laptop runner
pm2 stop inhouse-bitrise-runner
pm2 delete inhouse-bitrise-runner
```

On **office Mac Mini** — restart:
```bash
pm2 start inhouse-bitrise-runner
pm2 logs inhouse-bitrise-runner --lines 20    # Confirm Subscribed line appears
```

---

## 📊 Quick Reference Card

| Task | Command (Mac Laptop) |
|------|---------------------|
| **Start runner** | `cd ~/Desktop/inhouse-bitrise-laptop/backend && pm2 start ecosystem.config.js` |
| **Stop runner** | `pm2 stop inhouse-bitrise-runner && pm2 delete inhouse-bitrise-runner` |
| **Watch live logs** | `pm2 logs inhouse-bitrise-runner -f` |
| **Check status** | `pm2 list` |
| **Pull latest code** | `cd ~/Desktop/inhouse-bitrise-laptop/backend && git pull origin main && npm install` |
| **Restart runner** | `pm2 restart inhouse-bitrise-runner` |
| **Check DB reachable** | `nc -zv <CLOUD_IP> 5432` |

---

## 🔍 PM2 Command Reference (Full List)

| Command | What it does |
|---------|-------------|
| `pm2 start ecosystem.config.js` | Start app using the ecosystem config file |
| `pm2 start server.js --name inhouse-bitrise-runner` | Start app with manual name (no config file) |
| `pm2 list` | Show all PM2-managed processes and their status |
| `pm2 logs inhouse-bitrise-runner` | Show last 15 lines of logs |
| `pm2 logs inhouse-bitrise-runner -f` | Follow live log stream |
| `pm2 logs inhouse-bitrise-runner --lines 50` | Show last 50 log lines |
| `pm2 stop inhouse-bitrise-runner` | Stop the process (keeps it in PM2 registry) |
| `pm2 delete inhouse-bitrise-runner` | Stop + remove from PM2 registry completely |
| `pm2 restart inhouse-bitrise-runner` | Stop + start again (used after config/code changes) |
| `pm2 reload inhouse-bitrise-runner` | Zero-downtime reload (Node.js cluster only) |
| `pm2 save` | Save current process list (persists across reboots) |
| `pm2 startup` | Generate OS-level startup script for auto-start |
| `pm2 kill` | Stop ALL PM2 processes and shut down PM2 daemon |
| `pm2 monit` | Live dashboard showing CPU/memory of all processes |
| `pm2 flush` | Clear all log files |

---

## ⚠️ Important Rules

1. **NEVER run both runners at the same time** — The DB uses `FOR UPDATE SKIP LOCKED` so they won't run the same build twice, but two active runners create race conditions on the heartbeat table.

2. **Always pull before starting** — `git pull origin main && npm install` ensures the laptop has the same build logic as the office Mac Mini.

3. **`.env` is NOT in git** — If deleted, recreate from Step 1.11. Never commit it.

4. **First build is slow** — Flutter/Gradle/CocoaPods caches are cold on the laptop. First build may take 30–60 min. Subsequent builds are much faster.

5. **Stuck builds are auto-cleaned** — When the runner starts, it automatically marks any leftover `running` builds as `failed`. Users re-trigger those builds. This is expected and normal.

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---------|-----|
| `nc -zv <IP> 5432` fails | Switch to mobile hotspot — office/home WiFi may block port 5432 |
| `RUNNER_ENABLED` is not true | Check `.env` file at `backend/.env` |
| `flutter: command not found` | Run `source ~/.zshrc` |
| `pm2: command not found` | Run `npm install -g pm2` |
| iOS build fails with cert error | Fastlane Match PAT may have expired — generate new PAT and update project secrets |
| Build stuck at `running` | Run `pm2 restart inhouse-bitrise-runner` |
| Logs show DB connection error | Check `DB_HOST`, `DB_PASSWORD` in `.env` file match the cloud server values |
