# install-patent-profile.ps1 — 点金 (dsh-patent) 一键新档案安装
#
# 在全新（或既有）的 dsh 档案上安装「点金 Aurify」专利撰写插件。幂等：重复运行安全。
#
# 用法（PowerShell）:
#   .\install-patent-profile.ps1 -Name patent-test
#   .\install-patent-profile.ps1 -Name my-patent -PersonaFrom patent
#
# 做什么：
#   1. 校验分发物齐备（bundle 目录 + 4 个 tarball）
#   2. 用 dsh CLI 初始化档案并声明 bundle（目录形态——桌面端自愈只认目录，绝不 file: tgz）
#   3. 写 package.json 的 bundle 依赖与 dsh.profile.bundles 三层栈
#   4. 写 pnpm-workspace.yaml overrides：把未发布到 npm 的内部依赖
#      （tool-patent / command-patent-review / schemastery / cosmokit）指到本地 tarball
#   5. dsh plugin install 完成 pnpm 落盘
#   6. 从参考档案复制 persona（点金人格正本；bundle 刻意不带 persona）
#   7. dump-config 验证 patent 行就位
#
# 前置：桌面端（Deepseek Harness Desktop）已安装；MCP 服务需用户级环境变量
#   DSH_PATENT_SERVICES_DIR（setx 一次性设置，见文档）。

param(
  # The profile to create/install into (relative to ~/.dsh/profiles).
  [string]$Name = "patent-test",
  # The distribution directory holding the bundle/ tree and the tarballs.
  [string]$DistDir = "$env:USERPROFILE\.dsh\plugin-dist\patent",
  # Copy the persona patch from this existing profile ("patent"); "" skips.
  [string]$PersonaFrom = "patent",
  # Skip the final dump-config verification.
  [switch]$NoVerify
)

$ErrorActionPreference = "Stop"

function Fail($message) { Write-Host "FAIL: $message" -ForegroundColor Red; exit 1 }
function Step($message) { Write-Host "== $message" -ForegroundColor Cyan }

# 1. Locate the dsh CLI: the desktop shim knows the bundled core; fall back to PATH.
$dshCmd = Join-Path $env:LOCALAPPDATA "deepseek-harness\bin\dsh.cmd"
if (-not (Test-Path $dshCmd)) {
  $onPath = Get-Command dsh -ErrorAction SilentlyContinue
  if ($null -eq $onPath) { Fail "dsh CLI not found (expected $dshCmd or dsh on PATH)" }
  $dshCmd = $onPath.Source
}

# 2. Validate the distribution artifacts before touching the profile.
$bundleDir = Join-Path $DistDir "bundle"
$tarballs = @(
  "mtl-academic-dsh-patent-0.1.6-alpha.1.tgz",
  "deepseek-ai-dsh-tool-patent-0.1.6-alpha.1.tgz",
  "deepseek-ai-dsh-command-patent-review-0.1.6-alpha.1.tgz",
  "deepseek-ai-schemastery-3.18.2.tgz",
  "deepseek-ai-cosmokit-1.8.3.tgz"
)
Step "Checking dist artifacts in $DistDir"
if (-not (Test-Path (Join-Path $bundleDir "package.json"))) { Fail "bundle directory missing: $bundleDir" }
foreach ($t in $tarballs) {
  if (-not (Test-Path (Join-Path $DistDir $t))) { Fail "missing tarball: $t" }
}
$skills = (Get-ChildItem (Join-Path $bundleDir "skills") -Directory).Count
Write-Host "   bundle ok, $skills skills, $($tarballs.Count) tarballs ok"

$profileDir = Join-Path $env:USERPROFILE ".dsh\profiles\$Name"
$newProfile = -not (Test-Path $profileDir)

# 3. Initialize the profile through the official channel. The add writes the
#    manifest scaffolding; its pnpm leg may fail on the unpublished workspace:^
#    dependencies — that is expected and repaired by steps 4-5.
if ($newProfile) {
  Step "Initializing profile $Name via dsh plugin add (directory form)"
  & $dshCmd plugin --profile $Name add "file:$($bundleDir -replace '\\','/')"
  if (-not (Test-Path (Join-Path $profileDir "package.json"))) {
    Fail "profile was not initialized at $profileDir"
  }
  Write-Host "   profile initialized (dependency resolution errors here are expected and repaired below)"
} else {
  Step "Profile $Name already exists — refreshing in place"
}

# 4. package.json: the bundle as a DIRECTORY dependency + the three-layer bundle stack.
Step "Writing package.json (bundle dir dependency + bundle stack)"
$manifest = @{
  name = "dsh-profile-$Name"
  private = $true
  dependencies = @{
    "@mtl-academic/dsh-patent" = "file:$($bundleDir -replace '\\','/')"
  }
  dsh = @{
    profile = @{
      bundles = @("@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@mtl-academic/dsh-patent")
      patchReload = "live"
    }
  }
}
$manifestJson = $manifest | ConvertTo-Json -Depth 8
# ConvertTo-Json emits CRLF-free text but PowerShell 5 may write UTF-16; force UTF-8 no BOM.
[System.IO.File]::WriteAllText((Join-Path $profileDir "package.json"), $manifestJson,
  (New-Object System.Text.UTF8Encoding($false)))
Write-Host "   wrote bundles: dsh-base + dsh-web-app + @mtl-academic/dsh-patent"

# 5. pnpm-workspace.yaml overrides: the internal packages are not on npm yet;
#    pnpm 11 reads overrides from this yaml (package.json#pnpm is ignored).
Step "Writing pnpm-workspace.yaml overrides"
$distForward = $DistDir -replace '\\','/'
$overrides = @"

# Patent plugin: the internal packages are resolved from local tarballs until
# they are published to npm (the registry only carries the 3.18.x schemastery
# line; the bundle was built against the vendored fork). Remove this block
# after publication.
overrides:
  '@deepseek-ai/dsh-tool-patent': file:$distForward/deepseek-ai-dsh-tool-patent-0.1.6-alpha.1.tgz
  '@deepseek-ai/dsh-command-patent-review': file:$distForward/deepseek-ai-dsh-command-patent-review-0.1.6-alpha.1.tgz
  '@deepseek-ai/schemastery': file:$distForward/deepseek-ai-schemastery-3.18.2.tgz
  '@deepseek-ai/cosmokit': file:$distForward/deepseek-ai-cosmokit-1.8.3.tgz
"@
$wsPath = Join-Path $profileDir "pnpm-workspace.yaml"
$ws = ""
if (Test-Path $wsPath) { $ws = [System.IO.File]::ReadAllText($wsPath) }
if ($ws -match "overrides:") {
  Write-Host "   overrides block already present — leaving as is"
} else {
  [System.IO.File]::WriteAllText($wsPath, ($ws.TrimEnd() + "`n" + $overrides),
    (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "   appended 4 overrides (tool-patent / command-patent-review / schemastery / cosmokit)"
}

# 6. Install: pnpm materializes the bundle and the overridden internal deps.
Step "dsh plugin install (pnpm leg)"
& $dshCmd plugin --profile $Name install
if ($LASTEXITCODE -ne 0) { Fail "pnpm install failed in $profileDir — check the output above" }

# 7. Persona: the bundle is persona-free on purpose; the profile patch layer
#    carries it (canonical text: bundle README, "The persona lives in the profile").
if ($PersonaFrom -ne "") {
  Step "Copying persona from profile $PersonaFrom"
  $personaPatch = Join-Path $env:USERPROFILE ".dsh\profiles\$PersonaFrom\cordis.patch.yml"
  $targetPatch = Join-Path $profileDir "cordis.patch.yml"
  if (-not (Test-Path $personaPatch)) {
    Write-Host "   WARN: reference profile patch not found ($personaPatch) — persona NOT installed" -ForegroundColor Yellow
  } elseif ((Test-Path $targetPatch) -and ((Get-Content $targetPatch -Raw) -match "patent-assistant persona")) {
    Write-Host "   persona already present — leaving as is"
  } else {
    Copy-Item $personaPatch $targetPatch -Force
    Write-Host "   persona installed (12 disciplines, from $PersonaFrom)"
  }
} else {
  Write-Host "== Skipping persona (PersonaFrom is empty)"
}

# 8. Verify: the composed profile must carry the patent rows.
if (-not $NoVerify) {
  Step "Verifying composition (dump-config)"
  $desktopBin = Join-Path $env:APPDATA "io.github.hairyf.deepseek-harness-desktop\dependencies\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
  if (Test-Path $desktopBin) {
    # The core prints benign cross-core warnings (e.g. "workflow-ptc not
    # found" on the rc line, the bundle's other engine row no-ops) on stderr;
    # let them through instead of tripping $ErrorActionPreference.
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $dump = (& node $desktopBin --profile $Name --dump-config 2>&1 | ForEach-Object { "$_" }) -join "`n"
    $ErrorActionPreference = $previousEap
    $patentRows = ([regex]::Matches($dump, "tool-patent|patent-assets|command-patent-review|mcp-patent-services")).Count
    # Match the config KEY (ASCII) — the persona TEXT itself gets mangled by
    # console code pages, and matching mangled text would always fail.
    $persona = ([regex]::Matches($dump, "persona:")).Count
    Write-Host "   patent rows in dump: $patentRows; persona mentions: $persona"
    if ($patentRows -lt 3) { Fail "expected at least 3 patent rows in the composed profile" }
    if ($persona -lt 1) { Fail "persona not visible in the composed profile" }
  } else {
    Write-Host "   desktop core not found — run manually: dsh --profile $Name --dump-config"
  }
}

Write-Host ""
Write-Host "DONE: profile '$Name' installed." -ForegroundColor Green
Write-Host "  - Restart the desktop app (fully quit + relaunch) to pick up the new profile."
Write-Host "  - Pick the '$Name' profile in the desktop app, open a session in a patent project directory."
Write-Host "  - MCP export/render/experiment tools need DSH_PATENT_SERVICES_DIR (user-level env) + Docker Desktop for experiments."
