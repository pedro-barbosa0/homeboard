# Builds the public copy of Homeboard in a separate folder, with a fresh history: one first commit, under a public
# author name. The working folder and its private history are not touched, and nothing is pushed.
#   .\tools\make-public.ps1                                   -> ..\homeboard-public, author "Homeboard"
#   .\tools\make-public.ps1 -Out D:\homeboard-public -Author "Homeboard" -Message "Homeboard 2.0"
# Then, inside the new folder:  git remote add origin <address of a new, empty repository>;  git push -u origin main
param(
    [string]$Out = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'homeboard-public'),
    [string]$Author = 'Homeboard',
    [string]$Email = '',                     # empty: the e-mail git already uses here (GitHub's private noreply one)
    [string]$Message = 'Homeboard 2.0',
    [string[]]$Private = @(),                # extra words that must not appear anywhere (your name, your town...)
    [switch]$AllowHits                       # publish even if the scan finds something (not recommended)
)
$ErrorActionPreference = 'Stop'
$src = Split-Path $PSScriptRoot -Parent
if (-not $Email) { $Email = (git -C $src config user.email) }
if (-not $Email -or $Email -notmatch 'noreply') { Write-Warning "The commit e-mail ('$Email') is not a private noreply address. Pass -Email if you want another." }

# what is published: tracked files and new ones, minus what .gitignore keeps private, minus leftovers
$skip = @('icon-test.png')
$files = @(git -C $src ls-files -co --exclude-standard | Where-Object { $_ -and ($skip -notcontains $_) })
if (-not $files.Count) { throw 'No files found: is this a git working folder?' }

# 1. nothing personal: your Windows user name in paths, the words of your git name, your e-mail, secret-looking keys
$words = @($Private)
$words += ((git -C $src config user.name) -split '\s+' | Where-Object { $_.Length -ge 4 })
$words += $env:USERNAME
$words = $words | Where-Object { $_ } | Select-Object -Unique
$patterns = @($words | ForEach-Object { '\b' + [regex]::Escape($_) + '\b' })
$patterns += [regex]::Escape("Users\$env:USERNAME")
$mailLocal = ((git -C $src config user.email) -split '@')[0]
if ($mailLocal) { $patterns += [regex]::Escape($mailLocal) }
$patterns += '(ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)'
$hits = @()
foreach ($f in $files) {
    if ($f -like 'vendor/*') { continue }
    $p = Join-Path $src $f
    if (-not (Test-Path $p -PathType Leaf)) { continue }
    if ([IO.Path]::GetExtension($f) -match '^\.(png|jpe?g|webp|gif|ico)$') { continue }
    foreach ($pat in $patterns) {
        foreach ($m in (Select-String -Path $p -Pattern $pat -AllMatches -ErrorAction SilentlyContinue)) { $hits += "${f}:$($m.LineNumber): $($m.Line.Trim())" }
    }
}
if ($hits.Count) {
    Write-Host "Personal-looking text found:" -ForegroundColor Yellow
    $hits | Select-Object -Unique | ForEach-Object { Write-Host "  $_" }
    if (-not $AllowHits) { throw 'Stopped: fix those lines first (or pass -AllowHits if they are fine).' }
}

# 2. the copy (refuses a folder that already has something in it)
if ((Test-Path $Out) -and (Get-ChildItem -Force $Out | Select-Object -First 1)) { throw "The folder $Out is not empty. Pick another one, or empty it yourself." }
New-Item -ItemType Directory -Force $Out | Out-Null
foreach ($f in $files) {
    $from = Join-Path $src $f
    if (-not (Test-Path $from -PathType Leaf)) { continue }
    $to = Join-Path $Out $f
    New-Item -ItemType Directory -Force (Split-Path $to -Parent) | Out-Null
    Copy-Item -LiteralPath $from -Destination $to
}

# 3. one first commit, under the public name
git -C $Out init -q -b main
git -C $Out config core.autocrlf false                  # files are kept exactly as they are
git -C $Out add -A
git -C $Out -c user.name="$Author" -c user.email="$Email" commit -q -m $Message
git -C $Out config user.name "$Author"                  # later commits in the public copy use the same name
git -C $Out config user.email "$Email"
$n = (git -C $Out ls-files).Count
Write-Host "Public copy ready: $Out ($n files, one commit by '$Author')." -ForegroundColor Green
Write-Host "Nothing was pushed. To publish: create an empty repository, then in that folder:"
Write-Host "  git remote add origin <its address>"
Write-Host "  git push -u origin main"
