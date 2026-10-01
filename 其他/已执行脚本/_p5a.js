/* P5-1a：新版关停试炼（第一步：不再加载 试炼程序.js + 空壳兜底）
 *   ⚠️ 分步做：主程序.js 里历史遗留的 Trial.* 调用点还有 20 处，
 *      一次全删的风险是"漏一处就整局崩"。先让入口消失 + 空壳兜住，
 *      验证游戏仍可正常游玩，再逐个清理调用点。
 * 用法：node 其他/_p5a.js
 */
const fs = require('fs');
const path = require('path');
const CRLF = '\r\n';
let fails = 0;

/* ① 主程序.js：Trial 空壳 */
{
  const F = path.join(__dirname, '..', '主程序.js');
  let s = fs.readFileSync(F, 'utf8');
  const anchor = 'function initGame(';
  const STUB = [
    '/* ============================================================',
    '   试炼模式已关停（P5 · 规划 §7）',
    '   ------------------------------------------------------------',
    '   新版不再加载 试炼程序.js：它的职责已经全部并入 ——',
    '     · 实时战斗 → 战斗2D.js + 经典2D.js',
    '     · 横屏/全屏 → 经典2D.js 的 requestLandscape（挂在开始按钮的手势链上）',
    '     · --trial2d-vh → 经典2D.js 的 updateVh',
    '   但主程序里历史遗留的 Trial.* 调用点还有若干处（清理要分步走，',
    '   一次全删的风险是"漏一处就整局崩"）。这里先用一个**空壳**兜住：',
    '   所有入口退化成无害的 no-op 或一句说明，玩家看不到报错。',
    '   这份空壳会在 §7 清单清理完毕后一并删除。',
    '   ============================================================ */',
    'if (!window.Trial) {',
    '  window.Trial = {',
    '    stubbed: true,',
    '    init: function () { },',
    '    start: function () {',
    "      if (typeof showToast === 'function') showToast('试炼已并入 2.7 主线：点「开始游戏」直接进 2D 实时战斗');",
    '    },',
    '    render: function () { },',
    '    exit: function () { },',
    '    kill: function () { },',
    '    heal: function () { },',
    '    openShop: function () { },',
    '    applyUnlocks: function () { },',
    '    handleAction: function () { return false; },',
    '    envBag: function () { return []; },',
    '    envBagSize: function () { return 0; },',
    '    rollEnv: function () { return null; }',
    '  };',
    '}',
    '',
    anchor
  ].join(CRLF);
  const n = s.split(anchor).length - 1;
  if (n !== 1) { console.log('!! 主程序锚点命中 ' + n); fails++; }
  else {
    s = s.split(anchor).join(STUB);
    fs.writeFileSync(F, s);
    console.log('ok 主程序.js 已加 Trial 空壳');
  }
}

/* ② 主界面.html：移除 试炼程序.js 的加载 */
{
  const F = path.join(__dirname, '..', '主界面.html');
  let s = fs.readFileSync(F, 'utf8');
  const before = s;
  s = s.replace(/\s*<script src="试炼程序\.js\?v=[^"]*"><\/script>/, '');
  if (s === before) { console.log('!! 没找到 试炼程序.js 的 script 标签'); fails++; }
  else {
    fs.writeFileSync(F, s);
    console.log('ok 主界面.html 已移除 试炼程序.js');
  }
}

console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
