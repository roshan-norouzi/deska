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
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw 'pnpm is required to prepare the local Prisma Client before exporting system observances.'
  }
  Write-Host 'Preparing Prisma Client for the local PostgreSQL database...' -ForegroundColor Cyan
  & pnpm --filter @deska/api exec prisma generate
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to generate the local Prisma Client. Close processes locking Prisma files and retry.'
  }
  Write-Host 'Exporting local system observances...' -ForegroundColor Cyan
  $prismaPath = Join-Path $projectRoot 'apps/api/prisma'
  try {
    $exported = @(node (Join-Path $prismaPath 'export-system-observances.cjs') --base64 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to export system observances.' }
    $encoded = ($exported -join '').Trim()
    try { $bytes = [Convert]::FromBase64String($encoded); $json = [Text.Encoding]::UTF8.GetString($bytes) } catch { throw 'Export did not return valid UTF-8 data.' }
    if (-not $json.Trim().StartsWith('[')) { throw 'Export did not return valid JSON.' }
    [IO.File]::WriteAllBytes((Join-Path $prismaPath 'system-observances.json'), $bytes)
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
    try {
      $viewer = Invoke-RestMethod -Method Get -Uri 'https://api.github.com/user' -Headers $headers -ErrorAction Stop
      $repositoryInfo = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$owner/$repository" -Headers $headers -ErrorAction Stop
      if (-not $viewer.login -or $repositoryInfo.full_name -ne "$owner/$repository") { throw 'Token identity or repository access could not be verified.' }
    } catch {
      throw 'GitHub token was rejected or cannot access the repository. Create a valid PAT/fine-grained token with repository Actions write permission and try again; never paste the token into chat.'
    }
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
      $failedJob = @($jobs.jobs | Where-Object { $_.conclusion -eq 'failure' } | Select-Object -First 1)
      $failedStep = @()
      if ($failedJob.Count -gt 0) {
        $failedStep = @($failedJob[0].steps | Where-Object { $_.conclusion -eq 'failure' } | Select-Object -First 1)
      }
      if ($failedJob.Count -gt 0 -and $failedStep.Count -gt 0) {
        Write-Host "Workflow failed at Job '$($failedJob[0].name)', Step '$($failedStep[0].name)'" -ForegroundColor Red
        $logArchive = Join-Path ([IO.Path]::GetTempPath()) ("deska-actions-job-$($failedJob[0].id).zip")
        $logFolder = Join-Path ([IO.Path]::GetTempPath()) ("deska-actions-job-$($failedJob[0].id)")
        try {
          Invoke-WebRequest -Method Get -Uri "https://api.github.com/repos/$owner/$repository/actions/jobs/$($failedJob[0].id)/logs" -Headers $headers -OutFile $logArchive -TimeoutSec 30
          $logBytes = [IO.File]::ReadAllBytes($logArchive)
          $isZip = $logBytes.Length -ge 2 -and $logBytes[0] -eq 0x50 -and $logBytes[1] -eq 0x4B
          if ($isZip) {
            Expand-Archive -LiteralPath $logArchive -DestinationPath $logFolder -Force
            $diagnosticLines = @(Get-ChildItem -LiteralPath $logFolder -File -Recurse | ForEach-Object {
              Get-Content -LiteralPath $_.FullName | Where-Object { $_ -match '(?i)(deployment stopped|error|failed|fatal|denied|not found|permission|connection refused|timeout|no such file|unhealthy|exit code|docker compose)' }
            })
          } else {
            $logText = Get-Content -LiteralPath $logArchive -Raw -Encoding UTF8 -ErrorAction Stop
            $diagnosticLines = @($logText -split "`r?`n" | Where-Object { $_ -match '(?i)(deployment stopped|error|failed|fatal|denied|not found|permission|connection refused|timeout|no such file|unhealthy|exit code|docker compose)' })
          }
          if ($diagnosticLines.Count -gt 0) {
            Write-Host 'Deployment diagnostics (secret values omitted):' -ForegroundColor Yellow
            $diagnosticLines | Select-Object -Last 40 | ForEach-Object {
              $_ -replace '(?i)(GHCR_TOKEN|SERVER_SSH_KEY|PASSWORD|SECRET|TOKEN|KEY)\s*[=:]\s*[^\s"'']+', '$1=[REDACTED]'
            }
          }
        } catch {
          Write-Host "Could not download job log automatically: $($_.Exception.Message)" -ForegroundColor DarkYellow
        } finally {
          Remove-Item -LiteralPath $logArchive -Force -ErrorAction SilentlyContinue
          Remove-Item -LiteralPath $logFolder -Recurse -Force -ErrorAction SilentlyContinue
        }
        throw "Workflow failed: $($run.html_url)"
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
