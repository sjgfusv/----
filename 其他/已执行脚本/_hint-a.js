/* 选英雄界面加"选完英雄和增益后才能进入实时战斗哦"提示
   + 让那条"存档可能被覆盖"的 toast 给画内面板让路（同一时刻、同一位置打架） */
const fs = require('fs');
let fails = 0;
function patch(file, reps) {
  let s = fs.readFileSync(file, 'utf8');
  reps.forEach(function (r) {
    const n = s.split(r[0]).length - 1;
    if (n !== 1) { console.log('!! ' + r[2] + ' 命中 ' + n + ' @' + file); fails++; return; }
    s = s.split(r[0]).join(r[1]);
    console.log('ok ' + r[2]);
  });
  fs.writeFileSync(file, s);
}

const HOST = 'D:\\深渊回廊\\经典2D.js';
const KERNEL = 'D:\\深渊回廊\\主程序.js';

patch(HOST, [
  /* ① 选英雄面板的提示文案（用户指定原话） */
  [`      desc: '选完英雄与开局增益，直接开始第 1 层的 2D 实时战斗',`,
   `      desc: '选完英雄和增益后才能进入实时战斗哦',`,
   'hero 面板提示文案'],

  /* ② 选增益面板呼应一句，别让玩家以为点完英雄就开打 */
  [`      desc: '三选一 · 选完立刻开始第 1 层',`,
   `      desc: '三选一 · 选完这一项就进入实时战斗',`,
   'bonus 面板提示文案'],

  /* ③ toast 让路机制 */
  [`  /* ============================================================
     画内面板的"开不出来就补一次"机制`,
   `  /* ============================================================
     DOM toast 给画内面板让路
     ------------------------------------------------------------
     toast 层 z-index 999999，画布只有 9000 —— 选英雄这一刻恰好也是 loadGame
     弹"此存档曾被其他页面/标签页修改过"的时刻，那条 toast 会正好压住卡片第二行。
     所以：选英雄 / 选增益阶段先把 toast 记下来，等本局真正开打（面板收起）再补弹。
     只拦这一条（内核显式调用 deferToast），不动全局 toast 行为。
     ============================================================ */
  var pendingToasts = [];

  /** 画布面板开着时把 toast 往后推；返回 true = 宿主已接手，内核不要再弹 */
  function deferToast(msg) {
    var s = S();
    if (!s) return false;
    if (s.mode !== 'heroSelect' && s.mode !== 'bonusSelect') return false;
    if (!booted) return false;                 // 画布没起来 → 让内核照常弹
    pendingToasts.push(String(msg));
    if (pendingToasts.length > 4) pendingToasts.shift();   // 只留最近几条，别无限堆
    log('提示延后到开打后再弹：', msg);
    return true;
  }

  function flushPendingToasts() {
    if (!pendingToasts.length) return;
    var k = kernel();
    var list = pendingToasts.slice();
    pendingToasts.length = 0;
    if (!k || typeof k.showToast !== 'function') return;
    for (var i = 0; i < list.length; i++) {
      try { k.showToast(list[i]); } catch (e) { /* 忽略 */ }
    }
  }

  /* ============================================================
     画内面板的"开不出来就补一次"机制`,
   'toast 让路机制'],

  /* ④ 开打时补弹 */
  [`    s.currentRoom = { type: (s.rooms && s.rooms[0] && s.rooms[0].type) || 'enemy' };
    showStage(true);`,
   `    s.currentRoom = { type: (s.rooms && s.rooms[0] && s.rooms[0].type) || 'enemy' };
    showStage(true);
    flushPendingToasts();        // 面板已收起，之前让路的提示现在补上
`,
   'startRun 补弹'],

  /* ⑤ 回退文字界面时别把它吞掉 */
  [`    clearPanelRetry();
    showStage(false);`,
   `    clearPanelRetry();
    showStage(false);
    flushPendingToasts();        // 面板没了，延后的提示该说了
`,
   'giveUp 补弹'],

  /* ⑥ 导出给内核 */
  [`    start: function () { return startRun(false); },`,
   `    start: function () { return startRun(false); },
    /** 内核弹 toast 前问一句：画内面板是否要它让路（见 deferToast 的注释） */
    deferToast: deferToast,`,
   '导出 deferToast'],
]);

patch(KERNEL, [
  [`        if (state._sessionId && state._sessionId !== window._sessionId) {
          showToast('⚠️ 此存档曾被其他页面/标签页修改过，可能存在进度覆盖');
        }`,
   `        if (state._sessionId && state._sessionId !== window._sessionId) {
          // 选英雄 / 选增益阶段，画布面板几乎占满屏，而 toast 层压在画布上面 ——
          // 这条警告会正好糊在卡片上。交给宿主延后到开打后再弹（见 经典2D.js 的 deferToast）。
          const conflictWarn = '⚠️ 此存档曾被其他页面/标签页修改过，可能存在进度覆盖';
          const deferred = window.经典2D && typeof window.经典2D.deferToast === 'function'
            && window.经典2D.deferToast(conflictWarn);
          if (!deferred) showToast(conflictWarn);
        }`,
   '存档冲突 toast 让路'],
]);

console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
