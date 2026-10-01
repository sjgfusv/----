const fs = require('fs');
const P = 'D:\\深渊回廊\\待做\\2.7规划.md';
const add = `
---

## 9. 补充改动：选英雄 / 选增益搬进 2D 画面

**为什么**：2.7 最初把 \`heroSelect\` / \`bonusSelect\` 留给内核 DOM（\`shouldTakeOver()\` 里显式返回 false）。
结果是"点开始游戏 → 先看到一张文字按钮列表"，玩家会以为 2D 没生效 —— 实测反馈就是这么来的
（\`{mode:"heroSelect", hero:false}\` 停在 DOM 选人界面）。这两个界面属于游戏内流程，应该和房间内一样由画布承担。

**改法（能力层 → 宿主层）**

| 层 | 文件 | 改动 |
|---|---|---|
| 表现 | \`战斗2D.js\` | 卡片上限 6 → **12**；\`buildChoiceLayer\` 由"一行铺满"改为**每行最多 5 张、超了换行**，且**每行各自居中**（9 位英雄 = 5 + 4，左对齐会缺一块） |
| 内核 | \`主程序.js\` | \`window.经典2D内核\` 增加 \`chooseHero\` / \`chooseBonus\` / \`getBonusChoices\`（"选了谁"只有一个真相来源，宿主不另存一份） |
| 宿主 | \`经典2D.js\` | \`shouldTakeOver()\` 接入 \`heroSelect\` / \`bonusSelect\`；新增 \`openHeroPanel\` / \`openBonusPanel\`；\`onChoiceResult\` 加 \`hero\` / \`bonus\` 分支回写内核；抽出 \`ensureBooted()\`（只 init 不开局） |

**两个必须知道的坑（都已修）**

1. **空画布**：引擎是在某一次 \`render()\` 里才 init 的，而 Phaser 的场景要**下一帧**才 create ——
   在那一帧内 \`state.scene\` 还是 null，\`openChoicePanel\` 静默返回 false，而 \`render()\` 已经返回 true
   吞掉了这次 DOM 渲染。实测复现：点开始游戏 → \`{mode:'heroSelect', booted:true, engineReady:false, choiceOpen:false}\`，
   画布全屏但什么都没有（在这个宿主里因为标签在后台，场景要 1 秒后才就绪，问题被放大到必现）。
   修法：面板没开出来时 \`schedulePanelRetry()\` 每 120ms 补一次 \`render()\`，开出来就停；~5 秒仍开不出来才 \`giveUp()\` 回退文字界面。
2. **重试链会误开局**：\`scheduleRetry\` 的定时器原来无条件调 \`startRun\`，在选人阶段会把引擎开成一局**自造地图**。
   修法：定时器按 mode 分流 —— 选人 / 选增益阶段只 \`ensureBooted()\`，不 \`startRun\`。

**实测证据（真实浏览器，非推断）**

- 全新一局：清空存档 → 点开始游戏 → \`mode=heroSelect\` → 画布接管 → 轮询补开后
  \`choiceOpen:true, choiceKind:'hero', cards:['0'…'8']\`（9 位全在）
- 点第 1 张卡（走 \`press('clickChoice',0)\` 的真实命中路径）→ \`chooseHero(0)\` + \`render()\` →
  \`mode=bonusSelect, hero=战士\` → 画内弹出 3 张增益
- 点第 1 张增益 → \`chooseBonus(0)\` + \`enterCurrentRoom()\` → \`room=shrine\` → 下一帧 \`render()\` →
  \`startRun\` → \`mode=classic2d, running=true, engine.floor=1, hero 28/28\`
- 尺寸：用 \`buildChoiceLayer(W,H)\` 直接量卡片矩形（\`fits\` = 全部落在画布内）

| 画布 | 9 张卡 | 卡片尺寸 | 两行起始 x | 包围盒 | fits |
|---|---|---|---|---|---|
| 774×334（手机横屏 DPR3） | 5+4 | 129×94 | 37 / 108（居中） | x 37–738, y 104–306 | ✓ |
| 667×375（iPhone SE 横屏） | 5+4 | 115×84 | 26 / 89 | x 26–641, y 130–308 | ✓ |
| 1908×1014（桌面） | 5+4 | 134×96 | 591 / 665 | x 591–1317, y 442–648 | ✓ |
| 774×334 · 3 张增益 | 3 | 168×150 | 121 | x 121–653, y 104–254 | ✓ |

**回归**：\`测试/2D引擎回归.html\` 断言 25 → **28 项全通过**（新增"传 13 张 → 承载 12 张""9 张在 774×334 下排成 5+4""不溢出"）。
顺带修掉该页一个环境依赖：后台标签里 rAF 不跑 → Phaser 的 scale 停在 0×0 → 面板尺寸守卫会让断言随机失败；
现在断言前给 scene 一个真实画幅，跑完还回去。

**缓存标签**：\`战斗2D.js?v=202609770\` / \`经典2D.js?v=202609760\` / \`主程序.js?v=202609750\`（手机必须硬刷新才拿得到）。

**这次测试的副作用（需知）**：为了验"全新一局"路径，开发机浏览器的 \`abyss27_*\` 存档被清过一次又恢复，
恢复的是清理后那一刻的内容 —— 原来那份"第 2 层 / 11 件遗物"的本机存档没能留下（真机存档不受影响）。
以后验证新开局请用状态注入（\`state.mode='heroSelect'\`）而不是清存档。
`;
fs.appendFileSync(P, add, 'utf8');
console.log('appended, lines=' + fs.readFileSync(P, 'utf8').split('\n').length);
