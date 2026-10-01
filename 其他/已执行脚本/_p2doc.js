/* P2 文档更新：在 P3 小节前插入 P2 完成记录（规划文档是纯 LF） */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');

const ANCHOR = '### P3 · 奖励与 Roguelike 化';
const REC = [
  '#### P2 完成记录（实测证据）',
  '',
  '**交付物**：`经典2D.js`（宿主）+ 引擎补 `API.rebuildFloorMap()` + `主程序.js` 加 `window.经典2D内核`（22 项窄接口）与两处 early-return。',
  '',
  '**分工定稿**：内核管规则与数据 / 宿主管房间映射与面板内容 / 表现层只管画面。主程序只多两行：',
  '```js',
  'function render() {',
  '  if (state.trial.active) { Trial.render(); return; }',
  '  if (window.经典2D && window.经典2D.render()) return;   // ← 新增，必须在函数体最前面',
  '  ...',
  '```',
  '`handleAction()` 同理，插在试炼分支之后、`state.detailMode` 拦截之前。',
  '',
  '**实测：一局跑通**（真实浏览器驱动，该局 `state.rooms = [mirror, enemy, rest, rest, boss]`）',
  '',
  '| 环节 | 证据 |',
  '|---|---|',
  '| 宿主接管 | 点「开始游戏」→ `state.mode = "classic2d"`、`经典2D.debug().active = true`（无需任何手动干预） |',
  '| 楼层规划下发 | 引擎 `roomPlan` **严格等于** `state.rooms`（每间一列，不会多出入口房） |',
  '| 经济对齐 | 清普通房 112→121（= 经典 `max(1,round((8+1)×1.0))`）；Boss 房 130→148（双份）；另给经验 `(5+层)` |',
  '| 奖励三选一 | 用内核 `buildRewardOptions()` 出卡；选中「荆棘 +1」后 `state.thornLevel 0→1`（内核 `apply()` 真被调了） |',
  '| 房间索引对齐 | 用引擎的**列号**定位：`rest` 连排时第 3/4/5 间全部正确 |',
  '| 非战斗房 | rest 走近 → 画内面板 → 歇息 `hp 20→25`（= `5 + 神圣庇护×2 + restBonus`）→ `finishRoomGoal` 后才开门 |',
  '| 中途存档 | 进房 / 清房各一次 `bridge.checkpoint` → 内核 `saveGame()`（每间房 2 次） |',
  '| 换层 | Boss 清空 → 走传送门 → `floor 1→2`、`roomIndex` 归零、内核重生成 `rooms` 与环境、引擎按新规划重建地图 |',
  '| 死亡回写 | `bridge.exit({reason:"dead"})` → `gameOver` / `mode="gameover"` + `updateRecords(false)` |',
  '',
  '**过程中发现的三个真问题（都已修；这类"静默失败"最值得记住）**',
  '',
  '| # | 现象 | 根因 | 修法 |',
  '|---|---|---|---|',
  '| ① | 奖励三选一**静默不弹**，但金币照常结算 | `#trial2DStage` 在 `#trialScreen` 内部，而后者是 `.hidden`（opacity/scale，不是 display:none）→ 试炼未激活时容器高度塌掉，Phaser RESIZE 跟着父容器走，画布实测只有 **1279×214**（`--trial2d-vh` 明明是 797px）→ 画内面板的尺寸守卫把它挡了 | `showStage` 不走 CSS：用 inline style 把 stage 钉成全屏 fixed，并在设完后**手动 `scale.refresh()`**（inline style 不会触发 Phaser 的 resize 监听，否则画布停在 0×0），退出时清掉 inline 还原给原来的 CSS |',
  '| ② | 一层里出现**两个同类型房间**时内核 `roomIndex` 认错（两间 rest 连排，第 4 间被记成第 3 间） | `onRoom` 原先按"类型 + 从当前下标往后找"匹配 | 改用引擎给的**列号** `rt:room.room.col` 直接定位 —— 宿主用 `planFromRooms` 每间放一列，col 严格等于内核下标 |',
  '| ③ | 画内面板开两次、同一处存档连写两遍 | 引擎 `notifyCheckpoint` / `notifyRoomAction` **bridge 与事件都发**，而宿主两边都接 | 两者改成**二选一**（接了 bridge 就不再发事件） |',
  '',
  '**遗留（P3 起处理，按重要性排序）**',
  '',
  '1. **数值统一（风险 R1/R2/R3）还没做 —— 这是平衡命门**：经典层 1 普通怪 hp **6**，引擎 `claw` hp **24**；经典层主 hp **16**，引擎 `lord` hp **160**（差 10 倍）；成长曲线也不同（经典线性斜率 2 vs 引擎 `def.hp×(1+0.2(f−1))`，层 999 相差 16 倍）。规划 §3.6 定的是"统一到经典公式"，建议按侦察的 R1 走**方案②：降引擎基数**（引擎的 `atk/windup/recover/attackRange` 都是按 hp 24 配的手感，只动 hp 最安全），并加一层封顶。**必须先做这个再谈平衡。**',
  '2. **结局面板（13 种）未接**：与经典现状一致（结局只在楼层上限触发，`MAX_FLOOR=999` 或自定义 `floorCap`），所以不算回归；但"打通关"的观感需要它。',
  '3. **引擎内置商店面板未接**：`nextFloor()` 后引擎会自己 `openShop()`，此时宿主没接 `shopData` → 显示"商店数据不可用"（带返回按钮，**不卡住**）。P3 接 `shopData/shopBuy`，复用内核 `buildShopOptions/getShopItemCost`。',
  '4. **遗物映射表只有 4 条**（`RELIC_LABEL_TO_ID`）：内核遗物只有中文 label、引擎 `RELIC_FX` 只认英文 id，这张表是唯一的桥。P3 按 §3.4 重做 24 件时替换它。',
  '5. **英雄主动技能只在 `skillUsed` 上回写**，未触发内核 `activateHeroSkill()` 的效果（2D 里技能走引擎自己的实现）。',
  '6. **横屏机制（P1 顺延项）与暂停菜单接入**未做。',
  '7. 内核既有 bug（侦察发现，本轮**未修**，避免与 P2 混在一起）：`state.relics[i].apply` / `shopOptions[i].apply` / `rewardOptions[i].apply` **读档后无重绑**（`setSlotData` 是裸 `JSON.stringify`）；`猎人本能` 是死遗物（`firstStrikeReduction` 全文件无写入点）；`getShopItemCost` 的倒贴分支不可达（被自己的 `Math.max(0,…)` 吃掉）；图鉴数据是硬编码副本（漏 2 条条件遗物、且有商店里并不存在的幽灵条目）。',
  '',
  '**回退开关**：URL 加 `?classic2d=0`，或 `localStorage.abyss27_classic2d = "0"` → `active()` 返回 false，主程序自动走回合制（切老版之外的第二条退路）。',
  '',
  ''
].join('\n');

const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n + ' 次'); process.exit(1); }
s = s.replace(ANCHOR, REC + ANCHOR);
s = s.replace('> 状态：**P0、P1 已完成并交付**', '> 状态：**P0、P1、P2 已完成并交付**');
s = s.replace('P1：引擎去试炼化 + 主权移交接口）；P2 起为后续阶段',
  'P1：引擎去试炼化 + 主权移交接口；P2：经典2D 宿主跑通主循环）；P3 起为后续阶段');
fs.writeFileSync(F, s);
console.log('ok 已插入 P2 完成记录');
console.log('校验: ' + s.includes('P2 完成记录（实测证据）') + ' / ' + s.includes('1279×214') + ' / ' + s.includes('P0、P1、P2 已完成'));
