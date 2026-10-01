/* P5-1c 第二/三步 文档记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');
const ANCHOR = '## 5. 风险与对策（最高优先的 10 条）';
const REC = [
  '**P5-1c 第二 / 三步：画布搬迁 + 删试炼 DOM 块 —— 已完成并验证**',
  '',
  '- **画布搬迁**：把 `#trial2DStage`（连同它的 5 个子元素：标题条 / canvas host / 启动提示 / 回退面板 / 竖屏提示）',
  '  从 `#trialScreen` 里移到 `</body>` 之前。**这是删 `#trialScreen` 的前提** ——',
  '  规划 §7 那条「删 `#trialScreen`」若不先做搬迁，等于把 2.7 的主画面一起删掉。',
  '  搬迁为什么安全：宿主的 `showStage` 用 inline style 把 stage 钉成全屏 `fixed`，',
  '  **不依赖父级的定位/尺寸上下文**（当初修"画布塌成 1279×214"时就是这么写的）。',
  '  实测：`stage.parentElement === document.body`、stage **1910×990** 全屏、引擎画布 **1908×988**、',
  '  `engineReady = true`、零错误。',
  '',
  '- **删三个 DOM 块**（先自动备份到 `其他/备份/主界面.html.<时间戳>.bak`）：',
  '  `#trialShopModal`（15 行）/ `#trialRewardBanner`（11 行）/ `#trialScreen`（154 行），原位留一句说明。',
  '  HTML 从 **1010 行 → 833 行**。',
  '  引用检查：`主程序.js` 里只有 `if (trialScreen) trialScreen.classList.add(\'hidden\')`（有守卫），',
  '  另两个 id 零引用 → 删掉安全。',
  '  实测：三个 id 残留均为 **0**、`#trial2DStage` 保留且父级是 `body`、页面**零错误**、',
  '  `mode = "classic2d"`、宿主 running、画布尺寸正常。',
  '  **a11y 树从 23 个元素降到 10 个** —— 藏在隐藏容器里的试炼 UI（试炼顶栏那排、战斗按钮、狂怒按钮）',
  '  随容器一起消失，剩下的都是经典模式的 UI。这是"试炼在新版已不可达"最直观的一处体现。',
  '',
  '- 记一笔（小瑕疵）：本次插入的注释用了 CRLF，而 HTML 主体是 LF → 引入了 3 处混合行尾。',
  '  无害（HTML 不在乎行尾），下次改这个文件时顺手统一即可。',
  '',
  '**P5-1c 剩余**：CSS 的试炼文字界面样式（**必须保留** `.trial2d-*` 全套 / `.t2d-lb-btn` /',
  '`body.realtime-trial` 段 —— 画布与布局编辑器在用），以及最后删掉 `Trial` 空壳。',
  '',
  ''
].join('\n');
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
fs.writeFileSync(F, s.replace(ANCHOR, REC + ANCHOR));
console.log('ok P5-1c 第二/三步记录已插入');
