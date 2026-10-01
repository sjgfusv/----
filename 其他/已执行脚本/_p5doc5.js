/* P5-1c 第一步 文档记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');
const ANCHOR = '## 5. 风险与对策（最高优先的 10 条）';
const REC = [
  '**P5-1c 代码卫生 · 第一步：删开发者 `trial` 命令 —— 已完成并验证**',
  '',
  '- 删掉整块（约 **108 行**），原位留一句说明：想看老版的试炼调试就切到 `老版2.6/` 用那边的开发者模式。',
  '- 为什么只删这一块：它**独立且自洽**（从 `registerDevCommand(\'trial\'` 到 P4 新加的命令块为止），',
  '  删掉不牵连任何其它代码路径。',
  '- **故意不删**那几个试炼处理函数（`applyCheatTrial` / `applyCheatPerm` / `resetCheatPerm` /',
  '  `applyTrialRelicEffect` / `applyTrialBonusEffect` / `cheatClearCurses`）：它们已经是**永不执行的死代码**',
  '  —— 试炼 UI 与绑定都已移除、`state.trial?.active` 恒为 false，所有守卫都会跳过；',
  '  而删掉它们反而要同步改绑定与调用点（引用会在绑定前求值，函数没了就是 ReferenceError），',
  '  **收益为零、风险为正**。这份判断已写进代码注释，避免后来者当成遗漏。',
  '- 实测：`registerDevCommand(\'trial\'` 残留 **0**；开发者命令 `rtdebug` 可正常执行；`help` 输出**不再提及 trial**；',
  '  页面零错误；`mode = "classic2d"` 正常。',
  '',
  '**P5-1c 剩余（按风险从低到高）**',
  '',
  '1. 画布搬迁：把 `#trial2DStage` 移出 `#trialScreen`，之后才能删 `#trialScreen` /',
  '   `#trialShopModal` / `#trialRewardBanner`（§7 那条"删 `#trialScreen`"必须在这个前提下才成立）。',
  '2. 删 CSS 的试炼文字界面样式（§7 列的区段），**必须保留** `.trial2d-*` 全套 / `.t2d-lb-btn` /',
  '   `body.realtime-trial` 段 —— 画布与布局编辑器在用。',
  '3. 最后删 `Trial` 空壳，并全库搜索确认无 `Trial.` 裸调（当前 42 处，全部落在死代码或空壳调用里）。',
  '',
  ''
].join('\n');
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
fs.writeFileSync(F, s.replace(ANCHOR, REC + ANCHOR));
console.log('ok P5-1c 第一步记录已插入');
