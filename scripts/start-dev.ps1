param(
    [switch]$SkipMigrate,
    [switch]$SkipSeed,
    [switch]$FreshWebCache
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

function Read-DatabaseUrl {
    $envFile = Join-Path $root '.env'
    if (Test-Path $envFile) {
        foreach ($line in Get-Content $envFile) {
            if ($line -match '^\s*DATABASE_URL\s*=\s*(.+)$') {
                return $Matches[1].Trim().Trim('"').Trim("'")
            }
        }
    }
    return 'postgresql://deska:deska123@localhost:5433/deska_erp'
}

function Get-DatabaseEndpoint {
    param([string]$DatabaseUrl)

    if ($DatabaseUrl -match '@([^:/]+):(\d+)/') {
        return @{
            Host = $Matches[1]
            Port = [int]$Matches[2]
        }
    }

    return @{
        Host = 'localhost'
        Port = 5432
    }
}

function Set-DatabasePort {
    param(
        [string]$DatabaseUrl,
        [int]$Port
    )

    if ($DatabaseUrl -match '^(postgresql://[^@]+@[^:/]+:)\d+(/.*)$') {
        return "$($Matches[1])$Port$($Matches[2])"
    }

    return $DatabaseUrl
}

function Test-PostgresPort {
    param(
        [string]$HostName,
        [int]$Port
    )

    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect($HostName, $Port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(1500, $false)
        if (-not $ok) {
            $client.Close()
            return $false
        }
        $client.EndConnect($iar)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

function Test-DockerEngine {
    try {
        $info = docker info 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) { return $false }
        return $info -match 'Server Version'
    } catch {
        return $false
    }
}

function Wait-PostgresReady {
    param(
        [string]$HostName,
        [int]$Port,
        [int]$MaxAttempts = 45
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        if (Test-PostgresPort -HostName $HostName -Port $Port) {
            Write-Host "PostgreSQL is ready on ${HostName}:${Port}." -ForegroundColor Green
            return $true
        }

        Write-Host "Waiting for PostgreSQL ($attempt/$MaxAttempts)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }

    return $false
}

function Stop-PortListeners {
    param([int[]]$Ports)

    foreach ($port in $Ports) {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if (-not $conns) { continue }

        Write-Host "Freeing port $port..." -ForegroundColor Yellow
        $conns |
            Select-Object -ExpandProperty OwningProcess -Unique |
            ForEach-Object {
                Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
            }
    }
}

function Get-PublishedPostgresPort {
    try {
        $ports = docker compose port postgres 5432 2>$null
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($ports)) {
            return $null
        }
        if ($ports -match ':(\d+)\s*$') {
            return [int]$Matches[1]
        }
        return $null
    } catch {
        return $null
    }
}

function Start-DockerPostgres {
    param(
        [string]$HostName,
        [int]$Port
    )

    Write-Host 'Starting PostgreSQL with Docker...' -ForegroundColor Yellow

    # Containers can be "Up/healthy" without host port publish — that breaks login.
    $published = Get-PublishedPostgresPort
    $needsRecreate = -not (Test-PostgresPort -HostName $HostName -Port $Port) -or $published -ne $Port

    if ($needsRecreate) {
        docker compose stop postgres 2>$null | Out-Null
        docker compose rm -f postgres 2>$null | Out-Null
        docker compose up postgres -d --force-recreate
    } else {
        docker compose up postgres -d
    }

    if ($LASTEXITCODE -ne 0) {
        throw 'docker compose up postgres failed.'
    }

    if (-not (Wait-PostgresReady -HostName $HostName -Port $Port)) {
        throw "PostgreSQL container did not open port $Port in time. Try: docker compose up postgres -d --force-recreate"
    }
}

function Ensure-Postgres {
    $databaseUrl = Read-DatabaseUrl
    $endpoint = Get-DatabaseEndpoint -DatabaseUrl $databaseUrl

    if (Test-PostgresPort -HostName $endpoint.Host -Port $endpoint.Port) {
        Write-Host "Using PostgreSQL on $($endpoint.Host):$($endpoint.Port)" -ForegroundColor Green
        return $databaseUrl
    }

    if ($endpoint.Port -ne 5432 -and (Test-PostgresPort -HostName $endpoint.Host -Port 5432)) {
        $localUrl = Set-DatabasePort -DatabaseUrl $databaseUrl -Port 5432
        Write-Host 'Using local PostgreSQL on port 5432' -ForegroundColor Green
        return $localUrl
    }

    if (-not (Test-DockerEngine)) {
        Write-Host ''
        Write-Host 'PostgreSQL is not running and Docker Desktop is not ready.' -ForegroundColor Red
        Write-Host '1) Start Docker Desktop and wait until it is fully ready' -ForegroundColor Yellow
        Write-Host '2) Run Run.bat again' -ForegroundColor Yellow
        Write-Host ''
        exit 1
    }

    Start-DockerPostgres -HostName $endpoint.Host -Port $endpoint.Port
    return $databaseUrl
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  DESKA ERP - Development Stack' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Write-Host '.env created from .env.example' -ForegroundColor Yellow
}

Stop-PortListeners -Ports @(3000, 3001)

$env:DATABASE_URL = Ensure-Postgres

if (-not $SkipMigrate) {
    Write-Host 'Syncing database schema...' -ForegroundColor Yellow
    pnpm db:sync
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not $SkipSeed) {
    Write-Host 'Seeding database...' -ForegroundColor Yellow
    pnpm db:seed
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host 'Building packages...' -ForegroundColor Yellow
pnpm --filter @deska/shared build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm --filter @deska/module-sdk build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm --filter @deska/api build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($FreshWebCache) {
    $nextDir = Join-Path $root 'apps/web/.next'
    if (Test-Path $nextDir) {
        Write-Host 'Removing stale Next.js cache...' -ForegroundColor Yellow
        Remove-Item -Recurse -Force $nextDir
    }
}

Write-Host ''
Write-Host 'Starting API (3001) + Web (3000)...' -ForegroundColor Green
Write-Host 'Login: admin@deska.local / Admin@1234' -ForegroundColor DarkGray
Write-Host 'Open:  http://localhost:3000/login' -ForegroundColor DarkGray
Write-Host ''

pnpm --filter @deska/api --filter @deska/web --parallel dev
