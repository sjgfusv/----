/* P1-A：战斗2D.js 的头部定位 + 尾部别名（含换行，统一用 CRLF 写回） */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '战斗2D.js');
const CRLF = '\r\n';
let s = fs.readFileSync(F, 'utf8');

function rep(from, to, label) {
  const f = from.split('\n').join(CRLF);
  const t = to.split('\n').join(CRLF);
  const n = s.split(f).length - 1;
  if (n !== 1) { console.log('!! ' + label + ' 命中 ' + n + ' 次（期望 1）'); return false; }
  s = s.split(f).join(t);
  console.log('ok ' + label);
  return true;
}

rep(` *  深渊回廊 · 试炼模式 2D 实时战斗引擎
 * ------------------------------------------------------------
 *  玩法：横版侧视实时动作战斗（泰拉瑞亚 / 马里奥风格）`,
` *  深渊回廊 · 2D 实时战斗前端（战斗2D）
 * ------------------------------------------------------------
 *  定位：可插拔的实时战斗**表现层**，自身不含任何「试炼」业务语义。
 *    · 楼层 / 房间序列由宿主下发（setFloorPlan）；未下发时退化为自造地图
 *    · 奖励三选一 / 诅咒抉择 / 事件 / 休整面板在本层绘制，选项内容由宿主给定
 *    · 清房、结算、中途存档通过 game 事件与 bridge 回调宿主
 *  玩法：横版侧视实时动作战斗（泰拉瑞亚 / 马里奥风格）`, '头部定位');

rep(` *     房间类型：入口 / 普通 / 精英 / 镜像 / Boss / 宝箱 / 祭坛`,
` *     房间类型：入口 / 普通 / 精英 / 镜像 / Boss / 宝箱 / 祭坛 / 商店 / 休整点 / 随机事件`, '房间类型注释');

rep(`  global.Trial2DLayoutBar = LayoutBar;

  loadSettings();
  global.战斗2D = API;
  global.Trial2D = API;`,
`  global.战斗2DLayoutBar = LayoutBar;
  global.Trial2DLayoutBar = LayoutBar;   // 旧名保留：老宿主与旧测试脚本仍在用

  loadSettings();
  global.战斗2D = API;
  global.试炼2D = API;   // 兼容别名：试炼宿主（试炼程序.js）按旧名取引擎；P5 关停试炼后删除
  global.Trial2D = API;`, '尾部别名');

fs.writeFileSync(F, s);
console.log('written');
