# One-time setup so Homeboard links can open folders in File Explorer.
#
# Browsers cannot start File Explorer themselves. This registers a link type,
#   homeboard-open:<path>
# for YOUR Windows account only (HKEY_CURRENT_USER, no admin rights needed) and points
# it at open-folder.ps1 in this folder, which can only show a folder (or highlight a
# file) in File Explorer.
#
# Run:      right-click this file > Run with PowerShell
# Remove:   run it again with  -Remove
param([switch]$Remove)

$key = 'HKCU:\Software\Classes\homeboard-open'

if ($Remove) {
    if (Test-Path $key) { Remove-Item $key -Recurse -Confirm:$false }
    Write-Host 'Removed. Homeboard links will no longer open File Explorer.'
    return
}

$script = Join-Path $PSScriptRoot 'open-folder.ps1'
if (-not (Test-Path $script)) { Write-Error "open-folder.ps1 not found next to this script."; return }

$command = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" "%1"' -f $script

New-Item -Path "$key\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path $key -Name '(default)' -Value 'URL:Homeboard open folder'
Set-ItemProperty -Path $key -Name 'URL Protocol' -Value ''
Set-ItemProperty -Path "$key\shell\open\command" -Name '(default)' -Value $command

Write-Host 'Done. The first time you click such a link, the browser asks for permission; tick "Always allow" to skip that next time.'
Write-Host 'If you move the Homeboard folder, run this script again.'
