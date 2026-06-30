<#
.SYNOPSIS
    Builds CRM Docker images and packages a deployment bundle for Linux.

.DESCRIPTION
    1. Builds all Docker images via docker compose build
    2. Exports images to a compressed .tar.gz archive
    3. Copies docker-compose (image-based), .env.example, SQL scripts,
       and a Linux deploy helper into crm-deploy/artifacts/

.EXAMPLE
    .\crm-deploy\build-deploy.ps1
    .\crm-deploy\build-deploy.ps1 -SkipBuild   # repackage without rebuilding
#>
param(
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# â”€â”€ Paths â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$ProjectRoot  = Split-Path -Parent $PSScriptRoot
$ArtifactsDir = Join-Path $PSScriptRoot 'artifacts'
$DbScriptsDst = Join-Path $ArtifactsDir 'db_scripts'

# â”€â”€ Image list (must match docker-compose-linux.yml) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$Images = @(
    'postgres:18.4'
    'crm-monorepo-auth-service'
    'crm-monorepo-users-service'
    'crm-monorepo-leads-service'
    'crm-monorepo-assignments-service'
    'crm-monorepo-analytics-service'
    'crm-monorepo-activities-service'
    'crm-monorepo-communication-service'
    'crm-monorepo-meta-conversion-api'
    'crm-monorepo-notifications-service'
    'crm-monorepo-api-gateway'
    'crm-monorepo-web'
)

$TarFile = Join-Path $ArtifactsDir 'crm-images.tar'
$GzFile  = "$TarFile.gz"

# â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Write-Step([string]$msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }

function Assert-Command([string]$name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        Write-Error "'$name' is required but not found in PATH."
    }
}

# â”€â”€ Pre-checks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Assert-Command 'docker'

if (-not (Test-Path (Join-Path $ProjectRoot 'docker-compose.yml'))) {
    Write-Error "docker-compose.yml not found in $ProjectRoot - run this script from the repo root or the crm-deploy folder."
}

Write-Step 'Waiting for Docker engine (Rancher Desktop) to be ready'
$maxRetries = 10
$ready = $false
for ($i = 1; $i -le $maxRetries; $i++) {
    $savedEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $null = docker info 2>$null
    $ErrorActionPreference = $savedEAP
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        Write-Host "  Docker is ready." -ForegroundColor Green
        break
    }
    Write-Host "  Attempt $i/$maxRetries - Docker not ready, retrying in 5s..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}
if (-not $ready) {
    Write-Error "Docker engine not reachable after $maxRetries attempts. Start Rancher Desktop and try again."
}

# â”€â”€ Step 1: Build images â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if ($SkipBuild) {
    Write-Step 'Skipping Docker build (repackage only)'
} else {
    Write-Step 'Building Docker images (docker compose build --no-cache)'
    Push-Location $ProjectRoot
    try {
        $savedEAP = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        docker compose build --no-cache
        $ErrorActionPreference = $savedEAP
        if ($LASTEXITCODE -ne 0) { Write-Error 'docker compose build failed.' }
    } finally {
        Pop-Location
    }
}

# â”€â”€ Step 2: Verify images exist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step 'Verifying all images exist locally'
$missing = @()
$savedEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
foreach ($img in $Images) {
    $check = $null
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try { $check = docker images -q $img 2>$null } catch { $check = $null }
        if ($check) { break }
        Start-Sleep -Seconds 2
    }
    if (-not $check) { $missing += $img }
}
$ErrorActionPreference = $savedEAP
if ($missing.Count -gt 0) {
    Write-Error "Missing images: $($missing -join ', '). Build first or check image names."
}
Write-Host "All $($Images.Count) images found." -ForegroundColor Green

# â”€â”€ Step 3: Prepare artifacts directory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step 'Preparing artifacts directory'
if (Test-Path $ArtifactsDir) {
    Remove-Item -Recurse -Force $ArtifactsDir -Confirm:$false
}
New-Item -ItemType Directory -Force $ArtifactsDir | Out-Null
New-Item -ItemType Directory -Force $DbScriptsDst | Out-Null

# â”€â”€ Step 4: Export and compress images â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Exporting $($Images.Count) Docker images to tar"
$savedEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
docker save -o $TarFile $Images
$ErrorActionPreference = $savedEAP
if ($LASTEXITCODE -ne 0) { Write-Error 'docker save failed.' }

$tarSize = [math]::Round((Get-Item $TarFile).Length / 1GB, 2)
Write-Host "  Uncompressed tar: $tarSize GB"

Write-Step 'Compressing with gzip (via Git Bash)'
$gzipAvailable = $false
$gitBash = "C:\Program Files\Git\bin\bash.exe"
if (Test-Path $gitBash) {
    $tarUnix = ($TarFile -replace '\\', '/') -replace '^C:', '/c'
    $savedEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $gitBash -c "gzip -f '$tarUnix'"
    $ErrorActionPreference = $savedEAP
    if ($LASTEXITCODE -eq 0) {
        $gzipAvailable = $true
        $gzSize = [math]::Round((Get-Item $GzFile).Length / 1GB, 2)
        Write-Host "  Compressed: $gzSize GB" -ForegroundColor Green
    }
}

if (-not $gzipAvailable) {
    Write-Host '  gzip not available via Git Bash - keeping uncompressed .tar' -ForegroundColor Yellow
    Write-Host '  You can compress manually: gzip crm-images.tar'
}

# â”€â”€ Step 5: Copy artifacts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step 'Copying deployment files'

# docker-compose for Linux (image-based, no build blocks)
Copy-Item (Join-Path $ProjectRoot 'docker-compose-linux.yml') `
          (Join-Path $ArtifactsDir 'docker-compose.yml')
Write-Host '  docker-compose.yml (linux/image-based)'

# .env.example
Copy-Item (Join-Path $ProjectRoot '.env.example') `
          (Join-Path $ArtifactsDir '.env.example')
Write-Host '  .env.example'

# SQL init script
Copy-Item (Join-Path (Join-Path $ProjectRoot 'db_scripts') '01_init-db.sql') `
          (Join-Path $DbScriptsDst '01_init-db.sql')
Write-Host '  db_scripts/01_init-db.sql'

# â”€â”€ Step 6: Create Linux deploy helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step 'Generating deploy.sh (Linux-side helper)'
$deployScript = @'
#!/usr/bin/env bash
set -euo pipefail

# â”€â”€ CRM Deploy / Redeploy Script â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Run from the directory containing this script and the artifacts.
# Usage:
#   sudo ./deploy.sh              # first-time install
#   sudo ./deploy.sh --redeploy   # update images and restart

INSTALL_DIR="/opt/crm"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REDEPLOY=false

if [[ "${1:-}" == "--redeploy" ]]; then
    REDEPLOY=true
fi

echo "==> CRM deployment ($(if $REDEPLOY; then echo 'REDEPLOY'; else echo 'FRESH INSTALL'; fi))"

# â”€â”€ 1. Create directory structure â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
echo "==> Creating directory structure at $INSTALL_DIR"
mkdir -p "$INSTALL_DIR/data/postgres"
mkdir -p "$INSTALL_DIR/backups"
mkdir -p "$INSTALL_DIR/db_scripts"

# â”€â”€ 2. Copy files â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
echo "==> Copying deployment files"
cp "$SCRIPT_DIR/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
cp "$SCRIPT_DIR/db_scripts/01_init-db.sql" "$INSTALL_DIR/db_scripts/01_init-db.sql"

if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/.env"
    echo "    .env copied from example - EDIT IT before starting the stack!"
    echo "    nano $INSTALL_DIR/.env"
else
    echo "    .env already exists - skipping (won't overwrite your config)"
fi

# â”€â”€ 3. Load Docker images â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
IMAGE_FILE=""
if [[ -f "$SCRIPT_DIR/crm-images.tar.gz" ]]; then
    IMAGE_FILE="$SCRIPT_DIR/crm-images.tar.gz"
elif [[ -f "$SCRIPT_DIR/crm-images.tar" ]]; then
    IMAGE_FILE="$SCRIPT_DIR/crm-images.tar"
fi

if [[ -n "$IMAGE_FILE" ]]; then
    echo "==> Loading Docker images from $IMAGE_FILE (this may take a few minutes)"
    docker load < "$IMAGE_FILE"
else
    echo "!! No image archive found (crm-images.tar.gz or crm-images.tar)"
    echo "   Place the archive next to this script and re-run."
    exit 1
fi

# â”€â”€ 4. Stop existing stack (redeploy) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if $REDEPLOY; then
    echo "==> Stopping existing stack"
    cd "$INSTALL_DIR"
    docker compose down || true
fi

# â”€â”€ 5. Start the stack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
echo "==> Starting CRM stack"
cd "$INSTALL_DIR"
docker compose up -d

# â”€â”€ 6. Verify â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
echo "==> Waiting for containers to start..."
sleep 5
docker compose ps

echo ""
echo "==> Cleaning up old images"
docker image prune -f

echo ""
echo "============================================="
echo "  CRM deployment complete!"
echo "  Web app:     http://localhost:3000"
echo "  API gateway: http://localhost:4000"
echo ""
echo "  Config:      $INSTALL_DIR/.env"
echo "  Logs:        docker compose -f $INSTALL_DIR/docker-compose.yml logs -f"
echo "============================================="
'@

$deployPath = Join-Path $ArtifactsDir 'deploy.sh'
[System.IO.File]::WriteAllText($deployPath, ($deployScript -replace "`r`n", "`n"))
Write-Host '  deploy.sh'

# â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step 'Done! Artifacts ready:'
Get-ChildItem -Path $ArtifactsDir -Recurse | ForEach-Object {
    $rel = $_.FullName.Substring($ArtifactsDir.Length + 1)
    $size = if ($_.PSIsContainer) { '<DIR>' } else { '{0:N1} MB' -f ($_.Length / 1MB) }
    Write-Host "  $rel  ($size)"
}

Write-Host @"

Next steps:
  1. Copy the artifacts folder to USB or scp to the Linux machine
  2. On Linux: edit .env (set passwords, paths, IPs)
  3. Run:  sudo bash deploy.sh           # first time
          sudo bash deploy.sh --redeploy  # update
"@ -ForegroundColor Yellow
