# CRM Monorepo — Deployment Guide

**Build on Windows → Deploy on Ubuntu 26.04 LTS with Docker Compose**

> **Target:** Single Linux laptop, 50 concurrent users
> **Architecture:** 10 microservice containers + PostgreSQL + Next.js frontend
> **Minimum specs:** 4-core CPU, 8 GB RAM, 40 GB SSD

---

## Table of Contents

- [Phase 1: Build Machine (Windows)](#phase-1-build-machine-windows)
  - [Step 1 — Build all Docker images](#step-1--build-all-docker-images)
  - [Step 2 — Verify images](#step-2--verify-images)
  - [Step 3 — Export images to tarball](#step-3--export-images-to-tarball)
  - [Step 4 — Prepare deployment bundle](#step-4--prepare-deployment-bundle)
  - [Step 5 — Create production .env](#step-5--create-production-env)
  - [Step 6 — Transfer to USB or network](#step-6--transfer-to-usb-or-network)
- [Phase 2: Linux Laptop (Ubuntu 26.04 LTS)](#phase-2-linux-laptop-ubuntu-2604-lts)
  - [Step 7 — Install Docker Engine](#step-7--install-docker-engine)
  - [Step 8 — Create directory structure](#step-8--create-directory-structure)
  - [Step 9 — Load Docker images](#step-9--load-docker-images)
  - [Step 10 — Update docker-compose.yml for pre-built images](#step-10--update-docker-composeyml-for-pre-built-images)
  - [Step 11 — Start the stack](#step-11--start-the-stack)
  - [Step 12 — Verify all containers](#step-12--verify-all-containers)
  - [Step 13 — Test connectivity](#step-13--test-connectivity)
  - [Step 14 — Configure firewall](#step-14--configure-firewall)
- [Phase 3: Ongoing Operations](#phase-3-ongoing-operations)
  - [Common commands](#common-commands)
  - [Updating images](#updating-images)
  - [Auto-start on boot](#auto-start-on-boot)
  - [Backup and restore](#backup-and-restore)
- [Phase 4: Expose to Internet via ngrok](#phase-4-expose-to-internet-via-ngrok)
  - [Step 15 — Install ngrok](#step-15--install-ngrok)
  - [Step 16 — Authenticate ngrok](#step-16--authenticate-ngrok)
  - [Step 17 — Expose the web app](#step-17--expose-the-web-app)
  - [Step 18 — Update API URL for external access](#step-18--update-api-url-for-external-access)
  - [Step 19 — Run ngrok as a background service](#step-19--run-ngrok-as-a-background-service)
  - [ngrok free tier limitations](#ngrok-free-tier-limitations)
- [Quick Reference](#quick-reference)
- [Container Inventory](#container-inventory)
- [Troubleshooting](#troubleshooting)

---

## Phase 1: Build Machine (Windows)

All steps run on your Windows development machine where the source code lives.

### Step 1 — Build all Docker images

Open a terminal in the project root:

```powershell
docker compose build
```

This builds all 12 images (10 services + api-gateway + web). First build takes 5–15 minutes; subsequent builds use layer caching and are faster.

### Step 2 — Verify images

```powershell
docker images | findstr crm
```

Expected output (image names may have a `crm-monorepo-` prefix):

```
crm-monorepo-auth-service
crm-monorepo-users-service
crm-monorepo-leads-service
crm-monorepo-assignments-service
crm-monorepo-analytics-service
crm-monorepo-activities-service
crm-monorepo-communication-service
crm-monorepo-meta-conversion-api
crm-monorepo-notifications-service
crm-monorepo-api-gateway
crm-monorepo-web
```

> **Note:** The `postgres:18.4` image is pulled from Docker Hub, not built locally. You can include it in the export (step 3) to avoid needing internet on the Linux machine, or pull it separately there.

### Step 3 — Export images to tarball

Save all images into a single compressed file:

```powershell
docker save `
  postgres:18.4 `
  crm-monorepo-auth-service `
  crm-monorepo-users-service `
  crm-monorepo-leads-service `
  crm-monorepo-assignments-service `
  crm-monorepo-analytics-service `
  crm-monorepo-activities-service `
  crm-monorepo-communication-service `
  crm-monorepo-meta-conversion-api `
  crm-monorepo-notifications-service `
  crm-monorepo-api-gateway `
  crm-monorepo-web `
  | gzip > crm-images.tar.gz
```

Resulting file will be approximately 1.5–2.5 GB.

> **Important:** Verify exact image names from `docker images` output before running this command. If names differ, substitute accordingly.

### Step 4 — Prepare deployment bundle

Create a deployment folder with everything the Linux machine needs:

```
crm-deploy/
├── crm-images.tar.gz          # Docker images from step 3
├── docker-compose.yml          # From project root
├── .env                        # Production version (step 5)
└── db_scripts/
    └── 01_init-db.sql          # Database schema initialization
```

Copy the files:

```powershell
mkdir crm-deploy
mkdir crm-deploy\db_scripts

copy crm-images.tar.gz crm-deploy\
copy docker-compose.yml crm-deploy\
copy db_scripts\01_init-db.sql crm-deploy\db_scripts\
```

The `.env` file is created in the next step.

### Step 5 — Create production .env

Copy `.env.example` to `crm-deploy/.env` and update these values:

```env
# ─────────────────────────────────────────────────────────────────────────────
# PostgreSQL
# ─────────────────────────────────────────────────────────────────────────────
DB_NAME=crm
DB_HOST=localhost
DB_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<STRONG-RANDOM-PASSWORD>

DB_CONTAINER_NAME=crm-db-server

# IMPORTANT: Use a Linux path (not a Windows path)
DB_DATA_PATH=/opt/crm/data/postgres

# Service-role credentials — MUST match what 01_init-db.sql creates
DB_LEAD_SVC_USER=lead_svc
DB_LEAD_SVC_PASSWORD=<STRONG-PASSWORD>
DB_TENANT_SVC_USER=tenant_dash_svc
DB_TENANT_SVC_PASSWORD=<STRONG-PASSWORD>
DB_SERVICE_USER=crm_service
DB_SERVICE_PASSWORD=<STRONG-PASSWORD>

# Composed DATABASE_URLs (overridden by docker-compose for container networking)
DATABASE_URL=postgres://lead_svc:<LEAD-PWD>@localhost:5432/crm
DATABASE_URL_TENANT=postgres://tenant_dash_svc:<TENANT-PWD>@localhost:5432/crm
DATABASE_URL_SERVICE=postgres://crm_service:<SERVICE-PWD>@localhost:5432/crm

# PostgreSQL pool tuning
PG_MAX=10
PG_IDLE_TIMEOUT=30

# ─────────────────────────────────────────────────────────────────────────────
# Secrets — CHANGE ALL OF THESE
# ─────────────────────────────────────────────────────────────────────────────
JWT_SECRET=<RANDOM-64-CHARACTER-STRING>
INTERNAL_SERVICE_SECRET=<RANDOM-64-CHARACTER-STRING>
WEBHOOK_API_KEY=<RANDOM-KEY>

# Generate secrets with:
#   openssl rand -base64 48

# ─────────────────────────────────────────────────────────────────────────────
# Service ports
# ─────────────────────────────────────────────────────────────────────────────
GATEWAY_PORT=4000
AUTH_SERVICE_PORT=4001
USERS_SERVICE_PORT=4002
LEADS_SERVICE_PORT=4003
ASSIGNMENTS_SERVICE_PORT=4004
ANALYTICS_SERVICE_PORT=4005
ACTIVITIES_SERVICE_PORT=4006
META_SERVICE_PORT=4007
NOTIFICATIONS_SERVICE_PORT=4008
COMMUNICATION_SERVICE_PORT=4009

# ─────────────────────────────────────────────────────────────────────────────
# Environment
# ─────────────────────────────────────────────────────────────────────────────
NODE_ENV=production
BCRYPT_ROUNDS=12

# ─────────────────────────────────────────────────────────────────────────────
# Web app — use the laptop's LAN IP so other machines can reach it
# ─────────────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://<LAPTOP-LAN-IP>:4000
WEB_URL=http://<LAPTOP-LAN-IP>:3000

# ─────────────────────────────────────────────────────────────────────────────
# Communication service (fill if email/WhatsApp is needed)
# ─────────────────────────────────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
SMTP_FROM_NAME=CRM App

INTERAKT_API_KEY=your-interakt-api-key

FOLLOWUP_CHECK_INTERVAL_MS=60000
FOLLOWUP_LOOKAHEAD_MINUTES=5
```

#### Password sync warning

If you change service-role passwords from the defaults, you **must** also update `db_scripts/01_init-db.sql` where the roles are created:

- Line 100: `crm_service` role password (default: `CrmSvc_Dev2025`)
- Search for `lead_svc` and `tenant_dash_svc` roles and update their passwords to match `.env`

The passwords in `.env` and `01_init-db.sql` must be identical — the SQL script creates the database roles, and `.env` provides the connection strings that services use.

### Step 6 — Transfer to USB or network

**Option A — USB drive:**

Copy the entire `crm-deploy/` folder to a USB drive.

**Option B — Network transfer (scp):**

```bash
scp -r crm-deploy/ user@<LAPTOP-IP>:/home/user/
```

---

## Phase 2: Linux Laptop (Ubuntu 26.04 LTS)

All steps run on the target Ubuntu laptop.

### Step 7 — Install Docker Engine

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker and Compose plugin
sudo apt install -y docker.io docker-compose-v2

# Add your user to the docker group (avoids needing sudo for every command)
sudo usermod -aG docker $USER

# Apply group change — log out and back in, OR run:
newgrp docker

# Verify installation
docker --version
docker compose version
```

Expected output:

```
Docker version 27.x.x (or newer)
Docker Compose version v2.x.x
```

### Step 8 — Create directory structure

```bash
# Create application directory and data directory
sudo mkdir -p /opt/crm/data/postgres
sudo mkdir -p /opt/crm/backups
sudo chown -R $USER:$USER /opt/crm

# Copy deployment files from USB
cp -r /media/$USER/<USB_DRIVE>/crm-deploy/* /opt/crm/

# OR from network transfer
cp -r ~/crm-deploy/* /opt/crm/
```

Verify the layout:

```bash
ls -la /opt/crm/
```

Expected:

```
/opt/crm/
├── crm-images.tar.gz
├── docker-compose.yml
├── .env
├── db_scripts/
│   └── 01_init-db.sql
├── data/
│   └── postgres/            ← PostgreSQL data persists here
└── backups/                 ← For database backups
```

### Step 9 — Load Docker images

```bash
cd /opt/crm

# Load all images from the tarball (takes 1–3 minutes)
docker load < crm-images.tar.gz

# Verify all images are loaded
docker images
```

You should see all 12 images (11 application + postgres:18.4) listed in the output.

### Step 10 — Update docker-compose.yml for pre-built images

Since images are pre-built (not built on this machine), replace every `build:` block in `docker-compose.yml` with the corresponding `image:` reference.

**Before (each service looks like this):**

```yaml
auth-service:
  build:
    context: .
    dockerfile: services/auth-service/Dockerfile
  restart: unless-stopped
  ...
```

**After:**

```yaml
auth-service:
  image: crm-monorepo-auth-service
  restart: unless-stopped
  ...
```

Apply this change to **every service** (the `postgres` service already uses `image:` and needs no change):

| Service | Image name |
|---|---|
| `auth-service` | `crm-monorepo-auth-service` |
| `users-service` | `crm-monorepo-users-service` |
| `leads-service` | `crm-monorepo-leads-service` |
| `assignments-service` | `crm-monorepo-assignments-service` |
| `analytics-service` | `crm-monorepo-analytics-service` |
| `activities-service` | `crm-monorepo-activities-service` |
| `communication-service` | `crm-monorepo-communication-service` |
| `meta-conversion-api` | `crm-monorepo-meta-conversion-api` |
| `notifications-service` | `crm-monorepo-notifications-service` |
| `api-gateway` | `crm-monorepo-api-gateway` |
| `web` | `crm-monorepo-web` |

> **Tip:** Confirm exact image names from `docker images` output. Names depend on the project folder name on the build machine.

### Step 11 — Start the stack

```bash
cd /opt/crm

# Start all containers in detached mode
docker compose up -d
```

Docker Compose will:

1. Start PostgreSQL and wait for its healthcheck to pass
2. Start all backend microservices (they depend on postgres being healthy)
3. Start the API gateway (depends on all backend services)
4. Start the Next.js web app (depends on the API gateway)

### Step 12 — Verify all containers

```bash
# Check that all containers are running
docker compose ps
```

Expected: all containers show `Up` status. The postgres container shows `Up (healthy)`.

```bash
# Check for startup errors across all services
docker compose logs --tail=30

# Check a specific service
docker compose logs postgres --tail=20
docker compose logs api-gateway --tail=20
docker compose logs web --tail=20
```

If any container shows `Restarting` or `Exit`, check its logs:

```bash
docker compose logs <service-name> --tail=50
```

### Step 13 — Test connectivity

**From the laptop itself:**

```bash
# Test API gateway
curl http://localhost:4000

# Test web app
curl -I http://localhost:3000
```

**From another machine on the same network:**

1. Find the laptop's LAN IP:

   ```bash
   hostname -I
   ```

2. Open a browser on another machine and navigate to:
   - Web app: `http://<LAPTOP-LAN-IP>:3000`
   - API: `http://<LAPTOP-LAN-IP>:4000`

### Step 14 — Configure firewall

Only expose the two user-facing ports. Internal service ports (4001–4009) and PostgreSQL (5432) stay behind Docker's internal network.

```bash
# Enable firewall if not already active
sudo ufw enable

# Allow web app and API gateway
sudo ufw allow 3000/tcp comment "CRM Web App"
sudo ufw allow 4000/tcp comment "CRM API Gateway"

# Allow SSH if you need remote access
sudo ufw allow 22/tcp comment "SSH"

# Verify rules
sudo ufw status
```

> **Security:** Do NOT expose ports 4001–4009 or 5432. Docker handles inter-container networking internally. Only 3000 (web) and 4000 (API gateway) should be reachable from the LAN.

---

## Phase 3: Ongoing Operations

### Common commands

All commands run from `/opt/crm/`:

```bash
cd /opt/crm

# Start all containers
docker compose up -d

# Stop all containers (preserves data)
docker compose down

# Restart a single service
docker compose restart auth-service

# View live logs (all services)
docker compose logs -f

# View live logs (single service)
docker compose logs -f api-gateway

# Check resource usage (CPU, memory per container)
docker stats
```

### Updating images

When you have new Docker images from the build machine:

```bash
cd /opt/crm

# 1. Stop the stack
docker compose down

# 2. Load new images (overwrites old ones if same tag)
docker load < crm-images-v2.tar.gz

# 3. Start with new images
docker compose up -d

# 4. Verify
docker compose ps

# 5. (Optional) Remove old dangling images to free disk space
docker image prune -f
```

### Auto-start on boot

Docker is enabled by default on Ubuntu. Your containers use `restart: unless-stopped`, which means they auto-start when Docker starts after a reboot.

Verify Docker is set to start on boot:

```bash
sudo systemctl enable docker
sudo systemctl is-enabled docker   # should print "enabled"
```

To test, reboot the laptop and verify:

```bash
sudo reboot

# After reboot:
docker compose -f /opt/crm/docker-compose.yml ps
```

### Backup and restore

#### Database backup

```bash
# Create a timestamped SQL dump
docker exec crm-db-server pg_dump -U postgres crm \
  > /opt/crm/backups/crm_$(date +%Y%m%d_%H%M%S).sql
```

#### Database restore

```bash
# Restore from a backup file
cat /opt/crm/backups/crm_20260624_120000.sql \
  | docker exec -i crm-db-server psql -U postgres crm
```

#### Automated daily backup (optional)

Add a cron job:

```bash
crontab -e
```

Add this line for a daily backup at 2:00 AM:

```
0 2 * * * docker exec crm-db-server pg_dump -U postgres crm > /opt/crm/backups/crm_$(date +\%Y\%m\%d).sql 2>&1
```

---

## Phase 4: Expose to Internet via ngrok

ngrok creates a secure tunnel from a public URL to your laptop's local port, letting external users reach the web app without port forwarding or a static IP.

### Step 15 — Install ngrok

```bash
# Download and install via apt (recommended)
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
  | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null

echo "deb https://ngrok-agent.s3.amazonaws.com buster main" \
  | sudo tee /etc/apt/sources.list.d/ngrok.list

sudo apt update && sudo apt install -y ngrok
```

Alternatively, download the binary directly:

```bash
# Download, unzip, and move to PATH
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
tar -xzf ngrok-v3-stable-linux-amd64.tgz
sudo mv ngrok /usr/local/bin/
```

Verify:

```bash
ngrok version
```

### Step 16 — Authenticate ngrok

1. Sign up for a free account at https://dashboard.ngrok.com/signup
2. Copy your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken
3. Configure it:

```bash
ngrok config add-authtoken <YOUR-AUTH-TOKEN>
```

### Step 17 — Expose the web app

Since the Next.js frontend makes API calls from the browser, you need to expose **both** the web app (port 3000) and the API gateway (port 4000). On the free tier you can only run one tunnel at a time, so we use the web app port and route API calls through it.

**Option A — Expose only the web app (simple, requires API to be same-network):**

```bash
ngrok http 3000
```

ngrok displays a public URL:

```
Forwarding    https://abc123.ngrok-free.app -> http://localhost:3000
```

Share the `https://abc123.ngrok-free.app` URL with external users.

**Option B — Expose both web and API (requires ngrok config file):**

The free tier only allows **one tunnel at a time**. To expose both ports, you need two separate ngrok sessions (requires two machines or a paid plan) OR route the API through a reverse proxy.

The practical free-tier approach: run **two ngrok commands in separate terminals**:

Terminal 1 — Web app:

```bash
ngrok http 3000
```

Terminal 2 — API gateway:

```bash
ngrok http 4000
```

> **Note:** Free tier allows only one simultaneous tunnel per account. For two tunnels, you would need a second free account with a separate authtoken for the API tunnel, or upgrade to ngrok's paid plan. See limitations below.

### Step 18 — Update API URL for external access

When you have ngrok URLs, update `.env` so the browser knows where to reach the API:

```bash
cd /opt/crm

# Edit .env — set NEXT_PUBLIC_API_URL to the ngrok URL for port 4000
# Example:
#   NEXT_PUBLIC_API_URL=https://def456.ngrok-free.app

nano .env
```

Then rebuild and restart the web container (since NEXT_PUBLIC_API_URL is baked at build time in Next.js):

```bash
# If NEXT_PUBLIC_API_URL changed, the web image needs to be rebuilt on the
# build machine with the new value, exported, and reloaded.
#
# Quick workaround: set it as a runtime env var if your Next.js app reads
# it at runtime. Otherwise, rebuild on the build machine with:
#
#   NEXT_PUBLIC_API_URL=https://def456.ngrok-free.app docker compose build web
#
# Then export and reload just that image.
```

> **Important:** `NEXT_PUBLIC_*` variables in Next.js are embedded at **build time**, not runtime. If external users need to reach the API via ngrok, you must rebuild the web image with the ngrok API URL set.

### Step 19 — Run ngrok as a background service

To keep ngrok running after you close the terminal:

**Option A — Using nohup:**

```bash
nohup ngrok http 3000 --log=stdout > /opt/crm/ngrok.log 2>&1 &

# Check the assigned URL
curl -s http://localhost:4040/api/tunnels | python3 -m json.tool
```

**Option B — Using systemd (recommended for always-on):**

Create a service file:

```bash
sudo nano /etc/systemd/system/ngrok-web.service
```

Contents:

```ini
[Unit]
Description=ngrok tunnel for CRM web app
After=network.target docker.service

[Service]
Type=simple
User=<YOUR-USERNAME>
ExecStart=/usr/local/bin/ngrok http 3000 --log=stdout
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ngrok-web
sudo systemctl start ngrok-web

# Check status
sudo systemctl status ngrok-web

# View the assigned URL
curl -s http://localhost:4040/api/tunnels | python3 -m json.tool
```

### ngrok free tier limitations

| Limitation | Detail |
|---|---|
| **Random URLs** | URL changes every time ngrok restarts (e.g., `abc123.ngrok-free.app`). Paid plans offer fixed subdomains. |
| **One tunnel per account** | Free tier allows only one active tunnel. To expose both web (3000) and API (4000), you need two accounts or a paid plan. |
| **Interstitial warning page** | First-time visitors see an ngrok branding/warning page before reaching your app. |
| **Rate limits** | 1 online ngrok process, 20 connections/min, 60 connections/min burst on free tier. Sufficient for 50 users with normal usage patterns. |
| **No custom domain** | Free tier uses `*.ngrok-free.app`. Custom domains require a paid plan. |

### ngrok dashboard

Monitor active tunnels, traffic, and errors at:

```
http://localhost:4040
```

This is ngrok's local web dashboard — accessible only from the laptop itself.

---

## Quick Reference

| Task | Command |
|---|---|
| Start stack | `docker compose up -d` |
| Stop stack | `docker compose down` |
| View status | `docker compose ps` |
| View all logs | `docker compose logs -f` |
| View one service log | `docker compose logs -f <service>` |
| Restart one service | `docker compose restart <service>` |
| Resource usage | `docker stats` |
| Backup database | `docker exec crm-db-server pg_dump -U postgres crm > backup.sql` |
| Restore database | `cat backup.sql \| docker exec -i crm-db-server psql -U postgres crm` |
| Find laptop LAN IP | `hostname -I` |
| Load new images | `docker load < crm-images.tar.gz` |
| Clean old images | `docker image prune -f` |

---

## Container Inventory

| # | Container | Image | Port | Depends On |
|---|---|---|---|---|
| 1 | postgres | `postgres:18.4` | 5432 (internal) | — |
| 2 | auth-service | `crm-monorepo-auth-service` | 4001 (internal) | postgres |
| 3 | users-service | `crm-monorepo-users-service` | 4002 (internal) | postgres |
| 4 | leads-service | `crm-monorepo-leads-service` | 4003 (internal) | postgres |
| 5 | assignments-service | `crm-monorepo-assignments-service` | 4004 (internal) | postgres |
| 6 | analytics-service | `crm-monorepo-analytics-service` | 4005 (internal) | postgres |
| 7 | activities-service | `crm-monorepo-activities-service` | 4006 (internal) | postgres |
| 8 | communication-service | `crm-monorepo-communication-service` | 4009 (internal) | — |
| 9 | meta-conversion-api | `crm-monorepo-meta-conversion-api` | 4007 (internal) | postgres |
| 10 | notifications-service | `crm-monorepo-notifications-service` | 4008 (internal) | postgres |
| 11 | api-gateway | `crm-monorepo-api-gateway` | **4000 (exposed)** | all services |
| 12 | web | `crm-monorepo-web` | **3000 (exposed)** | api-gateway |

---

## Troubleshooting

### Container keeps restarting

```bash
# Check the logs for the failing container
docker compose logs <service-name> --tail=100

# Common causes:
# - Database not ready yet → wait 30 seconds and check again
# - Wrong password in .env → verify .env matches 01_init-db.sql
# - Port conflict → check if another process uses the port: sudo lsof -i :<port>
```

### Cannot connect from other machines on LAN

```bash
# 1. Check laptop IP
hostname -I

# 2. Verify firewall allows ports 3000 and 4000
sudo ufw status

# 3. Verify .env has the correct LAN IP
grep "NEXT_PUBLIC_API_URL" /opt/crm/.env
grep "WEB_URL" /opt/crm/.env

# 4. Verify containers are listening
docker compose ps
```

### Database connection errors in services

```bash
# Verify PostgreSQL is healthy
docker compose ps postgres

# Check if the service credentials work
docker exec -it crm-db-server psql -U crm_service -d crm -c "SELECT 1"

# Common causes:
# - Password mismatch between .env and 01_init-db.sql
# - DB_CONTAINER_NAME in .env doesn't match docker-compose.yml container_name
```

### Out of disk space

```bash
# Check disk usage
df -h

# Remove unused Docker data (stopped containers, unused images, build cache)
docker system prune -f

# Check image sizes
docker images --format "table {{.Repository}}\t{{.Size}}" | sort -k2 -h
```

### Viewing resource consumption

```bash
# Live resource usage per container
docker stats

# If a service uses too much memory, restart it
docker compose restart <service-name>
```
