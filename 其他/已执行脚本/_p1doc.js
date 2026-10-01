/* P1 文档更新：状态行 + P1 完成记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
const CRLF = '\r\n';
let s = fs.readFileSync(F, 'utf8');
let fails = 0;
function rep(from, to, label, expect) {
  const f = from.split('\n').join(CRLF);
  const t = to.split('\n').join(CRLF);
  const n = s.split(f).length - 1;
  const want = (expect == null) ? 1 : expect;
  if (n !== want) { console.log('!! ' + label + ' 命中 ' + n + '（期望 ' + want + '）'); fails++; return false; }
  s = s.split(f).join(t);
  console.log('ok ' + label);
  return true;
}

rep(`> 状态：**P0 已完成并交付**（相机修复 + 老版快照 + 切换按钮 + 存档隔离）；P1 起为后续阶段`,
`> 状态：**P0、P1 已完成并交付**（P0：相机修复 + 老版快照 + 切换按钮 + 存档隔离；P1：引擎去试炼化 + 主权移交接口）；P2 起为后续阶段`, '状态行');

rep(`- **验收**：单独打开 2D 层能跑通一局；\`debug()\` 输出中 room/shop/HUD 结构与改造前一致；用 \`press()\` 驱动一遍自动化流程；老版回归无变化。

### P2 · 经典2D 宿主跑通主循环`,
`- **验收**：单独打开 2D 层能跑通一局；\`debug()\` 输出中 room/shop/HUD 结构与改造前一致；用 \`press()\` 驱动一遍自动化流程；老版回归无变化。

#### P1 完成记录（实测证据）

**交付物**：\`战斗2D.js\`（原 \`试炼2D.js\` 改名并改造，根目录旧文件已删；\`老版2.6/试炼2D.js\` 保持 464508 字节不变 = 完整回滚点）。
\`window.战斗2D\` = 新名，\`window.试炼2D\` 保留为**同一对象的别名**（试炼宿主无需改动）；\`战斗2DLayoutBar\` / \`Trial2DLayoutBar\` 同理。API 从 45 个增至 66 个。

| 交接能力（§3.11） | 落地 | 实测证据 |
|---|---|---|
| 1 楼层/房间序列由宿主决定 | \`API.setFloorPlan\` + \`Scene.floorMapFromPlan\` + \`linkCols\` | \`{rooms:['enemy','treasure','boss']}\` → 引擎自动补入口得 \`['start','enemy','treasure','boss']\`，\`debug().floorMapFromPlan=true\` |
| 2 清房通知宿主 | 事件 \`rt:room-cleared\`（在 \`openPortal\` 首次开门处） | 载荷 = 完整存档快照 + \`roomsClearedThisFloor\` + \`pulseInterval\` |
| 3 奖励三选一面板 | \`openRewardChoice\` / \`openCurseChoice\` / \`openEventPanel\` → 通用 \`openChoicePanel(kind,data)\` | 3 卡 + 1 按钮命中正常，\`bridge.choiceResult\` 回传 \`{kind,action,id,card,index}\` |
| 4 诅咒池定义下发 | \`API.setCursePool\`，\`curseByName\` 以下发池为唯一依据 | 下发 2 条后传 \`['脆弱','虚弱','不存在的诅咒']\` → 实际生效 \`['脆弱','虚弱']\`（表外静默丢弃，R9 行为已可观测） |
| 5 遗物承载点 | \`API.setRelics\` + \`recomputeRelicFx\` + 三个钩子 | \`['lightBoots','ironWall','greedyHeart']\` → \`relicFx={stamMax:30,stamRegen:.3,guardPerfect:80,goldGain:.35,takenMult:.1}\`；**清一只普通怪金币 60→63**（2×(1+0.35)≈3，遗物金币增益实测生效） |
| 6 中途存档 | \`bridge.checkpoint\` + 事件 \`rt:checkpoint\`（进房 / 清房 / 换层三处调用） | 一局内收到 6 条快照，序列 \`room-cleared→room→room-cleared→room→room-cleared→floor\` |
| 7 暂停菜单 | \`openPauseMenu\` / \`closePauseMenu\` + \`pauseOpen\` 并入面板体系 | 打开→\`rt:pause{open:true}\`→按钮 \`resume\` 命中→关闭，\`running\` 保持 true |
| 8 房间类型扩展 | \`ROOM_TYPES\` 增 \`shop/rest/event\` + \`nonCombatRoom()\` + \`spawnRoomGoal\` + \`finishRoomGoal\` | 三种房间各自生成目标物、触发 \`rt:room-action\`、\`awaiting\` 状态正确、宿主 \`finishRoomGoal\` 后才开门 |
| 12 脉冲节拍可配置 | \`API.setPulseProfile\` + \`pulseInterval()\` / \`pulseWarn()\` | 曲线 \`{start:4000,step:500,min:2000}\`：清 0/1/2 房 → **4000→3500→3000**；换层后 \`floorRoomsCleared\` 归零、层数项生效 → **3950** |

**结构回归**：\`debug()\` 原有字段**零丢失**（逐字段比对基线），新增 13 项（\`pauseOpen/choiceOpen/choiceKind/choiceCards/relics/relicFx/pulseProfile/pulse/floorRoomsCleared/floorPlan/floorMapFromPlan/cursePool\`）；\`buttons\` 与 \`hero\` 结构与改造前一致。

**老版回归**：\`老版2.6/\` 引擎 464508 字节未变；老版页面 \`window.战斗2D\` **不存在**（引擎不互漏）、脚本只加载自己目录 + \`../vendor/phaser.min.js\`、版本显示 v2.6。存档键 \`abyss27_*\` 与老版互不影响。

**顺延项（1 条）**：§4 P1 第 5 条「横屏机制抽到新版宿主」顺延到 P2 —— \`_requestLandscapeLock()\` 必须在"开始游戏"的**点击手势链**内调用，而持有该手势链的是 P2 的 \`经典2D.js\`；先在 P1 抽成无调用者的模块会出现"无法验证的空转"。P2 落地宿主时一并抽为独立模块（\`试炼程序.js\` 在 P5 关停前保持原样）。

**新增文案/行为差异（需知悉）**：引擎内「试炼点数/点数」→「金币」；画内「试炼商店 / 深渊试炼 · 第 N 层 / 退出试炼（→结束本局）」已去试炼化；脉冲 HUD 现在显示"当前节拍"（\`腐化脉冲 2.4s · 节拍 3.1s\`）。\`abyss_trial2d_settings/layout\` 两个持久化键按 §3.9 沿用未改名。

### P2 · 经典2D 宿主跑通主循环`, 'P1 完成记录');

fs.writeFileSync(F, s);
console.log(fails ? '\n有未命中' : '\n已写回');
