// ============================================================
// 深渊回廊 - 增益测试（直接使用游戏增益池）
// ============================================================

(async function() {
  const Test = window.__Test;
  if (!Test) throw new Error('测试公共模块未加载');

  const result = await Test.runTest(async function() {
    const { cLog, assert, resetStateForTest } = Test;
    // const state = window.state;
    const chooseHero = window.chooseHero;
    const chooseBonus = window.chooseBonus;
    const Trial = window.Trial;

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // 获取游戏真实增益池（若未暴露，通过模拟选择获取）
    // 但为了测试，我们直接使用游戏中的 getBonusChoices 函数
    const getBonusChoices = window.getBonusChoices;
    if (!getBonusChoices) {
      cLog('⚠️ getBonusChoices 未暴露，跳过增益测试', false);
      return;
    }

    resetStateForTest();

    // 测试每个增益在经典模式下的应用
    const allBonuses = getBonusChoices();
    const fullBonusList = window.__ALL_BONUSES;
    if (!fullBonusList) {
      cLog('⚠️ window.__ALL_BONUSES 未定义，请确保主程序已暴露全量增益', false);
      return;
    }

    // 测试每个增益在经典模式的应用
    for (const bonus of fullBonusList) {
      resetStateForTest();
      state.mode = 'heroSelect';
      chooseHero(0);
      await sleep(50);
      // 模拟选择该增益（需要构建可用增益列表）
      state.availableBonuses = [bonus];
      chooseBonus(0);
      await sleep(50);
      // 验证是否应用（检查对应属性变化，这里简化只检查是否在bonuses列表）
      const found = state.bonuses.some(b => b.title === bonus.title);
      assert(found, `经典模式：增益“${bonus.title}”已应用`);
    }

    // 测试在试炼模式下的复制
    for (const bonus of fullBonusList) {
      resetStateForTest();
      chooseHero(0);
      await sleep(50);
      state.availableBonuses = [bonus];
      chooseBonus(0);
      await sleep(50);
      Trial.start();
      await sleep(300);
      if (state.trial.active) {
        const foundTrial = state.trial.bonuses.some(b => b.title === bonus.title);
        assert(foundTrial, `试炼模式：增益“${bonus.title}”已复制`);
        Trial.exit();
        await sleep(100);
      } else {
        cLog(`试炼模式：增益“${bonus.title}”未能启动试炼`, false);
      }
    }

    cLog('增益测试通过');
  }, { seed: 789 });

  if (typeof window.__testCallback === 'function') {
    window.__testCallback(result);
  } else if (window.opener) {
    window.opener.postMessage({ type: 'TEST_RESULT', testId: 'bonus', result }, '*');
  }
})();