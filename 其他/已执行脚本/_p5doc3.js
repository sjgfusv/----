/* P5-1b 第二/三步 文档记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');
const ANCHOR = '## 5. 风险与对策（最高优先的 10 条）';
const REC = [
  '**P5-1b 试炼物理删除 · 第二 / 三步 —— 已完成并验证**',
  '',
  '- **第一步（前置）**：17 处无守卫的 `state.trial.active` → `state.trial?.active`（纯防御性，行为不变；',
  '  赋值形式的 1 处保持不变）。不做这步就删定义必崩。',
  '- **第二步**：删 `state.trial` 定义块（约 23 行）与重置块（约 20 行）。',
  '  ⚠️ 项目**没有版本控制** → 脚本先自动备份到 `其他/备份/主程序.js.<时间戳>.bak`。',
  '  实测：语法通过；页面零错误；`mode = "classic2d"`、宿主 running；自动连闯到 floor 2，',
  '  面板序列 `rest / reward / event / **rift** / relic / …` 全部正常，**零错误**。',
  '  （`state.trial` 字段仍在，是旧存档通过 `Object.assign` 带回来的 —— 无害，且正好说明旧档仍可读。）',
  '- **第三步**：删 `#trialButton` 的 DOM 与它的绑定（绑定块换成一句注释，**不留"假入口"** ——',
  '  `Trial.start` 现在是空壳，再绑上去只会多一个点了没反应的按钮）。',
  '  实测：按钮消失、`#trialScreen` 与 `#trial2DCanvasHost` 都还在、页面零错误、进 2D 正常。',
  '',
  '⚠️ **修正规划 §7 的一条（照做会出事）**：§7 写「HTML：删 `#trialScreen`(754-926)」，',
  '但 **`#trial2DStage`（2D 画布）就在 `#trialScreen` 内部** —— 照这条做等于把画布一起删掉，',
  '整个 2.7 的主画面就没了。正确顺序是：**先把 `#trial2DStage` 移出 `#trialScreen`**，再删容器；',
  '或者退一步：保留 `#trialScreen` 只删它内部的试炼内容。',
  '这也是 `#trialShopModal` / `#trialRewardBanner` 本轮**没有一起删**的原因 —— 它们同属这次结构调整，',
  '拆开做只会让 DOM 处于半迁移状态。',
  '',
  '**剩余（P5-1c）**：试炼处理函数（`applyCheatTrial` / `applyCheatPerm` / `resetCheatPerm` /',
  '`applyTrialRelicEffect` / `applyTrialBonusEffect` / `cheatClearCurses`）、开发者 `trial` 命令、',
  '试炼 DOM 的其余部分（连同画布搬迁）、CSS 的试炼文字界面样式',
  '（**必须保留** `.trial2d-*` 全套 / `.t2d-lb-btn` / `body.realtime-trial` 段）、以及 `Trial` 空壳本身。',
  '',
  ''
].join('\n');
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
fs.writeFileSync(F, s.replace(ANCHOR, REC + ANCHOR));
console.log('ok P5-1b 第二/三步记录已插入');
