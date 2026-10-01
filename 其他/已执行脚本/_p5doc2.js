/* P5-2 第一部分 文档记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');
const ANCHOR = '## 5. 风险与对策（最高优先的 10 条）';
const REC = [
  '**P5-2 老版回归验证 · 第一部分（隔离性）—— 已完成**',
  '',
  '实测 `老版2.6/主界面.html`（真实浏览器）：',
  '',
  '| 检查 | 结果 |',
  '|---|---|',
  '| 老版引擎在位 | `window.试炼2D` = **true** |',
  '| 老版的 `Trial` 是否被新版空壳污染 | **`stubbed = false`**（老版是真正的 `试炼程序.js`） |',
  '| 新版引擎是否泄漏 | `window.战斗2D` = **false** |',
  '| 新版宿主是否泄漏 | `window.经典2D` = **false** |',
  '| 加载的脚本 | 只有自己目录的 6 个 + `../vendor/phaser.min.js`，不含 `战斗2D.js` / `经典2D.js` |',
  '| 版本号 | `v2.6 by heshen（老版）` |',
  '| 试炼入口 | 按钮仍在（文案「进入试炼」） |',
  '',
  '- 结论：**「新版关停试炼」与「老版保留试炼」这两件事互不影响** —— 这是 P5 最关键的一条不变量，',
  '  也是"老版永远可玩"（规划 §1.2）的实测依据。',
  '- 剩余：老版实际进一局（经典 + 试炼各一次）与 `测试/测试面板.html` 全量跑通。',
  '',
  ''
].join('\n');
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
fs.writeFileSync(F, s.replace(ANCHOR, REC + ANCHOR));
console.log('ok P5-2 第一部分记录已插入');
