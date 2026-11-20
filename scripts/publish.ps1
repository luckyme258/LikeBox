param(
    [string]$Message = "chore: update LikeBox",
    [string]$GitPath = "",
    [switch]$NoPush,
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

function Find-Git {
    param([string]$Explicit)

    if ($Explicit) {
        if (-not (Test-Path -LiteralPath $Explicit)) {
            throw "指定的 Git 路径不存在：$Explicit"
        }
        return (Resolve-Path -LiteralPath $Explicit).Path
    }

    $command = Get-Command git -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $candidates = @(
        "D:\Git\cmd\git.exe",
        "D:\Git\bin\git.exe",
        "C:\Program Files\Git\cmd\git.exe",
        "C:\Program Files\Git\bin\git.exe",
        "C:\Program Files (x86)\Git\cmd\git.exe",
        (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd\git.exe")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }
    throw "找不到 git。请安装 Git for Windows，或用 -GitPath 指定 git.exe。"
}

function Find-Python {
    if ($env:LIKEBOX_PYTHON -and (Test-Path -LiteralPath $env:LIKEBOX_PYTHON)) {
        return $env:LIKEBOX_PYTHON
    }
    $command = Get-Command python -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }
    throw "找不到 python。请把 Python 加入 PATH，或设置 LIKEBOX_PYTHON。"
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $Root

if (-not (Test-Path -LiteralPath (Join-Path $Root ".git"))) {
    throw "当前目录不是 Git 仓库：$Root"
}

$git = Find-Git -Explicit $GitPath
$branch = (& $git -C $Root rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne "main") {
    throw "当前分支是 $branch，发布脚本只允许在 main 分支运行。"
}

Write-Host "仓库：$Root"
Write-Host "分支：$branch"
Write-Host "Git：$git"

if (-not $SkipTests) {
    $python = Find-Python
    Write-Host "语法检查：$python"
    $files = @(
        "app.py",
        "sync_engine.py",
        "batch_import.py",
        "batch_export.py",
        "import_rules.py",
        "launcher.py"
    )
    & $python -m py_compile @files
    if ($LASTEXITCODE -ne 0) {
        throw "py_compile 失败，已停止发布。"
    }
}

Write-Host "暂存改动..."
& $git -C $Root add --all
if ($LASTEXITCODE -ne 0) {
    throw "git add 失败。"
}

# Windows 没有可执行位，显式给 Termux 脚本标记 100755。
$executables = @(
    "start.sh",
    "stop.sh",
    "run.sh",
    "scripts/update-termux.sh"
)
foreach ($path in $executables) {
    if (Test-Path -LiteralPath (Join-Path $Root $path)) {
        & $git -C $Root update-index --chmod=+x $path
        if ($LASTEXITCODE -ne 0) {
            throw "设置可执行位失败：$path"
        }
    }
}

$staged = @(& $git -C $Root diff --cached --name-only)
if ($staged.Count -eq 0) {
    Write-Host "没有需要提交的改动。"
    exit 0
}

$forbidden = @()
foreach ($file in $staged) {
    if ([string]::IsNullOrWhiteSpace($file)) {
        continue
    }
    $normalized = $file -replace "\\", "/"
    if (
        $normalized -match "^(data|build|dist)/" -or
        $normalized -match "^favorites_" -or
        $normalized -match "\.(db|db-shm|db-wal|sqlite|sqlite3|log|out|pid)$" -or
        $normalized -match "\.bak"
    ) {
        $forbidden += $normalized
    }
}
if ($forbidden.Count -gt 0) {
    Write-Host "以下文件不应提交："
    $forbidden | ForEach-Object { Write-Host "  $_" }
    throw "检测到本地数据或备份文件，已停止提交。请检查 .gitignore。"
}

Write-Host "将要提交："
$staged | ForEach-Object { Write-Host "  $_" }

& $git -C $Root commit -m $Message
if ($LASTEXITCODE -ne 0) {
    throw "git commit 失败。"
}

if ($NoPush) {
    Write-Host "已提交，未推送（-NoPush）。"
} else {
    Write-Host "推送 origin/main..."
    & $git -C $Root push origin main
    if ($LASTEXITCODE -ne 0) {
        throw "git push 失败。"
    }
    Write-Host "发布完成。"
}
