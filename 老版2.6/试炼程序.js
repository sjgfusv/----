// 试炼永久解锁存储键
const TRIAL_UNLOCKS_KEY = 'abyss_trial_unlocks';

// 诅咒池
const TRIAL_CURSES = [
  { name: '脆弱', description: '每回合减少2点护盾', apply: (trial) => { trial.player.shield = Math.max(0, trial.player.shield - 2); } },
  { name: '吸血反噬', description: '每次攻击后自身损失1点生命', apply: (trial) => { /* 在攻击时处理 */ } },
  { name: '荆棘诅咒', description: '受到攻击时额外受到1点伤害', apply: (trial) => { /* 在敌人攻击时处理 */ } },
  { name: '药水衰减', description: '药水治疗效果减半', apply: (trial) => { /* 药水效果减半 */ } },
  { name: '护甲腐蚀', description: '每回合失去1点护盾', apply: (trial) => { /* 每回合失去1护盾 */ } },
  { name: '虚弱', description: '每回合攻击力-1（最低0）', apply: (trial) => { trial.player.attack = Math.max(0, trial.player.attack - 1); } },
  { name: '迟钝', description: '每回合闪避率-5%（最低0）', apply: (trial) => { trial.dodgeLevel = Math.max(0, (trial.dodgeLevel || 0) - 1); } },
  { name: '生命流失', description: '每回合失去1点生命（无视护盾）', apply: (trial) => { trial.player.hp = Math.max(1, trial.player.hp - 1); } },
  { name: '易伤', description: '受到伤害+2', apply: (trial) => { /* 在敌人攻击时处理 */ } },
  { name: '贪婪', description: '战斗胜利试炼点减半', apply: (trial) => { /* 在击败敌人时处理 */ } },
];

// ===== 全局状态引用（由主程序注入） =====
let _state = null;
let _heroOptions = [];
let _addLog = null;
let _showToast = null;
let _openEncyclopediaModal = null;
let _startTutorial = null;
let _openConditionsModal = null;
let _manualSave = null;
let _deleteSave = null;
let _initGame = null;

// 初始化模块，注入依赖
function initTrialModule(dependencies) {
  _state = dependencies.state;
  _heroOptions = dependencies.heroOptions;
  _addLog = dependencies.addLog;
  _showToast = dependencies.showToast;
  _openEncyclopediaModal = dependencies.openEncyclopediaModal;
  _startTutorial = dependencies.startTutorial;
  _openConditionsModal = dependencies.openConditionsModal;
  _manualSave = dependencies.manualSave;
  _deleteSave = dependencies.deleteSave;
  _initGame = dependencies.initGame;
  // 递归引用自身函数（需提前声明）
}

// ===== 工具函数 =====
function loadTrialUnlocks() {
  try {
    const data = localStorage.getItem(TRIAL_UNLOCKS_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      // 确保新字段存在
      return {
        attackBonus: parsed.attackBonus || 0,
        hpBonus: parsed.hpBonus || 0,
        unlockedRelics: parsed.unlockedRelics || [],
        thornBonus: parsed.thornBonus || 0,
        vampireBonus: parsed.vampireBonus || 0,
        critDamageBonus: parsed.critDamageBonus || 0,
        pointRateBonus: parsed.pointRateBonus || 0,
        purchaseCounts: parsed.purchaseCounts || {},
      };
    }
  } catch (e) {}
  return { attackBonus: 0, hpBonus: 0, unlockedRelics: [], thornBonus: 0, vampireBonus: 0, critDamageBonus: 0, pointRateBonus: 0, purchaseCounts: {} };
}

function saveTrialUnlocks(unlocks) {
  localStorage.setItem(TRIAL_UNLOCKS_KEY, JSON.stringify(unlocks));
}

/* ============================================================
   深渊回响：试炼产出回流经典模式
   ------------------------------------------------------------
   在这之前，试炼是一个「打完就归零」的沙盒：exitTrial() 会把玩家状态
   整体还原，试炼里赚的点数、打的层数一样都带不回来，所以玩起来像两个游戏。
   现在试炼的成绩会折算成经典模式的金币与经验带出来：

     金币 = 试炼点数 × 2 × 层数倍率 ×（主动撤离 ? 1.25 : 1）
     经验 = 试炼点数 × 1 × 层数倍率 ×（主动撤离 ? 1.25 : 1）
     层数倍率 = 1 + (到达层数 - 1) × 0.15

   产出与成绩挂钩，形成一组「稳 vs 贪」的抉择：
     · 贪：继续深入 → 层数倍率线性上涨
     · 稳：活着撤离 → 额外 ×1.25（战死不打折，但层数就此定格）
   另外首次到达里程碑层数会一次性发放大额奖励，跨局永久只领一次。
   ============================================================ */
const TRIAL_RECORDS_KEY = 'abyss_trial_records';

const TRIAL_REWARD = {
  goldPerPoint: 2,      // 每 1 试炼点 → 2 金币
  xpPerPoint: 1,        // 每 1 试炼点 → 1 经验
  floorStep: 0.15,      // 每深入一层，产出倍率 +15%
  extractBonus: 1.25    // 主动撤离（活着走出来）的额外倍率
};

// 里程碑：首次到达该层时一次性发放（跨局永久，只领一次）
const TRIAL_MILESTONES = [
  { floor: 3,  gold: 60,   xp: 30,  title: '深渊新兵' },
  { floor: 5,  gold: 120,  xp: 60,  title: '深渊常客' },
  { floor: 8,  gold: 220,  xp: 110, title: '深渊猎人' },
  { floor: 10, gold: 350,  xp: 180, title: '深渊行者' },
  { floor: 15, gold: 600,  xp: 320, title: '深渊征服者' },
  { floor: 20, gold: 1000, xp: 550, title: '深渊主宰' }
];

function loadTrialRecords() {
  try {
    const data = localStorage.getItem(TRIAL_RECORDS_KEY);
    if (data) {
      const p = JSON.parse(data) || {};
      return {
        bestFloor: p.bestFloor || 0,
        runs: p.runs || 0,
        evacuations: p.evacuations || 0,
        deaths: p.deaths || 0,
        kills: p.kills || 0,
        points: p.points || 0,
        gold: p.gold || 0,
        xp: p.xp || 0,
        claimed: Array.isArray(p.claimed) ? p.claimed : []
      };
    }
  } catch (e) { /* 记录损坏就当空记录 */ }
  return { bestFloor: 0, runs: 0, evacuations: 0, deaths: 0, kills: 0, points: 0, gold: 0, xp: 0, claimed: [] };
}

function saveTrialRecords(rec) {
  try { localStorage.setItem(TRIAL_RECORDS_KEY, JSON.stringify(rec)); } catch (e) { /* 忽略 */ }
}

/**
 * 计算本次试炼的产出明细（纯计算，不落地，可反复调用做预览）
 * opts: { floor, points, kills, extracted }
 */
function computeTrialReward(opts) {
  opts = opts || {};
  const floor = Math.max(1, Math.floor(opts.floor || 1));
  const points = Math.max(0, Math.round(opts.points || 0));
  const kills = Math.max(0, Math.round(opts.kills || 0));
  const extracted = !!opts.extracted;

  const floorMult = 1 + (floor - 1) * TRIAL_REWARD.floorStep;
  const mult = floorMult * (extracted ? TRIAL_REWARD.extractBonus : 1);
  const gold = Math.round(points * TRIAL_REWARD.goldPerPoint * mult);
  const xp = Math.round(points * TRIAL_REWARD.xpPerPoint * mult);

  const rec = loadTrialRecords();
  const freshMilestones = TRIAL_MILESTONES.filter(m => floor >= m.floor && rec.claimed.indexOf(m.floor) < 0);
  const milestoneGold = freshMilestones.reduce((s, m) => s + m.gold, 0);
  const milestoneXp = freshMilestones.reduce((s, m) => s + m.xp, 0);

  return {
    floor: floor,
    points: points,
    kills: kills,
    extracted: extracted,
    floorMult: floorMult,
    mult: mult,
    gold: gold,
    xp: xp,
    milestones: freshMilestones,
    milestoneGold: milestoneGold,
    milestoneXp: milestoneXp,
    totalGold: gold + milestoneGold,
    totalXp: xp + milestoneXp,
    isNewBest: floor > rec.bestFloor,
    bestFloor: Math.max(rec.bestFloor, floor)
  };
}

/**
 * 落地：把产出写进经典模式并更新试炼记录。
 * 必须在 exitTrial() 还原完 _state.player 之后调用，否则会被备份覆盖。
 */
function applyTrialReward(reward) {
  if (!reward) return null;
  const rec = loadTrialRecords();
  rec.runs += 1;
  rec.kills += reward.kills || 0;
  rec.points += reward.points || 0;
  if (reward.extracted) rec.evacuations += 1; else rec.deaths += 1;
  if (reward.floor > rec.bestFloor) rec.bestFloor = reward.floor;
  (reward.milestones || []).forEach(m => {
    if (rec.claimed.indexOf(m.floor) < 0) rec.claimed.push(m.floor);
  });
  rec.gold += reward.totalGold || 0;
  rec.xp += reward.totalXp || 0;
  saveTrialRecords(rec);

  if (_state.player) {
    _state.player.gold = (_state.player.gold || 0) + (reward.totalGold || 0);
    _state.player.xp = (_state.player.xp || 0) + (reward.totalXp || 0);
  }
  // 存档由调用方（exitTrial 收尾）统一触发 —— 这里只改状态，避免在试炼尚未收尾时写盘
  return reward;
}

/** 试炼入口按钮上的常驻信息：最深记录 + 累计产出 */
let _trialEntryCache = null;
function renderTrialEntryInfo() {
  const btn = document.getElementById('trialButton');
  if (!btn) return;
  const rec = loadTrialRecords();
  // render() 每帧级别地被调用，记录没变就别反复写 DOM
  const key = rec.bestFloor + '|' + rec.runs + '|' + rec.gold + '|' + rec.xp;
  if (_trialEntryCache === key) return;
  _trialEntryCache = key;
  btn.textContent = rec.bestFloor > 0 ? `进入试炼 · 最深 ${rec.bestFloor} 层` : '进入试炼';
  const tip = rec.runs > 0
    ? `已进行 ${rec.runs} 次深潜 · 撤离 ${rec.evacuations} / 战死 ${rec.deaths}\n` +
      `累计带回 ${rec.gold} 金币、${rec.xp} 经验`
    : '深渊深潜：层数越深产出越高，活着撤离额外 +25%';
  btn.title = tip;
}

// ===== 试炼点数获取率：受「试炼学精要」永久加成影响 =====
function getTrialPointRate() {
  const unlocks = loadTrialUnlocks();
  return 1 + (unlocks.pointRateBonus || 0) / 100;
}

// ===== 试炼最大回合数：随难度变化，支持设置面板自定义，下限 30 =====
function getTrialMaxRounds() {
    const DIFF_ROUNDS = { easy: 45, normal: 38, hard: 33, hell: 30 };
    const diff = (_state && _state.difficulty) || 'normal';
    let rounds = DIFF_ROUNDS[diff] !== undefined ? DIFF_ROUNDS[diff] : 35;

    // 自定义难度面板的值优先
    const cd = (_state && _state.customDifficulty) || {};
    const custom = parseInt(cd.trialMaxRounds, 10);
    if (!isNaN(custom) && custom >= 1) {
        rounds = custom;
    }

    return Math.max(1, rounds);   // 下限钳制保底
}


/**
 * 套用试炼商店买的永久强化。
 *
 * 生效范围：**只在试炼内** —— 与图鉴里「试炼永久加成」的说明一致。
 * 经典模式的成长由「深渊回响」产出（金币 / 经验）承担，两条线各管一段，不再互相污染。
 *
 * 旧实现直接改 _state.player.attack / _state.thornLevel / _state.vampireLevel / _state.critDamage：
 *   · _state.player 三项会被 _backup.player 覆盖回来，等于白加；
 *   · 后三项不在 _backup 里、exitTrial 也不还原 → **每进一次试炼就永久累加一次**，
 *     而且经典战斗会真的读到这些值（与图鉴文案矛盾）。
 * 现在一律写在试炼副本上，并且只在副本存在时生效。
 */
function applyTrialUnlocks() {
  const t = _state && _state.trial;
  if (!t || !t.player) return;
  const unlocks = loadTrialUnlocks();
  if (unlocks.attackBonus) {
    t.player.attack += unlocks.attackBonus;
  }
  if (unlocks.hpBonus) {
    t.player.maxHp += unlocks.hpBonus;
    t.player.hp += unlocks.hpBonus;
  }
  if (unlocks.thornBonus) {
    t.thornLevel = (t.thornLevel || 0) + unlocks.thornBonus;
  }
  if (unlocks.vampireBonus) {
    t.vampireLevel = (t.vampireLevel || 0) + unlocks.vampireBonus;
  }
  if (unlocks.critDamageBonus) {
    t.critDamage = (t.critDamage || 150) + unlocks.critDamageBonus;
  }
}

function applyTrialRelicEffect(relic) {
  const t = _state.trial;
  const label = relic.label;
  switch (label) {
    case '试炼之刃':
      t.player.attack += 2;
      break;
    case '深渊之心':
      t.hasLifeShield = true;
      break;
    case '试炼护盾':
      t.hasTrialShield = true;
      break;
    case '试炼印记':
      t.hasTrialPoint = true;
      break;
    case '试炼生命':
      t.hasTrialHeal = true;
      break;
    case '试炼利刃':
      t.player.attack += 1;
      break;
    case '试炼幸运':
      if ((t.luckyLevel || 0) < 10) {
        t.luckyLevel = Math.min((t.luckyLevel || 0) + 0.5, 10);
        _addLog(`试炼幸运：暴击率提升 5%，当前 ${(t.luckyLevel * 10).toFixed(0)}%`);
      } else {
        _addLog('暴击率已达 100%，试炼幸运无效');
      }
      break;
    case '丰饶印记':
      t.hasTrialSeed = true;
      break;
    case '契约印记':
      t.hasFloorContract = true;
      break;
    default:
      _addLog(`试炼模式暂未适配遗物 "${label}"，但已添加到列表。`);
  }
}

// ===== 试炼核心函数 =====
function startTrial() {
  if (!_state) {
    // _showToast 与 _state 都是 initTrialModule 注入的，所以「未初始化」时它同样是 null。
    // 直接调用会抛 TypeError，把真正的原因（模块没初始化）盖掉 —— 排查时会以为
    // 是 _showToast 的问题。先判断再调用。
    if (typeof _showToast === 'function') _showToast('试炼模块未初始化，请重新开始游戏');
    console.error('试炼模块未初始化，_state 为 null（initTrialModule 尚未注入依赖）');
    return;
  }
  if (_state.trial.active) return;
  if (!_state.hero) {
    _showToast('请先在经典模式中选择英雄！');
    return;
  }
  if (_state.availableBonuses && _state.availableBonuses.length > 0) {
    _showToast('请先完成增益选择再进入试炼！');
    return;
  }

  // 备份原始状态
  _state.trial._backup = {
    player: JSON.parse(JSON.stringify(_state.player)),
    relics: JSON.parse(JSON.stringify(_state.relics)),
    bonuses: JSON.parse(JSON.stringify(_state.bonuses)),
    hero: _state.hero,   // 同理用引用：JSON 克隆会把 skill.active.execute 丢掉，
                         // 退出试炼时装回去的就会是一个「有按钮但点了没反应」的英雄
    // 经典模式的「位置」与「环境」：试炼是副本，进出不该改变主线走到哪了。
    // 这里用引用而不是深拷贝 —— environment / combat 里带钩子函数，JSON 克隆会把它们丢掉；
    // 而试炼只是整体替换这些字段、不会就地修改，所以引用是安全的。
    mode: _state.mode,
    currentRoom: _state.currentRoom,
    combat: _state.combat,
    environment: _state.environment,
  };
  if (window.AbyssAudio) AbyssAudio.setScene('explore');
  // 复制数据到试炼
  const p = _state.player;
  _state.trial.player = {
    name: p.name,
    hp: p.hp,
    maxHp: p.maxHp,
    attack: p.attack,
    shield: 0,
    gold: 0,
    potions: p.potions,
    strengthPotions: p.strengthPotions,
    xp: 0,
    tempAttackBonus: 0,   // ← 新增：临时攻击加成
  };
  _state.trial.luckyLevel = _state.luckyLevel || 0;
  _state.trial.critDamage = _state.critDamage || 150;
  _state.trial.thornLevel = _state.thornLevel || 0;
  _state.trial.vampireLevel = _state.vampireLevel || 0;
  _state.trial.hasLifeShield = _state.hasLifeShield || false;
  _state.trial.hasDoubleGold = _state.hasDoubleGold || false;
  _state.trial.hasExpBoost = _state.hasExpBoost || false;
  _state.trial.hasAncientBless = _state.hasAncientBless || false;
  _state.trial.dodgeLevel = _state.dodgeLevel || 0;
  _state.trial.comboLevel = _state.comboLevel || 0;
  _state.trial.executeLevel = _state.executeLevel || 0;
  _state.trial.comboDamageBonus = _state.comboDamageBonus || 0;
  _state.trial.executeThreshold = _state.executeThreshold || 0.3;
  _state.trial.hasFirstAttackCombo = _state.hasFirstAttackCombo || false;
  _state.trial.hasTotem = _state.hasTotem || false;
  _state.trial.hasKillScythe = _state.hasKillScythe || false;
  _state.trial.hasFateWheel = _state.hasFateWheel || false;
  _state.trial.hasShadowDeal = _state.hasShadowDeal || false;
  _state.trial.pendingAttackBoost = 0;
  // 试炼永久强化落在**副本**上（见 applyTrialUnlocks 注释）。
  // 必须等副本建好之后再套用；旧代码是在复制之前改 _state.player 再靠复制带进来，
  // 那条路径会把加成留在经典模式里。
  applyTrialUnlocks();
  _state.trial.heroSkillUsed = false;
  _state.trial.heroSkillBonus = 0;
  _state.trial.heroPendingHeal = 0;
  _state.trial.isFirstAttack = true;
  _state.trial.relics = _state.relics.map(r => ({ ...r }));
  // 应用试炼商店解锁的遗物
  const unlocks = loadTrialUnlocks();
  const trialRelicMap = {
    'trial_blade': { label: '试炼之刃', description: '攻击 +2', rarity: 'rare' },
    'abyss_heart': { label: '深渊之心', description: '每回合恢复1生命', rarity: 'rare' },
    'trial_shield': { label: '试炼护盾', description: '每层开始获得3护盾', rarity: 'rare' },
    'trial_point':  { label: '试炼印记', description: '战斗胜利额外+1试炼点', rarity: 'rare' },
    'trial_heal':   { label: '试炼生命', description: '每层开始恢复2生命', rarity: 'rare' },
    'trial_attack': { label: '试炼利刃', description: '试炼中攻击+1', rarity: 'rare' },
    'trial_lucky':  { label: '试炼幸运', description: '试炼中暴击率+5%', rarity: 'rare' },
    'trial_seed':   { label: '丰饶印记', description: '进入试炼时获得8试炼点', rarity: 'rare' },
    'trial_contract': { label: '契约印记', description: '每层开始获得1试炼点', rarity: 'rare' },
  };
  unlocks.unlockedRelics.forEach(id => {
    if (trialRelicMap[id]) {
      const relic = trialRelicMap[id];
      _state.trial.relics.push({ ...relic });
      applyTrialRelicEffect(relic);
    }
  });
  _state.trial.bonuses = _state.bonuses.map(b => ({ ...b }));
  if (_state.hero) {
    const heroCopy = JSON.parse(JSON.stringify(_state.hero));
    const originalHero = _heroOptions.find(h => h.id === _state.hero.id);
    if (originalHero) {
      heroCopy.skill = {
        name: originalHero.skill.name,
        description: originalHero.skill.description,
        onCombatStart: originalHero.skill.onCombatStart,
        onAttack: originalHero.skill.onAttack,
        onDefend: originalHero.skill.onDefend,
        onVictory: originalHero.skill.onVictory,
        active: originalHero.skill.active ? {
          name: originalHero.skill.active.name,
          description: originalHero.skill.active.description,
          execute: originalHero.skill.active.execute
        } : undefined
      };
    }
    _state.trial.hero = heroCopy;
  } else {
    _state.trial.hero = null;
  }

  // 初始化进度
  _state.trial.floor = 1;
  _state.trial.roomIndex = 0;
  _state.trial.rooms = generateTrialRooms(1);
  _state.trial.currentRoom = null;
  _state.trial.combat = null;
  _state.trial.mode = 'trial';
  _state.trial.rounds = 0;
  _state.trial.maxRounds = getTrialMaxRounds();
  _state.trial.points = 0;
  _state.trial.pointRateCarry = 0;
  if (_state.trial.hasTrialSeed) {
    _state.trial.points += 8;
    _addLog('丰饶印记：开局获得 8 试炼点');
  }
  _state.trial.curses = [];
  _state.trial.fury = 0;
  _state.trial.gameOver = false;
  _state.trial.endReason = '';
  _state.trial.active = true;
  _state.trial.hourglassUsed = false;
  _state.trial._realtimeTextMode = false;

  _addLog(`进入深渊试炼！你将在${_state.trial.maxRounds}回合内尽可能击败更多敌人。`);
  _addLog('每层会扣除3点生命，并受到诅咒影响。');
  _state.trial.heroSkillUsed = false;

  // 显示试炼界面，隐藏经典界面
  const screen = document.getElementById('trialScreen');
  if (screen) screen.classList.remove('hidden');
  const classicTopbar = document.querySelector('.topbar');
  if (classicTopbar) classicTopbar.style.display = 'none';
  // ===== 隐藏经典模式容器 =====
  const appShell = document.querySelector('.app-shell');
  if (appShell) appShell.style.display = 'none';

  // ===== 启动全屏实时战斗（取代回合制） =====
  // force=true：一次就把四条渲染路径走满（标称 WebGL / Canvas / 极简 WebGL / 极简 Canvas）。
  // 苹果设备上「第一次建 context 失败、第二次就好了」很常见，所以失败后
  // _realtimeTryStart 还会自动再试三次；期间显示「正在启动」而不是回退告示。
  _resetRealtimeRetry();
  const bootResult = _realtimeTryStart(true, true);
  if (bootResult === 'retrying') {
    // 自动重试期间玩家看到的是 2D 舞台上的「正在启动」提示，文字界面先不铺：
    // 铺了就得推进房间 / 扣层数血，万一随后 2D 又起来了就是双重推进。
  } else if (bootResult === 'failed') {
    _realtimeGiveUp();
  }
}

// 回退路径：绑定回合制操作按钮（仅在 2D 不可用时使用）
function bindLegacyTrialButtons() {
  const actionArea = document.getElementById('trialActionArea');
  if (actionArea && !actionArea.dataset.trialBound) {
    actionArea.addEventListener('click', function(e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action) {
        Trial.handleAction(action);
      }
    });
    actionArea.dataset.trialBound = 'true';
  }

  const furyBtn = document.getElementById('trialFuryBurstBtn');
  if (furyBtn && !furyBtn.dataset.trialBound) {
    furyBtn.addEventListener('click', function() {
      Trial.handleAction('fury-burst');
    });
    furyBtn.dataset.trialBound = 'true';
  }
}

function generateTrialRooms(floor) {
    const rooms = [];
    for (let i = 0; i < 3; i++) {
        let type = 'enemy';
        if (i === 2) {
            type = 'boss';
        } else if (i === 1) {
            // 第二个房间：50% 精英，30% 镜像，20% 普通敌人
            const roll = Math.random();
            if (roll < 0.5) type = 'elite';
            else if (roll < 0.8) type = 'mirror';
            else type = 'enemy';
        } else {
            // 第一个房间：50% 普通敌人，50% 镜像
            type = Math.random() < 0.5 ? 'enemy' : 'mirror';
        }
        rooms.push({ type });
    }
    return rooms;
}

function resolveTrialRoom() {
  _addLog('试炼中遇到未知房间，跳过。');
  _state.trial.roomIndex++;
  enterTrialRoom();
}

function enterTrialRoom() {
  const trial = _state.trial;
  if (trial.gameOver) return;
  trial.currentRoom = trial.rooms[trial.roomIndex];
  if (!trial.currentRoom) {
    nextTrialFloor();
    return;
  }
  if (trial.currentRoom.type === 'enemy' || trial.currentRoom.type === 'elite' || trial.currentRoom.type === 'boss' || trial.currentRoom.type === 'mirror') {
    startTrialCombat();
  } else {
    trial.mode = 'trialEvent';
    resolveTrialRoom();
  }
}

function nextTrialFloor() {
  const trial = _state.trial;
  trial.player.hp = Math.max(1, trial.player.hp - 3);
  _addLog(`深渊侵蚀，扣除3点生命，剩余 ${trial.player.hp}/${trial.player.maxHp}`);
  const curse = pickRandomCurse();
  trial.curses.push(curse);
  _addLog(`获得诅咒：${curse.name}`);
  if (trial.hasFloorContract) {
    trial.points += 1;
    _addLog('契约印记：每层开始获得 1 试炼点');
  }
  
  // 试炼护盾：每层开始获得 3 点护盾
  if (trial.hasTrialShield) {
    trial.player.shield += 3;
    _addLog('试炼护盾：获得 3 点护盾');
  }
  if (trial.hasTrialHeal) {
    trial.player.hp = Math.min(trial.player.maxHp, trial.player.hp + 2);
    _addLog('试炼生命：恢复 2 点生命');
  }
  
  trial.floor++;
  if (window.AbyssAudio) AbyssAudio.sfx('floor');
  // ===== 生成新环境效果 =====
  _state.environment = generateEnvironmentEffect(_state.trial.floor, _state.difficulty);
  const envDesc = _state.environment.displayValue ? 
    `${_state.environment.name} - ${_state.environment.description} (${_state.environment.displayValue})` :
    `${_state.environment.name} - ${_state.environment.description}`;
  _addLog(`当前楼层环境效果：${envDesc}`);
  
  trial.roomIndex = 0;
  trial.rooms = generateTrialRooms(trial.floor);
  enterTrialRoom();
  renderTrialUI();
}

function pickRandomCurse() {
  const pool = TRIAL_CURSES.filter(c => !_state.trial.curses.some(ex => ex.name === c.name));
  if (pool.length === 0) return TRIAL_CURSES[Math.floor(Math.random() * TRIAL_CURSES.length)];
  return pool[Math.floor(Math.random() * pool.length)];
}

function applyTrialCurses() {
  const trial = _state.trial;
  trial.curses.forEach(curse => {
    if (curse.apply) {
      curse.apply(trial);
      if (curse.name === '脆弱') {
        _addLog(`诅咒“脆弱”生效，护盾减少2点，当前护盾 ${trial.player.shield}`);
      }
    }
  });
}

// ===== 清除试炼战斗临时加成（所有战斗结束出口统一调用） =====
function clearTrialTempBonuses() {
    const trial = _state.trial;
    if (trial.player) {
        trial.player.tempAttackBonus = 0;
        trial.player.luckyBonus = 0;
        trial.player.critDamageBonus = 0;
        trial.player.comboBonus = 0;
        trial.player.dodgeBonus = 0;
        trial.player.attackPercentMod = 1;
        // 缓慢凋零：恢复战斗开始时的生命上限
        if (trial.combat && trial.combat.playerMaxHpSnapshot != null) {
            trial.player.maxHp = trial.combat.playerMaxHpSnapshot;
            trial.player.hp = Math.min(trial.player.hp, trial.player.maxHp);
        }
    }
    if (trial.combat && trial.combat.enemy) {
        const e = trial.combat.enemy;
        e.tempAttackBonus = 0; e.dodgeBonus = 0; e.critBonus = 0;
        e.critDamageBonus = 0; e.comboBonus = 0;
    }
}

function startTrialCombat() {
    const trial = _state.trial;
    const room = trial.currentRoom;
    const roomType = room ? room.type : 'enemy';
    const floor = trial.floor;
    const base = floor * 2 + 4;
    const extraLevel = Math.max(0, floor - 10);
    const extraPerLevel = 0.3; // 试炼固定倍率

    // ===== 辅助函数：生成基础敌人属性 =====
    function generateBaseEnemy(hpBase, atkBase, isBoss, isElite) {
        const hp = Math.max(1, Math.round(hpBase));
        const atk = Math.max(1, Math.round(atkBase));
        const extraMult = isBoss ? 0.8 : (isElite ? 0.5 : 0.3);
        const thorn = Math.min(5, Math.round(extraLevel * extraMult * 0.5));
        const dodge = Math.min(30, Math.round(extraLevel * extraMult * 0.8));
        const vampire = Math.min(3, Math.round(extraLevel * extraMult * 0.3));
        const combo = Math.min(25, Math.round(extraLevel * extraMult * 0.6));
        const crit = Math.min(30, Math.round(extraLevel * extraMult * 0.7));
        const critDamage = 150 + Math.min(50, Math.round(extraLevel * extraMult * 0.5));
        const armor = Math.min(99, Math.round(extraLevel * extraMult * 0.5));
        return { hp, atk, thorn, dodge, vampire, combo, crit, critDamage, armor };
    }

    let enemy = null;

    // ===== 镜像房间 =====
    if (roomType === 'mirror') {
        const isMirror = Math.random() < 0.8;
        const attackPercent = isMirror ? 0.4 : 0.75;
        const hpPercent = isMirror ? 0.5 : 0.9;
        const baseAtk = Math.max(1, Math.round(trial.player.attack * attackPercent));
        const baseHp = Math.max(1, Math.round(trial.player.hp * hpPercent));
        const baseStats = generateBaseEnemy(baseHp, baseAtk, false, false);
        const name = isMirror ? '镜像怪' : '复制法师';
        enemy = {
            name: name,
            hp: baseStats.hp,
            maxHp: baseStats.hp,
            attack: baseStats.atk,
            thorn: baseStats.thorn,
            dodge: baseStats.dodge,
            vampire: baseStats.vampire,
            combo: baseStats.combo,
            crit: baseStats.crit,
            critDamage: baseStats.critDamage,
            armor: baseStats.armor,
            firstStrikeReduction: 0,
            tempAttackBonus: 0,
            dodgeBonus: 0,
            critBonus: 0,
            critDamageBonus: 0,
            comboBonus: 0,
            attackPercentMod: 1,
            isMirror: true,
        };
    }
    // ===== Boss 房间 =====
    else if (roomType === 'boss') {
        const isShadowKing = Math.random() < 0.3;
        if (isShadowKing) {
            const hpBase = base + 10;
            const atkBase = 5 + Math.floor(floor / 2);
            const baseStats = generateBaseEnemy(hpBase, atkBase, true, false);
            enemy = {
                name: '影之皇',
                hp: baseStats.hp,
                maxHp: baseStats.hp,
                attack: baseStats.atk,
                thorn: baseStats.thorn,
                dodge: baseStats.dodge,
                vampire: baseStats.vampire,
                combo: baseStats.combo,
                crit: baseStats.crit,
                critDamage: baseStats.critDamage,
                armor: baseStats.armor,
                firstStrikeReduction: 0,
                tempAttackBonus: 0,
                dodgeBonus: 0,
                critBonus: 0,
                critDamageBonus: 0,
                comboBonus: 0,
                attackPercentMod: 1,
                isShadowKing: true,
            };
            // 触发影之皇进场效果（使用全局 _state）
            const roll = Math.random();
            if (roll < 0.3) {
                _state.nextDamageIncrease = 40;
                _addLog('你被影之皇的深渊能量污染，下次受到的伤害增加40%');
            } else if (roll < 0.6) {
                trial.player.shield = 0;
                _addLog('你被影之皇的深渊能量污染，护盾值归零');
            } else if (roll < 0.9) {
                const backup = {
                    luckyLevel: trial.luckyLevel || 0,
                    critDamage: trial.critDamage || 150,
                    thornLevel: trial.thornLevel || 0,
                    vampireLevel: trial.vampireLevel || 0,
                    dodgeLevel: trial.dodgeLevel || 0,
                    comboLevel: trial.comboLevel || 0,
                    executeLevel: trial.executeLevel || 0,
                };
                trial.luckyLevel = 0;
                trial.critDamage = 150;
                trial.thornLevel = 0;
                trial.vampireLevel = 0;
                trial.dodgeLevel = 0;
                trial.comboLevel = 0;
                trial.executeLevel = 0;
                _state.shadowKingSealBackup = backup;
                _addLog('你被影之皇的深渊能量污染，部分力量被影之皇封印');
            }
        } else {
            const hpBase = base + 10;
            const atkBase = 5 + Math.floor(floor / 2);
            const baseStats = generateBaseEnemy(hpBase, atkBase, true, false);
            enemy = {
                name: `层主 ${floor}`,
                hp: baseStats.hp,
                maxHp: baseStats.hp,
                attack: baseStats.atk,
                thorn: baseStats.thorn,
                dodge: baseStats.dodge,
                vampire: baseStats.vampire,
                combo: baseStats.combo,
                crit: baseStats.crit,
                critDamage: baseStats.critDamage,
                armor: baseStats.armor,
                firstStrikeReduction: 0,
                tempAttackBonus: 0,
                dodgeBonus: 0,
                critBonus: 0,
                critDamageBonus: 0,
                comboBonus: 0,
                attackPercentMod: 1,
            };
        }
    }
    // ===== 精英战 =====
    else if (roomType === 'elite') {
        const elitePool = ['精英守卫', '死尸', '岩浆行者', '影（窃）', '影（附身）', '影（魅）', '死灵法师'];
        const chosen = elitePool[Math.floor(Math.random() * elitePool.length)];
        let hpBase, atkBase;
        switch (chosen) {
            case '精英守卫':
                hpBase = base + 6;
                atkBase = 4 + Math.floor(floor / 2);
                break;
            case '死尸':
                hpBase = base + 6;
                atkBase = 4 + Math.floor(floor / 2);
                break;
            case '岩浆行者':
                hpBase = base + 6;
                atkBase = 4 + Math.floor(floor / 2);
                break;
            case '影（窃）':
                hpBase = base + 3;
                atkBase = 3 + Math.floor(floor / 2);
                break;
            case '影（附身）':
                hpBase = base - 1;
                atkBase = 5 + Math.floor(floor / 2) + 2;
                break;
            case '影（魅）':
                hpBase = base + 2;
                atkBase = 3 + Math.floor(floor / 2);
                break;
            case '死灵法师':
                hpBase = base + 1;
                atkBase = 5 + Math.floor(floor / 2) + 2;
                break;
        }
        const baseStats = generateBaseEnemy(hpBase, atkBase, false, true);
        enemy = {
            name: chosen,
            hp: baseStats.hp,
            maxHp: baseStats.hp,
            attack: baseStats.atk,
            thorn: baseStats.thorn,
            dodge: baseStats.dodge,
            vampire: baseStats.vampire,
            combo: baseStats.combo,
            crit: baseStats.crit,
            critDamage: baseStats.critDamage,
            armor: baseStats.armor,
            firstStrikeReduction: 0,
            tempAttackBonus: 0,
            dodgeBonus: 0,
            critBonus: 0,
            critDamageBonus: 0,
            comboBonus: 0,
            attackPercentMod: 1,
        };
        if (chosen === '死尸') {
            enemy.isDeadBody = true;
            enemy.thorn = 1;
        } else if (chosen === '岩浆行者') {
            enemy.isLavaWalker = true;
        } else if (chosen === '影（窃）') {
            enemy.isShadowThief = true;
        } else if (chosen === '影（附身）') {
            enemy.isShadowPossess = true;
        } else if (chosen === '影（魅）') {
            enemy.isShadowCharm = true;
        } else if (chosen === '死灵法师') {
            enemy.isNecromancer = true;
        }
    }
    // ===== 普通敌袭 =====
    else {
        const isSkeleton = Math.random() < 0.5;
        if (isSkeleton) {
            const hpBase = 8;
            const atkBase = 4;
            const baseStats = generateBaseEnemy(hpBase, atkBase, false, false);
            enemy = {
                name: '骷髅骑兵',
                hp: baseStats.hp,
                maxHp: baseStats.hp,
                attack: baseStats.atk,
                thorn: baseStats.thorn,
                dodge: 50,
                vampire: baseStats.vampire,
                combo: 40,
                crit: 40,
                critDamage: 150,
                armor: baseStats.armor,
                firstStrikeReduction: 0,
                tempAttackBonus: 0,
                dodgeBonus: 0,
                critBonus: 0,
                critDamageBonus: 0,
                comboBonus: 0,
                attackPercentMod: 1,
            };
        } else {
            const hpBase = base;
            const atkBase = 3 + Math.floor(floor / 2);
            const baseStats = generateBaseEnemy(hpBase, atkBase, false, false);
            enemy = {
                name: '黑暗爪牙',
                hp: baseStats.hp,
                maxHp: baseStats.hp,
                attack: baseStats.atk,
                thorn: baseStats.thorn,
                dodge: baseStats.dodge,
                vampire: baseStats.vampire,
                combo: baseStats.combo,
                crit: baseStats.crit,
                critDamage: baseStats.critDamage,
                armor: baseStats.armor,
                firstStrikeReduction: 0,
                tempAttackBonus: 0,
                dodgeBonus: 0,
                critBonus: 0,
                critDamageBonus: 0,
                comboBonus: 0,
                attackPercentMod: 1,
            };
        }
    }

    // ===== 初始化战斗 =====
    trial.combat = { enemy, turn: 1 };
    trial.combat.playerMaxHpSnapshot = trial.player.maxHp;
    trial.combat.environment = _state.environment
        ? rebuildEnvironmentFromTemplate(_state.environment, trial.floor)
        : null;

    trial.player.attackPercentMod = 1;
    enemy.attackPercentMod = 1;

    const env = trial.combat.environment;
    if (env && typeof env.onCombatStart === 'function') {
        env.onCombatStart(trial.player, enemy);
    }
    
    enemy.dodge = Math.min(30, (enemy.dodge || 0) + (enemy.dodgeBonus || 0));
    enemy.dodgeBonus = 0;
    enemy.crit = Math.min(30, (enemy.crit || 0) + (enemy.critBonus || 0));
    enemy.critBonus = 0;
    enemy.combo = Math.min(25, (enemy.combo || 0) + (enemy.comboBonus || 0));
    enemy.comboBonus = 0;
    enemy.armor = Math.min(99, (enemy.armor || 0) + (enemy.armorBonus || 0));
    enemy.armorBonus = 0;

    trial.mode = 'trialCombat';
    trial.heroSkillBonus = 0;
    trial.heroPendingHeal = 0;
    trial.isFirstAttack = true;
    trial.comboCount = 0;
    trial.executeCount = 0;
    trial.dodgeCount = 0;
    trial.critCount = 0;

    _addLog(`${enemy.name} 出现在你面前。`);
    // BGM 按房间类型切换场景；登场音效对应专属（Boss 号角 / 精英战鼓 / 镜像诡异音 / 普通战鼓）
    if (window.AbyssAudio) {
        const rt = _state.trial.currentRoom ? _state.trial.currentRoom.type : null;
        if (rt === 'boss') { AbyssAudio.setScene('boss'); AbyssAudio.sfx('boss'); }
        else if (rt === 'elite') { AbyssAudio.setScene('elite'); AbyssAudio.sfx('elite'); }
        else if (rt === 'mirror') { AbyssAudio.setScene('mirror'); AbyssAudio.sfx('mirror'); }
        else { AbyssAudio.setScene('battle'); AbyssAudio.sfx('battleStart'); }
    }
    if (trial.hero?.skill?.onCombatStart) {
        trial.hero.skill.onCombatStart();
    }
    applyTrialCurses();
    renderTrialUI();
}

// ===== 试炼敌人死亡统一处理（攻击击杀 / 环境击杀 / 荆棘反杀 / 狂怒 共用） =====
function handleTrialEnemyDefeat(enemy, env) {
    const trial = _state.trial;
    // 死灵法师：影响下一个房间（试炼）
    if (state.combat && state.combat.enemy && state.combat.enemy.isNecromancer) {
        const nextIndex = trial.roomIndex + 1;
        if (nextIndex < trial.rooms.length) {
            const nextRoom = trial.rooms[nextIndex];
            if (nextRoom.type !== 'enemy' && nextRoom.type !== 'elite') {
                nextRoom.type = Math.random() < 0.5 ? 'enemy' : 'elite';
            }
            _addLog('下一个房间被死灵法师影响');
        }
    }
    // 岩浆行者：灼烧
    if (enemy.isLavaWalker) {
        _state.burnRounds = 3;
        _addLog('击败岩浆行者，你被灼烧缠身，接下来3回合每回合损失3生命和1生命上限');
    }
    // 影（窃）：窃取金币
    if (enemy.isShadowThief && trial.player.gold > 0) {
        const lost = Math.floor(trial.player.gold * 0.15);
        trial.player.gold -= lost;
        _addLog(`你击败了影(窃)，但失去了 ${lost} 金币`);
        if (window.AbyssAudio) AbyssAudio.sfx('goldLose');
    }
    // 影（附身）：下次受伤增加
    if (enemy.isShadowPossess) {
        _state.nextDamageIncrease = 30;
        _addLog('你击败了影（附身），但被其附身，下次受到的伤害增加30%');
        if (window.AbyssAudio) AbyssAudio.sfx('curse');
    }
    // 影（魅）：魅惑
    if (enemy.isShadowCharm) {
        _state.charmRounds = 3;
        _state.damageReduction = 10;
        _addLog('你击败了影（魅），但被其魅惑，之后3回合伤害减少10%');
        if (window.AbyssAudio) AbyssAudio.sfx('curse');
    }

    clearTrialTempBonuses();

    // 影之皇特殊处理（试炼）← 移到清理之后
    if (state.combat && state.combat.enemy && state.combat.enemy.isShadowKing) {
        if (_state.shadowKingSealBackup) {
            const backup = _state.shadowKingSealBackup;
            trial.luckyLevel = backup.luckyLevel;
            trial.critDamage = backup.critDamage;
            trial.thornLevel = backup.thornLevel;
            trial.vampireLevel = backup.vampireLevel;
            trial.dodgeLevel = backup.dodgeLevel;
            trial.comboLevel = backup.comboLevel;
            trial.executeLevel = backup.executeLevel;
            _state.shadowKingSealBackup = null;
            _addLog('能力反还');
        }
        const applyPercent = 1.05;
        function applyMin1(value) {
            const result = Math.round(value * applyPercent);
            return value === 0 ? 1 : Math.max(result, value + 1);
        }
        function applyMin5(value, max) {
            const result = Math.round(value * applyPercent);
            return value === 0 ? 1 : Math.min(Math.max(result, value + 1), max);
        }
        trial.player.hp = Math.min(applyMin1(trial.player.hp), trial.player.maxHp * 2);
        trial.player.maxHp = applyMin1(trial.player.maxHp);
        trial.player.attack = applyMin1(trial.player.attack);
        trial.player.shield = applyMin1(trial.player.shield);
        trial.player.xp = applyMin1(trial.player.xp || 0);
        trial.luckyLevel = Math.min(applyMin5(trial.luckyLevel || 0, 10), 10);
        trial.critDamage = Math.round((trial.critDamage || 150) * applyPercent);
        if (trial.critDamage === 150) trial.critDamage = 155;
        trial.thornLevel = applyMin1(trial.thornLevel || 0);
        trial.vampireLevel = applyMin1(trial.vampireLevel || 0);
        trial.dodgeLevel = Math.min(applyMin5(trial.dodgeLevel || 0, 10), 10);
        trial.comboLevel = Math.min(applyMin5(trial.comboLevel || 0, 8), 8);
        trial.executeLevel = Math.min(applyMin5(trial.executeLevel || 0, 8), 8);
        trial.player.hp = Math.min(trial.player.hp, trial.player.maxHp);
        _addLog('影之皇被击败，深渊回应了你，全属性提升5%！');
        if (window.AbyssAudio) AbyssAudio.sfx('buff');
    }

    trial.combat = null;
    trial.mode = 'trial';
    // 这里原本有一句 applyTrialUnlocks()：每击败一个敌人就重套一次永久强化。
    // 旧实现改的是 _state，退出时会被备份覆盖所以"看不出来"；现在它作用于试炼副本，
    // 留着就会变成真的反复叠加。永久强化只在 startTrial 套用一次。
    _addLog(`${enemy.name} 被击败！`);
    _trialFloat('enemy', '击败!', 'victory');
    _trialPlayAnim('enemy', 'death');
    if (window.AbyssAudio) { AbyssAudio.sfx('victory'); AbyssAudio.setScene('explore'); }
    if (env && typeof env.onVictory === 'function') {
        env.onVictory(trial.player, enemy);
    }

    let points = 1;
    if (trial.currentRoom.type === 'elite') points = 2;
    if (trial.currentRoom.type === 'boss') points = 5;
    if (trial.curses.some(c => c.name === '贪婪')) {
        points = Math.floor(points / 2);
        _addLog('诅咒"贪婪"生效，试炼点减半。');
    }
    if (trial.hasTrialPoint) points += 1;
    const pointRate = getTrialPointRate();
    if (pointRate > 1) {
        // 小数余数累计：不足 1 点的部分保留到下一场，长期数学正确，小额也有反馈
        const raw = points * pointRate + (trial.pointRateCarry || 0);
        const gained = Math.floor(raw);
        trial.pointRateCarry = raw - gained;
        if (trial.pointRateCarry < 1e-9) trial.pointRateCarry = 0;
        if (gained !== points) {
            _addLog(`试炼学精要：点数获取率 +${((pointRate - 1) * 100).toFixed(0)}% 生效，获得 ${gained} 试炼点${trial.pointRateCarry > 0 ? `（余数 ${trial.pointRateCarry.toFixed(2)} 累计中）` : ''}。`);
        }
        points = gained;
    }
    trial.points += points;
    _addLog(`获得 ${points} 试炼点。`);
    if (window.AbyssAudio) AbyssAudio.sfx('coin');
    if (trial.hero?.skill?.onVictory) {
        trial.hero.skill.onVictory();
    }
    if (trial.currentRoom.type === 'boss') {
        openTrialShop(true);
        renderTrialUI();
        return;
    }
    trial.roomIndex++;
    if (trial.roomIndex >= trial.rooms.length) {
        nextTrialFloor();
    } else {
        enterTrialRoom();
    }
    renderTrialUI();
}

// ============================================================
// 试炼战斗动画（受击/闪避/死亡/飘字/屏幕震动）
// ============================================================
function _trialSettings() {
    if (!window._settings) {
        if (typeof loadSettings === 'function') {
            window._settings = loadSettings();
        } else {
            window._settings = {};
        }
    }
    return window._settings;
}
function _trialAnimEnabled() {
    return _trialSettings().battleAnimation !== false;
}
function _trialAnimSpeed() {
    const s = _trialSettings().animationSpeed;
    return s === 'slow' ? 0.6 : (s === 'fast' ? 1.6 : 1);
}
function _trialSpriteEl(side) {
    return document.getElementById(side === 'enemy' ? 'trialEnemySprite' : 'trialPlayerSprite');
}
// 播放精灵动画（hit / dodge / death）
function _trialPlayAnim(side, cls) {
    // 2D 渲染层优先（阶段1）：2D 激活时由 Phaser 播放动画
    if (_trial2DReady()) {
        try {
            _trial2D().playAnim(side, cls);
            return;
        } catch (e) {
            console.warn('[试炼] 2D 动画播放失败，回退 emoji 动画：', e);
        }
    }
    if (!_trialAnimEnabled()) return;
    const el = _trialSpriteEl(side);
    if (!el) return;
    el.classList.remove('hit', 'dodge', 'death');
    void el.offsetWidth;               // 强制重排，重启动画
    el.classList.add(cls);
    const speed = _trialAnimSpeed();
    const dur = (cls === 'death' ? 0.5 : cls === 'dodge' ? 0.4 : 0.35) / speed;
    el.style.animationDuration = dur + 's';
    setTimeout(() => {
        if (el && el.classList.contains(cls)) {
            el.classList.remove(cls);
            el.style.animationDuration = '';
        }
    }, dur * 1000 + 80);
}
// 试炼飘字（锚定在对应精灵容器内，尊重"飘字特效"设置）
function _trialFloat(side, text, cls) {
    const st = _trialSettings();
    if (st.floatText === false) return;
    // 2D 渲染层优先（阶段1）
    if (_trial2DReady()) {
        try {
            _trial2D().float(side, text, cls);
            return;
        } catch (e) {
            console.warn('[试炼] 2D 飘字失败，回退 emoji 飘字：', e);
        }
    }
    if (!_trialAnimEnabled()) return;
    const anchor = _trialSpriteEl(side);
    if (!anchor) return;
    const el = document.createElement('div');
    el.className = 'trial-float ' + (cls || 'damage');
    el.textContent = text;
    const speed = _trialAnimSpeed();
    el.style.animationDuration = (0.9 / speed) + 's';
    el.style.left = (20 + Math.random() * 60) + '%';
    anchor.appendChild(el);
    setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
    }, (0.9 / speed) * 1000 + 100);
}
// 试炼屏幕震动（尊重"窗口抖动"设置）
function _trialScreenShake() {
    const st = _trialSettings();
    if (st.screenShake === false) return;
    // 2D 渲染层优先（阶段1）：2D 激活时抖动 2D 相机
    if (_trial2DReady()) {
        try {
            _trial2D().shake();
            return;
        } catch (e) {
            console.warn('[试炼] 2D 震屏失败，回退窗口抖动：', e);
        }
    }
    if (!_trialAnimEnabled()) return;
    const screen = document.getElementById('trialScreen');
    if (!screen) return;
    screen.classList.remove('shake');
    void screen.offsetWidth;
    screen.classList.add('shake');
    const speed = _trialAnimSpeed();
    const dur = 0.3 / speed;
    screen.style.animationDuration = dur + 's';
    setTimeout(() => {
        if (screen) {
            screen.classList.remove('shake');
            screen.style.animationDuration = '';
        }
    }, dur * 1000 + 80);
}
// 操作按钮闪白（复用经典 hit-flash 样式）
function _trialBtnFlash(label) {
    if (!_trialAnimEnabled()) return;
    document.querySelectorAll('.trial-action-btn').forEach(btn => {
        if (btn.textContent.includes(label)) {
            btn.classList.remove('hit-flash');
            void btn.offsetWidth;
            btn.classList.add('hit-flash');
            setTimeout(() => btn.classList.remove('hit-flash'), 300);
        }
    });
}
// 敌人形象与英雄形象对齐：英雄形象位于玩家面板最下方（遗物下方），
// 敌人形象自然位置会偏高，这里测量差值并只调整敌人形象的 margin-top，
// 使其底部与英雄形象底部处于同一高度（幂等：已对齐时直接返回）
function _trialAlignSprites() {
    const pSprite = document.getElementById('trialPlayerSprite');
    const eSprite = document.getElementById('trialEnemySprite');
    if (!pSprite || !eSprite) return;
    const pRect = pSprite.getBoundingClientRect();
    // 重置已有校正再测量，避免误差累积
    eSprite.style.marginTop = '';
    const eRect = eSprite.getBoundingClientRect();
    const diff = pRect.bottom - eRect.bottom;
    if (Math.abs(diff) < 1) return;
    // 只允许把敌人形象向下推（英雄形象位于更靠下的位置）
    if (diff <= 0) return;
    eSprite.style.marginTop = Math.round(diff) + 'px';
}
// 英雄 / 敌人 emoji 映射
const TRIAL_HERO_EMOJI = {
    '战士': '🛡️', '刺客': '🗡️', '贤者': '🔮', '守护者': '🏰', '游侠': '🏹',
    '法师': '🪄', '狂战士': '💪', '圣骑士': '✨', '暗影': '🌑',
};
const TRIAL_ENEMY_EMOJI = {
    '黑暗爪牙': '👹', '骷髅骑兵': '🏇', '精英守卫': '⚔️', '死尸': '🧟',
    '岩浆行者': '🌋', '影（窃）': '🥷', '影（附身）': '👻', '影（魅）': '😈',
    '死灵法师': '💀', '层主': '🏛️', '影之皇': '👑', '镜像怪': '🪞',
    '复制法师': '🧙', '咕咕嘎嘎': '🐧',
};
function _trialEmoji(kind, name) {
    const map = kind === 'hero' ? TRIAL_HERO_EMOJI : TRIAL_ENEMY_EMOJI;
    return map[name] || (kind === 'hero' ? '🧙' : '👹');
}

/* ============================================================
   试炼模式 2D 渲染层集成（阶段1：Phaser 3 基础框架）
   ------------------------------------------------------------
   设计：2D 层只负责画面渲染，文字逻辑保持不变；
        2D 不可用或被关闭时，自动回退到原有 emoji + CSS 动画。
   ============================================================ */
let _trial2DEnemySig = '';
let _trial2DInitTried = false;

// 取 2D 模块（容错：脚本未加载时返回 null）
function _trial2D() {
    return window.试炼2D || window.Trial2D || null;
}

// 2D 层是否已就绪且处于启用状态
function _trial2DReady() {
    const t2d = _trial2D();
    if (!t2d || !t2d.available || !t2d.available()) return false;
    return t2d.isEnabled() === true;
}

/**
 * 动态视口高度兜底
 * ------------------------------------------------------------
 * 移动端 100vh 是「含地址栏」的高度，而地址栏会随交互收起或展开；
 * 直接用它会让全屏 2D 舞台比可视区高一截，底部那排触摸按钮正好被地址栏压住、点不到。
 * 这里把真实可视高度写进 CSS 变量 --trial2d-vh，让舞台始终贴住可视区。
 */
let _trial2dVhBound = false;

function _updateTrial2DVh() {
    const vv = window.visualViewport;
    const h = Math.round((vv && vv.height) || window.innerHeight || 0);
    if (h > 0) document.documentElement.style.setProperty('--trial2d-vh', h + 'px');
    // 尺寸变了，Phaser 画布与其中的触摸控件布局都要跟着重算
    _refreshRealtimeCanvas();
}

function _bindTrial2DVh() {
    if (_trial2dVhBound) return;
    _trial2dVhBound = true;
    window.addEventListener('resize', _updateTrial2DVh);
    window.addEventListener('orientationchange', function () {
        // 旋转过程中尺寸还没稳定，隔一段时间再量两次
        setTimeout(_updateTrial2DVh, 120);
        setTimeout(_updateTrial2DVh, 400);
    });
    if (window.visualViewport && window.visualViewport.addEventListener) {
        window.visualViewport.addEventListener('resize', _updateTrial2DVh);
    }
    window.addEventListener('resize', _updateRotateHint);
    window.addEventListener('orientationchange', function () {
        setTimeout(_updateRotateHint, 120);
        setTimeout(_updateRotateHint, 400);
    });
}

/* ============================================================
   移动端横屏（仅 2D 试炼期间强制，其余界面一律不干预）
   ------------------------------------------------------------
   浏览器没有「强制旋转屏幕」的能力，唯一的路是「全屏 + Screen Orientation API」：
     · requestFullscreen 必须在用户手势的同步调用链里，否则会被拒绝
     · orientation.lock 要求先进入全屏，且 iOS Safari 完全不支持、
       手机开着「方向锁定」时也会失败
     · 反向也成立：全屏一旦被外力收走，方向锁会「跟着一起失效」
   最后一条才是「进了试炼却被卡在竖屏出不来」的真正原因 —— 导出布局时弹出的
   系统对话框（window.prompt）、下载栏、来电横幅都会把全屏顶掉，而那时玩家并
   没有离开试炼，于是屏幕转回竖屏，而且再没有任何代码会去把它转回来。
   所以这里不只「进入时锁一次」，而是把「2D 试炼期间横屏」当成一条持续维持的
   约束：一旦发现又竖过来了，就找机会重新全屏 + 锁定。而唯一有效的机会是
   「真实触摸」—— 只有那一刻浏览器才认这是用户手势，所以补在 pointerdown 上。
   真的锁不上（iOS / 系统方向锁定）时退化成顶部提示条，而不是把玩家挡在外面 ——
   竖屏布局已经适配过，横竖屏都能玩，横屏只是体验更好。
   ============================================================ */
let _rotateHintDismissed = false;
let _rotateHintBound = false;
let _landscapeRetry = 0;        // 连续失败次数：连续几次都锁不上就不再折腾
let _landscapeRetryAt = 0;
let _landscapeEverOk = false;   // 本局是否真的横过来过（决定提示文案）
const _LANDSCAPE_MAX_RETRY = 3;

function _trialIsTouch() {
    try { return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0); }
    catch (e) { return false; }
}

/**
 * 是否苹果移动端（iPhone / iPad）
 * iPadOS 13+ 的 UA 会伪装成 Mac，所以只看 UA 会把 iPad 漏掉，
 * 用「MacIntel + 多指触摸」这条组合特征补上（桌面 Mac 的 maxTouchPoints 是 0）。
 */
function _isAppleTouch() {
    try {
        const ua = navigator.userAgent || '';
        if (/iPad|iPhone|iPod/.test(ua)) return true;
        return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
    } catch (e) { return false; }
}

/** 是否已从主屏幕启动 —— iOS 上这是唯一能拿到「真全屏、无地址栏」的方式 */
function _isStandalone() {
    try {
        if (navigator.standalone) return true;
        if (!window.matchMedia) return false;
        return window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: fullscreen)').matches;
    } catch (e) { return false; }
}

/**
 * 苹果设备专属：把舞台顶部那行提示换成「怎么才能横屏全屏」
 * ------------------------------------------------------------
 * iPhone / iPad 的 Safari **不提供元素全屏 API**，而 orientation.lock 又要求先进全屏，
 * 于是「进了 2D 自动横屏」这条路在 iOS 上从根上就不通，只能靠玩家自己转屏。
 * 唯一能让 iOS 拿到真全屏（无地址栏、不被挤掉一截）的官方途径是
 * 「分享 → 添加到主屏幕」，之后从主屏幕图标启动就是 web app 模式。
 * 这句话塞不进顶部那条提示（那条窄到只放得下 20 个字，长了就被省略号吃掉），
 * 所以放在舞台头部这一整行里说。非苹果设备不动这行。
 */
function _applyTrial2DHintForIOS() {
    const hint = document.getElementById('trial2DHint');
    if (!hint || !_isAppleTouch()) return;
    hint.textContent = _isStandalone()
        ? '触摸操作：左下摇杆移动 · 右下按键攻击 / 跳跃 / 闪避 · 右上角可开图鉴与商店'
        : 'iPhone / iPad 无法自动锁横屏：建议「分享 → 添加到主屏幕」，从主屏幕启动即为全屏横屏';
}

function _isPortraitViewport() {
    return window.innerHeight > window.innerWidth;
}

/** 当前是否正处于 2D 全屏战斗中 */
function _inRealtimeTrial() {
    // _state 由主程序注入，未注入时是 null。这里必须挡住：本函数被挂在全局
    // pointerdown 上（抢救横屏），只要有一处漏判，页面上的**每一次触摸**都会抛异常。
    // body 上的 class 放在最前面判：它最便宜，且非 2D 试炼时能一路短路到底。
    return document.body.classList.contains('realtime-trial') &&
        !!(_state && _state.trial && _state.trial.active) &&
        !_realtimeUnavailable;
}

function _isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

/** 还有没有抢救横屏的余地（玩家没喊停、也没连续失败到上限） */
function _canAutoRelock() {
    return !_rotateHintDismissed && _landscapeRetry < _LANDSCAPE_MAX_RETRY;
}

/**
 * 「2D 试炼期间应当横屏」这条约束当前是否被违反
 * 只在触摸设备上成立：桌面浏览器的窗口是宽是扁由用户自己决定，不该被抢全屏。
 */
function _landscapeBroken() {
    if (!_inRealtimeTrial()) return false;
    if (!_trialIsTouch()) return false;
    if (!_isPortraitViewport()) return false;
    // 玩家点过「知道了」= 明确表示本局不想被管，不再自动折腾
    if (!_canAutoRelock()) return false;
    return true;
}

/**
 * 请求全屏并锁定横屏
 * 两个时机限制都是浏览器硬性要求，不是实现选择：
 *   · 必须在用户手势的同步调用链里，否则 requestFullscreen 直接被拒
 *   · lock 必须在全屏成功之后，所以只能挂在 requestFullscreen 的 promise 上
 */
function _requestLandscapeLock() {
    let fsPromise = null;
    try {
        if (!_isFullscreen()) {
            const el = document.documentElement;
            if (el.requestFullscreen) fsPromise = el.requestFullscreen({ navigationUI: 'hide' });
            else if (el.webkitRequestFullscreen) fsPromise = el.webkitRequestFullscreen();
        }
    } catch (e) { /* 被判为不在手势里：跳过全屏，仍试一下锁定 */ }

    const lock = function () {
        try {
            const so = screen.orientation;
            if (so && typeof so.lock === 'function') {
                const p = so.lock('landscape');
                // 手机开了方向锁定 / 浏览器不支持 → 静默失败，交给提示条兜底
                if (p && typeof p.catch === 'function') p.catch(function () { /* 忽略 */ });
            }
        } catch (e) { /* 忽略 */ }
    };

    // 方向锁要求先进入全屏，所以要等全屏成功之后再锁；全屏失败也仍试一次锁
    if (fsPromise && typeof fsPromise.then === 'function') fsPromise.then(lock, lock);
    else lock();
}

/** 横屏提示：只有「触摸设备 + 2D 全屏战斗中 + 竖屏」才显示 */
function _updateRotateHint() {
    const hint = document.getElementById('trial2DRotateHint');
    if (!hint) return;

    if (!_isPortraitViewport()) {
        // 已经横过来了：失败计数归零，下次再被打断还能继续抢救
        _landscapeRetry = 0;
        if (_inRealtimeTrial()) _landscapeEverOk = true;
    }

    const show = !_rotateHintDismissed && _trialIsTouch() && _isPortraitViewport() && _inRealtimeTrial();
    hint.classList.toggle('hidden', !show);
    if (!show) return;

    // 两句话分开说：设备压根不支持（只能玩家自己转屏）vs 本来横着、被系统弹窗顶掉了
    // （点一下屏幕就能救回来）。后者是能自救的，不该让玩家以为只能手动转屏。
    // 文案要短：竖屏下提示条宽度只有「屏宽 - 24px」，长了会被省略号吃掉关键信息。
    const recoverable = _landscapeEverOk && _canAutoRelock();
    const text = hint.querySelector('.trial2d-rotate-text');
    if (text) {
        if (recoverable) {
            text.textContent = '点一下屏幕恢复横屏';
        } else if (_isAppleTouch()) {
            // iOS 上不能承诺「能自动救回来」：Safari 没有元素全屏 API，
            // orientation.lock 也就永远不可用，这里是结构性不支持，不是被打断。
            text.textContent = '请旋转手机横屏';
        } else {
            text.textContent = '横屏视野更开阔，建议旋转手机';
        }
    }
}

/**
 * 在用户手势里抢救横屏
 * 为什么必须挂手势：requestFullscreen 在没有「用户激活状态」时一定被拒，而
 * setTimeout 与普通事件回调里都不带激活状态。游戏里的每次触摸天然就是手势。
 */
function _relockLandscapeFromGesture(e) {
    // 点提示条上的按钮不算「玩」，尤其「知道了」是玩家在喊停，不能反手把他锁回去
    const t = e && e.target;
    if (t && typeof t.closest === 'function' && t.closest('#trial2DRotateHint')) return;

    if (!_landscapeBroken()) return;
    const now = Date.now();
    // 节流：进出全屏本身要动一次视口，连点时不至于反复闪
    if (now - _landscapeRetryAt < 1000) return;
    _landscapeRetryAt = now;
    _landscapeRetry++;
    _requestLandscapeLock();
    setTimeout(_updateRotateHint, 400);
    setTimeout(_updateRotateHint, 1200);
}

function _bindRotateHint() {
    if (_rotateHintBound) return;
    _rotateHintBound = true;
    const close = document.getElementById('trial2DRotateClose');
    if (close) {
        close.addEventListener('click', function () {
            // 关掉之后本局不再打扰；下次进试炼会重新给一次提示
            _rotateHintDismissed = true;
            const hint = document.getElementById('trial2DRotateHint');
            if (hint) hint.classList.add('hidden');
        });
    }

    // 全屏被外力收走（系统对话框 / 下载栏 / 来电横幅）时，方向锁会跟着失效。
    // 只刷新提示；真正的重锁交给下一次触摸 —— 这里没有用户激活状态，请求必被拒。
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
        document.addEventListener(ev, function () {
            if (!_isFullscreen()) _landscapeRetryAt = 0;
            setTimeout(_updateRotateHint, 80);
        });
    });

    // 唯一的救命时机：真实触摸。capture 阶段、不改动也不吞掉任何事件。
    if (window.PointerEvent) {
        document.addEventListener('pointerdown', _relockLandscapeFromGesture, true);
    } else {
        document.addEventListener('touchstart', _relockLandscapeFromGesture, { capture: true, passive: true });
    }
}

/**
 * 进入 2D 战斗时切横屏
 * 必须在用户手势的同步调用链里调用（startRealtimeTrial 由按钮点击同步触发，满足条件）
 */
function _enterLandscapeMode() {
    if (!_trialIsTouch()) return;
    _bindRotateHint();
    _rotateHintDismissed = false;
    _landscapeRetry = 0;
    _landscapeRetryAt = 0;
    _landscapeEverOk = false;

    // 只处理「竖屏手机 / 平板」：
    //   · 桌面本来就是横屏，不需要切方向，也不该被强制全屏
    //   · 有些触摸屏笔记本的 maxTouchPoints 也大于 0，会被 _trialIsTouch 判成触摸设备，
    //     用「是否竖屏」再卡一道，避免误伤
    if (!_isPortraitViewport()) { _landscapeEverOk = true; _updateRotateHint(); return; }

    _landscapeRetry = 1;   // 进入时这次尝试也算进配额
    _requestLandscapeLock();

    // 无论成败都按当前方向刷新一次提示（全屏切换本身也会改变视口）
    setTimeout(_updateRotateHint, 500);
    setTimeout(_updateRotateHint, 1300);
}

/** 退出 2D 战斗时解除方向锁并退全屏 —— 否则玩家会被锁在横屏全屏里出不来 */
function _exitLandscapeMode() {
    const hint = document.getElementById('trial2DRotateHint');
    if (hint) hint.classList.add('hidden');
    // 横屏只是 2D 试炼期间的临时状态：出了试炼一律还给系统，
    // 其余界面横屏竖屏都不干预
    _landscapeRetry = 0;
    _landscapeRetryAt = 0;
    _landscapeEverOk = false;
    try {
        if (screen.orientation && typeof screen.orientation.unlock === 'function') screen.orientation.unlock();
    } catch (e) { /* 忽略 */ }
    try {
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) { /* 忽略 */ }
}

/**
 * 把 2D 舞台临时提升为「整屏浮层」
 * ------------------------------------------------------------
 * 启动中提示与回退面板都必须盖住整屏居中，否则会掉到文字界面下面 ——
 * #trialScreen 是 position: fixed 且没有滚动条，掉下去就等于玩家永远够不到
 * 那个「重试 2D 模式」按钮，只能看到一块黑。
 * 顺带压掉 trial-screen 上的 transform：祖先有 transform 时，子级的 position: fixed
 * 会改成「相对该祖先定位」，浮层就不再等于屏幕。
 */
function _set2DAlertOverlay(on) {
    const stage = document.getElementById('trial2DStage');
    const screen = document.getElementById('trialScreen');
    if (stage) stage.classList.toggle('trial2d-stage-alert', !!on);
    if (screen) screen.classList.toggle('trial2d-alerting', !!on);
}

/**
 * 「正在启动 2D 实时战斗」提示
 * ------------------------------------------------------------
 * 自动重试期间用。静默重试最长要 5 秒左右，中间什么都不显示的话，
 * 玩家对着空舞台会以为卡死了（苹果设备上第一次建 context 慢是常态）。
 */
function _set2DBootHint(show) {
    const el = document.getElementById('trial2DBootHint');
    if (!el) return;
    el.classList.toggle('hidden', !show);
    if (show) {
        _set2DAlertOverlay(true);
        const fb = document.getElementById('trial2DFallback');
        if (fb) fb.classList.add('hidden');
    } else {
        // 启动过程结束：把旋转动画停掉，别让已经隐藏的节点继续吃电
        const sp = el.querySelector('.trial2d-boot-spinner');
        if (sp) sp.style.animationPlayState = 'paused';
    }
}

/**
 * 2D 启动失败时的界面提示
 * ------------------------------------------------------------
 * 手机上玩家看不到 console，只写日志等于没写。这里把可读原因落到界面上，
 * 并给一个「重试」入口 —— 重试走 force 路径，会重新探测 WebGL 并换渲染器再试，
 * 所以「先失败、后来开了硬件加速」这种情况不必刷新页面。
 */
function _show2DUnavailable(t2d) {
    _set2DBootHint(false);
    const why = (t2d && typeof t2d.lastError === 'function' && t2d.lastError()) || '未知原因';
    console.warn('[试炼] 2D 引擎不可用，回退到文字模式：' + why);
    const fallback = document.getElementById('trial2DFallback');
    const stage = document.getElementById('trial2DStage');
    if (!fallback || !stage) return;
    const whyEl = document.getElementById('trial2DFallbackWhy');
    if (whyEl) whyEl.textContent = '原因：' + why;
    _set2DAlertOverlay(true);
    stage.classList.remove('hidden');
    fallback.classList.remove('hidden');

    const retry = document.getElementById('trial2DFallbackRetry');
    if (retry && !retry.dataset.bound) {
        retry.dataset.bound = 'true';
        retry.addEventListener('click', function () {
            retry.disabled = true;
            retry.textContent = '正在重试…';
            const t = _state.trial;
            // 本局已结算/已退出时没有可重试的战斗，避免重试出一个空舞台
            if (!t || !t.active || t.gameOver) {
                retry.disabled = false;
                retry.textContent = '重试 2D 模式';
                _show2DUnavailable(_trial2D());
                return;
            }
            // 让按钮先绘出「正在重试」，否则移动端看起来像没反应
            setTimeout(function () {
                // 玩家主动重试：把自动重试的配额重新给满，别让他点一次就石沉大海
                _realtimeFailCount = 0;
                _realtimeUnavailable = false;
                const r = _realtimeTryStart(true, false);
                retry.disabled = false;
                retry.textContent = '重试 2D 模式';
                if (r === 'ok') {
                    fallback.classList.add('hidden');
                    _addLog('2D 实时战斗重试成功，已切换到 2D 画面');
                } else if (r !== 'retrying') {
                    _show2DUnavailable(_trial2D());
                }
            }, 60);
        });
    }
}

// 进入试炼时初始化 2D 引擎（懒加载，仅首次创建 Phaser.Game）
// force=true 时允许在失败后重试
function _initTrial2D(force) {
    const t2d = _trial2D();
    const stage = document.getElementById('trial2DStage');
    const host = document.getElementById('trial2DCanvasHost');
    const fallback = document.getElementById('trial2DFallback');
    if (!t2d || !stage || !host) return false;

    // 引擎已在运行：无需重复初始化
    if (typeof t2d.isBooted === 'function' && t2d.isBooted()) return true;
    // 之前尝试过且失败：不再反复重试，避免重复创建引擎
    if (_trial2DInitTried && !force) return false;
    _trial2DInitTried = true;

    // 注入输入动作：2D 画面内的键鼠操作复用现有试炼动作
    t2d.setActionHandler(function (action) {
        if (window.Trial && typeof Trial.handleAction === 'function') {
            Trial.handleAction(action);
        }
    });

    const ok = t2d.init(host, force);
    if (!ok) {
        // 回退：显示说明，保持文字模式可用
        _show2DUnavailable(t2d);
        return false;
    }
    fallback && fallback.classList.add('hidden');
    t2d.enter();
    _bindTrial2DBridge();
    _trial2DEnemySig = '';
    return true;
}

// 实时战斗是否正在运行
function isRealtimeRunning() {
    const t2d = _trial2D();
    if (!t2d || !t2d.isReady || !t2d.isReady()) return false;
    const d = t2d.debug ? t2d.debug() : null;
    return !!(d && d.running);
}

/* ============================================================
   2D 启动失败后的自动重试
   ------------------------------------------------------------
   原来一次 init 失败就把整局钉死在文字模式，理由是「手机上白等好几秒」。
   但这个判断对苹果设备是有害的：iOS 上「第一次建 WebGL context 失败、第二次就好了」
   极其常见 —— 页面刚加载完时名额可能还被首页特效占着、Safari 还在做首帧布局、
   省电模式刚切回来、从后台回前台还没稳。一次失败就判死刑，等于让能玩的设备
   永远只能玩文字版。
   所以改成：失败后按 350ms / 1.4s / 3.2s 再试三次，**期间不弹回退面板**
   （否则玩家先看到「本机无法启动」，几秒后又自己好了，像故障）。
   三次都过不去才真正回退到文字模式，并且把四条渲染路径的失败原因摆到界面上。
   ============================================================ */
let _realtimeUnavailable = false;
let _realtimeFailCount = 0;      // 本次进入试炼以来连续失败次数
let _realtimeRetryTimer = null;  // 自动重试定时器
let _realtimeBooting = false;    // 正在尝试启动（防重入：renderTrialUI 调用很密）
const _REALTIME_AUTO_RETRY = 3;
const _REALTIME_RETRY_DELAY = [350, 1400, 3200];

/** 每次进入试炼都重新给 2D 一次机会 */
function _resetRealtimeRetry() {
    if (_realtimeRetryTimer) { clearTimeout(_realtimeRetryTimer); _realtimeRetryTimer = null; }
    _realtimeFailCount = 0;
    _realtimeUnavailable = false;
    _realtimeBooting = false;
    _trial2DInitTried = false;
}

/**
 * 尝试启动 2D 战斗，失败时自行安排重试
 * 返回 'ok'（已跑起来） / 'retrying'（还在自动重试，先别回退） / 'failed'（可以回退了）
 */
function _realtimeTryStart(force, silent) {
    if (isRealtimeRunning()) { _realtimeFailCount = 0; _realtimeUnavailable = false; return 'ok'; }
    if (_realtimeBooting) return 'retrying';

    let ok = false;
    _realtimeBooting = true;
    try { ok = startRealtimeTrial(force, { silent: silent }); }
    catch (e) {
        // 宿主这一层再兜一次底：任何意外异常都不该把玩家留在白屏上
        console.warn('[试炼] 启动 2D 战斗时异常：', e);
        ok = false;
    } finally { _realtimeBooting = false; }

    if (ok) {
        _realtimeFailCount = 0;
        _realtimeUnavailable = false;
        return 'ok';
    }

    _realtimeFailCount++;
    if (!silent || _realtimeFailCount > _REALTIME_AUTO_RETRY) return 'failed';

    if (!_realtimeRetryTimer) {
        const delay = _REALTIME_RETRY_DELAY[_realtimeFailCount - 1] || 3200;
        _realtimeRetryTimer = setTimeout(function () {
            _realtimeRetryTimer = null;
            const t = _state.trial;
            // 期间玩家已经退出/结算了：不要偷偷重开一局
            if (!t || !t.active || t.gameOver) return;
            if (isRealtimeRunning()) { _realtimeFailCount = 0; return; }
            if (_realtimeTryStart(true, true) === 'failed') _realtimeGiveUp();
        }, delay);
    }
    return 'retrying';
}

/** 自动重试全部失败：弹回退面板，把文字模式铺好，本局不再折腾 */
function _realtimeGiveUp() {
    _realtimeUnavailable = true;
    const t2d = _trial2D();
    const why = (t2d && typeof t2d.lastError === 'function' && t2d.lastError()) || '未知原因';
    console.warn('[试炼] 2D 实时战斗不可用（已重试 ' + _realtimeFailCount + ' 次）：' + why);
    _show2DUnavailable(t2d);
    _addLog(`2D 实时战斗不可用（${why}），已回退到文字模式`);
    // 文字界面此前可能还没铺过（重试期间只是挂着），这里补上
    if (_state.trial && _state.trial.active && !_state.trial.gameOver) {
        enterTrialRoom();
        renderTrialUI();
        bindLegacyTrialButtons();
    }
}

// 同步 / 自动启动实时战斗（由 renderTrialUI 调用）
// 覆盖"从存档恢复试炼"的路径：该路径不经过 startTrial()，需要在此补启动
function _syncTrial2D() {
    const t2d = _trial2D();
    const screen = document.getElementById('trialScreen');
    if (!t2d || !screen) return;

    const t = _state.trial;
    if (!t || !t.active || t.gameOver) return;

    // 引擎已确认不可用 → 不再重试（保持文字模式回退）
    if (_realtimeUnavailable) return;
    // 自动重试排队中：交给定时器，本函数每次 UI 重绘都会被调用，不能在这里抢跑
    if (_realtimeRetryTimer || _realtimeBooting) return;

    // 本局已结束（死亡结算中 / 已退出）：不要自动重开一局
    const d = (t2d.debug && t2d.debug()) || null;
    if (d && (d.finished || d.deathOpen || d.shopOpen)) return;

    if (!isRealtimeRunning()) {
        if (_realtimeTryStart(false, true) === 'failed') _realtimeGiveUp();
    }
}

// 退出试炼时隐藏 2D 舞台
function _trial2DExit() {
    const t2d = _trial2D();
    const stage = document.getElementById('trial2DStage');
    const screen = document.getElementById('trialScreen');
    // 解除方向锁并退全屏：否则玩家会卡在横屏全屏里
    _exitLandscapeMode();
    // 清掉自动重试与启动提示：否则退出后还可能有一个定时器冒出来重开 2D
    _resetRealtimeRetry();
    _set2DBootHint(false);
    _set2DAlertOverlay(false);
    if (stage) stage.classList.add('hidden');
    if (screen) {
        screen.classList.remove('trial2d-active');
        screen.classList.remove('realtime-mode');
        screen.classList.remove('realtime-text-view');
    }
    document.body.classList.remove('realtime-trial');
    if (_state.trial) _state.trial._realtimeTextMode = false;
    _applyRealtimeTextModeButtons(false);
    _trial2DEnemySig = '';
    if (t2d) {
        if (t2d.stopRun) { try { t2d.stopRun(); } catch (e) { /* 忽略 */ } }
        if (t2d.exit) t2d.exit();
    }
}

/* ============================================================
   全屏实时战斗（取代回合制战斗）
   ------------------------------------------------------------
   进入试炼 → 全屏横版动作战斗 → 死亡/退出 → 结算并消费试炼点
   2D 引擎不可用时自动回退到原有回合制文字界面。
   ============================================================ */
let _realtimeRunEndedBound = false;
let _realtimeFloorBound = false;
let _realtimeRoomBound = false;

// 实时战斗的派生属性（暴击/闪避/荆棘/吸血/连击/斩杀）
// 单独抽出：商店购买遗物后可即时同步到 2D 画面里的主角，不影响当前生命值
function buildRealtimeDerivedStats() {
    const t = _state.trial;
    const p = t.player || {};
    return {
        // 暴击率：幸运等级 ×10%（上限 100，含遗物加成）
        critRate: Math.min((t.luckyLevel || 0) * 10 + (p.luckyBonus || 0), 100),
        critDamage: (t.critDamage || 150) + (p.critDamageBonus || 0),
        // 闪避：等级 ×5%（上限 50）
        dodge: Math.min((t.dodgeLevel || 0) * 5, 50),
        thorn: t.thornLevel || 0,
        vampire: t.vampireLevel || 0,
        // 连击：等级 ×5%（上限 40）
        combo: Math.min((t.comboLevel || 0) * 5, 40),
        // 斩杀：等级 ×5%（上限 40）
        execute: Math.min((t.executeLevel || 0) * 5, 40)
    };
}

// 把经典模式的养成属性映射为实时战斗属性
function buildRealtimePlayerStats() {
    const t = _state.trial;
    const p = t.player || {};
    return Object.assign({
        hp: p.hp,
        maxHp: p.maxHp,
        attack: p.attack,
        shield: p.shield || 0,
        potions: p.potions || 0
    }, buildRealtimeDerivedStats());
}

// 启动全屏实时战斗；返回 false 表示需要回退到文字模式
// opts.silent=true：失败时**不要**弹「本机无法启动」回退面板 —— 自动重试期间用，
//                   否则玩家会先看到一张「不支持」的告示，几秒后又自己好了。
function startRealtimeTrial(force, opts) {
    const silent = !!(opts && opts.silent);
    const t2d = _trial2D();
    const stage = document.getElementById('trial2DStage');
    const host = document.getElementById('trial2DCanvasHost');
    const screen = document.getElementById('trialScreen');
    const fallback = document.getElementById('trial2DFallback');
    if (!t2d || !stage || !host || !screen) return false;

    // 重试：清掉「已判定不可用」的标记，让 2D 层重新探测渲染器
    if (force) { _realtimeUnavailable = false; _trial2DInitTried = false; }

    // 进入全屏战斗布局
    screen.classList.add('realtime-mode');
    stage.classList.remove('hidden');
    document.body.classList.add('realtime-trial');
    if (fallback) fallback.classList.add('hidden');

    // 隐藏经典模式界面（存档恢复路径下 startTrial 的隐藏逻辑不会执行）
    const appShell = document.querySelector('.app-shell');
    if (appShell) appShell.style.display = 'none';
    const classicTopbar = document.querySelector('.topbar');
    if (classicTopbar) classicTopbar.style.display = 'none';

    // 自动重试期间先把「正在启动」摆出来：静默重试最长要 5 秒左右，
    // 什么都不显示的话玩家会对着一块黑屏发呆，看起来像卡死了。
    // 放在 isBooted 判断之外 —— 引擎可能已经建好、只是这一局没开起来，
    // 那种情况下同样需要给玩家一个交代。
    if (silent) _set2DBootHint(true);

    // 引擎初始化（失败则回退）
    if (!t2d.isBooted()) {
        if (!t2d.init(host, force)) {
            screen.classList.remove('realtime-mode');
            document.body.classList.remove('realtime-trial');
            if (silent) {
                // 还在重试：保留空舞台 + 启动提示，先不弹「本机无法启动」
                stage.classList.remove('hidden');
            } else {
                _set2DBootHint(false);
                stage.classList.remove('hidden');
                _show2DUnavailable(t2d);
            }
            return false;
        }
    }
    _set2DBootHint(false);
    // 引擎起来了：把整屏浮层交还给正常的 2D 战场布局
    _set2DAlertOverlay(false);
    // 移动端视口高度兜底：必须在下一次尺寸校正之前更新 CSS 变量
    _bindTrial2DVh();
    _updateTrial2DVh();
    // 移动端：尝试自动切横屏（全屏请求必须在用户手势的同步链里，这里还没出栈）
    _enterLandscapeMode();

    t2d.show();
    // 苹果设备：把舞台头部换成「怎么才能横屏全屏」的引导（Safari 锁不了横屏）
    _applyTrial2DHintForIOS();

    // 容器变为全屏后刷新画布尺寸
    const game = t2d.getGame();
    if (game && game.scale) { try { game.scale.refresh(); } catch (e) { /* 忽略 */ } }
    _refreshRealtimeCanvas();

    // 桥接（退出试炼 / 视图切换 / 画面内商店）
    _bindTrial2DBridge();
    if (_state.trial) _state.trial._realtimeTextMode = false;

    // 换层回调（仅绑定一次）：2D 里击败层主 → 宿主重掷诅咒与环境，再回传给 2D
    if (!_realtimeFloorBound && game && game.events) {
        game.events.on('trial2d:floor', function (payload) {
            try {
                const floor = (payload && payload.floor) || ((_state.trial.floor || 1) + 1);
                if (_state.trial) _state.trial.floor = floor;
                // 每条新诅咒都从文字版试炼的池子里取，不重复
                if (_state.trial && _state.trial.curses) {
                    const curse = pickRandomCurse();
                    if (curse) {
                        _state.trial.curses.push(curse);
                        _addLog(`深入第 ${floor} 层，获得诅咒：${curse.name}`);
                    }
                }
                // 环境效果：名字留到「进下一个房间」时再换（房间级节奏），
                // 但同一个环境在新层数下强度会变，所以按原名重新生成一遍数值
                const keepName = _state.environment ? _state.environment.name : null;
                _state.environment = generateEnvironmentEffect(floor, _state.difficulty, keepName);
                if (_state.environment) {
                    _addLog(`第 ${floor} 层环境效果：${_state.environment.name}` +
                        (_state.environment.displayValue ? ' ' + _state.environment.displayValue : ''));
                }
                syncRealtimeCursesEnv();
            } catch (e) {
                console.warn('[试炼] 换层同步诅咒/环境失败：', e);
            }
        });
        _realtimeFloorBound = true;
    }

    // 房间回调（仅绑定一次）：2D 里每进入一个房间 → 从袋子里抽一个新的环境效果
    if (!_realtimeRoomBound && game && game.events) {
        game.events.on('trial2d:room', function (payload) {
            try {
                const floor = (payload && payload.floor) || (_state.trial ? _state.trial.floor : 1);
                const prev = _state.environment ? _state.environment.name : null;
                _state.environment = rollRealtimeEnv(floor, prev);
                if (_state.environment) {
                    _addLog(`房间环境效果：${_state.environment.name}` +
                        (_state.environment.displayValue ? ' ' + _state.environment.displayValue : '') +
                        ` - ${formatEnvDescription(_state.environment)}`);
                }
                syncRealtimeCursesEnv();
            } catch (e) {
                console.warn('[试炼] 房间环境效果重掷失败：', e);
            }
        });
        _realtimeRoomBound = true;
    }

    // 战斗结束回调（仅绑定一次）
    if (!_realtimeRunEndedBound && game && game.events) {
        game.events.on('trial2d:run-ended', function (result) {
            onRealtimeRunEnded(result);
        });
        _realtimeRunEndedBound = true;
    }

    // 开局
    // 环境袋子洗净，开局这一个也从袋子里抽 —— 保证一局之内 15 个环境都会轮到
    resetRealtimeEnvBag();
    if (_state.trial) {
        _state.environment = rollRealtimeEnv(_state.trial.floor || 1,
            _state.environment ? _state.environment.name : null);
    }
    t2d.startRun({
        heroName: (_state.hero && _state.hero.name) || '冒险者',
        points: _state.trial.points || 0,
        player: buildRealtimePlayerStats(),
        difficulty: realtimeDifficulty(),
        skill: realtimeHeroSkill(),
        heroId: (_state.hero && _state.hero.id) || '',
        // 诅咒（文字版试炼的同一份）与环境效果（经典模式的那一套）一并交给 2D 实时化
        curses: (_state.trial.curses || []).map(c => c && c.name).filter(Boolean),
        environment: realtimeEnvironmentPayload()
    });

    _addLog('进入深渊试炼：全屏实时战斗开始！');
    return true;
}

// ============================================================
//  实时环境效果的「袋抽」发牌
// ------------------------------------------------------------
//  经典模式是「一层一个环境」，一层很快打完，一局能碰到很多个；
//  2D 的一层是 8 个房间的实时战斗，一层下来只掷一次 → 一局只见到三五个，
//  池子里另外十个永远轮不到，玩家体感就是「换来换去就那么几个」。
//  所以 2D 把节奏提到**每进入一个房间重掷一次**，并且不用纯随机、改用袋抽：
//  15 个洗成一叠逐个抽，抽空了才重洗 —— 一局内每个环境都会轮到，也不会连着两次同环境。
//  池子与数值仍然由经典模式的 generateEnvironmentEffect 提供（难度与层数照旧影响强度）。
// ============================================================
let _realtimeEnvBag = null;

function realtimeEnvNames() {
    if (typeof ENVIRONMENT_EFFECTS === 'undefined' || !Array.isArray(ENVIRONMENT_EFFECTS)) return [];
    return ENVIRONMENT_EFFECTS.map(e => e.name);
}

/** 洗一叠新牌；avoidLast 用来避免「上一叠最后一张」和「新一叠第一张」撞车 */
function refillRealtimeEnvBag(avoidLast) {
    const names = realtimeEnvNames();
    for (let i = names.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = names[i]; names[i] = names[j]; names[j] = t;
    }
    if (avoidLast && names.length > 1 && names[names.length - 1] === avoidLast) {
        const t = names[names.length - 1]; names[names.length - 1] = names[0]; names[0] = t;
    }
    _realtimeEnvBag = names;
    return _realtimeEnvBag;
}

/** 抽下一个环境效果（袋抽）；池子拿不到时回退到原来的随机 */
function rollRealtimeEnv(floor, avoidLast) {
    const names = realtimeEnvNames();
    if (!names.length) return generateEnvironmentEffect(floor, _state.difficulty);
    if (!_realtimeEnvBag || !_realtimeEnvBag.length) refillRealtimeEnvBag(avoidLast);
    const name = _realtimeEnvBag.pop();
    return generateEnvironmentEffect(floor, _state.difficulty, name);
}

/** 开新局时把牌叠清掉，下一局从头洗 */
function resetRealtimeEnvBag() { _realtimeEnvBag = null; }

/**
 * 实时战斗要用的环境效果载荷（经典模式的环境池，按当前层与难度生成）
 * 2D 只认名字与数值，具体怎么落到实时动作上由 试炼2D.js 决定。
 */
function realtimeEnvironmentPayload() {
    try {
        const env = _state.environment || generateEnvironmentEffect(_state.trial ? _state.trial.floor : 1, _state.difficulty);
        if (!env || !env.name) return null;
        return {
            name: env.name,
            values: env.values || {},
            displayValue: env.displayValue || '',
            description: formatEnvDescription(env)
        };
    } catch (e) {
        console.warn('[试炼] 环境效果载荷生成失败：', e);
        return null;
    }
}

/** 商店里与 2D 相关的特殊商品买完后要通知 2D（狂怒燃料 = 直接充满怒槽） */
function syncRealtimeShopItem(id) {
    const t2d = window.试炼2D;
    if (!t2d || typeof t2d.fillFury !== 'function') return false;
    if (id === 'fury_fuel') {
        const ok = t2d.fillFury();
        if (ok) _addLog('狂怒燃料：2D 画面中的狂怒值已充满');
        return ok;
    }
    return false;
}

/** 换层 / 状态变化时把诅咒与环境同步给 2D（没在跑就什么都不做） */
function syncRealtimeCursesEnv() {
    const t2d = window.试炼2D;
    if (!t2d || typeof t2d.setCursesEnv !== 'function') return false;
    try {
        t2d.setCursesEnv(
            (_state.trial && _state.trial.curses ? _state.trial.curses : []).map(c => c && c.name).filter(Boolean),
            realtimeEnvironmentPayload()
        );
        return true;
    } catch (e) { return false; }
}

// 实时战斗的环境主题（星雾 / 火星）按难度切换
function realtimeDifficulty() {
    const d = (_state && _state.difficulty) || 'normal';
    if (d !== 'custom') return d;
    try {
        const c = (typeof normalizeCustomDifficulty === 'function')
            ? normalizeCustomDifficulty(_state.customDifficulty) : null;
        const s = c ? (c.environmentScale || 1) : 1;
        if (s >= 1.2) return 'hell';
        if (s >= 1.05) return 'hard';
        return 'normal';
    } catch (e) { return 'hard'; }
}

// 实时战斗用的英雄技能数据（主动技能每层一次，被动按实时战斗尺度生效）
function realtimeHeroSkill() {
    const h = _state && _state.hero;
    if (!h || !h.skill) return null;
    return {
        id: h.id || '',
        name: h.skill.name || '',
        activeName: (h.skill.active && h.skill.active.name) || '',
        activeDesc: (h.skill.active && h.skill.active.description) || '',
        used: !!(_state.trial && _state.trial.heroSkillUsed)
    };
}

// 实时战斗结束：回写结果，然后退出试炼回到经典冒险
// 注意：死亡与商店都在 2D 画面内完成，这里不再切回文字界面
function onRealtimeRunEnded(result) {
    const t = _state.trial;
    if (!t || !t.active) return;
    result = result || {};

    const floor = result.floor || t.floor || 1;
    const points = (typeof result.points === 'number') ? result.points : (t.points || 0);
    const hpLeft = Math.max(0, result.hp || 0);

    if (!t.gameOver) {
        // 回写战斗结果（点数以 2D 战斗为准，已包含商店消费）
        t.floor = floor;
        t.points = points;
        if (t.player) {
            t.player.hp = hpLeft;
            t.player.shield = 0;
        }
        t.gameOver = true;
        t.endReason = (result.reason === 'dead') ? '生命耗尽' : '主动结束';
        _addLog(`试炼结束：到达第 ${floor} 层，剩余生命 ${hpLeft}，获得 ${t.points} 试炼点`);
        if (result.kills != null) {
            _addLog(`本局击败 ${result.kills} 个敌人，通过 ${result.rooms || 0} 个房间。`);
        }
    }

    // 结束 2D 画面（文字视图标记、全屏类、操作区按钮）后退出试炼
    _realtimeTextModeOff();

    // ===== 深渊回响：结算本局产出 =====
    // 活着从画面里点「退出试炼」= 主动撤离（额外 ×1.25）；战死 = 按成绩原价带走。
    // 2D 面板里已经把这条规则摆给玩家看过了（死亡面板 / 撤离确认框），这里不能再改口径。
    const reward = computeTrialReward({
        floor: floor,
        points: points,
        kills: result.kills || 0,
        extracted: result.reason !== 'dead'
    });
    t.trialReward = reward;

    exitTrial(reward);
}

/* ============================================================
   2D 画面 ⇄ 文字界面 切换
   ------------------------------------------------------------
   2D 引擎始终是本局的实际战斗载体；切到文字界面只是换一种显示：
   战斗暂停、面板显示实时数据，随时可切回 2D 继续打。
   ============================================================ */
let _realtimeShopSynced = false;

// 2D 引擎与文字逻辑的桥接：退出试炼 / 视图切换 / 画面内商店
function _bindTrial2DBridge() {
    const t2d = _trial2D();
    if (!t2d || typeof t2d.setBridge !== 'function') return;
    t2d.setBridge({
        selfTest: true,
        // 2D 画面内点「退出试炼」→ 回写结果并退出
        exit: function (result) { onRealtimeRunEnded(result); },
        // 2D 画面内点「文字界面」→ 切到文字视图
        toggleView: function () { showRealtimeTextView(); },
        // 画面内商店：目录与购买都走文字逻辑，保证两边一致
        shopData: function (points) { return buildRealtimeShopData(points); },
        shopBuy: function (id, points) { return buyRealtimeShopItem(id, points); },
        // 2D 画面内使用英雄技能 → 回写状态，保证文字界面 / 换层后的状态一致
        skillUsed: function (used) {
            const t = _state.trial;
            if (!t) return;
            const changed = !!t.heroSkillUsed !== !!used;
            t.heroSkillUsed = !!used;
            if (changed) {
                const nm = (t.hero && t.hero.skill && t.hero.skill.active && t.hero.skill.active.name) || '主动技能';
                _addLog(used ? `已在 2D 画面使用英雄技能「${nm}」（本层已使用）` : '进入新的一层：英雄技能已就绪');
            }
        },
        // 产出预览：2D 的死亡面板与撤离确认框要显示「这一局能带回经典模式什么」。
        // 只做纯计算，不落地 —— 真正写回发生在 exitTrial()。
        rewardPreview: function (opts) { return computeTrialReward(opts); }
    });
}

// 画面内商店目录（同步点数，返回可渲染的数据）
function buildRealtimeShopData(points) {
    const t = _state.trial;
    if (!t) return null;
    if (typeof points === 'number' && isFinite(points)) t.points = Math.max(0, Math.round(points));
    const catalog = buildTrialShopCatalog({ realtime: true });
    return { points: t.points, groups: catalog.groups };
}

// 画面内商店购买
function buyRealtimeShopItem(id, points) {
    const t = _state.trial;
    if (!t) return { ok: false, msg: '试炼未激活', points: 0 };
    if (typeof points === 'number' && isFinite(points)) t.points = Math.max(0, Math.round(points));
    const res = purchaseTrialShopItem(id);
    if (res.ok) {
        _addLog(`2D 商店购买：${res.name}（剩余 ${res.points} 试炼点）`);
        // 与 2D 相关的商品买完要落到画面上（狂怒燃料 → 怒槽直接充满）
        try { syncRealtimeShopItem(id); } catch (e) { console.warn('[试炼] 商店商品同步到 2D 失败：', e); }
    }
    return res;
}

// 切到文字界面：暂停 2D 战斗，面板显示实时数据
function showRealtimeTextView() {
    const t2d = _trial2D();
    const screen = document.getElementById('trialScreen');
    const stage = document.getElementById('trial2DStage');
    const t = _state.trial;
    if (!t2d || !screen || !t) return;

    t._realtimeTextMode = true;
    try { if (t2d.pauseRun) t2d.pauseRun(); } catch (e) { console.warn('[试炼] 暂停 2D 失败：', e); }

    if (stage) stage.classList.add('hidden');
    screen.classList.remove('realtime-mode');
    document.body.classList.remove('realtime-trial');
    const appShell = document.querySelector('.app-shell');
    if (appShell) appShell.style.display = 'none';
    const classicTopbar = document.querySelector('.topbar');
    if (classicTopbar) classicTopbar.style.display = 'none';
    if (window.AbyssAudio) AbyssAudio.setScene('explore');

    _updateRotateHint();   // 已离开 2D 全屏战斗：收起横屏提示
    _addLog('已切换到文字界面（2D 战斗已暂停）');
    renderTrialUI();
}

// 返回 2D 画面后校正画布尺寸（隐藏期间父容器为 0，Phaser 会把画布压成 0×0）
function _refreshRealtimeCanvas() {
    const t2d = _trial2D();
    const host = document.getElementById('trial2DCanvasHost');
    const game = (t2d && typeof t2d.getGame === 'function') ? t2d.getGame() : null;
    if (!game || !game.scale || !host) return;
    try {
        const w = Math.max(1, host.clientWidth || window.innerWidth);
        const h = Math.max(1, host.clientHeight || window.innerHeight);
        if (game.scale.width < 2 || game.scale.height < 2 ||
            Math.abs(game.scale.width - w) > 2 || Math.abs(game.scale.height - h) > 2) {
            game.scale.resize(w, h);
        }
    } catch (e) {
        console.warn('[试炼] 校正画布尺寸失败：', e);
    }
}

// 从文字界面回到 2D 画面
function resumeRealtimeView() {
    const t2d = _trial2D();
    const screen = document.getElementById('trialScreen');
    const stage = document.getElementById('trial2DStage');
    const t = _state.trial;
    if (!t2d || !screen || !stage || !t) return;

    t._realtimeTextMode = false;
    screen.classList.remove('realtime-text-view');
    stage.classList.remove('hidden');
    screen.classList.add('realtime-mode');
    document.body.classList.add('realtime-trial');
    const appShell = document.querySelector('.app-shell');
    if (appShell) appShell.style.display = 'none';
    const classicTopbar = document.querySelector('.topbar');
    if (classicTopbar) classicTopbar.style.display = 'none';

    try { t2d.show(); } catch (e) { /* 忽略 */ }
    _refreshRealtimeCanvas();
    try { if (t2d.resumeRun) t2d.resumeRun(); } catch (e) { console.warn('[试炼] 恢复 2D 失败：', e); }
    _applyRealtimeTextModeButtons(false);
    _updateRotateHint();   // 回到 2D 全屏战斗：竖屏的话重新提示横屏
    _addLog('已返回 2D 战斗画面');
}

// 收尾：清掉文字视图标记与相关样式
function _realtimeTextModeOff() {
    const t = _state.trial;
    if (t) t._realtimeTextMode = false;
    const screen = document.getElementById('trialScreen');
    if (screen) {
        screen.classList.remove('realtime-mode');
        screen.classList.remove('realtime-text-view');
    }
    document.body.classList.remove('realtime-trial');
    const stage = document.getElementById('trial2DStage');
    if (stage) stage.classList.add('hidden');
    _applyRealtimeTextModeButtons(false);
}

// 文字视图下：操作区只保留「返回 2D 画面」
function _applyRealtimeTextModeButtons(isText) {
    const area = document.getElementById('trialActionArea');
    if (area) {
        area.querySelectorAll('[data-action]').forEach(btn => {
            const a = btn.dataset.action;
            if (a === 'back-to-2d') {
                btn.style.display = isText ? '' : 'none';
                return;
            }
            // 主动技能按钮的显隐由原有逻辑管理，这里只在文字视图下临时隐藏
            if (btn.id === 'trialSkillBtn') {
                if (isText) btn.style.display = 'none';
                return;
            }
            btn.style.display = isText ? 'none' : '';
        });
    }
    // 绑定「返回 2D 画面」（实时战斗路径不会走 bindLegacyTrialButtons）
    const backBtn = document.getElementById('trialBackTo2DBtn');
    if (backBtn && !backBtn.dataset.rtBound) {
        backBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            resumeRealtimeView();
        });
        backBtn.dataset.rtBound = 'true';
    }
    const toggleBtn = document.querySelector('.trial-ghost-btn[data-action="toggle-2d"]');
    if (toggleBtn) toggleBtn.textContent = isText ? '2D 画面' : '文字界面';
    const screen = document.getElementById('trialScreen');
    if (screen) screen.classList.toggle('realtime-text-view', !!isText);
    const furyBtn = document.getElementById('trialFuryBurstBtn');
    if (furyBtn) furyBtn.style.display = isText ? 'none' : '';
}

// 文字视图的面板内容：全部来自 2D 战斗的实时快照
function _renderRealtimeTextView(t) {
    const t2d = _trial2D();
    const snap = (t2d && typeof t2d.snapshot === 'function') ? t2d.snapshot() : null;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    _applyRealtimeTextModeButtons(true);

    if (!snap) {
        set('trialHeroName', '实时战斗数据不可用');
        set('trialHeroSkill', '请点击「返回 2D 画面」继续战斗');
        return;
    }

    const h = snap.hero;
    set('trialHeroName', h.name + (snap.dead ? '（已倒下）' : ''));
    set('trialHeroSkill', `实时战斗 · 第 ${snap.floor} 层 · ${snap.roomName} · 击败 ${snap.kills} · 通过房间 ${snap.roomsCleared}`);
    set('trialRoundsDisplay', `第 ${snap.floor} 层 · ${snap.points} 点`);
    set('trialPlayerHp', `${h.hp} / ${h.maxHp}${h.shield > 0 ? '  +' + h.shield : ''}`);
    set('trialPlayerAttack', h.attack);
    set('trialPlayerShield', h.shield);
    set('trialPlayerPotions', h.potions);
    set('trialPlayerLucky', h.critRate + '%');
    set('trialPlayerCritDamage', h.critDamage + '%');
    set('trialPlayerThorn', h.thorn);
    set('trialPlayerVampire', h.vampire);
    set('trialPlayerDodge', h.dodge + '%');
    set('trialPlayerCombo', h.combo + '%');
    set('trialPlayerExecute', h.execute + '%');
    set('trialPlayerPoints', snap.points);

    const heroEmojiEl = document.getElementById('trialPlayerEmoji');
    if (heroEmojiEl) heroEmojiEl.textContent = _trialEmoji('hero', h.name);

    // 敌人属性：当前目标 + 剩余敌人明细
    const alive = (snap.enemies || []).filter(e => e.alive);
    const near = alive[0] || null;
    if (near) {
        set('trialEnemyName', `${near.name}（${near.tierName}）`);
        set('trialEnemyHp', `HP: ${near.hp} / ${near.maxHp}`);
    } else {
        set('trialEnemyName', snap.enemiesAlive ? '—' : '本房间已清空');
        set('trialEnemyHp', '');
    }
    const statsEl = document.getElementById('trialEnemyStats');
    if (statsEl) {
        if (!alive.length) {
            statsEl.innerHTML = '<span style="color:var(--muted);">当前房间没有存活敌人，走向传送门继续深入</span>';
        } else {
            statsEl.innerHTML = alive.map(e =>
                `<div class="trial-enemy-stat-row">${e.name} · ${e.tierName}　生命 ${e.hp}/${e.maxHp}　攻击 ${e.atk}　速度 ${e.speed}　${e.behaviorName}</div>`
            ).join('');
        }
    }
    const enemyEmojiEl = document.getElementById('trialEnemyEmoji');
    if (enemyEmojiEl && near) enemyEmojiEl.textContent = _trialEmoji('enemy', near.name);
}

// 文字视图下点「退出试炼」：先回写实时数据再退出
function _realtimeExitTrial() {
    const t2d = _trial2D();
    const t = _state.trial;
    if (!t || !t.active) return;   // 幂等：结算过一次就不再重复
    let snap = null;
    if (t2d && typeof t2d.snapshot === 'function' && !t.gameOver) {
        try {
            snap = t2d.snapshot();
            if (snap) {
                t.floor = snap.floor;
                t.points = snap.points;
                if (t.player) { t.player.hp = snap.hero.hp; t.player.shield = 0; }
                t.gameOver = true;
                t.endReason = '主动结束';
                _addLog(`试炼结束：到达第 ${snap.floor} 层，获得 ${snap.points} 试炼点`);
            }
        } catch (e) { console.warn('[试炼] 回写实时数据失败：', e); }
    }
    _realtimeTextModeOff();
    // 从顶栏退出 = 主动撤离：与 2D 画面内「退出试炼」走同一套结算口径
    const reward = computeTrialReward({
        floor: t.floor || 1,
        points: t.points || 0,
        kills: (snap && snap.kills) || 0,
        extracted: true
    });
    t.trialReward = reward;
    exitTrial(reward);
}

// 切换 2D 画面 / 文字界面（试炼始终以 2D 实时战斗进行，这里只切换显示方式）
function _toggleTrial2D() {
    const t2d = _trial2D();
    if (!t2d) {
        _showToast('2D 模块未加载');
        return;
    }
    // 引擎若被设置关闭，先启用（试炼即 2D）
    if (t2d.isEnabled() === false) {
        t2d.setEnabled(true);
        if (typeof loadSettings === 'function' && typeof saveSettings === 'function') {
            try {
                const s = loadSettings();
                s.trial2D = true;
                saveSettings(s);
                if (typeof applySettings === 'function') applySettings(s);
            } catch (e) {
                console.warn('[试炼] 同步 2D 设置失败：', e);
            }
        }
    }
    const t = _state.trial;
    if (t && t._realtimeTextMode) {
        resumeRealtimeView();
    } else {
        showRealtimeTextView();
    }
    renderTrialUI();
}

function trialAttackEnemy() {
    const trial = _state.trial;
    if (trial.mode !== 'trialCombat' || !trial.combat || trial.gameOver) return;
    if (trial.rounds >= trial.maxRounds) {
        endTrial('回合耗尽');
        return;
    }
    trial.rounds++;
    const env = trial.combat.environment || {};
    const enemy = trial.combat.enemy;

    // 攻击 = 基础攻击 + 随机 + 环境临时加成（最低1）
    let damage = Math.max(1, trial.player.attack
    + Math.floor(Math.random() * 3)
    + (trial.player.tempAttackBonus || 0));

    // 应用攻击百分比修正（虚弱之雾、能量涌动等）
    if (state.environment) {
      if (trial.player.attackPercentMod !== undefined && trial.player.attackPercentMod !== 1) {
        damage = Math.max(1, Math.round(damage * trial.player.attackPercentMod));
      }
    }

    // 敌人闪避（基础 + 环境加成）
    const enemyDodge = (enemy.dodge || 0) + (enemy.dodgeBonus || 0);
    if (enemyDodge > 0 && Math.random() < enemyDodge / 100) {
        _addLog(`${enemy.name} 闪避了攻击！`);
        if (window.AbyssAudio) AbyssAudio.sfx('dodge');
        _trialFloat('enemy', '闪避', 'dodge');
        _trialPlayAnim('enemy', 'dodge');
        _trialBtnFlash('攻击');
        trialEnemyTurn();
        return;
    }

    // 玩家暴击（基础 + 环境加成）
    let critHappened = false;
    const luckyChance = Math.min((trial.luckyLevel || 0) * 10 + (trial.player.luckyBonus || 0), 100);
    if (luckyChance > 0 && Math.random() < luckyChance / 100) {
        const critMultiplier = ((trial.critDamage || 150) + (trial.player.critDamageBonus || 0)) / 100;
        damage = Math.round(damage * critMultiplier);
        trial.critCount = (trial.critCount || 0) + 1;
        critHappened = true;
        _addLog(`暴击！${damage}点伤害！`);
        if (window.AbyssAudio) AbyssAudio.sfx('crit');
    }

    if (trial.pendingAttackBoost > 0) {
        damage += trial.pendingAttackBoost;
        trial.pendingAttackBoost = 0;
    }
    if (trial.heroSkillBonus > 0) {
        damage += trial.heroSkillBonus;
        trial.heroSkillBonus = 0;
        trial.heroSkillUsed = true;
    }
    if (trial.hero?.skill?.onAttack) {
        damage = trial.hero.skill.onAttack(damage, trial.combat.turn);
    }
    if (trial.heroPendingHeal > 0) {
        let healAmount = trial.heroPendingHeal;
        const env = trial.combat.environment;
        if (env && typeof env.onHeal === 'function') {
            healAmount = env.onHeal(healAmount);
        }
        trial.player.hp = Math.min(trial.player.maxHp, trial.player.hp + healAmount);
        trial.heroPendingHeal = 0;
    }
    // 魅惑减伤（影·魅）
    if (_state.damageReduction > 0) {
        damage = Math.max(1, Math.round(damage * (1 - _state.damageReduction / 100)));
    }
    // 应用环境伤害修正（厄运等）
    if (env && env.damageModifier) {
        const mod = env.damageModifier;
        damage = Math.round(damage * (1 + mod));
        if (mod !== 0) {
            _addLog(`环境效果使伤害 ${mod > 0 ? '增加' : '减少'} ${Math.abs(mod * 100).toFixed(1)}%`);
        }
    }

    // 敌人减伤：受到的攻击按百分比减免（上限 99%）
    const enemyArmor = (enemy.armor || 0) + (enemy.armorBonus || 0);
    if (enemyArmor > 0 && damage > 1) {
        const reduced = Math.max(1, Math.round(damage * (1 - enemyArmor / 100)));
        if (reduced < damage) {
            _addLog(`${enemy.name} 的减伤抵消了 ${damage - reduced} 点伤害。`);
            damage = reduced;
        }
    }

    enemy.hp -= damage;
    enemy.hp = Math.max(0, enemy.hp);
    _addLog(`你造成 ${damage} 伤害。`);
    if (window.AbyssAudio) AbyssAudio.sfx('attack');
    _trialFloat('enemy', '-' + damage, critHappened ? 'crit' : 'damage');
    _trialPlayAnim('enemy', 'hit');
    _trialBtnFlash('攻击');

    const enemyThorn = enemy.thorn || 0;
    if (enemyThorn > 0 && damage > 0) {
        const thornDmg = Math.min(enemyThorn, Math.round(damage * 0.3));
        trial.player.hp -= thornDmg;
        _addLog(`荆棘反弹 ${thornDmg} 伤害！`);
        _trialFloat('player', '-' + thornDmg, 'thorn');
        _trialPlayAnim('player', 'hit');
        if (trial.player.hp <= 0) {
            clearTrialTempBonuses();   // ← 出口清理
            endTrial('死亡');
            return;
        }
    }

    // 连击判定（基础 + 环境加成）
    const comboChance = Math.min((trial.comboLevel || 0) * 5 + (trial.player.comboBonus || 0), 40);
    if ((trial.isFirstAttack && trial.hasFirstAttackCombo) ||
        (comboChance > 0 && Math.random() < comboChance / 100)) {
        let comboDamagePercent = 0.5 + (trial.comboDamageBonus || 0) / 100;
        const comboDamage = Math.max(1, Math.round(damage * comboDamagePercent));
        enemy.hp -= comboDamage;
        trial.comboCount = (trial.comboCount || 0) + 1;
        _addLog(`连击！额外 ${comboDamage} 伤害！`);
        _trialFloat('enemy', '连击 -' + comboDamage, 'combo');
        if (window.AbyssAudio) AbyssAudio.sfx('combo');
    }
    trial.isFirstAttack = false;

    if (enemy.combo > 0 && enemy.hp > 0 && Math.random() < enemy.combo / 100) {
        const counterDmg = Math.max(1, Math.round(enemy.attack * 0.4));
        trial.player.hp -= counterDmg;
        _addLog(`${enemy.name} 连击反击！${counterDmg} 伤害！`);
        _trialFloat('player', '-' + counterDmg, 'damage');
        _trialPlayAnim('player', 'hit');
        _trialScreenShake();
        if (trial.player.hp <= 0) {
            clearTrialTempBonuses();   // ← 出口清理
            endTrial('死亡');
            return;
        }
    }

    const executeChance = Math.min((trial.executeLevel || 0) * 5, 40);
    const threshold = trial.executeThreshold || 0.3;
    if (executeChance > 0 && enemy.hp > 0 && enemy.hp / enemy.maxHp <= threshold) {
        if (Math.random() < executeChance / 100) {
            enemy.hp = 0;
            trial.executeCount = (trial.executeCount || 0) + 1;
            _addLog(`斩杀触发！秒杀！`);
            _trialFloat('enemy', '斩杀!', 'execute');
            _trialPlayAnim('enemy', 'hit');
            if (window.AbyssAudio) AbyssAudio.sfx('execute');
        }
    }

    if ((trial.vampireLevel || 0) > 0) {
        let heal = trial.vampireLevel;
        const env = trial.combat.environment;
        if (env && typeof env.onHeal === 'function') {
            heal = env.onHeal(heal);
        }
        trial.player.hp = Math.min(trial.player.maxHp, trial.player.hp + heal);
        _addLog(`吸血恢复 ${heal} 生命。`);
        _trialFloat('player', '+' + heal, 'vampire');
    }

    if (trial.curses.some(c => c.name === '吸血反噬')) {
        trial.player.hp = Math.max(1, trial.player.hp - 1);
        _addLog('诅咒“吸血反噬”生效，你失去了1点生命。');
        _trialFloat('player', '-1', 'curse');
        _trialPlayAnim('player', 'hit');
        if (trial.player.hp <= 0) {
            clearTrialTempBonuses();   // ← 出口清理
            endTrial('死亡');
            return;
        }
    }

    trial.fury = Math.min(trial.furyMax, trial.fury + 1);

    // ===== 环境：玩家攻击钩子 =====
    if (env && typeof env.onPlayerAttack === 'function') {
        env.onPlayerAttack(trial.player, enemy);
    }

    if (enemy.hp <= 0) {
        handleTrialEnemyDefeat(enemy, env);
        return;
    }

    trialEnemyTurn();
    renderTrialUI();
}

function openTrialShop(fromBoss = false) {
  if (fromBoss) {
    _state.trial._shopFromBoss = true;
  }
  const modal = document.getElementById('trialShopModal');
  if (!modal) return;
  // 实时战斗进行中：点数以 2D 画面为准（两边共用同一份数据）
  syncTrialPoints('from2d');
  // 进入试炼商店：BGM 切到商店场景
  if (window.AbyssAudio) AbyssAudio.setScene('shop');
  document.getElementById('trialPointsDisplay').textContent = _state.trial.points;
  renderTrialShopItems();
  modal.classList.remove('hidden');

  // ===== 绑定关闭按钮事件（只执行一次） =====
  const closeBtns = modal.querySelectorAll('[data-action="close-trial-shop"]');
  closeBtns.forEach(btn => {
    if (!btn.dataset.trialBound) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        Trial.handleAction('close-trial-shop');
      });
      btn.dataset.trialBound = 'true';
    }
  });
}

function closeTrialShop() {
  // 先关闭模态框
  const modal = document.getElementById('trialShopModal');
  if (modal) modal.classList.add('hidden');

  // 若游戏已结束，则不做后续操作（不进入下一层）
  if (_state.trial.gameOver) {
    // 试炼已结束，BGM 回到菜单氛围
    if (window.AbyssAudio) AbyssAudio.setScene('menu');
    renderTrialUI(); // 刷新界面，确保显示结束状态
    return;
  }

  // 若商店是从 Boss 胜利打开，关闭后进入下一房间
  if (_state.trial.active && _state.trial._shopFromBoss) {
    _state.trial._shopFromBoss = false;
    if (!_state.trial.gameOver) {
      _state.trial.roomIndex++;
      enterTrialRoom();
    }
  }

  // 刷新界面
  renderTrialUI();
}

/* ============================================================
   试炼商店目录
   ------------------------------------------------------------
   文字界面的商店弹窗与 2D 画面内商店共用这一份数据与购买逻辑，
   两边的价格、限购、已拥有状态永远一致。
   ============================================================ */
function buildTrialShopCatalog(opts) {
  const is2D = !!(opts && opts.realtime);
  const unlocks = loadTrialUnlocks();
  if (!unlocks.purchaseCounts) unlocks.purchaseCounts = {};
  const trial = _state.trial;
  const points = trial.points;

  // ===== A. 常驻强化（可重复购买，价格递增） =====
  const boostItems = [
    {
      id: 'attack_boost',
      label: '淬火磨刀石',
      desc: '攻击 +2',
      basePrice: 14,
      increment: 8,
      apply: () => {
        unlocks.attackBonus = (unlocks.attackBonus || 0) + 2;
        unlocks.purchaseCounts['attack_boost'] = (unlocks.purchaseCounts['attack_boost'] || 0) + 1;
        saveTrialUnlocks(unlocks);
        _addLog('淬火磨刀石：攻击 +2');
      }
    },
    {
      id: 'hp_boost',
      label: '生命之种',
      desc: '生命上限 +6',
      basePrice: 16,
      increment: 8,
      apply: () => {
        unlocks.hpBonus = (unlocks.hpBonus || 0) + 6;
        unlocks.purchaseCounts['hp_boost'] = (unlocks.purchaseCounts['hp_boost'] || 0) + 1;
        saveTrialUnlocks(unlocks);
        _addLog('生命之种：生命上限 +6');
      }
    },
    {
      id: 'thorn_boost',
      label: '荆棘种子',
      desc: '荆棘 +1',
      basePrice: 10,
      increment: 6,
      apply: () => {
        unlocks.thornBonus = (unlocks.thornBonus || 0) + 1;
        unlocks.purchaseCounts['thorn_boost'] = (unlocks.purchaseCounts['thorn_boost'] || 0) + 1;
        saveTrialUnlocks(unlocks);
        _addLog('荆棘种子：荆棘 +1');
      }
    },
    {
      id: 'vampire_boost',
      label: '吸血獠牙',
      desc: '吸血 +1',
      basePrice: 14,
      increment: 10,
      apply: () => {
        unlocks.vampireBonus = (unlocks.vampireBonus || 0) + 1;
        unlocks.purchaseCounts['vampire_boost'] = (unlocks.purchaseCounts['vampire_boost'] || 0) + 1;
        saveTrialUnlocks(unlocks);
        _addLog('吸血獠牙：吸血 +1');
      }
    },
    {
      id: 'crit_damage_boost',
      label: '致命精髓',
      desc: '暴击伤害 +3%',
      basePrice: 10,
      increment: 5,
      apply: () => {
        unlocks.critDamageBonus = (unlocks.critDamageBonus || 0) + 3;
        unlocks.purchaseCounts['crit_damage_boost'] = (unlocks.purchaseCounts['crit_damage_boost'] || 0) + 1;
        saveTrialUnlocks(unlocks);
        _addLog('致命精髓：暴击伤害 +3%');
      }
    },
    {
      id: 'point_rate',
      label: '试炼学精要',
      desc: '试炼点数获取 +25%（最多4次）',
      basePrice: 10,
      increment: 6,
      maxCount: 4,
      apply: () => {
        unlocks.pointRateBonus = (unlocks.pointRateBonus || 0) + 25;
        unlocks.purchaseCounts['point_rate'] = (unlocks.purchaseCounts['point_rate'] || 0) + 1;
        saveTrialUnlocks(unlocks);
        _addLog('试炼学精要：试炼点数获取 +25%');
      }
    },
    {
      id: 'attack_major',
      label: '深渊之力',
      desc: '攻击 +10',
      basePrice: 50,
      increment: 30,
      apply: () => {
        unlocks.attackBonus = (unlocks.attackBonus || 0) + 10;
        unlocks.purchaseCounts['attack_major'] = (unlocks.purchaseCounts['attack_major'] || 0) + 1;
        saveTrialUnlocks(unlocks);
        _addLog('深渊之力：攻击 +10');
      }
    },
    {
      id: 'hp_major',
      label: '泰坦之血',
      desc: '生命上限 +30',
      basePrice: 55,
      increment: 35,
      apply: () => {
        unlocks.hpBonus = (unlocks.hpBonus || 0) + 30;
        unlocks.purchaseCounts['hp_major'] = (unlocks.purchaseCounts['hp_major'] || 0) + 1;
        saveTrialUnlocks(unlocks);
        _addLog('泰坦之血：生命上限 +30');
      }
    }
  ];

  // ===== B. 遗物解锁（一次性） =====
  const relicItems = [
    { id: 'trial_heal', label: '试炼生命', desc: '每层开始恢复2生命', price: 20 },
    { id: 'trial_point', label: '试炼印记', desc: '战斗胜利额外+1试炼点', price: 24 },
    { id: 'trial_lucky', label: '试炼幸运', desc: '暴击率 +5%', price: 24 },
    { id: 'trial_shield', label: '试炼护盾', desc: '每层开始获得3护盾', price: 28 },
    { id: 'trial_attack', label: '试炼利刃', desc: '试炼中攻击 +1', price: 22 },
    { id: 'trial_blade', label: '试炼之刃', desc: '攻击 +2', price: 26 },
    { id: 'abyss_heart', label: '深渊之心', desc: '每回合恢复1生命', price: 35 },
    { id: 'trial_seed', label: '丰饶印记', desc: '进入试炼时获得8试炼点', price: 18 },
    { id: 'trial_contract', label: '契约印记', desc: '每层开始获得1试炼点', price: 22 },
  ];
  const relicMap = {
    'trial_shield': { label: '试炼护盾' },
    'trial_point': { label: '试炼印记' },
    'trial_heal': { label: '试炼生命' },
    'trial_attack': { label: '试炼利刃' },
    'trial_lucky': { label: '试炼幸运' },
    'trial_blade': { label: '试炼之刃' },
    'abyss_heart': { label: '深渊之心' },
    'trial_seed': { label: '丰饶印记' },
    'trial_contract': { label: '契约印记' },
  };
  relicItems.forEach(item => {
    item.apply = () => {
      if (unlocks.unlockedRelics.includes(item.id)) return;
      unlocks.unlockedRelics.push(item.id);
      saveTrialUnlocks(unlocks);
      _addLog(`解锁遗物：${item.label}`);
      _showToast(`✅ 解锁遗物：${item.label}`);
      // 立即应用遗物效果（本局就能吃到）
      if (relicMap[item.id]) {
        const relic = relicMap[item.id];
        applyTrialRelicEffect(relic);
        // 同步加入本局遗物列表，让界面上显示徽章
        _state.trial.relics.push({ ...relic, description: item.desc, rarity: 'rare' });
      }
      renderTrialUI();
    };
  });

  // ===== C. 特殊商品 =====
  const specialItems = [
    {
      id: 'hourglass',
      label: '时光沙漏',
      desc: '本局回合上限 +10（限购1个）',
      price: 30,
      apply: () => {
        if (trial.hourglassUsed) {
          _showToast('时光沙漏已使用过，本局无法再次购买');
          return;
        }
        trial.maxRounds += 10;
        trial.hourglassUsed = true;
        _addLog(`时光沙漏：回合上限 +10，当前 ${trial.maxRounds} 回合`);
        _showToast(`时光沙漏：回合上限 +10，当前 ${trial.maxRounds} 回合`);
        renderTrialUI();
      }
    },
    {
      id: 'fury_fuel',
      label: '狂怒燃料',
      desc: '立刻充满狂怒值',
      price: 12,
      apply: () => {
        if (trial.gameOver) {
          _showToast('试炼已结束，狂怒燃料无法生效');
          return;
        }
        if (trial.fury >= trial.furyMax) {
          _showToast('狂怒值已满，无需使用燃料');
          return;
        }
        trial.fury = trial.furyMax;
        _addLog('狂怒燃料：狂怒值已充满！');
        _showToast('狂怒值已充满！');
        renderTrialUI();
      }
    }
  ];

  // ===== 组装目录 =====
  const groups = [];

  groups.push({
    key: 'boost',
    title: '常驻强化',
    items: boostItems.map(it => {
      const count = unlocks.purchaseCounts[it.id] || 0;
      const price = it.basePrice + it.increment * count;
      const maxed = it.maxCount != null && count >= it.maxCount;
      const affordable = points >= price && !maxed;
      return {
        id: it.id, label: it.label, desc: it.desc, price: price, count: count,
        maxed: maxed, owned: false, affordable: affordable, group: '常驻强化',
        tag: maxed ? '已满级' : (price + ' 点'),
        note: maxed ? '已达上限' : (count > 0 ? ('已购 ' + count + ' 次' + (affordable ? ' · 可再买' : '')) : (affordable ? '点击购买' : '点数不足')),
        buy: () => it.apply()
      };
    })
  });

  groups.push({
    key: 'relic',
    title: '遗物解锁',
    items: relicItems.map(it => {
      const owned = unlocks.unlockedRelics.includes(it.id);
      const affordable = points >= it.price && !owned;
      const legacyOnly = (it.id === 'trial_shield' || it.id === 'trial_point' || it.id === 'trial_heal' || it.id === 'abyss_heart' || it.id === 'trial_seed' || it.id === 'trial_contract');
      return {
        id: it.id, label: it.label, desc: it.desc, price: it.price,
        maxed: false, owned: owned, affordable: affordable, group: '遗物解锁',
        tag: owned ? '✅ 已拥有' : (it.price + ' 点'),
        note: owned ? '已解锁' : (affordable ? '点击购买' : '点数不足或已拥有'),
        note2d: (is2D && legacyOnly && !owned) ? '（2D 中效果有限）' : '',
        buy: () => it.apply()
      };
    })
  });

  groups.push({
    key: 'special',
    title: '特殊商品',
    items: specialItems.map(it => {
      const owned = it.id === 'hourglass' ? (trial.hourglassUsed || false) : false;
      const affordable = points >= it.price && !owned && !trial.gameOver;
      let note = owned ? '已使用' : (affordable ? '点击购买' : '点数不足');
      if (it.id === 'fury_fuel' && trial.fury >= trial.furyMax && !trial.gameOver) note = '狂怒已满';
      return {
        id: it.id, label: it.label, desc: it.desc, price: it.price,
        maxed: false, owned: owned, affordable: affordable, group: '特殊商品',
        tag: owned ? '✅ 已使用' : (it.price + ' 点'),
        note: note,
        note2d: is2D ? '2D 战斗中无效' : '',
        buy: () => it.apply()
      };
    })
  });

  return { points: points, groups: groups };
}

// ============================================================
// 购买商品（文字弹窗与 2D 画面内商店共用的唯一入口）
// ============================================================
function purchaseTrialShopItem(id) {
  const t = _state.trial;
  if (!t) return { ok: false, msg: '试炼未激活', points: 0 };
  const catalog = buildTrialShopCatalog();
  let target = null;
  catalog.groups.forEach(g => g.items.forEach(it => { if (it.id === id) target = it; }));
  if (!target) return { ok: false, msg: '商品不存在', points: t.points };
  if (target.owned) return { ok: false, msg: `${target.label}：已拥有`, points: t.points };
  if (target.maxed) return { ok: false, msg: `${target.label}：已达购买上限`, points: t.points };
  if (t.points < target.price) return { ok: false, msg: `试炼点数不足（需要 ${target.price} 点）`, points: t.points };

  t.points -= target.price;
  if (window.AbyssAudio) AbyssAudio.sfx('buy');
  target.buy();
  // 2D 实时战斗中：把最新养成属性同步到画面里的主角
  syncRealtimeShopStats();
  return { ok: true, name: target.label, points: t.points };
}

// 商店购买后同步属性到 2D 实时战斗（遗物即时生效）
function syncRealtimeShopStats() {
  const t2d = _trial2D();
  if (!t2d || typeof t2d.syncPlayer !== 'function' || !isRealtimeRunning()) return;
  const t = _state.trial;
  if (!t || !t.player) return;
  try {
    t2d.syncPlayer(Object.assign({ attack: t.player.attack }, buildRealtimeDerivedStats()));
  } catch (e) {
    console.warn('[试炼] 同步商店属性到 2D 失败：', e);
  }
}

// 文字商店与 2D 画面共用试炼点数：打开前从 2D 拉取，购买后回写 2D
function syncTrialPoints(direction) {
  const t2d = _trial2D();
  if (!t2d || !_state || !_state.trial) return;
  try {
    if (direction === 'from2d') {
      if (typeof t2d.snapshot === 'function' && isRealtimeRunning()) {
        const snap = t2d.snapshot();
        if (snap && typeof snap.points === 'number') _state.trial.points = snap.points;
      }
    } else if (typeof t2d.setPoints === 'function') {
      t2d.setPoints(_state.trial.points);
    }
  } catch (e) {
    console.warn('[试炼] 同步试炼点数失败：', e);
  }
}

function renderTrialShopItems() {
  const container = document.getElementById('trialShopItems');
  if (!container) return;
  const catalog = buildTrialShopCatalog();
  const tabStyle = 'color:var(--accent-2);font-weight:600;font-size:0.85rem;padding:10px 0 4px;border-bottom:1px solid rgba(255,255,255,0.06);';

  let html = '';
  catalog.groups.forEach(group => {
    html += `<div style="${tabStyle}">${group.title}</div>`;
    group.items.forEach(item => {
      const cls = item.owned ? 'achieved' : (item.affordable ? '' : 'disabled');
      const priceColor = item.owned ? 'var(--accent)' : 'var(--accent-2)';
      const note = [item.note, item.note2d].filter(Boolean).join(' · ');
      html += `
      <div class="condition-item ${cls}" data-item-id="${item.id}" style="${item.affordable ? 'cursor:pointer;' : 'opacity:0.6;'}">
        <strong>${item.label}</strong>
        <span style="color:var(--muted);font-size:0.75rem;">${item.desc}</span>
        <span style="color:${priceColor};font-weight:600;">${item.tag}</span>
        <p style="font-size:0.7rem;color:var(--muted);">${note}</p>
      </div>`;
    });
  });
  container.innerHTML = html;

  // 点击购买：走统一入口，保证与 2D 商店行为一致
  container.querySelectorAll('.condition-item').forEach(el => {
    el.addEventListener('click', function () {
      const res = purchaseTrialShopItem(el.dataset.itemId);
      if (!res.ok) {
        if (window.AbyssAudio) AbyssAudio.sfx('error');
        _showToast(res.msg);
        return;
      }
      const display = document.getElementById('trialPointsDisplay');
      if (display) display.textContent = _state.trial.points;
      syncTrialPoints('to2d');
      renderTrialShopItems();
    });
  });
}


function endTrial(reason) {
  const trial = _state.trial;
  if (trial.gameOver) return;
  trial.gameOver = true;
  trial.mode = 'trialEnd';
  trial.endReason = reason;
  _addLog(`试炼结束：${reason}`);
  if (window.AbyssAudio) {
    if (reason === '死亡') AbyssAudio.sfx('defeat');
    AbyssAudio.setScene('explore');
  }
  const remainingRounds = trial.maxRounds - trial.rounds;
  const pointRate = getTrialPointRate();
  // 剩余回合奖励同样应用点数率，并吞掉本局累计的小数余数
  const raw = remainingRounds * 0.5 * pointRate + (trial.pointRateCarry || 0);
  const bonusPoints = Math.floor(raw);
  trial.pointRateCarry = raw - bonusPoints;
  if (trial.pointRateCarry < 1e-9) trial.pointRateCarry = 0;
  trial.points += bonusPoints;
  _addLog(`剩余回合奖励：${bonusPoints} 点`);
  openTrialShop();
  renderTrialUI();
}

/**
 * 退出试炼，回到经典冒险。
 * reward 可选：computeTrialReward() 的产物。传了就把产出带回经典模式并弹结算横幅；
 * 不传（例如旧调用点直接退出）则维持「无损还原」的旧行为。
 */
function exitTrial(reward) {
  const trial = _state.trial;
  const backup = trial._backup;   // 先留住引用：下面会把 trial._backup 置空
  if (backup) {
    _state.player = backup.player;
    _state.relics = backup.relics;
    _state.bonuses = backup.bonuses;
    _state.hero = backup.hero;
    trial._backup = null;
  } else {
    _state.player = trial.player;
    _state.relics = trial.relics;
    _state.bonuses = trial.bonuses;
    _state.hero = trial.hero;
  }
  // 兜底：无论从哪条路把 hero 装回来，都把技能函数接一次。
  // 经 JSON 序列化过的 hero 只剩 { name, description }，没有 execute —— 那样
  // 经典模式的技能按钮会在、点了却没反应（见 restoreHeroSkillBinding 的说明）。
  if (typeof restoreHeroSkillBinding === 'function') {
    try { restoreHeroSkillBinding(_state.hero); } catch (e) { /* 不阻断退出流程 */ }
  }
  // ===== 深渊回响：把本局产出带回经典模式 =====
  // 必须排在还原备份之后 —— 否则刚加上的金币会被 _backup.player 整个覆盖掉
  if (reward) applyTrialReward(reward);
  trial.active = false;
  trial.gameOver = false;
  _state.trial.active = false;
  // 隐藏试炼界面，显示经典界面
  const screen = document.getElementById('trialScreen');
  if (screen) screen.classList.add('hidden');
  const classicTopbar = document.querySelector('.topbar');
  if (classicTopbar) classicTopbar.style.display = '';
  // ===== 恢复经典模式容器 =====
  const appShell = document.querySelector('.app-shell');
  if (appShell) appShell.style.display = '';

  // ===== 隐藏 2D 舞台（阶段1） =====
  _trial2DExit();

  _state.trial.player = null;
  // ===== 经典模式的「位置」与「环境」归位 =====
  // 旧代码固定把 mode 设成 'event'，然后走 enterCurrentRoom() / advanceRoom()：
  //   · enterCurrentRoom() 在敌人房会 startCombat() —— 平白重开一场已经打完的战斗
  //   · 房间索引越界时它内部会 advanceRoom() —— 玩家白跳过一个房间
  //   · 环境用 generateEnvironmentEffect() 重新随机 —— 进去前是「灼热」，出来变成别的
  // 试炼是副本，「退出」的语义就是回到进去之前，这三样都必须原样还原。
  if (backup && backup.mode !== undefined) {
    _state.mode = backup.mode;
    if (backup.currentRoom !== undefined) _state.currentRoom = backup.currentRoom;
    if (backup.combat !== undefined) _state.combat = backup.combat;
    if (backup.environment !== undefined) _state.environment = backup.environment;
  } else {
    // 没有备份（例如从存档恢复到试炼中）：退回安全值，并按经典层数重建环境
    _state.mode = 'event';
    try {
      _state.environment = generateEnvironmentEffect(_state.floor || 1, _state.difficulty);
    } catch (e) { /* 生成失败就保留原样，不影响退出流程 */ }
  }
  // 刷新经典界面（而不是试炼界面）
  render();
  _addLog('已退出试炼，回到经典冒险。');

  if (reward) {
    _addLog(
      `深渊回响：带回 ${reward.totalGold} 金币、${reward.totalXp} 经验` +
      `（第 ${reward.floor} 层 · ${reward.points} 点 · ${reward.extracted ? '主动撤离 ×1.25' : '战死结算'}）`
    );
    if (reward.milestones && reward.milestones.length > 0) {
      reward.milestones.forEach(m => {
        _addLog(`里程碑达成：${m.title}（第 ${m.floor} 层）—— 额外 ${m.gold} 金币、${m.xp} 经验`);
      });
    }
    // 产出必须落盘：render() 的自动保存是每 3 次才触发，不能指望它
    try { if (typeof saveGame === 'function') saveGame(); } catch (e) { console.warn('[试炼] 产出存档失败：', e); }
    // 一点没带回来就不弹横幅了 —— 空结算卡片只会显得像 bug，日志里有记录就够
    if (reward.totalGold > 0 || reward.totalXp > 0) showTrialRewardBanner(reward);
  }
  renderTrialEntryInfo();
}

/**
 * 结算横幅：让玩家清楚看到「这一局带回来了什么」。
 * 这是把两个模式缝起来最关键的一次反馈 —— 以前玩家退出试炼是静悄悄的。
 */
function showTrialRewardBanner(reward) {
  const banner = document.getElementById('trialRewardBanner');
  if (!banner || !reward) return;
  const sub = document.getElementById('trialRewardSub');
  const rows = document.getElementById('trialRewardRows');
  const title = document.getElementById('trialRewardTitle');
  if (title) {
    title.textContent = reward.isNewBest ? '深渊回响 · 新纪录' : '深渊回响';
  }
  if (sub) {
    sub.textContent = `第 ${reward.floor} 层 · ${reward.points} 试炼点 · ` +
      (reward.extracted ? '主动撤离 ×1.25' : '战死结算 ×1.0') +
      ` · 层数倍率 ×${reward.floorMult.toFixed(2)}`;
  }
  if (rows) {
    const lines = [
      ['深渊回响 · 金币', `+${reward.gold}`],
      ['深渊回响 · 经验', `+${reward.xp}`]
    ];
    (reward.milestones || []).forEach(m => {
      lines.push([`里程碑 · ${m.title}（第 ${m.floor} 层）`, `+${m.gold} 金币 / +${m.xp} 经验`]);
    });
    lines.push(['合计带入冒险', `${reward.totalGold} 金币 · ${reward.totalXp} 经验`]);
    rows.innerHTML = lines.map((ln, i) => {
      const last = i === lines.length - 1;
      return `<div class="trial-reward-row${last ? ' total' : ''}">` +
        `<span>${ln[0]}</span><strong>${ln[1]}</strong></div>`;
    }).join('');
  }
  banner.classList.remove('hidden');
  const rec = loadTrialRecords();
  const foot = document.getElementById('trialRewardFoot');
  if (foot) {
    foot.textContent = `最深 ${rec.bestFloor} 层 · 累计深潜 ${rec.runs} 次 · 累计带回 ${rec.gold} 金币、${rec.xp} 经验`;
  }
  // 关闭按钮只绑一次
  const closeBtn = document.getElementById('trialRewardClose');
  if (closeBtn && !closeBtn._bound) {
    closeBtn._bound = true;
    closeBtn.addEventListener('click', function () {
      const el = document.getElementById('trialRewardBanner');
      if (el) el.classList.add('hidden');
    });
  }
  try { if (window.AbyssAudio) AbyssAudio.sfx('levelUp'); } catch (e) { /* 音效失败不影响结算 */ }
}

function trialDefend() {
  const trial = _state.trial;
  if (trial.mode !== 'trialCombat' || !trial.combat || trial.gameOver) return;
  if (trial.rounds >= trial.maxRounds) {
    endTrial('回合耗尽');
    return;
  }
  trial.rounds++;
  trial.player.shield += 3;
  if (trial.hero?.skill?.onDefend) {
    trial.hero.skill.onDefend();
  }
  _addLog('防御，护盾 +3。');
  if (window.AbyssAudio) AbyssAudio.sfx('block');
  _trialFloat('player', '+3', 'shield');
  _trialBtnFlash('防御');
  trial.fury = Math.min(trial.furyMax, trial.fury + 1);
  trialEnemyTurn();
}

function trialUsePotion() {
    const trial = _state.trial;

    // 守卫检查：战斗状态/回合上限/药水数量
    if (trial.mode !== 'trialCombat' || !trial.combat || trial.gameOver) return;
    if (trial.rounds >= trial.maxRounds) {
        endTrial('回合耗尽');
        return;
    }
    if (trial.player.potions <= 0) {
        _addLog('没有治疗药水。');
        return;
    }

    trial.rounds++;
    trial.player.potions--;

    let healAmount = 8;

    // 诅咒：药水衰减（治疗量减半）
    if (trial.curses.some(c => c.name === '药水衰减')) {
        healAmount = Math.floor(healAmount / 2);
        _addLog('诅咒“药水衰减”生效，治疗量减半。');
    }

    // 环境：治疗抑制（治疗量减半，与诅咒叠加）
    const envP = trial.combat && trial.combat.environment;
    if (envP && typeof envP.onHeal === 'function') {
        healAmount = envP.onHeal(healAmount);
        if (healAmount < 8) _addLog('环境“治疗抑制”生效，治疗量减半。');
    }

    // 下限保护：至少恢复 0 点（连续减半可能到 0，但不为负）
    healAmount = Math.max(0, healAmount);

    trial.player.hp = Math.min(trial.player.maxHp, trial.player.hp + healAmount);
    _addLog(`使用治疗药水，恢复 ${healAmount} 生命。`);
    if (window.AbyssAudio) AbyssAudio.sfx('potion');
    _trialFloat('player', '+' + healAmount, 'potion');
    _trialBtnFlash('治疗药水');

    trial.fury = Math.min(trial.furyMax, trial.fury + 1);
    trialEnemyTurn();
}

function trialActivateHeroSkill() {
  const trial = _state.trial;
  if (trial.mode !== 'trialCombat' || !trial.combat || trial.gameOver) {
    _addLog('只能在战斗中使用主动技能。');
    renderTrialUI();
    return;
  }
  if (!trial.hero?.skill?.active) {
    _addLog('当前英雄没有可用的主动技能。');
    renderTrialUI();
    return;
  }
  if (trial.heroSkillUsed) {
    _addLog('本层战斗主动技能已使用。');
    renderTrialUI();
    return;
  }

  const heroId = trial.hero.id;
  let consumeTurn = true; // 默认消耗回合

  // 根据英雄 ID 执行对应技能效果（全部不消耗回合）
  switch (heroId) {
    case 'warrior':
      trial.player.shield += 6;
      _addLog('你发动了战吼，立刻获得 6 点护盾。');
      consumeTurn = false;
      break;
    case 'rogue':
      trial.heroSkillBonus += 5;
      _addLog('你准备了影舞突袭，下一次攻击将造成额外 5 点伤害。');
      consumeTurn = false;
      break;
    case 'sage':
      trial.heroSkillBonus += 4;
      trial.heroPendingHeal = 3;
      _addLog('你激发了法力灌注，下一次攻击将附带治疗效果。');
      consumeTurn = false;
      break;
    case 'guardian':
      trial.player.shield += 6;
      _addLog('你构筑了护盾壁垒，立刻获得 6 点护盾。');
      consumeTurn = false;
      break;
    case 'ranger':
      trial.heroSkillBonus += 4;
      _addLog('你蓄力了一记精准射击，下一次攻击将造成额外 4 点伤害。');
      consumeTurn = false;
      break;
    case 'mage':
      trial.heroSkillBonus += 6;
      _addLog('你召唤了元素风暴，下一次攻击将造成额外 6 点伤害。');
      consumeTurn = false;
      break;
    case 'berserker':
      trial.heroSkillBonus += 5;
      _addLog('你进入破釜沉舟状态，下一次攻击额外造成 5 点伤害。');
      consumeTurn = false;
      break;
    case 'paladin':
      trial.player.shield += 8;
      trial.player.hp = Math.min(trial.player.maxHp, trial.player.hp + 4);
      _addLog('你发动了神圣审判，获得 8 点护盾并恢复 4 点生命。');
      consumeTurn = false;
      break;
    case 'shadow':
      trial.heroSkillBonus += 7;
      _addLog('你遁入暗影，下一次攻击将造成额外 7 点伤害。');
      consumeTurn = false;
      break;
    default:
      _addLog('当前英雄的主动技能尚未适配试炼模式。');
      renderTrialUI();
      return;
  }

  trial.heroSkillUsed = true;
  if (window.AbyssAudio) AbyssAudio.sfx('skill');
  _trialFloat('player', trial.hero?.skill?.active?.name || '技能', 'skill');
  const skillBtnEl = document.getElementById('trialSkillBtn');
  if (skillBtnEl) {
      skillBtnEl.classList.add('hit-flash');
      setTimeout(() => skillBtnEl.classList.remove('hit-flash'), 300);
  }
  renderTrialUI();
  if (consumeTurn) {
    trialEnemyTurn();
  }
}

function applyTrialCombatDebuffs() {
    const trial = _state.trial;
    // 灼烧（岩浆行者）
    if (_state.burnRounds > 0) {
        const damage = 3;
        const maxHpLoss = 1;
        trial.player.hp = Math.max(1, trial.player.hp - damage);
        trial.player.maxHp = Math.max(1, trial.player.maxHp - maxHpLoss);
        if (trial.player.hp > trial.player.maxHp) trial.player.hp = trial.player.maxHp;
        _addLog(`你被岩浆行者残留的灼烧所伤，生命-${damage}，生命上限-${maxHpLoss}`);
        _state.burnRounds--;
        if (window.AbyssAudio) AbyssAudio.sfx('burn');
    }
    // 魅惑（影·魅）
    if (_state.charmRounds > 0) {
        _state.charmRounds--;
        if (_state.charmRounds === 0) {
            _state.damageReduction = 0;
            _addLog('魅惑效果已消失');
        }
    }
}

function trialEnemyTurn() {
    const trial = _state.trial;
    const enemy = trial.combat.enemy;
    const env = trial.combat.environment || {};

    if (trial.rounds >= trial.maxRounds) {
        endTrial('回合耗尽');
        return;
    }

    if (trial.curses.some(c => c.name === '护甲腐蚀')) {
        trial.player.shield = Math.max(0, trial.player.shield - 1);
        _addLog('诅咒“护甲腐蚀”生效，护盾减少1点。');
    }
    trial.player.attackPercentMod = 1;
    if (enemy) enemy.attackPercentMod = 1;
    // 环境回合效果 + 敌人回合钩子
    if (env && typeof env.applyTurnEffects === 'function') {
        env.applyTurnEffects(trial.player, enemy);
    }
    if (env && typeof env.onEnemyTurn === 'function') {
        env.onEnemyTurn(trial.player, enemy);
    }

    // ===== 环境效果可能将敌人生命降至0，立即判定死亡 =====
    if (enemy.hp <= 0) {
        _addLog(`${enemy.name} 被环境之力击溃。`);
        handleTrialEnemyDefeat(enemy, env);
        return;
    }

    // 敌人攻击 = 基础 + 环境临时加成（最低1）
    let attack = Math.max(1, enemy.attack + (enemy.tempAttackBonus || 0));

    // 应用攻击百分比修正（虚弱之雾、能量涌动等）
    if (state.environment && trial.combat && trial.combat.enemy) {
      if (trial.combat.enemy.attackPercentMod !== undefined && trial.combat.enemy.attackPercentMod !== 1) {
        attack = Math.max(1, Math.round(attack * trial.combat.enemy.attackPercentMod));
      }
    }

    // 诅咒加伤
    if (trial.curses.some(c => c.name === '荆棘诅咒')) {
        attack += 1;
        _addLog('诅咒“荆棘诅咒”生效，本次伤害+1。');
    }
    if (trial.curses.some(c => c.name === '易伤')) {
        attack += 2;
        _addLog('诅咒“易伤”生效，本次伤害+2。');
    }

    // 敌人暴击（基础 + 环境加成）
    let enemyCritHit = false;
    const enemyCrit = (enemy.crit || 0) + (enemy.critBonus || 0);
    if (enemyCrit > 0 && Math.random() < enemyCrit / 100) {
        const critMultiplier = ((enemy.critDamage || 150) + (enemy.critDamageBonus || 0)) / 100;
        attack = Math.round(attack * critMultiplier);
        enemyCritHit = true;
        _addLog(`${enemy.name} 暴击！`);
        if (window.AbyssAudio) AbyssAudio.sfx('crit');
    }

    // 玩家闪避（基础 + 环境加成）
    const dodgeChance = Math.min((trial.dodgeLevel || 0) * 5 + (trial.player.dodgeBonus || 0), 50);
    if (dodgeChance > 0 && Math.random() < dodgeChance / 100) {
        trial.dodgeCount = (trial.dodgeCount || 0) + 1;
        _addLog(`闪避攻击！`);
        if (window.AbyssAudio) AbyssAudio.sfx('dodge');
        _trialFloat('player', '闪避', 'dodge');
        _trialPlayAnim('player', 'dodge');
        trial.combat.turn++;
        renderTrialUI();
        return;
    }

    // 护盾吸收
    let remaining = attack;
    if (trial.player.shield > 0) {
        const absorbed = Math.min(trial.player.shield, remaining);
        trial.player.shield -= absorbed;
        remaining -= absorbed;
        _addLog(`护盾吸收 ${absorbed} 点。`);
        _trialFloat('player', '护盾 -' + absorbed, 'shield');
    }

    // 生命伤害
    if (remaining > 0) {
      // 应用环境伤害修正（厄运等）
      if (env && env.damageModifier) {
          const mod = env.damageModifier;
          remaining = Math.round(remaining * (1 + mod));
          if (mod !== 0) {
              _addLog(`环境效果使伤害 ${mod > 0 ? '增加' : '减少'} ${Math.abs(mod * 100).toFixed(1)}%`);
          }
      }
      trial.player.hp -= remaining;
      _addLog(`${enemy.name} 造成 ${remaining} 伤害。`);
      _trialFloat('player', '-' + remaining, enemyCritHit ? 'crit' : 'damage');
      _trialPlayAnim('player', 'hit');
      _trialScreenShake();

        // 玩家荆棘反弹
        if ((trial.thornLevel || 0) > 0) {
            const thornDmg = trial.thornLevel;
            enemy.hp -= thornDmg;
            _addLog(`荆棘反弹 ${thornDmg} 伤害。`);
            _trialFloat('enemy', '-' + thornDmg, 'thorn');
            _trialPlayAnim('enemy', 'hit');
            if (enemy.hp <= 0) {
                _addLog(`${enemy.name} 被荆棘反伤击败！`);
                handleTrialEnemyDefeat(enemy, env);
                return;
            }
        }
    }

    // 受击 / 完全格挡音效（remaining 为穿透到生命的伤害）
    if (window.AbyssAudio) AbyssAudio.sfx(remaining > 0 ? 'hurt' : 'block');

    // 生命护盾
    if (trial.hasLifeShield) {
        trial.player.shield += 2;
        _addLog('生命护盾 +2。');
        _trialFloat('player', '+2', 'shield');
    }

    if (trial.player.hp <= 0) {
        clearTrialTempBonuses();   // ← 出口清理（死亡）
        endTrial('死亡');
        return;
    }

    trial.combat.turn++;
    renderTrialUI();
}

function trialFuryBurst() {
  const trial = _state.trial;
  if (trial.gameOver) return;
  if (trial.fury < trial.furyMax) {
    _addLog(`狂怒值未满，当前 ${trial.fury}/${trial.furyMax}`);
    return;
  }
  if (!trial.combat || !trial.combat.enemy) return;
  const damage = 10 + Math.floor(Math.random() * 5);
  trial.combat.enemy.hp -= damage;
  trial.fury = 0;
  _addLog(`狂怒爆发！造成 ${damage} 伤害！`);
  if (window.AbyssAudio) AbyssAudio.sfx('skill');
  _trialFloat('enemy', '-' + damage, 'execute');
  _trialPlayAnim('enemy', 'hit');
  _trialScreenShake();
  if (trial.combat.enemy.hp <= 0) {
    _addLog(`${trial.combat.enemy.name} 被狂怒爆发击败！`);
    handleTrialEnemyDefeat(trial.combat.enemy, trial.combat.environment || {});
    return;
  }
  renderTrialUI();
}

function trialKillEnemy() {
  const trial = _state.trial;
  if (!trial.combat || !trial.combat.enemy) return;
  const enemy = trial.combat.enemy;
  enemy.hp = 0;
  // 复用统一胜利逻辑
  handleTrialEnemyDefeat(enemy, trial.combat.environment || {});
}

function trialHealPlayer() {
  const trial = _state.trial;
  if (trial.player) {
    trial.player.hp = trial.player.maxHp;
    if (window.AbyssAudio) AbyssAudio.sfx('heal');
    renderTrialUI();
  }
}

// ===== 试炼界面渲染 =====
function renderTrialUI() {
    const t = _state.trial;
    // 如果 trial 未激活或没有 player，直接返回（避免报错）
    if (!t || !t.active || !t.player) {
        // 隐藏试炼界面，显示经典界面
        const screen = document.getElementById('trialScreen');
        if (screen) screen.classList.add('hidden');
        const classicTopbar = document.querySelector('.topbar');
        if (classicTopbar) classicTopbar.style.display = '';
        const appShell = document.querySelector('.app-shell');
        if (appShell) appShell.style.display = '';
        return;
    }
    // ===== 试炼环境显示 =====
    const envEl = document.getElementById('trialEnvironment');
    if (envEl) {
      if (_state.environment) {
        const isMobile = window.innerWidth <= 768;
        let envName = _state.environment.name;
        if (isMobile && envName.length > 6) {
          envName = envName.slice(0, 6) + '…';
        }
        const display = _state.environment.displayValue ? ` (${_state.environment.displayValue})` : '';
        envEl.textContent = `环境：${envName}${display}`;
        envEl.title = _state.environment.description + (_state.environment.displayValue ? ` (当前值：${_state.environment.displayValue})` : '');
        envEl.style.display = 'inline-block';
        envEl.style.visibility = 'visible';
        envEl.style.opacity = '1';
      } else {
        envEl.textContent = '';
        envEl.style.display = '';
      }
    }
    const p = t.player;
    const screen = document.getElementById('trialScreen');
    if (screen) screen.classList.remove('hidden');
    const classicTopbar = document.querySelector('.topbar');
    if (classicTopbar) classicTopbar.style.display = 'none';

    // ===== 实时战斗的文字视图：面板显示 2D 战斗的实时数据 =====
    if (t._realtimeTextMode) {
        _renderRealtimeTextView(t);
        return;
    }

    // ===== 同步 2D 渲染层数据（阶段1） =====
    _syncTrial2D();

    // 绑定顶栏事件（只执行一次）
    if (!window._trialTopbarBound) {
        const trialTopbar = document.querySelector('.trial-topbar-right');
        if (trialTopbar) {
            trialTopbar.addEventListener('click', function(e) {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'encyclopedia') {
                    _openEncyclopediaModal();
                } else if (action === 'tutorial') {
                    _startTutorial();
                } else if (action === 'conditions') {
                    _openConditionsModal();
                } else if (action === 'mode-toggle') {
                    _state.detailMode = !_state.detailMode;
                    _addLog(_state.detailMode ? '已切换到【详情模式】' : '已切换到【正常模式】');
                    renderTrialUI();
                } else if (action === 'toggle-2d') {
                    _toggleTrial2D();
                } else if (action === 'save') {
                    _manualSave();
                } else if (action === 'restart') {
                    if (confirm('确定要重新开始吗？当前进度将丢失。')) {
                        // 先让试炼正常收尾：恢复经典状态并结算产出，再删档重开。
                        // 以前这里直接 _deleteSave() + _initGame()，绕过了 exitTrial()，
                        // 备份没还原、试炼副本残留在 _state 里，等于把经典进度弄丢了。
                        try { _realtimeExitTrial(); } catch (e) { console.warn('[试炼] 收尾失败：', e); }
                        const screen = document.getElementById('trialScreen');
                        if (screen) screen.classList.add('hidden');
                        const classicApp = document.querySelector('.app-shell');
                        if (classicApp) classicApp.style.display = '';
                        const classicTopbar = document.querySelector('.topbar');
                        if (classicTopbar) classicTopbar.style.display = '';
                        _state.trial.active = false;
                        _state.trial.gameOver = false;
                        _deleteSave();
                        _initGame();
                    }
                } else if (action === 'trial-exit') {
                    // 统一走实时结算入口：从顶栏退出同样按「主动撤离」结算产出，
                    // 并且会先把 2D 里的 layer/points 回写（旧代码直接 exitTrial() 会丢这些）
                    _realtimeExitTrial();
                }
            });
            window._trialTopbarBound = true;
        }
    }

    document.getElementById('trialRoundsDisplay').textContent = `回合 ${t.rounds} / ${t.maxRounds}`;
    const modeBtn = document.querySelector('.trial-ghost-btn[data-action="mode-toggle"]');
    if (modeBtn) {
        modeBtn.textContent = _state.detailMode ? '详情模式' : '正常模式';
    }
    document.getElementById('trialHeroName').textContent = t.hero?.name || '无名英雄';
    const heroEmojiEl = document.getElementById('trialPlayerEmoji');
    if (heroEmojiEl) heroEmojiEl.textContent = _trialEmoji('hero', t.hero?.name || '');
    const skillName = t.hero?.skill?.name || '无';
    const activeName = t.hero?.skill?.active ? ` | 主动: ${t.hero.skill.active.name}` : '';
    document.getElementById('trialHeroSkill').textContent = `技能: ${skillName}${activeName}`;

    const furyPercent = (t.fury / t.furyMax) * 100;
    document.getElementById('trialFuryFill').style.width = Math.min(furyPercent, 100) + '%';
    document.getElementById('trialFuryText').textContent = `${t.fury} / ${t.furyMax}`;
    const furyBtn = document.getElementById('trialFuryBurstBtn');
    if (furyBtn) {
        furyBtn.dataset.action = 'fury-burst';
        if (t.fury >= t.furyMax) {
        furyBtn.classList.add('active');
        furyBtn.disabled = false;
        } else {
        furyBtn.classList.remove('active');
        furyBtn.disabled = true;
        }
    }

    const curseList = document.getElementById('trialCurseList');
    curseList.innerHTML = '';
    t.curses.forEach(curse => {
        const badge = document.createElement('span');
        badge.className = 'trial-curse-badge';
        badge.textContent = curse.name;
        badge.style.cursor = _state.detailMode ? 'pointer' : 'default';
        if (_state.detailMode) {
        badge.addEventListener('click', function(e) {
            e.stopPropagation();
            const curseName = this.textContent.trim();
            const found = TRIAL_CURSES.find(c => c.name === curseName);
            if (found) {
            _addLog(`诅咒：${found.name} - ${found.description}`);
            } else {
            _addLog(`诅咒：${curseName}`);
            }
            renderTrialUI();
        });
        }
        curseList.appendChild(badge);
    });

    document.getElementById('trialPlayerHp').textContent = `${Math.max(0, p.hp)} / ${p.maxHp}`;
    if (p.hp <= p.maxHp * 0.3) {
        document.getElementById('trialPlayerHp').style.color = '#e07060';
    } else {
        document.getElementById('trialPlayerHp').style.color = '';
    }
    document.getElementById('trialPlayerAttack').textContent = p.attack;
    document.getElementById('trialPlayerShield').textContent = p.shield;
    document.getElementById('trialPlayerPotions').textContent = p.potions;

    const luckyChance = Math.min((t.luckyLevel || 0) * 10, 100);
    const luckyEl = document.getElementById('trialPlayerLucky');
    luckyEl.textContent = luckyChance + '%';
    luckyEl.style.color = luckyChance >= 100 ? '#f0b080' : '';
    document.getElementById('trialPlayerCritDamage').textContent = (t.critDamage || 150) + '%';
    document.getElementById('trialPlayerThorn').textContent = t.thornLevel || 0;
    document.getElementById('trialPlayerVampire').textContent = t.vampireLevel || 0;
    const dodgeChance = Math.min((t.dodgeLevel || 0) * 5, 50);
    document.getElementById('trialPlayerDodge').textContent = dodgeChance + '%';
    const comboChance = Math.min((t.comboLevel || 0) * 5, 40);
    document.getElementById('trialPlayerCombo').textContent = comboChance + '%';
    const executeChance = Math.min((t.executeLevel || 0) * 5, 40);
    document.getElementById('trialPlayerExecute').textContent = executeChance + '%';
    document.getElementById('trialPlayerPoints').textContent = t.points;

    const relicList = document.getElementById('trialRelicList');
    relicList.innerHTML = '';
    if (t.relics && t.relics.length > 0) {
        t.relics.forEach(relic => {
        const badge = document.createElement('span');
        badge.className = 'trial-relic-badge' + (relic.rarity === 'rare' ? ' rare' : '');
        badge.textContent = relic.label;
        badge.title = relic.description || '';
        relicList.appendChild(badge);
        });
    } else {
        relicList.innerHTML = '<span style="color:#666;font-size:0.7rem;">无</span>';
    }

    const bonusList = document.getElementById('trialBonusList');
    bonusList.innerHTML = '';
    if (t.bonuses && t.bonuses.length > 0) {
        t.bonuses.forEach(bonus => {
        const badge = document.createElement('span');
        badge.className = 'trial-bonus-badge';
        badge.textContent = bonus.title;
        badge.title = bonus.description || '';
        bonusList.appendChild(badge);
        });
    } else {
        bonusList.innerHTML = '<span style="color:#666;font-size:0.7rem;">无</span>';
    }

    const enemyNameEl = document.getElementById('trialEnemyName');
    const enemyHpEl = document.getElementById('trialEnemyHp');
    const enemyStatsEl = document.getElementById('trialEnemyStats');
    if (t.mode === 'trialCombat' && t.combat && t.combat.enemy) {
      const enemy = t.combat.enemy;
      enemyNameEl.textContent = enemy.name || '敌人';
      const enemyEmojiEl = document.getElementById('trialEnemyEmoji');
      if (enemyEmojiEl) enemyEmojiEl.textContent = _trialEmoji('enemy', enemy.name || '');
      enemyHpEl.textContent = `HP: ${Math.round(Math.max(0, enemy.hp))} / ${Math.round(enemy.maxHp)}`;
      // 计算实际暴击伤害（基础 + 环境加成），显示时统一四舍五入为整数
      const actualCritDamage = Math.round((enemy.critDamage || 150) + (enemy.critDamageBonus || 0));
      let statsText = `攻击 ${Math.round(enemy.attack)}`;
      if (enemy.thorn > 0) statsText += ` · 荆棘 ${Math.round(enemy.thorn)}`;
      if (enemy.dodge > 0) statsText += ` · 闪避 ${Math.round(enemy.dodge)}%`;
      if (enemy.vampire > 0) statsText += ` · 吸血 ${Math.round(enemy.vampire)}`;
      if (enemy.combo > 0) statsText += ` · 连击 ${Math.round(enemy.combo)}%`;
      if (enemy.crit > 0) statsText += ` · 暴击 ${Math.round(enemy.crit)}% (${actualCritDamage}%)`;
      if (enemy.armor > 0) statsText += ` · 减伤 ${Math.round(enemy.armor)}%`;
      enemyStatsEl.textContent = statsText;
    } else if (t.gameOver) {
        enemyNameEl.textContent = '试炼结束';
        enemyHpEl.textContent = '';
        enemyStatsEl.textContent = t.endReason || '已结束';
    } else {
        enemyNameEl.textContent = '—';
        enemyHpEl.textContent = '';
        enemyStatsEl.textContent = '准备中...';
    }

    const actionArea = document.getElementById('trialActionArea');
    const skillBtn = document.getElementById('trialSkillBtn');
    const existingBtns = actionArea.querySelectorAll('.trial-action-btn');
    existingBtns.forEach(btn => {
        // 保留主动技能按钮与「返回 2D 画面」按钮（后者由实时战斗视图管理）
        if (btn.id !== 'trialSkillBtn' && btn.id !== 'trialBackTo2DBtn') btn.remove();
    });
    if (t.hero?.skill?.active && !t.heroSkillUsed && t.mode === 'trialCombat') {
        skillBtn.style.display = 'block';
        skillBtn.textContent = t.hero.skill.active.name || '主动技能';
        skillBtn.title = t.hero.skill.active.description || '';
    } else {
        skillBtn.style.display = 'none';
    }
    const btnConfigs = [
        { label: '攻击', action: 'attack', cls: 'primary' },
        { label: '防御', action: 'defend', cls: 'secondary' },
        { label: '治疗药水', action: 'potion', cls: 'heal' },
    ];
    const isSkillVisible = skillBtn.style.display !== 'none';
    btnConfigs.forEach((cfg) => {
        const btn = document.createElement('button');
        btn.className = `trial-action-btn ${cfg.cls}`;
        btn.textContent = cfg.label;
        btn.dataset.action = cfg.action;
        if (cfg.action === 'potion' && t.player.potions <= 0) {
        btn.disabled = true;
        }
        if ((cfg.action === 'attack' || cfg.action === 'defend') && t.mode !== 'trialCombat') {
        btn.disabled = true;
        }
        actionArea.appendChild(btn);
    });
    if (isSkillVisible) {
        const potionBtn = actionArea.querySelector('.trial-action-btn.heal');
        if (potionBtn && skillBtn) {
        potionBtn.after(skillBtn);
        }
    }
    if (t.gameOver) {
        const allBtns = document.querySelectorAll('.trial-action-btn');
        allBtns.forEach(btn => btn.disabled = true);
        const furyBtn = document.getElementById('trialFuryBurstBtn');
        if (furyBtn) furyBtn.disabled = true;
        const enemyNameEl = document.getElementById('trialEnemyName');
        const enemyHpEl = document.getElementById('trialEnemyHp');
        const enemyStatsEl = document.getElementById('trialEnemyStats');
        if (enemyNameEl) enemyNameEl.textContent = '试炼结束';
        if (enemyHpEl) enemyHpEl.textContent = '';
        if (enemyStatsEl) enemyStatsEl.textContent = t.endReason || '已结束';
    }

    const trialLogList = document.getElementById('trialLogList');
    trialLogList.innerHTML = '';
    const trialEntries = _state.log.slice(-10).reverse();
    trialEntries.forEach(entry => {
        const li = document.createElement('li');
        li.textContent = entry;
        trialLogList.appendChild(li);
    });
    bindTrialAttributeClicks();
    // 绑定试炼操作按钮事件（只执行一次）
    if (actionArea && !actionArea.dataset.trialBound) {
        actionArea.addEventListener('click', function(e) {
            const btn = e.target.closest('button');
            if (!btn) return;
            const action = btn.dataset.action;
            if (action) {
                Trial.handleAction(action);
            }
        });
        actionArea.dataset.trialBound = 'true';
    }

    if (furyBtn && !furyBtn.dataset.trialBound) {
        furyBtn.addEventListener('click', function() {
            Trial.handleAction('fury-burst');
        });
        furyBtn.dataset.trialBound = 'true';
    }
  if (t.mode === 'trialCombat' && t.combat) {
    _trialAlignSprites();
  }
  if (typeof updateLowHpFog === 'function') {
    updateLowHpFog();
  }
}

// ===== 试炼属性详情 =====
function openTrialAttributeDetail(attrKey) {
  const modal = document.getElementById('attributeDetailModal');
  const title = document.getElementById('attributeDetailTitle');
  const content = document.getElementById('attributeDetailContent');
  if (!modal || !title || !content) return;
  const t = _state.trial;
  const p = t.player;
  const details = {
    '生命': {
      title: '生命',
      content: `<div style="display:grid;gap:8px;">
        <div><span style="color:var(--muted);">当前生命</span> <strong style="color:var(--danger);float:right;">${p.hp}</strong></div>
        <div><span style="color:var(--muted);">最大生命</span> <strong style="color:var(--text);float:right;">${p.maxHp}</strong></div>
        <div><span style="color:var(--muted);">生命比例</span> <strong style="color:${p.hp/p.maxHp > 0.3 ? 'var(--accent)' : 'var(--danger)'};float:right;">${Math.round(p.hp/p.maxHp*100)}%</strong></div>
      </div>`
    },
    '攻击': {
      title: '攻击',
      content: `<div style="display:grid;gap:8px;">
        <div><span style="color:var(--muted);">基础攻击</span> <strong style="color:var(--text);float:right;">${p.attack}</strong></div>
      </div>`
    },
    '护盾': {
      title: '护盾',
      content: `<div style="display:grid;gap:8px;">
        <div><span style="color:var(--muted);">当前护盾</span> <strong style="color:#6fc3ff;float:right;">${p.shield}</strong></div>
      </div>`
    },
    '药水': {
      title: '治疗药水',
      content: `<div style="display:grid;gap:8px;">
        <div><span style="color:var(--muted);">治疗药水</span> <strong style="color:#73f0b4;float:right;">${p.potions} 瓶</strong></div>
      </div>`
    },
    '暴击率': {
      title: '暴击率',
      content: `<div style="display:grid;gap:8px;">
        <div><span style="color:var(--muted);">暴击率</span> <strong style="color:#ff6b6b;float:right;">${Math.min((t.luckyLevel||0)*10, 100).toFixed(0)}%</strong></div>
      </div>`
    },
    '暴击伤害': {
      title: '暴击伤害',
      content: `<div style="display:grid;gap:8px;">
        <div><span style="color:var(--muted);">暴击伤害</span> <strong style="color:#ff6b6b;float:right;">${t.critDamage||150}%</strong></div>
      </div>`
    },
    '荆棘': {
      title: '荆棘',
      content: `<div style="display:grid;gap:8px;">
        <div><span style="color:var(--muted);">荆棘等级</span> <strong style="color:#6fc3ff;float:right;">${t.thornLevel||0}</strong></div>
      </div>`
    },
    '吸血': {
      title: '吸血',
      content: `<div style="display:grid;gap:8px;">
        <div><span style="color:var(--muted);">吸血等级</span> <strong style="color:#ff6b6b;float:right;">${t.vampireLevel||0}</strong></div>
      </div>`
    },
    '闪避': {
      title: '闪避',
      content: `<div style="display:grid;gap:8px;">
        <div><span style="color:var(--muted);">闪避率</span> <strong style="color:#6fc3ff;float:right;">${Math.min((t.dodgeLevel||0)*5, 50).toFixed(0)}%</strong></div>
      </div>`
    },
    '连击': {
      title: '连击',
      content: `<div style="display:grid;gap:8px;">
        <div><span style="color:var(--muted);">连击率</span> <strong style="color:#f7b731;float:right;">${Math.min((t.comboLevel||0)*5, 40).toFixed(0)}%</strong></div>
      </div>`
    },
    '斩杀': {
      title: '斩杀',
      content: `<div style="display:grid;gap:8px;">
        <div><span style="color:var(--muted);">斩杀率</span> <strong style="color:#ff3b3b;float:right;">${Math.min((t.executeLevel||0)*5, 40).toFixed(0)}%</strong></div>
      </div>`
    }
  };
  const detail = details[attrKey] || { title: '属性', content: '<div style="color:var(--muted);">暂无详情</div>' };
  title.textContent = detail.title;
  content.innerHTML = detail.content;
  modal.classList.remove('hidden');
}

function bindTrialAttributeClicks() {
  const map = {
    'trialPlayerHp': '生命',
    'trialPlayerAttack': '攻击',
    'trialPlayerShield': '护盾',
    'trialPlayerPotions': '药水',
    'trialPlayerLucky': '暴击率',
    'trialPlayerCritDamage': '暴击伤害',
    'trialPlayerThorn': '荆棘',
    'trialPlayerVampire': '吸血',
    'trialPlayerDodge': '闪避',
    'trialPlayerCombo': '连击',
    'trialPlayerExecute': '斩杀'
  };
  Object.keys(map).forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.trialBound) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        openTrialAttributeDetail(map[id]);
      });
      el.dataset.trialBound = 'true';
    }
  });
}

// ===== 暴露全局接口 =====
window.Trial = {
  init: initTrialModule,
  start: startTrial,
  render: renderTrialUI,
  exit: exitTrial,
  kill: trialKillEnemy,
  heal: trialHealPlayer,
  openShop: openTrialShop,
  applyUnlocks: applyTrialUnlocks,
  // 供主程序调用的辅助
  handleAction: function(action, event) {
    // 用于主程序 handleAction 中试炼分支的调用
    if (action === 'attack') { trialAttackEnemy(); return true; }
    if (action === 'defend') { trialDefend(); return true; }
    if (action === 'potion') { trialUsePotion(); return true; }
    if (action === 'hero-skill') { trialActivateHeroSkill(); return true; }
    if (action === 'fury-burst') { trialFuryBurst(); return true; }
    if (action === 'trial-exit') {
      // 实时战斗中退出：先回写实时数据再离开（避免丢进度）
      if (_state.trial.active && isRealtimeRunning()) _realtimeExitTrial();
      else exitTrial();
      return true;
    }
    if (action === 'back-to-2d') { resumeRealtimeView(); return true; }
    if (action === 'toggle-2d') { _toggleTrial2D(); return true; }
    if (action === 'close-trial-shop') { closeTrialShop(); return true;}
    if (action === 'resolve') {
      if (_state.trial.currentRoom) {
        _state.trial.roomIndex++;
        enterTrialRoom();
      }
      return true;
    }
    return false;
  },
  // 环境效果袋抽：只给测试读取状态用，不参与游戏逻辑
  envBag: function() { return _realtimeEnvBag ? _realtimeEnvBag.slice() : null; },
  envBagSize: function() { return realtimeEnvNames().length; },
  rollEnv: function(floor) { return rollRealtimeEnv(floor || 1, _state.environment ? _state.environment.name : null); }
};
// 暴露给全局（供测试面板使用）
window.TRIAL_CURSES = TRIAL_CURSES;