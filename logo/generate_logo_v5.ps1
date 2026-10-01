# ============================================================
# 深渊回廊 Logo v5 · 极简大字 (512x512 PNG)
# 深蓝黑背景 + 青紫渐变 "深渊回廊" 2x2 大字，无图形装饰
# ============================================================

param()

Add-Type -AssemblyName System.Drawing

$S = 512
function C($a, $r, $gg, $b) { [System.Drawing.Color]::FromArgb($a, $r, $gg, $b) }

function Fill-Radial($g, $cx, $cy, $rad, $center, $edge) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddEllipse([float]($cx - $rad), [float]($cy - $rad), [float]($rad * 2), [float]($rad * 2))
    $br = New-Object System.Drawing.Drawing2D.PathGradientBrush($p)
    $br.CenterColor = $center
    $n = $p.PointCount
    $arr = New-Object 'System.Drawing.Color[]' $n
    for ($i = 0; $i -lt $n; $i++) { $arr[$i] = $edge }
    $br.SurroundColors = $arr
    $g.FillPath($br, $p)
    $br.Dispose(); $p.Dispose()
}

# ============================================================
# 生成
# ============================================================
$bmp = New-Object System.Drawing.Bitmap($S, $S, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

# 背景：深蓝黑径向渐变
$g.Clear((C 255 6 8 18))
Fill-Radial $g 256 256 440 (C 255 22 34 62) (C 255 5 7 13)

# 四个字：深 渊 / 回 廊（2x2）
$chars = @(
    @{ ch = 0x6DF1; cx = 128; cy = 128 },   # 深
    @{ ch = 0x6E0A; cx = 384; cy = 128 },   # 渊
    @{ ch = 0x56DE; cx = 128; cy = 384 },   # 回
    @{ ch = 0x5ECA; cx = 384; cy = 384 }    # 廊
)
$fontSize = 168.0
$fam = New-Object System.Drawing.FontFamily('Microsoft YaHei')
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center

$tp = New-Object System.Drawing.Drawing2D.GraphicsPath
foreach ($ch in $chars) {
    $rect = New-Object System.Drawing.RectangleF([float]($ch.cx - 120), [float]($ch.cy - 120), 240, 240)
    $tp.AddString([string][char]$ch.ch, $fam, [int][System.Drawing.FontStyle]::Bold, $fontSize, $rect, $sf)
}
$tb = $tp.GetBounds()

# 辉光（淡青色，3 层）
foreach ($gl in @(@(45, 10.0), @(70, 6.0), @(100, 3.0))) {
    $pen = New-Object System.Drawing.Pen((C $gl[0] 120 214 236), [float]$gl[1])
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($pen, $tp)
    $pen.Dispose()
}

# 渐变填充：左上青 → 右下紫
$lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.RectangleF(0, 0, 512, 512)),
    (C 255 95 208 224), (C 255 154 142 240), 35.0)
$g.FillPath($lg, $tp)
$lg.Dispose()

$bmp.Save("D:\深渊回廊\logo\logo-simple.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host 'Saved logo-simple.png'
