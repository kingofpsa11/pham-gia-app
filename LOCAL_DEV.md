# Local development (Windows)

Phạm Gia Business Management System — run frontend and Express API on your machine while MySQL stays on the VPS (via SSH tunnel only).

## Prerequisites

| Tool | Status check |
|------|----------------|
| Node.js LTS | `node -v` |
| npm | `npm -v` |
| Git | `git --version` |
| OpenSSH | `ssh -V` |

Install Node.js (includes npm): https://nodejs.org/

Install Git: https://git-scm.com/download/win

OpenSSH client is usually built into Windows 10/11. If `ssh` is missing:

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
```

## One-time setup

1. Copy environment file:

   ```powershell
   copy .env.example .env
   ```

2. Edit `.env` and set `DB_PASSWORD` to the real `phamgia_user` password (from your VPS setup).

3. Install dependencies:

   ```powershell
   npm install
   ```

## Run (three terminals)

**Terminal 1 — SSH tunnel (keep open)**

```powershell
ssh -L 3307:localhost:3306 root@165.22.98.160
```

**Terminal 2 — API server**

```powershell
npm run server
```

**Terminal 3 — Vite frontend**

```powershell
npm run dev
```

## Test

| What | URL |
|------|-----|
| Backend health | http://localhost:3000/api/health |
| Backend tables | http://localhost:3000/api/tables |
| Frontend | http://localhost:5173 |
| Login page | http://localhost:5173/login |

Login API (curl or Postman):

```powershell
curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"your@email.com\",\"password\":\"your-password\"}"
```

Proxied through Vite (same origin as frontend):

```text
http://localhost:5173/api/health
```

## Troubleshooting

**404 on `/api/phieu-giao-hang` or `/api/phieu-giao-hang-by`**

Node does not reload the API when `server/` files change. Stop the old process and start again:

```powershell
# Find PID on port 3000 (Windows)
netstat -ano | findstr ":3000"
Stop-Process -Id <PID> -Force
npm run server
```

When the server starts correctly you should see log lines for `PGH:` and `PGH/HĐ`. Test:

```powershell
Invoke-RestMethod "http://localhost:3000/api/phieu-giao-hang?page=1&limit=10"
Invoke-RestMethod "http://localhost:3000/api/phieu-giao-hang-by?hop_dong_id=54"
```

## Notes

- Do not expose MySQL port 3306 on the public internet; use the tunnel only.
- Auth và API chạy hoàn toàn qua Express + MySQL (không dùng Supabase).
- Production VPS files are not modified by this repo’s `server/` folder.
