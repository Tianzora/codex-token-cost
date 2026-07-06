param(
  [int]$Port = 17888
)

$ErrorActionPreference = "Stop"
$helper = Join-Path $PSScriptRoot "codex-local-usage-helper.cjs"

if (-not (Test-Path -LiteralPath $helper)) {
  throw "Helper script not found: $helper"
}

$existing = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($existing) {
  return
}

$node = (Get-Command node -ErrorAction Stop).Source
Start-Process -FilePath $node -ArgumentList @($helper, "--serve") -WindowStyle Hidden
