param([string]$Pnpm = '', [switch]$FastSpeech)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
. "$PSScriptRoot/runtime.ps1"
if ($FastSpeech) { $env:THINKING_CAP_WHISPER_MODEL = 'tiny.en' }
$Pnpm = Resolve-ThinkingCapRuntime $Pnpm 'pnpm' 'dependencies/bin/fallback/pnpm.cmd'
if (!(Test-Path .venv/Scripts/python.exe)) { throw 'Run scripts/setup.ps1 first.' }
if (!(Test-Path dist/index.html)) { & $Pnpm build; if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' } }
Write-Host 'Open http://127.0.0.1:4317. Close this terminal or press Ctrl+C to stop.'
& $Pnpm start
