$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskRuntime = Join-Path $taskRoot '.runtime'
$taskBin = Join-Path $taskRuntime 'llama'
$taskModels = Join-Path $taskRuntime 'models'
New-Item -ItemType Directory -Force -Path $taskBin, $taskModels | Out-Null

function Get-VerifiedFile($Uri, $Destination, $Sha256) {
  if ((Test-Path -LiteralPath $Destination) -and ((Get-ResumeHash $Destination) -eq $Sha256)) {
    Write-Output "Already verified: $(Split-Path -Leaf $Destination)"
    return
  }
  Write-Output "Downloading $(Split-Path -Leaf $Destination)..."
  $taskPartial = "$Destination.partial"
  & curl.exe --fail --location --retry 3 --output $taskPartial $Uri
  if ($LASTEXITCODE -ne 0) { throw 'Download failed. Run setup:model again to retry.' }
  if ((Get-ResumeHash $taskPartial) -ne $Sha256) { throw 'Checksum mismatch; downloaded file was not installed.' }
  Move-Item -LiteralPath $taskPartial -Destination $Destination -Force
}

function Get-ResumeHash($File) {
  $taskHasher = [Security.Cryptography.SHA256]::Create()
  $taskHashStream = [IO.File]::OpenRead($File)
  try {
    return [BitConverter]::ToString($taskHasher.ComputeHash($taskHashStream)).Replace('-', '').ToLowerInvariant()
  } finally {
    $taskHashStream.Dispose()
    $taskHasher.Dispose()
  }
}

# Pinned upstream binaries and model weights. Both downloads are checksum-verified.
$taskZip = Join-Path $taskRuntime 'llama-b11751-win-cpu-x64.zip'
Get-VerifiedFile 'https://github.com/ggml-org/llama.cpp/releases/download/b11751/llama-b11751-bin-win-cpu-x64.zip' $taskZip '313cbb8c43ded92e0b432acf29362813edbba07b65cc08950785029a0a73228a'
if (-not (Test-Path -LiteralPath (Join-Path $taskBin 'llama-server.exe'))) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $taskZipReader = [IO.Compression.ZipFile]::OpenRead($taskZip)
  try {
    foreach ($taskEntry in $taskZipReader.Entries) {
      $taskTarget = [IO.Path]::GetFullPath((Join-Path $taskBin $taskEntry.FullName))
      if (-not $taskTarget.StartsWith($taskBin + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Runtime archive entry is outside the install directory.'
      }
      if ($taskEntry.Name) {
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($taskTarget)) | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($taskEntry, $taskTarget, $true)
      }
    }
  } finally {
    $taskZipReader.Dispose()
  }
}
$taskModel = Join-Path $taskModels 'qwen2.5-1.5b-instruct-q4_k_m.gguf'
Get-VerifiedFile 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf' $taskModel '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e'
Write-Output 'Local model ready. Run npm run local to start Resume Button and its model.'
