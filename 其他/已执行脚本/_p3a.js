/* P3-1a：引擎支持宿主下发敌人属性函数（数值统一的落点）
 * 用法：node 其他/_p3a.js
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

/* 1) HOST 加 enemyScaler */
rep('HOST.enemyScaler',
`    pulse: null        // setPulseProfile：null = 按难度取 PULSE_BY_DIFFICULTY
  };`,
`    pulse: null,       // setPulseProfile：null = 按难度取 PULSE_BY_DIFFICULTY
    enemyScaler: null  // setEnemyScaler：null = 用引擎内置曲线；宿主接了就用宿主的（数值统一）
  };`);

/* 2) API.setEnemyScaler */
rep('API.setEnemyScaler',
`    getPulseInterval: function () {`,
`    /**
     * 敌人属性函数由宿主下发（数值统一的唯一落点）
     * ------------------------------------------------------------
     * 回调入参：{ key, tier, baseHp, baseAtk, floor, roomType }
     *   baseHp / baseAtk 是该敌人在 ENEMY_TYPES 里的**原始基数** ——
     *   宿主据此保留引擎内部的"种类相对强弱"，只把**量级**换成自己的公式。
     * 返回 { hp, atk }；返回假值或抛异常都会自动退回引擎内置曲线
     * （刷怪是核心路径，不能因为宿主算错就一只怪都不出）。
     */
    setEnemyScaler: function (fn) {
      HOST.enemyScaler = (typeof fn === 'function') ? fn : null;
      return !!HOST.enemyScaler;
    },

    getPulseInterval: function () {`);

/* 3) Scene.enemyStats */
rep('Scene.enemyStats',
`    spawnEnemy(key, x, y, floor) {
      var def = ENEMY_TYPES[key];
      if (!def) return null;`,
`    /**
     * 敌人属性：优先问宿主（经典公式），宿主没接就退回引擎内置曲线
     * 内置曲线保留原样：hp = def.hp×(1+0.2(f−1))、atk = def.atk×(1+0.15(f−1))
     */
    enemyStats(def, floor, key) {
      if (HOST.enemyScaler) {
        try {
          var r = HOST.enemyScaler({
            key: key, tier: def.tier, baseHp: def.hp, baseAtk: def.atk,
            floor: floor,
            roomType: this.roomNode ? this.roomNode.type : null
          });
          if (r && r.hp > 0) {
            return {
              hp: Math.round(r.hp),
              atk: Math.max(1, Math.round(r.atk > 0 ? r.atk : def.atk))
            };
          }
        } catch (e) {
          console.warn('[战斗2D] 宿主的敌人属性函数出错，退回内置曲线：', e);
        }
      }
      var scale = 1 + (floor - 1) * 0.2;
      return {
        hp: Math.round(def.hp * scale),
        atk: Math.round(def.atk * (1 + (floor - 1) * 0.15))
      };
    }

    spawnEnemy(key, x, y, floor) {
      var def = ENEMY_TYPES[key];
      if (!def) return null;`);

/* 4) spawnEnemy 用 enemyStats */
rep('spawnEnemy 用 enemyStats',
`      var scale = 1 + (floor - 1) * 0.2;
      var hp = Math.round(def.hp * scale);

      var e = {
        key: key, def: def, sprite: spr, name: def.name, tier: def.tier, behavior: def.behavior,
        hp: hp, maxHp: hp, atk: Math.round(def.atk * (1 + (floor - 1) * 0.15)),`,
`      var stats = this.enemyStats(def, floor, key);
      var hp = stats.hp;

      var e = {
        key: key, def: def, sprite: spr, name: def.name, tier: def.tier, behavior: def.behavior,
        hp: hp, maxHp: hp, atk: stats.atk,`);

/* 5) 镜像房的硬覆写让位给宿主 */
rep('镜像房覆写加守卫',
`        if (e && key === 'mimic' && roomType === 'mirror') {
          e.maxHp = Math.round(Math.max(36, self.hero.attack * 3 + self.hero.maxHp * 0.45));
          e.hp = e.maxHp;
          e.atk = Math.max(6, Math.round(self.hero.attack * 0.6));
        }`,
`        // 镜像房按玩家属性定标：宿主接了 enemyScaler 就由它算（turn 里 tier==='mirror'），
        // 这里的硬覆写只在没有宿主时兜底 —— 否则会把宿主算好的数值又盖掉。
        if (e && key === 'mimic' && roomType === 'mirror' && !HOST.enemyScaler) {
          e.maxHp = Math.round(Math.max(36, self.hero.attack * 3 + self.hero.maxHp * 0.45));
          e.hp = e.maxHp;
          e.atk = Math.max(6, Math.round(self.hero.attack * 0.6));
        }`);

fs.writeFileSync(F, s);
console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
