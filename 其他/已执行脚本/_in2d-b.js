/* 把选英雄/选增益搬进 2D 画面 · 第二步：宿主接管 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '经典2D.js');
const before = fs.readFileSync(F, 'utf8');
let s = before;
let fails = 0;
function rep(label, from, to) {
  const n = s.split(from).length - 1;
  if (n !== 1) { console.log('!! ' + label + ' 命中 ' + n); fails++; return; }
  s = s.split(from).join(to);
  console.log('ok ' + label);
}

/* ① 抽出 ensureBooted：选人阶段也要能开画布，但那时还没有楼层可打，不能开局 */
rep('抽出 ensureBooted', `    booting = true;
    var host = document.getElementById('trial2DCanvasHost');
    if (!host) { booting = false; giveUp(); return 'failed'; }

    if (!booted) {
      var ok = false;
      try { ok = e.init(host, retryCount > 0); } catch (err) { lastError = String(err); ok = false; }
      if (!ok) {
        booting = false;
        lastError = e.lastError ? e.lastError() : lastError;
        scheduleRetry(silent);
        return 'retry';
      }
      booted = true;
      e.setBridge(makeBridge());
      bindEvents();
    }`,
`    booting = true;

    if (!booted) {
      if (!ensureBooted()) {
        booting = false;
        lastError = (e && e.lastError) ? e.lastError() : lastError;
        scheduleRetry(silent);
        return 'retry';
      }
    }`);

rep('新增 ensureBooted 本体', `  /**
   * 启动本局 2D 战斗
   * 照抄 试炼程序.js 的 _realtimeTryStart：失败自动重试三级，全失败才放弃回退。
   */
  function startRun(silent) {`,
`  /**
   * 只把引擎拉起来（init + bridge + 事件），**不开局**
   * 选英雄 / 选增益阶段就需要它：画布要能显示画内面板，但那时还没有楼层可打，
   * 走 startRun 会因为拿不到楼层规划而在引擎里自造一张地图。
   */
  function ensureBooted() {
    if (booted) return true;
    var e = engine();
    if (!e) return false;
    var host = document.getElementById('trial2DCanvasHost');
    if (!host) return false;
    var ok = false;
    try { ok = e.init(host, retryCount > 0); } catch (err) { lastError = String(err); ok = false; }
    if (!ok) return false;
    booted = true;
    e.setBridge(makeBridge());
    bindEvents();
    return true;
  }

  /**
   * 启动本局 2D 战斗
   * 照抄 试炼程序.js 的 _realtimeTryStart：失败自动重试三级，全失败才放弃回退。
   */
  function startRun(silent) {`);

/* ② 判定：这两个模式也接管 */
rep('shouldTakeOver 文档', `   * 现在该不该由宿主管画面
   * 选英雄 / 选增益 / 开始界面仍归内核 DOM；一旦进了房间就交给 2D。`,
`   * 现在该不该由宿主管画面
   * 开始界面（mode='start'，也就是内核的标题页）仍归内核 DOM；
   * 选英雄 / 选增益 / 进房间之后的全部流程都由 2D 接管。`);

rep('shouldTakeOver 去掉 hero 前置', `    if (!s || !s.hero) return false;
    if (s.gameOver) return false;`,
`    if (!s) return false;
    if (s.gameOver) return false;`);

rep('shouldTakeOver 接入选人阶段', `    if (s.mode === 'heroSelect' || s.mode === 'bonusSelect' || s.mode === 'start') return false;
    if (s.mode === 'gameover' || s.mode === 'finished') return false;
    if (!s.currentRoom) return false;   // 还没进第一间房`,
`    if (s.mode === 'start') return false;
    if (s.mode === 'gameover' || s.mode === 'finished') return false;
    // 选英雄 / 选增益已经搬进画布：这两个模式下 s.hero 还不存在（选完才有），所以
    // 必须放在 !s.hero 判定**之前**。原先留给 DOM 的结果是"一进游戏先看到一张文字
    // 卡片列表"，玩家会以为 2D 没生效（实测反馈就是这么来的）。
    if (s.mode === 'heroSelect' || s.mode === 'bonusSelect') return true;
    if (!s.hero) return false;
    if (!s.currentRoom) return false;   // 还没进第一间房`);

/* ③ render：这两个阶段只开画布 + 弹面板，不开局 */
rep('render 处理选人阶段', `    if (!shouldTakeOver()) return false;
    if (!running) {`,
`    if (!shouldTakeOver()) return false;

    // 选英雄 / 选增益：只需要画布起来并弹一块画内面板，**还不需要开局**（那时没有楼层可打）
    if (s.mode === 'heroSelect' || s.mode === 'bonusSelect') {
      if (!ensureBooted()) { scheduleRetry(true); return true; }
      showStage(true);
      // 画布尺寸守卫：openChoicePanel 在 W/H < 40 时会静默返回 false，
      // 所以必须先让引擎按新容器重算一次画幅，再弹面板。
      var e0 = engine();
      if (e0 && typeof e0.show === 'function') { try { e0.show(); } catch (err) { /* 忽略 */ } }
      if (s.mode === 'heroSelect') openHeroPanel();
      else openBonusPanel();
      return true;
    }

    if (!running) {`);

/* ④ 两个画内面板 */
rep('加 openHeroPanel / openBonusPanel', `  /** 楼层上限（内核 MAX_FLOOR=999，或自定义难度的 floorCap），到达即走结局流程 */`,
`  /**
   * 选英雄（画内）
   * 卡片来自内核的 heroOptions，选中后回调内核的 chooseHero ——
   * "选了谁"这件事只有一个真相来源，宿主不另存一份。
   */
  function openHeroPanel() {
    var s = S(), e = engine(), k = kernel();
    if (!s || !e || typeof e.openChoicePanel !== 'function') return false;
    if (typeof e.isChoiceOpen === 'function' && e.isChoiceOpen()) return false;   // 已开着就别重开
    var heroes = (k && typeof k.heroOptions === 'function') ? (k.heroOptions() || []) : [];
    if (!heroes.length) return false;
    log('画内选英雄（' + heroes.length + ' 位）');
    bgm('choice');
    return e.openChoicePanel('hero', {
      title: '选择英雄',
      desc: '选完英雄与开局增益，直接开始第 1 层的 2D 实时战斗',
      cards: heroes.map(function (h, i) {
        var st = h.stats || {};
        return {
          id: String(i), name: h.name || ('英雄 ' + (i + 1)),
          desc: h.description || '',
          quality: 'common',
          tag: '生命 ' + (st.hp != null ? st.hp : '?') + ' · 攻击 ' + (st.attack != null ? st.attack : '?')
        };
      }),
      actions: []
    });
  }

  /** 选开局增益（画内）：卡片来自内核的 getBonusChoices，选中后回调内核的 chooseBonus */
  function openBonusPanel() {
    var s = S(), e = engine(), k = kernel();
    if (!s || !e || typeof e.openChoicePanel !== 'function') return false;
    if (typeof e.isChoiceOpen === 'function' && e.isChoiceOpen()) return false;
    var list = (s.availableBonuses && s.availableBonuses.length)
      ? s.availableBonuses
      : ((k && typeof k.getBonusChoices === 'function') ? (k.getBonusChoices() || []) : []);
    if (!list.length) return false;
    log('画内选增益（' + list.length + ' 项）');
    bgm('choice');
    return e.openChoicePanel('bonus', {
      title: '开局增益',
      desc: '三选一 · 选完立刻开始第 1 层',
      cards: list.map(function (b, i) {
        return {
          id: String(i), name: b.title || b.name || ('增益 ' + (i + 1)),
          desc: b.description || '', quality: 'rare', tag: '增益'
        };
      }),
      actions: []
    });
  }

  /** 楼层上限（内核 MAX_FLOOR=999，或自定义难度的 floorCap），到达即走结局流程 */`);

/* ⑤ 选择结果回写内核 */
rep('onChoiceResult 加 hero/bonus', `    var kind = r.kind, id = r.id;
    if (kind === 'reward') {`,
`    var kind = r.kind, id = r.id;
    if (kind === 'hero') {
      // 交回内核：chooseHero 内部会把 mode 推进到 bonusSelect 并 render，
      // 宿主的下一次 render 接着弹增益面板 —— 这里不自己改 mode。
      var hi = parseInt(id, 10);
      var kh = kernel();
      if (isFinite(hi) && kh && typeof kh.chooseHero === 'function') kh.chooseHero(hi);
      else warn('选英雄失败：内核未提供 chooseHero（idx=' + id + '）');
      return;
    }
    if (kind === 'bonus') {
      // chooseBonus 内部会 apply + enterCurrentRoom()，之后就是正常的 2D 房间流程
      var bi = parseInt(id, 10);
      var kb = kernel();
      if (isFinite(bi) && kb && typeof kb.chooseBonus === 'function') kb.chooseBonus(bi);
      else warn('选增益失败：内核未提供 chooseBonus（idx=' + id + '）');
      return;
    }
    if (kind === 'reward') {`);

/* ⑥ 重试定时器：选人阶段重试只能拉引擎，不能开局（否则引擎会自造一张地图） */
rep('重试定时器分流', `    retryTimer = setTimeout(function () {
      retryTimer = null;
      if (!running && enabled()) startRun(true);
    }, delay);`,
`    retryTimer = setTimeout(function () {
      retryTimer = null;
      if (running || !enabled()) return;
      var s = S();
      if (s && (s.mode === 'heroSelect' || s.mode === 'bonusSelect')) {
        // 选人 / 选增益阶段还没有楼层可打：只把引擎拉起来，交给 render 弹面板
        if (ensureBooted()) { try { if (global.render) global.render(); } catch (e) { /* 忽略 */ } }
        else scheduleRetry(true);
        return;
      }
      startRun(true);
    }, delay);`);

/* ⑦ takeOverReason 同步：这两个模式不再算"不接管" */
rep('takeOverReason 更新', `    if (s.mode === 'heroSelect') return 'mode=heroSelect';
    if (s.mode === 'bonusSelect') return 'mode=bonusSelect';`,
`    // 这两个模式现在也归宿主（画内面板），不再是"不接管"的理由
    if (s.mode === 'heroSelect') return 'hero-select-panel';
    if (s.mode === 'bonusSelect') return 'bonus-select-panel';`);

if (fails) { console.log('\n有 ' + fails + ' 条未命中，未写入'); process.exit(1); }
fs.writeFileSync(F, s);
console.log('\n已写入 经典2D.js：' + before.length + ' → ' + s.length + ' 字节');
