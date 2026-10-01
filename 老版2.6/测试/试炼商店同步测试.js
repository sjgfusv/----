// ============================================================
// 深渊回廊 - 试炼商店同步测试（购买后进入试炼验证）
// 修复：精确断言替代宽松断言；同时覆盖永久属性加成链路
// ============================================================
(async function() {
    const Test = window.__Test;
    if (!Test) throw new Error('测试公共模块未加载');

    const result = await Test.runTest(async function() {
        const { cLog, assert, resetStateForTest } = Test;
        const state = window.state;
        const chooseHero = window.chooseHero;
        const chooseBonus = window.chooseBonus;
        const Trial = window.Trial;
        const loadTrialUnlocks = window.loadTrialUnlocks;
        const saveTrialUnlocks = window.saveTrialUnlocks;

        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

        // ===== 1. 试炼之刃：解锁后注入应攻击+2 =====
        resetStateForTest();
        state.mode = 'heroSelect';
        chooseHero(0); // 战士基础攻击4
        await sleep(50);
        // 注入中性增益
        state.availableBonuses = [{
            id: 'none',
            title: '测试用',
            description: '',
            apply: () => {}
        }];
        chooseBonus(0);
        await sleep(50);

        {
            const unlocks = loadTrialUnlocks();
            unlocks.unlockedRelics = ['trial_blade']; // 只解锁试炼之刃
            unlocks.attackBonus = 0;                  // 排除永久属性干扰
            saveTrialUnlocks(unlocks);
        }

        Trial.start();
        await sleep(500);

        if (state.trial.active) {
            const t = state.trial;
            const hasBlade = t.relics.some(r => r.label === '试炼之刃');
            assert(hasBlade, '试炼之刃：已注入遗物列表');

            // 精确断言：战士基础4 + 试炼之刃2 = 6
            const atk = t.player.attack;
            assert(atk === 4 + 2, `试炼之刃：攻击应为6（实际${atk}）`);

            Trial.exit();
            await sleep(200);
        } else {
            cLog('试炼之刃测试：试炼未启动', false);
        }

        // ===== 2. 永久攻击加成：下次进试炼应生效 =====
        // BUG-06 已修：applyTrialUnlocks() 现在落在试炼副本上（原来是改 _state.player，
        // 而那份会被 _backup 覆盖回来，所以看起来"没被调用"）。
        // 顺带一提，原实现还会把 thornLevel / vampireLevel / critDamage 永久累加到经典模式
        // 且永不回滚（这两个字段不在 _backup 里）—— 现在也一并收口到副本了。
        resetStateForTest();
        state.mode = 'heroSelect';
        chooseHero(0);
        await sleep(50);
        // 注入中性增益
        state.availableBonuses = [{
            id: 'none',
            title: '测试用',
            description: '',
            apply: () => {}
        }];
        chooseBonus(0);
        await sleep(50);

        {
            const unlocks = loadTrialUnlocks();
            unlocks.attackBonus = 3;
            unlocks.unlockedRelics = [];
            saveTrialUnlocks(unlocks);
        }

        Trial.start();
        await sleep(500);

        if (state.trial.active) {
            const atk = state.trial.player.attack;
            // 战士基础4 + 永久加成3 = 7
            assert(atk === 4 + 3, `永久攻击加成：试炼攻击应为7（实际${atk}）`);
            Trial.exit();
            await sleep(200);
        } else {
            cLog('永久加成测试：试炼未启动', false);
        }

        cLog('试炼商店同步测试完成');
    }, { seed: 192021 });

    if (typeof window.__testCallback === 'function') {
        window.__testCallback(result);
    } else if (window.opener) {
        window.opener.postMessage({ type: 'TEST_RESULT', testId: 'trialShopSync', result }, '*');
    }
})();
