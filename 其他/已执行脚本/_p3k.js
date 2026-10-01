/* P3-4：诅咒系统（深渊裂隙风险收益抉择）
 *   · 轻/重分级（基于引擎既有的 10 条实时化诅咒）
 *   · 清完层主房、进下一层之前弹「深渊裂隙」三选一
 *   · 诅咒存 state._rtCurses（纯数据，可存档）并同步给引擎
 * 用法：node 其他/_p3k.js
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

/* ---------- ① 诅咒分级 + 抉择 + 同步 ---------- */
rep('诅咒系统',
`  /* ============================================================
     敌人数值：用经典公式定标（P3 数值统一 · 规划 §3.6 / 风险 R1-R3）`,
`  /* ============================================================
     诅咒系统（规划 §3.5 · 风险收益）
     ------------------------------------------------------------
     经典模式没有诅咒（诅咒原本只属于试炼），所以这一层的**数据**放在宿主的
     state._rtCurses 里（纯字符串数组，可安全存档），**效果**由引擎既有的
     10 条实时化诅咒承担（每 5 秒一次腐化脉冲结算，见引擎 RT_CURSES）。
     分级沿用规划 §3.5：轻诅咒是"慢慢磨"，重诅咒是"真咬人"。
     ============================================================ */
  var CURSE_LIGHT = ['脆弱', '护甲腐蚀', '药水衰减', '迟钝'];
  var CURSE_HEAVY = ['荆棘诅咒', '易伤', '生命流失', '虚弱', '吸血反噬', '贪婪'];
  var CURSE_ALL = CURSE_LIGHT.concat(CURSE_HEAVY);

  function rtCurses(s) {
    return (s && s._rtCurses) ? s._rtCurses.slice() : [];
  }

  /** 从候选里挑一条还没中的诅咒 */
  function pickUnused(list, used) {
    var free = list.filter(function (n) { return used.indexOf(n) < 0; });
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  /** 施加诅咒（轻 nLight 条 + 重 nHeavy 条）并同步给引擎 */
  function addCurses(nLight, nHeavy) {
    var s = S();
    if (!s) return [];
    if (!s._rtCurses) s._rtCurses = [];
    var got = [], i, n;
    for (i = 0; i < nLight; i++) { n = pickUnused(CURSE_LIGHT, s._rtCurses); if (n) { s._rtCurses.push(n); got.push(n); } }
    for (i = 0; i < nHeavy; i++) { n = pickUnused(CURSE_HEAVY, s._rtCurses); if (n) { s._rtCurses.push(n); got.push(n); } }
    if (got.length) {
      try { kernel().addLog('深渊裂隙的代价：' + got.join('、')); } catch (e) { /* 忽略 */ }
    }
    pushCursesEnv();
    return got;
  }

  /**
   * 深渊裂隙：清完层主房、进下一层之前的抉择（规划 §3.5 表）
   * A 浅尝：1 条轻诅咒 → 1 件遗物
   * B 沉沦：2 条（至少 1 条重）→ 1 件遗物 + 金币 ×(层数 × 8)
   * C 拒绝：无代价 → 本层商店价格 −10%
   */
  function openRiftPanel() {
    var s = S(), e = engine();
    if (!s || !e || typeof e.openChoicePanel !== 'function') return false;
    log('深渊裂隙：弹出风险收益抉择（第 ' + s.floor + ' 层）');
    return e.openChoicePanel('rift', {
      title: '深渊裂隙',
      desc: '第 ' + s.floor + ' 层 · 想要更多，就得先交出些什么',
      cards: [
        { id: 'light', name: '浅尝', desc: '接受 1 条轻诅咒 · 获得 1 件遗物', quality: 'common', tag: '代价小' },
        { id: 'deep', name: '沉沦', desc: '接受 2 条诅咒（至少 1 条重）· 遗物 + ' + (s.floor * 8) + ' 金币', quality: 'rare', tag: '代价大' },
        { id: 'refuse', name: '拒绝', desc: '不接受诅咒 · 本层商店价格 −10%', quality: 'common', tag: '稳妥' }
      ],
      actions: []
    });
  }

  /* ============================================================
     敌人数值：用经典公式定标（P3 数值统一 · 规划 §3.6 / 风险 R1-R3）`);

/* ---------- ② 诅咒池：开局下发全部 10 条（否则表外名字会被静默丢弃） ---------- */
rep('pushCursePool 下发 10 条',
`  function pushCursePool() {
    var e = engine(), s = S();
    if (!e || !s || typeof e.setCursePool !== 'function') return false;
    // 经典模式没有诅咒系统（诅咒只在试炼里存在）→ 下发空池，
    // 引擎就不会掷出任何诅咒；P3 引入「深渊裂隙」时这里换成真实池子
    try { e.setCursePool([]); return true; } catch (err) { return false; }
  }`,
`  function pushCursePool() {
    var e = engine();
    if (!e || typeof e.setCursePool !== 'function') return false;
    // ⚠️ 必须把 10 条全下发：引擎的诅咒池是**白名单**，表外的名字会被静默丢弃
    //    （风险 R9：不报错、不生效，最难查）。开局发一次，之后只改"当前生效"的那几条。
    try {
      e.setCursePool(CURSE_ALL.map(function (n) { return { name: n }; }));
      return true;
    } catch (err) { return false; }
  }`);

/* ---------- ③ 环境同步要带上诅咒 ---------- */
rep('pushEnvironment → 带诅咒',
`  function pushEnvironment() {
    var e = engine(), s = S();
    if (!e || !s || typeof e.setCursesEnv !== 'function') return false;
    try { e.setCursesEnv([], envPayload(s)); return true; } catch (err) { return false; }
  }`,
`  function pushCursesEnv() {
    var e = engine(), s = S();
    if (!e || !s || typeof e.setCursesEnv !== 'function') return false;
    try { e.setCursesEnv(rtCurses(s), envPayload(s)); return true; } catch (err) { return false; }
  }`);

rep('调用点改名',
`    log('进房 ' + type + ' · 第 ' + (s.roomIndex + 1) + '/' + (s.rooms || []).length + ' 间');
    pushEnvironment();`,
`    log('进房 ' + type + ' · 第 ' + (s.roomIndex + 1) + '/' + (s.rooms || []).length + ' 间');
    pushCursesEnv();`);

/* ---------- ④ 层主房清空后：先裂隙、再结局、最后才放行传送门 ---------- */
rep('advanceToNextRoom 加裂隙',
`    if (type === 'boss') {
      // 打完 Boss 后是否还能继续深入？判定与内核 advanceRoom() 的越界检查一致：
      // 已经站在上限层（floor >= limit）就不能再下去了 → 走结局流程。
      // 不到上限则什么都不做：玩家自己走进传送门换层（引擎的 nextFloor 会处理）。
      if (s.floor >= floorLimit(s)) openEndingPanel();
      return;
    }`,
`    if (type === 'boss') {
      // 层主房清完、进下一层之前：先弹「深渊裂隙」抉择（规划 §3.5）。
      // 用 _riftDoneThisFloor 挡住递归 —— 这个函数会被裂隙选择的结果再次调到，
      // 不挡的话会在同一层无限弹下去。
      if (!s._riftDoneThisFloor) {
        s._riftDoneThisFloor = true;
        if (openRiftPanel()) return;
      }
      // 再接结局判定：与内核 advanceRoom() 的越界检查一致（已站在上限层就不能再下去）。
      // 不到上限则什么都不做：玩家自己走进传送门换层（引擎的 nextFloor 会处理）。
      if (s.floor >= floorLimit(s)) openEndingPanel();
      return;
    }`);

/* ---------- ⑤ 裂隙选择结果 ---------- */
rep('onChoiceResult 加 rift 分支',
`    if (kind === 'relic') {`,
`    if (kind === 'rift') {
      if (id === 'light') {
        addCurses(1, 0);
        if (openRelicPanel('裂隙遗物')) return;
      } else if (id === 'deep') {
        addCurses(1, 1);
        var bonus = s.floor * 8;
        s.player.gold = (s.player.gold || 0) + bonus;
        syncPoints();
        try { kernel().addLog('沉沦的回报：+' + bonus + ' 金币。'); } catch (e) { /* 忽略 */ }
        if (openRelicPanel('裂隙遗物')) return;
      } else {
        s._shopDiscount = 0.10;      // 本层商店 −10%（P3-5 的商店面板消费它）
        try { kernel().addLog('你拒绝了裂隙，本层商店价格 −10%。'); } catch (e) { /* 忽略 */ }
      }
      advanceToNextRoom();
      return;
    }
    if (kind === 'relic') {`);

/* ---------- ⑥ 换层时重置每层一次的标记 ---------- */
rep('onFloor 重置裂隙标记',
`    s.heroSkillUsed = false;
    k.addLog('你闯入了第 ' + floor + ' 层。');`,
`    s.heroSkillUsed = false;
    s._riftDoneThisFloor = false;   // 每层一次：深渊裂隙的抉择
    k.addLog('你闯入了第 ' + floor + ' 层。');`);

fs.writeFileSync(F, s);
console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
