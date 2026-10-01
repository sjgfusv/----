/* P4-3b：「遗物」图鉴分类改为派生（从宿主的 24 件池取，带品质）
 * 硬编码 17 条是旧遗物，与现在的 24 件池早已不同步（还漏了 2 条条件遗物）。
 * 宿主的 RELIC_POOL 是唯一数据源 → 图鉴不可能再漂移。
 * 用法：node 其他/_p4f.js
 */
const fs = require('fs');
const path = require('path');

/* ① 宿主暴露遗物池给内核图鉴 */
{
  const F = path.join(__dirname, '..', '经典2D.js');
  let s = fs.readFileSync(F, 'utf8');
  const from = [
    '    syncPoints: syncPoints,',
    '',
    '    /* ============================================================'
  ].join('\n');
  const to = [
    '    syncPoints: syncPoints,',
    '',
    '    /** 遗物池（24 件）—— 内核图鉴直接读它，避免"图鉴手抄一份、迟早和实现漂移" */',
    '    relicPool: function () {',
    '      return RELIC_POOL.map(function (r) {',
    '        return { id: r.id, label: r.label, quality: r.quality, desc: r.desc };',
    '      });',
    '    },',
    '    /** 诅咒分级（轻 / 重）—— 同上，图鉴用它而不是自己再列一份 */',
    '    curseTiers: function () {',
    '      return { light: CURSE_LIGHT.slice(), heavy: CURSE_HEAVY.slice() };',
    '    },',
    '',
    '    /* ============================================================'
  ].join('\n');
  const n = s.split(from).length - 1;
  if (n !== 1) { console.log('!! 宿主锚点命中 ' + n); process.exit(1); }
  fs.writeFileSync(F, s.split(from).join(to));
  console.log('ok 宿主已暴露 relicPool / curseTiers');
}

/* ② 内核图鉴改为派生 */
{
  const F = path.join(__dirname, '..', '主程序.js');
  const CRLF = '\r\n';
  let s = fs.readFileSync(F, 'utf8');
  const a = s.indexOf("    '遗物': [");
  const b = s.indexOf("    '道具&商品': [");
  if (a < 0 || b < 0 || b <= a) { console.log('!! 内核图鉴定位失败'); process.exit(1); }
  const NEW = [
    "    '遗物': (() => {",
    '      // 数据源 = 宿主的 24 件池（唯一实现），图鉴不再手抄 ——',
    '      // 之前那份硬编码 17 条是旧遗物，早就和实现脱节了（还漏了 2 条条件遗物）。',
    '      const QUAL = { common: \'普通\', rare: \'稀有\', legendary: \'传说\' };',
    '      const pool = (window.经典2D && typeof window.经典2D.relicPool === \'function\')',
    '        ? window.经典2D.relicPool() : [];',
    '      if (!pool.length) {',
    '        // 宿主没加载（理论上不会发生）：给一句说明，而不是显示一份过期的假数据',
    '        return [{ title: \'（实时战斗未加载）\', description: \'遗物数据来自 经典2D.js，请在游戏内查看。\' }];',
    '      }',
    '      return pool.map(r => ({',
    '        title: r.label + \'（\' + (QUAL[r.quality] || \'普通\') + \'）\',',
    '        description: r.desc',
    '      }));',
    '    })(),',
    ''
  ].join(CRLF);
  s = s.slice(0, a) + NEW + s.slice(b);
  fs.writeFileSync(F, s);
  console.log('ok 内核图鉴「遗物」已改为派生 24 件');
}
