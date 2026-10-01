# ============================================================
# 深渊回廊 Logo SVG 生成器 (512x512 viewBox，与 PNG 同参数)
# ============================================================
param([string]$OutPath = "D:\深渊回廊\logo\logo.svg")

function R2($v) { [math]::Round([double]$v, 2) }

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">')

# ---------- defs ----------
[void]$sb.AppendLine('<defs>')
[void]$sb.AppendLine('  <radialGradient id="bgGrad" cx="50%" cy="42.6%" r="78%">')
[void]$sb.AppendLine('    <stop offset="0%" stop-color="#203058"/>')
[void]$sb.AppendLine('    <stop offset="100%" stop-color="#070a14"/>')
[void]$sb.AppendLine('  </radialGradient>')
[void]$sb.AppendLine('  <radialGradient id="bgCore" cx="50%" cy="42.6%" r="41%">')
[void]$sb.AppendLine('    <stop offset="0%" stop-color="#2e4676"/>')
[void]$sb.AppendLine('    <stop offset="100%" stop-color="#121a30"/>')
[void]$sb.AppendLine('  </radialGradient>')
[void]$sb.AppendLine('  <radialGradient id="glowBig" cx="50%" cy="40.6%" r="21.9%">')
[void]$sb.AppendLine('    <stop offset="0%" stop-color="rgba(190,246,255,0.59)"/>')
[void]$sb.AppendLine('    <stop offset="100%" stop-color="rgba(190,246,255,0)"/>')
[void]$sb.AppendLine('  </radialGradient>')
[void]$sb.AppendLine('  <radialGradient id="glowSmall" cx="50%" cy="40.6%" r="10.2%">')
[void]$sb.AppendLine('    <stop offset="0%" stop-color="rgba(240,252,255,0.92)"/>')
[void]$sb.AppendLine('    <stop offset="100%" stop-color="rgba(240,252,255,0)"/>')
[void]$sb.AppendLine('  </radialGradient>')
[void]$sb.AppendLine('  <radialGradient id="auraCyan" cx="23%" cy="84%" r="47%">')
[void]$sb.AppendLine('    <stop offset="0%" stop-color="rgba(95,208,224,0.16)"/>')
[void]$sb.AppendLine('    <stop offset="100%" stop-color="rgba(95,208,224,0)"/>')
[void]$sb.AppendLine('  </radialGradient>')
[void]$sb.AppendLine('  <radialGradient id="auraPurple" cx="81%" cy="18.6%" r="47%">')
[void]$sb.AppendLine('    <stop offset="0%" stop-color="rgba(154,142,240,0.18)"/>')
[void]$sb.AppendLine('    <stop offset="100%" stop-color="rgba(154,142,240,0)"/>')
[void]$sb.AppendLine('  </radialGradient>')
[void]$sb.AppendLine('  <linearGradient id="textGrad" x1="0%" y1="100%" x2="100%" y2="0%">')
[void]$sb.AppendLine('    <stop offset="0%" stop-color="#5fd0e0"/>')
[void]$sb.AppendLine('    <stop offset="100%" stop-color="#9a8ef0"/>')
[void]$sb.AppendLine('  </linearGradient>')
[void]$sb.AppendLine('</defs>')

# ---------- 背景 ----------
[void]$sb.AppendLine('<rect width="512" height="512" fill="#05070f"/>')
[void]$sb.AppendLine('<circle cx="256" cy="218" r="400" fill="url(#bgGrad)"/>')
[void]$sb.AppendLine('<circle cx="256" cy="218" r="210" fill="url(#bgCore)"/>')
[void]$sb.AppendLine('<circle cx="118" cy="430" r="240" fill="url(#auraCyan)"/>')
[void]$sb.AppendLine('<circle cx="415" cy="95" r="240" fill="url(#auraPurple)"/>')

# ---------- 星尘 ----------
$rand = New-Object System.Random(20240520)
for ($i = 0; $i -lt 110; $i++) {
    $sx = $rand.Next(6, 506); $sy = $rand.Next(6, 396)
    $dx = $sx - 256; $dy = $sy - 210
    if (([math]::Sqrt($dx * $dx + $dy * $dy)) -lt 62) { $i--; continue }
    $r = R2 (0.6 + $rand.NextDouble() * 1.4)
    $a = R2 ((12 + $rand.Next(58)) / 255.0)
    [void]$sb.AppendLine('<circle cx="' + $sx + '" cy="' + $sy + '" r="' + $r + '" fill="rgba(172,222,255,' + $a + ')"/>')
}

# ---------- 深处光晕 ----------
[void]$sb.AppendLine('<circle cx="256" cy="208" r="112" fill="url(#glowBig)"/>')
[void]$sb.AppendLine('<circle cx="256" cy="208" r="52" fill="url(#glowSmall)"/>')

# ---------- 侧墙透视边线 ----------
[void]$sb.AppendLine('<line x1="10" y1="512" x2="256" y2="208" stroke="rgba(110,165,215,0.16)" stroke-width="2"/>')
[void]$sb.AppendLine('<line x1="502" y1="512" x2="256" y2="208" stroke="rgba(110,165,215,0.16)" stroke-width="2"/>')

# ---------- 透视拱门回廊 ----------
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
    $d = 'M ' + (R2 ($VX - $r)) + ',' + (R2 $yc) +
         ' A ' + (R2 $r) + ',' + (R2 $r) + ' 0 0 1 ' + (R2 ($VX + $r)) + ',' + (R2 $yc) +
         ' L ' + (R2 ($VX + $r)) + ',' + (R2 $gd) +
         ' L ' + (R2 ($VX - $r)) + ',' + (R2 $gd) + ' Z'
    $passes = @(
        @([float]($wd * 4.2), 0.09),
        @([float]($wd * 2.5), 0.20),
        @([float]($wd * 1.4), 0.42),
        @([float]($wd * 0.8), 0.95)
    )
    foreach ($pp in $passes) {
        $pa = [int]($aa * $pp[1]); if ($pa -gt 255) { $pa = 255 }
        [void]$sb.AppendLine('<path d="' + $d + '" fill="none" stroke="rgb(' + $rr + ',' + $gg + ',' + $bb + ')" stroke-opacity="' + (R2 ($pa / 255.0)) + '" stroke-width="' + (R2 $pp[0]) + '" stroke-linecap="round" stroke-linejoin="round"/>')
    }
}

# ---------- 深渊之眼：星芒 + 核心 ----------
for ($i = 0; $i -lt 6; $i++) {
    $ang = $i * 60 * [math]::PI / 180
    $dx = [math]::Cos($ang); $dy = [math]::Sin($ang)
    $x1 = R2 (256 + 9 * $dx); $y1 = R2 (208 + 9 * $dy)
    $x2 = R2 (256 + 60 * $dx); $y2 = R2 (208 + 60 * $dy)
    $x3 = R2 (256 + 108 * $dx); $y3 = R2 (208 + 108 * $dy)
    [void]$sb.AppendLine('<line x1="' + $x1 + '" y1="' + $y1 + '" x2="' + $x2 + '" y2="' + $y2 + '" stroke="rgba(205,245,255,0.37)" stroke-width="1.5" stroke-linecap="round"/>')
    [void]$sb.AppendLine('<line x1="' + $x2 + '" y1="' + $y2 + '" x2="' + $x3 + '" y2="' + $y3 + '" stroke="rgba(170,225,255,0.18)" stroke-width="1.1" stroke-linecap="round"/>')
}
[void]$sb.AppendLine('<circle cx="256" cy="208" r="7.5" fill="#ffffff"/>')

# ---------- 标题：深渊回廊 ----------
[void]$sb.AppendLine('<text x="256" y="476" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-weight="bold" font-size="84" fill="#78d6ec" opacity="0.24" stroke="#78d6ec" stroke-width="16" stroke-linejoin="round">深渊回廊</text>')
[void]$sb.AppendLine('<text x="256" y="476" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-weight="bold" font-size="84" fill="#78d6ec" opacity="0.37" stroke="#78d6ec" stroke-width="10" stroke-linejoin="round">深渊回廊</text>')
[void]$sb.AppendLine('<text x="256" y="476" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-weight="bold" font-size="84" fill="#78d6ec" opacity="0.59" stroke="#78d6ec" stroke-width="6" stroke-linejoin="round">深渊回廊</text>')
[void]$sb.AppendLine('<text x="256" y="476" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-weight="bold" font-size="84" fill="url(#textGrad)" opacity="0.95" stroke="#cfefff" stroke-width="2.4" stroke-linejoin="round">深渊回廊</text>')

# ---------- 副标题 ----------
[void]$sb.AppendLine('<text x="256" y="494" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="13" letter-spacing="5" fill="rgba(130,208,242,0.68)">ABYSS CORRIDOR</text>')

[void]$sb.AppendLine('</svg>')

$dir = Split-Path $OutPath
if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
[System.IO.File]::WriteAllText($OutPath, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Saved: $OutPath"
