# Abre o Aedolia no navegador do PC, para testar, com as mesmas vozes do celular.
# Uso: dois cliques no Aedolia-PC.bat (raiz do projeto), ou:
#   powershell -ExecutionPolicy Bypass -File deploy\rodar-no-pc.ps1          -> compila se o código mudou
#   powershell -ExecutionPolicy Bypass -File deploy\rodar-no-pc.ps1 -Build   -> sempre compila (npm run build)
#
# Na primeira vez ele prepara tudo sozinho: dependências do app (npm install), vozes (baixar-motor-voz.ps1)
# e o motor de voz em Python (sherpa-onnx em .pc-voz\lib, fora do Git).
# Os livros que você importar no PC ficam no navegador do PC: são separados dos do celular.
param(
    [switch]$Build,
    [int]$Port = 5180
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root 'frontend'
$lib = Join-Path $root '.pc-voz\lib'
$SherpaVersion = '1.13.8' # a mesma do APK (a 2.x tirou o espeak-ng e não lê texto com as vozes Piper)

$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) { throw 'Python não encontrado. Instale o Python 3.10 ou mais novo (python.org) e abra de novo.' }

# 1. Vozes
if (-not (Test-Path (Join-Path $frontend 'android\tts-assets\tts\pt_BR-faber-medium\model.onnx'))) {
    & (Join-Path $PSScriptRoot 'baixar-motor-voz.ps1')
}

# 2. Motor de voz para o PC
if (-not (Test-Path (Join-Path $lib "sherpa_onnx-$SherpaVersion.dist-info"))) {
    Write-Host "Instalando o motor de voz (sherpa-onnx $SherpaVersion) em .pc-voz\lib..."
    if (Test-Path $lib) { Remove-Item $lib -Recurse -Force }
    cmd /c "`"$python`" -m pip install --quiet --disable-pip-version-check --target `"$lib`" sherpa-onnx==$SherpaVersion numpy"
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar o sherpa-onnx' }
}

# 3. App compilado (dist). Compila se pedido, se não existe ou se algum arquivo do app mudou depois do último build.
Push-Location $frontend
try {
    if (-not (Test-Path 'node_modules')) {
        Write-Host 'Instalando as dependências do app (npm install)...'
        npm install
        if ($LASTEXITCODE -ne 0) { throw 'Falha no npm install' }
    }
    $index = 'dist\index.html'
    $stale = $Build -or -not (Test-Path $index)
    if (-not $stale) {
        $built = (Get-Item $index).LastWriteTime
        $newer = Get-ChildItem 'src', 'public', 'index.html', 'package.json', 'vite.config.ts' -Recurse -File |
            Where-Object { $_.LastWriteTime -gt $built } | Select-Object -First 1
        $stale = [bool]$newer
    }
    if ($stale) {
        Write-Host 'Compilando o app (npm run build)...'
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Falha no npm run build' }
    }
} finally { Pop-Location }

# 4. Abre o navegador quando o ajudante estiver no ar, e fica rodando até fechar a janela
$env:AEDOLIA_PC_PORT = "$Port"
Start-Job -ScriptBlock {
    param($url)
    for ($i = 0; $i -lt 60; $i++) {
        try { Invoke-WebRequest "$url/local-tts/info" -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process $url; return } catch { Start-Sleep -Milliseconds 500 }
    }
} -ArgumentList "http://127.0.0.1:$Port" | Out-Null
# -I: não carrega nada da pasta atual; -X utf8: o sherpa-onnx abre arquivos de texto sem informar UTF-8
& $python -I -X utf8 (Join-Path $PSScriptRoot 'voz_pc.py')
