# ============================================================
# 深渊回廊 Logo v4 · 深渊之门 (512x512 PNG)
# 风格：拱门剪影 + 隧道透视 + 发光缝隙，延续青紫科技感
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

function Draw-LineWithGlow($g, $x1, $y1, $x2, $y2, $width, $color, $glow) {
    if ($null -ne $glow -and $glow.Count -gt 0) {
        foreach ($gl in $glow) {
            $pen = New-Object System.Drawing.Pen((C ([int](120 * $gl[1])) $color.R $color.G $color.B), [float]($width * $gl[0].W))
            $g.DrawLine($pen, [float]$x1, [float]$y1, [float]$x2, [float]$y2)
            $pen.Dispose()
        }
    }
    $pen = New-Object System.Drawing.Pen($color, [float]$width)
    $g.DrawLine($pen, [float]$x1, [float]$y1, [float]$x2, [float]$y2)
    $pen.Dispose()
}

# ============================================================
# 候选 D：深渊之门
# ============================================================
$bmpD = New-Object System.Drawing.Bitmap($S, $S, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gD = [System.Drawing.Graphics]::FromImage($bmpD)
$gD.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$gD.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$gD.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$gD.Clear((C 255 5 7 20))
Fill-Radial $gD 256 220 420 (C 255 10 15 35) (C 255 5 7 14)

# 拱门轮廓（两条斜线 + 顶部圆弧）
$gateColor = (C 255 20 30 50)
Draw-LineWithGlow $gD 150 480 256 40 12 $gateColor @( @(@{W=3.0}, 0.25), @(@{W=1.8}, 0.45) )
Draw-LineWithGlow $gD 362 480 256 40 12 $gateColor @( @(@{W=3.0}, 0.25), @(@{W=1.8}, 0.45) )
$rect = New-Object System.Drawing.RectangleF([float]($256 - 220), [float]($40 - 220), [float]($220 * 2), [float]($220 * 2))
$gD.DrawArc(New-Object System.Drawing.Pen($gateColor, 10), $rect, 0, 180)

# 拱门顶部缝隙（发光）
$glowColor = (C 255 95 208 224)
Draw-LineWithGlow $gD 220 40 292 40 8 $glowColor @( @(@{W=2.0}, 0.40), @(@{W=1.2}, 0.65) )

# 隧道透视（6 条放射线从底部向深处收缩）
for ($i = 0; $i -lt 6; $i++) {
    $ang = ($i * 60) * [math]::PI / 180
    $x1 = 256 + 80 * [math]::Cos($ang)
    $y1 = 480
    $x2 = 256 + 40 * [math]::Cos($ang)
    $y2 = 240
    $width = 6 - $i * 0.5
    $color = if ($i -eq 0) { $glowColor } else { (C 255 154 142 240) }
    Draw-LineWithGlow $gD $x1 $y1 $x2 $y2 $width $color @()
}

# 深处光点（中心）
Fill-Radial $gD 256 240 38 (C 180 200 255 255) (C 0 180 200 255)
$core = New-Object System.Drawing.SolidBrush((C 255 240 252 255))
$gD.FillEllipse($core, 249, 233, 14, 14)
$core.Dispose()

# 文字：深渊回廊
$title = [string][char]0x6DF1 + [char]0x6E0A + [char]0x56DE + [char]0x5ECA
$fam = New-Object System.Drawing.FontFamily('Microsoft YaHei')
$sf0 = New-Object System.Drawing.StringFormat
$tp = New-Object System.Drawing.Drawing2D.GraphicsPath
$tp.AddString($title, $fam, [int][System.Drawing.FontStyle]::Bold, 76.0, (New-Object System.Drawing.PointF(0, 0)), $sf0)
$tb = $tp.GetBounds()
$tx = (512 - $tb.Width) / 2 - $tb.X
$ty = 420 - $tb.Y
$mt = New-Object System.Drawing.Drawing2D.Matrix
$mt.Translate([float]$tx, [float]$ty)
$tp.Transform($mt)
$tb2 = $tp.GetBounds()

# 文字辉光
foreach ($gl in @(@(50, 12.0), @(80, 7.0), @(110, 4.0), @(150, 2.0))) {
    $pen = New-Object System.Drawing.Pen((C $gl[0] 120 214 236), [float]$gl[1])
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $gD.DrawPath($pen, $tp)
    $pen.Dispose()
}

# 文字渐变填充
$lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.RectangleF([float]$tb2.X, [float]$tb2.Y, [float]$tb2.Width, [float]$tb2.Height)),
    (C 255 95 208 224), (C 255 154 142 240), 35.0)
$gD.FillPath($lg, $tp)
$lg.Dispose()

# 副标题
$f2 = New-Object System.Drawing.Font('Microsoft YaHei', 12, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$sb2 = New-Object System.Drawing.SolidBrush((C 180 130 200 235))
$sf2 = New-Object System.Drawing.StringFormat
$sf2.Alignment = [System.Drawing.StringAlignment]::Center
$gD.DrawString('A B Y S S   C O R R I D O R', $f2, $sb2, (New-Object System.Drawing.RectangleF(0, 490, 512, 22)), $sf2)
$sb2.Dispose()

$bmpD.Save("D:\深渊回廊\logo\logo-gate.png", [System.Drawing.Imaging.ImageFormat]::Png)
$gD.Dispose(); $bmpD.Dispose()
Write-Host 'Saved logo-gate.png'
