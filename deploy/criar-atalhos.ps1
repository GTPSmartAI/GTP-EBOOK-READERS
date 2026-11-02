# Cria os atalhos "Aedolia" (com o ícone do app) na Área de Trabalho e no Menu Iniciar, abrindo o Aedolia-PC.bat.
# Uso (na raiz do projeto): powershell -ExecutionPolicy Bypass -File deploy\criar-atalhos.ps1
# Rodar de novo se a pasta do projeto mudar de lugar (o atalho guarda o caminho).
# O ícone (deploy\aedolia.ico) é gerado a partir de frontend\public\icon-512.png.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$bat = Join-Path $root 'Aedolia-PC.bat'
$png = Join-Path $root 'frontend\public\icon-512.png'
$ico = Join-Path $PSScriptRoot 'aedolia.ico'

# 1. Ícone do Windows (.ico com vários tamanhos). Só o de 256 vai como PNG: nos menores, partes do Windows
#    só entendem o bitmap clássico (32 bits com transparência), e com PNG o ícone aparecia como ruído.
#    Refeito a cada execução (leva menos de um segundo).
& {
    Add-Type -AssemblyName System.Drawing
    $source = [System.Drawing.Image]::FromFile($png)
    $images = @()
    try {
        foreach ($size in 16, 24, 32, 48, 64, 128, 256) {
            $bmp = New-Object System.Drawing.Bitmap $size, $size
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.DrawImage($source, 0, 0, $size, $size)
            $g.Dispose()
            $ms = New-Object System.IO.MemoryStream
            if ($size -ge 256) {
                $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
            } else {
                # BITMAPINFOHEADER + pixels BGRA de baixo para cima + máscara AND (zerada: a transparência vem do alfa)
                $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
                $lock = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
                $pixels = New-Object byte[] ($size * $size * 4)
                [System.Runtime.InteropServices.Marshal]::Copy($lock.Scan0, $pixels, 0, $pixels.Length)
                $bmp.UnlockBits($lock)
                $maskRow = [int]([math]::Ceiling($size / 32) * 4)
                $bw = New-Object System.IO.BinaryWriter $ms
                $bw.Write([UInt32]40); $bw.Write([Int32]$size); $bw.Write([Int32]($size * 2))
                $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]0)
                $bw.Write([UInt32]($pixels.Length + $maskRow * $size))
                $bw.Write([Int32]0); $bw.Write([Int32]0); $bw.Write([UInt32]0); $bw.Write([UInt32]0)
                for ($y = $size - 1; $y -ge 0; $y--) { $bw.Write($pixels, $y * $size * 4, $size * 4) }
                $bw.Write((New-Object byte[] ($maskRow * $size)))
                $bw.Flush()
            }
            $bmp.Dispose()
            $images += , @($size, $ms.ToArray())
        }
    } finally { $source.Dispose() }

    $out = New-Object System.IO.MemoryStream
    $w = New-Object System.IO.BinaryWriter $out
    $w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$images.Count)
    $offset = 6 + 16 * $images.Count
    foreach ($img in $images) {
        $size = $img[0]; $data = $img[1]
        $dim = if ($size -ge 256) { 0 } else { $size }
        $w.Write([byte]$dim); $w.Write([byte]$dim); $w.Write([byte]0); $w.Write([byte]0)
        $w.Write([UInt16]1); $w.Write([UInt16]32)
        $w.Write([UInt32]$data.Length); $w.Write([UInt32]$offset)
        $offset += $data.Length
    }
    foreach ($img in $images) { $w.Write([byte[]]$img[1]) }
    $w.Flush()
    [System.IO.File]::WriteAllBytes($ico, $out.ToArray())
    $w.Dispose()
    Write-Host "Ícone gerado: $ico"
}

# 2. Atalhos
$shell = New-Object -ComObject WScript.Shell
$places = @(
    [Environment]::GetFolderPath('Desktop'),   # Área de Trabalho (também quando está no OneDrive)
    [Environment]::GetFolderPath('Programs')   # Menu Iniciar
)
foreach ($dir in $places) {
    $lnk = $shell.CreateShortcut((Join-Path $dir 'Aedolia.lnk'))
    $lnk.TargetPath = $bat
    $lnk.WorkingDirectory = $root
    $lnk.IconLocation = "$ico,0"
    $lnk.Description = 'Aedolia no PC (teste com as vozes do celular)'
    $lnk.WindowStyle = 1 # janela normal: mostra o progresso e é fechando ela que o app para
    $lnk.Save()
    Write-Host "Atalho criado: $(Join-Path $dir 'Aedolia.lnk')"
}
