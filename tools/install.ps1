# Installs or updates the copy of Homeboard you use every day.
#
# The daily copy lives in its own folder (by default %LOCALAPPDATA%\Homeboard), apart from the
# folder where Homeboard is worked on, so unfinished changes never reach your board. Running this
# again later is how an update is applied:
#   - the version you have now is kept in %LOCALAPPDATA%\Homeboard-previous (tools\rollback.ps1 puts it back),
#   - your helper key, pairing and backups in the daily folder are never touched,
#   - if the helper was running from the daily folder it is restarted on the new version.
# The board itself takes the new version on the next new tab, after keeping a copy of itself.
#
#   Run:  right-click > Run with PowerShell      (or: powershell -File tools\install.ps1)
param([string]$Target = (Join-Path $env:LOCALAPPDATA 'Homeboard'))

$ErrorActionPreference = 'Stop'
$source = Split-Path $PSScriptRoot -Parent
$Target = [IO.Path]::GetFullPath($Target)
$previous = $Target.TrimEnd('\') + '-previous'
if ($Target.TrimEnd('\') -ieq $source.TrimEnd('\')) { Write-Error 'The daily copy must be a different folder from this one.'; return }

$newVersion = (Get-Content (Join-Path $source 'manifest.json') -Raw | ConvertFrom-Json).version
$oldManifest = Join-Path $Target 'manifest.json'
$oldVersion = if (Test-Path $oldManifest) { (Get-Content $oldManifest -Raw | ConvertFrom-Json).version } else { $null }

# never copied: work-in-progress tools, git, and anything that belongs to one particular copy
$skipDirs = @('.git', 'dev', 'backups', 'node_modules')
$skipFiles = @('token.txt', 'paired-with.txt', '.gitignore')

function Copy-App([string]$from, [string]$to, [switch]$Mirror) {
    $mode = if ($Mirror) { '/MIR' } else { '/E' }
    $null = robocopy $from $to $mode /XD @skipDirs /XF @skipFiles /NFL /NDL /NJH /NJS /NP /R:2 /W:1
    if ($LASTEXITCODE -ge 8) { throw "Copying from $from to $to failed (robocopy code $LASTEXITCODE)." }
}

$helperProc = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like ('*' + (Join-Path $Target 'helper\server.js') + '*') }

if ($oldVersion) {
    Copy-App $Target $previous -Mirror
    Write-Host "Kept version $oldVersion in $previous"
}
Copy-App $source $Target
$global:LASTEXITCODE = 0

# The daily copy gets a fixed extension ID (ighnfalcemcbjacbfpakkkhdbdbbabdm) from the public key in
# tools\extension-key.txt, so its board belongs to Homeboard itself and not to the folder it sits in.
# (The working folder keeps no key, and a store upload must not carry one.)
$manifestPath = Join-Path $Target 'manifest.json'
$manifestText = [IO.File]::ReadAllText($manifestPath)
if ($manifestText -notmatch '"key"\s*:') {
    $key = (Get-Content (Join-Path $PSScriptRoot 'extension-key.txt') -Raw).Trim()
    $body = ($manifestText.TrimEnd() -replace '\}$', '').TrimEnd()
    $manifestText = $body + ",`n  `"key`": `"$key`"`n}`n"
    [IO.File]::WriteAllText($manifestPath, $manifestText, (New-Object Text.UTF8Encoding $false))
}

# tell the board where it lives, so its notices can name this folder
[IO.File]::WriteAllText((Join-Path $Target 'install-path.txt'), $Target, (New-Object Text.UTF8Encoding $false))

if ($helperProc) {
    $helperProc | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    & (Join-Path $Target 'tools\start-helper.ps1')
}

if ($oldVersion) {
    Write-Host "Homeboard updated from $oldVersion to $newVersion in $Target"
    Write-Host 'It takes effect on your next new tab. To go back: tools\rollback.ps1'
} else {
    Write-Host "Homeboard $newVersion installed in $Target"
    Write-Host 'In Edge: edge://extensions > Developer mode > Load unpacked > choose that folder.'
}
