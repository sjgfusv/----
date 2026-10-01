/* P4-3b + P4 验收 文档记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');
const ANCHOR = '### P5 · 试炼关停与回归';
const REC = [
  '**P4-3b 商品目录提成唯一数据源 + 图鉴派生（P4 收尾）**',
  '',
  '- 把 `buildShopOptions()` 里的 `common` / `rare` 数组提成模块级 `SHOP_ITEMS_COMMON` / `SHOP_ITEMS_RARE`，',
  '  并补上图鉴需要的 `desc`；`buildShopOptions()` 改为从目录现算',
  '  （`expCost = cost`、`maxPurchase = 基准 + state.shopLimitBonus`，行为与改造前逐项一致 ——',
  '  `shopLimitBonus` 是运行时才定的，所以目录里只存基准值）。',
  '- 图鉴「道具&商品」改为派生同一份目录，不再手抄。',
  '- 实测：图鉴 12 条**全部是商店真实存在的商品** —— `hasGhost=false`（幽灵条目「强化武器」消失）、',
  '  `hasShieldPotion=true`（之前图鉴里没有的「护盾药剂」补上了），条目形如「治疗药水（10 金币）」。',
  '  **与 `buildShopOptions()` 的实况对照一致**：实出 4 件（生命之源 38/灵能徽章 28/护盾药剂 12/力量药水 18）',
  '  都能在 12 条里找到，限购 5（稀有）/ 20（普通）也对。',
  '',
  '**P4 验收（对照规划 §4 P4 的验收条目）**',
  '',
  '| 验收项 | 证据 |',
  '|---|---|',
  '| 作弊项逐个生效 | P4-1：生命/上限/护盾/攻击/遗物/诅咒/跳层/跳房/无敌逐项实测；无敌还做了「开 → kill 不死 / 关 → kill 立刻死」的对照 |',
  '| 图鉴每条与实际数值一致 | P4-3：遗物 24 条派生自唯一实现（不再手抄）；P4-3b：商品 12 条与商店实况对照一致 |',
  '| 风格自评通过 | P4-4b：令牌收口后 8 个模态框同底色（`rgba(15,22,44,.98)`）/ 同圆角阶梯（18/10/6）/ 同阴影档；浏览器表面（选中/滚动条/插入符/焦点环）已用调色板主题化 |',
  '',
  '**P4 阶段遗留（都已有明确归属，不阻塞 P5）**',
  '',
  '- `主界面.html` 第 636 行还有 1 处旧内联样式（`style="display:flex;align-items:flex-end;"`，属原有代码风格）。',
  '- `impeccable` 引擎无法在本机使用（GitHub 不可达），其自动化检测器与 `document`/`critique` 等子命令本轮用不上；',
  '  本次按技能指引改为直接读项目视觉真相 + 手工对照 `craft-floor.md`。',
  '',
  ''
].join('\n');
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
s = s.replace(ANCHOR, REC + ANCHOR);
s = s.replace('#### P4 进展记录（P4-1 / P4-2 已完成）', '#### P4 完成记录（P4-1 ~ P4-4 全部完成）');
fs.writeFileSync(F, s);
console.log('ok P4-3b 与 P4 验收已插入');
