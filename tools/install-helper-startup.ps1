# Makes the Homeboard helper start by itself when you sign in to Windows.
# It adds one shortcut to your own Startup folder (no admin rights, nothing system-wide).
#   Install:  right-click > Run with PowerShell        Remove:  run with  -Remove
param([switch]$Remove)

$link = Join-Path ([Environment]::GetFolderPath('Startup')) 'Homeboard helper.lnk'

if ($Remove) {
    if (Test-Path $link) { Remove-Item $link -Confirm:$false }
    Write-Host 'Removed. The helper will no longer start with Windows.'
    return
}

$start = Join-Path $PSScriptRoot 'start-helper.ps1'
$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($link)
$s.TargetPath = 'powershell.exe'
$s.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $start + '"'
$s.WindowStyle = 7
$s.Description = 'Starts the Homeboard helper (file moves, console, backups)'
$s.Save()

& $start
Write-Host 'Done. The helper is running now and will start each time you sign in.'
