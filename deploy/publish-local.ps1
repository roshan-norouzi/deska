[CmdletBinding()]
param(
  [string]$Message = '',
  [switch]$NoVersionBump
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$configPath = Join-Path $PSScriptRoot 'config.local.json'
$branch = 'main'
if (Test-Path $configPath) {
  $config = Get-Content $configPath -Raw | ConvertFrom-Json
  if ($config.branch) { $branch = [string]$config.branch }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git is not installed or is not available in PATH.'
}

git rev-parse --show-toplevel *> $null
if ($LASTEXITCODE -ne 0) { throw 'This folder is not a Git repository.' }

$trackedEnv = @(git ls-files .env 2>$null)
if ($trackedEnv.Count -gt 0) {
  throw '.env is tracked by Git. Remove it from tracking before publishing.'
}

$status = @(git status --porcelain)
if ($status.Count -eq 0) {
  Write-Host 'No changes to publish.' -ForegroundColor Yellow
} else {
  if (-not $NoVersionBump) {
    $versionPath = Join-Path $projectRoot 'VERSION'
    $current = (Get-Content $versionPath -Raw).Trim()
    $parts = $current -split '\.'
    $invalidParts = @($parts | Where-Object { $_ -notmatch '^\d+$' })
    if ($parts.Count -ne 3 -or $invalidParts.Count -gt 0) {
      throw "Invalid VERSION value: $current"
    }
    $next = "$($parts[0]).$($parts[1]).$([int]$parts[2] + 1)"
    Set-Content -Path $versionPath -Value $next -NoNewline
    Write-Host "Version bumped to $next." -ForegroundColor Cyan
  }

  git add -A
  if ($LASTEXITCODE -ne 0) { throw 'Unable to stage changes.' }
  if (-not $Message) { $Message = "Release v$((Get-Content VERSION -Raw).Trim())" }
  git commit -m $Message
  if ($LASTEXITCODE -ne 0) { throw 'Unable to create commit.' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'Unable to push to GitHub.' }
  Write-Host 'Changes pushed to GitHub.' -ForegroundColor Green
}

Start-Process (Join-Path $PSScriptRoot 'index.html')
Write-Host 'Deployment page opened. Enter the Token and start the update.' -ForegroundColor Green
