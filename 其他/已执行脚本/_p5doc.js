/* P5-1 第一步 文档记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');
const ANCHOR = '## 5. 风险与对策（最高优先的 10 条）';
const REC = [
  '#### P5 进展记录',
  '',
  '**P5-1 试炼关停 · 第一步（入口关停）—— 已完成并验证**',
  '',
  '- `主界面.html` 移除 `试炼程序.js` 的加载（脚本从 7 个降到 6 个：AbyssAudio / phaser / 角色形象 / 战斗2D / 主程序 / 经典2D）。',
  '- `主程序.js` 加 `Trial` 空壳（`init / start / render / exit / kill / heal / openShop / applyUnlocks / handleAction /',
  '  envBag / envBagSize / rollEnv` 全部退化为 no-op 或一句说明）。为什么不直接删调用点：见下面的风险评估。',
  '- 实测：`window.Trial.stubbed === true`、`trialProgramLoaded === false`、试炼入口按钮尺寸 **0×0**（不可见）；',
  '  **点「开始游戏」→ `mode = "classic2d"`、宿主 `running = true`** —— 主流程完好。',
  '  试炼在新版**实际已不可达**：已经没有任何代码能把 `state.trial.active` 置为 true。',
  '',
  '**P5-1 剩余：物理删除（需要专门一轮，且必须按顺序做）**',
  '',
  '⚠️ **先把风险说清楚**：规划 §7 估的是「`Trial.*` 调用 20 处」，实测与试炼相关的引用共 **90 处**，',
  '其中 **12 处是无守卫的 `state.trial.active` 直接访问** ——',
  '`1189 / 1306 / 1415 / 1436 / 1572 / 1645 / 1814 / 1984 / 2110 / 8511 / 9334 / 11617`，',
  '另有 `state.trial.* =` 的重置块（2901-2920）、以及 `render()` / `handleAction()` 顶部的分流判断。',
  '所以「删 `state.trial`」**不能一步到位**：删完那 12 处会直接抛 `Cannot read properties of undefined`。',
  '',
  '建议的施工顺序（每步都要跑一遍冒烟）：',
  '1. 把那 12 处 `state.trial.active` 改成 `state.trial?.active`（纯防御性改动，行为不变）；',
  '2. 删 `state.trial` 的定义与重置块（2901-2920），以及 `render()` / `handleAction()` 的试炼分流；',
  '3. 删 DOM：`#trialScreen` / `#trialShopModal` / `#trialRewardBanner` / `#trialButton` / `#trialInfo`',
  '   （注意 `主程序.js:8555-8558` 有引用，删除时要同步处理）；',
  '4. 删 `主程序.js` 里的试炼处理函数（`applyCheatTrial` / `applyCheatPerm` / `resetCheatPerm` /',
  '   `applyTrialRelicEffect` / `applyTrialBonusEffect` / `cheatClearCurses`）与开发者 `trial` 命令（11617 起）；',
  '5. 删「试炼永久解锁」的存档读取依赖（`loadTrialUnlocks` 相关）—— 注意**老版仍要能读**这些键，所以只删新版的使用点，不删键；',
  '6. 删 CSS 的试炼文字界面样式（§7 列的 3638-4094 / 4095-4179 / 6146-6480 区段），',
  '   **但必须保留** `.trial2d-*` 全套 / `.t2d-lb-btn` / `body.realtime-trial` 段（2D 画布与布局编辑器在用）；',
  '7. 最后删 `Trial` 空壳；全库搜索确认无 `Trial.` 裸调与 `state.trial` 访问。',
  '',
  '当前状态下这些代码路径**永不执行**（`active` 恒为 false），所以功能上已等价于关停 —— 剩下的纯属代码卫生，',
  '不影响玩家，也正是它必须**分步验证**、不能图快一次删完的原因。',
  '',
  ''
].join('\n');
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
fs.writeFileSync(F, s.replace(ANCHOR, REC + ANCHOR));
console.log('ok P5-1 第一步记录已插入');
