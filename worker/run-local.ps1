$ErrorActionPreference = "Stop"
$workerRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) { "E:\TikSaver\worker" } else { $PSScriptRoot }
$workerRoot | Set-Location
$node24 = "C:\Users\Matso.DESKTOP-J9C4R3H\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.20.0-win-x64"
$env:PATH = "$node24;$env:PATH"
$appUrl = "https://tiksaver-six.vercel.app"
$logDir = Join-Path $workerRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "local.log"
function Write-LocalLog([string]$value) { Add-Content -LiteralPath $log -Value ("$(Get-Date -Format o) $value") }
$exitCode = 0
$jobIndex = 0
Write-LocalLog "run-start"

try {
  $cronLine = Get-Content (Join-Path $workerRoot "..\.env.local") | Where-Object { $_ -match '^CRON_SECRET=' } | Select-Object -First 1
  if (-not $cronLine) { throw "CRON_SECRET is missing" }
  $cron = ($cronLine -replace '^CRON_SECRET=', '').Trim().Trim('"').Trim("'").Trim()
  for ($i = 0; $i -lt 18; $i++) {
    try { Invoke-WebRequest "https://www.google.com/generate_204" -UseBasicParsing -TimeoutSec 10 | Out-Null; break } catch { if ($i -eq 17) { throw } ; Start-Sleep -Seconds 10 }
  }
  $claimResponse = Invoke-WebRequest -Method Post -Uri "$appUrl/api/worker/claim" -Headers @{ "x-cron-secret" = $cron } -ContentType "application/json" -Body "{}"
  $claim = $claimResponse.Content | ConvertFrom-Json
  $claimed = @($claim.claimed)
  Write-LocalLog "claim_http=$([int]$claimResponse.StatusCode) claimed=$($claimed.Count)"
  foreach ($jobId in $claimed) {
    if ($jobIndex -eq 0) { Start-Sleep -Seconds (Get-Random -Minimum 0 -Maximum 61) }
    else { Start-Sleep -Seconds (Get-Random -Minimum 20 -Maximum 91) }
    $jobIndex++
    $env:JOB_ID = $jobId
    $env:APP_URL = $appUrl
    $env:CRON_SECRET = $cron
    $env:HEADLESS = "true"
    $workerOutput = @(& npx tsx (Join-Path $workerRoot "run.ts") 2>&1)
    $workerExitCode = $LASTEXITCODE
    foreach ($entry in $workerOutput) {
      $line = [string]$entry
      if ($line -match '^(job-fetched|cookies-loaded|browser-launched|messages-opened|list-loaded|conversation-opened|composer-clicked|typed|sent|verified)$' -or $line -match '^(success|failed|session_expired)$' -or $line -match '^\[(failed-step|conversation-list|screenshot|worker error)\]') {
        Write-LocalLog $line
      }
    }
    if ($workerExitCode -ne 0) { $exitCode = $workerExitCode }
  }
} catch {
  $status = if ($_.Exception.Response -and $_.Exception.Response.StatusCode) { [int]$_.Exception.Response.StatusCode } else { "none" }
  $name = $_.Exception.GetType().Name
  $message = ($_.Exception.Message -replace '[\r\n]+', ' ').Substring(0, [Math]::Min(200, $_.Exception.Message.Length))
  Write-LocalLog "claim_http=$status claimed=0 error=$name`: $message"
  $exitCode = 1
}

exit $exitCode
