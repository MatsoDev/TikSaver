$ErrorActionPreference = "Stop"
$task = Get-ScheduledTask -TaskName Tiksave
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$logon = New-ScheduledTaskTrigger -AtLogOn -User $user

# Anchor polling to whole minutes, including 00:00 in the job timezone.
$nextMinute = (Get-Date).AddMinutes(1)
$nextMinute = $nextMinute.AddTicks(-($nextMinute.Ticks % [TimeSpan]::TicksPerMinute))
$poll = New-ScheduledTaskTrigger -Once -At $nextMinute `
  -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)

$cairo = [TimeZoneInfo]::FindSystemTimeZoneById("Egypt Standard Time")
$nextDay = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $cairo).Date.AddDays(1)
$midnightUtc = [TimeZoneInfo]::ConvertTimeToUtc($nextDay, $cairo)
$midnight = New-ScheduledTaskTrigger -Daily -At ([TimeZoneInfo]::ConvertTimeFromUtc($midnightUtc, [TimeZoneInfo]::Local))
$midnight.StartBoundary = $midnightUtc.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")
# The minute trigger also covers Cairo's seasonal UTC-offset changes.
$task.Settings.WakeToRun = $false
Set-ScheduledTask -TaskName Tiksave -Trigger @($logon, $poll, $midnight) -Settings $task.Settings | Out-Null
$saved = Get-ScheduledTask -TaskName Tiksave
Write-Output "triggers=$($saved.Triggers.Count) wake=$($saved.Settings.WakeToRun) midnight_cairo=$($nextDay.ToString('yyyy-MM-dd HH:mm'))"
Write-Output "next_poll=$((Get-ScheduledTaskInfo Tiksave).NextRunTime.ToString('o'))"
