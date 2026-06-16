.PHONY: dev dev-infra dev-services stop build install migrate seed-admin seed-data lint typecheck clean clean-all help

# ── Variables ──────────────────────────────────────────────────────────────────
COMPOSE := docker compose
PNPM := pnpm

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ── Development ────────────────────────────────────────────────────────────────
install: ## Install all workspace dependencies
	$(PNPM) install

dev: install dev-infra ## Start the full stack locally (Postgres + all services + web)
	$(PNPM) turbo dev --concurrency 16

dev-infra: ## Postgres is external (crm-postgres on :5433) — nothing to start
	@echo "Using external PostgreSQL container crm-postgres on port 5433"

dev-services: install ## Start all backend services and the API gateway
	$(PNPM) turbo dev --filter='!web' --concurrency 12

# ── Database ───────────────────────────────────────────────────────────────────
migrate: ## Run database migrations
	$(PNPM) tsx scripts/migrate.ts

seed-admin: ## Seed the super-admin user
	$(PNPM) tsx scripts/seed-admin.ts

seed-data: ## Seed demo tenants, orgs, users, campaigns, and leads
	$(PNPM) tsx scripts/seed-data.ts

db-shell: ## Open a psql shell in the Postgres container
	$(COMPOSE) exec postgres psql -U postgres -d crm

# ── Build ──────────────────────────────────────────────────────────────────────
build: install ## Build all packages and services
	$(PNPM) turbo build

build-docker: ## Build all Docker images
	$(COMPOSE) build

# ── Code Quality ───────────────────────────────────────────────────────────────
lint: ## Lint all workspaces
	$(PNPM) turbo lint

typecheck: ## Type-check all workspaces
	$(PNPM) turbo typecheck

test: ## Run all tests
	$(PNPM) turbo test

# ── Infra Lifecycle ────────────────────────────────────────────────────────────
up: ## Start full stack via Docker Compose (production-like)
	$(COMPOSE) up --build -d

down: ## Tear down all Docker Compose services
	$(COMPOSE) down

stop: ## Stop running Docker Compose services (keep volumes)
	$(COMPOSE) stop

logs: ## Stream Docker Compose logs
	$(COMPOSE) logs -f

# ── Cleanup ────────────────────────────────────────────────────────────────────
clean: ## Remove build artefacts (dist/.turbo/tsbuildinfo/.next in every workspace)
	node scripts/clean.js build

clean-all: ## Remove build artefacts AND all node_modules (full reset — run make install after)
	node scripts/clean.js all
