# Called by Windows when a page opens a  homeboard-open:<path>  link.
# It only ever shows things in File Explorer: a folder is opened, a file is highlighted
# inside its folder. Nothing is executed, whatever the link says.
param([string]$Link)

$path = $Link -replace '^homeboard-open:/*', ''
$path = [System.Uri]::UnescapeDataString($path).Trim('"').Replace('/', '\')
if ($path -match '^[A-Za-z]:$') { $path += '\' }

# Only plain local or network paths; no arguments, no relative tricks.
if ($path -notmatch '^([A-Za-z]:\\|\\\\[^\\]+\\)' -or $path.Contains('..')) { exit 1 }

if (Test-Path -LiteralPath $path -PathType Container) {
    Start-Process -FilePath explorer.exe -ArgumentList ('"' + $path.TrimEnd('\') + '\"')
} elseif (Test-Path -LiteralPath $path -PathType Leaf) {
    Start-Process -FilePath explorer.exe -ArgumentList ('/select,"' + $path + '"')
} else {
    exit 1
}
