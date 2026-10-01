/* P3-3c：宿主侧遗物系统（24 件池 + 权重抽取 + 掉落 + 三选一面板）
 * 用法：node 其他/_p3e.js
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '经典2D.js');
let s = fs.readFileSync(F, 'utf8');
let fails = 0;
function rep(label, from, to, expect) {
  const n = s.split(from).length - 1;
  const want = (expect == null) ? 1 : expect;
  if (n !== want) { console.log('!! ' + label + ' 命中 ' + n + '（期望 ' + want + '）'); fails++; return; }
  s = s.split(from).join(to);
  console.log('ok ' + label);
}

/* ---------- ① 遗物池 + 抽取 + 掉落，替换旧的 4 条映射表 ---------- */
rep('遗物池与掉落',
`  var RELIC_LABEL_TO_ID = {
    '幸运硬币': 'greedyHeart',    // 金钱向 → 交给引擎做金币增益
    '商人眼光': 'greedyHeart',
    '坚固护符': 'ironWall',       // 防御向 → 完美格挡窗口
    '铁卫纹章': 'ironWall'
  };

  function pushRelics() {
    var e = engine(), s = S();
    if (!e || !s || typeof e.setRelics !== 'function') return false;
    var ids = [];
    (s.relics || []).forEach(function (r) {
      var label = (typeof r === 'string') ? r : (r && r.label);
      if (!label) return;
      var id = RELIC_LABEL_TO_ID[label];
      if (id && ids.indexOf(id) < 0) ids.push(id);
    });
    e.setRelics(ids);
    return true;
  }`,
`  /* ============================================================
     遗物池（24 件 · 规划 §3.4）
     ------------------------------------------------------------
     每一件都挂在引擎**已经存在**的机制上：数值型由引擎的 applyMechRelics 写回
     机制常量，行为型由 hasPerk 在各个钩子里生效（图腾 / 轮盘 / 护盾共鸣 / 斩杀线）。
     内核的 state.relics 只存 { id, label, quality, description } —— 效果一律由引擎
     消费。好处是存档里不再有函数，也就没有"读档后 apply 变 undefined"的老毛病。
     ============================================================ */
  var RELIC_POOL = [
    { id: 'lightBoots',      label: '轻盈之靴', quality: 'common',    desc: '体力上限 +30，停手回复 +30%' },
    { id: 'windShadow',      label: '疾风残影', quality: 'rare',      desc: '闪避无敌帧 +120ms，冲刺距离 +15%' },
    { id: 'perfectInstinct', label: '完美直觉', quality: 'rare',      desc: '完美闪避窗口 +80ms，锐利持续 +2s' },
    { id: 'airFeather',      label: '滞空之羽', quality: 'rare',      desc: '空中闪避保留的坠速更小（滞空更久）' },
    { id: 'ironWall',        label: '铁壁',     quality: 'common',    desc: '完美格挡窗口 +80ms' },
    { id: 'counterBlade',    label: '反击之刃', quality: 'rare',      desc: '盾反伤害 ×2 → ×3，盾反回 3 护盾' },
    { id: 'thornHeart',      label: '荆棘之心', quality: 'rare',      desc: '被命中时反弹更多伤害' },
    { id: 'shieldResonance', label: '护盾共鸣', quality: 'common',    desc: '任何来源获得的护盾额外 +2' },
    { id: 'immortalTotem',   label: '不朽图腾', quality: 'legendary', desc: '致命伤保留 1 血，每层一次' },
    { id: 'furyBlood',       label: '狂热之血', quality: 'common',    desc: '狂怒获取 +25%' },
    { id: 'desperateStrike', label: '破釜沉舟', quality: 'rare',      desc: '生命 ≤50% 时伤害 +25%' },
    { id: 'chainMaster',     label: '连击大师', quality: 'rare',      desc: '连招窗口 +250ms，第 3 段横扫 +50%' },
    { id: 'executioner',     label: '处决者',   quality: 'rare',      desc: '斩杀线 +10%' },
    { id: 'huntMark',        label: '猎杀标记', quality: 'legendary', desc: '斩杀线提升至 50%' },
    { id: 'bloodThirst',     label: '血之饥渴', quality: 'rare',      desc: '吸血等级 +1' },
    { id: 'heavyStrike',     label: '重击',     quality: 'common',    desc: '跳劈倍率 +0.4，埋人概率 +12%' },
    { id: 'trackingCharm',   label: '追踪符',   quality: 'rare',      desc: '远程普攻追踪 +50%，弹速 +10%' },
    { id: 'piercingArrow',   label: '穿透之矢', quality: 'rare',      desc: '远程普攻穿透 +1' },
    { id: 'merchantEye',     label: '商人眼光', quality: 'common',    desc: '商店价格 −20%' },
    { id: 'greedyHeart',     label: '贪婪之心', quality: 'rare',      desc: '金币获取 +35%，受伤 +10%' },
    { id: 'soulDrinker',     label: '汲魂者',   quality: 'common',    desc: '击杀回复 2 生命' },
    { id: 'fateWheel',       label: '命运轮盘', quality: 'legendary', desc: '每清一个房间随机 +2~8 金币 或 −1 生命' },
    { id: 'abyssMark',       label: '深渊印记', quality: 'rare',      desc: '遗物三选一变四选一' },
    { id: 'sharpCore',       label: '锐利核心', quality: 'legendary', desc: '完美闪避的锐利倍率 2.2 → 3.0' }
  ];

  var RELIC_BY_ID = {};
  RELIC_POOL.forEach(function (r) { RELIC_BY_ID[r.id] = r; });

  /**
   * 旧遗物（内核的 17 件，只有中文 label）→ 新遗物 id
   * 规划 §3.4 的映射表；映到 null 的表示"效果由内核自己继续处理"或已废弃。
   */
  var LEGACY_RELIC_MAP = {
    '战斗怒火': 'heavyStrike',
    '铁卫纹章': 'ironWall',
    '生命结晶': 'soulDrinker',
    '幸运硬币': 'greedyHeart',
    '坚固护符': 'shieldResonance',
    '恢复之心': 'soulDrinker',
    '回声之环': 'soulDrinker',
    '神圣庇护': null,            // 休整回复 +2：内核侧的 countRelic 继续生效
    '猎人本能': null,            // 死遗物（firstStrikeReduction 从未被写入），不再映射
    '狂战之心': 'chainMaster',
    '双刃匕首': 'windShadow',
    '猎杀标记': 'huntMark',
    '完美之刃': 'sharpCore',
    '不死图腾': 'immortalTotem',
    '斩杀之镰': 'executioner',
    '命运轮盘': 'fateWheel',
    '商人眼光': 'merchantEye'
  };

  var QUALITY_NAME = { common: '普通', rare: '稀有', legendary: '传说' };
  var QUALITY_TAG = { common: '强化', rare: '进阶', legendary: '传说' };

  /** 把 state.relics 里的元素统一取成引擎认识的 id（新遗物直接有 id，旧的走映射表） */
  function relicIds() {
    var s = S(), out = [];
    (s && s.relics ? s.relics : []).forEach(function (r) {
      var id = (typeof r === 'string') ? r : (r && r.id);
      if (!id) {
        var label = (r && r.label) || '';
        id = LEGACY_RELIC_MAP[label] || null;
      }
      if (id && out.indexOf(id) < 0) out.push(id);
    });
    return out;
  }

  function hasRelic(id) {
    var s = S();
    return !!(s && (s.relics || []).some(function (r) { return (r && r.id) === id; }));
  }

  function pushRelics() {
    var e = engine();
    if (!e || typeof e.setRelics !== 'function') return false;
    e.setRelics(relicIds());
    return true;
  }

  /**
   * 抽 n 件候选遗物（不重复、排除已拥有、走自定义难度的权重与黑名单）
   * 权重与内核 getRandomRelicByRarity 同源（common 10 / rare 5 / legendary 1）。
   */
  function relicChoices(n) {
    var s = S(), k = kernel();
    var weights = { common: 10, rare: 5, legendary: 1 };
    var blacklist = [];
    if (s.difficulty === 'custom') {
      try {
        var c = k.normalizeCustomDifficulty(s.customDifficulty);
        weights = {
          common: c.commonWeight || 10,
          rare: c.rareWeight || 5,
          legendary: c.legendaryWeight || 1
        };
        blacklist = (c.relicBlacklist || []).map(function (x) { return String(x).toLowerCase(); }).filter(Boolean);
      } catch (e) { /* 用默认权重 */ }
    }
    var owned = {};
    (s.relics || []).forEach(function (r) { if (r && r.id) owned[r.id] = true; });
    var pool = RELIC_POOL.filter(function (r) {
      if (owned[r.id]) return false;
      for (var i = 0; i < blacklist.length; i++) {
        if (r.label.toLowerCase().indexOf(blacklist[i]) >= 0 || r.id.toLowerCase().indexOf(blacklist[i]) >= 0) return false;
      }
      return true;
    });
    var out = [];
    for (var j = 0; j < n && pool.length; j++) {
      var total = 0;
      pool.forEach(function (r) { total += weights[r.quality] || 1; });
      var pick = Math.random() * total, acc = 0, idx = 0;
      for (var m = 0; m < pool.length; m++) {
        acc += weights[pool[m].quality] || 1;
        if (pick <= acc) { idx = m; break; }
      }
      out.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return out;
  }

  /** 获得一件遗物：写内核 state + 重新下发给引擎（效果立刻生效） */
  function addRelic(r) {
    var s = S();
    if (!s || !r) return false;
    if (!s.relics) s.relics = [];
    if (s.relics.some(function (x) { return (x && x.id) === r.id; })) return false;
    s.relics.push({ id: r.id, label: r.label, quality: r.quality, description: r.desc });
    try { kernel().addLog('获得遗物：' + r.label + '（' + (QUALITY_NAME[r.quality] || '') + '）'); } catch (e) { /* 忽略 */ }
    pushRelics();
    pushStats();
    return true;
  }

  /**
   * 遗物三选一（精英必掉 / Boss 必掉 / 宝箱概率 / 商店购买）
   * 深渊印记会把 3 张变 4 张（规划 §3.4 第 23 条）。
   */
  function openRelicPanel(reason) {
    var s = S(), e = engine();
    if (!s || !e || typeof e.openRewardChoice !== 'function') return false;
    var n = hasRelic('abyssMark') ? 4 : 3;
    var choices = relicChoices(n);
    if (!choices.length) return false;          // 池子抽干了：直接放行，不要卡住流程
    s._relicChoices = choices;
    log('遗物三选一（' + reason + '）· 候选 ' + choices.length + ' 件');
    return e.openRewardChoice({
      title: '遗物',
      desc: reason + ' · 选一件带走（或跳过换 20 金币）',
      cards: choices.map(function (r, i) {
        return {
          id: String(i), name: r.label, desc: r.desc,
          quality: r.quality, tag: QUALITY_TAG[r.quality] || '强化'
        };
      }),
      actions: [{ id: 'skip', label: '跳过（+20 金币）' }]
    });
  }`);

/* ---------- ② 删掉旧的 relicIds（已被上面的新版取代） ---------- */
rep('删除旧 relicIds',
`  function relicIds() {
    var s = S(), out = [];
    (s && s.relics ? s.relics : []).forEach(function (r) {
      var label = (typeof r === 'string') ? r : (r && r.label);
      var id = label && RELIC_LABEL_TO_ID[label];
      if (id && out.indexOf(id) < 0) out.push(id);
    });
    return out;
  }

`, '');

/* ---------- ③ 清房：标记本房是否还要发遗物 ---------- */
rep('onRoomCleared 标记遗物掉落',
`    var combat = isCombatRoom(roomType);
    log('清房 ' + roomType + ' → ' + (combat ? '弹奖励三选一' : '非战斗房，直接放行') +
        '（引擎 roomNode=' + roomType + '，宿主镜像=' + (s.currentRoom && s.currentRoom.type) + '）');
    if (combat) openRewardPanel();`,
`    var combat = isCombatRoom(roomType);
    log('清房 ' + roomType + ' → ' + (combat ? '弹奖励三选一' : '非战斗房，直接放行') +
        '（引擎 roomNode=' + roomType + '，宿主镜像=' + (s.currentRoom && s.currentRoom.type) + '）');
    // 遗物产出（规划 §3.4）：精英必掉、Boss 必掉；宝箱房走概率
    if (roomType === 'elite') s._pendingRelic = '精英遗物';
    else if (roomType === 'boss') s._pendingRelic = '层主遗物';
    else if (roomType === 'treasure' && Math.random() < 0.45) s._pendingRelic = '宝箱遗物';
    else s._pendingRelic = null;
    if (combat) openRewardPanel();`);

/* ---------- ④ 选择结果：奖励 → 遗物 → 推进 ---------- */
rep('onChoiceResult 奖励与遗物串联',
`      s.rewardOptions = [];
      advanceToNextRoom();
      return;
    }`,
`      s.rewardOptions = [];
      // 属性奖励领完，若本房还有遗物产出就接着弹（精英 / Boss 必掉）
      if (s._pendingRelic) {
        var why = s._pendingRelic;
        s._pendingRelic = null;
        if (openRelicPanel(why)) return;
      }
      advanceToNextRoom();
      return;
    }
    if (kind === 'relic') {
      var rix = parseInt(id, 10);
      var picked = (s._relicChoices || [])[rix];
      if (id === 'skip') {
        s.player.gold = (s.player.gold || 0) + 20;
        syncPoints();
        try { kernel().addLog('跳过遗物，换成 20 金币。'); } catch (e) { /* 忽略 */ }
      } else if (picked) {
        addRelic(picked);
      }
      s._relicChoices = [];
      // 宝箱房是"非战斗房"，要走 finishRoomGoal 才开门；精英/Boss 房已经开过门了
      finishNonCombatRoom();
      advanceToNextRoom();
      return;
    }`);

fs.writeFileSync(F, s);
console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
