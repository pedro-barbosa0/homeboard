# Puts back the version of Homeboard you had before the last update (kept by tools\install.ps1).
# Your board data stays as it is; to also undo what the update changed in the board, use
# Customize > Your data > "Undo the last update".
#   Run:  right-click > Run with PowerShell
param([string]$Target = (Join-Path $env:LOCALAPPDATA 'Homeboard'))

$ErrorActionPreference = 'Stop'
$Target = [IO.Path]::GetFullPath($Target)
$previous = $Target.TrimEnd('\') + '-previous'
if (-not (Test-Path (Join-Path $previous 'manifest.json'))) { Write-Error 'There is no earlier version to go back to.'; return }

$back = (Get-Content (Join-Path $previous 'manifest.json') -Raw | ConvertFrom-Json).version
$null = robocopy $previous $Target /MIR /XD backups /XF token.txt paired-with.txt /NFL /NDL /NJH /NJS /NP /R:2 /W:1
if ($LASTEXITCODE -ge 8) { throw "Restoring failed (robocopy code $LASTEXITCODE)." }
$global:LASTEXITCODE = 0

$helperProc = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like ('*' + (Join-Path $Target 'helper\server.js') + '*') }
if ($helperProc) {
    $helperProc | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    & (Join-Path $Target 'tools\start-helper.ps1')
}
Write-Host "Homeboard is back on version $back. Open a new tab to use it."
