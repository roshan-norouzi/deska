[CmdletBinding()]
param(
  [string]$Message = '',
  [switch]$NoVersionBump,
  [switch]$AutoDispatch
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$configPath = Join-Path $PSScriptRoot 'config.local.json'
$branch = 'main'
$owner = 'roshan-norouzi'
$repository = 'deska'
if (Test-Path $configPath) {
  $config = Get-Content $configPath -Raw | ConvertFrom-Json
  if ($config.branch) { $branch = [string]$config.branch }
  if ($config.githubOwner) { $owner = [string]$config.githubOwner }
  if ($config.repository) { $repository = [string]$config.repository }
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

if ($AutoDispatch) {
  $secureToken = Read-Host 'GitHub Actions Token (input is hidden)' -AsSecureString
  $tokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPtr)
    $uri = "https://api.github.com/repos/$owner/$repository/actions/workflows/deploy.yml/dispatches"
    $headers = @{ Authorization = "Bearer $token"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }
    Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body (@{ ref = $branch } | ConvertTo-Json) | Out-Null
    Write-Host 'GitHub Actions deployment started.' -ForegroundColor Green
  } finally {
    if ($tokenPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPtr) }
    $token = $null
  }
} else {
  Start-Process (Join-Path $PSScriptRoot 'index.html')
  Write-Host 'Deployment page opened. Enter the Token and start the update.' -ForegroundColor Green
}
