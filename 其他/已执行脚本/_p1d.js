/* P1-D：面板实现（决策 / 暂停）+ API 入口 + debug/press 扩展 + 修正 3b
 * 用法：node 其他/_p1d.js
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
  const want = (expect == null) ? 1 : want0(expect);
  function want0(x) { return x; }
  if (n !== want) { console.log('!! ' + label + ' 命中 ' + n + ' 次（期望 ' + want + '）'); fails++; return false; }
  s = s.split(f).join(t);
  console.log('ok ' + label + (want !== 1 ? ' ×' + want : ''));
  return true;
}

/* ---------- 修正 3b：beginRun 复位开关（漏了 shopOpen 一行） ---------- */
rep(`      this.deathOpen = false;
      this.shopOpen = false;
      this.confirmOpen = false;
      this.pendingMapAfterShop = false;
      this._viewPaused = false;`,
`      this.deathOpen = false;
      this.shopOpen = false;
      this.confirmOpen = false;
      this.choiceOpen = false;
      this.pauseOpen = false;
      this.pendingMapAfterShop = false;
      this._viewPaused = false;`, '3b-fix beginRun 复位开关');

/* ---------- closeConfirm 的恢复条件改用统一判断 ---------- */
rep(`      if (this._pausedForConfirm) {
        this._pausedForConfirm = false;
        if (!this.mapOpen && !this.shopOpen && !this.deathOpen) {
          try { this.physics.world.resume(); } catch (e) { /* 忽略 */ }
        }
      }`,
`      if (this._pausedForConfirm) {
        this._pausedForConfirm = false;
        this._resumeFromPanelPause();
      }`, 'closeConfirm 用统一恢复');

/* ---------- 面板实现（插在 closeConfirm 之后） ---------- */
rep(`    closeConfirm() {
      this.confirmOpen = false;
      this.destroyLayer('confirmLayer');
      if (this.panelButtons) this.panelButtons.confirm = [];
      if (this._pausedForConfirm) {
        this._pausedForConfirm = false;
        this._resumeFromPanelPause();
      }
      if (this.touchUI) this.touchUI.setVisible(this._lastInputWasTouch === true);
    }`,
`    closeConfirm() {
      this.confirmOpen = false;
      this.destroyLayer('confirmLayer');
      if (this.panelButtons) this.panelButtons.confirm = [];
      if (this._pausedForConfirm) {
        this._pausedForConfirm = false;
        this._resumeFromPanelPause();
      }
      if (this.touchUI) this.touchUI.setVisible(this._lastInputWasTouch === true);
    }

    /**
     * 面板全部关掉后恢复物理世界
     * 新面板（决策 / 暂停）可能盖在旧面板之上，所以统一在这里判断一次，
     * 而不是在每个 close 里各写一份会互相漏掉的条件。
     */
    _resumeFromPanelPause() {
      if (this.mapOpen || this.shopOpen || this.deathOpen || this.confirmOpen ||
        this.codexOpen || this.choiceOpen || this.pauseOpen) return false;
      try { this.physics.world.resume(); } catch (e) { /* 忽略 */ }
      return true;
    }

    // ============================================================
    //  暂停菜单（画内）
    //  ------------------------------------------------------------
    //  与 pauseForView 的区别：那个是「切到文字界面」（宿主隐藏画布、显示文字面板）；
    //  这个是**就地暂停** —— 不换视图、不通知宿主，玩家在战场原地看着菜单继续或退出。
    // ============================================================
    openPauseMenu() {
      if (this.pauseOpen || this._finished || this.heroDead) return false;
      if (this.panelOverlayOpen()) return false;   // 别的面板开着时不叠上来
      this.pauseOpen = true;
      this._pausedForPause = !!this.running;
      if (this.running) {
        try { this.physics.world.pause(); } catch (e) { /* 忽略 */ }
        this.attacking = false;
        this.diving = false;
        this.isCharging = false;
        this.dodging = false;
        if (this.chargeRing) this.chargeRing.setVisible(false);
        if (this.hero) this.hero.setVelocity(0, 0);
      }
      if (this.touchUI) this.touchUI.setVisible(false);
      this.buildPauseLayer();
      sfx('click');
      this.emitRt('rt:pause', { open: true, floor: this.floor });
      return true;
    }

    closePauseMenu() {
      if (!this.pauseOpen) return false;
      this.pauseOpen = false;
      this._pausedForPause = false;
      this.destroyLayer('pauseLayer');
      if (this.panelButtons) this.panelButtons.pause = [];
      this._resumeFromPanelPause();
      if (this.touchUI) this.touchUI.setVisible(this._lastInputWasTouch === true);
      this.emitRt('rt:pause', { open: false, floor: this.floor });
      return true;
    }

    buildPauseLayer(sizeW, sizeH) {
      var W = (sizeW && sizeW >= 40) ? sizeW : this.scale.width;
      var H = (sizeH && sizeH >= 40) ? sizeH : this.scale.height;
      if (W < 40 || H < 40) return null;
      var mini = W < 700;
      var L = this.add.container(0, 0).setDepth(2480).setScrollFactor(0);
      this.pauseLayer = L;
      this.panelButtons.pause = [];

      this.addDim(L, W, H, 0.72);
      var pw = Math.min(W * 0.82, mini ? 340 : 380);
      var ph = mini ? 170 : 198;
      var px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - ph / 2);
      this.addPanel(L, px, py, pw, ph, {});
      L.add(this.add.text(W / 2, py + (mini ? 18 : 24), '已暂停', {
        fontSize: (mini ? 18 : 22) + 'px', color: UI.title, fontStyle: 'bold', letterSpacing: 3
      }).setOrigin(0.5, 0));
      L.add(this.add.text(W / 2, py + (mini ? 44 : 56),
        '第 ' + this.floor + ' 层 · 生命 ' + Math.round(this.hero.hp) + '/' + this.hero.maxHp +
        ' · 金币 ' + Math.round(this.points), {
          fontSize: (mini ? 11 : 13) + 'px', color: UI.sub
        }).setOrigin(0.5, 0));

      var bw = mini ? 126 : 148, bh = mini ? 36 : 42, gap = 14;
      var by = py + ph - (mini ? 32 : 38);
      this.uiButton(L, this.panelButtons.pause, 'resume', '继续战斗', W / 2 - bw - gap / 2, by, bw, bh, true);
      this.uiButton(L, this.panelButtons.pause, 'quit', '结束本局', W / 2 + gap / 2, by, bw, bh, false);
      return L;
    }

    onPauseAction(action) {
      if (action === 'resume') { this.closePauseMenu(); return; }
      if (action === 'quit') { this.askQuit('确认结束本局？'); return; }
    }

    // ============================================================
    //  决策面板（奖励三选一 / 诅咒抉择 / 事件 / 休整）
    //  ------------------------------------------------------------
    //  内容**全部由宿主给**，引擎只负责画与回传：
    //    { title, desc, cards: [{ id, name, desc, quality, tag, disabled }],
    //      actions: [{ id, label, primary }] }
    //  选完 → bridge.choiceResult({ kind, action, id, card, index }) + emit 'rt:choice'。
    //  与其它画内面板一样登记进 panelOverlayOpen，打开时冻结战斗。
    // ============================================================
    openChoicePanel(kind, data) {
      if (this.choiceOpen) this.closeChoicePanel(null);
      var W = this.scale.width, H = this.scale.height;
      if (W < 40 || H < 40) return false;
      data = data || {};
      this.choiceOpen = true;
      this.choiceKind = kind || 'reward';
      this.choiceData = data;
      this.choiceCards = (data.cards || []).slice(0, 4);   // 最多 4 张（深渊印记把 3 变 4 也放得下）
      this._pausedForChoice = !!this.running;
      if (this.running) {
        try { this.physics.world.pause(); } catch (e) { /* 忽略 */ }
        this.attacking = false;
        this.diving = false;
        this.isCharging = false;
        if (this.chargeRing) this.chargeRing.setVisible(false);
        if (this.hero) this.hero.setVelocity(0, 0);
      }
      if (this.touchUI) this.touchUI.setVisible(false);
      this.buildChoiceLayer();
      sfx('click');
      this.emitRt('rt:choice-open', { kind: this.choiceKind, cards: this.choiceCards.length });
      return true;
    }

    /** 关面板并把玩家的选择回传宿主（result 为 null 表示只是收起，没有选择） */
    closeChoicePanel(result) {
      if (!this.choiceOpen) return false;
      this.choiceOpen = false;
      this._pausedForChoice = false;
      this.destroyLayer('choiceLayer');
      if (this.panelButtons) this.panelButtons.choice = [];
      this.choiceRects = [];
      this._resumeFromPanelPause();
      if (this.touchUI) this.touchUI.setVisible(this._lastInputWasTouch === true);
      if (result) {
        this.emitRt('rt:choice', result);
        callBridge('choiceResult', result);
      }
      return true;
    }

    buildChoiceLayer(sizeW, sizeH) {
      var W = (sizeW && sizeW >= 40) ? sizeW : this.scale.width;
      var H = (sizeH && sizeH >= 40) ? sizeH : this.scale.height;
      if (W < 40 || H < 40) return null;
      var self = this;
      var data = this.choiceData || {};
      var cards = this.choiceCards || [];
      var actions = (data.actions || []).slice(0, 3);
      var mini = W < 700;
      var L = this.add.container(0, 0).setDepth(2450).setScrollFactor(0);
      this.choiceLayer = L;
      this.panelButtons.choice = [];
      this.choiceRects = [];

      this.addDim(L, W, H, 0.84);
      var pw = Math.min(W - 20, mini ? 660 : 780);
      var ph = Math.min(H - 16, mini ? 268 : 322);
      var px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - ph / 2);
      this.addPanel(L, px, py, pw, ph, {});

      L.add(this.add.text(W / 2, py + (mini ? 14 : 20), data.title || '请选择', {
        fontSize: (mini ? 16 : 20) + 'px', color: UI.title, fontStyle: 'bold', letterSpacing: 2
      }).setOrigin(0.5, 0));
      if (data.desc) {
        L.add(this.add.text(W / 2, py + (mini ? 38 : 50), data.desc, {
          fontSize: (mini ? 11 : 13) + 'px', color: UI.sub, align: 'center',
          wordWrap: wrapCN(pw - 48)
        }).setOrigin(0.5, 0));
      }

      var n = Math.max(1, cards.length);
      var gap = mini ? 10 : 14;
      var padX = mini ? 16 : 26;
      var cardTop = py + (mini ? 76 : 96);
      var actH = actions.length ? (mini ? 34 : 40) : 0;
      var bottomPad = (mini ? 14 : 20);
      var cardH = Math.max(64, Math.min(mini ? 126 : 150,
        py + ph - bottomPad - (actH ? actH + (mini ? 12 : 16) : 0) - cardTop));
      var cardW = Math.min(mini ? 142 : 168,
        Math.floor((pw - padX * 2 - gap * (n - 1)) / n));
      var totalW = cardW * n + gap * (n - 1);
      var x0 = Math.round(W / 2 - totalW / 2);

      cards.forEach(function (card, i) {
        self.craftChoiceCard(L, card, x0 + i * (cardW + gap), cardTop, cardW, cardH, mini);
      });

      if (actions.length) {
        var bh = mini ? 34 : 40;
        var bw = Math.min(mini ? 130 : 156, (pw - padX * 2 - 12 * (actions.length - 1)) / actions.length);
        var tW = bw * actions.length + 12 * (actions.length - 1);
        var bx = Math.round(W / 2 - tW / 2);
        var by = py + ph - bottomPad - bh / 2;
        actions.forEach(function (a, i) {
          self.uiButton(L, self.panelButtons.choice, 'act:' + a.id, a.label || a.id,
            bx + i * (bw + 12), by, bw, bh, !!a.primary);
        });
      }
      return L;
    }

    /**
     * 一张可选卡（品质色条 / 名字 / 品质 / 说明）
     * 命中登记进 panelButtons.choice，与其它按钮共用同一套矩形命中。
     */
    craftChoiceCard(layer, card, x, y, w, h, mini) {
      var q = QUALITY_STYLE[card.quality] || QUALITY_STYLE.common;
      var off = !!card.disabled;
      this.addPanel(layer, x, y, w, h, {
        radius: UI.boxR, fill: UI.box, fillAlpha: off ? 0.5 : 0.9,
        line: q.tint, lineAlpha: off ? 0.18 : 0.55
      });
      layer.add(this.add.rectangle(x + w / 2, y + 3, w - 10, 3, q.tint, off ? 0.3 : 0.9).setOrigin(0.5, 0));
      layer.add(this.add.text(x + w / 2, y + (mini ? 12 : 16), card.name || '—', {
        fontSize: (mini ? 13 : 15) + 'px', color: off ? UI.muted : q.color, fontStyle: 'bold'
      }).setOrigin(0.5, 0));
      layer.add(this.add.text(x + w / 2, y + (mini ? 30 : 37), card.tag || q.name, {
        fontSize: (mini ? 10 : 11) + 'px', color: UI.muted
      }).setOrigin(0.5, 0));
      layer.add(this.add.text(x + w / 2, y + (mini ? 46 : 56), card.desc || '', {
        fontSize: (mini ? 10 : 12) + 'px', color: UI.sub, align: 'center',
        wordWrap: wrapCN(w - 16), lineSpacing: 2
      }).setOrigin(0.5, 0));

      var btn = {
        action: 'card', id: card.id, label: card.name, card: card, disabled: off,
        x: x, y: y + h / 2, w: w, h: h, pad: 0, shape: 'card', variant: 'plain', state: 'normal'
      };
      this.choiceRects.push(btn);
      if (!off) this.panelButtons.choice.push(btn);
      return btn;
    }

    /** 决策面板的点击结果：卡片 → { action:'card', id, card }；按钮 → { action:'act:<id>' } */
    onChoiceAction(btn) {
      if (!btn) return;
      var action = btn.action || '';
      var isCard = (action === 'card');
      var result = {
        kind: this.choiceKind,
        action: isCard ? 'card' : action,
        id: isCard ? btn.id : (action.indexOf('act:') === 0 ? action.slice(4) : action),
        card: btn.card || null,
        index: isCard ? (this.choiceCards || []).indexOf(btn.card) : -1
      };
      this.closeChoicePanel(result);
    }`, '面板实现块');

/* ---------- API 入口 ---------- */
rep(`    /** 图鉴：打开 / 关闭（宿主按钮或触摸都能用） */`,
`    /* ============================================================
       宿主主权接口（P1）
       ------------------------------------------------------------
       引擎是表现层：楼层规划 / 诅咒池 / 遗物 / 脉冲节拍由宿主决定，
       决策面板的内容也由宿主给。不接这些接口也不影响老宿主 ——
       不接就退回引擎内置行为（自造地图 / 内置诅咒池 / 默认节拍）。
       ============================================================ */

    /** 楼层 / 房间序列由宿主决定（写法见 Scene.floorMapFromPlan）；传 null 恢复内置自造地图 */
    setFloorPlan: function (plan) {
      HOST.floorPlan = plan || null;
      return HOST.floorPlan;
    },
    getFloorPlan: function () { return HOST.floorPlan; },

    /** 诅咒池（唯一来源：表外的名字会被静默丢弃）；传 null / 空数组恢复内置 10 条 */
    setCursePool: function (list) {
      HOST.cursePool = (list && list.length) ? list.slice() : null;
      var s = state.scene;
      if (s && s.ready) s.setCursesAndEnv(s.curses, s.worldEnv);   // 按新池重新过滤一遍
      return HOST.cursePool ? HOST.cursePool.length : null;
    },
    getCursePool: function () { return HOST.cursePool ? HOST.cursePool.slice() : null; },

    /** 遗物（字符串 id 或 { id, name, quality }）；获得 / 失去后重新下发整份即可 */
    setRelics: function (list) {
      var s = state.scene;
      if (s && s.ready) return s.setRelics(list);
      HOST.relics = (list || []).slice();
      HOST.relicFx = null;
      return HOST.relics.length;
    },
    getRelics: function () { return (HOST.relics || []).slice(); },
    getRelicFx: function () { return HOST.relicFx; },

    /** 脉冲节拍曲线 { start, step, min, warn }（规划 §3.12）；传 null 恢复按难度的默认表 */
    setPulseProfile: function (p) {
      HOST.pulse = p || null;
      var s = state.scene;
      if (s && s.ready) {
        s.pulseAt = s.time.now + s.pulseInterval();
        s.refreshHud();
      }
      return HOST.pulse;
    },
    getPulseInterval: function () {
      var s = state.scene;
      return (s && s.ready) ? s.pulseInterval() : null;
    },

    /** 中途存档快照（宿主也可在任意时刻主动取；引擎自身不落盘） */
    checkpoint: function (reason) {
      var s = state.scene;
      return (s && s.ready) ? s.checkpointState(reason) : null;
    },

    /* ---- 决策面板（内容由宿主给，选择结果从 bridge.choiceResult 回传）---- */

    /** 三选一奖励：{ title, desc, cards, actions } */
    openRewardChoice: function (data) { return API.openChoicePanel('reward', data); },
    /** 诅咒抉择（深渊裂隙）：同上 */
    openCurseChoice: function (data) { return API.openChoicePanel('curse', data); },
    /** 事件面板 / 休整点：kind = 'event' | 'rest' */
    openEventPanel: function (kind, data) { return API.openChoicePanel(kind || 'event', data); },
    openChoicePanel: function (kind, data) {
      var s = state.scene;
      if (!s || !s.ready) return false;
      return s.openChoicePanel(kind, data);
    },
    closeChoicePanel: function (result) {
      var s = state.scene;
      if (!s || !s.ready) return false;
      return s.closeChoicePanel(result || null);
    },
    isChoiceOpen: function () { return !!(state.scene && state.scene.choiceOpen); },
    getChoiceCards: function () { return (state.scene && state.scene.choiceCards) || []; },

    /** 非战斗房间（商店 / 休整 / 事件）处理完：收尾并开放传送门 */
    finishRoomGoal: function () {
      var s = state.scene;
      if (!s || !s.ready) return false;
      return s.finishRoomGoal();
    },

    /* ---- 暂停菜单（画内）---- */
    openPauseMenu: function () {
      var s = state.scene;
      if (!s || !s.ready) return false;
      return s.openPauseMenu();
    },
    closePauseMenu: function () {
      var s = state.scene;
      if (!s || !s.ready) return false;
      return s.closePauseMenu();
    },
    isPaused: function () { return !!(state.scene && state.scene.pauseOpen); },

    /** 图鉴：打开 / 关闭（宿主按钮或触摸都能用） */`, 'API 主权接口块');

/* ---------- debug 扩展 ---------- */
rep(`        o.roomGoal = s.roomGoal ? { kind: s.roomGoal.kind, done: s.roomGoal.done } : null;
        o.room = s.roomNode ? { type: s.roomNode.type, col: s.roomNode.col, row: s.roomNode.row } : null;`,
`        o.roomGoal = s.roomGoal ? { kind: s.roomGoal.kind, done: s.roomGoal.done, awaiting: !!s.roomGoal.awaiting } : null;
        o.room = s.roomNode ? {
          type: s.roomNode.type, col: s.roomNode.col, row: s.roomNode.row,
          name: s.roomNode.name || null, payload: (s.roomNode.payload !== undefined) ? s.roomNode.payload : null
        } : null;
        // --- P1 交接状态：宿主主权 / 面板 / 遗物 / 脉冲 ---
        o.pauseOpen = !!s.pauseOpen;
        o.choiceOpen = !!s.choiceOpen;
        o.choiceKind = s.choiceKind || null;
        o.choiceCards = (s.choiceCards || []).map(function (c) { return c && c.id; });
        o.relics = (HOST.relics || []).map(function (r) { return (typeof r === 'string') ? r : (r && r.id); });
        o.relicFx = HOST.relicFx ? JSON.parse(JSON.stringify(HOST.relicFx)) : null;
        o.pulseProfile = HOST.pulse ? JSON.parse(JSON.stringify(HOST.pulse)) : null;
        o.pulse = {
          interval: s.pulseInterval ? s.pulseInterval() : null,
          leftMs: s.pulseAt ? Math.max(0, Math.round(s.pulseAt - s.time.now)) : null
        };
        o.floorRoomsCleared = s._floorRoomsCleared || 0;
        o.floorPlan = !!HOST.floorPlan;
        o.floorMapFromPlan = !!s.floorMap && !!s.floorMap.fromPlan;
        o.cursePool = HOST.cursePool ? HOST.cursePool.length : null;`, 'debug 扩展');

/* ---------- press 扩展 ---------- */
rep(`      if (action === 'hint') { return { text: s.hintText ? s.hintText.text : '' }; }
      return false;`,
`      // ===== P1 交接接口（宿主主权 / 决策面板 / 暂停 / 存档）测试辅助 =====
      if (action === 'pause') { return s.openPauseMenu(); }
      if (action === 'pauseClose') { return s.closePauseMenu(); }
      if (action === 'clickPause') {
        var wp = arguments[1];
        var pbtn = (s.panelButtons.pause || []).filter(function (b) { return b.action === wp; })[0];
        if (!pbtn) return false;
        return s.handleUiClick({ x: pbtn.x + pbtn.w / 2, y: pbtn.y, id: -6 });
      }
      if (action === 'choice') { return s.openChoicePanel(arguments[1] || 'reward', arguments[2] || null); }
      if (action === 'choiceClose') { return s.closeChoicePanel(null); }
      if (action === 'choiceCards') return (s.choiceCards || []).map(function (c) { return c && c.id; });
      if (action === 'clickChoice') {
        var cc = (s.panelButtons.choice || [])[arguments[1] || 0];
        if (!cc) return false;
        return s.handleUiClick({ x: cc.x + cc.w / 2, y: cc.y, id: -7 });
      }
      if (action === 'choiceState') return {
        open: !!s.choiceOpen, kind: s.choiceKind || null,
        cards: (s.choiceCards || []).map(function (c) { return c && c.id; }),
        buttons: (s.panelButtons.choice || []).map(function (b) { return b.action; })
      };
      if (action === 'finishGoal') { return s.finishRoomGoal(); }
      if (action === 'checkpoint') return s.checkpointState(arguments[1] || 'manual');
      if (action === 'roomPlan') return s.floorMap ? s.floorMap.nodes.map(function (n) { return n.type; }) : null;
      if (action === 'relics') return API.getRelics();
      if (action === 'pulseState') return {
        interval: s.pulseInterval(), leftMs: Math.max(0, Math.round(s.pulseAt - s.time.now)),
        floorRoomsCleared: s._floorRoomsCleared || 0
      };
      if (action === 'roomAction') return {
        kind: s.roomGoal ? s.roomGoal.kind : null,
        done: s.roomGoal ? !!s.roomGoal.done : null,
        awaiting: s.roomGoal ? !!s.roomGoal.awaiting : null
      };
      if (action === 'hint') { return { text: s.hintText ? s.hintText.text : '' }; }
      return false;`, 'press 扩展');

fs.writeFileSync(F, s);
console.log(fails ? `\n有 ${fails} 条未命中，已写回` : '\n全部命中，已写回');
