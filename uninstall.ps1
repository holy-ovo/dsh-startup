<#
.SYNOPSIS
  从 DSH Desktop 的 web profile 里移除 dsh-startup。

.DESCRIPTION
  与 install.ps1 对称：删链接、从 dependencies 和 dsh.profile.bundles 里摘掉包名。
  不会删除你 clone 下来的仓库目录。
#>
param(
  [string]$Profile
)

$ErrorActionPreference = 'Stop'
$Name = '@klasjdfkl/dsh-startup'

if (-not $Profile -or $Profile -eq '') {
  $Profile = Join-Path $env:APPDATA 'dsh-desktop\harness\profiles\web'
}

if (-not (Test-Path -LiteralPath $Profile)) {
  throw "找不到 profile 目录：$Profile"
}

# 1) 删链接
$link = Join-Path $Profile 'node_modules\@klasjdfkl\dsh-startup'
if (Test-Path -LiteralPath $link) {
  cmd /c rmdir "$link" | Out-Null
  Write-Host "✓ 已删除链接: $link"
} else {
  Write-Host "· 链接不存在，跳过: $link"
}

# 2) 从清单里摘掉
$pkgPath = Join-Path $Profile 'package.json'
$manifest = Get-Content -LiteralPath $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json

if ($manifest.dependencies -and $manifest.dependencies.PSObject.Properties.Name -contains $Name) {
  $manifest.dependencies.PSObject.Properties.Remove($Name)
  Write-Host "✓ 已从 dependencies 移除"
}
if ($manifest.dsh -and $manifest.dsh.profile -and $manifest.dsh.profile.bundles) {
  $manifest.dsh.profile.bundles = @($manifest.dsh.profile.bundles | Where-Object { $_ -ne $Name })
  Write-Host "✓ 已从 dsh.profile.bundles 移除"
}

$json = $manifest | ConvertTo-Json -Depth 32
[IO.File]::WriteAllText($pkgPath, $json, (New-Object Text.UTF8Encoding($false)))

Write-Host ''
Write-Host '卸载完成，重启 DSH Desktop 生效。' -ForegroundColor Green
