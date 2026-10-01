# ============================================================
# 深渊回廊 Logo v6 · 透明背景清晰大字 (512x512 PNG)
# 无背景、无辉光，青紫渐变 "深渊回廊" 2x2 大字，边缘锐利
# ============================================================

param()

Add-Type -AssemblyName System.Drawing

$S = 512
function C($a, $r, $gg, $b) { [System.Drawing.Color]::FromArgb($a, $r, $gg, $b) }

$bmp = New-Object System.Drawing.Bitmap($S, $S, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

# 完全透明背景
$g.Clear((C 0 0 0 0))

# 四个字：深 渊 / 回 廊（2x2）
$chars = @(
    @{ ch = 0x6DF1; cx = 128; cy = 128 },   # 深
    @{ ch = 0x6E0A; cx = 384; cy = 128 },   # 渊
    @{ ch = 0x56DE; cx = 128; cy = 384 },   # 回
    @{ ch = 0x5ECA; cx = 384; cy = 384 }    # 廊
)
$fontSize = 172.0
$fam = New-Object System.Drawing.FontFamily('Microsoft YaHei')
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center

$tp = New-Object System.Drawing.Drawing2D.GraphicsPath
foreach ($ch in $chars) {
    $rect = New-Object System.Drawing.RectangleF([float]($ch.cx - 122), [float]($ch.cy - 122), 244, 244)
    $tp.AddString([string][char]$ch.ch, $fam, [int][System.Drawing.FontStyle]::Bold, $fontSize, $rect, $sf)
}

# 渐变填充：左上青 → 右下紫
$lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.RectangleF(0, 0, 512, 512)),
    (C 255 95 208 224), (C 255 154 142 240), 35.0)
$g.FillPath($lg, $tp)
$lg.Dispose()

$bmp.Save("D:\深渊回廊\logo\logo-clear.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host 'Saved logo-clear.png'
