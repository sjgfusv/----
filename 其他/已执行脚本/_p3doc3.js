/* P3-5 / P3-6 / 收尾 文档记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');
const ANCHOR = '**本阶段踩到两个「查不出来」的坑（都值得记住）**';
const REC = [
  '**P3-5 房型深化（商店 / 净化 / 祭坛）**',
  '',
  '- 内核房间池加入 `shrine`（祭坛）——经典原本没有祭坛房，加它是为了给诅咒系统一条「献祭解除」途径（规划 §3.5）。',
  '- 统一的商品来源 `shopItemsFor()`（内核 `buildShopOptions()` 的 4 件 + **净化**）与价格 `shopCostOf()`',
  '  （内核的难度/商人眼光修正 + 深渊裂隙「拒绝」给的 −10%）。宿主自己的商店面板与引擎内置商店面板**同源**，',
  '  接了 `shopData / shopBuy` bridge 之后，Boss 后引擎自动开的那块面板不再显示「商店数据不可用」。',
  '- 净化：`25 + 层数 × 5` 金币，解除一条诅咒（有诅咒时才上架）。祭坛：祈祷回最大生命 35% / 献祭 15% 生命解除一条诅咒。',
  '- ⚠️ **修掉两个真问题**：',
  '  1. 引擎 `resolveRoomGoal` 的宿主分流原本只有 shop/rest/event，**祭坛仍走引擎自己的回血** → 祭坛面板永远不弹。',
  '     改成「宿主接了 `roomAction` 时才把 shrine 交出去」——试炼没接 bridge，行为原样不受影响。',
  '  2. 引擎 `openChoicePanel` 有 `slice(0, 4)`，而商店是「4 件商品 + 净化」= 5 张 → **净化被静默截断**，',
  '     表现是「明明上架了却点不到」。上限放宽到 6。',
  '- 实测：商店 5 张卡（`buy:0..buy:4`）→ 买净化 → **`_rtCurses 3→2`**；祭坛面板 `act:pray / act:sacrifice / act:leave`，',
  '  祈祷 `hp 20→28`；休整、事件各自弹面板并正常收尾。',
  '',
  '**P3-6 横屏机制 + 暂停菜单**',
  '',
  '- 横屏：`requestLandscape()`（全屏 + `screen.orientation.lock`）挂在**开始按钮的 click 捕获阶段** ——',
  '  浏览器要求全屏必须在用户手势内发起，等 `render()` 接管时再调已经脱离手势链、会被拒绝。',
  '  退出时 `exitLandscape()` 解锁并退全屏；iOS 不支持 `orientation.lock`，靠 `#trial2DRotateHint` 提示条兜底（不阻塞）。',
  '- 暂停菜单：Esc 键与 HUD「结束本局」**都走 `openPauseMenu()`**（里面是「继续战斗 / 结束本局」），',
  '  比原来的"直接弹退出确认框"多一次反悔机会；已经倒下/结算中时 `openPauseMenu()` 返回 false 自动落回原逻辑。',
  '- 实测：`Esc` → `pause=true`，resume 后 `pause=false`；`clickHud("quit")` → 同样 `pause=true`。',
  '',
  '**P3 阶段收尾（验收）**',
  '',
  '- 自动连闯 **3 层（floor 1 → 4）零错误**，期间面板序列覆盖全部类型：',
  '  `reward(3)` / `relic(3)` / `rift(3)` / `event(3)` / `rest(1)` / `shrine(1)` / `shop(5)` —— 七种面板都自然出现过。',
  '- 存读一致：`saveGame()` 后从存档读回 `floor=4 / gold=42 / relics=5 / _rtCurses=2 / hero=warrior`，与内存状态一致。',
  '- 结束时 `relics=5`、`curses=2`、`hp=36`、`running=true`，无异常。',
  '',
  ''
].join('\n');
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
s = s.replace(ANCHOR, REC + ANCHOR);
s = s.replace('#### P3 进展记录（P3-1 / P3-2 / P3-3 已完成）', '#### P3 完成记录（P3-1 ~ P3-6 全部完成）');
fs.writeFileSync(F, s);
console.log('ok P3-5/P3-6/收尾 记录已插入');
