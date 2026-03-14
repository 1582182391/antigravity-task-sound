# 生成多款通知音效 WAV 文件
# 使用 $PSScriptRoot 避免中文路径编码问题

$outputDir = Join-Path $PSScriptRoot "sounds"
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir | Out-Null }

$sr = 44100

function New-WavFile {
    param([string]$FilePath, [double[]]$Samples)
    
    $dataSize = $Samples.Length * 2
    $fileSize = 36 + $dataSize
    
    $stream = [System.IO.MemoryStream]::new()
    $writer = [System.IO.BinaryWriter]::new($stream)
    
    $writer.Write([byte[]]@(0x52,0x49,0x46,0x46))
    $writer.Write([int]$fileSize)
    $writer.Write([byte[]]@(0x57,0x41,0x56,0x45))
    $writer.Write([byte[]]@(0x66,0x6D,0x74,0x20))
    $writer.Write([int]16)
    $writer.Write([int16]1)
    $writer.Write([int16]1)
    $writer.Write([int]$sr)
    $writer.Write([int]($sr*2))
    $writer.Write([int16]2)
    $writer.Write([int16]16)
    $writer.Write([byte[]]@(0x64,0x61,0x74,0x61))
    $writer.Write([int]$dataSize)
    
    foreach ($s in $Samples) {
        $clamped = [Math]::Max(-1.0, [Math]::Min(1.0, $s))
        $writer.Write([int16]($clamped * 32767 * 0.4))
    }
    
    $writer.Flush()
    $bytes = $stream.ToArray()
    $writer.Close()
    $stream.Close()
    [System.IO.File]::WriteAllBytes($FilePath, $bytes)
}

function Add-Note {
    param([double[]]$buf, [double]$freq, [double]$startSec, [double]$durSec, [double]$decay, [double]$vol, [double]$harmonic2 = 0.3, [double]$harmonic3 = 0.1)
    $ss = [int]($startSec * $sr)
    $ns = [int]($durSec * $sr)
    for ($i = 0; $i -lt $ns; $i++) {
        $idx = $ss + $i
        if ($idx -ge $buf.Length) { break }
        $t = $i / $sr
        $e = [Math]::Exp(-$t * $decay)
        $v = [Math]::Sin(2 * [Math]::PI * $freq * $t) * $e
        $v += [Math]::Sin(2 * [Math]::PI * $freq * 2 * $t) * $e * $harmonic2
        $v += [Math]::Sin(2 * [Math]::PI * $freq * 3 * $t) * $e * $harmonic3
        $buf[$idx] += $v * $vol
    }
}

# 1. 柔和钟琴 ~6秒
Write-Host "1/4 Generating gentle-chime.wav..."
$n = [int]($sr * 6)
$s = [double[]]::new($n)
Add-Note $s 523.25 0.0 2.0 2.5 0.35
Add-Note $s 659.25 0.5 2.0 2.5 0.35
Add-Note $s 783.99 1.0 2.0 2.5 0.35
Add-Note $s 1046.5 1.5 2.5 2.5 0.35
Add-Note $s 783.99 2.5 2.0 2.5 0.35
Add-Note $s 1046.5 3.5 2.5 2.5 0.35
New-WavFile -FilePath (Join-Path $outputDir "gentle-chime.wav") -Samples $s
Write-Host "  Done!"

# 2. 温暖铃声 ~5秒  
Write-Host "2/4 Generating warm-bell.wav..."
$n2 = [int]($sr * 5)
$s2 = [double[]]::new($n2)
Add-Note $s2 440.00 0.0 3.0 1.8 0.30 0.25 0.08
Add-Note $s2 554.37 0.3 3.0 1.8 0.30 0.25 0.08
Add-Note $s2 659.25 0.6 3.0 1.8 0.30 0.25 0.08
Add-Note $s2 880.00 1.2 3.5 1.8 0.30 0.25 0.08
New-WavFile -FilePath (Join-Path $outputDir "warm-bell.wav") -Samples $s2
Write-Host "  Done!"

# 3. 清脆水滴 ~7秒
Write-Host "3/4 Generating crystal-drop.wav..."
$n3 = [int]($sr * 7)
$s3 = [double[]]::new($n3)
Add-Note $s3 1318.5 0.0 1.5 4.0 0.40 0.15 0.0
Add-Note $s3 987.77 0.8 1.5 4.0 0.40 0.15 0.0
Add-Note $s3 1318.5 1.6 1.5 4.0 0.40 0.15 0.0
Add-Note $s3 1567.9 2.4 2.0 4.0 0.40 0.15 0.0
Add-Note $s3 1318.5 3.5 1.5 4.0 0.40 0.15 0.0
Add-Note $s3 1567.9 4.3 1.5 4.0 0.40 0.15 0.0
Add-Note $s3 1975.5 5.0 2.0 4.0 0.40 0.15 0.0
New-WavFile -FilePath (Join-Path $outputDir "crystal-drop.wav") -Samples $s3
Write-Host "  Done!"

# 4. 舒缓旋律 ~8秒
Write-Host "4/4 Generating soft-melody.wav..."
$n4 = [int]($sr * 8)
$s4 = [double[]]::new($n4)
Add-Note $s4 392.00 0.0 1.8 1.5 0.35 0.20 0.0
Add-Note $s4 440.00 1.0 1.8 1.5 0.35 0.20 0.0
Add-Note $s4 523.25 2.0 2.0 1.5 0.35 0.20 0.0
Add-Note $s4 587.33 3.2 2.0 1.5 0.35 0.20 0.0
Add-Note $s4 523.25 4.5 2.0 1.5 0.35 0.20 0.0
Add-Note $s4 659.25 5.5 2.5 1.5 0.35 0.20 0.0
Add-Note $s4 523.25 6.5 1.5 1.5 0.35 0.20 0.0
New-WavFile -FilePath (Join-Path $outputDir "soft-melody.wav") -Samples $s4
Write-Host "  Done!"

Write-Host "`nAll 4 sound files generated!"
