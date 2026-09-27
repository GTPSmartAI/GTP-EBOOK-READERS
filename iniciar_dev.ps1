# Sobe o ambiente de desenvolvimento completo, cada parte na sua janela:
#   1. Túnel SSH do MariaDB (localhost:3306 -> VPS), com reconexão automática
#   2. Backend Flask (http://localhost:4000)
#   3. Frontend Vite (http://localhost:5173)
# Uso: clique direito > "Executar com o PowerShell", ou no terminal: .\iniciar_dev.ps1
# Requer a chave SSH ~/.ssh/id_ed25519 autorizada na VPS (login sem senha).

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$vps = 'root@2.25.124.5'

function Test-Port([int]$port) {
    [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

# 1. Túnel do banco (se já houver algo na 3306, reaproveita)
if (Test-Port 3306) {
    Write-Host '[banco]    porta 3306 já está aberta, reaproveitando' -ForegroundColor Yellow
} else {
    $tunnel = @"
`$host.UI.RawUI.WindowTitle = 'Túnel MariaDB (3306)'
while (`$true) {
    Write-Host "`$(Get-Date -Format HH:mm:ss) conectando túnel $vps ..." -ForegroundColor Cyan
    ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 127.0.0.1:3306:127.0.0.1:3306 $vps
    Write-Host "`$(Get-Date -Format HH:mm:ss) túnel caiu, reconectando em 5s..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}
"@
    Start-Process powershell -ArgumentList '-NoExit', '-Command', $tunnel
    Write-Host '[banco]    túnel iniciado' -ForegroundColor Green
}

# 2. Backend
if (Test-Port 4000) {
    Write-Host '[backend]  porta 4000 já está em uso, não iniciei outro' -ForegroundColor Yellow
} else {
    $backend = "`$host.UI.RawUI.WindowTitle = 'Backend (4000)'; `$env:PYTHONIOENCODING='utf-8'; Set-Location '$root\backend'; python api_server.py"
    Start-Process powershell -ArgumentList '-NoExit', '-Command', $backend
    Write-Host '[backend]  iniciado em http://localhost:4000' -ForegroundColor Green
}

# 3. Frontend
if (Test-Port 5173) {
    Write-Host '[frontend] porta 5173 já está em uso, não iniciei outro' -ForegroundColor Yellow
} else {
    $frontend = "`$host.UI.RawUI.WindowTitle = 'Frontend (5173)'; Set-Location '$root\frontend'; npm run dev"
    Start-Process powershell -ArgumentList '-NoExit', '-Command', $frontend
    Write-Host '[frontend] iniciado em http://localhost:5173' -ForegroundColor Green
}

Write-Host ''
Write-Host 'Abra http://localhost:5173 . Para parar, feche as janelas abertas.' -ForegroundColor Cyan
