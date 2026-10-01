/* P5-1e：清理全部 Trial.* 调用 → 删掉 Trial 空壳
 * 顺序不能反：initGame() 里原有**无守卫**的 Trial.init，空壳先删就是"游戏进不去"。
 * 用法：node 其他/_p5j.js
 */
const fs = require('fs');
const path = require('path');
const CRLF = '\r\n';
const F = path.join(__dirname, '..', '主程序.js');
const BAK = path.join(__dirname, '备份');

let s = fs.readFileSync(F, 'utf8');
if (!fs.existsSync(BAK)) fs.mkdirSync(BAK, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(path.join(BAK, '主程序.js.' + stamp + '.bak'), s);
console.log('已备份 → 主程序.js.' + stamp + '.bak');

let fails = 0;
function rep(label, from, to, expect) {
  const f = from.split('\n').join(CRLF);
  const t = (to || '').split('\n').join(CRLF);
  const n = s.split(f).length - 1;
  const want = (expect == null) ? 1 : expect;
  if (n !== want) { console.log('!! ' + label + ' 命中 ' + n + '（期望 ' + want + '）'); fails++; return; }
  s = s.split(f).join(t);
  console.log('ok ' + label + (want !== 1 ? ' ×' + want : ''));
}

const OFF = '  // 试炼已关停（P5）：原先这里要初始化/重绑试炼模块，现在整块移除。';

/* A. 重置流程里**无守卫**的 Trial.init（最关键的一处） */
rep('A 无守卫 Trial.init',
`  // 重新初始化 Trial 模块
  console.log('准备调用 Trial.init，Trial 对象:', typeof Trial);
  Trial.init({
    state: state,
    heroOptions: heroOptions,
    addLog: addLog,
    showToast: showToast,
    openEncyclopediaModal: openEncyclopediaModal,
    startTutorial: startTutorial,
    openConditionsModal: openConditionsModal,
    manualSave: manualSave,
    deleteSave: deleteSave,
    initGame: initGame
  });
  console.log('Trial.init 调用完成');`,
`  // 试炼已关停（P5）：原先这里要重新初始化试炼模块，现在整块移除。`);

/* B. 守卫块（缩进 4） */
rep('B 守卫 Trial.init（缩进4）',
`    // 重置试炼模块的依赖
    if (typeof Trial !== 'undefined' && Trial.init) {
        Trial.init({
            state: state,
            heroOptions: heroOptions,
            addLog: addLog,
            showToast: showToast,
            openEncyclopediaModal: openEncyclopediaModal,
            startTutorial: startTutorial,
            openConditionsModal: openConditionsModal,
            manualSave: manualSave,
            deleteSave: deleteSave,
            initGame: initGame
        });
    }`,
`    // 重置试炼模块的依赖 —— 试炼已关停（P5），整块移除。`);

/* C. 守卫块 + else（缩进 2） */
rep('C 守卫 Trial.init + else',
`  // ===== 初始化试炼模块（无论是否加载存档，都必须注入依赖） =====
  if (typeof Trial !== 'undefined' && Trial.init) {
    Trial.init({
      state: state,
      heroOptions: heroOptions,
      addLog: addLog,
      showToast: showToast,
      openEncyclopediaModal: openEncyclopediaModal,
      startTutorial: startTutorial,
      openConditionsModal: openConditionsModal,
      manualSave: manualSave,
      deleteSave: deleteSave,
      initGame: initGame
    });
  } else {
    console.warn('Trial 模块未加载，请检查 试炼程序.js 是否正常');
  }`,
`  // ===== 试炼模块已关停（P5）：不再需要注入依赖 =====`);

/* D. render() 里的试炼分流 */
rep('D render 试炼分流',
`function render() {
  // ===== 试炼模式渲染 =====
  if (state.trial?.active) {
    Trial.render();
    return;
  }`,
`function render() {`);

/* E. handleAction() 里的试炼分流 */
rep('E handleAction 试炼分流',
`  // 试炼模式统一委托
  if (state.trial?.active) {
    Trial.handleAction(action);
    return;
  }

`, '');

/* F. 残留的单行 Trial.render() 调用（含 if 形式） */
rep('F 单行 Trial.render（if 形式）',
`    if (state.trial?.active) Trial.render();
`, '', 2);
rep('G 独立 Trial.render()',
`    Trial.render();
`, '', 3);

/* H. 最后删空壳 */
rep('H 删 Trial 空壳',
`/* ============================================================
   试炼模式已关停（P5 · 规划 §7）`,
`/* ============================================================
   （已废弃的 Trial 空壳说明）
   试炼关停期间这里曾放过一个 no-op 空壳，用来兜住历史遗留的 Trial.* 调用。
   调用点现已全部清理，空壳随之删除 —— 下面这段保留作记录：`, 1);

fs.writeFileSync(F, s);
const left = (s.match(/Trial\./g) || []).length;
console.log('\n剩余 Trial. 出现次数（含注释）：' + left);
console.log(fails ? '有 ' + fails + ' 条未命中' : '全部命中');
