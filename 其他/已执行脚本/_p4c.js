/* P4-2：开发者命令改造（加实时战斗命令）
 * 规划 §3.9：新增 room <type> / floor <n> / relic <id> / curse <n> / rtdebug / god2d
 * 注：删 `trial` 命令放在 P5（与试炼一起清理，§7 清单已列），此处只做加法。
 * 用法：node 其他/_p4c.js
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '主程序.js');
const CRLF = '\r\n';
let s = fs.readFileSync(F, 'utf8');

const anchor = "  registerDevCommand('open', '打开指定页面: open <路径> (支持: 测试面板, 音频测试)', (args) => {";
const NEW = [
  "  /* ===== 实时战斗（2D）专用命令（P4）=====",
  "   * 全部委托给 window.经典2D.cheat —— 与作弊面板同一套实现，",
  "   * 保证「面板上能改的」与「命令里能改的」永远一致。 */",
  "  registerDevCommand('room', '跳到本层指定房间: room <序号，从 0 起>', (args) => {",
  "    const c = window.经典2D && window.经典2D.cheat;",
  "    if (!c) return devLog('实时战斗未启动（当前是回合制界面）');",
  "    const i = Number(args[0]);",
  "    if (!isFinite(i)) return devLog('用法: room <序号>');",
  "    c.gotoRoom(i);",
  "    devLog(`已跳到本层第 ${i} 间`);",
  "  });",
  "",
  "  registerDevCommand('floor', '跳到指定层: floor <层数>', (args) => {",
  "    const c = window.经典2D && window.经典2D.cheat;",
  "    if (!c) return devLog('实时战斗未启动（当前是回合制界面）');",
  "    const n = Number(args[0]);",
  "    if (!isFinite(n) || n < 1) return devLog('用法: floor <层数>');",
  "    c.gotoFloor(n);",
  "    devLog(`已跳到第 ${n} 层`);",
  "  });",
  "",
  "  registerDevCommand('relic', '添加遗物: relic <id|中文名>', (args) => {",
  "    const c = window.经典2D && window.经典2D.cheat;",
  "    if (!c) return devLog('实时战斗未启动（当前是回合制界面）');",
  "    if (!args.length) return devLog('用法: relic <id|中文名>，例如 relic 猎杀标记');",
  "    const ok = c.addRelic(args.join(' '));",
  "    devLog(ok ? `已获得遗物：${args.join(' ')}` : `没找到这件遗物：${args.join(' ')}`);",
  "  });",
  "",
  "  registerDevCommand('curse', '诅咒: curse <名称...> | curse clear', (args) => {",
  "    const c = window.经典2D && window.经典2D.cheat;",
  "    if (!c) return devLog('实时战斗未启动（当前是回合制界面）');",
  "    if (!args.length) return devLog('用法: curse <名称...> 或 curse clear');",
  "    if (args[0] === 'clear') { c.clearCurses(); return devLog('已清除所有诅咒'); }",
  "    let ok = 0;",
  "    args.forEach(n => { if (c.addCurse(n)) ok += 1; });",
  "    devLog(`已施加 ${ok}/${args.length} 条诅咒（表外名字会被忽略）`);",
  "  });",
  "",
  "  registerDevCommand('rtdebug', '打印实时战斗引擎状态（含机制常量与遗物系数）', () => {",
  "    const e = window.战斗2D;",
  "    if (!e) return devLog('2D 引擎未加载');",
  "    const d = e.debug();",
  "    devLog(`2D: ready=${d.ready} running=${d.running} floor=${d.floor} room=${d.room ? d.room.type : '-'} `",
  "      + `hp=${d.hero ? d.hero.hp : '-'} 敌=${d.enemiesAlive}/${d.enemiesTotal} 面板=${d.choiceOpen ? d.choiceKind : '-'}`);",
  "    if (d.mech) devLog('mech: ' + JSON.stringify(d.mech));",
  "    if (d.relicFx) devLog('遗物系数: ' + JSON.stringify(d.relicFx));",
  "    if (d.pulse) devLog('脉冲: 间隔 ' + d.pulse.interval + 'ms · 剩余 ' + d.pulse.leftMs + 'ms');",
  "    console.log('[DevMode.rtdebug]', d);",
  "  });",
  "",
  "  registerDevCommand('god2d', '实时战斗无敌: god2d [on|off]', (args) => {",
  "    const e = window.战斗2D;",
  "    if (!e || typeof e.setGodMode !== 'function') return devLog('2D 引擎未加载');",
  "    const want = args[0] === 'off' ? false : (args[0] === 'on' ? true : !e.isGodMode());",
  "    e.setGodMode(want);",
  "    devLog('实时战斗无敌：' + (want ? '开' : '关'));",
  "  });",
  "",
  "  registerDevCommand('ending', '直接触发结局面板（不看楼层上限）', () => {",
  "    const h = window.经典2D;",
  "    if (!h || typeof h.checkEnding !== 'function') return devLog('宿主未加载');",
  "    devLog(h.checkEnding() ? '已打开结局面板' : '当前条件不满足（或未到楼层上限）');",
  "  });",
  "",
  "  registerDevCommand('relics', '列出本局已有遗物与诅咒', () => {",
  "    const c = window.经典2D && window.经典2D.cheat;",
  "    if (!c) return devLog('实时战斗未启动（当前是回合制界面）');",
  "    const s0 = c.snapshot();",
  "    devLog('遗物：' + (s0.relics.length ? s0.relics.join('、') : '（无）'));",
  "    devLog('诅咒：' + (s0.curses.length ? s0.curses.join('、') : '（无）'));",
  "  });",
  "",
  anchor
].join(CRLF);

const n = s.split(anchor).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n + ' 次'); process.exit(1); }

/* devLog：开发者命令里统一的输出口（系统里已有 addLog，但那是给游戏日志的） */
const withHelper = s.split(anchor).join(NEW);
let out = withHelper;
if (withHelper.indexOf('function devLog(') < 0) {
  const devAnchor = "function registerDevCommand(name, description, fn) {";
  const helper = [
    '/**',
    ' * 开发者命令的统一输出口（P4）',
    ' * 之前各命令各自 console.log + DEV_MODE.log，格式不统一；',
    ' * 这里统一成「控制台 + 开发者日志面板」两处都写。',
    ' */',
    'function devLog(msg) {',
    '  try { console.log("[DevMode] " + msg); } catch (e) { /* 忽略 */ }',
    '  try {',
    '    if (typeof DEV_MODE !== "undefined" && DEV_MODE && Array.isArray(DEV_MODE.log)) {',
    '      DEV_MODE.log.push(String(msg));',
    '      if (DEV_MODE.log.length > 200) DEV_MODE.log.splice(0, 50);',
    '    }',
    '  } catch (e) { /* 忽略 */ }',
    '  try { if (typeof addLog === "function") addLog("🛠 " + msg); } catch (e) { /* 忽略 */ }',
    '}',
    '',
    devAnchor
  ].join(CRLF);
  const m = out.split(devAnchor).length - 1;
  if (m !== 1) { console.log('!! devLog 锚点命中 ' + m + ' 次'); process.exit(1); }
  out = out.split(devAnchor).join(helper);
  console.log('ok devLog 辅助函数已加');
}

fs.writeFileSync(F, out);
console.log('ok 7 条实时战斗命令已注册');
