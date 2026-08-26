[CmdletBinding()]
param(
  [string]$Message = '',
  [switch]$NoVersionBump,
  [switch]$AutoDispatch,
  [switch]$SkipSystemExport
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

if (-not $SkipSystemExport -and (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host 'Exporting local system observances...' -ForegroundColor Cyan
  $prismaPath = Join-Path $projectRoot 'apps/api/prisma'
  try {
    $exported = @(docker compose exec -T api node prisma/export-system-observances.cjs 2>$null)
    if ($LASTEXITCODE -ne 0) {
      Write-Host 'Local API image lacks the exporter; rebuilding it once...' -ForegroundColor Yellow
      docker compose build api | Out-Host
      if ($LASTEXITCODE -ne 0) { throw 'API image build failed.' }
      docker compose up -d api | Out-Host
      if ($LASTEXITCODE -ne 0) { throw 'Unable to start local API.' }
      $exported = @(docker compose exec -T api node prisma/export-system-observances.cjs 2>$null)
    }
    if ($LASTEXITCODE -ne 0) { throw 'Unable to export system observances.' }
    $json = ($exported -join [Environment]::NewLine).Trim()
    if (-not $json.StartsWith('[')) { throw 'Export did not return valid JSON.' }
    Set-Content -Path (Join-Path $prismaPath 'system-observances.json') -Value $json -Encoding utf8
    Write-Host 'System observances exported.' -ForegroundColor Green
  } catch {
    throw "System observance export failed: $($_.Exception.Message)"
  }
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
    $dispatchStarted = (Get-Date).ToUniversalTime()
    Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body (@{ ref = $branch } | ConvertTo-Json) | Out-Null
    Write-Host 'GitHub Actions deployment started. Waiting for result...' -ForegroundColor Cyan
    $run = $null
    $latestRun = $null
    for ($attempt = 1; $attempt -le 60 -and -not $run; $attempt++) {
      Start-Sleep -Seconds 5
      $runsUri = "https://api.github.com/repos/$owner/$repository/actions/workflows/deploy.yml/runs?branch=$branch&event=workflow_dispatch&per_page=10"
      $runs = Invoke-RestMethod -Method Get -Uri $runsUri -Headers $headers
      $latestRun = @($runs.workflow_runs | Where-Object { ([DateTime]$_.created_at).ToUniversalTime() -ge $dispatchStarted } | Select-Object -First 1)
      if ($latestRun -and $latestRun[0].status -eq 'completed') { $run = $latestRun }
      if (-not $run) { Write-Host "Waiting... ($attempt/60)" }
    }
    if (-not $run) {
      if ($latestRun) {
        Write-Host "Workflow is still running: $($latestRun[0].html_url)" -ForegroundColor Yellow
        return
      }
      throw 'Workflow did not start or could not be found. Check GitHub Actions.'
    }
    if ($run.conclusion -ne 'success') {
      $jobsUri = "https://api.github.com/repos/$owner/$repository/actions/runs/$($run.id)/jobs"
      $jobs = Invoke-RestMethod -Method Get -Uri $jobsUri -Headers $headers
      $failedStep = @($jobs.jobs | ForEach-Object {
        $jobName = $_.name
        $_.steps | Where-Object { $_.conclusion -eq 'failure' } | ForEach-Object {
          [pscustomobject]@{ Job = $jobName; Step = $_.name }
        }
      } | Select-Object -First 1)
      if ($failedStep.Count -gt 0) {
        throw "Workflow failed at Job '$($failedStep[0].Job)', Step '$($failedStep[0].Step)': $($run.html_url)"
      }
      throw "Workflow failed: $($run.html_url)"
    }
    Write-Host "Deployment completed successfully: $($run.html_url)" -ForegroundColor Green
  } finally {
    if ($tokenPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPtr) }
    $token = $null
  }
} else {
  Write-Host 'Changes are ready. Run deploy.bat with -AutoDispatch to start the server deployment.' -ForegroundColor Green
}
