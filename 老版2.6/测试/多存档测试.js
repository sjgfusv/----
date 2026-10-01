// ============================================================
// 深渊回廊 - 多存档系统测试
// 修复：迁移测试前先清空元数据，避免 hasAnySlot 短路
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
        const deleteSlot = window.deleteSlot;
        const renameSlot = window.renameSlot;
        const getActiveSlot = window.getActiveSlot;
        const setActiveSlot = window.setActiveSlot;
        const getSlotData = window.getSlotData;
        const getMeta = window.getMeta;
        const migrateOldSave = window.migrateOldSave;

        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

        // 辅助：彻底清空多存档系统键（runTest 已清 abyss_*，这里二次确认）
        function clearSaveSystem() {
            for (let i = 0; i < 5; i++) {
                localStorage.removeItem('abyss_save_slot_slot_' + (i + 1));
            }
            localStorage.removeItem('abyss_save_meta');
            localStorage.removeItem('abyss_save_active');
            localStorage.removeItem('abyss_autosave');
        }

        clearSaveSystem();

        // ===== 1. 创建初始存档 =====
        resetStateForTest();
        state.mode = 'heroSelect';
        chooseHero(0);
        await sleep(50);
        chooseBonus(0);
        await sleep(50);
        state.player.name = '测试角色';
        saveGame();

        const active = getActiveSlot();
        assert(active === 'slot_1', `活跃槽位为slot_1（实际${active}）`);

        // ===== 2. 重命名 =====
        renameSlot('slot_1', '我的存档');
        const meta = getMeta();
        assert(meta.slot_1 && meta.slot_1.name === '我的存档', '重命名成功');

        // ===== 3. 新建第二个槽位 =====
        setActiveSlot('slot_2');
        saveGame();
        assert(getActiveSlot() === 'slot_2', '切换到slot_2');
        assert(!!getSlotData('slot_2'), 'slot_2数据存在');

        // ===== 4. 切换回 slot_1 并加载 =====
        setActiveSlot('slot_1');
        const loaded = loadGame();
        assert(loaded, '加载slot_1成功');
        await sleep(200); // loadGame 内部有异步 rebind
        assert(state.player.name === '测试角色', `角色名正确（${state.player.name}）`);

        // ===== 5. 删除 slot_2 =====
        deleteSlot('slot_2');
        assert(!getSlotData('slot_2'), 'slot_2已被删除');

        // ===== 6. 旧存档迁移 =====
        // 关键：先彻底清空多存档系统，模拟"首次打开"环境
        // 否则 migrateOldSave 检测到已有槽位会直接返回 false
        clearSaveSystem();
        localStorage.setItem('abyss_autosave', JSON.stringify({
            player: { name: '旧存档' }
        }));

        const migrated = migrateOldSave();
        assert(migrated, '旧存档迁移成功');
        const metaAfter = getMeta();
        assert(!!metaAfter.slot_1, 'slot_1存在');
        const dataMigrated = getSlotData('slot_1');
        assert(dataMigrated && dataMigrated.player.name === '旧存档',
            `迁移数据正确（${dataMigrated ? dataMigrated.player.name : '无数据'}）`);
        
        // ===== 7. bonusSelect 界面存档往返 =====
        resetStateForTest();
        state.mode = 'heroSelect';
        chooseHero(4); // 游侠
        await sleep(50);
        // 此时 availableBonuses 已是真实增益对象，直接存档
        saveGame();
        resetStateForTest();
        const loadedBonus = loadGame();
        await sleep(200);
        assert(loadedBonus && state.availableBonuses.length > 0 &&
            state.availableBonuses.every(b => typeof b.apply === 'function'),
            'bonusSelect存档读档：增益apply函数已恢复');
        chooseBonus(0);  // 不应抛异常
        assert(state.mode !== 'bonusSelect', '读档后选择增益正常');

        cLog('多存档测试通过');
    }, { seed: 222324 });

    if (typeof window.__testCallback === 'function') {
        window.__testCallback(result);
    } else if (window.opener) {
        window.opener.postMessage({ type: 'TEST_RESULT', testId: 'saveManager', result }, '*');
    }
})();
