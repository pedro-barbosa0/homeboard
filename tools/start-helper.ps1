# Starts the Homeboard helper without a window (file moves, "open with", console cards, daily backups).
# It only listens on this computer and only answers the Homeboard extension.
#   Start:  right-click > Run with PowerShell        Stop:  run with  -Stop
param([switch]$Stop)

$server = Join-Path (Split-Path $PSScriptRoot -Parent) 'helper\server.js'
$helpers = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*helper\server.js*' })
$mine = @($helpers | Where-Object { $_.CommandLine -like "*$server*" })

if ($Stop) {
    $helpers | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Write-Host 'Homeboard helper stopped.'
    return
}
if ($mine.Count) { Write-Host 'Homeboard helper is already running.'; return }
# a helper from another copy of Homeboard holds the port and would refuse this copy: replace it
$helpers | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Error 'Node.js was not found. Install it from nodejs.org, then run this again.'; return }
Start-Process -FilePath $node -ArgumentList ('"' + $server + '"') -WindowStyle Hidden
Write-Host 'Homeboard helper started.'
