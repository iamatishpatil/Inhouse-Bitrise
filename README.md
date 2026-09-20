# 🚀 Inhouse-Bitrise — Setup Guide (Mac)

> A self-hosted CI/CD platform for triggering and monitoring Android & iOS builds, built with Node.js, React, and PostgreSQL.

---

## 📋 Prerequisites

Install the following on your Mac **before** anything else:

### 1. Homebrew (Mac package manager)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Docker Desktop
Download and install from: https://www.docker.com/products/docker-desktop/

> Make sure Docker Desktop is **running** (check the whale icon in your menu bar) before proceeding.

### 3. Node.js (v20+)
```bash
brew install node
```
Verify:
```bash
node -v   # Should be v20 or higher
npm -v
```

### 4. Git
```bash
brew install git
```

---

## 📂 Step 1: Clone the Repository

```bash
git clone https://github.com/YOUR_ORG/Inhouse-Bitrise.git
cd Inhouse-Bitrise
```

> Replace `YOUR_ORG` with your actual GitHub organization or username.

---

## ⚙️ Step 2: Set Up Environment Variables

The project uses environment variables for all secrets. **Never hardcode these.**

### Backend `.env`

Create a file at `backend/.env`:

```bash
touch backend/.env
```

Paste the following into `backend/.env` and fill in the values:

```env
# Server
PORT=5001
NODE_ENV=development

# PostgreSQL (matches docker-compose.yml defaults)
DB_HOST=localhost
DB_PORT=55432
DB_NAME=ddeploy_db
DB_USER=ddeploy
DB_PASSWORD=ddeploy

# JWT Auth — change this to a long random string
JWT_SECRET=change_me_to_a_long_random_secret
JWT_EXPIRES_IN=7d

# Build Runner
RUNNER_ENABLED=true

# Optional: Microsoft Teams webhook for build notifications
TEAMS_WEBHOOK_URL=

# Optional: AWS S3 for artifact storage
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET=

# Optional: Cache and workspace tuning
# DDEPLOY_CACHE_DIR=/Users/yourname/.ddeploy_cache
# DDEPLOY_KEEP_WORKSPACES=5
# DDEPLOY_KEEP_ARTIFACTS=30
```

### Frontend `.env`

Create a file at `frontend/.env`:

```bash
touch frontend/.env
```

Paste:

```env
VITE_API_URL=http://localhost:5002
```

> **Note:** Port `5002` is where the API is exposed via Docker. Port `5001` is the internal container port.

---

## 🐳 Step 3: Start the Full Stack with Docker

From the **root of the project**:

```bash
docker compose up --build
```

This will start 3 services:
| Service | Container | Port |
|---------|-----------|------|
| PostgreSQL DB | `ddeploy-internal-db` | `55432` (external) |
| Node.js API | `ddeploy-internal-api` | `5002` |
| React Frontend | `ddeploy-internal-frontend` | `5174` |

Once you see:
```
✅ PostgreSQL connected successfully
✅ project_secrets initialized
...
```
the backend is ready.

---

## 🌐 Step 4: Open the App

Open your browser and go to:
```
http://localhost:5174
```

You should see the **Inhouse-Bitrise** login page.

---

## 👤 Step 5: Create Your First User (Admin)

The app uses JWT-based auth. You need to register via the API:

```bash
curl -X POST http://localhost:5002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Your Name",
    "email": "you@yourcompany.com",
    "password": "yourpassword"
  }'
```

Then log in at `http://localhost:5174` with those credentials.

---

## 🔧 Step 6: Run Without Docker (Local Dev Mode)

If you prefer to run backend and frontend separately without Docker:

### Start PostgreSQL via Docker only
```bash
docker compose up db
```

### Start Backend
```bash
cd backend
npm install
npm run dev
```
> API runs on: `http://localhost:5001`

### Start Frontend (in a separate terminal)
```bash
cd frontend
npm install
npm run dev
```
> Frontend runs on: `http://localhost:5173`

> ⚠️ Update `frontend/.env` to `VITE_API_URL=http://localhost:5001` when running without Docker.

---

## 🏗️ Step 7: Build for Staging (Docker Compose Staging)

Use the staging compose file for a production-like environment:

```bash
docker compose -f docker-compose.staging.yml up --build
```

The staging stack exposes:
| Service | Port |
|---------|------|
| API | `5002` |
| Web (nginx) | `5174` |

> Set `CORS_ORIGINS`, `JWT_SECRET`, `DB_PASSWORD`, and `VITE_API_URL` via environment variables or a `.env` file before running staging.

---

## 🔨 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS v4, Framer Motion |
| Backend | Node.js 20, Express.js, Socket.IO |
| Database | PostgreSQL 16 |
| DB Client | `pg` (node-postgres) with auto-migration on startup |
| Auth | JWT (JSON Web Tokens) |
| Containerisation | Docker + Docker Compose |
| Build Runner | Native child_process (self-hosted) |
| Artifact Storage | Local filesystem or AWS S3 |

---

## 📁 Project Structure

```
Inhouse-Bitrise/
├── backend/
│   ├── src/
│   │   ├── config/       # DB connection, schema.sql
│   │   ├── controllers/  # Route handlers
│   │   ├── middleware/   # Auth, error handler
│   │   ├── routes/       # API route definitions
│   │   └── services/     # Build runner, socket, AI
│   ├── public/artifacts/ # Generated build artifacts (.apk/.ipa)
│   ├── Dockerfile
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── api/          # Axios client
│   │   ├── components/   # Reusable UI components
│   │   ├── context/      # Auth context
│   │   ├── pages/        # Page-level components
│   │   └── lib/          # Utilities
│   ├── Dockerfile
│   ├── Dockerfile.prod   # Nginx production build
│   └── index.html
├── docker-compose.yml           # Local dev stack
├── docker-compose.staging.yml   # Staging stack
└── .gitignore
```

---

## 🛠️ Useful Commands

| Task | Command |
|------|---------|
| Start full stack | `docker compose up --build` |
| Stop all containers | `docker compose down` |
| Reset DB (wipe all data) | `docker compose down -v` |
| View API logs | `docker logs -f ddeploy-internal-api` |
| View DB logs | `docker logs -f ddeploy-internal-db` |
| Shell into API container | `docker exec -it ddeploy-internal-api sh` |
| Connect to Postgres directly | `psql -h localhost -p 55432 -U ddeploy -d ddeploy_db` |

---

## ❗ Troubleshooting

### Port already in use
```bash
# Find and kill the process on port 5002
lsof -ti:5002 | xargs kill -9
```

### Docker not starting / DB not healthy
```bash
docker compose down -v   # Wipe volumes and start fresh
docker compose up --build
```

### Frontend shows blank page / API errors
- Check `VITE_API_URL` in `frontend/.env` — it must match the running API port.
- Check the API container logs: `docker logs -f ddeploy-internal-api`

### JWT errors / Unauthorized responses
- Make sure `JWT_SECRET` in `backend/.env` is set and non-empty.
- Try logging out and back in to get a fresh token.

---

## 🔐 Security Reminders for Production

- Change `JWT_SECRET` to a long, random string (minimum 32 characters).
- Change `DB_PASSWORD` from the default `ddeploy`.
- Never commit `.env` files — they are already in `.gitignore`.
- Set `NODE_ENV=production` in staging/production deployments.
- Set `CORS_ORIGINS` to only allow your specific frontend domain.

---

## 🟢 PM2 — Running the Backend as a Persistent Service (Without Docker)

Use PM2 when you want the backend to run directly on a Mac/Linux machine (not inside Docker), survive terminal closures, auto-restart on crashes, and start automatically on system reboot.

> Use this setup when deploying on a **dedicated Mac Mini / Linux server** as your self-hosted build runner.

### Install PM2 globally

```bash
npm install -g pm2
```

### Set up your environment

Make sure `backend/.env` is fully configured (see Step 2 above).

### Start the API with PM2

From the **root** of the project:

```bash
pm2 start ecosystem.config.json
```

This uses the included [`ecosystem.config.json`](./ecosystem.config.json) which configures the process as `inhouse-bitrise-api`.

### Verify it's running

```bash
pm2 list
```

You should see:

```
┌─────┬──────────────────────────┬──────┬────────┬──────┐
│ id  │ name                     │ mode │ status │ cpu  │
├─────┼──────────────────────────┼──────┼────────┼──────┤
│ 0   │ inhouse-bitrise-api      │ fork │ online │ 0%   │
└─────┴──────────────────────────┴──────┴────────┴──────┘
```

### Auto-start PM2 on system reboot

```bash
pm2 startup
```

Copy and run the command it outputs (it will look like `sudo env PATH=... pm2 startup ...`).

Then save the current process list:

```bash
pm2 save
```

Now the API will automatically restart after a Mac reboot or server restart.

---

### PM2 with Docker DB (Recommended for self-hosted runner)

Run only the PostgreSQL container via Docker, and the backend via PM2 natively:

**Terminal 1 — Start the DB:**
```bash
docker compose up db
```

**Terminal 2 (or use PM2)— Start the API:**
```bash
pm2 start ecosystem.config.json
```

**Start the Frontend (Vite dev server or nginx):**
```bash
cd frontend && npm run dev
```
> Or build and serve with nginx: `npm run build` and point nginx at `frontend/dist/`.

---

### PM2 Useful Commands

| Task | Command |
|------|---------|
| Start app | `pm2 start ecosystem.config.json` |
| Stop app | `pm2 stop inhouse-bitrise-api` |
| Restart app | `pm2 restart inhouse-bitrise-api` |
| View live logs | `pm2 logs inhouse-bitrise-api` |
| Monitor CPU/RAM | `pm2 monit` |
| Reload without downtime | `pm2 reload inhouse-bitrise-api` |
| Delete from PM2 | `pm2 delete inhouse-bitrise-api` |
| List all processes | `pm2 list` |
| Save process list | `pm2 save` |
| Enable startup on reboot | `pm2 startup` then `pm2 save` |

---

### PM2 Log Files

Logs are written to the `./logs/` directory in the project root:

| File | Contents |
|------|---------|
| `logs/api-out.log` | Standard output (build logs, DB ready messages) |
| `logs/api-error.log` | Errors and crashes |

To watch logs live:
```bash
pm2 logs inhouse-bitrise-api --lines 100
```

---

### When to use PM2 vs Docker

| Scenario | Recommended |
|----------|-------------|
| Quick local dev on Mac | Docker Compose (`docker compose up`) |
| Self-hosted build runner on a Mac Mini | **PM2** (native, faster, direct SDK access) |
| Staging server on a Linux VPS | Docker Compose Staging |
| Production on a Linux server | PM2 + PostgreSQL on Docker |

---

*For issues, open a ticket in this repository's Issues tab.*

