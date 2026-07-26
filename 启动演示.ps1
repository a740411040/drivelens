$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

function Get-UsableNode {
  $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($systemNode) {
    $major = [int]((& $systemNode.Source -p "process.versions.node.split('.')[0]").Trim())
    if ($major -ge 22) { return $systemNode.Source }
  }
  if (Test-Path -LiteralPath $bundledNode -PathType Leaf) { return $bundledNode }
  throw "需要 Node.js 22.13 或更高版本。请安装后重新运行。"
}

$node = Get-UsableNode
$vinext = Join-Path $projectRoot "node_modules\vinext\dist\cli.js"
if (-not (Test-Path -LiteralPath $vinext -PathType Leaf)) {
  throw "依赖尚未安装。请先在项目目录运行 npm install。"
}

Set-Location -LiteralPath $projectRoot
$env:WRANGLER_LOG_PATH = ".wrangler\wrangler.log"
Write-Host "DriveLens 正在启动。浏览器地址会显示在下方；按 Ctrl+C 停止。" -ForegroundColor Cyan
& $node $vinext dev
