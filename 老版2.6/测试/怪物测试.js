// ============================================================
// 深渊回廊 - 怪物测试（所有怪物类型）
// ============================================================

(async function() {
  const Test = window.__Test;
  if (!Test) throw new Error('测试公共模块未加载');

  const result = await Test.runTest(async function() {
    const { cLog, assert, resetStateForTest } = Test;
    // const state = window.state;
    const chooseHero = window.chooseHero;
    const chooseBonus = window.chooseBonus;
    const startCombat = window.startCombat;
    const attackEnemy = window.attackEnemy;

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    resetStateForTest();
    chooseHero(0);
    await sleep(50);
    chooseBonus(0);
    await sleep(50);

    // 测试普通敌人（黑暗爪牙）
    state.currentRoom = { type: 'enemy' };
    state.mode = 'event';
    enterCurrentRoom();
    await sleep(200);
    assert(state.combat && state.combat.enemy.name === '黑暗爪牙', '普通敌人生成');
    const normalEnemy = state.combat.enemy;
    assert(normalEnemy.hp > 0 && normalEnemy.attack > 0, '普通敌人属性正确');

    // 测试精英守卫
    state.currentRoom = { type: 'elite' };
    state.mode = 'event';
    startCombat(true);
    await sleep(200);
    assert(state.combat && state.combat.enemy.name === '精英守卫', '精英敌人生成');
    const eliteEnemy = state.combat.enemy;
    assert(eliteEnemy.hp > normalEnemy.hp && eliteEnemy.attack > normalEnemy.attack, '精英属性更强');

    // 测试Boss（层主）
    state.floor = 3;
    state.currentRoom = { type: 'boss' };
    state.mode = 'bossPrep';
    // 直接开始战斗
    startCombat(false);
    await sleep(200);
    assert(state.combat && state.combat.enemy.name.includes('层主'), 'Boss生成');
    const boss = state.combat.enemy;
    assert(boss.hp > eliteEnemy.hp && boss.attack > eliteEnemy.attack, 'Boss属性更强');

    // 测试咕咕嘎嘎
    state.floor = 1;                                  // ← 层数归1，保证 hp=40/atk=3
    state.rooms = [{ type: 'enemy', isGugugaga: true }];  // ← 固定房间
    state.roomIndex = 0;
    enterCurrentRoom();
    await sleep(200);
    assert(state.combat && state.combat.enemy.name === '咕咕嘎嘎', '咕咕嘎嘎生成');
    const gugu = state.combat.enemy;
    assert(gugu.hp === 40 && gugu.attack === 3, '咕咕嘎嘎基础属性正确');

    // 测试两次攻击后诅咒
    // 攻击第一次
    attackEnemy();
    await sleep(300);
    // 攻击第二次
    attackEnemy();
    await sleep(300);
    assert(state._pendingGugugaga === true, '两次攻击后触发诅咒标记');
    // 清除标记避免影响后续
    state._pendingGugugaga = false;

    // 测试自定义难度下的怪物属性变化
    state.difficulty = 'custom';
    state.customDifficulty = { enemyHp: 2.0, enemyAtk: 1.5, goldReward: 1, shopCost: 0, restBonus: 0, enemyExtra: 1 };
    state.currentRoom = { type: 'enemy' };
    state.mode = 'event';
    enterCurrentRoom();
    await sleep(200);
    const customEnemy = state.combat.enemy;
    // 基础hp约6，倍率2.0 => 约12
    assert(customEnemy.hp >= 10 && customEnemy.attack >= 4, '自定义难度影响怪物属性');

    // 测试10层后怪物额外属性（荆棘/闪避等）
    state.floor = 25;
    state.currentRoom = { type: 'enemy' };
    state.mode = 'event';
    enterCurrentRoom();
    await sleep(200);
    const extraEnemy = state.combat.enemy;
    // 10层后应有额外属性
    assert(extraEnemy.thorn > 0 || extraEnemy.dodge > 0 || extraEnemy.vampire > 0 || extraEnemy.combo > 0 || extraEnemy.crit > 0,
      '10层后怪物获得额外属性');

    cLog('怪物测试通过');
  }, { seed: 282930 });

  if (typeof window.__testCallback === 'function') {
    window.__testCallback(result);
  } else if (window.opener) {
    window.opener.postMessage({ type: 'TEST_RESULT', testId: 'monster', result }, '*');
  }
})();