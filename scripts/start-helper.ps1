param(
  [int]$Port = 17888,
  [ValidateSet("127.0.0.1", "::1")]
  [string]$ListenHost = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
$helper = Join-Path $PSScriptRoot "codex-local-usage-helper.cjs"

if (-not (Test-Path -LiteralPath $helper)) {
  throw "Helper script not found: $helper"
}

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalAddress -in @($ListenHost, "0.0.0.0", "::") } |
  Select-Object -First 1
if ($existing) {
  $hostForUri = if ($ListenHost -eq "::1") { "[$ListenHost]" } else { $ListenHost }
  try {
    $health = Invoke-RestMethod -Uri "http://${hostForUri}:$Port/health" -TimeoutSec 2
  } catch {
    throw "Port $Port is already listening on $ListenHost, but it is not a reachable Codex Token Cost helper."
  }
  if ($health.ok -ne $true -or $health.source -ne "codex-local-usage-helper" -or $health.bridge -ne "cc-switch") {
    throw "Port $Port is already listening on $ListenHost, but it is not the Codex Token Cost helper."
  }
  return
}

$node = (Get-Command node -ErrorAction Stop).Source
Start-Process -FilePath $node -ArgumentList @($helper, "--serve", "--host", $ListenHost, "--port", $Port) -WindowStyle Hidden
