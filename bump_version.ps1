param(
    [string]$TomlPath = "pyproject.toml"
)

$content = Get-Content -Raw -Path $TomlPath
$match = [regex]::Match($content, 'version\s*=\s*"(\d+)\.(\d+)\.(\d+)"')

if (-not $match.Success) {
    Write-Host "ERROR: version field not found in $TomlPath"
    exit 1
}

$major = [int]$match.Groups[1].Value
$minor = [int]$match.Groups[2].Value
$patch = [int]$match.Groups[3].Value + 1

$oldVersion = "$($match.Groups[1].Value).$($match.Groups[2].Value).$($match.Groups[3].Value)"
$newVersion = "$major.$minor.$patch"

$newContent = $content -replace 'version\s*=\s*"\d+\.\d+\.\d+"', "version = `"$newVersion`""
Set-Content -Path $TomlPath -Value $newContent -NoNewline

Write-Host "$oldVersion -> $newVersion"
