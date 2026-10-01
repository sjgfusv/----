// ============================================================
// 深渊回廊 - 遗物系统测试 v2（走 __Test 沙箱 + 真实路径）
// ============================================================
(async function() {
    const Test = window.__Test;
    if (!Test) throw new Error('测试公共模块未加载');

    const result = await Test.runTest(async function() {
        const { cLog, assert, resetStateForTest } = Test;
        const state = window.state;
        const chooseHero = window.chooseHero;
        const chooseBonus = window.chooseBonus;
        const chooseRelic = window.chooseRelic;
        const getRelicOptions = window.getRelicOptions;
        const countRelic = window.countRelic;
        const saveGame = window.saveGame;
        const loadGame = window.loadGame;
        const attackEnemy = window.attackEnemy;
        const enemyTurn = window.enemyTurn;
        const startCombat = window.startCombat;
        const loadTrialUnlocks = window.loadTrialUnlocks;
        const saveTrialUnlocks = window.saveTrialUnlocks;
        const Trial = window.Trial;

        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

        function findRelicIndex(label) {
            return getRelicOptions().findIndex(r => r.label === label);
        }

        // 快速开局：战士（攻击4/血28），不选增益避免随机干扰
        function quickStart() {
            resetStateForTest();
            state.mode = 'heroSelect';
            chooseHero(0);
            // 手动跳过增益选择（不应用任何增益）
            state.availableBonuses = [];
            state.mode = 'event';
        }

        cLog('========== 第一部分：经典模式遗物（真实 chooseRelic 路径）==========');

        const relicChecks = {
            '战斗怒火':   () => assert(state.player.attack === 5, `战斗怒火：攻击4→${state.player.attack}`),
            '幸运硬币':   () => assert(state.player.gold >= 10, `幸运硬币：金币+10（当前${state.player.gold}）`),
            '坚固护符':   () => assert(state.player.shield >= 3, `坚固护符：护盾+3（当前${state.player.shield}）`),
            '生命结晶':   () => assert(state.player.maxHp === 28 + 6 && state.player.hp === 28 + 6,
                                    `生命结晶：上限+6且恢复6（${state.player.maxHp}/${state.player.hp}）`),
            '铁卫纹章':   () => assert(state.player.attack === 5, `铁卫纹章：攻击+1（当前${state.player.attack}）`),
            '恢复之心':   () => assert(countRelic('恢复之心') === 1, '恢复之心：计数+1'),
            '商人眼光':   () => assert(countRelic('商人眼光') === 1, '商人眼光：计数+1'),
            '猎人本能':   () => assert(countRelic('猎人本能') === 1, '猎人本能：计数+1'),
            '神圣庇护':   () => assert(countRelic('神圣庇护') === 1, '神圣庇护：计数+1'),
            '回声之环':   () => assert(countRelic('回声之环') === 1, '回声之环：计数+1'),
            '狂战之心':   () => assert(state.comboLevel === 1 && state.comboDamageBonus === 10,
                                    `狂战之心：连击+5%伤害+10%（等级${state.comboLevel}，加成${state.comboDamageBonus}%）`),
            '双刃匕首':   () => assert(state.hasFirstAttackCombo === true, '双刃匕首：首次必连击'),
            '猎杀标记':   () => assert(state.executeThreshold === 0.5, '猎杀标记：斩杀线50%'),
            '不死图腾':   () => assert(state.hasTotem === true, '不死图腾：已装备'),
            '斩杀之镰':   () => assert(state.hasKillScythe === true, '斩杀之镰：已装备'),
            '命运轮盘':   () => assert(state.hasFateWheel === true, '命运轮盘：已装备'),
            '暗影交易':   () => assert(state.hasShadowDeal === true, '暗影交易：已标记'),
        };

        for (const [label, check] of Object.entries(relicChecks)) {
            quickStart();
            const idx = findRelicIndex(label);
            if (idx === -1) {
                cLog(`未找到遗物"${label}"`, false);
                continue;
            }
            chooseRelic(idx, false); // 真实获取路径（含 apply）
            check();
        }

        // 叠加测试：两件恢复之心
        quickStart();
        const heartIdx = findRelicIndex('恢复之心');
        chooseRelic(heartIdx, false);
        chooseRelic(heartIdx, false);
        assert(countRelic('恢复之心') === 2, '恢复之心叠加：计数=2');

        cLog('========== 第二部分：特殊遗物真实战斗触发 ==========');

        // 不死图腾：真实 enemyTurn 路径免死
        quickStart();
        state.hasTotem = true;
        state.currentRoom = { type: 'enemy' };
        state.mode = 'event';
        startCombat(false, 'enemy');
        await sleep(200);
        {
            const e = state.combat.enemy;
            e.attack = 99; e.crit = 0; e.dodge = 0;
            state.player.hp = 5; state.player.shield = 0;
            state.dodgeLevel = 0;
            Test.forceNext(0.99); // 不闪避
            enemyTurn(); // 真实路径
            await sleep(200);
            assert(state.player.hp === 1, `不死图腾：致命伤害后保留1血（当前${state.player.hp}）`);
            assert(state.hasTotem === false, '不死图腾：已消耗');
        }

        // 斩杀之镰：真实攻击触发斩杀后攻击+1
        quickStart();
        state.hasKillScythe = true;
        state.executeLevel = 8;
        state.executeThreshold = 0.3;
        state.currentRoom = { type: 'enemy' };
        state.mode = 'event';
        startCombat(false, 'enemy');
        await sleep(200);
        {
            const e = state.combat.enemy;
            e.hp = 20;               // 改为 20，使 20% < 30%
            e.maxHp = 100;           // 明确最大生命
            e.dodge = 0; e.thorn = 0; e.combo = 0; e.crit = 0;
            state.luckyLevel = 0; state.comboLevel = 0;
            const atkBefore = state.player.attack;
            Test.forceNext(0.5, 0.01);  // 第一次随机=伤害取中，第二次=斩杀触发
            attackEnemy();
            await sleep(200);
            assert(state.executeCount >= 1, `斩杀已触发（次数${state.executeCount}）`);
            assert(state.player.attack === atkBefore + 1,
                `斩杀之镰：攻击+1（${atkBefore}->${state.player.attack}）`);
        }

        cLog('========== 第三部分：试炼遗物解锁注入（已随试炼关停移除，想看请用 老版2.6/测试/）==========');

        cLog('========== 第四部分：遗物存档往返 ==========');

        quickStart();
        const testRelics = ['战斗怒火', '生命结晶', '幸运硬币'];
        for (const label of testRelics) {
            const idx = findRelicIndex(label);
            if (idx !== -1) chooseRelic(idx, false);
        }
        saveGame(); // 沙箱内保存，结束后恢复

        resetStateForTest();
        const loaded = loadGame();
        await sleep(200);
        if (loaded) {
            const loadedRelics = state.relics.map(r => r.label);
            const allFound = testRelics.every(label => loadedRelics.includes(label));
            assert(allFound, `存档读档：遗物保留（${loadedRelics.join(', ')}）`);
        } else {
            cLog('存档读档：加载失败', false);
        }

        cLog('遗物测试完成');
    }, { seed: 9527 });

    if (typeof window.__testCallback === 'function') {
        window.__testCallback(result);
    } else if (window.opener) {
        window.opener.postMessage({ type: 'TEST_RESULT', testId: 'relic', result }, '*');
    }
})();
