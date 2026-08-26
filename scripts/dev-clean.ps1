# Kill dev ports and start full stack fresh
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

foreach ($port in @(3000, 3001)) {
    Write-Host "Stopping processes on port $port..." -ForegroundColor Yellow
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Start-Sleep -Seconds 1

& (Join-Path $root 'scripts/start-dev.ps1') -SkipMigrate -SkipSeed -FreshWebCache
