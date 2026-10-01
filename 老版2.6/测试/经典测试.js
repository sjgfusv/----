// ============================================================
// 深渊回廊 - 经典界面全面功能测试（真实路径）
// ============================================================
(async function() {
    const Test = window.__Test;
    if (!Test) throw new Error('测试公共模块未加载');

    const result = await Test.runTest(async function() {
        const { cLog, assert, resetStateForTest } = Test;
        const state = window.state;
        const chooseHero = window.chooseHero;
        const chooseBonus = window.chooseBonus;
        const saveGame = window.saveGame;
        const loadGame = window.loadGame;
        const attackEnemy = window.attackEnemy;
        const defend = window.defend;
        const usePotion = window.usePotion;
        const chooseReward = window.chooseReward;
        const buyFromShop = window.buyFromShop;
        const leaveShop = window.leaveShop;
        const chooseEvent = window.chooseEvent;
        const resolveEvent = window.resolveEvent;
        const chooseEnding = window.chooseEnding;
        const handleAction = window.handleAction;
        const advanceRoom = window.advanceRoom;
        const enterCurrentRoom = window.enterCurrentRoom;

        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

        // 辅助：构造假按钮事件走真实 handleAction 分发链
        function dispatchAction(action) {
            const fakeBtn = document.createElement('button');
            fakeBtn.dataset.action = action;
            fakeBtn.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1, height: 1 });
            handleAction({ target: fakeBtn, clientX: 0, clientY: 0 });
        }

        resetStateForTest();

        // ===== 1. 选择英雄和增益 =====
        state.mode = 'heroSelect';
        chooseHero(0);
        await sleep(100);
        chooseBonus(0);
        await sleep(100);
        cLog('英雄和增益已选择');

        // ===== 2. 固定房间路线 =====
        state.rooms = [
            { type: 'enemy' }, { type: 'shop' }, { type: 'rest' },
            { type: 'event' }, { type: 'elite' }, { type: 'boss' }
        ];
        state.roomIndex = 0;
        state.floor = 3;

        // ===== 3. 战斗：攻击/防御/药水 =====
        enterCurrentRoom();
        await sleep(200);
        assert(state.mode === 'combat', '进入战斗');
        assert(state.combat && state.combat.enemy, '敌人存在');

        // 清零概率属性，保证伤害可预测
        state.luckyLevel = 0;
        state.comboLevel = 0;
        state.dodgeLevel = 0;
        state.executeLevel = 0;
        state.combat.enemy.dodge = 0;
        state.combat.enemy.thorn = 0;
        state.combat.enemy.combo = 0;
        state.combat.enemy.crit = 0;

        const enemyHpBefore = state.combat.enemy.hp;
        attackEnemy();
        await sleep(300);
        const enemyHpAfter = state.combat.enemy.hp;
        assert(enemyHpAfter < enemyHpBefore, `攻击造成伤害（${enemyHpBefore}->${enemyHpAfter}）`);

        const shieldBefore = state.player.shield;
        defend();
        await sleep(300);
        assert(state.player.shield > shieldBefore || state.player.shield >= 3,
            `防御增加护盾（${shieldBefore}->${state.player.shield}）`);

        state.player.hp = Math.min(state.player.hp, state.player.maxHp - 10);
        const potionsBefore = state.player.potions;
        const hpBeforePotion = state.player.hp;
        usePotion();
        await sleep(300);
        assert(state.player.hp > hpBeforePotion && state.player.potions === potionsBefore - 1,
            `药水使用正确（HP ${hpBeforePotion}->${state.player.hp}）`);

        // ===== 4. 击败敌人 → 奖励 =====
        state.combat.enemy.hp = 0;
        attackEnemy();
        await sleep(300);
        assert(state.mode === 'reward', '击败敌人后进入奖励');
        chooseReward(0);
        await sleep(200);
        assert(state.mode !== 'reward', '奖励选择后退出');

        // ===== 5. 商店 =====
        state.roomIndex = 1;
        enterCurrentRoom();
        resolveEvent();
        await sleep(200);
        assert(state.mode === 'shop', '进入商店');

        const shopOptions = state.shopOptions;
        assert(shopOptions.length > 0, '商店有商品');

        state.player.gold = 999;
        const item = shopOptions[0];
        const countBefore = state.shopPurchaseCount[item.label] || 0;
        buyFromShop(0);
        await sleep(200);
        const countAfter = state.shopPurchaseCount[item.label] || 0;
        assert(countAfter === countBefore + 1, `购买成功（${item.label}，次数${countAfter}）`);

        leaveShop();
        await sleep(100);
        assert(state.mode !== 'shop', '离开商店');

        // ===== 6. 休整点（真实 handleAction 分发）=====
        state.roomIndex = 2;
        enterCurrentRoom();
        resolveEvent();
        await sleep(200);
        assert(state.mode === 'rest', '进入休整点');

        const hpBeforeRest = Math.max(1, state.player.hp - 5); // 确保未满血
        state.player.hp = hpBeforeRest;
        dispatchAction('rest-continue'); // 走真实事件分发链
        await sleep(200);
        assert(state.player.hp > hpBeforeRest,
            `休整恢复生命（${hpBeforeRest}->${state.player.hp}）`);
        assert(state.mode !== 'rest', '休整后离开');

        // ===== 7. 事件 =====
        state.roomIndex = 3;
        enterCurrentRoom();
        resolveEvent();
        await sleep(200);
        assert(state.mode === 'eventChoice', '进入事件');
        const eventLabel = state.eventOptions[0].label;
        chooseEvent(0);
        await sleep(200);
        assert(state.mode !== 'eventChoice', `事件选择后退出（${eventLabel}）`);

        // ===== 8. 精英战 =====
        state.roomIndex = 4;
        enterCurrentRoom();
        resolveEvent();
        await sleep(200);
        assert(state.mode === 'combat', '进入精英战');
        assert(state.combat.enemy.name === '精英守卫', '精英敌人名称正确');
        state.combat.enemy.hp = 0;
        attackEnemy();
        await sleep(300);
        assert(state.mode === 'reward', '击败精英后进入奖励');
        chooseReward(0);
        await sleep(200);

        // ===== 9. Boss战 → 结局 =====
        state.roomIndex = 5;
        enterCurrentRoom();
        state.mode = 'bossPrep';
        state.player.strengthPotions = 1;
        window.prepareStrengthPotion();
        await sleep(100);
        window.startCombat(false);
        await sleep(200);
        assert(state.mode === 'combat', '进入Boss战');
        state.combat.enemy.hp = 0;
        attackEnemy();
        await sleep(300);
        assert(state.mode === 'bossVictory', '击败Boss后进入奖励+结局');
        chooseReward(0);
        await sleep(200);

        assert(state.endOptions.length > 0, '有结局可选');
        chooseEnding(0);
        await sleep(200);
        assert(state.mode === 'finished', '进入结局完成');

        const records = state.records.normal;
        assert(records.clears >= 1, '通关次数增加');

        cLog('经典测试全部通过');
    }, { seed: 42 });

    if (typeof window.__testCallback === 'function') {
        window.__testCallback(result);
    } else if (window.opener) {
        window.opener.postMessage({ type: 'TEST_RESULT', testId: 'classic', result }, '*');
    }
})();
