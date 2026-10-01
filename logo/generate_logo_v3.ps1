# ============================================================
# 深渊回廊 Logo v3 · 回廊之眼 (512x512 PNG)
# 风格：延续游戏界面青紫渐变 + 神秘眼睛符号
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

# 眼圈（带缺口）+ 辉光
function Draw-EyeRing($g, $cx, $cy, $r, $width, $color, $start, $sweep, $glow) {
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
# 候选 C：回廊之眼
# ============================================================
$bmpC = New-Object System.Drawing.Bitmap($S, $S, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gC = [System.Drawing.Graphics]::FromImage($bmpC)
$gC.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$gC.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$gC.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$gC.Clear((C 255 9 11 20))
Fill-Radial $gC 256 220 420 (C 255 26 38 68) (C 255 5 7 14)

# 眼圈（带缺口朝下，留出文字空间）
$eyeCyan = (C 255 95 208 224)
$eyePurple = (C 255 154 142 240)
$eyeBright = (C 255 180 240 255)

Draw-EyeRing $gC 256 220 180 12 $eyeCyan 100 360 @( @(@{W=2.5}, 0.25), @(@{W=1.6}, 0.40), @(@{W=1.0}, 0.55) )
Draw-EyeRing $gC 256 220 180 12 $eyeCyan 100 360 @()
Draw-EyeRing $gC 256 220 180 12 $eyePurple 100 360 @()
Draw-EyeRing $gC 256 220 180 12 $eyeBright 100 360 @()

# 虹膜环（同心环，青紫渐变）
for ($i = 0; $i -lt 3; $i++) {
    $r = 120 - $i * 40
    $color = if ($i -eq 0) { $eyeCyan } elseif ($i -eq 1) { $eyePurple } else { $eyeBright }
    $width = 6 - $i * 1.5
    $pen = New-Object System.Drawing.Pen($color, [float]$width)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $gC.DrawEllipse($pen, [float]($256 - $r), [float]($220 - $r), [float]($r * 2), [float]($r * 2))
    $pen.Dispose()
}

# 瞳孔（深黑点 + 光晕）
Fill-Radial $gC 256 220 38 (C 80 120 180 255) (C 0 80 120 180)
$core = New-Object System.Drawing.SolidBrush((C 255 15 20 35))
$gC.FillEllipse($core, 249, 213, 14, 14)
$core.Dispose()

# 眼睫毛（可选，增加细节）
for ($i = 0; $i -lt 8; $i++) {
    $ang = (100 + 45 * $i) * [math]::PI / 180
    $dx = [math]::Cos($ang); $dy = [math]::Sin($ang)
    $pen = New-Object System.Drawing.Pen((C 70 100 150 180), 1.2)
    $gC.DrawLine($pen, [float](256 + 165 * $dx), [float](220 + 165 * $dy), [float](256 + 180 * $dx), [float](220 + 180 * $dy))
    $pen.Dispose()
}

# 文字：深渊回廊（青紫渐变）
$title = [string][char]0x6DF1 + [char]0x6E0A + [char]0x56DE + [char]0x5ECA
$fam = New-Object System.Drawing.FontFamily('Microsoft YaHei')
$sf0 = New-Object System.Drawing.StringFormat
$tp = New-Object System.Drawing.Drawing2D.GraphicsPath
$tp.AddString($title, $fam, [int][System.Drawing.FontStyle]::Bold, 88.0, (New-Object System.Drawing.PointF(0, 0)), $sf0)
$tb = $tp.GetBounds()
$tx = (512 - $tb.Width) / 2 - $tb.X
$ty = 360 - $tb.Y
$mt = New-Object System.Drawing.Drawing2D.Matrix
$mt.Translate([float]$tx, [float]$ty)
$tp.Transform($mt)
$tb2 = $tp.GetBounds()

# 文字辉光
foreach ($gl in @(@(60, 15.0), @(95, 9.0), @(140, 5.5), @(200, 3.0))) {
    $pen = New-Object System.Drawing.Pen((C $gl[0] 120 214 236), [float]$gl[1])
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $gC.DrawPath($pen, $tp)
    $pen.Dispose()
}

# 文字渐变填充
$lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.RectangleF([float]$tb2.X, [float]$tb2.Y, [float]$tb2.Width, [float]$tb2.Height)),
    (C 255 95 208 224), (C 255 154 142 240), 35.0)
$gC.FillPath($lg, $tp)
$lg.Dispose()

# 副标题
$f2 = New-Object System.Drawing.Font('Microsoft YaHei', 12, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$sb2 = New-Object System.Drawing.SolidBrush((C 180 130 200 235))
$sf2 = New-Object System.Drawing.StringFormat
$sf2.Alignment = [System.Drawing.StringAlignment]::Center
$gC.DrawString('A B Y S S   C O R R I D O R', $f2, $sb2, (New-Object System.Drawing.RectangleF(0, 470, 512, 22)), $sf2)
$sb2.Dispose()

$bmpC.Save("D:\深渊回廊\logo\logo-eye.png", [System.Drawing.Imaging.ImageFormat]::Png)
$gC.Dispose(); $bmpC.Dispose()
Write-Host 'Saved logo-eye.png'
