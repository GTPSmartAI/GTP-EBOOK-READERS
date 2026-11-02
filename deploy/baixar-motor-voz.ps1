# Baixa o motor de voz (sherpa-onnx) e as vozes Piper em português que vão dentro do APK.
# Uso (na raiz do projeto): powershell -ExecutionPolicy Bypass -File deploy\baixar-motor-voz.ps1
# O build-apk.ps1 chama este script sozinho quando falta algum arquivo.
#
# Fica fora do Git (~330 MB):
#   frontend\android\app\libs\sherpa-onnx-<versão>.aar      motor (onnxruntime + espeak-ng)
#   frontend\android\tts-assets\tts\<voz>\model.onnx        uma pasta por voz
#   frontend\android\tts-assets\tts\espeak-ng-data          fonética (com todos os dicionários: o português troca
#                                                           sozinho para o inglês em palavras inglesas, e sem o
#                                                           en_dict o espeak encerra o app)
#
# A versão 2.x do sherpa-onnx tirou o espeak-ng do pacote: sem ele o Piper não lê texto. Fica na 1.13.8.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$SherpaVersion = '1.13.8'
# Modelos completos (fp32): no teste, o int8 saiu 4x mais lento e o fp16 não roda no processador
$Models = @('pt_BR-faber-medium', 'pt_BR-cadu-medium', 'pt_BR-jeff-medium', 'pt_BR-miro-high', 'pt_BR-dii-high')

$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root 'frontend\android'
$libs = Join-Path $android 'app\libs'
$ttsDir = Join-Path $android 'tts-assets\tts'
$cache = Join-Path $env:TEMP 'aedolia-tts'
New-Item -ItemType Directory -Force $libs, $ttsDir, $cache | Out-Null

$aar = Join-Path $libs "sherpa-onnx-$SherpaVersion.aar"
if (-not (Test-Path $aar)) {
    Write-Host "Baixando o motor sherpa-onnx $SherpaVersion..."
    Get-ChildItem $libs -Filter 'sherpa-onnx-*.aar' | Remove-Item -Force
    Invoke-WebRequest "https://github.com/k2-fsa/sherpa-onnx/releases/download/v$SherpaVersion/sherpa-onnx-$SherpaVersion.aar" -OutFile $aar
}

foreach ($model in $Models) {
    $dest = Join-Path $ttsDir $model
    if ((Test-Path "$dest\model.onnx") -and (Test-Path "$dest\tokens.txt") -and (Test-Path "$ttsDir\espeak-ng-data\en_dict")) { continue }

    $name = "vits-piper-$model"
    $tar = Join-Path $cache "$name.tar.bz2"
    if (-not (Test-Path $tar)) {
        Write-Host "Baixando a voz $model..."
        Invoke-WebRequest "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/$name.tar.bz2" -OutFile "$tar.part"
        Move-Item "$tar.part" $tar -Force
    }
    Push-Location $cache
    try { tar -xjf $tar; if ($LASTEXITCODE -ne 0) { throw "Falha ao extrair $tar" } } finally { Pop-Location }

    $src = Join-Path $cache $name
    New-Item -ItemType Directory -Force $dest | Out-Null
    Copy-Item "$src\$model.onnx" "$dest\model.onnx" -Force
    Copy-Item "$src\tokens.txt" "$dest\tokens.txt" -Force
    Get-ChildItem $src -File | Where-Object { $_.Name -match '^(MODEL_CARD|README\.md)$' } | Copy-Item -Destination $dest -Force

    # Os dados de fonética são os mesmos em todas as vozes: guarda uma cópia só (completa)
    if (-not (Test-Path "$ttsDir\espeak-ng-data\en_dict")) {
        if (Test-Path "$ttsDir\espeak-ng-data") { Remove-Item "$ttsDir\espeak-ng-data" -Recurse -Force }
        Copy-Item "$src\espeak-ng-data" "$ttsDir\espeak-ng-data" -Recurse -Force
    }
    Remove-Item $src -Recurse -Force
}

$size = (Get-ChildItem $ttsDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Host ("Motor e vozes prontos: {0} vozes, {1:N0} MB" -f $Models.Count, $size)
