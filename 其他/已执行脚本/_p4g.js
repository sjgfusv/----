/* P4-4a：音频场景补齐（层间抉择；结局场景本来就有）
 *   AbyssAudio：SCENES 加 'choice'（复用现有音色，不做新曲）
 *   引擎：暴露 API.setBgmScene（宿主的合法入口）
 *   宿主：开「深渊裂隙」/ 结局面板时切场景
 * 用法：node 其他/_p4g.js
 */
const fs = require('fs');
const path = require('path');
const CRLF = '\r\n';
let fails = 0;

/* ① AbyssAudio：新增 choice 场景 */
{
  const F = path.join(__dirname, '..', 'AbyssAudio.js');
  let s = fs.readFileSync(F, 'utf8');
  const anchor = '        // 结局：空灵升华（舒缓琶音、无鼓点）';
  const ADD = [
    '        // 层间抉择（深渊裂隙）：用紧张和弦 + 持续低鸣，语气与「要交出什么代价」相配；',
    '        // 不做新曲，只调现有音色的编排（与 battle/boss 共用 CHORDS_TENSE）。',
    "        choice:  { barSteps: 8, stepDur: 0.58, chords: CHORDS_TENSE, pad: true, bass: 0.35, arpP: 0.28, hat: 0, drone: true  },",
    anchor
  ].join('\r\n');
  const n = s.split(anchor).length - 1;
  if (n !== 1) { console.log('!! AbyssAudio 锚点命中 ' + n); fails++; }
  else {
    // 按文件自身的行尾写回
    const nl = s.indexOf('\r\n') >= 0 ? CRLF : '\n';
    s = s.split(anchor).join(ADD.split('\r\n').join(nl));
    fs.writeFileSync(F, s);
    console.log('ok AbyssAudio 新增 choice 场景');
  }
}

/* ② 引擎：暴露 setBgmScene */
{
  const F = path.join(__dirname, '..', '战斗2D.js');
  let s = fs.readFileSync(F, 'utf8');
  const from = '    /** 无敌（作弊面板 / 开发者命令）。开着时 damageHero 直接免疫，不改任何数值 */';
  const to = [
    '    /**',
    '     * 切 BGM 场景（宿主的合法入口）',
    '     * 场景名见 AbyssAudio 的 SCENES：menu / explore / battle / boss / elite / mirror /',
    '     * shop / rest / choice（层间抉择）/ ending。传不认识的名字会被 AbyssAudio 忽略。',
    '     */',
    '    setBgmScene: function (scene) {',
    '      if (!scene) return false;',
    '      setBgmScene(String(scene));',
    '      return true;',
    '    },',
    '',
    from
  ].join(CRLF);
  const n = s.split(from).length - 1;
  if (n !== 1) { console.log('!! 引擎锚点命中 ' + n); fails++; }
  else {
    fs.writeFileSync(F, s.split(from).join(to));
    console.log('ok 引擎暴露 API.setBgmScene');
  }
}

/* ③ 宿主：抉择 / 结局时切场景 */
{
  const F = path.join(__dirname, '..', '经典2D.js');
  let s = fs.readFileSync(F, 'utf8');
  const rules = [
    ['宿主 bgm 辅助',
      `  function hasRelic(id) {`,
      `  /** 切 BGM 场景（面板氛围用）。引擎不认识的名字会被 AbyssAudio 忽略，不会报错 */
  function bgm(scene) {
    var e = engine();
    if (e && typeof e.setBgmScene === 'function') {
      try { e.setBgmScene(scene); } catch (err) { /* 忽略 */ }
    }
  }

  function hasRelic(id) {`],
    ['裂隙切 choice',
      `    log('深渊裂隙：弹出风险收益抉择（第 ' + s.floor + ' 层）');`,
      `    log('深渊裂隙：弹出风险收益抉择（第 ' + s.floor + ' 层）');
    bgm('choice');`],
    ['结局切 ending',
      `    log('到达楼层上限 → 弹结局面板（' + cards.length + ' 个可用结局）');`,
      `    log('到达楼层上限 → 弹结局面板（' + cards.length + ' 个可用结局）');
    bgm('ending');`],
    ['遗物/奖励面板用 shop 氛围',
      `    log('遗物三选一（' + reason + '）· 候选 ' + choices.length + ' 件');`,
      `    log('遗物三选一（' + reason + '）· 候选 ' + choices.length + ' 件');
    bgm('shop');`]
  ];
  for (const [label, from, to] of rules) {
    const n = s.split(from).length - 1;
    if (n !== 1) { console.log('!! ' + label + ' 命中 ' + n); fails++; continue; }
    s = s.split(from).join(to);
    console.log('ok ' + label);
  }
  fs.writeFileSync(F, s);
}

console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
