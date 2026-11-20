param(
    [string]$Python = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not $Python) {
    $Python = $env:LIKEBOX_PYTHON
}
if (-not $Python) {
    $command = Get-Command python -ErrorAction SilentlyContinue
    if ($command) {
        $Python = $command.Source
    }
}
if (-not $Python) {
    throw "找不到 Python。请把 python 加入 PATH，或传入 -Python <python.exe>。"
}

& $Python -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --noconsole `
    --name "LikeBox" `
    --add-data "templates;templates" `
    --add-data "static;static" `
    --add-data "config;config" `
    --add-data "assets;assets" `
    --icon "assets\likebox.ico" `
    --version-file "version_info.txt" `
    "launcher.py"

if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller build failed with exit code $LASTEXITCODE"
}

$exe = Join-Path $PSScriptRoot "dist\LikeBox.exe"
if (-not (Test-Path $exe)) {
    throw "Build finished but dist\LikeBox.exe was not found"
}

$size = [math]::Round((Get-Item $exe).Length / 1MB, 2)
Write-Host "Built: $exe ($size MB)"
