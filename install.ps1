<#
.SYNOPSIS
  一键把 dsh-startup 装进 DSH Desktop 的 web profile。

.DESCRIPTION
  做三件事（都可逆，卸载见 uninstall.ps1）：
    1. 在 profile 的 node_modules 里建一个指向本仓库的目录链接；
    2. 往 profile/package.json 的 dependencies 里登记；
    3. 把包名加进 dsh.profile.bundles，让加载器组合它。
  改 package.json 之前会备份成 package.json.bak-install。

.EXAMPLE
  # 在仓库根目录执行（推荐）
  powershell -ExecutionPolicy Bypass -File .\install.ps1

.EXAMPLE
  # 从任意位置指定仓库目录
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Source "D:\dev\dsh-startup"
#>
param(
  [string]$Source = $PSScriptRoot,
  [string]$Profile
)

$ErrorActionPreference = 'Stop'
$Name = '@klasjdfkl/dsh-startup'

if (-not $Profile -or $Profile -eq '') {
  $Profile = Join-Path $env:APPDATA 'dsh-desktop\harness\profiles\web'
}

Write-Host "插件目录 : $Source"
Write-Host "profile  : $Profile"

if (-not (Test-Path -LiteralPath (Join-Path $Source 'package.json'))) {
  throw "在 $Source 里找不到 package.json —— 请在仓库根目录执行，或用 -Source 指定。"
}
if (-not (Test-Path -LiteralPath $Profile)) {
  throw "找不到 profile 目录：$Profile（确认装的是 DSH Desktop）"
}

# 1) 目录链接
$scopeDir = Join-Path $Profile 'node_modules\@klasjdfkl'
$link = Join-Path $scopeDir 'dsh-startup'
New-Item -ItemType Directory -Force -Path $scopeDir | Out-Null
if (Test-Path -LiteralPath $link) {
  cmd /c rmdir "$link" | Out-Null
}
New-Item -ItemType Junction -Path $link -Target $Source | Out-Null
Write-Host "✓ 链接已建立: $link"

# 2) + 3) 登记到 profile 清单
$pkgPath = Join-Path $Profile 'package.json'
$backup = "$pkgPath.bak-install"
Copy-Item -LiteralPath $pkgPath -Destination $backup -Force
$manifest = Get-Content -LiteralPath $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json

$spec = 'link:' + ($Source -replace '\\', '/')
$manifest.dependencies | Add-Member -NotePropertyName $Name -NotePropertyValue $spec -Force

if (-not $manifest.dsh) { $manifest.dsh = [pscustomobject]@{} }
if (-not $manifest.dsh.profile) { $manifest.dsh.profile = [pscustomobject]@{} }
if (-not $manifest.dsh.profile.bundles) { $manifest.dsh.profile.bundles = @() }
if ($manifest.dsh.profile.bundles -notcontains $Name) {
  $manifest.dsh.profile.bundles = @($manifest.dsh.profile.bundles) + $Name
}

$json = $manifest | ConvertTo-Json -Depth 32
[IO.File]::WriteAllText($pkgPath, $json, (New-Object Text.UTF8Encoding($false)))
Write-Host "✓ 已登记到 package.json（备份: package.json.bak-install）"

Write-Host ''
Write-Host '装好了。**完全退出 DSH Desktop 再重新打开**，开屏动画就会出现。' -ForegroundColor Green
Write-Host '（只刷新页面不够：加载器需要重启才会读取新的 bundles 列表）'
Write-Host ''
Write-Host '卸载：powershell -ExecutionPolicy Bypass -File .\uninstall.ps1'
