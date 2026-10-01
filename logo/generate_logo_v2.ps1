# ============================================================
# 深渊回廊 Logo v2 - 两个候选风格 (512x512 PNG)
#   候选A 回廊之环  : 金色圆环徽章 + 同心环透视 + 深渊之眼
#   候选B 极简排版  : 菱形回廊之眼符号 + 青紫渐变大字
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

function Draw-Ring($g, $cx, $cy, $r, $width, $color, $start, $sweep, $glow) {
    $rect = New-Object System.Drawing.RectangleF([float]($cx - $r), [float]($cy - $r), [float]($r * 2), [float]($r * 2))
    if ($null -ne $glow -and $glow.Count -gt 0) {
        foreach ($gl in $glow) {
            $pen = New-Object System.Drawing.Pen((C ([int](120 * $gl[1])) $color.R $color.G $color.B), [float]($width * $gl[0].W))
            $g.DrawArc($pen, $rect, $start, $sweep)
            $pen.Dispose()
        }
    }
    $pen = New-Object System.Drawing.Pen($color, [float]$width)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawArc($pen, $rect, $start, $sweep)
    $pen.Dispose()
}

# ============================================================
# 候选 A：回廊之环
# ============================================================
$bmpA = New-Object System.Drawing.Bitmap($S, $S, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gA = [System.Drawing.Graphics]::FromImage($bmpA)
$gA.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$gA.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$gA.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$gA.Clear((C 255 6 9 18))
Fill-Radial $gA 256 250 430 (C 255 26 38 68) (C 255 7 11 24)
Fill-Radial $gA 256 216 150 (C 90 40 62 100) (C 0 40 62 100)
Fill-Radial $gA 256 216 46 (C 170 190 246 255) (C 0 190 246 255)

$rand = New-Object System.Random(778899)
for ($i = 0; $i -lt 34; $i++) {
    $sx = $rand.Next(8, 504); $sy = $rand.Next(8, 504)
    $dx = $sx - 256; $dy = $sy - 216; $d = [math]::Sqrt($dx * $dx + $dy * $dy)
    if ($d -lt 190 -or $d -gt 260) { continue }
    $r = 0.7 + $rand.NextDouble() * 1.2
    $a = 14 + $rand.Next(46)
    $sb = New-Object System.Drawing.SolidBrush((C $a 190 220 255))
    $gA.FillEllipse($sb, [float]($sx - $r), [float]($sy - $r), [float]($r * 2), [float]($r * 2))
    $sb.Dispose()
}

$gold = (C 255 244 210 126)
$goldSoft = (C 230 232 197 124)
$goldDim = (C 190 216 169 95)
$goldFaint = (C 150 200 154 90)

Draw-Ring $gA 256 216 160 7 $gold 98 344 @( @(@{W=2.6}, 0.28), @(@{W=1.6}, 0.42) )
Draw-Ring $gA 256 216 128 4.5 $goldSoft 98 344 @()
Draw-Ring $gA 256 216 100 3 $goldDim 98 344 @()
Draw-Ring $gA 256 216 76 1.8 $goldFaint 98 344 @()

for ($i = 0; $i -lt 8; $i++) {
    $ang = (22.5 + 45 * $i) * [math]::PI / 180
    $dx = [math]::Cos($ang); $dy = [math]::Sin($ang)
    $pen = New-Object System.Drawing.Pen((C 150 222 181 110), 2.0)
    $gA.DrawLine($pen, [float](256 + 78 * $dx), [float](216 + 78 * $dy), [float](256 + 156 * $dx), [float](216 + 156 * $dy))
    $pen.Dispose()
}

$core = New-Object System.Drawing.SolidBrush((C 255 240 252 255))
$gA.FillEllipse($core, 250.5, 210.5, 11, 11)
$core.Dispose()

$pen = New-Object System.Drawing.Pen((C 210 232 192 118), 2)
$gA.DrawLine($pen, 146, 386, 366, 386)
$pen.Dispose()

$title = [string][char]0x6DF1 + [char]0x6E0A + [char]0x56DE + [char]0x5ECA
$fam = New-Object System.Drawing.FontFamily('Microsoft YaHei')
$sf0 = New-Object System.Drawing.StringFormat
$tp = New-Object System.Drawing.Drawing2D.GraphicsPath
$tp.AddString($title, $fam, [int][System.Drawing.FontStyle]::Bold, 74.0, (New-Object System.Drawing.PointF(0, 0)), $sf0)
$tb = $tp.GetBounds()
$tx = (512 - $tb.Width) / 2 - $tb.X
$ty = 396 - $tb.Y
$mt = New-Object System.Drawing.Drawing2D.Matrix
$mt.Translate([float]$tx, [float]$ty)
$tp.Transform($mt)
$tb2 = $tp.GetBounds()

foreach ($gl in @(@(70, 13.0), @(110, 8.0), @(170, 4.6), @(230, 2.4))) {
    $pen = New-Object System.Drawing.Pen((C $gl[0] 226 184 92), [float]$gl[1])
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $gA.DrawPath($pen, $tp)
    $pen.Dispose()
}

$lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.RectangleF([float]$tb2.X, [float]$tb2.Y, [float]$tb2.Width, [float]$tb2.Height)),
    (C 255 246 220 143), (C 255 201 148 58), 90.0)
$gA.FillPath($lg, $tp)
$lg.Dispose()

$f2 = New-Object System.Drawing.Font('Microsoft YaHei', 12, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$sb2 = New-Object System.Drawing.SolidBrush((C 180 110 190 235))
$sf2 = New-Object System.Drawing.StringFormat
$sf2.Alignment = [System.Drawing.StringAlignment]::Center
$gA.DrawString('A B Y S S   C O R R I D O R', $f2, $sb2, (New-Object System.Drawing.RectangleF(0, 478, 512, 24)), $sf2)
$sb2.Dispose()

$bmpA.Save("D:\深渊回廊\logo\logo-ring.png", [System.Drawing.Imaging.ImageFormat]::Png)
$gA.Dispose(); $bmpA.Dispose()
Write-Host 'Saved logo-ring.png'

# ============================================================
# 候选 B：极简排版
# ============================================================
$bmpB = New-Object System.Drawing.Bitmap($S, $S, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gB = [System.Drawing.Graphics]::FromImage($bmpB)
$gB.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$gB.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$gB.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$gB.Clear((C 255 5 8 16))
Fill-Radial $gB 256 150 430 (C 255 24 36 66) (C 255 6 9 20)
Fill-Radial $gB 256 108 70 (C 120 60 80 130) (C 0 60 80 130)

$pen = New-Object System.Drawing.Pen((C 255 240 205 118), 3)
$gB.DrawPolygon($pen, @(
    (New-Object System.Drawing.PointF(256, 56)),
    (New-Object System.Drawing.PointF(308, 108)),
    (New-Object System.Drawing.PointF(256, 160)),
    (New-Object System.Drawing.PointF(204, 108))
))
$pen.Dispose()

$pen = New-Object System.Drawing.Pen((C 210 226 185 120), 1.5)
$gB.DrawPolygon($pen, @(
    (New-Object System.Drawing.PointF(256, 70)),
    (New-Object System.Drawing.PointF(288, 108)),
    (New-Object System.Drawing.PointF(256, 146)),
    (New-Object System.Drawing.PointF(224, 108))
))
$pen.Dispose()

Fill-Radial $gB 256 108 34 (C 180 200 248 255) (C 0 200 248 255)
$core = New-Object System.Drawing.SolidBrush((C 255 242 252 255))
$gB.FillEllipse($core, 252.5, 104.5, 7, 7)
$core.Dispose()

$tp = New-Object System.Drawing.Drawing2D.GraphicsPath
$tp.AddString($title, $fam, [int][System.Drawing.FontStyle]::Bold, 112.0, (New-Object System.Drawing.PointF(0, 0)), $sf0)
$tb = $tp.GetBounds()
$tx = (512 - $tb.Width) / 2 - $tb.X
$ty = 196 - $tb.Y
$mt = New-Object System.Drawing.Drawing2D.Matrix
$mt.Translate([float]$tx, [float]$ty)
$tp.Transform($mt)
$tb2 = $tp.GetBounds()

foreach ($gl in @(@(20, 0.18), @(12, 0.12), @(7, 0.07), @(3.5, 0.03))) {
    $pen = New-Object System.Drawing.Pen((C $gl[0] 110 190 225), [float]$gl[1])
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $gB.DrawPath($pen, $tp)
    $pen.Dispose()
}

$lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.RectangleF([float]$tb2.X, [float]$tb2.Y, [float]$tb2.Width, [float]$tb2.Height)),
    (C 255 95 208 224), (C 255 154 142 240), 35.0)
$gB.FillPath($lg, $tp)
$lg.Dispose()

$pen = New-Object System.Drawing.Pen((C 190 224 184 110), 1.6)
$gB.DrawLine($pen, 120, 392, 216, 392)
$gB.DrawLine($pen, 296, 392, 392, 392)
$pen.Dispose()

$pen = New-Object System.Drawing.Pen((C 200 236 198 126), 2)
$gB.DrawLine($pen, 216, 392, 220, 388)
$gB.DrawLine($pen, 220, 388, 224, 392)
$gB.DrawLine($pen, 224, 392, 220, 396)
$gB.DrawLine($pen, 220, 396, 216, 392)
$gB.DrawLine($pen, 288, 392, 292, 388)
$gB.DrawLine($pen, 292, 388, 296, 392)
$gB.DrawLine($pen, 296, 392, 292, 396)
$gB.DrawLine($pen, 292, 396, 288, 392)
$pen.Dispose()

$sb2 = New-Object System.Drawing.SolidBrush((C 170 130 208 242))
$gB.DrawString('A B Y S S   C O R R I D O R', $f2, $sb2, (New-Object System.Drawing.RectangleF(0, 408, 512, 22)), $sf2)
$sb2.Dispose()

$f3 = New-Object System.Drawing.Font('Microsoft YaHei', 14, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$sb3 = New-Object System.Drawing.SolidBrush((C 130 226 196 120))
$gB.DrawString('— 咕咕嘎嘎 —', $f3, $sb3, (New-Object System.Drawing.RectangleF(0, 470, 512, 24)), $sf2)
$sb3.Dispose()

$bmpB.Save("D:\深渊回廊\logo\logo-minimal.png", [System.Drawing.Imaging.ImageFormat]::Png)
$gB.Dispose(); $bmpB.Dispose()
Write-Host 'Saved logo-minimal.png'
