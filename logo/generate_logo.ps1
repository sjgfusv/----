# ============================================================
# 深渊回廊 Logo 生成器  (512x512 PNG)
# 视觉概念：深邃背景 + 向内透视收缩的发光拱门回廊
#           + 深处青白光点（深渊之眼）+ 青紫渐变标题
# ============================================================
param([string]$OutPath = "D:\深渊回廊\logo\logo.png")

Add-Type -AssemblyName System.Drawing

$S = 512
$bmp = New-Object System.Drawing.Bitmap($S, $S, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

function C($a, $r, $gg, $b) { [System.Drawing.Color]::FromArgb($a, $r, $gg, $b) }

# 径向渐变填充（圆形路径 + PathGradientBrush）
function Fill-Radial($cx, $cy, $rad, $center, $edge) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddEllipse([float]($cx - $rad), [float]($cy - $rad), [float]($rad * 2), [float]($rad * 2))
    $br = New-Object System.Drawing.Drawing2D.PathGradientBrush($p)
    $br.CenterColor = $center
    $n = $p.PointCount
    $arr = New-Object 'System.Drawing.Color[]' $n
    for ($i = 0; $i -lt $n; $i++) { $arr[$i] = $edge }
    $br.SurroundColors = $arr
    $g.FillPath($br, $p)
    $br.Dispose()
    $p.Dispose()
}

# ---------------- 背景 ----------------
$g.Clear((C 255 5 7 15))
Fill-Radial 256 218 400 (C 255 32 48 88) (C 255 7 10 20)   # 主深蓝光
Fill-Radial 256 218 210 (C 255 46 70 118) (C 255 18 26 48) # 中心提亮
Fill-Radial 118 430 240 (C 40 95 208 224) (C 0 95 208 224) # 左下青色氛围
Fill-Radial 415 95 240 (C 46 154 142 240) (C 0 154 142 240) # 右上紫色氛围

# ---------------- 星尘 ----------------
$rand = New-Object System.Random(20240520)
for ($i = 0; $i -lt 110; $i++) {
    $sx = $rand.Next(6, 506)
    $sy = $rand.Next(6, 396)
    $dx = $sx - 256; $dy = $sy - 210
    if (([math]::Sqrt($dx * $dx + $dy * $dy)) -lt 62) { continue }
    $r = 0.6 + $rand.NextDouble() * 1.4
    $a = 12 + $rand.Next(58)
    $sb = New-Object System.Drawing.SolidBrush((C $a 172 222 255))
    $g.FillEllipse($sb, [float]($sx - $r), [float]($sy - $r), [float]($r * 2), [float]($r * 2))
    $sb.Dispose()
}

# ---------------- 深处光晕（拱门之下） ----------------
Fill-Radial 256 208 112 (C 150 190 246 255) (C 0 190 246 255)
Fill-Radial 256 208 52 (C 235 240 252 255) (C 0 240 252 255)

# ---------------- 透视拱门回廊 ----------------
$VX = 256.0; $VY = 208.0; $S0 = 0.82; $ZS = 0.72
for ($k = 0; $k -le 5; $k++) {
    $z = $S0 * [math]::Pow($ZS, $k)
    $r  = 230.0 * $z
    $yc = $VY + 80.0 * $z
    $gd = $VY + 230.0 * $z
    $t  = $k / 5.0
    $rr = [int](143 + (214 - 143) * $t)
    $gg = [int](140 + (250 - 140) * $t)
    $bb = [int](232 + (255 - 232) * $t)
    $aa = [int](150 + (255 - 150) * $t)
    $wd = 7.5 - 5.0 * $t
    $passes = @(
        @([float]($wd * 4.2), 0.09),
        @([float]($wd * 2.5), 0.20),
        @([float]($wd * 1.4), 0.42),
        @([float]($wd * 0.8), 0.95)
    )
    foreach ($pp in $passes) {
        $pa = [int]($aa * $pp[1]); if ($pa -gt 255) { $pa = 255 }
        $pen = New-Object System.Drawing.Pen((C $pa $rr $gg $bb), [float]$pp[0])
        $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
        $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $rect = New-Object System.Drawing.RectangleF([float]($VX - $r), [float]($yc - $r), [float]($r * 2), [float]($r * 2))
        $g.DrawArc($pen, $rect, 180, 180)
        $g.DrawLine($pen, [float]($VX - $r), [float]$yc, [float]($VX - $r), [float]$gd)
        $g.DrawLine($pen, [float]($VX + $r), [float]$yc, [float]($VX + $r), [float]$gd)
        $g.DrawLine($pen, [float]($VX - $r), [float]$gd, [float]($VX + $r), [float]$gd)
        $pen.Dispose()
    }
}

# ---------------- 侧墙透视边线 ----------------
$wp = New-Object System.Drawing.Pen((C 42 110 165 215), 2.0)
$g.DrawLine($wp, 10, 512, [float]$VX, [float]$VY)
$g.DrawLine($wp, 502, 512, [float]$VX, [float]$VY)
$wp.Dispose()

# ---------------- 深渊之眼：核心 + 星芒 ----------------
$core = New-Object System.Drawing.SolidBrush((C 255 255 255 255))
$g.FillEllipse($core, 248.5, 200.5, 15, 15)
$core.Dispose()
for ($i = 0; $i -lt 6; $i++) {
    $ang = $i * 60 * [math]::PI / 180
    $dx = [math]::Cos($ang); $dy = [math]::Sin($ang)
    $p1 = New-Object System.Drawing.Pen((C 95 205 245 255), 1.5)
    $g.DrawLine($p1, [float](256 + 9 * $dx), [float](208 + 9 * $dy), [float](256 + 60 * $dx), [float](208 + 60 * $dy))
    $p2 = New-Object System.Drawing.Pen((C 46 170 225 255), 1.1)
    $g.DrawLine($p2, [float](256 + 60 * $dx), [float](208 + 60 * $dy), [float](256 + 108 * $dx), [float](208 + 108 * $dy))
    $p1.Dispose(); $p2.Dispose()
}

# ---------------- 标题：深渊回廊（青→紫渐变 + 辉光） ----------------
$title = [string][char]0x6DF1 + [char]0x6E0A + [char]0x56DE + [char]0x5ECA
$fam = New-Object System.Drawing.FontFamily('Microsoft YaHei')
$sf0 = New-Object System.Drawing.StringFormat
$tp = New-Object System.Drawing.Drawing2D.GraphicsPath
$tp.AddString($title, $fam, [int][System.Drawing.FontStyle]::Bold, 84.0, (New-Object System.Drawing.PointF(0, 0)), $sf0)
$tb = $tp.GetBounds()
$tx = (512 - $tb.Width) / 2 - $tb.X
$ty = 404 - $tb.Y
$mt = New-Object System.Drawing.Drawing2D.Matrix
$mt.Translate([float]$tx, [float]$ty)
$tp.Transform($mt)
$tb2 = $tp.GetBounds()

# 文字辉光（多重描边）
$glow = @(
    @(60, 16.0),
    @(95, 10.0),
    @(150, 6.0),
    @(220, 3.0)
)
foreach ($g2 in $glow) {
    $pen = New-Object System.Drawing.Pen((C $g2[0] 120 214 236), [float]$g2[1])
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($pen, $tp)
    $pen.Dispose()
}
# 渐变填充
$lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.RectangleF([float]$tb2.X, [float]$tb2.Y, [float]$tb2.Width, [float]$tb2.Height)),
    (C 255 95 208 224), (C 255 154 142 240), 35.0)
$g.FillPath($lg, $tp)
$lg.Dispose()

# ---------------- 副标题：ABYSS CORRIDOR ----------------
$f2 = New-Object System.Drawing.Font('Microsoft YaHei', 13, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$t2 = 'A B Y S S   C O R R I D O R'
$sb2 = New-Object System.Drawing.SolidBrush((C 175 130 208 242))
$sf2 = New-Object System.Drawing.StringFormat
$sf2.Alignment = [System.Drawing.StringAlignment]::Center
$g.DrawString($t2, $f2, $sb2, (New-Object System.Drawing.RectangleF(0, 488, 512, 24)), $sf2)
$sb2.Dispose()

# ---------------- 保存 ----------------
$dir = Split-Path $OutPath
if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "Saved: $OutPath"
