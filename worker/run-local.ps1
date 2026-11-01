$ErrorActionPreference = "Stop"
$PSScriptRoot | Set-Location
$node24 = "C:\Users\Matso.DESKTOP-J9C4R3H\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.20.0-win-x64"
$env:PATH = "$node24;$env:PATH"
$appUrl = "https://tiksaver-six.vercel.app"
$cron = ((Get-Content (Join-Path $PSScriptRoot "..\.env.local") | Where-Object { $_ -like "CRON_SECRET=*" }).Substring(12)).Trim()
$logDir = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "local.log"

for ($i = 0; $i -lt 18; $i++) {
  try { Invoke-WebRequest "$appUrl/api/tick?local=1" -UseBasicParsing -TimeoutSec 10 | Out-Null; break } catch { Start-Sleep -Seconds 10 }
}

$claim = Invoke-RestMethod -Method Post -Uri "$appUrl/api/worker/claim" -Headers @{ "x-cron-secret" = $cron } -ContentType "application/json"
if (-not $claim.claimed -or $claim.claimed.Count -eq 0) { exit 0 }

foreach ($jobId in $claim.claimed) {
  Start-Sleep -Seconds (Get-Random -Minimum 0 -Maximum 181)
  $env:JOB_ID = $jobId
  $env:APP_URL = $appUrl
  $env:CRON_SECRET = $cron
  $env:HEADLESS = "true"
  npx tsx (Join-Path $PSScriptRoot "run.ts") 2>&1 | ForEach-Object {
    if ($_ -match '^(job-fetched|cookies-loaded|browser-launched|messages-opened|list-loaded|conversation-opened|composer-clicked|typed|sent|verified)$' -or $_ -match '^(success|failed|session_expired)$') {
      Add-Content -LiteralPath $log -Value ("$(Get-Date -Format o) $_")
    }
  }
}
