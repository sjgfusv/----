// ============================================================
// 深渊回廊 - 商品系统测试（真实商店购买路径）
// ============================================================

(async function() {
  const Test = window.__Test;
  if (!Test) throw new Error('测试公共模块未加载');

  const result = await Test.runTest(async function() {
    const { cLog, assert, resetStateForTest } = Test;
    // const state = window.state;
    const chooseHero = window.chooseHero;
    const chooseBonus = window.chooseBonus;
    const buyFromShop = window.buyFromShop;
    const leaveShop = window.leaveShop;
    const buildShopOptions = window.buildShopOptions;
    const getShopItemCost = window.getShopItemCost;
    const loadTrialUnlocks = window.loadTrialUnlocks;
    const saveTrialUnlocks = window.saveTrialUnlocks;
    const Trial = window.Trial;
    const openTrialShop = window.openTrialShop;
    const closeTrialShop = window.closeTrialShop;

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ---- 经典商店测试 ----
    resetStateForTest();
    state.mode = 'heroSelect';
    chooseHero(0);
    await sleep(100);
    chooseBonus(0);
    await sleep(100);

    // 进入商店
    state.currentRoom = { type: 'shop' };
    state.mode = 'event';
    window.resolveEvent(); // 生成商品
    await sleep(200);
    assert(state.mode === 'shop', '经典商店打开');

    // 测试价格计算
    const options = state.shopOptions;
    assert(options.length > 0, '有商品');
    const item = options[0];
    const cost = getShopItemCost(item);
    assert(cost >= 0, `商品价格${cost}（非负）`);

    // 购买商品
    state.player.gold = 999;
    const countBefore = state.shopPurchaseCount[item.label] || 0;
    buyFromShop(0);
    await sleep(200);
    const countAfter = state.shopPurchaseCount[item.label] || 0;
    assert(countAfter === countBefore + 1, `购买成功（${item.label}）`);

    leaveShop();
    await sleep(100);
    assert(state.mode !== 'shop', '离开商店');

    // 测试稀有商品限购（手动构造）
    const rareItem = {
      label: '稀有测试品',
      cost: 10,
      expCost: 10,
      rarity: 'rare',
      maxPurchase: 2,
      apply: () => {}
    };
    // 离开商店后重新进入商店模式
    state.mode = 'shop';
    state.shopOptions = [rareItem];
    state.shopPurchaseCount[rareItem.label] = 0;
    state.player.gold = 999;
    for (let i = 0; i < 2; i++) {
        state.shopOptions = [rareItem];  // 每次购买后重建
        buyFromShop(0);
        await sleep(100);
    }
    state.shopOptions = [rareItem];
    buyFromShop(0);

    const finalCount = state.shopPurchaseCount[rareItem.label] || 0;
    assert(finalCount === 2, `稀有商品购买2次成功`);
    // 第三次购买应失败（因为达到限购）
    buyFromShop(0);
    await sleep(100);
    const afterThird = state.shopPurchaseCount[rareItem.label] || 0;
    assert(afterThird === 2, `达到限购后无法继续购买`);

    // 试炼商店测试已随试炼关停移除（P5）：新版只有一个商店（2D 画内），

    cLog('商品测试通过');
  }, { seed: 123 });

  if (typeof window.__testCallback === 'function') {
    window.__testCallback(result);
  } else if (window.opener) {
    window.opener.postMessage({ type: 'TEST_RESULT', testId: 'shop', result }, '*');
  }
})();