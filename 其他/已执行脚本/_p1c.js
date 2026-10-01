/* P1-C：决策面板 + 暂停菜单 + API 入口 + 各接入点
 * 用法：node 其他/_p1c.js
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

/* ============ 1. 品质配色表（模块级） ============ */
rep(`    greedyHeart: { goldGain: 0.35, takenMult: 0.10 }    // 贪婪之心：金币 +35%、受伤 +10%
  };`,
`    greedyHeart: { goldGain: 0.35, takenMult: 0.10 }    // 贪婪之心：金币 +35%、受伤 +10%
  };

  /** 奖励 / 遗物品质配色（沿用引擎既有语义色，不引入新色） */
  var QUALITY_STYLE = {
    common:    { name: '普通', tint: 0x9aa0b0, color: '#c8cede' },
    rare:      { name: '稀有', tint: 0x4a8ad0, color: '#7ab8ff' },
    legendary: { name: '传说', tint: 0xd4a02a, color: '#ffd76a' }
  };`, '1 品质配色表');

/* ============ 2. 面板状态登记 ============ */
rep(`      return !!(this.mapOpen || this.shopOpen || this.codexOpen ||
                this.deathOpen || this.confirmOpen || this._viewPaused);`,
`      return !!(this.mapOpen || this.shopOpen || this.codexOpen ||
                this.deathOpen || this.confirmOpen ||
                this.choiceOpen || this.pauseOpen || this._viewPaused);`, '2a panelOverlayOpen');

rep(`      if (this.mapOpen || this.shopOpen || this.codexOpen || this.deathOpen || this.confirmOpen) {
        this.clearStaleInput();   // 面板里按下的键不该在关闭后立刻生效`,
`      if (this.mapOpen || this.shopOpen || this.codexOpen || this.deathOpen || this.confirmOpen ||
          this.choiceOpen || this.pauseOpen) {
        this.clearStaleInput();   // 面板里按下的键不该在关闭后立刻生效`, '2b update 冻结条件');

rep(`      var pb = this.panelButtons || {};
      if (this.confirmOpen) {`,
`      var pb = this.panelButtons || {};
      // 决策面板优先级最高：它是宿主推进流程的阻塞点（奖励 / 诅咒 / 事件）
      if (this.choiceOpen) {
        var chb = this.hitBtnList(p, pb.choice);
        if (chb) { sfx('click'); this.onChoiceAction(chb); }
        return true;
      }
      if (this.pauseOpen) {
        var pab = this.hitBtnList(p, pb.pause);
        if (pab) { sfx('click'); this.onPauseAction(pab.action); }
        return true;
      }
      if (this.confirmOpen) {`, '2c handleUiClick 分发');

rep(`{ confirm: [], shop: [], death: [], map: [] }`,
`{ confirm: [], shop: [], death: [], map: [], choice: [], pause: [] }`, '2d panelButtons 补两项', 4);

/* ============ 3. 面板状态复位（beginRun / abortRun / finishRun） ============ */
rep(`      this.destroyLayer('deathLayer');
      this.destroyLayer('shopLayer');
      this.destroyLayer('confirmLayer');`,
`      this.destroyLayer('deathLayer');
      this.destroyLayer('shopLayer');
      this.destroyLayer('confirmLayer');
      this.destroyLayer('pauseLayer');
      this.destroyLayer('choiceLayer');`, '3a beginRun 清面板层');

rep(`      this.deathOpen = false;
      this.confirmOpen = false;
      this.pendingMapAfterShop = false;
      this._viewPaused = false;`,
`      this.deathOpen = false;
      this.confirmOpen = false;
      this.choiceOpen = false;
      this.pauseOpen = false;
      this.pendingMapAfterShop = false;
      this._viewPaused = false;`, '3b beginRun 复位开关');

rep(`      if (this.diveFx) this.diveFx.setVisible(false);
      this.destroyLayer('shopLayer');
      this.destroyLayer('deathLayer');
      this.destroyLayer('confirmLayer');`,
`      if (this.diveFx) this.diveFx.setVisible(false);
      this.destroyLayer('shopLayer');
      this.destroyLayer('deathLayer');
      this.destroyLayer('confirmLayer');
      this.destroyLayer('pauseLayer');
      this.destroyLayer('choiceLayer');
      this.choiceOpen = false;
      this.pauseOpen = false;`, '3c abortRun 清面板');

/* ============ 4. buildLevel / spawnEnemies / layoutFloor 用 nonCombatRoom ============ */
rep(`      var nonCombat = (node.type === 'treasure' || node.type === 'shrine');`,
`      var nonCombat = nonCombatRoom(node.type);`, '4a buildLevel nonCombat');

rep(`      var nonCombat = this.roomNode && (this.roomNode.type === 'treasure' || this.roomNode.type === 'shrine');`,
`      var nonCombat = this.roomNode && nonCombatRoom(this.roomNode.type);`, '4b 平台分布 nonCombat');

rep(`      var nonCombat = (roomType === 'treasure' || roomType === 'shrine');

      if (roomType === 'treasure' || roomType === 'shrine') {`,
`      var nonCombat = nonCombatRoom(roomType);

      if (nonCombat) {`, '4c spawnEnemies nonCombat');

rep(`      this.pulseAt = this.time.now + PULSE.period;`,
`      this.pulseAt = this.time.now + this.pulseInterval();`, '4d buildLevel 脉冲节拍');

/* ============ 5. spawnRoomGoal 三种新房间 ============ */
rep(`    /** 非战斗房间的目标物：宝箱 / 祭坛 */
    spawnRoomGoal(roomType) {`,
`    /** 非战斗房间的目标物：宝箱 / 祭坛 / 商店 / 休整点 / 事件点 */
    spawnRoomGoal(roomType) {`, '5a spawnRoomGoal 注释');

rep(`        this.roomGoal = { kind: 'shrine', done: false, x: x, y: y, obj: altar, extra: orb, label: label2 };
      }
    }`,
`        this.roomGoal = { kind: 'shrine', done: false, x: x, y: y, obj: altar, extra: orb, label: label2 };
      } else if (roomType === 'shop') {
        var stall = this.add.rectangle(x, y - 16, 68, 50, 0x1c4a2a, 1).setDepth(6).setStrokeStyle(3, 0x4ad07a);
        var awning = this.add.rectangle(x, y - 46, 74, 12, 0x8ae8a8, 1).setDepth(7);
        var shopLbl = this.add.text(x, y - 78, '商店 · 走近查看', { fontSize: '13px', color: '#8ae8a8' }).setOrigin(0.5).setDepth(7);
        this.roomGoal = { kind: 'shop', done: false, x: x, y: y, obj: stall, extra: awning, label: shopLbl };
      } else if (roomType === 'rest') {
        var campfire = this.add.circle(x, y - 28, 22, 0x6a8ad0, 0.9).setDepth(6);
        var log = this.add.rectangle(x, y - 8, 52, 12, 0x2a3150, 1).setDepth(7).setStrokeStyle(2, 0x6a8ad0);
        var restLbl = this.add.text(x, y - 76, '休整点 · 走近歇息', { fontSize: '13px', color: '#a8c0ff' }).setOrigin(0.5).setDepth(7);
        this.roomGoal = { kind: 'rest', done: false, x: x, y: y, obj: campfire, extra: log, label: restLbl };
      } else if (roomType === 'event') {
        var rift = this.add.rectangle(x, y - 30, 44, 62, 0x4a3a1c, 1).setDepth(6).setStrokeStyle(3, 0xd0b04a);
        var riftGlow = this.add.circle(x, y - 30, 16, 0xffe8a0, 0.85).setDepth(7);
        var riftLbl = this.add.text(x, y - 86, '深渊裂隙 · 走近探查', { fontSize: '13px', color: '#ffe8a0' }).setOrigin(0.5).setDepth(7);
        this.roomGoal = { kind: 'event', done: false, x: x, y: y, obj: rift, extra: riftGlow, label: riftLbl };
      }
    }`, '5b spawnRoomGoal 三种新目标物');

/* ============ 6. resolveRoomGoal 分流 + finishRoomGoal / notifyRoomAction ============ */
rep(`    resolveRoomGoal() {
      var g = this.roomGoal;
      if (!g || g.done) return;
      g.done = true;`,
`    resolveRoomGoal() {
      var g = this.roomGoal;
      if (!g || g.done) return;
      // 商店 / 休整点 / 事件：引擎不出自己的结算，交给宿主开面板。
      // 处理完由宿主调 API.finishRoomGoal() 收尾 —— 在那之前传送门不开，
      // 避免「面板还没处理，门已经开了」这种能把玩家卡住的中间态。
      if (g.kind === 'shop' || g.kind === 'rest' || g.kind === 'event') {
        if (g.awaiting) return;
        g.awaiting = true;
        this.notifyRoomAction(g.kind, g);
        return;
      }
      g.done = true;`, '6a resolveRoomGoal 分流');

rep(`      if (g.extra) g.extra.destroy();
      if (g.obj) { g.obj.setFillStyle(0x3a3a44, 1); }
      if (g.label) g.label.setText('已使用');
      this.refreshHud();
      this.checkFloorClear();
    }`,
`      if (g.extra) g.extra.destroy();
      if (g.obj) { g.obj.setFillStyle(0x3a3a44, 1); }
      if (g.label) g.label.setText('已使用');
      this.refreshHud();
      this.checkFloorClear();
    }

    /**
     * 宿主处理完非战斗房间（关掉画内面板）后调用：收尾并开放传送门
     * 商店 / 休整点 / 事件房只有走到这里才算「清空」，isRoomCleared 才放行。
     */
    finishRoomGoal() {
      var g = this.roomGoal;
      if (!g || g.done) return false;
      g.done = true;
      g.awaiting = false;
      if (g.extra) g.extra.destroy();
      if (g.obj) g.obj.setFillStyle(0x3a3a44, 1);
      if (g.label) g.label.setText('已使用');
      this.refreshHud();
      this.checkFloorClear();
      return true;
    }

    /**
     * 非战斗房间的目标物被触碰 → 请宿主出面板
     * 引擎**不自己决定**商店卖什么、休整回多少、事件是什么（这些是经典内核的数据），
     * 只把上下文递出去；宿主收到后调 API.openChoicePanel / openShop 等打开画内面板。
     */
    notifyRoomAction(kind, goal) {
      var payload = {
        kind: kind,
        floor: this.floor,
        points: Math.round(this.points),
        hp: Math.round(this.hero.hp), maxHp: this.hero.maxHp,
        potions: this.hero.potions,
        room: this.roomNode ? {
          type: this.roomNode.type, col: this.roomNode.col, row: this.roomNode.row,
          name: this.roomNode.name || null, desc: this.roomNode.desc || null,
          payload: (this.roomNode.payload !== undefined) ? this.roomNode.payload : null
        } : null,
        goal: goal ? { kind: goal.kind, x: goal.x, y: goal.y } : null
      };
      this.emitRt('rt:room-action', payload);
      if (hasBridge('roomAction')) { callBridge('roomAction', payload); return true; }
      // 宿主没接：至少给个可见反馈，不让玩家以为卡住
      this.showCenter('这里还没有人打理（宿主未接入）', '#ffd76a');
      this.finishRoomGoal();
      return false;
    }`, '6b finishRoomGoal + notifyRoomAction');

/* ============ 7. openPortal：清房事件 + 存档 + 节拍 ============ */
rep(`      var first = !this.portalOpen;
      this.portalOpen = true;
      this.portal.setVisible(true).setAlpha(1);
      if (!quiet && first) {
        var def = this.roomNode ? (ROOM_TYPES[this.roomNode.type] || ROOM_TYPES.enemy) : ROOM_TYPES.enemy;
        this.showCenter(def.name + '已清空 · 走向右方传送门', '#73f0b4');
      }
      this.refreshHud();
      return true;
    }`,
`      var first = !this.portalOpen;
      this.portalOpen = true;
      this.portal.setVisible(true).setAlpha(1);
      if (!quiet && first) {
        var def = this.roomNode ? (ROOM_TYPES[this.roomNode.type] || ROOM_TYPES.enemy) : ROOM_TYPES.enemy;
        this.showCenter(def.name + '已清空 · 走向右方传送门', '#73f0b4');
      }
      if (first) {
        // 本层已清房间数 +1：脉冲节拍靠它加速（规划 §3.12）
        this._floorRoomsCleared = (this._floorRoomsCleared || 0) + 1;
        this.pulseAt = this.time.now + this.pulseInterval();
        // 清房通知（载荷即存档快照：宿主拿到就能落盘，不必再问一次）
        var snap = this.checkpointState('room-cleared');
        snap.roomsClearedThisFloor = this._floorRoomsCleared;
        snap.pulseInterval = this.pulseInterval();
        this.emitRt('rt:room-cleared', snap);
        this.notifyCheckpoint('room-cleared');
      }
      this.refreshHud();
      return true;
    }`, '7 openPortal 清房事件');

/* ============ 8. nextFloor：宿主地图 + 层事件 + 存档 ============ */
rep(`        this.points += 8;
        var next = this.floor + 1;
        this.floor = next;
        this.floorMap = generateFloorMap(next);
        this.resetSkill(false);   // 每层一次：深入下一层后技能可再次使用`,
`        this.points += 8;
        var next = this.floor + 1;
        this.floor = next;
        this.floorMap = this.makeFloorMap(next);
        this._floorRoomsCleared = 0;   // 新一层：脉冲节拍从头计
        this.notifyCheckpoint('floor');
        this.resetSkill(false);   // 每层一次：深入下一层后技能可再次使用`, '8a nextFloor 地图与存档');

rep(`        if (this.game && this.game.events) this.game.events.emit('trial2d:floor', { floor: next });`,
`        if (this.game && this.game.events) this.game.events.emit('trial2d:floor', { floor: next });
        this.emitRt('rt:floor', {
          floor: next, points: Math.round(this.points),
          roomsCleared: this.roomsCleared || 0,
          rooms: this.floorMap.nodes.length,
          plan: !!this.floorMap.fromPlan
        });`, '8b nextFloor 层事件');

/* ============ 9. beginRun：宿主地图 + 遗物 ============ */
rep(`      // 生成第 1 层地图，从入口房间开始
      this.floor = 1;
      this.floorMap = generateFloorMap(1);`,
`      // 遗物：宿主可在 startRun 的 relics 里带进来，也可局中随时 setRelics 重下发
      if (d.relics && d.relics.length) HOST.relics = d.relics.slice();
      this.relics = HOST.relics;
      this.recomputeRelicFx();

      // 生成第 1 层地图，从入口房间开始（宿主下发过规划就用宿主的）
      this.floor = 1;
      this._floorRoomsCleared = 0;
      this.floorMap = this.makeFloorMap(1);`, '9 beginRun 地图与遗物');

/* ============ 10. enterRoom：存档 + 音效 ============ */
rep(`      if (n.type === 'elite') sfx('elite');
      else if (n.type === 'mirror') sfx('mirror');
      else if (n.type === 'boss') sfx('boss');
    }`,
`      if (n.type === 'elite') sfx('elite');
      else if (n.type === 'mirror') sfx('mirror');
      else if (n.type === 'boss') sfx('boss');
      else if (n.type === 'shop') sfx('coin');
      else if (n.type === 'rest') sfx('heal');
      else if (n.type === 'event') sfx('door');
      // 进房存档：中途刷新 / 崩溃只回退到房间入口，不丢整层
      this.notifyCheckpoint('room');
    }`, '10 enterRoom 存档与音效');

/* ============ 11. updatePulseHud：显示当前节拍 ============ */
rep(`      var leftMs = Math.max(0, this.pulseAt - this.time.now);
      var urgent = leftMs <= PULSE.warn;
      var txt = '腐化脉冲 ' + (leftMs / 1000).toFixed(1) + 's';`,
`      var leftMs = Math.max(0, this.pulseAt - this.time.now);
      var urgent = leftMs <= this.pulseWarn();
      // 同时显示「当前节拍」：让「压力在变快」这件事被玩家看见（规划 §3.12）
      var iv = this.pulseInterval();
      var txt = '腐化脉冲 ' + (leftMs / 1000).toFixed(1) + 's · 节拍 ' + (iv / 1000).toFixed(1) + 's';`, '11 脉冲 HUD');

/* ============ 12. 三个遗物钩子 ============ */
rep(`      var crit = sharp || forceCrit || pass.forceCrit ||
        Math.random() < (this.hero.critRate / 100 + critEnv.rate);`,
`      // 遗物：造成伤害的系数（表见 RELIC_FX）
      var relicDmg = 1 + this.relicFx('dmgMult', 0);
      if (this.hasPerk('berserkLowHp') && this.hero.hp <= this.hero.maxHp * 0.5) {
        relicDmg *= 1 + this.relicFx('dmgLowHp', 0.25);
      }
      if (relicDmg !== 1) base *= relicDmg;
      var crit = sharp || forceCrit || pass.forceCrit ||
        Math.random() < (this.hero.critRate / 100 + critEnv.rate);`, '12a 遗物：伤害');

rep(`        // 狂怒状态：狂暴而不设防 —— 受到的伤害 +15%
        if (this.furyActive()) dmg *= FURY.takenMult;`,
`        // 狂怒状态：狂暴而不设防 —— 受到的伤害 +15%
        if (this.furyActive()) dmg *= FURY.takenMult;
        // 遗物：承受伤害的系数（贪婪之心 +10% 这类，用乘法叠在诅咒 / 环境之后）
        dmg *= (1 + this.relicFx('takenMult', 0));`, '12b 遗物：承受伤害');

rep(`      if (this.hero.thorn > 0 && source) this.damageEnemy(source, { dmg: this.hero.thorn, crit: false }, true);`,
`      var thornVal = this.hero.thorn + this.relicFx('thornExtra', 0);   // 遗物：荆棘之心
      if (thornVal > 0 && source) this.damageEnemy(source, { dmg: thornVal, crit: false }, true);`, '12c 遗物：荆棘');

rep(`      var gain = e.tier === 'boss' ? 12 : (e.tier === 'elite' ? 5 : 2);
      if (this.hasCurse('贪婪')) gain = Math.max(1, Math.round(gain * 0.5));   // 诅咒：贪婪`,
`      var gain = e.tier === 'boss' ? 12 : (e.tier === 'elite' ? 5 : 2);
      gain = Math.max(1, Math.round(gain * (1 + this.relicFx('goldGain', 0))));   // 遗物：金币获取
      if (this.hasCurse('贪婪')) gain = Math.max(1, Math.round(gain * 0.5));   // 诅咒：贪婪`, '12d 遗物：金币');

rep(`      // 狂怒：击杀攒怒
      this.addFury(FURY.gainKill);`,
`      // 狂怒：击杀攒怒
      this.addFury(FURY.gainKill);
      // 遗物：击杀回复（汲魂者一类）
      var healKill = this.relicFx('healKill', 0);
      if (healKill > 0 && !this.heroDead) this.healHero(healKill, true);`, '12e 遗物：击杀回血');

/* ============ 13. 文案去试炼化 ============ */
rep(`'深渊试炼 · 第 ' + this.floor + ' 层 · '`, `'深渊回廊 · 第 ' + this.floor + ' 层 · '`, '13a 死亡面板标题');
rep(`'试炼商店'`, `'商店'`, '13b 商店标题', 2);
rep(`'商店数据不可用（请从试炼入口进入）'`, `'商店数据不可用（宿主未提供商品目录）'`, '13c 商店缺数据文案');
rep(`'该英雄的技能尚未适配试炼模式'`, `'该英雄的技能尚未适配实时战斗'`, '13d 技能未适配文案');
rep(`      this._confirmMsg = msg || '确认退出试炼？';`, `      this._confirmMsg = msg || '确认结束本局？';`, '13e 确认框默认文案');
rep(`          this.askQuit('已倒下，确认退出试炼？');`, `          this.askQuit('已倒下，确认结束本局？');`, '13f 倒下确认文案');
rep(`            : '确认退出试炼？本局进度将结束');`, `            : '确认结束本局？本局进度将结束');`, '13g 撤离确认文案');
rep(`      L.add(this.add.text(W / 2, H / 2 - (mini ? 44 : 50), '退出试炼', {`,
`      L.add(this.add.text(W / 2, H / 2 - (mini ? 44 : 50), '结束本局', {`, '13h 确认框标题');
rep(`      this.uiButton(L, this.panelButtons.death, 'exit', '退出试炼', bx + bw + gap, by, bw, bh, false);`,
`      this.uiButton(L, this.panelButtons.death, 'exit', '结束本局', bx + bw + gap, by, bw, bh, false);`, '13i 死亡面板按钮');

fs.writeFileSync(F, s);
console.log(fails ? `\n有 ${fails} 条未命中，已写回` : '\n全部命中，已写回');
