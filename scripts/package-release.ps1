$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$taskVersion = (Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json).version
$taskOutputDir = Join-Path $taskRoot 'artifacts/releases'
New-Item -ItemType Directory -Force -Path $taskOutputDir | Out-Null
$taskArchive = Join-Path $taskOutputDir "resume-button-$taskVersion-source.zip"
$taskFiles = @(
  '.gitattributes', '.gitignore', '.prettierignore', 'BUILD_STATUS.md', 'CHANGELOG.md', 'CONTRIBUTING.md',
  'LICENSE', 'README.md', 'THIRD_PARTY.md', 'index.html', 'package.json',
  'package-lock.json', 'playwright.config.ts', 'tsconfig.json', 'vite.config.ts'
)
foreach ($taskDirectory in @('.github', 'docs', 'public', 'samples', 'scripts', 'server', 'shared', 'src', 'tests')) {
  $taskFiles += Get-ChildItem -LiteralPath (Join-Path $taskRoot $taskDirectory) -File -Recurse -Force |
    ForEach-Object { $_.FullName.Substring($taskRoot.Length + 1) }
}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskStream = [IO.File]::Open($taskArchive, [IO.FileMode]::Create)
$taskZip = [IO.Compression.ZipArchive]::new($taskStream, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($taskRelative in ($taskFiles | Sort-Object -Unique)) {
    $taskSource = [IO.Path]::GetFullPath((Join-Path $taskRoot $taskRelative))
    if (-not $taskSource.StartsWith($taskRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      throw 'Source file is outside the workspace.'
    }
    $taskEntry = "resume-button-$taskVersion/" + $taskRelative.Replace('\', '/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip, $taskSource, $taskEntry, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $taskZip.Dispose()
  $taskStream.Dispose()
}
$taskHasher = [Security.Cryptography.SHA256]::Create()
$taskHashStream = [IO.File]::OpenRead($taskArchive)
try {
  $taskHash = [BitConverter]::ToString($taskHasher.ComputeHash($taskHashStream)).Replace('-', '').ToLowerInvariant()
} finally {
  $taskHashStream.Dispose()
  $taskHasher.Dispose()
}
"$taskHash  $([IO.Path]::GetFileName($taskArchive))" | Set-Content -LiteralPath "$taskArchive.sha256" -Encoding utf8
Write-Output "Source release: $taskArchive"
Write-Output "SHA-256: $taskHash"
