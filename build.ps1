$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$python = "C:\Users\Administrator\AppData\Local\Programs\Python\Python315\python.exe"
if (-not (Test-Path $python)) {
    $python = "python"
}

& $python -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --noconsole `
    --name "LikeBox" `
    --add-data "templates;templates" `
    --add-data "static;static" `
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
