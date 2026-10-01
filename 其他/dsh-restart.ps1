# dsh web service self-restart script (ASCII only)
# ---------------------------------------------------------------------------
# 2026-09-19 改动：原来把旧服务 PID 写死（$oldPid = 7380），换一次宿主就失效 ——
# 现在自动从 3080 端口反查监听进程，找不到就直接启动新服务。
# 用途：插件/配置变更后重启 dsh web 宿主（例如补装 electron 二进制后，
#      browser provider 只在宿主启动时注册，必须重启一次才可用）。
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$port = 3080
$dshBin = 'C:\Users\DELL\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js'
$logDir = Join-Path $env:TEMP 'dsh-restart-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stdout = Join-Path $logDir 'dsh-web.stdout.log'
$stderr = Join-Path $logDir 'dsh-web.stderr.log'

$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
$oldPid = if ($conn) { $conn.OwningProcess } else { $null }
if ($oldPid) {
    Write-Output "[restart] killing old service PID=$oldPid"
    Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
} else {
    Write-Output "[restart] nothing listening on port $port"
}

for ($i = 0; $i -lt 30; $i++) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $c) { Write-Output "[restart] port $port released (${i}s)"; break }
    Start-Sleep -Seconds 1
}

Write-Output "[restart] starting new service..."
Start-Process -FilePath 'node.exe' -ArgumentList @("`"$dshBin`"", 'web') -WorkingDirectory 'C:\Users\DELL' -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($c) {
        $pidNew = $c.OwningProcess
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port" -TimeoutSec 5 -UseBasicParsing
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) {
                Write-Output "[restart] OK service ready PID=$pidNew HTTP=$($r.StatusCode) (${i}s)"
                $ready = $true
                break
            }
        } catch { }
    }
}
if (-not $ready) {
    Write-Output "[restart] FAILED: service not ready in 60s, log: $stderr"
    if (Test-Path $stderr) { Get-Content $stderr -Tail 30 }
} else {
    Write-Output "[restart] done"
}
