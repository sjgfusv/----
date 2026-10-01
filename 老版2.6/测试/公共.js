// ============================================================
// 深渊回廊 - 测试公共工具模块 v2
// 修复：种子RNG双层闭包Bug / 断言失败计入结果 / 沙箱清空游戏键 / forceNext
// ============================================================
(function() {

    // ----- 沙箱化 localStorage -----
    function backupLocalStorage() {
        const backup = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            backup[key] = localStorage.getItem(key);
        }
        return backup;
    }

    function restoreLocalStorage(backup) {
        localStorage.clear();
        for (const [key, value] of Object.entries(backup)) {
            localStorage.setItem(key, value);
        }
    }

    // ----- 种子随机数生成器（mulberry32，已修复双层闭包Bug）-----
    function seededRandom(seed) {
        let s = seed >>> 0;
        return function() {
            s |= 0;
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ----- 强制随机值队列（forceNext）-----
    // 用法：__Test.forceNext(0.3, 0.9);
    // 接下来两次 Math.random() 依次返回 0.3 和 0.9，之后回落到种子随机
    const _forcedQueue = [];

    // ----- 统一状态重置（仅一份模板，字段与主程序 state 初始定义一致）-----
    function resetStateForTest() {
        const stateRef = (typeof state !== 'undefined' && state !== null) ? state : window.state;
        if (!stateRef) throw new Error('state 未定义');

        stateRef.player = {
            name: '冒险者', hp: 24, maxHp: 24, attack: 5, shield: 0,
            gold: 50, level: 1, potions: 1, strengthPotions: 0, xp: 0
        };
        stateRef.pendingAttackBoost = 0;
        stateRef.heroSkillUsed = false;
        stateRef.heroSkillBonus = 0;
        stateRef.heroPendingHeal = 0;
        stateRef.floor = 1;
        stateRef.roomIndex = 0;
        stateRef.rooms = [];
        stateRef.currentRoom = null;
        stateRef.mode = 'heroSelect';
        stateRef.combat = null;
        stateRef.rewardOptions = [];
        stateRef.eventOptions = [];
        stateRef.shopOptions = [];
        stateRef.relics = [];
        stateRef.log = [];
        stateRef.gameOver = false;
        stateRef.difficulty = 'normal';
        stateRef.hero = null;
        stateRef.endOptions = [];
        stateRef.endResult = null;
        stateRef.bonuses = [];
        stateRef.availableBonuses = [];
        stateRef.unlockedBonuses = [];
        stateRef.records = {
            easy:   { bestFloor: 0, clears: 0, deaths: 0 },
            normal: { bestFloor: 0, clears: 0, deaths: 0 },
            hard:   { bestFloor: 0, clears: 0, deaths: 0 },
            hell:   { bestFloor: 0, clears: 0, deaths: 0 }
        };
        stateRef.vampireLevel = 0;
        stateRef.thornLevel = 0;
        stateRef.hasLifeShield = false;
        stateRef.hasDoubleGold = false;
        stateRef.hasExpBoost = false;
        stateRef.luckyLevel = 0;
        stateRef.critDamage = 150;
        stateRef.hasAncientBless = false;
        stateRef.dodgeLevel = 0;
        stateRef.comboLevel = 0;
        stateRef.executeLevel = 0;
        stateRef.comboDamageBonus = 0;
        stateRef.executeThreshold = 0.3;
        stateRef.isFirstAttack = true;
        stateRef.hasTotem = false;
        stateRef.detailMode = false;
        stateRef.hasFirstAttackCombo = false;
        stateRef.encyclopediaState = { currentCategory: null, viewMode: 'categories' };
        stateRef.comboCount = 0;
        stateRef.executeCount = 0;
        stateRef.dodgeCount = 0;
        stateRef.critCount = 0;
        stateRef.enemyThorn = 0;
        stateRef.enemyDodge = 0;
        stateRef.enemyVampire = 0;
        stateRef.enemyCombo = 0;
        stateRef.enemyCrit = 0;
        stateRef.enemyCritDamage = 150;
        stateRef.hasKillScythe = false;
        stateRef.hasFateWheel = false;
        stateRef.hasShadowDeal = false;
        stateRef.shopPurchaseCount = {};
        stateRef.gugugagaAttackCount = 0;
        stateRef._pendingGugugaga = false;
        stateRef.customDifficulty = {
            enabled: false,
            enemyHp: 1, enemyAtk: 1, goldReward: 1, shopCost: 0, restBonus: 0, enemyExtra: 1,
            rewardCount: 3,
            roomCount: 4, floorCap: 50,
            glassCannon: false, oneHitKill: false, escalatingPressure: false, curseLevel: 0,
            gugugagaChance: 0, deadBodyChance: 0, eliteChance: 0,
            enemyThornInject: 0, enemyDodgeInject: 0, enemyVampireInject: 0, enemyComboInject: 0, enemyCritInject: 0,
            enemyGrowthCurve: 1,
            commonWeight: 1, rareWeight: 1, legendaryWeight: 1,
            relicBlacklist: '',
            fixedEnvironment: '', environmentPreset: '',
            dangerWarning: false
        };
        stateRef.trial = {
            active: false, player: null, relics: [], bonuses: [],
            hero: null, floor: 1, roomIndex: 0, rooms: [],
            currentRoom: null, combat: null, mode: 'trial',
            rounds: 0, maxRounds: 30, points: 0, curses: [],
            fury: 0, furyMax: 10, gameOver: false, endReason: '',
            _backup: null
        };
    }

    // ----- 断言收集 -----
    let _logs = [];
    function cLog(msg, pass = true) {
        const status = pass ? '✅' : '❌';
        const full = `${status} ${msg}`;
        _logs.push(full);
        console.log(full);
        try { window.addLog(`[测试] ${msg}`); } catch (_) {}
    }
    function getLogs() { return _logs.slice(); }
    function clearLogs() { _logs = []; }

    function assert(condition, msg) {
        if (!condition) {
            cLog(msg, false);
            return false;
        }
        cLog(msg, true);
        return true;
    }

    // ----- 测试运行包装器 -----
    async function runTest(testFn, options = {}) {
        // 1. 备份玩家数据（沙箱）
        const backup = backupLocalStorage();

        // 2. 清空游戏数据键，确保测试从干净状态开始
        //    （结束后会从 backup 恢复，玩家数据安全）
        Object.keys(localStorage)
            .filter(k => k.startsWith('abyss'))
            .forEach(k => localStorage.removeItem(k));

        // 3. 注入随机源：优先消费 forceNext 队列，之后用种子随机
        const seed = options.seed || 42;
        const rng = seededRandom(seed);
        const origRandom = Math.random;
        Math.random = function() {
            if (_forcedQueue.length > 0) {
                return _forcedQueue.shift();
            }
            return rng();
        };

        clearLogs();
        _forcedQueue.length = 0;

        let passed = false;
        let error = null;
        try {
            await testFn();
            passed = true;
        } catch (e) {
            error = e.message;
            passed = false;
            cLog(`测试抛出异常: ${e.message}`, false);
            console.error(e);
        } finally {
            // 4. 无论成败：恢复随机源、清空强制队列、恢复玩家数据
            Math.random = origRandom;
            _forcedQueue.length = 0;
            restoreLocalStorage(backup);
        }

        const logs = getLogs();
        // ===== 关键修复：失败断言计入结果，有一条 ❌ 就算不通过 =====
        const failedCount = logs.filter(l => l.startsWith('❌')).length;

        return {
            passed: passed && failedCount === 0,
            failedCount,
            passedCount: logs.length - failedCount,
            total: logs.length,
            logs,
            error
        };
    }

    // ----- 暴露全局接口 -----
    window.__Test = {
        backupLocalStorage,
        restoreLocalStorage,
        seededRandom,
        resetStateForTest,
        cLog,
        getLogs,
        clearLogs,
        assert,
        runTest,
        // 强制下一次随机值：forceNext(0.3) 走 "<0.6" 分支；forceNext(0.9) 走 ">=0.6" 分支
        forceNext: function(...vals) { _forcedQueue.push(...vals); }
    };
})();
