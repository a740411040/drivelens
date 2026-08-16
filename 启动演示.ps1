param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 3001

function Get-UsableNode {
  $minimumVersion = [version]"22.13.0"
  $candidates = @()
  $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($systemNode) { $candidates += $systemNode.Source }
  if ($env:NVM_SYMLINK) { $candidates += (Join-Path $env:NVM_SYMLINK "node.exe") }
  $nvmRoot = Join-Path $env:LOCALAPPDATA "nvm"
  if (Test-Path -LiteralPath $nvmRoot) {
    $candidates += Get-ChildItem -LiteralPath $nvmRoot -Directory -Filter "v*" |
      ForEach-Object { Join-Path $_.FullName "node.exe" }
  }
  $candidates += "C:\Program Files\nodejs\node.exe"

  $bestError = "Node.js 22.13.0 or newer is required. Install it, reopen this window, then run npm ci in the project folder."
  foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    try {
      $installedVersion = [version]((& $candidate -p "process.versions.node").Trim())
    } catch {
      continue
    }
    if ($installedVersion -ge $minimumVersion) {
      return $candidate
    }
    $bestError = "Node.js 22.13.0 or newer is required. Found $installedVersion at $candidate. Upgrade Node.js, reopen this window, then run npm ci."
  }
  throw $bestError
}

function Get-NewestWriteTime {
  param([string[]]$Paths)

  $newest = [datetime]::MinValue
  foreach ($path in $Paths) {
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $item = Get-Item -LiteralPath $path
    $files = if ($item.PSIsContainer) {
      Get-ChildItem -LiteralPath $path -Recurse -File -Force
    } else {
      @($item)
    }
    foreach ($file in $files) {
      if ($file.LastWriteTimeUtc -gt $newest) {
        $newest = $file.LastWriteTimeUtc
      }
    }
  }
  return $newest
}

$server = $null
try {
  $node = Get-UsableNode
  $vinext = Join-Path $projectRoot "node_modules\vinext\dist\cli.js"
  $patchScript = Join-Path $projectRoot "scripts\patch-vinext-static-cache.mjs"
  $verifyScript = Join-Path $projectRoot "scripts\verify-production-assets.mjs"

  if (-not (Test-Path -LiteralPath $vinext -PathType Leaf)) {
    throw "Project dependencies are missing. In this folder, run: npm ci"
  }

  Set-Location -LiteralPath $projectRoot
  & $node $patchScript
  if ($LASTEXITCODE -ne 0) { throw "Unable to apply the pinned vinext runtime patch." }

  $distDirectory = Join-Path $projectRoot "dist"
  $distServer = Join-Path $distDirectory "server\index.js"
  $distAssets = Join-Path $distDirectory "client\assets"
  $buildInputs = @(
    (Join-Path $projectRoot ".openai"),
    (Join-Path $projectRoot "app"),
    (Join-Path $projectRoot "build"),
    (Join-Path $projectRoot "public"),
    (Join-Path $projectRoot "worker"),
    (Join-Path $projectRoot "next.config.ts"),
    (Join-Path $projectRoot "package-lock.json"),
    (Join-Path $projectRoot "package.json"),
    (Join-Path $projectRoot "postcss.config.mjs"),
    (Join-Path $projectRoot "tsconfig.app.json"),
    (Join-Path $projectRoot "tsconfig.json"),
    (Join-Path $projectRoot "vite.config.ts")
  )
  $buildMissing = -not (Test-Path -LiteralPath $distServer -PathType Leaf) -or -not (Test-Path -LiteralPath $distAssets -PathType Container)
  $buildStale = $false
  if (-not $buildMissing) {
    $buildStale = (Get-NewestWriteTime -Paths $distDirectory) -lt (Get-NewestWriteTime -Paths $buildInputs)
  }
  if ($buildMissing -or $buildStale) {
    $reason = if ($buildMissing) { "missing" } else { "older than the current source" }
    Write-Host "Production build is $reason. Building DriveLens now..." -ForegroundColor Yellow
    & $node $vinext build
    if ($LASTEXITCODE -ne 0) { throw "Production build failed." }
  }

  & $node $verifyScript
  if ($LASTEXITCODE -ne 0) { throw "Production asset verification failed." }

  $serverArguments = ('"{0}" start --port {1} --hostname localhost' -f $vinext, $port)
  $server = Start-Process -FilePath $node -ArgumentList $serverArguments -NoNewWindow -PassThru
  $deadline = (Get-Date).AddSeconds(40)
  $ready = $false

  while ((Get-Date) -lt $deadline) {
    $server.Refresh()
    if ($server.HasExited) {
      throw "Production server exited before becoming ready (exit code $($server.ExitCode))."
    }

    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$port/" -TimeoutSec 2
      if ($response.StatusCode -eq 200 -and $response.Content -match "DriveLens") {
        $ready = $true
        break
      }
    } catch {
      # The server is still initializing.
    }
    Start-Sleep -Milliseconds 500
  }

  if (-not $ready) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    throw "DriveLens did not become ready at http://localhost:$port/ within 40 seconds."
  }

  if (-not $NoBrowser) {
    Start-Process "http://localhost:$port/"
  }
  Write-Host "DriveLens is running at http://localhost:$port/. Keep this window open; press Ctrl+C to stop." -ForegroundColor Cyan
  Wait-Process -Id $server.Id
} catch {
  Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
} finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }
}
