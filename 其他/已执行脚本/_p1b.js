/* P1-B：主权移交基础设施（模块级状态 + 辅助函数 + 房间类型 + 地图规划 + 脉冲 + 遗物 + checkpoint）
 * 用法：node 其他/_p1b.js
 * 只做锚点插入/替换，命中数不为 1 就报错并跳过该条；行尾统一 CRLF。
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '战斗2D.js');
const CRLF = '\r\n';
let s = fs.readFileSync(F, 'utf8');
let fails = 0;

function rep(from, to, label, expect) {
  const f = from.split('\n').join(CRLF);
  const t = to.split('\n').join(CRLF);
  const n = s.split(f).length - 1;
  const want = (expect == null) ? 1 : expect;
  if (n !== want) { console.log('!! ' + label + ' 命中 ' + n + ' 次（期望 ' + want + '）'); fails++; return false; }
  s = s.split(f).join(t);
  console.log('ok ' + label + (want !== 1 ? ' ×' + want : ''));
  return true;
}

/* ---------- R0. TRIAL_CURSES → RT_CURSES（去试炼化：这是通用诅咒池，不再只属于试炼） ---------- */
{
  const n = s.split('TRIAL_CURSES').length - 1;
  if (n !== 3) { console.log('!! R0 TRIAL_CURSES 命中 ' + n + '（期望 3）'); fails++; }
  else { s = s.split('TRIAL_CURSES').join('RT_CURSES'); console.log('ok R0 TRIAL_CURSES -> RT_CURSES ×3'); }
}

/* ---------- R1. 宿主主权状态 + 脉冲曲线 + 遗物效果表 ---------- */
rep(`  var PULSE = { period: 5000, warn: 1500 };`,
`  var PULSE = { period: 5000, warn: 1500 };   // 兜底值：宿主可用 setPulseProfile 覆盖

  /**
   * 脉冲节拍默认曲线（规划 §3.12）
   * 回合上限取消后，压力由「脉冲节拍」承担：层数越深、本层清掉的房间越多脉冲越快。
   * 它只改**每回合类效果多久结算一次**，不动敌人数值、不新增伤害来源。
   */
  var PULSE_BY_DIFFICULTY = {
    easy:   { start: 6000, step: 250, min: 3200 },
    normal: { start: 5000, step: 350, min: 2600 },
    hard:   { start: 4400, step: 450, min: 2200 },
    hell:   { start: 3800, step: 550, min: 1800 },
    custom: { start: 5000, step: 350, min: 2600 }
  };

  // ============================================================
  //  宿主主权（交接接口）
  //  ------------------------------------------------------------
  //  引擎是**表现层**：楼层规划 / 诅咒池 / 遗物 / 脉冲节拍都该由宿主决定。
  //  这里每一项都是「宿主没下发时的兜底」—— 下发过就以宿主的为准。
  //  因此老宿主（试炼程序.js）一行都不用改，行为与从前完全一致。
  // ============================================================
  var HOST = {
    floorPlan: null,   // setFloorPlan：null = 用内置 generateFloorMap 自造地图
    cursePool: null,   // setCursePool：null = 用内置 RT_CURSES 那 10 条
    relics: [],        // setRelics：本局遗物（字符串 id，或 { id, name, ... }）
    relicFx: null,     // 遗物折成的系数（recomputeRelicFx 算好，热路径只读）
    pulse: null        // setPulseProfile：null = 按难度取 PULSE_BY_DIFFICULTY
  };

  /**
   * 遗物效果表（只放「能用一组系数表达」的；需要介入结算的走三个钩子）
   * ------------------------------------------------------------
   * 键 = 遗物 id；值里的**数值项累加**、**字符串项记为开关**（用 hasPerk 查）。
   * 引擎侧消费点：
   *   stamMax / stamRegen      → 体力（STAMINA）
   *   guardPerfect             → 完美格挡窗口（GUARD.perfect）
   *   goldGain                 → 击杀 / 宝箱金币（killEnemy）
   *   takenMult                → 承受伤害（damageHero）
   *   dmgMult / dmgLowHp       → 造成伤害（rollPlayerDamage）
   *   healKill                 → 击杀回血（killEnemy）
   *   thorn                    → 反伤（damageHero，走 hero.thorn）
   * ⚠️ P1 只铺通路：先放 3 条用于回归验证；24 件的完整内容见
   *    《待做/2.7规划.md》§3.4，P3 按同一张表补齐即可，不必再动引擎骨架。
   */
  var RELIC_FX = {
    lightBoots:  { stamMax: 30, stamRegen: 0.30 },      // 轻盈之靴：体力上限 +30、停手回复 +30%
    ironWall:    { guardPerfect: 80 },                  // 铁壁：完美格挡窗口 +80ms
    greedyHeart: { goldGain: 0.35, takenMult: 0.10 }    // 贪婪之心：金币 +35%、受伤 +10%
  };`, 'R1 宿主主权状态块');

/* ---------- R2. 诅咒查表支持宿主池 ---------- */
rep(`  function curseByName(n) { return RT_CURSES.filter(function (c) { return c.name === n; })[0] || null; }`,
`  /**
   * 诅咒查表：宿主用 setCursePool 下发过就以它为**唯一**依据（可借此禁用某条），
   * 否则退回内置 10 条。
   * ⚠️ 表外的名字会被静默丢弃（不报错），所以新增诅咒前必须先下发池子（风险 R9）。
   */
  function curseByName(n) {
    var list = HOST.cursePool || RT_CURSES;
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].name === n) return list[i];
    return null;
  }`, 'R2 curseByName 支持宿主池');

/* ---------- R3. bgmForRoom 补三种房间 + 非战斗房间判定 ---------- */
rep(`  function bgmForRoom(type) {
    if (type === 'boss') return 'boss';
    if (type === 'elite') return 'elite';
    if (type === 'mirror') return 'mirror';
    if (type === 'treasure') return 'explore';
    if (type === 'shrine') return 'rest';
    return 'battle';
  }`,
`  function bgmForRoom(type) {
    if (type === 'boss') return 'boss';
    if (type === 'elite') return 'elite';
    if (type === 'mirror') return 'mirror';
    if (type === 'treasure') return 'explore';
    if (type === 'shrine') return 'rest';
    if (type === 'shop' || type === 'rest') return 'rest';
    if (type === 'event') return 'explore';
    return 'battle';
  }

  /**
   * 非战斗房间：没有敌人，清空条件 = 完成房间目标
   * 宝箱 / 祭坛是原本就有的；商店 / 休整点 / 随机事件是本次接入经典模式时新增的三种。
   */
  function nonCombatRoom(type) {
    return type === 'treasure' || type === 'shrine' ||
      type === 'shop' || type === 'rest' || type === 'event';
  }`, 'R3 bgmForRoom + nonCombatRoom');

/* ---------- R4. ROOM_TYPES 新增 shop / rest / event ---------- */
rep(`    shrine:   { name: '祭坛房间', icon: '✚', fill: 0x17524c, line: 0x4ad0c0, center: '#7fe8d8', desc: '无战斗 · 祭坛恢复生命' }
  };`,
`    shrine:   { name: '祭坛房间', icon: '✚', fill: 0x17524c, line: 0x4ad0c0, center: '#7fe8d8', desc: '无战斗 · 祭坛恢复生命' },
    // --- 并入经典模式时新增的三种（无战斗，走近目标物开画内面板）---
    shop:     { name: '商店房间', icon: '$', fill: 0x1c4a2a, line: 0x4ad07a, center: '#8ae8a8', desc: '无战斗 · 用金币换取补给' },
    rest:     { name: '休整房间', icon: '☾', fill: 0x2a3150, line: 0x6a8ad0, center: '#a8c0ff', desc: '无战斗 · 恢复生命与状态' },
    event:    { name: '事件房间', icon: '?', fill: 0x4a3a1c, line: 0xd0b04a, center: '#ffe8a0', desc: '无战斗 · 未知的际遇' }
  };`, 'R4 ROOM_TYPES 三种新房间');

/* ---------- R5. linkCols：宿主导入的规划沿用同一套连线规则 ---------- */
rep(`    return { floor: floor, cols: cols, nodes: nodes, current: start };
  }`,
`    return { floor: floor, cols: cols, nodes: nodes, current: start };
  }

  /**
   * 给一组列连线（cols = 二维节点数组）
   * 与 generateFloorMap 内联的规则完全一致：相邻列、行号相差 ≤1 才可互通，
   * 且保证「每个房间都有出路」与「每个房间都走得到」。
   * 抽出来是为了让**宿主下发的规划**与原自造地图走同一套连线，不出现两套手感。
   */
  function linkCols(cols) {
    for (var c = 1; c < cols.length; c++) {
      var prev = cols[c - 1], col = cols[c];
      if (!prev.length || !col.length) continue;
      prev.forEach(function (n) {
        var cands = col.filter(function (m) { return Math.abs(m.row - n.row) <= 1; });
        if (!cands.length) cands = [col[0]];
        n.links.push(cands[ri(0, cands.length - 1)].id);
      });
      col.forEach(function (m) {
        var reachable = prev.some(function (n) { return n.links.indexOf(m.id) >= 0; });
        if (!reachable) {
          var best = prev.slice().sort(function (a, b) {
            return Math.abs(a.row - m.row) - Math.abs(b.row - m.row);
          })[0];
          best.links.push(m.id);
        }
      });
    }
    return cols;
  }`, 'R5 linkCols');

/* ---------- R6. Scene 侧：主权接口实现（插在 rollRoomEnv 之后） ---------- */
rep(`    rollRoomEnv(type) {
      if (!this.running) return false;
      if (!this.game || !this.game.events || typeof this.game.events.emit !== 'function') return false;
      this.game.events.emit('trial2d:room', { floor: this.floor, type: type || null });
      return true;
    }`,
`    rollRoomEnv(type) {
      if (!this.running) return false;
      if (!this.game || !this.game.events || typeof this.game.events.emit !== 'function') return false;
      this.game.events.emit('trial2d:room', { floor: this.floor, type: type || null });
      // 新名（P1）：载荷升级为**完整房间对象**，宿主据此分发商店目录 / 事件数据
      this.emitRt('rt:room', {
        floor: this.floor,
        type: type || null,
        room: this.roomNode ? {
          type: this.roomNode.type, col: this.roomNode.col, row: this.roomNode.row,
          name: this.roomNode.name || null, desc: this.roomNode.desc || null,
          payload: (this.roomNode.payload !== undefined) ? this.roomNode.payload : null
        } : null
      });
      return true;
    }

    // ============================================================
    //  宿主主权接口（P1 交接层）
    //  ============================================================

    /** 发一个宿主事件（宿主没监听也无害） */
    emitRt(name, payload) {
      if (!this.game || !this.game.events || typeof this.game.events.emit !== 'function') return false;
      try { this.game.events.emit(name, payload || {}); return true; } catch (e) { return false; }
    }

    /**
     * 把宿主下发的楼层规划铺成一张地图
     * ------------------------------------------------------------
     * 两种写法：
     *   { rooms: ['enemy','elite','treasure'] }            简写：引擎自动补入口与 Boss
     *   { cols: [['start'],['enemy','mirror'],['boss']] }  全权控制（引擎只负责连线）
     * 元素既可以是类型名，也可以是 { type, name, desc, payload }；
     * payload 会原样带到 rt:room 事件与 debug() 里，供宿主携带商店目录 / 事件数据。
     * 返回 null 表示规划不可用，调用方退回内置自造地图（不会把玩家困住）。
     */
    floorMapFromPlan(plan, floor) {
      if (!plan) return null;
      var spec = plan.cols;
      if (!spec && plan.rooms && plan.rooms.length) {
        spec = [[{ type: 'start' }]].concat(plan.rooms.map(function (r) { return [r]; }));
        var tail = spec[spec.length - 1][0];
        var tailType = (typeof tail === 'string') ? tail : (tail && tail.type);
        if (tailType !== 'boss') spec.push([{ type: 'boss' }]);
      }
      if (!spec || !spec.length) return null;

      var nodes = [], cols = [], id = 0;
      spec.forEach(function (colSpec, c) {
        var list = (colSpec instanceof Array) ? colSpec : [colSpec];
        var col = list.map(function (s0, i) {
          var o = (typeof s0 === 'string') ? { type: s0 } : (s0 || {});
          var n = {
            id: id++, col: c, row: i,
            type: ROOM_TYPES[o.type] ? o.type : 'enemy',
            links: [], visited: false, cleared: false,
            name: o.name || null, desc: o.desc || null,
            payload: (o.payload !== undefined) ? o.payload : null
          };
          nodes.push(n);
          return n;
        });
        if (col.length) cols.push(col);
      });
      if (!cols.length) return null;
      linkCols(cols);
      var start = cols[0][0];
      start.visited = true;
      return { floor: floor, cols: cols, nodes: nodes, current: start, fromPlan: true };
    }

    /** 取本层的房间图：宿主下发过规划就用宿主的，否则退回内置自造地图 */
    makeFloorMap(floor) {
      var m = this.floorMapFromPlan(HOST.floorPlan, floor);
      return m || generateFloorMap(floor);
    }

    /**
     * 当前腐化脉冲间隔（ms）—— 回合上限取消后的压力旋钮（规划 §3.12）
     *   interval = clamp(基准 − (层数−1)×50 − 本层已清房间数×步长, 下限, 基准)
     */
    pulseInterval() {
      var p = HOST.pulse || PULSE_BY_DIFFICULTY[this.difficulty] || PULSE_BY_DIFFICULTY.normal;
      var start = p.start || PULSE.period;
      var step = p.step || 0;
      var min = (p.min == null) ? start : p.min;
      var v = start - (this.floor - 1) * 50 - (this._floorRoomsCleared || 0) * step;
      return Math.round(clamp(v, Math.min(min, start), start));
    }

    /** 脉冲预警窗口（HUD 变红的提前量），随间隔同步缩放 */
    pulseWarn() {
      if (HOST.pulse && HOST.pulse.warn != null) return HOST.pulse.warn;
      return Math.min(PULSE.warn, Math.round(this.pulseInterval() * 0.30));
    }

    /* ---------- 遗物（承载点 + 三个钩子）---------- */

    /** 宿主下发本局遗物（获得 / 失去后重新下发整份即可） */
    setRelics(list) {
      HOST.relics = (list || []).slice();
      this.relics = HOST.relics;
      this.recomputeRelicFx();
      this.refreshHud();
      return HOST.relics.length;
    }

    /** 把遗物折成一组系数（每次下发只算一次，不进每帧热路径） */
    recomputeRelicFx() {
      var fx = { perk: {} };
      (HOST.relics || []).forEach(function (r) {
        var id = (typeof r === 'string') ? r : (r && r.id);
        var def = RELIC_FX[id];
        if (!def) return;
        for (var k in def) {
          if (!Object.prototype.hasOwnProperty.call(def, k)) continue;
          if (typeof def[k] === 'string') fx.perk[def[k]] = true;
          else fx[k] = (fx[k] || 0) + def[k];
        }
      });
      HOST.relicFx = fx;
      return fx;
    }

    /** 读一个遗物系数（没有则用 base） */
    relicFx(key, base) {
      var v = HOST.relicFx ? HOST.relicFx[key] : undefined;
      return (typeof v === 'number') ? v : (base || 0);
    }

    hasPerk(name) { return !!(HOST.relicFx && HOST.relicFx.perk && HOST.relicFx.perk[name]); }

    /* ---------- 中途存档 ---------- */

    /**
     * 中途存档快照：层 / 房间 / 生命 / 金币 / 诅咒 / 遗物 / 时间
     * 引擎自身**不落盘**（实时局是帧级数据，写进存档只会互相打架），
     * 交宿主写进存档 —— 否则刷新或崩溃会整层进度丢失（风险 R8）。
     */
    checkpointState(reason) {
      var h = this.hero, room = this.roomNode;
      return {
        reason: reason || 'room',
        floor: this.floor,
        points: Math.round(this.points),
        hp: Math.round(h.hp), maxHp: h.maxHp, shield: Math.round(h.shield),
        potions: h.potions, stamina: Math.round(h.stamina),
        kills: this.kills || 0, roomsCleared: this.roomsCleared || 0,
        roomType: room ? room.type : null,
        room: room ? { type: room.type, col: room.col, row: room.row, visited: !!room.visited } : null,
        curses: (this.curses || []).slice(),
        env: this.worldEnv ? this.worldEnv.name : null,
        relics: (HOST.relics || []).map(function (r) { return (typeof r === 'string') ? r : (r && r.id); }),
        elapsed: this.runStartedAt ? Math.round(this.time.now - this.runStartedAt) : 0
      };
    }

    /** 把快照交给宿主落盘（宿主没接 bridge 就只是不发，不影响本局） */
    notifyCheckpoint(reason) {
      var snap = this.checkpointState(reason);
      this.emitRt('rt:checkpoint', snap);
      if (!hasBridge('checkpoint')) return false;
      callBridge('checkpoint', snap);
      return true;
    }`, 'R6 主权接口实现块');

fs.writeFileSync(F, s);
console.log(fails ? `\n有 ${fails} 条未命中，已写回（请检查）` : '\n全部命中，已写回');
