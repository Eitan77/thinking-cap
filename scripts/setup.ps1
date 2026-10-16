param([string]$Python = '', [string]$Pnpm = '')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
. "$PSScriptRoot/runtime.ps1"
$Python = Resolve-ThinkingCapRuntime $Python 'python' 'dependencies/python/python.exe'
$Pnpm = Resolve-ThinkingCapRuntime $Pnpm 'pnpm' 'dependencies/bin/fallback/pnpm.cmd'
& $Pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'JavaScript dependency installation failed.' }
& $Python -m venv .venv
if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 or 3.12 is required.' }
& .\.venv\Scripts\python.exe -m pip install -r speech/requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Speech dependency installation failed.' }
New-Item -ItemType Directory -Force .local/models | Out-Null
& .\.venv\Scripts\python.exe -m piper.download_voices --download-dir .local/models en_US-lessac-medium
if ($LASTEXITCODE -ne 0) { throw 'Voice download failed.' }
& $Pnpm build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
Write-Host 'Setup complete. Run scripts/start.ps1.'
