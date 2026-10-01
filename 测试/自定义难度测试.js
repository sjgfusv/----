// ============================================================
// 深渊回廊 - 自定义难度测试 v2
// 覆盖：老参数免开关 / 新参数需开关 / 全部新规则接线验证
// ============================================================
(async function() {
    const Test = window.__Test;
    if (!Test) throw new Error('测试公共模块未加载');
    const result = await Test.runTest(async function() {
        const { cLog, assert, resetStateForTest } = Test;
        const state = window.state;
        const chooseHero = window.chooseHero;
        const chooseBonus = window.chooseBonus;
        const enterCurrentRoom = window.enterCurrentRoom;
        const attackEnemy = window.attackEnemy;
        const chooseReward = window.chooseReward;
        const advanceRoom = window.advanceRoom;
        const buildRewardOptions = window.buildRewardOptions;
        const generateFloorRooms = window.generateFloorRooms;
        const generateEnvironmentEffect = window.generateEnvironmentEffect;
        const getRelicOptions = window.getRelicOptions;
        const getRandomRelicByRarity = window.getRandomRelicByRarity;
        const getCustomDifficultyRuleEffects = window.getCustomDifficultyRuleEffects;
        const getCustomEnemyInjection = window.getCustomEnemyInjection;
        const getCustomEnemyGrowthFactor = window.getCustomEnemyGrowthFactor;
        const isCustomDifficultyEnabled = window.isCustomDifficultyEnabled;
        const normalizeCustomDifficulty = window.normalizeCustomDifficulty;

        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

        async function quickStart() {
            resetStateForTest();
            state.mode = 'heroSelect';
            chooseHero(0);
            await sleep(50);
            chooseBonus(0);
            await sleep(50);
            state.difficulty = 'custom';
        }

        async function enterEnemyRoom() {
          // 同时写入房间列表，防止 enterCurrentRoom 用 state.rooms[state.roomIndex] 覆盖掉
          state.rooms[state.roomIndex] = { type: 'enemy' };
          state.currentRoom = state.rooms[state.roomIndex];
          state._pendingGugugaga = false;   // 避免上一场咕咕嘎嘎标记污染本房间
          state.mode = 'event';
          enterCurrentRoom();
          await sleep(200);
        }

        // ========== 第一部分：开关关闭（老参数生效 / 新参数失效）==========
        cLog('========== 第一部分：开关关闭时的门控 ==========');
        await quickStart();
        state.customDifficulty = normalizeCustomDifficulty({
            enabled: false,
            enemyHp: 2.0, enemyAtk: 1.5, goldReward: 0.5, shopCost: 5, restBonus: -2,
            enemyExtra: 1.2, rewardCount: 2,
            roomCount: 3, floorCap: 3,
            glassCannon: true, oneHitKill: true, escalatingPressure: true, curseLevel: 5,
            gugugagaChance: 100, eliteChance: 100, deadBodyChance: 100,
            enemyThornInject: 3, enemyDodgeInject: 3, enemyVampireInject: 2, enemyComboInject: 3, enemyCritInject: 3,
            enemyGrowthCurve: 2.0,
            fixedEnvironment: 'disabled'
        });
        assert(isCustomDifficultyEnabled() === false, '总开关处于关闭状态');

        const fxOff = getCustomDifficultyRuleEffects();
        assert(fxOff.glassCannon !== true, '关闭：玻璃大炮不生效');
        assert(fxOff.oneHitKill !== true, '关闭：一击必杀不生效');
        assert(fxOff.escalatingPressure !== true, '关闭：递增压力不生效');
        assert((fxOff.enemyHpMultiplier || 1) === 1, '关闭：诅咒等级不影响敌人生命乘率');

        const injOff = getCustomEnemyInjection();
        assert(!injOff.thorn && !injOff.dodge && !injOff.vampire && !injOff.combo && !injOff.crit, '关闭：敌人注入属性全部回落为0');

        const maxHpOff = state.player.maxHp;
        await enterEnemyRoom();
        assert(state.mode === 'combat' && state.combat, '进入战斗');
        const e1 = state.combat.enemy;
        assert(e1.hp > 10, `老参数：敌人HP倍率生效（${e1.hp}）`);
        assert(e1.attack >= 4, `老参数：敌人攻击倍率生效（${e1.attack}）`);
        assert(state.player.maxHp === maxHpOff, '关闭：玻璃大炮不削减生命上限');
        assert(e1.name !== '咕咕嘎嘎', '关闭：咕咕嘎嘎概率100%也不触发');
        assert(buildRewardOptions().length === 2, '老参数：奖励数量2在关闭开关时仍生效');

        // ========== 第二部分：开关打开（规则变体识别）==========
        cLog('========== 第二部分：开关打开后的规则识别 ==========');
        state.customDifficulty = normalizeCustomDifficulty(Object.assign({}, state.customDifficulty, { enabled: true }));
        assert(isCustomDifficultyEnabled() === true, '总开关处于打开状态');
        const fxOn = getCustomDifficultyRuleEffects();
        assert(fxOn.glassCannon === true, '打开：玻璃大炮识别');
        assert(fxOn.oneHitKill === true, '打开：一击必杀识别');
        assert(fxOn.escalatingPressure === true, '打开：递增压力识别');
        assert(Math.abs((fxOn.enemyHpMultiplier || 1) - 0.84) < 0.001, `打开：玻璃大炮(×0.7)×诅咒5级(×1.2)=0.84（实际${fxOn.enemyHpMultiplier}）`);

        // ========== 第三部分：咕咕嘎嘎概率 ==========
        cLog('========== 第三部分：咕咕嘎嘎概率 ==========');
        await quickStart();
        state.customDifficulty = normalizeCustomDifficulty({ enabled: true, gugugagaChance: 100 });
        await enterEnemyRoom();
        assert(state.combat && state.combat.enemy.name === '咕咕嘎嘎', '概率100%：进入战斗即咕咕嘎嘎');
        const g = state.combat.enemy;
        assert(g.hp === 40 && g.attack === 3, `咕咕嘎嘎基础属性（HP${g.hp}/ATK${g.attack}，预期40/3）`);
        attackEnemy(); await sleep(300);
        attackEnemy(); await sleep(300);
        assert(state._pendingGugugaga === true, '两次攻击后触发下一间咕咕嘎嘎标记');
        state._pendingGugugaga = false;

        // ========== 第四部分：玻璃大炮快照 ==========
        cLog('========== 第四部分：玻璃大炮 ==========');
        await quickStart();
        state.customDifficulty = normalizeCustomDifficulty({ enabled: true, glassCannon: true });
        const maxHpBefore = state.player.maxHp;
        await enterEnemyRoom();
        assert(state.combat, '玻璃大炮：进入战斗');
        state.combat.enemy.dodge = 0;
        state.combat.enemy.combo = 0;
        assert(state.combat.glassCannonHpSnapshot === maxHpBefore, '玻璃大炮：生命快照已记录');
        assert(state.player.maxHp === Math.max(1, Math.round(maxHpBefore * 0.7)), `玻璃大炮：战斗中上限降至70%（${maxHpBefore}->${state.player.maxHp}）`);
        state.combat.enemy.hp = 0;
        attackEnemy(); await sleep(300);
        assert(state.player.maxHp === maxHpBefore, `玻璃大炮：战斗结束上限恢复（${state.player.maxHp}）`);
        if (state.mode === 'reward') { chooseReward(0); await sleep(200); }

        // ========== 第五部分：一击必杀 ==========
        cLog('========== 第五部分：一击必杀 ==========');
        await quickStart();
        state.customDifficulty = normalizeCustomDifficulty({ enabled: true, oneHitKill: true });
        await enterEnemyRoom();
        assert(state.combat, '一击必杀：进入战斗');
        state.combat.enemy.dodge = 0;
        state.combat.enemy.combo = 0;
        attackEnemy(); await sleep(300);
        assert(state.mode === 'reward' || (state.combat && state.combat.enemy.hp <= 0), '一击必杀：一刀击杀敌人');
        if (state.mode === 'reward') { chooseReward(0); await sleep(200); }

        // ========== 第六部分：递增压力 ==========
        cLog('========== 第六部分：递增压力 ==========');
        state.customDifficulty = normalizeCustomDifficulty({ enabled: true, escalatingPressure: true });
        state.floor = 1;
        const fxT1 = getCustomDifficultyRuleEffects();
        state.floor = 11;
        const fxT6 = getCustomDifficultyRuleEffects();
        assert((fxT6.enemyAttackMultiplier || 1) > (fxT1.enemyAttackMultiplier || 1), `递增压力：敌人攻击乘率随层数增长（${fxT1.enemyAttackMultiplier}->${fxT6.enemyAttackMultiplier}）`);
        state.floor = 1;

        // ========== 第七部分：敌人注入属性 ==========
        cLog('========== 第七部分：敌人注入属性 ==========');
        await quickStart();
        state.customDifficulty = normalizeCustomDifficulty({ enabled: true, enemyThornInject: 3, enemyDodgeInject: 3, enemyVampireInject: 2, enemyComboInject: 3, enemyCritInject: 3 });
        await enterEnemyRoom();
        const e7 = state.combat.enemy;
        assert(e7.thorn >= 3, `注入荆棘生效（${e7.thorn}）`);
        assert(e7.dodge >= 3, `注入闪避生效（${e7.dodge}）`);
        assert(e7.vampire >= 2, `注入吸血生效（${e7.vampire}）`);
        assert(e7.combo >= 3, `注入连击生效（${e7.combo}）`);
        assert(e7.crit >= 3, `注入暴击生效（${e7.crit}）`);

        // ========== 第八部分：房间数与楼层上限 ==========
        cLog('========== 第八部分：房间数与楼层上限 ==========');
        await quickStart();
        state.customDifficulty = normalizeCustomDifficulty({ enabled: true, roomCount: 3 });
        assert(generateFloorRooms(2).length === 3, '房间数3生效');
        state.customDifficulty = normalizeCustomDifficulty(Object.assign({}, state.customDifficulty, { enabled: false }));
        const offCounts = [];
        for (let i = 0; i < 10; i++) offCounts.push(generateFloorRooms(2).length);
        assert(offCounts.some(n => n !== 3), `关闭开关：房间数回落为默认随机（${offCounts.join(',')}）`);

        await quickStart();
        state.customDifficulty = normalizeCustomDifficulty({ enabled: true, floorCap: 3 });
        state.floor = 3;
        state.roomIndex = 0;
        state.rooms = [{ type: 'enemy' }];
        state.currentRoom = { type: 'enemy' };
        state.mode = 'event';
        enterCurrentRoom(); await sleep(200);
        if (state.combat) {
            state.combat.enemy.hp = 0;
            attackEnemy(); await sleep(300);
            if (state.mode === 'reward') { chooseReward(0); await sleep(200); }
            try { advanceRoom(); } catch (e) { cLog('advanceRoom调用异常：' + e.message, false); }
            await sleep(200);
            assert(state.floor <= 3, `楼层上限3：不会进入第4层（当前${state.floor}）`);
        } else {
            cLog('楼层上限：未能进入战斗，跳过该断言', false);
        }

        // ========== 第九部分：环境固定与关闭 ==========
        cLog('========== 第九部分：环境固定与关闭 ==========');
        await quickStart();
        state.customDifficulty = normalizeCustomDifficulty({ enabled: true, fixedEnvironment: 'disabled' });
        assert(generateEnvironmentEffect(1, 'custom').name === '静谧空间', '环境关闭：生成静谧空间');
        state.customDifficulty = normalizeCustomDifficulty({ enabled: true, fixedEnvironment: 'fixed', environmentPreset: '厄运' });
        assert(generateEnvironmentEffect(1, 'custom').name === '厄运', '环境固定：固定为厄运');
        state.customDifficulty = normalizeCustomDifficulty(Object.assign({}, state.customDifficulty, { enabled: false }));
        const envOff = generateEnvironmentEffect(1, 'custom');
        assert(envOff.name !== '静谧空间', '关闭开关：环境不再被强制关闭');

        // ========== 第十部分：遗物黑名单与权重 ==========
        cLog('========== 第十部分：遗物黑名单与权重 ==========');
        await quickStart();
        state.customDifficulty = normalizeCustomDifficulty({ enabled: true, relicBlacklist: '战斗怒火,幸运硬币' });
        let labels = getRelicOptions().map(r => r.label);
        assert(!labels.includes('战斗怒火') && !labels.includes('幸运硬币'), '黑名单：两件遗物被过滤');
        state.customDifficulty = normalizeCustomDifficulty(Object.assign({}, state.customDifficulty, { enabled: false }));
        labels = getRelicOptions().map(r => r.label);
        assert(labels.includes('战斗怒火'), '关闭开关：黑名单不再过滤');

        state.customDifficulty = normalizeCustomDifficulty({ enabled: true, commonWeight: 1, rareWeight: 1, legendaryWeight: 30 });
        let gotLegendary = false;
        for (let i = 0; i < 50; i++) {
            if (getRandomRelicByRarity().rarity === 'legendary') { gotLegendary = true; break; }
        }
        assert(gotLegendary, '遗物权重：传说权重30时可抽到传说');

        // ========== 第十一部分：敌人成长曲线 ==========
        cLog('========== 第十一部分：敌人成长曲线 ==========');
        await quickStart();
        try {
            state.floor = 10;
            state.customDifficulty = normalizeCustomDifficulty({ enabled: true, enemyGrowthCurve: 1 });
            const f1 = getCustomEnemyGrowthFactor(10);
            state.customDifficulty = normalizeCustomDifficulty({ enabled: true, enemyGrowthCurve: 2 });
            const f2 = getCustomEnemyGrowthFactor(10);
            assert(f2 > f1, `成长曲线2.0的10层系数大于1.0（${Number(f1).toFixed(3)}->${Number(f2).toFixed(3)}）`);
        } catch (e) {
            assert(false, '成长曲线测试异常：' + e.message);
        }

        cLog('自定义难度测试v2完成');
    }, { seed: 161718 });
    if (typeof window.__testCallback === 'function') {
        window.__testCallback(result);
    } else if (window.opener) {
        window.opener.postMessage({ type: 'TEST_RESULT', testId: 'customDifficulty', result }, '*');
    }
})();