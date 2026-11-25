#Requires -Version 5.1
<#
  adb-forward-guard.ps1
  用途：常驻守护 Redmi 6 Pro 的 adb 端口转发，默认只护 8080（si）。8180（LikeBox）已改为 PC exe 自建 server，不再做 adb 转发。
  行为：
    - 每 IntervalSec 秒轮询设备状态；
    - 设备上线（含重启、USB 重插、unauthorized->device）时为每个端口重建转发；
    - 任一转发规则被清空（adb server 重启、设备重连）时自动补建；
    - adb server 不存在时 adb 会自动拉起它；
    - 日志按天写入 LogDir，保留 7 天。
  退出方式：停止计划任务或 Ctrl+C。
#>

param(
    [string]$Serial      = '33c352050205',
    [int[]]$Ports        = @(8080),
    [int]$IntervalSec    = 15,
    [string]$AdbPath     = 'D:\platform-tools\adb.exe',
    [string]$LogDir      = 'E:\codes\LikeBox\logs',
    [int]$LogKeepDays    = 7
)

$ErrorActionPreference = 'Continue'

# ---------- 单实例互斥 ----------
$mutexName = 'Local\AdbForwardGuard_Redmi6Pro'
$mutex = New-Object System.Threading.Mutex($false, $mutexName)
if (-not $mutex.WaitOne(0)) {
    Write-Host "已有守护实例在运行，本实例退出。"
    exit 0
}

# ---------- adb 定位 ----------
if (-not (Test-Path -LiteralPath $AdbPath)) {
    $cmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($cmd) { $AdbPath = $cmd.Source }
    else { throw "找不到 adb：$AdbPath，且 PATH 中也没有 adb。" }
}

if (-not (Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $ts   = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line = "$ts [$Level] $Message"
    $file = Join-Path $LogDir ("adb-forward-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))
    try { Add-Content -LiteralPath $file -Value $line -Encoding UTF8 } catch { }
    Write-Host $line
}

Get-ChildItem -LiteralPath $LogDir -Filter 'adb-forward-*.log' -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$LogKeepDays) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

function Invoke-Adb {
    param([string[]]$AdbArgs)
    $out = & $AdbPath @AdbArgs 2>&1
    return @{ ExitCode = $LASTEXITCODE; Output = ($out -join "`n").Trim() }
}

function Get-DeviceState {
    $r = Invoke-Adb -AdbArgs @('devices')
    foreach ($line in ($r.Output -split "`r?`n")) {
        if ($line -match '^(\S+)\s+(device|offline|unauthorized|recovery|sideload|bootloader)\s*$') {
            if ($matches[1] -eq $Serial) { return $matches[2] }
        }
    }
    return $null
}

function Test-ForwardRule {
    param([int]$Port)
    $r = Invoke-Adb -AdbArgs @('forward', '--list')
    foreach ($line in ($r.Output -split "`r?`n")) {
        $t = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($t)) { continue }
        $parts = $t -split '\s+'
        if ($parts.Count -ge 3 -and $parts[0] -eq $Serial) {
            $lp = $parts[1] -replace '^tcp:', ''
            if ($lp -eq "$Port") { return $true }
        }
    }
    return $false
}

function Set-ForwardRule {
    param([int]$Port)
    Invoke-Adb -AdbArgs @('-s', $Serial, 'forward', '--remove', "tcp:$Port") | Out-Null
    $r = Invoke-Adb -AdbArgs @('-s', $Serial, 'forward', "tcp:$Port", "tcp:$Port")
    if ($r.ExitCode -eq 0) {
        Write-Log "转发已建立：127.0.0.1:$Port -> $Serial`:$Port"
        return $true
    }
    Write-Log "建立 $Port 转发失败（exit=$($r.ExitCode)）：$($r.Output)" 'WARN'
    return $false
}

# ---------- 主循环 ----------
$portList = ($Ports | ForEach-Object { "127.0.0.1:$_" }) -join ', '
Write-Log "守护启动：serial=$Serial，监听转发 [$portList]，轮询 ${IntervalSec}s，adb=$AdbPath"

$lastState = $null
while ($true) {
    try {
        $state = Get-DeviceState

        if ($state -eq 'device') {
            if ($lastState -ne 'device') {
                Write-Log "设备上线（$lastState -> device），重建全部转发规则"
                foreach ($p in $Ports) { Set-ForwardRule -Port $p | Out-Null }
                $lastState = 'device'
            }
            else {
                foreach ($p in $Ports) {
                    if (-not (Test-ForwardRule -Port $p)) {
                        Write-Log "端口 $p 的转发规则缺失（adb server 重启或设备重连导致），补建"
                        Set-ForwardRule -Port $p | Out-Null
                    }
                }
            }
        }
        elseif ($state -ne $lastState) {
            if ($null -eq $state) {
                Write-Log '设备不在 adb 列表中（等待 USB 重新枚举）' 'WARN'
            }
            else {
                Write-Log "设备状态为 $state（等待授权或恢复）" 'WARN'
            }
            $lastState = $state
        }
    }
    catch {
        Write-Log "轮询异常：$($_.Exception.Message)" 'ERROR'
    }

    Start-Sleep -Seconds $IntervalSec
}
