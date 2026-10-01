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

    // ---- 试炼商店测试（真实点击） ----
    resetStateForTest();
    chooseHero(0);
    await sleep(100);
    chooseBonus(0);
    await sleep(100);
    // 启动试炼
    Trial.start();
    await sleep(500);
    // 确保试炼激活
    if (!state.trial.active) {
      state.trial.active = true;
      state.trial.player = { hp: 100, maxHp: 100, attack: 10, shield: 0, potions: 5, gold: 0, strengthPotions: 0, xp: 0 };
    }
    state.trial.points = 200;
    // 打开试炼商店
    openTrialShop(false);
    await sleep(300);
    // 通过DOM点击购买第一个商品
    const shopItems = document.getElementById('trialShopItems');
    assert(shopItems, '试炼商店DOM存在');
    const firstItem = shopItems.querySelector('.condition-item:not(.achieved)');
    if (firstItem) {
      firstItem.click();
      await sleep(300);
      // 验证点数减少
      // 但实际点击后由游戏逻辑处理，我们只需检查是否已拥有或点数变化
      // 这里简单检查点数是否减少（假设购买成功）
      const pointsAfter = state.trial.points;
      assert(pointsAfter < 200, `购买后点数减少（200->${pointsAfter}）`);
    } else {
      cLog('试炼商店无可购买商品', false);
    }

    closeTrialShop();
    await sleep(200);
    assert(document.getElementById('trialShopModal').classList.contains('hidden'), '试炼商店关闭');

    cLog('商品测试通过');
  }, { seed: 123 });

  if (typeof window.__testCallback === 'function') {
    window.__testCallback(result);
  } else if (window.opener) {
    window.opener.postMessage({ type: 'TEST_RESULT', testId: 'shop', result }, '*');
  }
})();