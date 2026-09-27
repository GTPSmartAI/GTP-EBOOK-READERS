# Gera o APK Android do Aedolia.
# Uso (na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File deploy\build-apk.ps1            -> APK de teste (debug)
#   powershell -ExecutionPolicy Bypass -File deploy\build-apk.ps1 -Release   -> APK assinado para distribuir
# O APK final é copiado para a pasta apk\ na raiz do projeto.
param(
    [switch]$Release,
    [string]$Drive = 'E:'
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root 'frontend'
$env:JAVA_HOME = "$env:LOCALAPPDATA\AndroidBuild\jdk21"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
if (-not (Test-Path "$env:JAVA_HOME\bin\java.exe")) { throw "JDK 21 não encontrado em $env:JAVA_HOME (veja doc/memoria/apk.md)" }
if (-not (Test-Path "$env:ANDROID_HOME\platforms")) { throw "Android SDK não encontrado em $env:ANDROID_HOME (veja doc/memoria/apk.md)" }

# 1. Build web no modo android (.env.android aponta para a API de produção) e cópia para o projeto Android.
Push-Location $frontend
try {
    npm run build:android
    if ($LASTEXITCODE -ne 0) { throw 'Falha no build do frontend' }
} finally { Pop-Location }

# 2. O caminho do projeto tem acentos ("Criação"), que quebram o Gradle/cmd no Windows.
#    Mapeia o frontend numa unidade virtual sem acentos só durante o build.
subst $Drive /D 2>$null | Out-Null
subst $Drive "$frontend"
try {
    $task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
    cmd /c "cd /d $Drive\android && $Drive\android\gradlew.bat $task --no-daemon -q"
    if ($LASTEXITCODE -ne 0) { throw "Falha no Gradle ($task)" }
} finally {
    subst $Drive /D | Out-Null
}

# 3. Copia o APK para apk\ com a data no nome.
$kind = if ($Release) { 'release' } else { 'debug' }
$src = Get-ChildItem "$frontend\android\app\build\outputs\apk\$kind\*.apk" | Select-Object -First 1
$outDir = Join-Path $root 'apk'
New-Item -ItemType Directory -Force $outDir | Out-Null
$dest = Join-Path $outDir ("aedolia-$kind-" + (Get-Date -Format 'yyyyMMdd-HHmm') + '.apk')
Copy-Item $src.FullName $dest
Write-Host "APK gerado: $dest ($([math]::Round($src.Length/1MB,1)) MB)"
