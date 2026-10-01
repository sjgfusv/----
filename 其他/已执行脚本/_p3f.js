/* P3-3d：引擎 debug() 暴露机制常量（验遗物用） */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '战斗2D.js');
const CRLF = '\r\n';
let s = fs.readFileSync(F, 'utf8');
const from = '        o.cursePool = HOST.cursePool ? HOST.cursePool.length : null;';
const to = [
  '        o.cursePool = HOST.cursePool ? HOST.cursePool.length : null;',
  '        // 机制常量：遗物就是靠改这些生效的（见 applyMechRelics）。',
  '        // 摆在这里是为了验遗物时能直接看数字，不用去猜某个窗口到底有没有被改。',
  '        o.mech = {',
  '          dodgePerfect: DODGE.perfect, dodgeInvuln: DODGE.invuln,',
  '          dodgeSharp: DODGE.sharp, dodgeSharpMult: Math.round(DODGE.sharpMult * 100) / 100,',
  '          dodgeAirDrag: Math.round(DODGE.airDrag * 100) / 100,',
  '          guardPerfect: GUARD.perfect, guardCounterMult: GUARD.counterMult,',
  '          guardShieldGain: GUARD.shieldGain,',
  '          chainWindow: CHAIN.window, chainSweepMult: Math.round(CHAIN.sweepMult * 100) / 100,',
  '          diveMult: DIVE.mult, diveBury: Math.round(DIVE.buryChance * 100) / 100,',
  '          staminaMax: STAMINA.max, staminaRegen: Math.round(STAMINA.regen),',
  '          furyKill: FURY.gainKill, rangedPierce: RANGED_ATTACK.ranger.pierce,',
  '          rangedSpeed: RANGED_ATTACK.ranger.speed',
  '        };'
].join(CRLF);
const n = s.split(from).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n + ' 次'); process.exit(1); }
fs.writeFileSync(F, s.split(from).join(to));
console.log('ok debug.mech 已加');
