/* P3-3b：行为型遗物钩子
 *   护盾共鸣 / 不朽图腾 / 命运轮盘 / 处决者+猎杀标记（斩杀线） / 血之饥渴 / 反击之刃语义分离
 * 用法：node 其他/_p3d.js
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '战斗2D.js');
const CRLF = '\r\n';
let s = fs.readFileSync(F, 'utf8');
let fails = 0;
function rep(label, from, to, expect) {
  const f = from.split('\n').join(CRLF);
  const t = to.split('\n').join(CRLF);
  const n = s.split(f).length - 1;
  const want = (expect == null) ? 1 : expect;
  if (n !== want) { console.log('!! ' + label + ' 命中 ' + n + '（期望 ' + want + '）'); fails++; return; }
  s = s.split(f).join(t);
  console.log('ok ' + label);
}

/* ---------- 1. 反击之刃与护盾共鸣的 key 分离 ---------- */
rep('1a counterBlade 用 guardShield',
`    counterBlade:    { counterMult: 1, shieldGain: 3 },       // 反击之刃：盾反 ×2→×3 并回 3 护盾`,
`    counterBlade:    { counterMult: 1, guardShield: 3 },      // 反击之刃：盾反 ×2→×3 并回 3 护盾（只作用于完美格挡）`);
rep('1b applyMechRelics 用 guardShield',
`    GUARD.shieldGain = Math.round(MECH_BASE.guardShieldGain + num('shieldGain', 0));`,
`    // 注意 key 是 guardShield（完美格挡给多少），不是 shieldGain（护盾共鸣的"所有来源 +2"）——
    // 两者若共用一个 key，完美格挡会吃到两次加成。
    GUARD.shieldGain = Math.round(MECH_BASE.guardShieldGain + num('guardShield', 0));`);

/* ---------- 2. 护盾共鸣：addShield 统一 +N ---------- */
rep('2 addShield 护盾共鸣',
`    addShield(n, tag) {
      var h = this.hero;
      h.shield += n;
      this.showFloat(h.x, h.y - 80, '+' + n + ' 护盾', UI.accent, 16);`,
`    addShield(n, tag) {
      var h = this.hero;
      // 遗物：护盾共鸣 —— 任何来源获得的护盾都额外 +N（药水 / 技能 / 格挡 / 魂晶一并生效）
      var gain = n + (n > 0 ? this.relicFx('shieldGain', 0) : 0);
      h.shield += gain;
      this.showFloat(h.x, h.y - 80, '+' + gain + ' 护盾', UI.accent, 16);`);

/* ---------- 3. 不朽图腾：致命伤保留 1 血（每层一次） ---------- */
rep('3 不朽图腾',
`      if (remain > 0) {
        this.hero.hp -= remain;
        this.showFloat(this.hero.x, this.hero.y - 62, '-' + fmt(remain), '#ff6b6b', 18);`,
`      if (remain > 0) {
        this.hero.hp -= remain;
        // 遗物：不朽图腾 —— 致命伤保留 1 血，每层一次（与经典内核的 hasTotem 同语义）
        if (this.hero.hp <= 0 && this.hasPerk('totem') && !this._totemUsedFloor) {
          this.hero.hp = 1;
          this._totemUsedFloor = true;
          this.showFloat(this.hero.x, this.hero.y - 116, '不朽图腾 · 保留 1 血', '#ffd76a', 18);
          sfx('levelUp');
        }
        this.showFloat(this.hero.x, this.hero.y - 62, '-' + fmt(remain), '#ff6b6b', 18);`);

rep('3b beginRun 重置图腾',
`      this._roomFirstHit = false; this._roomFirstKill = false;
      this.updateSkillHud();`,
`      this._roomFirstHit = false; this._roomFirstKill = false;
      this._totemUsedFloor = false;   // 不朽图腾：每层一次，新一局重置
      this.updateSkillHud();`);

rep('3c nextFloor 重置图腾',
`        this.floorMap = this.makeFloorMap(next);
        this._floorRoomsCleared = 0;   // 新一层：脉冲节拍从头计`,
`        this.floorMap = this.makeFloorMap(next);
        this._floorRoomsCleared = 0;   // 新一层：脉冲节拍从头计
        this._totemUsedFloor = false;  // 不朽图腾：每层一次`);

/* ---------- 4. 命运轮盘：每清一房随机收益 / 代价 ---------- */
rep('4 命运轮盘',
`      if (first) {
        // 本层已清房间数 +1：脉冲节拍靠它加速（规划 §3.12）
        this._floorRoomsCleared = (this._floorRoomsCleared || 0) + 1;`,
`      if (first) {
        // 遗物：命运轮盘 —— 每清一个房间抛一次：多半给金币，偶尔咬你一口
        if (this.hasPerk('fateWheel')) {
          if (Math.random() < 0.65) {
            var wheelGold = ri(2, 8);
            this.points += wheelGold;
            this.showFloat(this.hero.x, this.hero.y - 104, '命运轮盘 +' + wheelGold + ' 金币', '#ffd76a', 16);
          } else {
            this.hero.hp = Math.max(1, this.hero.hp - 1);
            this.showFloat(this.hero.x, this.hero.y - 104, '命运轮盘 -1 生命', UI.danger, 16);
          }
        }
        // 本层已清房间数 +1：脉冲节拍靠它加速（规划 §3.12）
        this._floorRoomsCleared = (this._floorRoomsCleared || 0) + 1;`);

/* ---------- 5. 斩杀线（处决者 / 猎杀标记） ---------- */
rep('5 斩杀线',
`      // 斩杀
      if (!fromThorn && this.hero.execute > 0 && (e.hp / e.maxHp) <= 0.25 && Math.random() < (this.hero.execute / 100)) {`,
`      // 斩杀：线上限 25%，遗物可以抬（处决者 +10%，猎杀标记直接设成 50%）
      var exeLine = this.relicFx('executeSet', 0) > 0
        ? this.relicFx('executeSet', 0)
        : (0.25 + this.relicFx('executeBonus', 0));
      if (!fromThorn && this.hero.execute > 0 && (e.hp / e.maxHp) <= exeLine && Math.random() < (this.hero.execute / 100)) {`);

/* ---------- 6. 血之饥渴：吸血等级 +1 ---------- */
rep('6 血之饥渴',
`      if (this.hero.vampire > 0) {
        this.healHero(Math.max(1, Math.round(dmg * Math.min(0.5, this.hero.vampire * 0.05))), false);`,
`      var vampLv = this.hero.vampire + this.relicFx('vampireExtra', 0);   // 遗物：血之饥渴
      if (vampLv > 0) {
        this.healHero(Math.max(1, Math.round(dmg * Math.min(0.5, vampLv * 0.05))), false);`);

fs.writeFileSync(F, s);
console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
