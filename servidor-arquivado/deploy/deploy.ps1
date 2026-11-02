# Publica o leitor na VPS (Docker Swarm + Traefik):
#   frontend -> https://ebook.iagtp.com.br
#   backend  -> https://backend-api.iagtp.com.br
#
# Depois do deploy, gera um APK novo (pasta apk\) e salva as mudanças no Git e no GitHub (origin), na branch atual.
#
# Uso (na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1                          # deploy + APK + GitHub
#   powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 -Message "o que mudou"   # mensagem do commit
#   powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 -NoApk                   # sem gerar o APK
#   powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 -NoGit                   # sem GitHub
#   powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 -SyncUploads             # também envia backend\uploads
#
# Requer a chave SSH ~/.ssh/id_ed25519 autorizada na VPS (login sem senha) e acesso de push ao GitHub.
param([switch]$SyncUploads, [switch]$NoGit, [switch]$NoApk, [string]$Message = '')

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$vps = 'root@2.25.124.5'
$remote = '/root/EBOOK-APP'
$apiUrl = 'https://backend-api.iagtp.com.br'
$tag = Get-Date -Format 'yyyyMMdd-HHmmss'
$work = Join-Path $env:TEMP "ebook-deploy-$tag"
New-Item -ItemType Directory $work | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding $false

function Invoke-Native([scriptblock]$cmd, [string]$what) {
    & $cmd
    if ($LASTEXITCODE -ne 0) { throw "$what falhou (código $LASTEXITCODE)" }
}

try {
    Write-Host "== Build do frontend (API: $apiUrl)" -ForegroundColor Cyan
    Push-Location "$root\frontend"
    try {
        $env:VITE_API_URL = $apiUrl
        Invoke-Native { npm.cmd run build } 'npm.cmd run build'
    } finally {
        Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
        Pop-Location
    }

    Write-Host "== Empacotando" -ForegroundColor Cyan
    Invoke-Native { tar -czf "$work\frontend-dist.tgz" -C "$root\frontend\dist" . } 'tar frontend'
    Invoke-Native {
        tar -czf "$work\backend.tgz" --exclude .env --exclude uploads --exclude models --exclude scratch `
            --exclude __pycache__ --exclude '*.log' -C "$root\backend" .
    } 'tar backend'
    Copy-Item "$PSScriptRoot\nginx-frontend.conf", "$PSScriptRoot\remote_deploy.sh" $work
    if ($SyncUploads) {
        Invoke-Native { tar -czf "$work\uploads.tgz" -C "$root\backend\uploads" . } 'tar uploads'
    }

    # Ambiente do backend em produção: o .env local com os ajustes do container
    $overrides = [ordered]@{
        HOST    = '0.0.0.0'
        PORT    = '5000'
        DEBUG   = 'false'
        DB_HOST = '172.17.0.1'   # MariaDB roda direto na VPS; o container chega nele pelo docker0
        TZ      = 'America/Sao_Paulo'
    }
    $envLines = New-Object System.Collections.Generic.List[string]
    foreach ($line in Get-Content "$root\backend\.env") {
        if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { continue }
        $key = $Matches[1]; $value = $Matches[2].Trim()
        if ($overrides.Contains($key)) { continue }
        # docker --env-file não tira aspas como o python-dotenv
        if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") { $value = $Matches[1] }
        $envLines.Add("$key=$value")
    }
    foreach ($k in $overrides.Keys) { $envLines.Add("$k=$($overrides[$k])") }
    [IO.File]::WriteAllText("$work\backend.env", ($envLines -join "`n") + "`n", $utf8)

    Write-Host "== Enviando para a VPS" -ForegroundColor Cyan
    Invoke-Native { ssh -n -o BatchMode=yes $vps "mkdir -p $remote/incoming && chmod 700 $remote" } 'ssh mkdir'
    $files = Get-ChildItem $work -File | Where-Object Name -ne 'backend.env' | ForEach-Object FullName
    foreach ($f in $files) {
        Invoke-Native { scp -q -o BatchMode=yes "$f" "${vps}:$remote/incoming/" } "scp $(Split-Path $f -Leaf)"
    }
    Invoke-Native { scp -q -o BatchMode=yes "$work\backend.env" "${vps}:$remote/backend.env" } 'scp env'
    Invoke-Native { ssh -n -o BatchMode=yes $vps "chmod 600 $remote/backend.env" } 'ssh chmod'

    if ($SyncUploads) {
        Write-Host "== Copiando uploads" -ForegroundColor Cyan
        Invoke-Native { ssh -n -o BatchMode=yes $vps "mkdir -p $remote/uploads && tar -xzf $remote/incoming/uploads.tgz -C $remote/uploads" } 'ssh uploads'
    }

    Write-Host "== Deploy na VPS" -ForegroundColor Cyan
    Invoke-Native {
        ssh -n -o BatchMode=yes $vps "sed -i 's/\r$//' $remote/incoming/remote_deploy.sh && bash $remote/incoming/remote_deploy.sh $tag"
    } 'deploy remoto'

    Write-Host "== Pronto: https://ebook.iagtp.com.br" -ForegroundColor Green
} finally {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}

# ------------------------------------------------------------------ APK
# O app leva o site dentro dele: toda mudança no frontend precisa de APK novo.
# Roda depois do envio porque o build:android sobrescreve o frontend\dist (que já foi empacotado).
if (-not $NoApk) {
    Write-Host "== APK Android" -ForegroundColor Cyan
    & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\build-apk.ps1"
    if ($LASTEXITCODE -ne 0) {
        # O site já foi publicado; o GitHub segue normalmente
        Write-Host "O deploy foi feito, mas o APK falhou (código $LASTEXITCODE). Gere de novo com deploy\build-apk.ps1." -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------------ GitHub
if ($NoGit) { return }
Write-Host "== GitHub" -ForegroundColor Cyan
Push-Location $root
try {
    Invoke-Native { git add -A } 'git add'

    # Trava: arquivos de senha/chave nunca vão para o GitHub (o .gitignore já cobre; isto é a segunda barreira)
    $staged = @(git diff --cached --name-only)
    $blocked = $staged | Where-Object { $_ -match '(^|/)\.env$|\.env\.local$|\.keystore$|\.jks$|keystore\.properties$|(^|/)id_(rsa|ed25519)' }
    # Linhas novas com cara de segredo: KEY=valor de .env, ou senha entre aspas no código (com letras e números)
    $envPat = '^\+[A-Z_]*(PASSWORD|SECRET|TOKEN|API_KEY)[A-Z_]*=\S{6,}'
    $litPat = '(?i)(password|secret|token|api_?key)\w*["'']?\s*[:=]\s*["''](?=[^"'']*\d)(?=[^"'']*[a-z])[^"''\s]{8,}["'']|BEGIN [A-Z ]*PRIVATE KEY'
    $secretLines = @(git diff --cached -U0) | Where-Object { $_ -cmatch $envPat -or ($_.StartsWith('+') -and $_ -match $litPat) }
    if ($blocked -or $secretLines) {
        git reset -q
        Write-Host "GitHub NÃO atualizado: parece haver senha ou chave nas mudanças." -ForegroundColor Red
        $blocked | ForEach-Object { Write-Host "  arquivo: $_" -ForegroundColor Red }
        if ($secretLines) { Write-Host "  $(@($secretLines).Count) linha(s) com cara de senha (ex.: PASSWORD=...)" -ForegroundColor Red }
        Write-Host "  O deploy na VPS foi feito. Tire os segredos e rode de novo." -ForegroundColor Yellow
        return
    }

    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Nada novo para salvar no Git." -ForegroundColor DarkGray
    } else {
        $msg = if ($Message) { $Message } else { "deploy $tag" }
        Invoke-Native { git commit -q -m $msg } 'git commit'
        Write-Host "Commit: $msg ($($staged.Count) arquivo(s))"
    }

    $branch = git branch --show-current
    Invoke-Native { git push origin $branch } 'git push'
    Write-Host "== GitHub atualizado (branch $branch)" -ForegroundColor Green
} catch {
    # O deploy já foi feito; só o GitHub falhou
    Write-Host "O deploy foi feito, mas o GitHub falhou: $_" -ForegroundColor Yellow
} finally {
    Pop-Location
}
