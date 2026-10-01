/* P3-3a：引擎侧的 24 件遗物承载
 *   ① RELIC_FX 表填满 24 条
 *   ② MECH_BASE 基准快照 + applyMechRelics()（把遗物加成写回机制常量）
 *   ③ recomputeRelicFx 末尾调用它
 * 用法：node 其他/_p3c.js
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '战斗2D.js');
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

/* ---------- ① RELIC_FX：24 件全量 ---------- */
rep('RELIC_FX 24 件',
`  var RELIC_FX = {
    lightBoots:  { stamMax: 30, stamRegen: 0.30 },      // 轻盈之靴：体力上限 +30、停手回复 +30%
    ironWall:    { guardPerfect: 80 },                  // 铁壁：完美格挡窗口 +80ms
    greedyHeart: { goldGain: 0.35, takenMult: 0.10 }    // 贪婪之心：金币 +35%、受伤 +10%
  };`,
`  var RELIC_FX = {
    // --- 体力 / 闪避 ---
    lightBoots:      { stamMax: 30, stamRegen: 0.30 },        // 轻盈之靴：体力上限 +30、停手回复 +30%
    windShadow:      { dodgeInvuln: 120, dashDist: 0.15 },    // 疾风残影：无敌帧 +120ms、冲刺距离 +15%
    perfectInstinct: { perfectWindow: 80, sharpDur: 2000 },   // 完美直觉：完美窗口 +80ms、锐利 +2s
    airFeather:      { airDrag: 0.40 },                       // 滞空之羽：空中闪避保留的坠速更小
    // --- 防御 ---
    ironWall:        { guardPerfect: 80 },                    // 铁壁：完美格挡窗口 +80ms
    counterBlade:    { counterMult: 1, shieldGain: 3 },       // 反击之刃：盾反 ×2→×3 并回 3 护盾
    thornHeart:      { thornExtra: 3 },                       // 荆棘之心：被命中反弹更多
    shieldResonance: { shieldGain: 2 },                       // 护盾共鸣：每次获得护盾额外 +2
    immortalTotem:   { perk: 'totem' },                       // 不朽图腾：致命伤保留 1 血（每层一次）
    // --- 输出 ---
    furyBlood:       { furyGain: 0.25 },                      // 狂热之血：狂怒获取 +25%
    desperateStrike: { dmgLowHp: 0.25 },                      // 破釜沉舟：生命 ≤50% 时伤害 +25%
    chainMaster:     { chainWindow: 250, sweepMult: 0.50 },   // 连击大师：连招窗口 +250ms、横扫 +50%
    executioner:     { executeBonus: 0.10 },                  // 处决者：斩杀线 +10%
    huntMark:        { executeSet: 0.50 },                    // 猎杀标记：斩杀线提升至 50%
    bloodThirst:     { vampireExtra: 1 },                     // 血之饥渴：吸血等级 +1
    heavyStrike:     { diveMult: 0.40, buryChance: 0.12 },    // 重击：跳劈倍率 +0.4、埋人概率 +12%
    sharpCore:       { sharpMultSet: 3.0 },                   // 锐利核心：锐利倍率 2.2 → 3.0
    // --- 远程 ---
    trackingCharm:   { homing: 0.50, shotSpeed: 0.10 },       // 追踪符：追踪 +50%、弹速 +10%
    piercingArrow:   { pierce: 1 },                           // 穿透之矢：穿透 +1
    // --- 经济 / 恢复 ---
    merchantEye:     { shopDiscount: 0.20 },                  // 商人眼光：商店价格 −20%
    greedyHeart:     { goldGain: 0.35, takenMult: 0.10 },     // 贪婪之心：金币 +35%、受伤 +10%
    soulDrinker:     { healKill: 2 },                         // 汲魂者：击杀回复 2 生命
    fateWheel:       { perk: 'fateWheel' },                   // 命运轮盘：每清一房随机收益
    abyssMark:       { perk: 'fourChoices' }                  // 深渊印记：三选一变四选一
  };

  /* ============================================================
     机制常量的「基准值」快照
     ------------------------------------------------------------
     24 件遗物里有 18 件做的是「把引擎既有机制的参数挪一点」——
     例如完美闪避窗口 150ms → 230ms。这些常量散落在 DODGE / GUARD / CHAIN /
     DIVE / STAMINA / FURY / RANGED_ATTACK 里，被几十处热路径直接读取。
     与其去改那几十处读取点，不如**在下发遗物时按基准值整体重算一次常量**：
     读取点一行都不用动，也不会因为反复下发而累加漂移。
     （新增遗物只要往 RELIC_FX 加一行、在这里补一条映射即可。）
     ============================================================ */
  var MECH_BASE = {
    staminaMax: STAMINA.max,
    staminaRegen: STAMINA.regen,
    dodgeInvuln: DODGE.invuln,
    dodgeSpeed: DODGE.speed,
    dodgePerfect: DODGE.perfect,
    dodgeSharp: DODGE.sharp,
    dodgeSharpMult: DODGE.sharpMult,
    dodgeAirDrag: DODGE.airDrag,
    guardPerfect: GUARD.perfect,
    guardCounterMult: GUARD.counterMult,
    guardShieldGain: GUARD.shieldGain,
    chainWindow: CHAIN.window,
    chainSweepMult: CHAIN.sweepMult,
    diveMult: DIVE.mult,
    diveBuryChance: DIVE.buryChance,
    furyGainKill: FURY.gainKill,
    furyGainChain: FURY.gainChain,
    furyGainPerfect: FURY.gainPerfect,
    furyGainHurt: FURY.gainHurt,
    furyGainHit: { normal: FURY.gainHit.normal, elite: FURY.gainHit.elite, mirror: FURY.gainHit.mirror, boss: FURY.gainHit.boss },
    ranged: {
      ranger: { pierce: RANGED_ATTACK.ranger.pierce, speed: RANGED_ATTACK.ranger.speed, homing: 0 },
      mage: { pierce: RANGED_ATTACK.mage.pierce, speed: RANGED_ATTACK.mage.speed, homing: RANGED_ATTACK.mage.homing || 0 },
      sage: { pierce: RANGED_ATTACK.sage.pierce, speed: RANGED_ATTACK.sage.speed, homing: 0 }
    }
  };

  /**
   * 把遗物加成写回机制常量（每次下发遗物整体重算）
   * 一律「基准 + 增量」或「基准 × 倍率」，绝不做累加 —— 否则反复下发会越加越多。
   * 注意：这里只动"机制参数"，不改伤害结算；伤害/金币那类走 Scene 里的 relicFx() 热路径。
   */
  function applyMechRelics() {
    var fx = HOST.relicFx || {};
    function num(k, d) { var v = fx[k]; return (typeof v === 'number') ? v : (d || 0); }

    STAMINA.max = Math.round(MECH_BASE.staminaMax + num('stamMax', 0));
    STAMINA.regen = MECH_BASE.staminaRegen * (1 + num('stamRegen', 0));

    DODGE.invuln = Math.round(MECH_BASE.dodgeInvuln + num('dodgeInvuln', 0));
    DODGE.speed = Math.round(MECH_BASE.dodgeSpeed * (1 + num('dashDist', 0)));
    DODGE.perfect = Math.round(MECH_BASE.dodgePerfect + num('perfectWindow', 0));
    DODGE.sharp = Math.round(MECH_BASE.dodgeSharp + num('sharpDur', 0));
    DODGE.sharpMult = num('sharpMultSet', 0) > 0
      ? num('sharpMultSet', 0)
      : MECH_BASE.dodgeSharpMult * (1 + num('sharpMult', 0));
    DODGE.airDrag = Math.max(0.05, MECH_BASE.dodgeAirDrag * (1 - num('airDrag', 0)));

    GUARD.perfect = Math.round(MECH_BASE.guardPerfect + num('guardPerfect', 0));
    GUARD.counterMult = MECH_BASE.guardCounterMult + num('counterMult', 0);
    GUARD.shieldGain = Math.round(MECH_BASE.guardShieldGain + num('shieldGain', 0));

    CHAIN.window = Math.round(MECH_BASE.chainWindow + num('chainWindow', 0));
    CHAIN.sweepMult = MECH_BASE.chainSweepMult * (1 + num('sweepMult', 0));

    DIVE.mult = MECH_BASE.diveMult + num('diveMult', 0);
    DIVE.buryChance = Math.min(0.9, MECH_BASE.diveBuryChance + num('buryChance', 0));

    var fg = 1 + num('furyGain', 0);
    FURY.gainKill = Math.max(1, Math.round(MECH_BASE.furyGainKill * fg));
    FURY.gainChain = Math.max(1, Math.round(MECH_BASE.furyGainChain * fg));
    FURY.gainPerfect = Math.max(1, Math.round(MECH_BASE.furyGainPerfect * fg));
    FURY.gainHurt = Math.max(1, Math.round(MECH_BASE.furyGainHurt * fg));
    FURY.gainHit = {
      normal: Math.max(1, Math.round(MECH_BASE.furyGainHit.normal * fg)),
      elite: Math.max(1, Math.round(MECH_BASE.furyGainHit.elite * fg)),
      mirror: Math.max(1, Math.round(MECH_BASE.furyGainHit.mirror * fg)),
      boss: Math.max(1, Math.round(MECH_BASE.furyGainHit.boss * fg))
    };

    var pierceAdd = Math.round(num('pierce', 0));
    var shotScale = 1 + num('shotSpeed', 0);
    var homingScale = 1 + num('homing', 0);
    ['ranger', 'mage', 'sage'].forEach(function (h) {
      var ra = RANGED_ATTACK[h], b = MECH_BASE.ranged[h];
      if (!ra || !b) return;
      ra.pierce = b.pierce + pierceAdd;
      ra.speed = Math.round(b.speed * shotScale);
      if (b.homing > 0) ra.homing = b.homing * homingScale;
    });
  }`);

/* ---------- ③ recomputeRelicFx 末尾应用 ---------- */
rep('recomputeRelicFx 应用机制遗物',
`      HOST.relicFx = fx;
      return fx;
    }`,
`      HOST.relicFx = fx;
      // 机制型遗物（完美窗口 / 连招 / 跳劈 / 体力 / 狂怒 / 远程）直接写回常量，
      // 好处是几十处热路径读取点一行都不用改（见 MECH_BASE 的说明）
      try { applyMechRelics(); } catch (e) { console.warn('[战斗2D] 应用机制遗物失败：', e); }
      return fx;
    }`);

fs.writeFileSync(F, s);
console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
