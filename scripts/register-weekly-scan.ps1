# Register the weekly data scan (scripts/weekly-scan.mjs) in Windows Task Scheduler.
#   powershell -ExecutionPolicy Bypass -File scripts\register-weekly-scan.ps1
# Every Monday 07:00. If the PC was off, it runs as soon as possible after boot (StartWhenAvailable).
# ASCII only on purpose: Windows PowerShell 5.1 reads BOM-less scripts as ANSI and breaks Korean text,
# so the repo path is derived from $PSScriptRoot instead of being written here.
$repo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$log  = Join-Path $repo '.scratch\weekly\scan.log'
New-Item -ItemType Directory -Force -Path (Join-Path $repo '.scratch\weekly') | Out-Null
$cmd  = "/c cd /d `"$repo`" && `"$node`" scripts\weekly-scan.mjs >> `"$log`" 2>&1"
$action   = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmd -WorkingDirectory $repo
$trigger  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 7:00am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3) -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
Register-ScheduledTask -TaskName 'SalesCopilotWeeklyScan' -Action $action -Trigger $trigger -Settings $settings -Description 'Sales Copilot weekly data scan (scripts/weekly-scan.mjs)' -Force | Out-Null
Get-ScheduledTask -TaskName 'SalesCopilotWeeklyScan' | Select-Object TaskName, State
(Get-ScheduledTaskInfo -TaskName 'SalesCopilotWeeklyScan').NextRunTime
