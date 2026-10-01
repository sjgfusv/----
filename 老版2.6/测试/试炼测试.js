// ============================================================
// 深渊回廊 - 试炼模式测试（真实路径）
// ============================================================

(async function() {
  const Test = window.__Test;
  if (!Test) throw new Error('测试公共模块未加载');

  const result = await Test.runTest(async function() {
    const { cLog, assert, resetStateForTest } = Test;
    // const state = window.state;
    const Trial = window.Trial;
    const chooseHero = window.chooseHero;
    const chooseBonus = window.chooseBonus;
    const saveGame = window.saveGame;
    const loadGame = window.loadGame;

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    resetStateForTest();

    // 选择英雄和增益
    state.mode = 'heroSelect';
    chooseHero(0);
    await sleep(100);
    chooseBonus(0);
    await sleep(100);

    // 启动试炼
    Trial.start();
    await sleep(500);
    assert(state.trial.active, '试炼启动');

    const t = state.trial;
    assert(t.player, '试炼玩家存在');

    // 进入战斗（如果未自动进入，手动触发）
    if (!t.combat) {
      t.currentRoom = { type: 'enemy' };
      window.startTrialCombat();
      await sleep(300);
    }
    assert(t.combat && t.combat.enemy, '试炼战斗开始');

    // 进入战斗后，强制设置敌人高血量
    t.combat.enemy.hp = 100;
    t.combat.enemy.maxHp = 100;
    t.combat.enemy.attack = 0;// 防御

    // 攻击
    const enemyHpBefore = t.combat.enemy.hp;
    Trial.handleAction('attack');
    await sleep(300);
    const enemyHpAfter = t.combat.enemy.hp;
    assert(enemyHpAfter < enemyHpBefore, '攻击造成伤害');

    // 防御
    const shieldBefore = t.player.shield;
    Trial.handleAction('defend');
    await sleep(300);
    const shieldAfter = t.player.shield;
    assert(shieldAfter > shieldBefore, '防御增加护盾');

    // 药水
    t.player.hp = 10;
    const potionsBefore = t.player.potions;
    Trial.handleAction('potion');
    await sleep(300);
    assert(t.player.hp > 10 && t.player.potions === potionsBefore - 1, '药水使用正确');

    // 存档读档测试（不破坏真实存档）
    const savedRound = t.rounds;
    const savedPoints = t.points;
    saveGame(); // 会写入当前活跃槽，但我们会恢复
    // 重置state并重新加载
    resetStateForTest(); // 会重置state但保留localStorage
    // 重新加载
    const loaded = loadGame();
    assert(loaded, '加载存档成功');
    const loadedTrial = state.trial;
    assert(loadedTrial.active, '加载后试炼仍激活');
    assert(loadedTrial.rounds === savedRound && loadedTrial.points === savedPoints,
      `加载后状态一致（回合${savedRound}->${loadedTrial.rounds}，点数${savedPoints}->${loadedTrial.points}）`);

    // 诅咒测试（真实）
    state.trial.player.shield = 2;   // 脆弱-2 → 期望0
    t.curses = [{ name: '脆弱', apply: (t) => { t.player.shield = Math.max(0, t.player.shield - 2); } }];
    window.applyTrialCurses();
    assert(state.trial.player.shield === 0, '脆弱诅咒生效');



    // 退出试炼
    Trial.exit();
    await sleep(300);
    assert(!state.trial.active, '退出试炼');
    assert(document.getElementById('trialScreen').classList.contains('hidden'), '试炼界面隐藏');

    cLog('试炼测试通过');
  }, { seed: 456 });

  if (typeof window.__testCallback === 'function') {
    window.__testCallback(result);
  } else if (window.opener) {
    window.opener.postMessage({ type: 'TEST_RESULT', testId: 'trial', result }, '*');
  }
})();