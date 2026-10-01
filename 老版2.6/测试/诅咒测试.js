// ============================================================
// 深渊回廊 - 诅咒测试（使用真实游戏路径）
// ============================================================

(async function() {
  const Test = window.__Test;
  if (!Test) throw new Error('测试公共模块未加载');

  const result = await Test.runTest(async function() {
    const { cLog, assert, resetStateForTest } = Test;
    // 直接使用全局 state，无需重新声明
    const Trial = window.Trial;
    const TRIAL_CURSES = window.TRIAL_CURSES;
    const chooseHero = window.chooseHero;
    const chooseBonus = window.chooseBonus;
    const startTrialCombat = window.startTrialCombat;
    const applyTrialCurses = window.applyTrialCurses;
    const trialEnemyTurn = window.trialEnemyTurn;

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    resetStateForTest();

    async function setupTrial() {
      state.mode = 'heroSelect';
      chooseHero(0);
      await sleep(100);
      chooseBonus(0);
      await sleep(100);
      Trial.start();
      await sleep(500);
      if (!state.trial.combat) {
        state.trial.currentRoom = { type: 'enemy' };
        startTrialCombat();
        await sleep(300);
      }
      const t = state.trial;
      // 显式设置最大生命和满血，确保药水测试不溢出
      t.player.maxHp = 100;
      t.player.hp = t.player.maxHp;
      t.player.shield = 0;
      t.player.potions = 5;
      t.combat.enemy.attack = 0;
      t.combat.enemy.hp = 100;
      t.combat.enemy.maxHp = 100;
      t.curses = [];
    }

    cLog('开始诅咒测试（真实路径）');

    for (const curse of TRIAL_CURSES) {
      await setupTrial();
      const t = state.trial;
      const player = t.player;
      const enemy = t.combat.enemy;

      t.curses = [{ ...curse }];
      applyTrialCurses();

      switch (curse.name) {
        case '脆弱': {
          player.shield = 10;
          applyTrialCurses();
          const shieldAfter = player.shield;
          assert(shieldAfter === 8, `脆弱：护盾从10减至${shieldAfter}（预期8）`);
          break;
        }
        case '吸血反噬': {
          const hpBefore = player.hp;
          enemy.hp = 999;
          Trial.handleAction('attack');
          await sleep(300);
          const hpAfter = player.hp;
          assert(hpAfter === hpBefore - 1, `吸血反噬：HP从${hpBefore}变为${hpAfter}（预期${hpBefore-1}）`);
          break;
        }
        case '荆棘诅咒': {
          player.shield = 0;
          enemy.attack = 5;
          const hpBefore = player.hp;
          trialEnemyTurn();
          await sleep(300);
          const hpAfter = player.hp;
          assert(hpAfter === hpBefore - 6, `荆棘诅咒：HP从${hpBefore}变为${hpAfter}（预期${hpBefore-6}）`);
          enemy.attack = 0;
          break;
        }
        case '药水衰减': {
          player.hp = 50;
          const potionsBefore = player.potions;
          const hpBefore = player.hp;
          Trial.handleAction('potion');
          await sleep(300);
          const hpAfter = player.hp;
          const potionsAfter = player.potions;
          assert(hpAfter - hpBefore === 4 && potionsAfter === potionsBefore - 1,
            `药水衰减：治疗量${hpAfter-hpBefore}，药水${potionsBefore}->${potionsAfter}（预期治疗4，药水-1）`);
          break;
        }
        case '护甲腐蚀': {
          player.shield = 10;
          trialEnemyTurn();
          await sleep(300);
          const shieldAfter = player.shield;
          assert(shieldAfter === 9, `护甲腐蚀：护盾从10减至${shieldAfter}（预期9）`);
          break;
        }
        case '虚弱': {
          const attackBefore = player.attack;
          applyTrialCurses();
          const attackAfter = player.attack;
          assert(attackAfter === Math.max(0, attackBefore - 1),
            `虚弱：攻击从${attackBefore}变为${attackAfter}（预期${Math.max(0, attackBefore-1)}）`);
          break;
        }
        case '迟钝': {
          const dodgeBefore = t.dodgeLevel || 0;
          applyTrialCurses();
          const dodgeAfter = t.dodgeLevel || 0;
          assert(dodgeAfter === Math.max(0, dodgeBefore - 1),
            `迟钝：闪避等级从${dodgeBefore}变为${dodgeAfter}（预期${Math.max(0, dodgeBefore-1)}）`);
          break;
        }
        case '生命流失': {
          const hpBefore = player.hp;
          applyTrialCurses();
          const hpAfter = player.hp;
          assert(hpAfter === Math.max(1, hpBefore - 1),
            `生命流失：HP从${hpBefore}变为${hpAfter}（预期${Math.max(1, hpBefore-1)}）`);
          break;
        }
        case '易伤': {
          enemy.attack = 5;
          player.shield = 0;
          const hpBefore = player.hp;
          trialEnemyTurn();
          await sleep(300);
          const hpAfter = player.hp;
          assert(hpAfter === hpBefore - 7, `易伤：HP从${hpBefore}变为${hpAfter}（预期${hpBefore-7}）`);
          enemy.attack = 0;
          break;
        }
        case '贪婪': {
            t.points = 10;
            t.currentRoom = { type: 'enemy' };   // 改为普通敌人
            enemy.hp = 0;
            Trial.handleAction('attack');
            await sleep(300);
            // 贪婪减半：1点 → 0，点数不变
            assert(t.points === 10, `贪婪：点数应为10（实际${t.points}）`);
            break;
        }
      }
    }

    cLog('所有诅咒测试完成');
  }, { seed: 12345 });

  if (typeof window.__testCallback === 'function') {
    window.__testCallback(result);
  } else if (window.opener) {
    window.opener.postMessage({ type: 'TEST_RESULT', testId: 'curse', result }, '*');
  }
})();