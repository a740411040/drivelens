$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

function Get-UsableNode {
  $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($systemNode) {
    try {
      $major = [int]((& $systemNode.Source -p "process.versions.node.split('.')[0]").Trim())
      if ($major -ge 22) { return $systemNode.Source }
    } catch {
      # Fall through to the bundled runtime.
    }
  }

  if (Test-Path -LiteralPath $bundledNode -PathType Leaf) {
    return $bundledNode
  }

  throw "Node.js 22.13 or newer is required. Install Node.js and run this launcher again."
}

$node = Get-UsableNode
$vinext = Join-Path $projectRoot "node_modules\vinext\dist\cli.js"

if (-not (Test-Path -LiteralPath $vinext -PathType Leaf)) {
  throw "Project dependencies are missing. Run npm install in the project folder first."
}

Set-Location -LiteralPath $projectRoot
$env:WRANGLER_LOG_PATH = ".wrangler\wrangler.log"

Write-Host "DriveLens is starting. Keep this window open; press Ctrl+C to stop." -ForegroundColor Cyan
& $node $vinext dev
