function Resolve-ThinkingCapRuntime([string]$Explicit, [string]$Name, [string]$BundledPath) {
    if ($Explicit) { return $Explicit }
    $BundledRoot = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime'
    $NodeFolder = Join-Path $BundledRoot 'dependencies/node/bin'
    if (Test-Path (Join-Path $NodeFolder 'node.exe')) { $env:Path = "$NodeFolder;$env:Path" }
    $Found = Get-Command $Name -ErrorAction SilentlyContinue
    if ($Found -and $Found.Source -notlike '*WindowsApps*') { return $Found.Source }
    $Candidate = Join-Path $BundledRoot $BundledPath
    if (Test-Path $Candidate) { return $Candidate }
    throw "Install $Name or pass its full path to this script."
}
