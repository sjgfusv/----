/* P2-A：引擎补 rebuildFloorMap + 内核加窄接口与两处 early-return
 * 用法：node 其他/_p2.js
 * 注意：主程序.js 是 CRLF；待做文档是 LF —— 这里只改 .js，统一 CRLF。
 */
const fs = require('fs');
const path = require('path');
const CRLF = '\r\n';
let fails = 0;

function patch(file, rules) {
  const F = path.join(__dirname, '..', file);
  let s = fs.readFileSync(F, 'utf8');
  console.log('=== ' + file + ' ===');
  for (const [label, from, to, expect] of rules) {
    const f = from.split('\n').join(CRLF);
    const t = to.split('\n').join(CRLF);
    const n = s.split(f).length - 1;
    const want = (expect == null) ? 1 : expect;
    if (n !== want) { console.log('!! ' + label + ' 命中 ' + n + '（期望 ' + want + '）'); fails++; continue; }
    s = s.split(f).join(t);
    console.log('ok ' + label + (want !== 1 ? ' ×' + want : ''));
  }
  fs.writeFileSync(F, s);
}

/* ============ 1. 引擎：换层后按新规划重建本层地图 ============ */
patch('战斗2D.js', [
  ['rebuildFloorMap', `    /** 取本层的房间图：宿主下发过规划就用宿主的，否则退回内置自造地图 */
    makeFloorMap(floor) {
      var m = this.floorMapFromPlan(HOST.floorPlan, floor);
      return m || generateFloorMap(floor);
    }`,
`    /** 取本层的房间图：宿主下发过规划就用宿主的，否则退回内置自造地图 */
    makeFloorMap(floor) {
      var m = this.floorMapFromPlan(HOST.floorPlan, floor);
      return m || generateFloorMap(floor);
    }

    /**
     * 用**当前下发的规划**重取本层地图（宿主换层后调用）
     * ------------------------------------------------------------
     * 为什么需要它：nextFloor() 的顺序是「先 makeFloorMap(next) → 再 emit rt:floor
     * → 最后 roomNode = floorMap.current」。宿主只有在收到 rt:floor 时才知道层数变了、
     * 才能生成并下发新一层的房间序列 —— 那时地图已经用旧规划造好了。
     * 于是宿主在该事件里调本函数替换 floorMap，后面那句 roomNode = floorMap.current
     * 自然就指到新地图的入口，不需要引擎再做任何协调。
     */
    rebuildFloorMap() {
      if (!this.running || !this.floorMap) return false;
      var m = this.makeFloorMap(this.floor);
      if (!m) return false;
      this.floorMap = m;
      this.roomNode = m.current;
      this.refreshHud();
      return true;
    }`, 1]
]);

/* ============ 2. 主程序：内核窄接口 + render early-return ============ */
patch('主程序.js', [
  ['内核接口 + render 接管', `function render() {
  // ===== 试炼模式渲染 =====
  if (state.trial.active) {
    Trial.render();
    return;
  }`,
`/* ============================================================
   经典 2D 宿主（经典2D.js）可用的内核窄接口
   ------------------------------------------------------------
   为什么需要这一层：顶层 const/let **不会**挂到 window（difficultyModifiers /
   ENVIRONMENT_EFFECTS / CUSTOM_DIFFICULTY_HELP 全是 const），宿主直接摸全局会拿到
   undefined，而且这种失败是**静默**的。这里把宿主真正需要的东西显式导出，顺带把
   "哪些算稳定契约"钉下来。改动本块前先看 经典2D.js 的调用点。
   ============================================================ */
window.经典2D内核 = {
  state: function () { return state; },
  difficultyModifiers: function () { return difficultyModifiers; },
  heroOptions: function () { return heroOptions; },
  generateFloorRooms: generateFloorRooms,
  generateEnvironmentEffect: generateEnvironmentEffect,
  formatEnvDescription: formatEnvDescription,
  rebuildEnvironmentFromTemplate: rebuildEnvironmentFromTemplate,
  buildRewardOptions: buildRewardOptions,
  buildShopOptions: buildShopOptions,
  getShopItemCost: getShopItemCost,
  getRandomEvent: getRandomEvent,
  getEndOptions: getEndOptions,
  getRandomRelicByRarity: getRandomRelicByRarity,
  getRelicOptions: getRelicOptions,
  countRelic: countRelic,
  normalizeCustomDifficulty: normalizeCustomDifficulty,
  addLog: addLog,
  showToast: showToast,
  spawnDamageFloat: spawnDamageFloat,
  addPotion: addPotion,
  saveGame: saveGame,
  updateRecords: updateRecords
};

function render() {
  // ===== 试炼模式渲染 =====
  if (state.trial.active) {
    Trial.render();
    return;
  }
  // ===== 经典 2D 实时模式（经典2D.js）=====
  // 必须留在函数体最前面：scheduleRender 会在商店/事件路径高频调用 render。
  // 宿主返回 true = 本次 DOM 渲染由它接管（画布全屏盖在上面）；
  // 返回 false = 未接管（选英雄/选增益/死亡结算/引擎不可用回退）→ 照常走下面的回合制渲染。
  // 想临时关掉 2D：URL 加 ?classic2d=0，或 localStorage.abyss27_classic2d = '0'
  if (window.经典2D && window.经典2D.render()) return;`, 1],

  ['handleAction 接管', `  // 试炼模式统一委托
  if (state.trial.active) {
    Trial.handleAction(action);
    return;
  }`,
`  // 试炼模式统一委托
  if (state.trial.active) {
    Trial.handleAction(action);
    return;
  }

  // 经典 2D 实时模式：先问宿主是否消费这个动作。
  // 必须放在 state.detailMode 拦截（下一段）之前，否则详情模式会吞掉 2D 操作。
  // 宿主默认放行（返回 false），顶栏的图鉴/设置/存档管理等照常由内核处理。
  if (window.经典2D && window.经典2D.handleAction(action)) return;`, 1]
]);

console.log(fails ? `\n有 ${fails} 条未命中` : '\n全部命中');
