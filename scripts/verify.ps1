# DESKA ERP — Pre-delivery verification script
# Usage:
#   pwsh ./scripts/verify.ps1           # full (typecheck + build + runtime)
#   pwsh ./scripts/verify.ps1 -LiveOnly # runtime only (when dev servers are running)

param(
    [switch]$LiveOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host "`n=== DESKA ERP Verification ===" -ForegroundColor Cyan
if ($LiveOnly) { Write-Host "(live checks only - dev servers must be running)" -ForegroundColor DarkGray }

$failed = @()

function Test-Step {
    param([string]$Name, [scriptblock]$Action)
    Write-Host "`n> $Name" -ForegroundColor Yellow
    try {
        & $Action
        Write-Host "  OK" -ForegroundColor Green
    } catch {
        Write-Host "  FAIL: $_" -ForegroundColor Red
        $script:failed += $Name
    }
}

function Test-PortInUse {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    return [bool]$conn
}

if (-not $LiveOnly) {
    Test-Step "Typecheck" { pnpm typecheck | Out-Null }
    Test-Step "Build shared" { pnpm --filter @deska/shared build | Out-Null }
    Test-Step "Build API" {
        pnpm --filter @deska/api build | Out-Null
        if (-not (Test-Path "apps/api/dist/main.js")) { throw "apps/api/dist/main.js not found" }
    }

    $webDevRunning = Test-PortInUse -Port 3000
    if ($webDevRunning) {
        Write-Host "`n> Build Web" -ForegroundColor Yellow
        Write-Host "  SKIP (dev server on :3000 - next build would corrupt .next cache)" -ForegroundColor DarkYellow
        Write-Host "  Tip: run 'pnpm restart:web' after full verify, or use -LiveOnly" -ForegroundColor DarkGray
    } else {
        Test-Step "Build Web" { pnpm --filter @deska/web build | Out-Null }
    }
}

Test-Step "API health" {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/api/health" -TimeoutSec 5
    if ($health.status -ne 'ok') { throw "API health not ok" }
}

Test-Step "Web /login (200)" {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/login" -UseBasicParsing -TimeoutSec 15
    if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode)" }
    if ($response.Content -match 'Internal Server Error') { throw "Page body contains Internal Server Error" }
}

Test-Step "Auth login + /me" {
    $login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method POST `
        -ContentType "application/json" -Body '{"email":"admin@deska.local","password":"Admin@1234"}' -TimeoutSec 10
    if (-not $login.accessToken) { throw "No access token" }
    $me = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/me" `
        -Headers @{ Authorization = "Bearer $($login.accessToken)" } -TimeoutSec 10
    if ($me.tenants.Count -lt 1) { throw "No tenants on /auth/me" }
    $script:verifyToken = $login.accessToken
    $script:verifyTenant = $me.tenants[0].id
}

function Enable-VerifyModules {
    param(
        [hashtable]$Headers,
        [string[]]$ModuleIds
    )
    foreach ($moduleId in $ModuleIds) {
        $body = @{ enabled = $true } | ConvertTo-Json
        Invoke-RestMethod -Uri "http://localhost:3001/api/modules/$moduleId/toggle" `
            -Method PATCH -Headers $Headers -ContentType "application/json" -Body $body -TimeoutSec 10 | Out-Null
    }
}

Test-Step "Tenant modules (opt-in)" {
    $h = @{ Authorization = "Bearer $script:verifyToken"; "X-Tenant-Id" = $script:verifyTenant }
    $mods = Invoke-RestMethod -Uri "http://localhost:3001/api/modules/tenant" -Headers $h -TimeoutSec 10
    if ($mods.Count -lt 1) { throw "Module catalog empty" }
    $enabledBefore = @($mods | Where-Object { $_.enabled -eq $true })
    if ($enabledBefore.Count -gt 0) {
        Write-Host "  Note: $($enabledBefore.Count) modules already enabled by tenant admin" -ForegroundColor DarkGray
    }
    Enable-VerifyModules -Headers $h -ModuleIds @('contacts', 'documents', 'calendar', 'hr')
}

Test-Step "Core module endpoints" {
    $h = @{ Authorization = "Bearer $script:verifyToken"; "X-Tenant-Id" = $script:verifyTenant }
    $contacts = Invoke-RestMethod -Uri "http://localhost:3001/api/contacts" -Headers $h -TimeoutSec 10
    if ($null -eq $contacts.items) { throw "Contacts response invalid" }
    $null = Invoke-RestMethod -Uri "http://localhost:3001/api/documents/folders" -Headers $h -TimeoutSec 10
    $null = Invoke-RestMethod -Uri "http://localhost:3001/api/calendar/events" -Headers $h -TimeoutSec 10
    $dashboard = Invoke-RestMethod -Uri "http://localhost:3001/api/dashboard/stats" -Headers $h -TimeoutSec 10
    if ($null -eq $dashboard.contacts) { throw "Dashboard response invalid" }
}

Test-Step "HR module endpoints" {
    $h = @{ Authorization = "Bearer $script:verifyToken"; "X-Tenant-Id" = $script:verifyTenant }
    $depts = Invoke-RestMethod -Uri "http://localhost:3001/api/hr/departments" -Headers $h -TimeoutSec 10
    $employees = Invoke-RestMethod -Uri "http://localhost:3001/api/hr/employees" -Headers $h -TimeoutSec 10
    if ($null -eq $depts -or $null -eq $employees) { throw "HR list response invalid" }
    $null = Invoke-RestMethod -Uri "http://localhost:3001/api/hr/dashboard" -Headers $h -TimeoutSec 10
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
if ($failed.Count -eq 0) {
    Write-Host "All checks passed." -ForegroundColor Green
    exit 0
} else {
    Write-Host "Failed ($($failed.Count)): $($failed -join ', ')" -ForegroundColor Red
    Write-Host "Try: pnpm restart:web  or  pnpm dev:clean" -ForegroundColor Yellow
    exit 1
}
