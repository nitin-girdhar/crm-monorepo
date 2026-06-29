# CRM Monorepo — Redeploy Guide

**Steps to rebuild, ship, and redeploy updated Docker images to the Linux laptop.**

> Use this guide every time you make code changes and need to update the running deployment.

---

## Step 1 — Rebuild images (Build Machine — Windows)

```powershell
# Rebuild only changed images (uses layer cache — faster)
docker compose build

# OR force full rebuild (if you suspect cache issues)
docker compose build --no-cache
```

## Step 2 — Verify all images built

```powershell
docker images | findstr crm-monorepo
```

Confirm all 11 images show with a recent `CREATED` timestamp.

## Step 3 — Export images

**Option A — Without compression (PowerShell, faster):**

```powershell
docker save -o crm-images.tar postgres:18.4 crm-monorepo-auth-service crm-monorepo-users-service crm-monorepo-leads-service crm-monorepo-assignments-service crm-monorepo-analytics-service crm-monorepo-activities-service crm-monorepo-communication-service crm-monorepo-meta-conversion-api crm-monorepo-notifications-service crm-monorepo-api-gateway crm-monorepo-web
```

**Option B — With compression (Git Bash, smaller file):**

```bash
docker save postgres:18.4 crm-monorepo-auth-service crm-monorepo-users-service crm-monorepo-leads-service crm-monorepo-assignments-service crm-monorepo-analytics-service crm-monorepo-activities-service crm-monorepo-communication-service crm-monorepo-meta-conversion-api crm-monorepo-notifications-service crm-monorepo-api-gateway crm-monorepo-web | gzip > crm-images.tar.gz
```

> **Tip:** If only a few services changed, you can export just those to save time:
> ```powershell
> docker save -o crm-patch.tar crm-monorepo-api-gateway crm-monorepo-leads-service
> ```

## Step 4 — Prepare updated deployment files

If any of these files changed, copy the updated versions into your deployment bundle alongside the image tarball:

| File | When to include |
|---|---|
| `docker-compose.yml` | If services, ports, or dependencies changed |
| `.env` | If environment variables changed |
| `db_scripts/01_init-db.sql` | If database schema changed |

## Step 5 — Transfer to Linux laptop

**USB:**

Copy the tarball (and any updated files from step 4) to USB drive, then on the laptop:

```bash
cp /media/$USER/<USB_DRIVE>/crm-images.tar /opt/crm/

# If docker-compose.yml changed:
cp /media/$USER/<USB_DRIVE>/docker-compose.yml /opt/crm/

# If .env changed:
cp /media/$USER/<USB_DRIVE>/.env /opt/crm/

# If DB schema changed:
cp /media/$USER/<USB_DRIVE>/01_init-db.sql /opt/crm/db_scripts/
```

**Network (scp):**

```bash
scp crm-images.tar user@<LAPTOP-IP>:/opt/crm/
```

## Step 6 — Stop the running stack (Linux laptop)

```bash
cd /opt/crm
docker compose down
```

## Step 7 — Load new Docker images

```bash
cd /opt/crm

# If uncompressed .tar:
docker load < crm-images.tar

# If compressed .tar.gz:
docker load < crm-images.tar.gz

# If partial patch:
docker load < crm-patch.tar
```

## Step 8 — Apply database schema changes (if any)

**Only required if `01_init-db.sql` was updated.** Skip this step if only application code changed.

**Option A — Apply to existing database (preserves data):**

```bash
cat /opt/crm/db_scripts/01_init-db.sql | docker exec -i crm-db-server psql -U postgres crm
```

> The init script is idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`), so re-running it is safe.

**Option B — Fresh database (destroys all data):**

Only use this if you want to start with a clean database:

```bash
sudo rm -rf /opt/crm/data/postgres/*
```

The database will be re-initialized automatically from `01_init-db.sql` when the postgres container starts in the next step.

## Step 9 — Start the stack

```bash
cd /opt/crm
docker compose up -d
```

## Step 10 — Verify

```bash
# All containers should show "Up", postgres should show "Up (healthy)"
docker compose ps

# Check for errors across all services
docker compose logs --tail=30

# Test endpoints
curl http://localhost:4000
curl -I http://localhost:3000
```

If any container shows `Restarting` or `Exit`:

```bash
docker compose logs <service-name> --tail=50
```

## Step 11 — Clean up old images (optional)

```bash
# Remove unused images to free disk space
docker image prune -f
```

---

## Quick Checklist

```
── Build Machine (Windows) ──────────────────────────
[ ] docker compose build
[ ] docker images | findstr crm-monorepo (verify timestamps)
[ ] docker save -o crm-images.tar ...
[ ] Copy updated docker-compose.yml / .env / 01_init-db.sql (if changed)
[ ] Transfer to Linux laptop (USB or scp)

── Linux Laptop ─────────────────────────────────────
[ ] docker compose down
[ ] docker load < crm-images.tar
[ ] Apply DB schema changes (if 01_init-db.sql changed)
[ ] docker compose up -d
[ ] docker compose ps (all containers Up)
[ ] docker compose logs --tail=30 (no errors)
[ ] curl http://localhost:4000 (API responds)
[ ] curl -I http://localhost:3000 (web app responds)
[ ] docker image prune -f (optional cleanup)
```

---

## Partial Redeploy (single service)

If only one or two services changed, you can avoid a full stack restart:

```bash
# 1. Load just the updated image(s)
docker load < crm-patch.tar

# 2. Restart only the changed service (without restarting its dependencies)
docker compose up -d --no-deps <service-name>

# 3. Verify
docker compose ps
docker compose logs <service-name> --tail=20
```

---

## Troubleshooting

### Container keeps restarting

```bash
docker compose logs <service-name> --tail=50
```

Common causes:
- Database not ready → wait 30 seconds and check again
- Wrong password in `.env` → verify `.env` matches `01_init-db.sql`
- Missing module → rebuild image with `docker compose build --no-cache`
- Port conflict → `sudo lsof -i :<port>`

### Roll back to previous images

If you kept the previous tarball:

```bash
docker compose down
docker load < crm-images-previous.tar
docker compose up -d
```

### .env changes

If you updated `.env`, restart the affected services:

```bash
# Restart all (picks up new env vars)
docker compose down && docker compose up -d

# Or restart a single service
docker compose up -d --force-recreate <service-name>
```

> **Note:** Changes to `NEXT_PUBLIC_*` variables require rebuilding the web image on the build machine — they are baked in at build time.

### Database schema changes

For schema changes on an existing database with data you want to keep:

```bash
# 1. Backup first
docker exec crm-db-server pg_dump -U postgres crm > /opt/crm/backups/crm_pre_migration.sql

# 2. Apply updated schema
cat /opt/crm/db_scripts/01_init-db.sql | docker exec -i crm-db-server psql -U postgres crm

# 3. Restart services to pick up any schema changes
docker compose restart
```

### PostgreSQL function errors (e.g., "function does not exist")

If services fail with errors like `function iam.fn_user_active_orgs does not exist`, the database schema needs to be re-applied:

```bash
# Re-run the init script (idempotent — safe on existing data)
cat /opt/crm/db_scripts/01_init-db.sql | docker exec -i crm-db-server psql -U postgres crm

# Restart services
docker compose restart
```

If errors persist, reset the database (destroys data):

```bash
docker compose down
sudo rm -rf /opt/crm/data/postgres/*
docker compose up -d
```

### TLS / "invalid length of startup packet" errors

If PostgreSQL logs show `invalid length of startup packet` and services show `Client network socket disconnected before secure TLS connection was established`, the services are trying to use SSL but the PostgreSQL container has no SSL configured.

Fix: ensure `.env` has:

```env
PG_SSL_MODE=disable
```

Then restart:

```bash
docker compose down && docker compose up -d
```

### Web app "Cannot find module next"

If the web container crashes with `Cannot find module '/app/apps/web/node_modules/.bin/next'`, the `next` binary is hoisted to the root `node_modules`. This is fixed in the latest web Dockerfile — rebuild the web image on the build machine and redeploy.
