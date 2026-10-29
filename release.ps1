<#
.SYNOPSIS
  把 02-插件\dsh-startup 的改动同步到发布仓库，并打一个新版本 Release。

.DESCRIPTION
  一次做完：同步代码 → bump 版本 → 打包 → 提交并推 GitHub → 创建 Release 并挂上 tarball。

  为什么需要这个脚本：
    日常修改的是 02-插件\dsh-startup（被 profile 链接的那个），
    而 GitHub 仓库是 publish\dsh-startup —— 两份不会自动同步，必须推一次。

.PARAMETER Bump
  patch（默认）| minor | major | none（只同步、不改版本）

.PARAMETER DryRun
  只打印将要做什么，不写文件、不提交、不发 Release。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\release.ps1
  powershell -ExecutionPolicy Bypass -File .\release.ps1 -Bump minor
  powershell -ExecutionPolicy Bypass -File .\release.ps1 -DryRun
#>
param(
  [ValidateSet('patch','minor','major','none')]
  [string]$Bump = 'patch',
  [switch]$DryRun
)

# 外部命令（npm/git/gh）会把进度写到 stderr，Stop 会把它们当致命错误；
# 所以这里用 Continue，并对每个外部命令显式检查 $LASTEXITCODE。
$ErrorActionPreference = 'Continue'
$env:Path = "$env:Path;C:\Program Files\GitHub CLI"
$env:GIT_TERMINAL_PROMPT = '0'

# 代理只在它真的在监听时才用；否则清空走直连。
# 2026-10-28 就因为脚本里写死 7890，代理退出后整轮发布会莫名失败。
$proxyPort = 7890
$proxyUp = [bool](Get-NetTCPConnection -LocalPort $proxyPort -State Listen -ErrorAction SilentlyContinue)
if ($proxyUp) {
  $env:HTTPS_PROXY = "http://127.0.0.1:$proxyPort"
  $env:HTTP_PROXY  = "http://127.0.0.1:$proxyPort"
  Write-Host "网络：走代理 127.0.0.1:$proxyPort"
} else {
  Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
  Remove-Item Env:HTTP_PROXY  -ErrorAction SilentlyContinue
  git config --local --unset http.https://github.com.proxy 2>$null
  Write-Host "网络：代理未监听，走直连"
}

$root   = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # …\DSH开屏动画制作方案
$dev    = Join-Path $root '02-插件\dsh-startup'
$pub    = $PSScriptRoot
$repo   = 'holy-ovo/dsh-startup'
$utf8   = New-Object Text.UTF8Encoding($false)

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }

# ── 1. 同步代码 ────────────────────────────────────────────────────────
Step '同步代码 02-插件 → publish'
$files = @('index.js', 'splash.html', 'client.js', 'cordis.patch.yml')
foreach ($f in $files) {
  $src = Join-Path $dev $f
  $dst = Join-Path $pub $f
  if (-not (Test-Path -LiteralPath $src)) { throw "缺少 $src" }
  $same = (Test-Path -LiteralPath $dst) -and
          ((Get-FileHash $src).Hash -eq (Get-FileHash $dst).Hash)
  if ($same) { Write-Host "  = $f 未变" }
  else {
    Write-Host "  ~ $f 已同步"
    if (-not $DryRun) { Copy-Item -LiteralPath $src -Destination $dst -Force }
  }
}
# assets 整目录同步
$assetSrc = Join-Path $dev 'assets'
$assetDst = Join-Path $pub 'assets'
if (Test-Path -LiteralPath $assetSrc) {
  Get-ChildItem -LiteralPath $assetSrc -File | ForEach-Object {
    $d = Join-Path $assetDst $_.Name
    if (-not (Test-Path -LiteralPath $d) -or (Get-FileHash $_.FullName).Hash -ne (Get-FileHash $d).Hash) {
      Write-Host ("  ~ assets\{0} 已同步" -f $_.Name)
      if (-not $DryRun) { Copy-Item -LiteralPath $_.FullName -Destination $d -Force }
    }
  }
}

# ── 2. 版本号 ──────────────────────────────────────────────────────────
Step "版本号（-$Bump）"
$pkgPath = Join-Path $pub 'package.json'
$pkg = [IO.File]::ReadAllText($pkgPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
$old = $pkg.version
if ($Bump -ne 'none') {
  $parts = $old.Split('.') | ForEach-Object { [int]$_ }
  switch ($Bump) {
    'major' { $parts[0]++; $parts[1] = 0; $parts[2] = 0 }
    'minor' { $parts[1]++; $parts[2] = 0 }
    'patch' { $parts[2]++ }
  }
  $pkg.version = ($parts -join '.')
  Write-Host "  $old → $($pkg.version)"
  if (-not $DryRun) {
    [IO.File]::WriteAllText($pkgPath, ($pkg | ConvertTo-Json -Depth 32), $utf8)
  }
} else { Write-Host "  保持 $old" }
$newVersion = $pkg.version

# ── 3. 打包 ────────────────────────────────────────────────────────────
Step '打包 tarball'
$tmp = Join-Path $env:TEMP 'dsh-startup.tgz'
if (-not $DryRun) {
  Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
  Push-Location $pub
  try {
    & npm pack --pack-destination $env:TEMP 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "npm pack 失败（exit $LASTEXITCODE）" }
    $packed = Get-ChildItem -LiteralPath $env:TEMP -Filter '*-dsh-startup-*.tgz' |
              Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $packed) { throw 'npm pack 没有产出文件' }
    Copy-Item -LiteralPath $packed.FullName -Destination $tmp -Force
    Remove-Item -LiteralPath $packed.FullName -Force
  } finally { Pop-Location }
  Write-Host ("  {0:N0} KB" -f ((Get-Item $tmp).Length / 1KB))
}

# ── 4. 提交并推送 ──────────────────────────────────────────────────────
Step '提交并推送'
Push-Location $pub
try {
  $dirty = (& git status --porcelain)
  if ($dirty) {
    Write-Host ($dirty -split "`n" | ForEach-Object { "  $_" })
    if (-not $DryRun) {
      git add -A | Out-Null
      git -c core.pager=cat commit -q -m "release: v$newVersion"
      git push origin master 2>&1 | Select-String 'master' | Select-Object -Last 1
      if ($LASTEXITCODE -ne 0) { throw "git push 失败（exit $LASTEXITCODE）" }
    }
  } else { Write-Host '  没有改动' }

  # ── 5. Release ───────────────────────────────────────────────────────
  Step "创建 Release v$newVersion"
  if (-not $DryRun) {
    $exists = & gh release view "v$newVersion" --repo $repo --json tagName 2>$null
    if ($exists) { Write-Host "  v$newVersion 已存在，跳过" }
    else {
      & gh release create "v$newVersion" $tmp --repo $repo `
        --title "v$newVersion" --notes "见 commit 记录。" 2>&1 | Select-Object -Last 1
    }
    Write-Host ''
    Write-Host '完成。市场的 tarball 地址是 latest/download，会自动指向这个新版本。' -ForegroundColor Green
    Write-Host "https://github.com/$repo/releases/tag/v$newVersion"
  } else {
    Write-Host "  [DryRun] 会创建 Release v$newVersion 并挂上 dsh-startup.tgz"
  }
} finally { Pop-Location }
