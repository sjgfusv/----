/* P3-5b：宿主侧商店 / 净化 / 祭坛
 *   · shopItemsFor() + shopCostOf()：统一的商品来源与价格（含深渊裂隙「拒绝」的 −10%）
 *   · 净化：有诅咒时才上架的商品，买下解除一条
 *   · 引擎内置商店面板的 bridge（shopData / shopBuy），Boss 后引擎自动开商店时不再显示"数据不可用"
 *   · 祭坛（shrine）：祈祷回血 / 献祭生命解除一条诅咒
 * 用法：node 其他/_p3m.js
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '经典2D.js');
let s = fs.readFileSync(F, 'utf8');
let fails = 0;
function rep(label, from, to, expect) {
  const n = s.split(from).length - 1;
  const want = (expect == null) ? 1 : expect;
  if (n !== want) { console.log('!! ' + label + ' 命中 ' + n + '（期望 ' + want + '）'); fails++; return; }
  s = s.split(from).join(to);
  console.log('ok ' + label);
}

/* ---------- ① 商品来源 / 价格 / 净化：插在 openShopPanel 之前 ---------- */
rep('商品与净化工具',
`  function openShopPanel() {
    var s = S(), e = engine(), k = kernel();
    if (!s || !e || typeof e.openEventPanel !== 'function') return false;
    var items = [];
    try { items = k.buildShopOptions() || []; } catch (err) { items = []; }
    s.shopOptions = items;`,
`  /**
   * 本层商店的商品表
   * 内核的 buildShopOptions()（每层随机上架 4 件、含限购）再**追加「净化」**——
   * 那是诅咒系统的解除途径之一（规划 §3.5），有诅咒时才上架。
   * 结果存进 s.shopOptions，购买时按同一份下标回查 apply —— 顺序必须保持一致。
   */
  function shopItemsFor() {
    var s = S(), k = kernel();
    var items = [];
    try { items = k.buildShopOptions() || []; } catch (err) { items = []; }
    items = items.slice();
    if (rtCurses(s).length) {
      items.push({
        label: '净化',
        cost: 25 + s.floor * 5,
        expCost: 0,
        rarity: 'rare',
        maxPurchase: 99,
        purify: true,
        apply: function () { purifyOneCurse(); }
      });
    }
    s.shopOptions = items;
    return items;
  }

  /** 单件商品的实际价格：内核的难度/商人眼光修正 + 深渊裂隙「拒绝」给的 −10% */
  function shopCostOf(it) {
    var s = S(), k = kernel();
    var cost = it.cost;
    try { cost = k.getShopItemCost(it); } catch (err) { cost = it.cost; }
    // 「拒绝裂隙」的补偿：本层商店价格 −10%（商人眼光的 −2 金币由内核那边算，别重复扣）
    if (s._shopDiscount) cost = Math.max(0, Math.round(cost * (1 - s._shopDiscount)));
    return cost;
  }

  /** 解除一条诅咒（净化商品 / 祭坛献祭共用） */
  function purifyOneCurse() {
    var s = S();
    if (!s || !s._rtCurses || !s._rtCurses.length) return false;
    var removed = s._rtCurses.shift();
    try { kernel().addLog('解除了诅咒「' + removed + '」。'); } catch (e) { /* 忽略 */ }
    pushCursesEnv();
    return removed;
  }

  function openShopPanel() {
    var s = S(), e = engine();
    if (!s || !e || typeof e.openEventPanel !== 'function') return false;
    var items = shopItemsFor();`);

/* ---------- ② 面板内的价格计算改用 shopCostOf ---------- */
rep('面板价格用 shopCostOf',
`    var cards = items.map(function (it, i) {
      var cost = it.cost;
      try { cost = k.getShopItemCost(it); } catch (err) { cost = it.cost; }
      var owned = (s.shopPurchaseCount && s.shopPurchaseCount[it.label]) || 0;`,
`    var cards = items.map(function (it, i) {
      var cost = shopCostOf(it);
      var owned = (s.shopPurchaseCount && s.shopPurchaseCount[it.label]) || 0;`);

/* ---------- ③ 购买：改用 shopCostOf + 净化商品不记限购 ---------- */
rep('buyShopItem 用 shopCostOf',
`  function buyShopItem(idxStr) {
    var s = S(), k = kernel();
    if (!s) return;
    var idx = parseInt(idxStr, 10);
    var it = (s.shopOptions || [])[idx];
    if (!it) return;
    var cost = it.cost;
    try { cost = k.getShopItemCost(it); } catch (e) { cost = it.cost; }
    var gold = (s.player && s.player.gold) || 0;`,
`  function buyShopItem(idxStr) {
    var s = S(), k = kernel();
    if (!s) return;
    var idx = parseInt(idxStr, 10);
    var it = (s.shopOptions || [])[idx];
    if (!it) return;
    var cost = shopCostOf(it);
    var gold = (s.player && s.player.gold) || 0;`);

/* ---------- ④ 引擎内置商店面板的 bridge（Boss 后引擎会自动 openShop） ---------- */
rep('引擎商店 bridge',
`      skillUsed: function (used) {`,
`      /**
       * 引擎**内置**商店面板的数据源（Boss 后 nextFloor 会自动 openShop）
       * 不接的话那块面板会显示"商店数据不可用"。数据与宿主自己的商店面板同源，
       * 保证两边看到的商品、价格、限购完全一致。
       */
      shopData: function (points) {
        var s = S();
        var items = shopItemsFor();
        var gold = (typeof points === 'number') ? points : ((s.player && s.player.gold) || 0);
        return {
          groups: [{
            title: '补给',
            items: items.map(function (it, i) {
              var cost = shopCostOf(it);
              var owned = (s.shopPurchaseCount && s.shopPurchaseCount[it.label]) || 0;
              var max = it.maxPurchase || 0;
              return {
                id: String(i),
                label: it.label + '　' + cost + ' 金币' + (max > 0 && max < 90 ? '（限购 ' + owned + '/' + max + '）' : ''),
                cost: cost,
                affordable: gold >= cost,
                owned: max > 0 && owned >= max,
                rarity: it.rarity
              };
            })
          }]
        };
      },
      shopBuy: function (id, points) {
        var s = S();
        var idx = parseInt(id, 10);
        var it = (s.shopOptions || [])[idx];
        if (!it) return { ok: false, msg: '商品不存在' };
        var cost = shopCostOf(it);
        var gold = (s.player && s.player.gold) || 0;
        var owned = (s.shopPurchaseCount && s.shopPurchaseCount[it.label]) || 0;
        if (it.maxPurchase > 0 && it.maxPurchase < 90 && owned >= it.maxPurchase) {
          return { ok: false, msg: '已达限购' };
        }
        if (gold < cost) return { ok: false, msg: '金币不足' };
        s.player.gold = gold - cost;
        if (!s.shopPurchaseCount) s.shopPurchaseCount = {};
        s.shopPurchaseCount[it.label] = owned + 1;
        if (typeof it.apply === 'function') { try { it.apply(); } catch (e) { warn('商品生效失败：', e); } }
        try { kernel().addLog('购买了 ' + it.label + '（-' + cost + ' 金币）'); } catch (e) { /* 忽略 */ }
        syncPoints();
        pushStats();
        return { ok: true, msg: '已购买 ' + it.label, points: s.player.gold, name: it.label };
      },
      skillUsed: function (used) {`);

/* ---------- ⑤ 祭坛房：祈祷回血 / 献祭生命解除诅咒 ---------- */
rep('祭坛面板',
`  function openEventPanel() {`,
`  /**
   * 祭坛房（shrine）
   * 祈祷：回最大生命的 35%（引擎的祭坛就是这数值）
   * 献祭：以生命换解除一条诅咒 —— 诅咒系统的第二条解除途径（规划 §3.5）
   */
  function openShrinePanel() {
    var s = S(), e = engine();
    if (!s || !e || typeof e.openEventPanel !== 'function') return false;
    var curses = rtCurses(s);
    var heal = Math.round((s.player.maxHp || 20) * 0.35);
    var sacrifice = Math.max(3, Math.round((s.player.maxHp || 20) * 0.15));
    var actions = [{ id: 'pray', label: '祈祷（+' + heal + ' 生命）', primary: true }];
    if (curses.length) {
      actions.push({ id: 'sacrifice', label: '献祭 ' + sacrifice + ' 生命 · 解除一条诅咒' });
    }
    actions.push({ id: 'leave', label: '离开' });
    var cards = [{
      id: 'info', name: '祭坛', quality: 'common', disabled: true,
      desc: curses.length ? ('身上有 ' + curses.length + ' 条诅咒：' + curses.join('、')) : '身上没有诅咒'
    }];
    return e.openEventPanel('shrine', {
      title: '祭坛',
      desc: '生命 ' + Math.round(s.player.hp) + '/' + s.player.maxHp + '　第 ' + s.floor + ' 层',
      cards: cards,
      actions: actions
    });
  }

  function shrineAction(id) {
    var s = S(), k = kernel();
    if (!s) return;
    if (id === 'pray') {
      var heal = Math.round((s.player.maxHp || 20) * 0.35);
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + heal);
      try { k.addLog('在祭坛祈祷，恢复 ' + heal + ' 点生命。'); } catch (e) { /* 忽略 */ }
    } else if (id === 'sacrifice') {
      var cost = Math.max(3, Math.round((s.player.maxHp || 20) * 0.15));
      if (s.player.hp <= cost) {
        try { k.addLog('生命太低，祭坛不接受这次献祭。'); } catch (e) { /* 忽略 */ }
      } else {
        s.player.hp -= cost;
        try { k.addLog('献祭了 ' + cost + ' 点生命。'); } catch (e) { /* 忽略 */ }
        purifyOneCurse();
      }
    }
    pushStats();
    finishNonCombatRoom();
    advanceToNextRoom();
  }

  function openEventPanel() {`);

/* ---------- ⑥ 房间交互分发：加 shrine ---------- */
rep('onRoomAction 加 shrine',
`    if (kind === 'shop') openShopPanel();
    else if (kind === 'rest') openRestPanel();
    else openEventPanel();`,
`    if (kind === 'shop') openShopPanel();
    else if (kind === 'rest') openRestPanel();
    else if (kind === 'shrine') openShrinePanel();
    else openEventPanel();`);

/* ---------- ⑦ 选择结果：加 shrine ---------- */
rep('onChoiceResult 加 shrine',
`    if (kind === 'rest') { restAction(id); return; }`,
`    if (kind === 'rest') { restAction(id); return; }
    if (kind === 'shrine') { shrineAction(id); return; }`);

fs.writeFileSync(F, s);
console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
