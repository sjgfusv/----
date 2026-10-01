/* P3-6：横屏机制 + 暂停菜单接入
 *  宿主：移动端全屏/锁横屏（必须在用户手势内）+ 竖屏兜底提示条 + Esc/退出时解锁
 *  引擎：HUD 的「结束本局」改为先开暂停菜单（Esc 与 HUD 两条入口行为一致）
 * 用法：node 其他/_p3p.js
 */
const fs = require('fs');
const path = require('path');
const CRLF = '\r\n';
let fails = 0;
function patch(file, rules, crlf) {
  const F = path.join(__dirname, '..', file);
  let s = fs.readFileSync(F, 'utf8');
  console.log('=== ' + file + ' ===');
  for (const [label, from, to] of rules) {
    const f = crlf ? from.split('\n').join(CRLF) : from;
    const t = crlf ? to.split('\n').join(CRLF) : to;
    const n = s.split(f).length - 1;
    if (n !== 1) { console.log('!! ' + label + ' 命中 ' + n); fails++; continue; }
    s = s.split(f).join(t);
    console.log('ok ' + label);
  }
  fs.writeFileSync(F, s);
}

/* ---------- ① 宿主：横屏 + 竖屏提示 + Esc 暂停 ---------- */
patch('经典2D.js', [
  ['横屏与暂停机制',
`  /** 窗口尺寸变化：画布是全屏钉死的，得跟着重算（否则旋转屏幕后画布留在旧高度） */`,
`  /* ============================================================
     移动端横屏（规划 §3.8）
     ------------------------------------------------------------
     浏览器不能真正强制旋转，唯一路径是「全屏 + screen.orientation.lock」，
     而且**必须在用户手势内发起**。所以这里挂在开始按钮的 click 捕获阶段，
     而不是等 render() 接管时再调 —— 那时已经脱离手势链，全屏会被浏览器拒绝。
     iOS Safari 完全不支持 orientation.lock，靠提示条兜底（不阻塞游戏）。
     老版（老版2.6/）走的是它自己那份 试炼程序.js，本节改动与它无关。
     ============================================================ */
  function isTouchDevice() {
    try { return ('ontouchstart' in global) || (navigator.maxTouchPoints > 0); } catch (e) { return false; }
  }

  function lockOrientation() {
    try {
      var so = global.screen && global.screen.orientation;
      if (so && typeof so.lock === 'function') {
        var p = so.lock('landscape');
        if (p && p.catch) p.catch(function () { /* 不支持（iOS）：静默兜底 */ });
      }
    } catch (e) { /* 忽略 */ }
  }

  function requestLandscape() {
    if (!isTouchDevice()) return;
    try {
      var el = document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) {
        var p = el.requestFullscreen({ navigationUI: 'hide' });
        if (p && p.then) p.then(lockOrientation, function () { lockOrientation(); });
        else lockOrientation();
      } else {
        lockOrientation();
      }
    } catch (e) { lockOrientation(); }
  }

  function exitLandscape() {
    try {
      var so = global.screen && global.screen.orientation;
      if (so && typeof so.unlock === 'function') so.unlock();
    } catch (e) { /* 忽略 */ }
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        var p = document.exitFullscreen();
        if (p && p.catch) p.catch(function () { /* 忽略 */ });
      }
    } catch (e) { /* 忽略 */ }
    updateRotateHint();
  }

  /** 竖屏兜底提示条：仅「触摸设备 + 2D 运行中 + 竖屏」时显示 */
  function updateRotateHint() {
    var el = document.getElementById('trial2DRotateHint');
    if (!el) return;
    var portrait = false;
    try { portrait = global.innerHeight > global.innerWidth; } catch (e) { portrait = false; }
    el.classList.toggle('hidden', !(running && isTouchDevice() && portrait));
  }

  /** 窗口尺寸变化：画布是全屏钉死的，得跟着重算（否则旋转屏幕后画布留在旧高度） */`],

  ['resize 时刷新竖屏提示',
`      if (h > 0) stage.style.height = Math.round(h) + 'px';
      try {
        var e = engine();
        var gg = (e && e.getGame) ? e.getGame() : null;
        if (gg && gg.scale && gg.scale.refresh) gg.scale.refresh();
      } catch (err) { /* 忽略 */ }
    });`,
`      if (h > 0) stage.style.height = Math.round(h) + 'px';
      updateRotateHint();
      try {
        var e = engine();
        var gg = (e && e.getGame) ? e.getGame() : null;
        if (gg && gg.scale && gg.scale.refresh) gg.scale.refresh();
      } catch (err) { /* 忽略 */ }
    });`],

  ['启动时请求横屏 + Esc 暂停',
`  log('宿主已就绪（等待 render 接管）');`,
`  /* 全屏 + 锁横屏必须在用户手势里发起：挂在「开始游戏」的 click 捕获阶段。
     捕获阶段而不是冒泡，是为了不被内核那边的 stopPropagation 影响。 */
  try {
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('#startGameBtn')) requestLandscape();
    }, true);
  } catch (e) { /* 忽略 */ }

  /* Esc = 暂停菜单（与 HUD 的「结束本局」走同一个入口，行为一致） */
  try {
    document.addEventListener('keydown', function (ev) {
      if (!running) return;
      if (ev.key !== 'Escape' && ev.key !== 'Esc') return;
      var en = engine();
      if (en && typeof en.openPauseMenu === 'function' && en.openPauseMenu()) {
        ev.preventDefault();
      }
    });
  } catch (e) { /* 忽略 */ }

  log('宿主已就绪（等待 render 接管）');`]
], false);

/* ---------- ② 引擎：HUD「结束本局」先开暂停菜单 ---------- */
patch('战斗2D.js', [
  ['HUD quit 先开暂停菜单',
`      if (id === 'quit') {
        // 撤离确认要说清「现在走能拿到什么」—— 这是「稳 vs 贪」那个抉择的决策依据，
        // 不说清玩家只会觉得退出=放弃
        if (this.heroDead) {`,
`      if (id === 'quit') {
        // 先开暂停菜单：那里有「继续战斗 / 结束本局」，比直接弹确认框多一次反悔机会。
        // 宿主的 Esc 键也走同一个入口，两条路径行为一致。
        // 已经倒下 / 正在结算时 openPauseMenu 会返回 false，落到下面的原逻辑兜底。
        if (this.openPauseMenu()) return;
        // 撤离确认要说清「现在走能拿到什么」—— 这是「稳 vs 贪」那个抉择的决策依据，
        // 不说清玩家只会觉得退出=放弃
        if (this.heroDead) {`]
], true);

console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
