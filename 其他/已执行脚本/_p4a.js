/* P4-1a：作弊面板需要的能力层
 *   引擎：godMode（无敌）+ gotoRoomByIndex（跳房）
 *   宿主：经典2D.cheat —— 生命/护盾/攻击/遗物/诅咒/跳层/跳房/无敌
 * 用法：node 其他/_p4a.js
 */
const fs = require('fs');
const path = require('path');
const CRLF = '\r\n';
let fails = 0;
function patch(file, rules, crlf) {
  const F = path.join(__dirname, '..', file);
  let s = fs.readFileSync(F, 'utf8');
  console.log('=== ' + file + ' ===');
  for (const [label, from, to] of rules) {
    const f = crlf ? from.split('\n').join(CRLF) : from;
    const t = crlf ? to.split('\n').join(CRLF) : to;
    const n = s.split(f).length - 1;
    if (n !== 1) { console.log('!! ' + label + ' 命中 ' + n); fails++; continue; }
    s = s.split(f).join(t);
    console.log('ok ' + label);
  }
  fs.writeFileSync(F, s);
}

/* ================= 引擎 ================= */
patch('战斗2D.js', [
  ['HOST.godMode',
`    enemyScaler: null  // setEnemyScaler：null = 用引擎内置曲线；宿主接了就用宿主的（数值统一）
  };`,
`    enemyScaler: null, // setEnemyScaler：null = 用引擎内置曲线；宿主接了就用宿主的（数值统一）
    godMode: false     // setGodMode：作弊面板 / 开发者命令的「无敌」
  };`],

  ['API.setGodMode 与 gotoRoom',
`    /** 中途存档快照（宿主也可在任意时刻主动取；引擎自身不落盘） */`,
`    /** 无敌（作弊面板 / 开发者命令）。开着时 damageHero 直接免疫，不改任何数值 */
    setGodMode: function (on) {
      HOST.godMode = !!on;
      var s = state.scene;
      if (s && s.ready) s.showCenter(HOST.godMode ? '无敌已开启' : '无敌已关闭', HOST.godMode ? '#ffd76a' : UI.muted);
      return HOST.godMode;
    },
    isGodMode: function () { return !!HOST.godMode; },

    /** 直接跳到本层第 index 个房间（作弊面板 / 开发者命令的「跳房」） */
    gotoRoom: function (index) {
      var s = state.scene;
      if (!s || !s.ready) return false;
      return s.gotoRoomByIndex(index);
    },

    /** 中途存档快照（宿主也可在任意时刻主动取；引擎自身不落盘） */`],

  ['damageHero 免疫',
`    damageHero(dmg, source, ignoreInvuln, fromX) {
      if (this.heroDead || !this.running) return false;
      var now = this.time.now;`,
`    damageHero(dmg, source, ignoreInvuln, fromX) {
      if (this.heroDead || !this.running) return false;
      if (HOST.godMode) return 'immune';   // 作弊面板 / 开发者命令的「无敌」
      var now = this.time.now;`],

  ['Scene.gotoRoomByIndex',
`    /**
     * 敌人属性：优先问宿主（经典公式），宿主没接就退回引擎内置曲线`,
`    /**
     * 直接跳到本层第 index 个房间（不走地图连线，作弊 / 调试用）
     * 与 enterRoom 的区别：不做「只能走相邻房间」的校验 ——
     * 但后面的收尾（buildLevel / 环境重掷 / 事件）与正常进房完全一致。
     */
    gotoRoomByIndex(index) {
      if (!this.running || !this.floorMap || !this.floorMap.nodes) return false;
      var n = this.floorMap.nodes[index];
      if (!n) return false;
      if (this.mapOpen) this.closeMap();
      this.floorMap.current = n;
      n.visited = true;
      this.cameras.main.flash(300, 6, 6, 18);
      this.buildLevel(n);
      var def = ROOM_TYPES[n.type] || ROOM_TYPES.enemy;
      this.showCenter('第 ' + this.floor + ' 层 · ' + def.name, def.center || '#ffd76a');
      this.rollRoomEnv(n.type);
      sfx('door');
      setBgmScene(bgmForRoom(n.type));
      return true;
    }

    /**
     * 敌人属性：优先问宿主（经典公式），宿主没接就退回引擎内置曲线`]
], true);

/* ================= 宿主 ================= */
patch('经典2D.js', [
  ['宿主 cheat 接口',
`    syncPoints: syncPoints,
    /**`,
`    syncPoints: syncPoints,

    /* ============================================================
       作弊面板 / 开发者命令用的实时战斗接口（P4）
       ------------------------------------------------------------
       写内核 state 之后统一 pushStats() / pushRelics() / pushCursesEnv()，
       保证画布上的数值立刻跟着变 —— 作弊面板最怕的就是"改了但看不出来"。
       ============================================================ */
    cheat: {
      snapshot: function () {
        var s = S(), d = null;
        try { d = engine() ? engine().debug() : null; } catch (e) { d = null; }
        return {
          hp: s && s.player ? Math.round(s.player.hp) : null,
          maxHp: s && s.player ? s.player.maxHp : null,
          shield: (d && d.hero) ? d.hero.shield : null,
          attack: s && s.player ? s.player.attack : null,
          floor: s ? s.floor : null,
          roomIndex: s ? s.roomIndex : null,
          roomCount: (s && s.rooms) ? s.rooms.length : null,
          relics: ((s && s.relics) || []).map(function (r) { return r && r.label; }),
          curses: s ? rtCurses(s) : [],
          god: (typeof engine().isGodMode === 'function') ? engine().isGodMode() : false
        };
      },
      setHp: function (v) {
        var s = S();
        if (!s || !s.player) return false;
        s.player.hp = Math.max(0, Math.min(s.player.maxHp || 999, Math.round(v)));
        pushStats();
        return s.player.hp;
      },
      setMaxHp: function (v) {
        var s = S();
        if (!s || !s.player) return false;
        var n = Math.max(1, Math.round(v));
        var diff = n - s.player.maxHp;
        s.player.maxHp = n;
        s.player.hp = Math.min(n, s.player.hp + Math.max(0, diff));
        pushStats();
        return n;
      },
      setShield: function (v) {
        var s = S();
        if (!s || !s.player) return false;
        s.player.shield = Math.max(0, Math.round(v));
        pushStats();
        return s.player.shield;
      },
      setAttack: function (v) {
        var s = S();
        if (!s || !s.player) return false;
        s.player.attack = Math.max(1, Math.round(v));
        pushStats();
        return s.player.attack;
      },
      /** 加遗物：接受英文 id 或中文名（面板上玩家更可能写中文） */
      addRelic: function (key) {
        if (!key) return false;
        var k = String(key).trim();
        var def = RELIC_BY_ID[k];
        if (!def) {
          for (var i = 0; i < RELIC_POOL.length; i++) {
            if (RELIC_POOL[i].label === k) { def = RELIC_POOL[i]; break; }
          }
        }
        if (!def) return false;
        return addRelic(def);
      },
      addCurse: function (name) {
        var s = S();
        var n = String(name || '').trim();
        if (!s || !n) return false;
        if (CURSE_ALL.indexOf(n) < 0) return false;   // 表外名字引擎会静默丢弃，这里先挡掉
        if (!s._rtCurses) s._rtCurses = [];
        if (s._rtCurses.indexOf(n) < 0) s._rtCurses.push(n);
        pushCursesEnv();
        return true;
      },
      clearCurses: function () {
        var s = S();
        if (!s) return false;
        s._rtCurses = [];
        pushCursesEnv();
        return true;
      },
      /** 跳层：副作用与 onFloor 完全一致（重生成房间 / 重掷环境 / 下发规划 / 重建地图） */
      gotoFloor: function (n) {
        var s = S(), k = kernel();
        if (!s || !k) return false;
        var floor = Math.max(1, Math.round(n));
        s.floor = floor;
        s.roomIndex = 0;
        s.rooms = k.generateFloorRooms(floor);
        s.environment = k.generateEnvironmentEffect(floor, s.difficulty);
        s.heroSkillUsed = false;
        s._riftDoneThisFloor = false;
        pushFloorPlan();
        rebuildEngineMap();
        pushPulseProfile();
        pushCursesEnv();
        k.addLog('（作弊）跳到第 ' + floor + ' 层。');
        return true;
      },
      /** 跳房：本层第 index 间 */
      gotoRoom: function (index) {
        var e = engine();
        if (!e || typeof e.gotoRoom !== 'function') return false;
        return e.gotoRoom(Math.max(0, Math.round(index)));
      },
      god: function (on) {
        var e = engine();
        if (!e || typeof e.setGodMode !== 'function') return false;
        return e.setGodMode(!!on);
      }
    },

    /**`]
], false);

console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
