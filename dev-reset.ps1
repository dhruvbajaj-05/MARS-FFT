# dev-reset.ps1 — frees the app ports without rebooting the laptop.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File .\dev-reset.ps1
# Kills anything holding the backend / frontend / web dev ports, then reports.

$ports = 5001, 5173, 8081, 19000, 19001, 19002

Write-Host "Freeing dev ports: $($ports -join ', ')" -ForegroundColor Cyan

foreach ($p in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        $pids = $conns.OwningProcess | Sort-Object -Unique
        foreach ($procId in $pids) {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            Write-Host ("  Port {0}: killing PID {1} ({2})" -f $p, $procId, $proc.ProcessName) -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-Host ("  Port {0}: already free" -f $p) -ForegroundColor DarkGray
    }
}

Start-Sleep -Milliseconds 400
Write-Host "Done. All app ports are clear." -ForegroundColor Green
