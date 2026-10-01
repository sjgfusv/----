/* P4-3b：商品目录提成模块级唯一数据源 + 图鉴「道具&商品」改派生
 * 侦察发现：图鉴那 12 条是手抄的 —— 里面有个「强化武器」商店里根本不存在，
 * 而商店真有的「护盾药剂」图鉴里没有。
 * 用法：node 其他/_p4j.js
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '主程序.js');
const CRLF = '\r\n';
let s = fs.readFileSync(F, 'utf8');
let fails = 0;
function rep(label, from, to, expect) {
  const f = from.split('\n').join(CRLF);
  const t = to.split('\n').join(CRLF);
  const n = s.split(f).length - 1;
  const want = (expect == null) ? 1 : expect;
  if (n !== want) { console.log('!! ' + label + ' 命中 ' + n + '（期望 ' + want + '）'); fails++; return; }
  s = s.split(f).join(t);
  console.log('ok ' + label);
}

/* ---------- ① 模块级目录常量 + buildShopOptions 改用它们 ---------- */
rep('商品目录提成常量',
`function buildShopOptions() {
  if (!state.shopPurchaseCount) {
    state.shopPurchaseCount = {};
  }

  const common = [
    { label: '治疗药水', cost: 10, expCost: 10, rarity: 'common', maxPurchase: 20 + (state.shopLimitBonus || 0), apply: () => { addPotion('heal', 1); } },
    { label: '力量药水', cost: 18, expCost: 18, rarity: 'common', maxPurchase: 20 + (state.shopLimitBonus || 0), apply: () => { addPotion('strength', 1); } },
    { label: '护盾药剂', cost: 12, expCost: 12, rarity: 'common', maxPurchase: 20 + (state.shopLimitBonus || 0), apply: () => { state.player.shield += 4; addLog('你喝下护盾药剂，获得 4 点护盾。'); } },
    { label: '锐利之刃', cost: 20, expCost: 20, rarity: 'common', maxPurchase: 20 + (state.shopLimitBonus || 0), apply: () => { state.player.attack += 2; addLog('你磨砺了武器，攻击力提高 2。'); } },
    { label: '生命宝石', cost: 22, expCost: 22, rarity: 'common', maxPurchase: 20 + (state.shopLimitBonus || 0), apply: () => { state.player.maxHp += 3; state.player.hp += 3; addLog('生命宝石提升了你的生命上限 3 点。'); } },
  ];

  const rare = [
    { label: '巨力药剂', cost: 25, expCost: 25, rarity: 'rare', maxPurchase: 5 + (state.shopLimitBonus || 0), apply: () => { state.player.attack += 2; state.player.hp = Math.min(state.player.maxHp, state.player.hp + 5); addLog('你使用了巨力药剂，攻击提高 2 并恢复 5 点生命。'); } },
    { label: '勇者铠甲', cost: 30, expCost: 30, rarity: 'rare', maxPurchase: 5 + (state.shopLimitBonus || 0), apply: () => { state.player.maxHp += 8; state.player.hp += 8; addLog('你装备了勇者铠甲，生命上限提高 8 点。'); } },
    { label: '灵能徽章', cost: 28, expCost: 28, rarity: 'rare', maxPurchase: 5 + (state.shopLimitBonus || 0), apply: () => { state.player.attack += 1; state.player.shield += 3; addLog('你戴上了灵能徽章，攻击提高 1 并获得 3 点护盾。'); } },
    { label: '龙鳞护盾', cost: 35, expCost: 35, rarity: 'rare', maxPurchase: 5 + (state.shopLimitBonus || 0), apply: () => { state.player.shield += 10; addLog('你举起了龙鳞护盾，获得 10 点护盾！'); } },
    { label: '暗影披风', cost: 32, expCost: 32, rarity: 'rare', maxPurchase: 5 + (state.shopLimitBonus || 0), apply: () => { state.player.shield += 5; state.player.attack += 1; addLog('你披上了暗影披风，护盾+5，攻击+1。'); } },
    { label: '生命之源', cost: 38, expCost: 38, rarity: 'rare', maxPurchase: 5 + (state.shopLimitBonus || 0), apply: () => { state.player.maxHp += 10; state.player.hp += 10; addLog('你融合了生命之源，生命上限+10！'); } },
    { label: '治愈圣典', cost: 36, expCost: 36, rarity: 'rare', maxPurchase: 5 + (state.shopLimitBonus || 0), apply: () => { state.player.maxHp += 5; state.player.hp = Math.min(state.player.maxHp, state.player.hp + 12); addLog('你阅读了治愈圣典，生命上限+5，恢复 12 点生命。'); } },
  ];

  const availableCommon = common.filter(item => {`,
`/* ============================================================
   商店商品目录（模块级唯一数据源）
   ------------------------------------------------------------
   为什么提到模块级：图鉴的「道具&商品」以前是手抄一份，结果抄出了
   「强化武器」这种**商店里根本不存在**的条目，而商店真有的「护盾药剂」图鉴里反而没有。
   现在两边共用这一份，改价、加货、下架都只有一处要动。
   ⚠️ shopLimitBonus 是**运行时**才定的（商队护送事件会给 +2），
      所以这里只存基准限购值，实际限购在 buildShopOptions 里现算。
   ============================================================ */
const SHOP_ITEMS_COMMON = [
  { label: '治疗药水', cost: 10, rarity: 'common', maxPurchase: 20, desc: '立刻获得 1 瓶治疗药水，随时按 L 回复生命。', apply: () => { addPotion('heal', 1); } },
  { label: '力量药水', cost: 18, rarity: 'common', maxPurchase: 20, desc: '立刻获得 1 瓶力量药水，下一场战斗攻击大幅提升。', apply: () => { addPotion('strength', 1); } },
  { label: '护盾药剂', cost: 12, rarity: 'common', maxPurchase: 20, desc: '获得 4 点护盾，优先抵扣伤害。', apply: () => { state.player.shield += 4; addLog('你喝下护盾药剂，获得 4 点护盾。'); } },
  { label: '锐利之刃', cost: 20, rarity: 'common', maxPurchase: 20, desc: '攻击力永久 +2。', apply: () => { state.player.attack += 2; addLog('你磨砺了武器，攻击力提高 2。'); } },
  { label: '生命宝石', cost: 22, rarity: 'common', maxPurchase: 20, desc: '生命上限 +3 并立刻回复 3 点。', apply: () => { state.player.maxHp += 3; state.player.hp += 3; addLog('生命宝石提升了你的生命上限 3 点。'); } },
];

const SHOP_ITEMS_RARE = [
  { label: '巨力药剂', cost: 25, rarity: 'rare', maxPurchase: 5, desc: '攻击 +2，并回复 5 点生命。', apply: () => { state.player.attack += 2; state.player.hp = Math.min(state.player.maxHp, state.player.hp + 5); addLog('你使用了巨力药剂，攻击提高 2 并恢复 5 点生命。'); } },
  { label: '勇者铠甲', cost: 30, rarity: 'rare', maxPurchase: 5, desc: '生命上限 +8 并立刻回复 8 点。', apply: () => { state.player.maxHp += 8; state.player.hp += 8; addLog('你装备了勇者铠甲，生命上限提高 8 点。'); } },
  { label: '灵能徽章', cost: 28, rarity: 'rare', maxPurchase: 5, desc: '攻击 +1，并获得 3 点护盾。', apply: () => { state.player.attack += 1; state.player.shield += 3; addLog('你戴上了灵能徽章，攻击提高 1 并获得 3 点护盾。'); } },
  { label: '龙鳞护盾', cost: 35, rarity: 'rare', maxPurchase: 5, desc: '获得 10 点护盾。', apply: () => { state.player.shield += 10; addLog('你举起了龙鳞护盾，获得 10 点护盾！'); } },
  { label: '暗影披风', cost: 32, rarity: 'rare', maxPurchase: 5, desc: '护盾 +5，攻击 +1。', apply: () => { state.player.shield += 5; state.player.attack += 1; addLog('你披上了暗影披风，护盾+5，攻击+1。'); } },
  { label: '生命之源', cost: 38, rarity: 'rare', maxPurchase: 5, desc: '生命上限 +10 并立刻回复 10 点。', apply: () => { state.player.maxHp += 10; state.player.hp += 10; addLog('你融合了生命之源，生命上限+10！'); } },
  { label: '治愈圣典', cost: 36, rarity: 'rare', maxPurchase: 5, desc: '生命上限 +5，并回复 12 点生命。', apply: () => { state.player.maxHp += 5; state.player.hp = Math.min(state.player.maxHp, state.player.hp + 12); addLog('你阅读了治愈圣典，生命上限+5，恢复 12 点生命。'); } },
];

function buildShopOptions() {
  if (!state.shopPurchaseCount) {
    state.shopPurchaseCount = {};
  }

  // 从模块级目录现算：expCost 与 cost 同值（内核既有规则），限购加上运行时加成
  const withBonus = (it) => Object.assign({}, it, {
    expCost: it.cost,
    maxPurchase: it.maxPurchase + (state.shopLimitBonus || 0)
  });
  const common = SHOP_ITEMS_COMMON.map(withBonus);
  const rare = SHOP_ITEMS_RARE.map(withBonus);

  const availableCommon = common.filter(item => {`);

/* ---------- ② 图鉴「道具&商品」改派生 ---------- */
{
  const a = s.indexOf("    '道具&商品': [");
  const b = s.indexOf("    '增益': [");
  if (a < 0 || b < 0 || b <= a) { console.log('!! 图鉴商品块定位失败'); fails++; }
  else {
    const NEW = [
      "    '道具&商品': (() => {",
      '      // 与商店共用同一份目录（SHOP_ITEMS_COMMON / SHOP_ITEMS_RARE）——',
      '      // 以前这里是手抄的，抄出了商店里并不存在的「强化武器」。',
      "      const list = (typeof SHOP_ITEMS_COMMON !== 'undefined' ? SHOP_ITEMS_COMMON : [])",
      "        .concat(typeof SHOP_ITEMS_RARE !== 'undefined' ? SHOP_ITEMS_RARE : []);",
      '      return list.map(it => ({',
      "        title: it.label + '（' + it.cost + ' 金币）',",
      "        description: (it.desc || '') + (it.rarity === 'rare' ? '　· 稀有' : '')",
      '      }));',
      '    })(),',
      ''
    ].join(CRLF);
    s = s.slice(0, a) + NEW + s.slice(b);
    console.log('ok 图鉴「道具&商品」已改为派生');
  }
}

fs.writeFileSync(F, s);
console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
