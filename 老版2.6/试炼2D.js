/**
 * ============================================================
 *  深渊回廊 · 试炼模式 2D 实时战斗引擎
 * ------------------------------------------------------------
 *  玩法：横版侧视实时动作战斗（泰拉瑞亚 / 马里奥风格）
 *   - 左右跑动、重力跳跃、蓄力跳（按住蓄力、松开起跳，越久越高）
 *   - 近战挥砍：前摇 → 判定帧 → 后摇，带范围判定与击退
 *   - 跳劈：滞空时挥砍 → 高速下落斩，命中与落地都会造成范围冲击
 *   - 敌人自主 AI：巡逻 → 察觉 → 追击 → 攻击 → 受击 → 死亡
 *   - 敌人属性显示：头顶血条 + HUD 目标面板（生命/攻击/速度/行为）
 *   - 房间地图：每层生成分支网格地图，清空房间后打开地图点击进入下一房间
 *     房间类型：入口 / 普通 / 精英 / 镜像 / Boss / 宝箱 / 祭坛
 *   - 环境主题：按难度切换星雾与火星（简单·白星光 普通·蓝星光 困难·暖色 地狱·红焰）
 *   - 全屏渲染，HUD 绘制在游戏画面内（不使用文字面板）
 *   - 画面内死亡 / 商店 / 文字视图切换：死亡与商店都在 2D 画面中完成，
 *     可随时切到文字界面查看实时数据，或直接退出试炼回到经典冒险
 *
 *  属性映射（沿用经典模式养成）：
 *   攻击力 → 挥砍基础伤害      暴击率 → 暴击概率
 *   暴击伤害 → 暴击倍率        闪避 → 受击闪避率
 *   荆棘 → 被击中反伤          吸血 → 造成伤害回血
 *   连击 → 连段伤害递增        斩杀 → 低血敌人处决
 *   护盾 → 优先扣减的临时血量
 * ============================================================
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'abyss_trial2d_settings';
  var LAYOUT_KEY = 'abyss_trial2d_layout';   // 玩家自定义的面板 / 按钮布局
  // 常驻功能按钮的中文名（布局编辑器里一颗按钮一个单元，用它们做单元标题）
  var HUD_BTN_LABELS = {
    text: '文字界面', shop: '商店', codex: '图鉴', settings: '设置', quit: '退出试炼'
  };
  var GRAVITY = 1700;
  var CELL = 64;

  // 蓄力跳参数：按住跳跃键蓄力，松开才起跳，蓄得越久跳越高
  // 跳跃高度 = 初速度² / (2 × 重力)，以此推算能上的平台高度
  var CHARGE = {
    max: 620,        // 满蓄力所需时间(ms)
    minPower: 520,   // 轻点（最快松开）→ 约 80px 小跳
    maxPower: 1150,  // 满蓄力 → 约 390px 高跳（可上最高平台）
    coyote: 110      // 土狼时间(ms)：离开平台后仍可蓄力的宽限
  };

  // 跳劈（下落攻击）：滞空时挥砍触发，高速砸向地面
  // 命中敌人有蓄力倍率，落地产生范围冲击波
  var DIVE = {
    speed: 960,        // 下坠速度（px/s）
    mult: 1.9,         // 下落斩命中倍率
    splashMult: 1.15,  // 落地冲击波倍率
    splashRadius: 130, // 落地冲击波半径
    cooldown: 360,     // 两次跳劈之间的最短间隔(ms)

    // 「把敌人砸进地里」——这是一条**刻意保留的特性**，不是 bug。
    // 以前它其实是物理事故的副产品：英雄以 960px/s 下坠，和敌人之间挂着 collider，
    // 一帧挤一点，最后把敌人压穿地面；而敌人真的沉到地面以下之后就打不到、
    // 也清不掉，变成死局。现在改成显式机制：
    //   · 跳劈命中时按概率触发，压扁 + 地裂 + 尘土，敌人被「钉」在地里一段时间
    //   · 只动视觉（缩放），**物理体一动不动** —— 玩家照样打得到，清得掉
    //   · 下坠期间临时关掉「英雄 ↔ 敌人」的碰撞，从根上不再挤压
    buryChance: 0.38,  // 跳劈命中时砸进地里的概率
    buryTime: 1300,    // 陷在地里的时长(ms)
    burySquash: 0.42   // 压扁到原本高度的比例
  };

  // 闪避（翻滚冲刺）：消耗体力换取短暂无敌。
  // 在敌人攻击命中的瞬间闪避 → 完美闪避：体力全额返还 + 震开周围敌人 + 锐利强化
  var DODGE = {
    cost: 30,           // 体力消耗
    speed: 520,         // 冲刺速度(px/s)
    time: 260,          // 冲刺时长(ms)
    invuln: 320,        // 无敌帧(ms)
    perfect: 150,       // 完美窗口(ms)：闪避起手后这段时间内挡下伤害即完美
    recover: 110,       // 收招(ms)：结束后才能再闪
    airDrag: 0.55,      // 空中闪避每帧保留的下坠速度（近滞空）
    radius: 175,        // 完美闪避影响半径
    stun: 900,          // 完美闪避：范围内敌人定身(ms)
    sharp: 3000,        // 锐利（完美闪避强化）持续(ms)
    sharpMult: 2.2      // 锐利伤害倍率
  };

  // 体力：闪避的唯一资源，停手后自动回复
  var STAMINA = {
    max: 100,
    regen: 58,     // 每秒回复
    delay: 420     // 消耗后延迟(ms)才开始回复
  };

  // 英雄技能（实时化）：主动技能每层一次，被动常驻
  // 文字模式是回合制数值（+6 护盾、「下一次攻击 +5 伤害」），这里按实时战斗的尺度重做；
  // 技能名与语义与英雄图鉴（主程序.js 的 heroOptions）保持一致
  var SKILL = {
    power: 3000,      // 「下一次攻击 +N」类技能在实时里的强化时长(ms)
    burstR: 210,      // 元素风暴半径
    arrowSpeed: 900,  // 精准射击：穿透箭速度
    arrowLife: 700,   // 穿透箭存活(ms)
    arrowMult: 2      // 穿透箭伤害倍率
  };

  /**
   * 远程英雄的普攻（按 J / 触摸攻击钮）
   * 游侠、法师、贤者的武器本来就是弓与杖，普攻改成专属远程攻击，不再挥砍。
   * 数值取向：三者互相拉开 —— 射速 / 单体威力 / 覆盖方式各不相同，
   * 谁上场都能一眼从弹道认出来。外观（外观 kind、颜色、招式名）取自 角色形象.RANGED。
   *   cd      攻击间隔(ms)
   *   speed   弹速 px/s
   *   dmg     伤害倍率（乘英雄攻击力）
   *   pierce  可命中敌人数（1 = 命中即消失）
   *   life    存活(ms) → 射程 ≈ speed × life
   *   homing  每秒向最近敌人转过的弧度（追踪强度）
   *   splash  命中后的溅射半径 / splashMult 溅射伤害倍率
   *   knock   命中造成的硬直(ms)
   */
  var RANGED_ATTACK = {
    ranger: { cd: 300, speed: 780, dmg: 1.00, pierce: 2, life: 900, knock: 110, spin: false },
    mage:   { cd: 560, speed: 430, dmg: 1.15, pierce: 1, life: 1600, homing: 3.4, splash: 58, splashMult: 0.55, knock: 60, spin: true },
    sage:   { cd: 470, speed: 400, dmg: 0.85, pierce: 99, life: 1150, knock: 150, spin: false, wide: 34 }
  };

  /**
   * 防御（举盾）：按住 S / ↓
   * 文字模式的「防御」是一次 +3 护盾，实时里做成一个**姿态**：
   *   · 正前方减伤 75%，背后不减伤（鼓励转身顶着打）
   *   · 举盾持续消耗体力 —— 和闪避抢同一个资源池，形成「闪 or 挡」的抉择
   *   · 刚举起来的 200ms 内挡下 = **完美格挡**，完全免伤 + 反弹 + 护盾 + 盾反窗口
   *     （奖励只给时机，不给长按；一直举着只能减伤，还会把体力耗光）
   */
  var GUARD = {
    drain: 14,           // 举盾每秒消耗体力
    minStamina: 12,      // 体力低于此值无法举盾
    reopen: 30,          // 因为体力不足放下盾后，要回到这个值才能再举（避免一放一举地抖）
    moveScale: 0.42,     // 举盾时的移动速度倍率
    front: 0.25,         // 正面减伤：只吃 25% 伤害
    raise: 70,           // 举盾起手(ms)：抬盾这段时间还没成型，不减免
    perfect: 200,        // 举盾成型后 200ms 内挡下 = 完美格挡
    shieldGain: 3,       // 完美格挡 +3 护盾（= 文字模式「防御」的数值）
    guardianBonus: 2,    // 守护者被动「坚壁防御」：每次防御额外 +2 护盾
    stun: 700,           // 完美格挡把攻击者顶住(ms)
    counter: 1200,       // 盾反窗口(ms)
    counterMult: 2,      // 盾反伤害倍率
    counterLunge: 210    // 盾反的前冲速度
  };

  /**
   * 连招：在窗口内接上下一击就有额外效果（近战：强化挥砍）
   * 窗口、优先级、按键时机与远程共用一套；远程的招式另见 RANGED_CHAIN
   */
  var CHAIN = {
    window: 760,             // 连招衔接窗口(ms)
    sweepAt: 3,              // 第 3 段变「横扫」
    sweepMult: 1.4,
    sweepRange: 1.5,
    dodgeWindow: 900,        // 闪避结束后接攻击 = 突进斩
    dodgeMult: 1.5,
    dodgeLunge: 240,
    diveWindow: 700,         // 跳劈落地后接攻击 = 落地斩
    diveMult: 1.3,
    diveSplash: 0.6,         // 落地斩附带的小范围伤害比例
    diveSplashR: 96
  };

  /**
   * 远程英雄的连招（游侠 · 弓 / 法师 · 法杖 / 贤者 · 卷轴）
   * 触发时机、衔接窗口与优先级与近战**一模一样**（同一套 pickChain 分支），
   * 但招式本身必须换成远程该有的东西 —— 弓和法杖既挥不出「横扫」，
   * 也不需要为了打人把自己「突进」到怪脸上：
   *   完美格挡 → **反击箭**：拉满的一箭，穿透 3、必定暴击，靠强击退把怪推开（自己不冲）
   *   翻滚之后 → **连珠箭**：连续点射 3 发（间隔 80ms、几乎同一条线），
   *                每发重新瞄准最近的敌人 —— 目标是**单个硬目标**（精英 / 首领）的持续输出，
   *                与三连散（一次铺开好多个目标）正好互补
   *   空中射击落地 → **踏地箭**：远程没有跳劈，窗口改挂在「空中射击后落地」上；箭插地即炸一圈
   *   地面连按 J 第 3 下 → **三连散**：一次射出多支（多目标时一支锁一个），中近距离全覆盖
   * 招式名按英雄分开（弓 / 法杖 / 卷轴各一套，写在 角色形象.RANGED[id].chains），
   * 数值留在这里 —— 与 RANGED_ATTACK 的分工一致：形象归形象、手感归手感。
   */
  var RANGED_CHAIN = {
    counter: {
      key: 'counter', name: '反击箭', mult: 2.0, forceCrit: true,
      pierce: 3, knock: 340, speedMult: 1.15, boost: 1.45, color: '#ffd76a'
    },
    roll: {
      key: 'roll', name: '连珠箭', mult: 0.8, burst: 3, burstGap: 80,
      speedMult: 1.2, boost: 1.2, color: '#8ad8ff'
    },
    land: {
      key: 'land', name: '踏地箭', mult: 1.3, blast: 96, blastMult: 0.6,
      grav: 900,          // 下坠弧线：朝地面瞄，插地即炸
      boost: 1.35, color: '#ff9a5a'
    },
    triple: {
      key: 'triple', name: '三连散', mult: 1.0, spread: 3, spreadDeg: 12,
      sideMult: 0.68, boost: 1.15, color: '#f0d06a'
    }
  };

  /**
   * 腐化脉冲：所有「每回合」类的诅咒 / 环境效果在实时里的节拍
   * 文字模式的一回合 ≈ 这里的一次脉冲（5 秒），玩家看得见倒计时，也躲得开站位。
   */
  var PULSE = { period: 5000, warn: 1500 };

  /**
   * 环境效果 HUD（实时化 · 每房间一换）
   * 三件事在这里定死：
   *   1) 节奏 —— 2D 的一层是 8 个房间的实时战斗，如果只在深入下一层时重掷，
   *      一局下来只碰得到三五，池子里另外十个永远轮不到。所以改成**每进一个房间重掷一次**，
   *      由宿主用「袋抽」发牌（15 个洗成一叠，抽完才重洗），谁都不会被漏掉。
   *   2) 位置 —— 钉在屏幕右上角的「房间 · 已探索」正下方。注意必须挂进 scrollFactor(0) 的
   *      hud 容器里：只写 this.add.text 的话它会跟着镜头滚，跑到房间中段就看不见了。
   *   3) 可读 —— 除了名字与数值，还要写清它在这套实时战斗里**实际是什么**
   *      （WORLD_ENVS 的 rt 文案，把 {值} 换成真实数值），不然"厄运 +21%"等于没说。
   */
  var ENV = {
    panelW: 302,     // 面板最大宽度（窄屏按窗口收窄）
    padX: 14,        // 内边距（左右）
    padY: 10,        // 内边距（上下）
    gapRoom: 14,     // 与「房间 · 已探索」那一行的间距
    gapCurse: 8,     // 面板与诅咒条之间的间距
    bossClear: 124,  // 层主血条在场且横向撞上时，面板下移到这一行
    lockRange: 520,  // 连珠箭的锁定距离：超出这个距离就不再拐弯，保持平射
    flash: 1200      // 换环境时面板高亮时长(ms)
  };

  /**
   * 试炼诅咒（实时化）
   * 名字与文字版试炼完全一致；desc 是文字模式的原文，rt 是它在 2D 里实际变成什么 ——
   * 「每回合」统一译成「每 5 秒一次腐化脉冲」，而「每回合 -1 攻击 / -5% 闪避」这类
   * 会永久削人的诅咒改成**同一房间内累积、清空房间后恢复**（否则一层下来角色就废了）。
   */
  var TRIAL_CURSES = [
    { name: '脆弱', desc: '每回合减少2点护盾', rt: '每 5 秒失去 2 点护盾' },
    { name: '吸血反噬', desc: '每次攻击后自身损失1点生命', rt: '每次命中敌人后自身失去 1 点生命（无视护盾）' },
    { name: '荆棘诅咒', desc: '受到攻击时额外受到1点伤害', rt: '每次被命中额外承受 1 点伤害' },
    { name: '药水衰减', desc: '药水治疗效果减半', rt: '所有治疗效果减半（药水 / 祭坛 / 技能 / 魂晶）' },
    { name: '护甲腐蚀', desc: '每回合失去1点护盾', rt: '每 5 秒失去 1 点护盾' },
    { name: '虚弱', desc: '每回合攻击力-1（最低0）', rt: '每 5 秒攻击 -1（最低 1）；清空房间后恢复' },
    { name: '迟钝', desc: '每回合闪避率-5%（最低0）', rt: '每 5 秒闪避 -5%（最低 0）；清空房间后恢复' },
    { name: '生命流失', desc: '每回合失去1点生命（无视护盾）', rt: '每 5 秒失去 1 点生命（无视护盾）' },
    { name: '易伤', desc: '受到伤害+2', rt: '每次被命中额外承受 2 点伤害' },
    { name: '贪婪', desc: '战斗胜利试炼点减半', rt: '击杀敌人与开宝箱获得的试炼点减半' }
  ];

  /**
   * 经典模式环境效果（实时化）
   * 名字与经典模式一致；rt 说明它在 2D 里落到哪个动作上。
   * 附带的钩子名就是实现位置，方便对照调试。
   */
  var WORLD_ENVS = [
    { name: '荆棘之地', desc: '每次攻击时受到 {value} 当前生命的反弹伤害（无视护盾）', rt: '每次命中敌人，自己也掉 {value} 当前生命；敌人打你时同样反噬它', hook: 'thorn' },
    { name: '虚弱之雾', desc: '所有单位攻击力 {value}（最低1）', rt: '双方伤害 ×(1-{value})', hook: 'atkDown' },
    { name: '护盾崩坏', desc: '每回合失去 {value} 当前护盾（至少1点）', rt: '每 5 秒失去 {value} 当前护盾', hook: 'shieldDecay' },
    { name: '治疗抑制', desc: '所有治疗效果 {value}（治疗药水、吸血、技能）', rt: '所有治疗 ×(1-{value})', hook: 'healDown' },
    { name: '能量涌动', desc: '攻击力 {attackBonus}，每回合自伤 {selfDamage} 最大生命', rt: '双方伤害 ×(1+{attackBonus})，每 5 秒自伤 {selfDamage} 最大生命', hook: 'atkUp' },
    { name: '闪避领域', desc: '所有单位闪避率 {value}（上限50%）', rt: '双方闪避 +{value}：敌人有几率闪开你的攻击（飘字「闪开」）', hook: 'dodge' },
    { name: '暴击共振', desc: '所有单位暴击伤害 {value}', rt: '双方暴击伤害 +{value}', hook: 'critDmg' },
    { name: '连击风暴', desc: '所有单位连击率 {value}（上限40%）', rt: '你的连击加成 +{value}；敌人命中后有 {value} 概率立刻再打一下', hook: 'combo' },
    { name: '死亡回响', desc: '敌人死亡时，对玩家造成 {value} 最大生命的伤害（无视护盾）', rt: '每击杀一个敌人，失去 {value} 最大生命（无视护盾）', hook: 'deathEcho' },
    { name: '吸血诅咒', desc: '所有单位攻击时恢复 {value} 最大生命（至少1点）', rt: '双方每次命中回复 {value} 最大生命', hook: 'lifesteal' },
    { name: '缓慢凋零', desc: '每回合所有单位失去 {value} 最大生命（至少1点）', rt: '每 5 秒双方失去 {value} 最大生命（含上限）', hook: 'decay' },
    { name: '能量导管', desc: '每回合所有单位获得 {value} 最大生命的护盾（至少1点）', rt: '每 5 秒你获得 {value} 最大生命的护盾（敌人无护盾条，只结算你）', hook: 'shieldGain' },
    { name: '厄运', desc: '所有单位受到伤害 {value}', rt: '双方受到伤害 ×(1+{value})', hook: 'dmgUp' },
    { name: '幸运', desc: '所有单位暴击率 {value}', rt: '双方暴击率 +{value}', hook: 'lucky' },
    { name: '时间扭曲', desc: '每回合所有单位额外消耗 {value} 当前生命（无视护盾）', rt: '每 5 秒双方额外失去 {value} 当前生命（无视护盾）', hook: 'timeWarp' }
  ];

  /** 名字 → 实时化定义（运行时按名字查） */
  function curseByName(n) { return TRIAL_CURSES.filter(function (c) { return c.name === n; })[0] || null; }
  function envByName(n) { return WORLD_ENVS.filter(function (e) { return e.name === n; })[0] || null; }

  /**
   * 远程连招的招式名：先看英雄自己的名字（角色形象.RANGED[id].chains），
   * 没有就退回 RANGED_CHAIN 里的通用名 —— 弓 / 法杖 / 卷轴各叫各的，但逻辑只有一套。
   */
  function rangedChainName(rg, key, fallback) {
    var A = global.角色形象;
    var ch = (A && A.RANGED && rg && A.RANGED[rg.id] && A.RANGED[rg.id].chains) || null;
    return (ch && ch[key]) || fallback;
  }

  /**
   * 图鉴里展示经典文案时，把 {value} / {attackBonus} 这类占位符写成「<数值>」
   * 真实数值只有「当前生效」的那一条才有（要由宿主按层数与难度算），其余条目印出 {value} 只是噪音。
   */
  function envPlaceholderText(tpl) {
    return String(tpl == null ? '' : tpl).replace(/\{[A-Za-z]+\}/g, '<数值>');
  }

  /**
   * 狂怒（实时重做）
   * 文字版试炼的狂怒是「上限 10，攻击/防御/药水各 +1，满了手动爆发固定 10~14 伤害」。
   * 那套在实时里立不住：实时挥砍频率是回合制的几十倍，10 格会瞬间满；固定伤害在
   * 攻击力几十上百的实时尺度下也毫无意义。所以改成**一管进攻资源**：
   *   · 上限 100 —— 粒度够细，一根条就看得懂，节奏约等于「连续压制 3~5 秒攒满」
   *   · 攒怒靠**进攻**：命中 / 技巧命中 / 完美防御 / 击杀 / 挨打（越危险越怒）
   *     —— 举盾和走位不攒怒，所以它奖励的是"打得凶"，和体力（奖励会躲）形成一组对立
   *   · 满了按 R 进入**狂怒状态 6 秒**：攻速、伤害、移速全面拉满；代价是受到的伤害 +15%
   *     （狂暴而不设防）—— 保留原版"亲手按下爆发"的那个时刻，但把一次性伤害换成一段状态
   *   · 满怒后 12 秒没按也不会浪费：自动进入狂怒（HUD 上有倒计时）
   */
  var FURY = {
    max: 100,
    gainHit: { normal: 2, elite: 3, mirror: 3, boss: 4 },   // 命中敌人（按层级）
    gainChain: 3,        // 连招命中额外
    gainPerfect: 6,      // 完美闪避 / 完美格挡
    gainKill: 5,         // 击杀
    gainHurt: 4,         // 挨打（逆风也能翻）
    duration: 6000,      // 狂怒状态持续(ms)
    autoDelay: 12000,    // 满怒后多久自动进入狂怒
    atkSpeed: 1.35,      // 攻击间隔缩短倍率
    dmgMult: 1.5,        // 伤害倍率
    moveMult: 1.25,      // 移动速度倍率
    takenMult: 1.15      // 代价：受到的伤害 +15%
  };

  /**
   * 平台魂晶
   * 第一版给的是「点数 +2 / 护盾 +1 / 生命 +4」——数值全部落在结算里了，但护盾 +1 在
   * 「护盾条 = 护盾 ÷ 生命上限」的画法下只有 0.5%（约 1px），回血 4 点在 200 血里也看不出来，
   * 玩家体感就是「捡了没反应」。所以这一版的目标不是改机制，而是让收益**看得见**：
   *   · 护盾 +6（与「战吼」同量级，条体有约 3% 的可见跳变）
   *   · 低血时回复最大生命的 25%（至少 8 点，飘字显示实际值）
   *   · 点数 3 + 层数（宝箱的约 1/3，符合它「顺手捡」的定位）
   *   · 判定框放大，并加「近距离发亮 + 提示」——让玩家知道这东西是可以碰的
   *   · 每个房间最少有一颗长在**最低的那段平台**上，不用每次都为了一颗魂晶爬满全场
   */
  var CRYSTAL = {
    pickupX: 46,        // 拾取判定半宽（原 34：贴着边走过去会漏判）
    pickupY: 62,        // 拾取判定半高（原 44：落在平台边缘时够不到）
    nearX: 140,         // 进入这个范围：魂晶放大发亮 + 出「拾取」提示
    nearY: 170,
    healPct: 0.25,      // 低血分支：回复最大生命的 25%
    healMin: 8,
    lowHpAt: 0.6,       // 生命低于这个比例才算「低血」（低于此值才可能走回血分支）
    shield: 6,          // 护盾分支
    points: 3           // 点数分支 = 3 + 层数
  };

  /** 骷髅骑兵：近战为主，中远距离有概率改掷长矛（长矛带抛物线，看得见、闪得掉） */
  var MOB_THROW = {
    cd: 1400,         // 每隔这么久掷一次「要不要掷矛」的判定（不是每帧都掷，否则等于必掷）
    chance: 0.35,     // 每次判定的掷矛概率
    minDist: 96,      // 比这更近就老实近战（贴脸掷矛不合理）
    maxDist: 380,     // 超出这个距离它还没进入攻击距离，自然不会起手
    speed: 470,       // 出手速度
    gravity: 340,     // 抛物线重力（比玩家重力轻，飞得更平）
    mult: 1.1,        // 伤害倍率
    stick: 900        // 落地插在地上到消失(ms)
  };

  var state = {
    game: null,
    scene: null,
    container: null,
    available: false,
    enabled: true,
    booted: false,
    settings: null,
    quality: 'medium',
    renderMode: null,        // 'webgl' | 'canvas'（实际落地的渲染器）
    compatMode: false,       // 是否退到了「极简渲染配置」（画质糙一点，玩法不变）
    contextLost: false,      // WebGL 上下文是否正被系统回收（iOS 切后台常见）
    lastInitError: null,     // 初始化失败原因（供宿主显示在界面上）
    _webglProbe: undefined,  // WebGL 探测结果缓存（undefined = 尚未探测）
    _gestureGuard: false,    // 手势守卫是否已安装
    _visibilityBound: false, // 前台唤醒是否已绑定
    actionHandler: null,
    bridge: {},
    pendingStart: null
  };

  // ============================================================
  //  设置（存档集成）
  // ============================================================
  function defaultSettings() {
    return { enabled: true, quality: 'auto', particles: true, screenShake2D: true, floatText: true };
  }

  function loadSettings() {
    var s = defaultSettings();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        for (var k in s) if (p[k] !== undefined) s[k] = p[k];
      }
    } catch (e) { /* 忽略 */ }
    state.settings = s;
    state.enabled = s.enabled !== false;
    return s;
  }

  function saveSettings(patch) {
    var s = state.settings || loadSettings();
    if (patch) for (var k in patch) if (patch[k] !== undefined) s[k] = patch[k];
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { /* 忽略 */ }
    state.enabled = s.enabled !== false;
    return s;
  }

  // ============================================================
  //  画质档位（设备自适应）
  // ============================================================
  var QUALITY = {
    high:   { stars: 130, particles: true, count: 14 },
    medium: { stars: 85,  particles: true, count: 9 },
    low:    { stars: 40,  particles: false, count: 0 }
  };

  /**
   * 触摸设备（手机 / 平板）
   * 用于画质上限与触摸说明文案；比 UA 嗅探可靠，且不会误判桌面触摸屏。
   */
  function isTouchDevice() {
    try {
      return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    } catch (e) { return false; }
  }

  /**
   * WebGL 可用性主动探测
   * ------------------------------------------------------------
   * 注意：探测结果**只用来决定画质档位**，不再用来否决 WebGL 渲染器。
   * 原因是这个探测本身在苹果设备上很不可靠：它建的是 1×1 的小 context，
   * 省电模式 / 硬件加速被关 / context 名额紧张时它能过，真建 960×540 的游戏
   * context 时才翻脸；反过来，探测失败也不代表极简配置建不出来。
   * 所以渲染器选择改由 init 里的四段式尝试负责，这里只回答「大概有多强」。
   *
   * 探测用的 context 必须立刻释放 —— 移动端 WebGL context 名额有限（通常 8~16 个），
   * 泄露一个就可能让真正的游戏 context 创建失败。
   */
  function probeWebGL(force) {
    if (!force && state._webglProbe !== undefined) return state._webglProbe;
    state._webglProbe = (function () {
      var gl = null;
      try {
        var c = document.createElement('canvas');
        c.width = 1; c.height = 1;
        var opts = { failIfMajorPerformanceCaveat: false, antialias: false, depth: true, stencil: false };
        gl = c.getContext('webgl', opts) || c.getContext('experimental-webgl', opts);
        if (!gl) return false;
        // 能拿到 context 不代表真能用：部分设备 context 建得出来、着色器却编译失败
        var sh = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(sh, 'precision mediump float;\nvoid main(){gl_Position=vec4(0.0,0.0,0.0,1.0);}');
        gl.compileShader(sh);
        var ok = !!gl.getShaderParameter(sh, gl.COMPILE_STATUS);
        gl.deleteShader(sh);
        return ok;
      } catch (e) {
        return false;
      } finally {
        try {
          if (gl) {
            var lose = gl.getExtension('WEBGL_lose_context');
            if (lose) lose.loseContext();
          }
        } catch (e2) { /* 忽略 */ }
      }
    })();
    return state._webglProbe;
  }

  function detectQuality() {
    var s = state.settings || loadSettings();
    if (s.quality && s.quality !== 'auto') return s.quality;
    try {
      var cores = navigator.hardwareConcurrency || 4;
      if (cores <= 2) return 'low';
      // 低内存设备（低端安卓机常见）直接压到最低档
      if (navigator.deviceMemory && navigator.deviceMemory <= 2) return 'low';
      // WebGL 不可用 → Phaser 走 Canvas 渲染器，那是纯 CPU 光栅化，
      // 手机端必须压到最低档，否则每一帧都在掉。
      if (!probeWebGL()) return 'low';
      // 触摸设备默认封顶中档：高画质那套星尘 + 粒子在手机上掉帧明显，
      // 而「能不能玩」比「好不好看」重要。
      if (isTouchDevice()) return 'medium';
      return cores <= 4 ? 'medium' : 'high';
    } catch (e) { return 'medium'; }
  }

  function qp() { return QUALITY[state.quality] || QUALITY.medium; }

  // ============================================================
  //  工具
  // ============================================================
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ri(a, b) { return Math.floor(rnd(a, b + 1)); }
  /**
   * 中文文本的换行配置
   * ------------------------------------------------------------
   * Phaser 默认的 wordWrap 是「按空格断行」的 basicWrap —— 而中文句子没有空格，
   * 于是整段文字**根本不会换行**：它无视宽度限制一路横穿出去，压在旁边的元素上。
   * 图鉴里「文字叠在一起」的主因就是这个，而不是坐标算错。
   * 凡是中文正文都必须带上 useAdvancedWrap（按字符断行）。
   */
  function wrapCN(width) { return { width: width, useAdvancedWrap: true }; }
  function fmt(n) { return Math.round(n) + ''; }
  /** 0xRRGGBB → '#rrggbb'（飘字要字符串，颜色却来自角色形象表里的数值） */
  function hexOf(c) { return '#' + ('000000' + ((c | 0) >>> 0).toString(16)).slice(-6); }
  // 命中判定的复用矩形（每帧都要比，别每次 new）
  var _rectA = new Phaser.Geom.Rectangle(0, 0, 0, 0);
  var _rectB = new Phaser.Geom.Rectangle(0, 0, 0, 0);

  /** 毫秒 → 「M 分 S 秒」 */
  function fmtTime(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(s / 60);
    return m > 0 ? (m + ' 分 ' + (s % 60) + ' 秒') : (s + ' 秒');
  }

  // ============================================================
  //  音频（接入 AbyssAudio 程序化合成，无外部音频资源）
  // ============================================================
  function sfx(name) {
    var a = global.AbyssAudio;
    if (!a || typeof a.sfx !== 'function') return;
    try { a.sfx(name); } catch (e) { /* 音频失败不影响游戏 */ }
  }

  function setBgmScene(scene) {
    var a = global.AbyssAudio;
    if (!a || typeof a.setScene !== 'function') return;
    try { a.setScene(scene); } catch (e) { /* 忽略 */ }
  }

  // ============================================================
  //  宿主桥接（试炼文字逻辑）：商店数据 / 视图切换 / 退出试炼
  //  ------------------------------------------------------------
  //  2D 层只负责画面与交互，点位、解锁、退出流程仍由试炼模块处理，
  //  桥接缺失时（例如单独打开 2D 层）自动降级为画面内提示。
  // ============================================================
  function hasBridge(name) {
    return !!(state.bridge && typeof state.bridge[name] === 'function');
  }

  function callBridge(name, a, b) {
    if (!hasBridge(name)) return null;
    try { return state.bridge[name](a, b); } catch (e) {
      console.warn('[试炼2D] 桥接调用失败：' + name, e);
      return null;
    }
  }

  /** 房间类型 → BGM 场景（战斗/精英/镜像/Boss/宝箱/祭坛各用不同氛围） */
  function bgmForRoom(type) {
    if (type === 'boss') return 'boss';
    if (type === 'elite') return 'elite';
    if (type === 'mirror') return 'mirror';
    if (type === 'treasure') return 'explore';
    if (type === 'shrine') return 'rest';
    return 'battle';
  }

  // ============================================================
  //  纹理键
  // ============================================================
  var TEX = {
    hero: 'rt_hero', enemy: 'rt_enemy', boss: 'rt_boss',
    ground: 'rt_ground', platform: 'rt_platform',
    slash: 'rt_slash', spark: 'rt_spark', projectile: 'rt_proj', portal: 'rt_portal'
  };

  var HERO_FRAMES = { idle: [0, 1], run: [2, 3, 4, 5], jump: [6], fall: [7], attack: [8, 9, 10], hurt: [11], dead: [12], roll: [13], guard: [14] };
  var ENEMY_FRAMES = { walk: [0, 1], attack: [2, 3], hurt: [4], dead: [5, 6] };

  function registerFrames(scene, key, count) {
    var t = scene.textures.get(key);
    if (!t) return;
    for (var i = 0; i < count; i++) {
      if (!t.has(i)) t.add(i, 0, i * CELL, 0, CELL, CELL);
    }
  }

  /**
   * 引导兜底：Phaser 在「内置纹理已被解码缓存」的情况下，会在场景管理器注册
   * READY 回调之前就发出 READY（热刷新/二次进入时可能出现），结果是场景永远
   * 没进入队列 —— 表现为全屏黑屏、试炼打不开。这里检测并手动补齐队列。
   */
  function ensureSceneBooted(game, SceneClass) {
    if (!game || !game.scene) return false;
    var sm = game.scene;
    if (sm.scenes && sm.scenes.length > 0) return false;   // 已正常引导
    if (game.isRunning !== true) return false;              // 引擎自身尚未引导完，等下一轮
    try {
      sm.isBooted = false;
      sm._pending = [{ key: 'default', scene: SceneClass, autoStart: true, data: {} }];
      sm.bootQueue();
      console.log('[试炼2D] 检测到场景队列未启动，已手动补齐引导（Phaser 时序兜底）');
      return true;
    } catch (e) {
      console.warn('[试炼2D] 场景引导兜底失败：', e);
      return false;
    }
  }

  /** 安排若干次引导检查：热刷新时 Phaser 可能在纹理就绪后才发出 READY */
  function scheduleBootGuard() {
    [0, 200, 800, 2000].forEach(function (ms) {
      setTimeout(function () { ensureSceneBooted(state.game, BattleScene); }, ms);
    });
  }

  /**
   * 画布尺寸校正
   * 2D 舞台被隐藏（display:none）期间父容器尺寸为 0，Phaser 的 RESIZE 模式会把
   * 画布压成 0×0，再次显示时若不校正，所有界面坐标都会算错。
   */
  function fixCanvasSize() {
    var game = state.game, host = state.container;
    if (!game || !game.scale || !host) return;
    try {
      var vv = global.visualViewport;
      // iOS 上 window.innerHeight 是「含地址栏」的高度，visualViewport 才是真实可视区
      var availH = Math.round((vv && vv.height) || global.innerHeight || 0);
      var w = Math.max(1, host.clientWidth || global.innerWidth || 1);
      var h = Math.max(1, host.clientHeight || availH || 1);
      // 容器比可视区还高时按可视区收一收：否则底部那排触摸按钮正好落在地址栏
      // 底下，看得见却点不到（iOS 横屏时地址栏尤其占地方）
      if (availH > 0 && h > availH + 1) h = availH;
      var need = game.scale.width < 2 || game.scale.height < 2 ||
        Math.abs(game.scale.width - w) > 2 || Math.abs(game.scale.height - h) > 2;
      if (!need) return;
      game.scale.resize(w, h);
      if (state.scene && state.scene.ready) state.scene.onResize({ width: w, height: h });
    } catch (e) { /* 尺寸校正失败不影响战斗 */ }
  }

  /** 生成全部代码纹理 */  function buildTextures(scene) {
    var g = scene.make.graphics({ x: 0, y: 0 }, false);

    // 主角与敌人的精灵表由 角色形象.js 按角色按需生成
    // （ensureHeroTexture / ensureMobTexture：9 位英雄 + 10 种怪物各有专属形象）

    // ---------- 地形 ----------
    if (!scene.textures.exists(TEX.ground)) {
      g.fillStyle(0x2a2135, 1); g.fillRect(0, 0, 64, 64);
      g.fillStyle(0x3d3149, 1); g.fillRect(0, 0, 64, 10);
      g.fillStyle(0x4CAF50, 0.5); g.fillRect(0, 0, 64, 3);
      g.fillStyle(0x1a1425, 1);
      g.fillRect(8, 20, 10, 8); g.fillRect(34, 34, 12, 8); g.fillRect(46, 14, 8, 6);
      g.generateTexture(TEX.ground, 64, 64);
      g.clear();
    }
    if (!scene.textures.exists(TEX.platform)) {
      g.fillStyle(0x3a2f48, 1); g.fillRect(0, 0, 64, 20);
      g.fillStyle(0x4CAF50, 0.45); g.fillRect(0, 0, 64, 3);
      g.fillStyle(0x241d30, 1); g.fillRect(4, 10, 14, 6); g.fillRect(40, 8, 16, 7);
      g.generateTexture(TEX.platform, 64, 20);
      g.clear();
    }

    // ---------- 特效 ----------
    if (!scene.textures.exists(TEX.slash)) {
      g.lineStyle(6, 0xffffff, 0.95);
      g.beginPath(); g.arc(30, 34, 26, Phaser.Math.DegToRad(-70), Phaser.Math.DegToRad(70), false); g.strokePath();
      g.lineStyle(3, 0xa8e6ff, 0.8);
      g.beginPath(); g.arc(30, 34, 18, Phaser.Math.DegToRad(-60), Phaser.Math.DegToRad(60), false); g.strokePath();
      g.generateTexture(TEX.slash, 60, 68);
      g.clear();
    }
    if (!scene.textures.exists(TEX.spark)) {
      g.fillStyle(0xffffff, 1); g.fillCircle(4, 4, 4);
      g.generateTexture(TEX.spark, 8, 8);
      g.clear();
    }
    if (!scene.textures.exists(TEX.projectile)) {
      g.fillStyle(0x7a3ab0, 1); g.fillCircle(9, 9, 9);
      g.fillStyle(0xd8b0ff, 1); g.fillCircle(9, 9, 5);
      g.generateTexture(TEX.projectile, 18, 18);
      g.clear();
    }
    if (!scene.textures.exists(TEX.portal)) {
      g.lineStyle(4, 0x73f0b4, 0.9); g.strokeEllipse(28, 45, 44, 88);
      g.lineStyle(2, 0xd8fff0, 0.7); g.strokeEllipse(28, 45, 28, 68);
      g.generateTexture(TEX.portal, 56, 90);
      g.clear();
    }

    // ---------- 画面控件图标 ----------
    ensureIconTextures(scene);

    g.destroy();
  }

  // ============================================================
  //  敌人图鉴（类型 → 属性与行为）
  // ============================================================
  var ENEMY_TYPES = {
    claw:     { name: '黑暗爪牙',   tier: 'normal', behavior: 'chaser',  hp: 24,  atk: 4,  speed: 72,  w: 30, h: 44, scale: 1.0,  tex: 'enemy', color: 0x8a2a5a, attackRange: 58,  windup: 340, recover: 420, detect: 430 },
    skeleton: { name: '骷髅骑兵',   tier: 'normal', behavior: 'chaser',  hp: 32,  atk: 5,  speed: 98,  w: 30, h: 44, scale: 1.0,  tex: 'enemy', color: 0x8a8a9a, attackRange: 62,  windup: 300, recover: 460, detect: 470, throw: true },
    zombie:   { name: '死尸',       tier: 'normal', behavior: 'chaser',  hp: 44,  atk: 6,  speed: 52,  w: 32, h: 46, scale: 1.05, tex: 'enemy', color: 0x4a7a4a, attackRange: 58,  windup: 520, recover: 560, detect: 380, thorn: 1 },
    magma:    { name: '岩浆行者',   tier: 'normal', behavior: 'charger', hp: 36,  atk: 7,  speed: 86,  w: 32, h: 46, scale: 1.05, tex: 'enemy', color: 0xb04a1a, attackRange: 72,  windup: 430, recover: 540, detect: 520 },
    shade:    { name: '影（附身）', tier: 'normal', behavior: 'flyer',   hp: 28,  atk: 6,  speed: 112, w: 30, h: 30, scale: 0.95, tex: 'enemy', color: 0x2a2a4a, attackRange: 52,  windup: 300, recover: 380, detect: 540, fly: true },
    mimic:    { name: '镜像怪',     tier: 'mirror', behavior: 'chaser',  hp: 42,  atk: 8,  speed: 106, w: 30, h: 44, scale: 1.0,  tex: 'enemy', color: 0x6a3ab0, attackRange: 64,  windup: 300, recover: 400, detect: 480, tint: 0xd0b0ff },
    guard:    { name: '精英守卫',   tier: 'elite',  behavior: 'charger', hp: 72,  atk: 11, speed: 94,  w: 34, h: 50, scale: 1.2,  tex: 'enemy', color: 0xd4a02a, attackRange: 78,  windup: 450, recover: 540, detect: 580, tint: 0xfff0c0 },
    necro:    { name: '死灵法师',   tier: 'elite',  behavior: 'shooter', hp: 56,  atk: 9,  speed: 66,  w: 32, h: 48, scale: 1.15, tex: 'enemy', color: 0x5a3a8a, attackRange: 340, windup: 540, recover: 700, detect: 560, keepDist: 220 },
    lord:     { name: '层主',       tier: 'boss',   behavior: 'boss',    hp: 160, atk: 14, speed: 84,  w: 42, h: 60, scale: 1.5,  tex: 'boss',  color: 0xb0182a, attackRange: 92,  windup: 520, recover: 620, detect: 720 },
    shadowking:{ name: '影之皇',    tier: 'boss',   behavior: 'boss',    hp: 240, atk: 18, speed: 100, w: 44, h: 64, scale: 1.7,  tex: 'boss',  color: 0x3a0a2a, attackRange: 100, windup: 460, recover: 520, detect: 820, tint: 0xe0c0ff }
  };

  function poolForFloor(floor) {
    var pool = ['claw', 'skeleton'];
    if (floor >= 2) pool.push('zombie');
    if (floor >= 3) pool.push('magma');
    if (floor >= 4) pool.push('shade');
    if (floor >= 6) pool.push('necro');
    return pool;
  }

  // 敌人属性显示用的中文标签
  var TIER_NAMES = { normal: '普通', elite: '精英', mirror: '镜像', boss: '首领' };
  var BEHAVIOR_NAMES = { chaser: '追击', charger: '冲锋', flyer: '飞行', shooter: '远程', boss: '首领' };

  // ============================================================
  //  房间系统（地图生成 + 房间类型）
  //  每层生成一张分支地图：入口 → 分支房间 → … → Boss 房间
  //  清空房间后走向传送门即打开地图，点击相邻房间继续深入
  // ============================================================
  var ROOM_TYPES = {
    start:    { name: '入口',     icon: '⌂', fill: 0x3a3a48, line: 0xd8d8e8, center: '#d8d8e8', desc: '本层入口，少量敌人' },
    enemy:    { name: '普通房间', icon: '×', fill: 0x44444f, line: 0x9aa0b0, center: '#c8cede', desc: '普通敌人把守' },
    elite:    { name: '精英房间', icon: '★', fill: 0x24406a, line: 0x4a8ad0, center: '#7ab8ff', desc: '精英守卫 · 点数更多' },
    mirror:   { name: '镜像房间', icon: '◇', fill: 0x412a63, line: 0x9a5ad0, center: '#c79aff', desc: '镜像怪复制你的属性' },
    boss:     { name: 'Boss房间', icon: '☠', fill: 0x661a22, line: 0xd02a3a, center: '#ff8a7a', desc: '层主坐镇 · 击败后深入下一层' },
    treasure: { name: '宝箱房间', icon: '▣', fill: 0x63501c, line: 0xd4a02a, center: '#ffd76a', desc: '无战斗 · 开箱获得点数' },
    shrine:   { name: '祭坛房间', icon: '✚', fill: 0x17524c, line: 0x4ad0c0, center: '#7fe8d8', desc: '无战斗 · 祭坛恢复生命' }
  };

  var MAP_COLS = 4;   // 入口 → 中段分支 ×2 → Boss
  var MAP_ROWS = 3;

  /** 按列分配房间类型（第 1 列偏普通/镜像，第 2 列偏精英） */
  function pickRoomType(col) {
    var r = Math.random();
    if (col <= 1) {
      if (r < 0.46) return 'enemy';
      if (r < 0.68) return 'mirror';
      if (r < 0.87) return 'treasure';
      return 'shrine';
    }
    if (r < 0.32) return 'enemy';
    if (r < 0.58) return 'elite';
    if (r < 0.76) return 'mirror';
    if (r < 0.89) return 'treasure';
    return 'shrine';
  }

  /**
   * 生成一层的地图：分支网格 + 相邻连线
   * 保证：入口只有一个、最右列必为 Boss、每个房间都有入口与出路
   */
  function generateFloorMap(floor) {
    var nodes = [];
    var cols = [];
    var id = 0;
    function mk(col, row, type) {
      var n = { id: id++, col: col, row: row, type: type, links: [], visited: false, cleared: false };
      nodes.push(n);
      return n;
    }

    var start = mk(0, 1, 'start');
    start.visited = true;
    cols.push([start]);

    var prev = [start];
    for (var c = 1; c < MAP_COLS; c++) {
      var isBossCol = (c === MAP_COLS - 1);
      var rows = [];
      if (isBossCol) {
        rows = [prev[ri(0, prev.length - 1)].row];
      } else {
        prev.forEach(function (n) {
          if (rows.indexOf(n.row) < 0) rows.push(n.row);
          // 每个房间有 55% 概率再分出一条支路
          if (Math.random() < 0.55) {
            var r2 = n.row + (Math.random() < 0.5 ? -1 : 1);
            if (r2 >= 0 && r2 < MAP_ROWS && rows.indexOf(r2) < 0) rows.push(r2);
          }
        });
        if (rows.length > MAP_ROWS) rows = rows.slice(0, MAP_ROWS);
      }
      rows.sort(function (a, b) { return a - b; });
      var col = rows.map(function (r) { return mk(c, r, isBossCol ? 'boss' : pickRoomType(c, floor)); });
      cols.push(col);

      // 连接：上一列每个房间至少有一条出路，且只连相邻行
      prev.forEach(function (n) {
        var cands = col.filter(function (m) { return Math.abs(m.row - n.row) <= 1; });
        if (!cands.length) cands = [col[0]];
        n.links.push(cands[ri(0, cands.length - 1)].id);
      });
      // 本列每个房间都要有人能走到
      col.forEach(function (m) {
        var reachable = prev.some(function (n) { return n.links.indexOf(m.id) >= 0; });
        if (!reachable) {
          var best = prev.slice().sort(function (a, b) {
            return Math.abs(a.row - m.row) - Math.abs(b.row - m.row);
          })[0];
          best.links.push(m.id);
        }
      });
      prev = col;
    }

    // 保底：本层至少要有一个真正的战斗房间
    var mid = cols[1].concat(cols[2] || []);
    var hasFight = mid.some(function (n) {
      return n.type === 'enemy' || n.type === 'elite' || n.type === 'mirror';
    });
    if (!hasFight && mid.length) mid[0].type = 'enemy';

    return { floor: floor, cols: cols, nodes: nodes, current: start };
  }

  // ============================================================
  //  环境主题（按难度切换星雾与火星）
  // ============================================================
  var ENV_THEMES = {
    easy:   { name: '简单', star: 0xffffff, fog: 0x2a4a6a, fogAlpha: 0.16, ember: false, ground: 0x2a3446 },
    normal: { name: '普通', star: 0x9fd8ff, fog: 0x4a1a3a, fogAlpha: 0.22, ember: false, ground: 0x2e2a40 },
    hard:   { name: '困难', star: 0xffc9a0, fog: 0x5a2410, fogAlpha: 0.26, ember: true,  ground: 0x3a2a2a },
    hell:   { name: '地狱', star: 0xff8a5a, fog: 0x6a0a08, fogAlpha: 0.32, ember: true,  ground: 0x40201a }
  };

  function envThemeFor(diff) {
    if (diff === 'easy') return ENV_THEMES.easy;
    if (diff === 'hard' || diff === 'custom') return ENV_THEMES.hard;
    if (diff === 'hell') return ENV_THEMES.hell;
    return ENV_THEMES.normal;
  }

  // ============================================================
  //  画面内界面风格
  //  全部取自 主样式.css 既有设计语言，画面内界面不再自带一套配色：
  //   · 模态面板 ← .modal-content      rgba(15,22,44,.98) · 白 12% 描边 · 18px 圆角
  //   · 内嵌卡片 ← .trial-player-panel rgba(18,24,40,.68) · 白 7% 描边  · 10px 圆角
  //   · 血量条   ← .trial-enemy-hp     白 6% 轨道 + 语义色渐变（圆角端 · 0.4s 缓动 · 掉血残影）
  //   · 画面控件 ← .trial-ghost-btn    语义色底 + 同色描边 · 全圆角（悬浮在战场之上）
  //   · 面板动作 ← .trial-action-btn   白 3% 底 + 白 7% 描边 · 4px 圆角（面板之内）
  // ============================================================
  var FONT = '"Microsoft YaHei", "Segoe UI", system-ui, sans-serif';

  var UI = {
    // 遮罩层
    dim: 0x04060f, dimAlpha: 0.88,
    // 模态面板
    panel: 0x0f162c, panelAlpha: 0.97, panelLine: 0xffffff, panelLineAlpha: 0.12, panelR: 18,
    // 面板内嵌卡片
    box: 0x121828, boxAlpha: 0.74, boxLine: 0xffffff, boxLineAlpha: 0.07, boxR: 10,
    // 血量条（轨道 / 渐变）
    track: 0xffffff, trackAlpha: 0.06, trackBase: 0x05070f, trackBaseAlpha: 0.5,
    hpFrom: '#e86878', hpTo: '#f0d06a',
    heroFrom: '#5fd0a8', heroTo: '#73f0b4',
    shieldFrom: '#5fd0e0', shieldTo: '#9a8ef0',
    stamFrom: '#6fc8f0', stamTo: '#a8e6ff',
    // 语义文字色
    title: '#f0d06a', text: '#f0f4ff', sub: '#a8bce0', muted: '#6a7fa0',
    accent: '#5fd0e0', good: '#73f0b4', gold: '#f0d06a', danger: '#e86878',
    // 控件着色（Graphics / tint 用数值）
    cGhost: 0x5fd0e0, cPrimary: 0x73f0b4, cGold: 0xf0d06a, cDanger: 0xe86878, cPlain: 0xffffff,
    cStam: 0x6fc8f0, cPerfect: 0xffd76a,
    // 敌人层级色（与地图图例同源）
    tier: { normal: '#e8909c', elite: '#7ab8ff', mirror: '#c79aff', boss: '#ff8a7a' },
    tierHex: { normal: 0xe8909c, elite: 0x7ab8ff, mirror: 0xc79aff, boss: 0xff8a7a }
  };

  /** 圆角矩形路径（不依赖 ctx.roundRect，兼容旧引擎） */
  function pathRoundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /**
   * 血条填充纹理（语义色横向渐变 + 圆角端点 + 顶部 1px 高光）
   * 纹理宽度向上取 8 的倍数并按显示宽度 1:1 使用，因此圆角不会因横向缩放而失真。
   */
  function barTexture(scene, key, h, w, from, to) {
    var tw = Math.max(8, Math.ceil(w / 8) * 8);
    var name = 'rt_bar_' + key + '_' + h + '_' + tw;
    if (scene.textures.exists(name)) return name;
    var tex = scene.textures.createCanvas(name, tw, h);
    var ctx = tex.getContext();
    var grad = ctx.createLinearGradient(0, 0, tw, 0);
    grad.addColorStop(0, from);
    grad.addColorStop(1, to);
    pathRoundRect(ctx, 0, 0, tw, h, h / 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(0, 0, tw, Math.max(1, Math.round(h * 0.2)));
    ctx.globalCompositeOperation = 'source-over';
    tex.refresh();
    return name;
  }

  /** 血条轨道纹理：暗底 + 白 6% 槽 + 语义色 14% 细描边（对齐 .hp-bar） */
  function trackTexture(scene, h, w, tint) {
    var tw = Math.max(8, Math.ceil(w / 8) * 8);
    var name = 'rt_track_' + h + '_' + tw + '_' + tint.toString(16);
    if (scene.textures.exists(name)) return name;
    var g = scene.make.graphics({ x: 0, y: 0 }, false);
    var r = Math.min(h / 2, tw / 2);
    g.fillStyle(UI.trackBase, UI.trackBaseAlpha);
    g.fillRoundedRect(0, 0, tw, h, r);
    g.fillStyle(UI.track, UI.trackAlpha);
    g.fillRoundedRect(0, 0, tw, h, r);
    g.lineStyle(1, tint, 0.14);
    g.strokeRoundedRect(0.5, 0.5, tw - 1, h - 1, Math.max(0.5, r - 0.5));
    g.generateTexture(name, tw, h);
    g.destroy();
    return name;
  }

  /** 柔和辉光纹理（白色，运行时 tint 着色）：替代 CSS 的 box-shadow 光晕 */
  function glowTexture(scene) {
    var name = 'rt_glow';
    if (scene.textures.exists(name)) return name;
    var size = 64;
    var tex = scene.textures.createCanvas(name, size, size);
    var ctx = tex.getContext();
    var grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.26)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
    return name;
  }

  /**
   * 画面控件图标（16×16 内绘制，1:1 显示，2px 笔宽，白色 → 运行时 tint）
   * 三个图标同一套笔宽与视觉重量：文字块 / 钱袋 / 出口
   */
  function ensureIconTextures(scene) {
    var defs = {
      text: function (g) {
        g.lineStyle(2, 0xffffff, 1);
        g.beginPath(); g.moveTo(2, 4); g.lineTo(14, 4); g.strokePath();
        g.beginPath(); g.moveTo(2, 8); g.lineTo(14, 8); g.strokePath();
        g.beginPath(); g.moveTo(2, 12); g.lineTo(10, 12); g.strokePath();
      },
      shop: function (g) {
        g.lineStyle(2, 0xffffff, 1);
        g.strokeRoundedRect(3, 7, 10, 7, 2);
        g.beginPath(); g.arc(8, 7, 3, Math.PI, 0, false); g.strokePath();
      },
      quit: function (g) {
        g.lineStyle(2, 0xffffff, 1);
        g.beginPath(); g.moveTo(11.5, 3); g.lineTo(4, 3); g.lineTo(4, 13); g.lineTo(11.5, 13); g.strokePath();
        g.beginPath(); g.moveTo(8, 8); g.lineTo(15, 8); g.strokePath();
        g.fillStyle(0xffffff, 1);
        g.fillTriangle(11.5, 4.5, 15.5, 8, 11.5, 11.5);
      },
      // 技能：八芒星（与其它图标同一套笔宽）
      skill: function (g) {
        g.lineStyle(2, 0xffffff, 1);
        g.beginPath(); g.moveTo(8, 1); g.lineTo(8, 15); g.strokePath();
        g.beginPath(); g.moveTo(1, 8); g.lineTo(15, 8); g.strokePath();
        g.beginPath(); g.moveTo(4, 4); g.lineTo(12, 12); g.strokePath();
        g.beginPath(); g.moveTo(12, 4); g.lineTo(4, 12); g.strokePath();
      },
      // 图鉴：摊开的书（书脊 + 两页 + 文字行），与商店的"袋"、退出的"门"同笔宽
      codex: function (g) {
        g.lineStyle(2, 0xffffff, 1);
        g.beginPath(); g.moveTo(8, 4); g.lineTo(8, 14); g.strokePath();
        g.beginPath(); g.moveTo(8, 4); g.lineTo(2, 3); g.lineTo(2, 13); g.lineTo(8, 14); g.strokePath();
        g.beginPath(); g.moveTo(8, 4); g.lineTo(14, 3); g.lineTo(14, 13); g.lineTo(8, 14); g.strokePath();
        g.lineStyle(1, 0xffffff, 0.75);
        g.beginPath(); g.moveTo(4, 6.5); g.lineTo(6.5, 7); g.strokePath();
        g.beginPath(); g.moveTo(4, 9.5); g.lineTo(6.5, 10); g.strokePath();
        g.beginPath(); g.moveTo(9.5, 7); g.lineTo(12, 6.5); g.strokePath();
        g.beginPath(); g.moveTo(9.5, 10); g.lineTo(12, 9.5); g.strokePath();
      }
    };
    var g = null;
    Object.keys(defs).forEach(function (k) {
      var name = 'rt_ico_' + k;
      if (scene.textures.exists(name)) return;
      if (!g) g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.clear();
      defs[k](g);
      g.generateTexture(name, 16, 16);
    });
    if (g) g.destroy();
  }

  /**
   * 全局字体修正
   * Phaser 的 Text 默认字体是 Courier，与主界面的微软雅黑不一致（数字尤其突兀）。
   * 这里给工厂方法统一补上 fontFamily，避免逐个文本样式手写。
   */
  function installFontDefault() {
    if (typeof Phaser === 'undefined' || !Phaser.GameObjects) return;
    var protos = [Phaser.GameObjects.GameObjectFactory, Phaser.GameObjects.GameObjectCreator];
    protos.forEach(function (ctor) {
      if (!ctor || !ctor.prototype || typeof ctor.prototype.text !== 'function') return;
      var proto = ctor.prototype;
      if (proto.__dshFontPatched) return;
      var orig = proto.text;
      proto.text = function (x, y, text, style) {
        var s = {};
        if (style) { for (var k in style) { s[k] = style[k]; } }
        if (!s.fontFamily) s.fontFamily = FONT;
        return orig.call(this, x, y, text, s);
      };
      proto.__dshFontPatched = true;
    });
  }

  // ============================================================
  //  战斗场景
  // ============================================================
  class BattleScene extends Phaser.Scene {
    constructor() { super({ key: 'TrialBattle' }); }

    create() {
      state.scene = this;
      this.ready = false;
      this.floor = 0;
      this.points = 0;
      this.enemies = [];
      this.projectiles = [];
      this.shots = [];          // 主角的远程弹丸（箭矢 / 奥术弹 / 灵能波）
      this.groundTiles = [];
      this.platformTiles = [];
      this.platformStrips = [];
      this.boss = null;
      this.attacking = false;
      this.attackHits = {};
      this.running = false;
      this.portalOpen = false;
      this.comboCount = 0;
      this.comboTimer = 0;

      // 房间地图状态
      this.floorMap = null;      // 当前层地图（节点 + 连线）
      this.roomNode = null;      // 当前所在房间
      this.mapOpen = false;      // 地图界面是否打开（打开时物理与战斗逻辑暂停）
      this.roomGoal = null;      // 宝箱 / 祭坛等非战斗房间的目标
      this.difficulty = 'normal';
      this.env = ENV_THEMES.normal;

      // 画面内界面状态（死亡 / 商店 / 确认框 / 文字视图）
      this.shopOpen = false;
      this.shopLayer = null;
      this.shopTab = 0;
      this.shopPage = 0;
      this.shopData = null;
      this.deathOpen = false;
      this.deathLayer = null;
      this.confirmOpen = false;
      this.confirmLayer = null;
      this.pendingMapAfterShop = false;
      this._finished = false;
      this._pausedForShop = false;

      // 战绩（死亡结算显示）
      this.kills = 0;
      this.roomsCleared = 0;
      this.runStartedAt = 0;

      // 跳劈状态
      this.diving = false;
      this.diveHits = {};
      this.diveReadyAt = 0;
      this.diveFx = null;

      // 界面按钮命中区（画面坐标，随窗口重排）
      this.hudButtons = [];
      this.panelButtons = { confirm: [], shop: [], death: [], map: [] };
      this.shopItemRects = [];
      this.nearestEnemy = null;
      this._viewPaused = false;
      this._pausedForConfirm = false;

      // 对象池：飘字文本复用（性能优化，长时间战斗不产生垃圾）
      this.floatPool = [];
      this.floats = [];

      buildTextures(this);
      this.buildAnimations();
      this.buildBackground();

      // 物理分组：静态地形 + 敌人组（碰撞器只需建立一次）
      this.solids = this.physics.add.staticGroup();
      this.enemyGroup = this.physics.add.group();

      this.buildHero();
      this.buildHud();
      this.buildInput();

      // 碰撞：主角与敌人都会站在地形上
      this.physics.add.collider(this.hero, this.solids);
      this.physics.add.collider(this.enemyGroup, this.solids);
      // 主角与敌人互相阻挡（不可穿过身体）。
      // 留一个引用：跳劈下坠期间要临时关掉它（见 tryDiveAttack），不然英雄会把敌人
      // 一帧一帧地挤进地面里去。
      this._heroEnemyCollider = this.physics.add.collider(this.hero, this.enemyGroup);

      this.scale.on('resize', this.onResize, this);

      this.ready = true;
      console.log('[试炼2D] 战斗场景就绪（横版实时战斗）');

      if (state.pendingStart) {
        var d = state.pendingStart;
        state.pendingStart = null;
        this.beginRun(d);
      }
    }

    buildAnimations() {
      // 角色动画按需注册：英雄在 setHeroLook（随英雄形象重建），怪物在 spawnEnemy（按怪物类型）
      this.setHeroLook(this.heroLookId || 'warrior');
    }

    /** 切换英雄形象：精灵表 + 动画一起按该英雄的专属纹理重建（动画 key 不变，play 调用点无需改动） */
    setHeroLook(id) {
      var A = 角色形象;
      if (!A || !A.LOOKS[id] || A.LOOKS[id].kind !== 'hero') id = 'warrior';
      this.heroLookId = id;
      var tex = A.ensureHeroTexture(this, id);
      if (this.hero) this.hero.setTexture(tex);
      this.buildHeroAnims(tex);
      return tex;
    }

    buildHeroAnims(tex) {
      var self = this;
      var mk = function (key, frames, rate, repeat) {
        if (self.anims.exists(key)) self.anims.remove(key);
        self.anims.create({ key: key, frames: self.anims.generateFrameNumbers(tex, { frames: frames }), frameRate: rate, repeat: repeat });
      };
      mk('hero_idle', HERO_FRAMES.idle, 3, -1);
      mk('hero_run', HERO_FRAMES.run, 12, -1);
      mk('hero_jump', HERO_FRAMES.jump, 6, 0);
      mk('hero_fall', HERO_FRAMES.fall, 6, 0);
      mk('hero_attack', HERO_FRAMES.attack, 18, 0);
      mk('hero_hurt', HERO_FRAMES.hurt, 8, 0);
      mk('hero_roll', HERO_FRAMES.roll, 10, -1);
      mk('hero_dead', HERO_FRAMES.dead, 6, 0);
      mk('hero_guard', HERO_FRAMES.guard, 4, 0);   // 举盾（单帧姿态，靠盾光呼吸）
    }

    /** 怪物动画：按怪物类型注册；镜像怪换了玩家造型时自动重建 */
    ensureMobAnims(key, tex) {
      var A = 角色形象, keys = A.mobAnimKeys(key), F = ENEMY_FRAMES, self = this;
      // 动作（招式）多的怪物帧率更高 —— 倍率写在 角色形象.js 的形象表里
      var rate = A.animRateOf ? A.animRateOf(key) : 1;
      var mk = function (k, frames, fps, repeat) {
        fps = Math.max(1, Math.round(fps * rate));
        if (self.anims.exists(k)) {
          var cur = self.anims.get(k);
          // 纹理与帧率都对得上才复用（改帧率后必须重建，否则热刷新看不到变化）
          if (cur && cur.frames && cur.frames.length &&
            cur.frames[0].textureKey === tex && cur.frameRate === fps) return;
          self.anims.remove(k);
        }
        self.anims.create({ key: k, frames: self.anims.generateFrameNumbers(tex, { frames: frames }), frameRate: fps, repeat: repeat });
      };
      mk(keys.walk, F.walk, 6, -1);
      mk(keys.attack, F.attack, 10, 0);
      mk(keys.hurt, F.hurt, 10, 0);
      mk(keys.dead, F.dead, 6, 0);
    }

    /** 取怪物某个动作的动画 key */
    mobAnimKey(e, action) {
      var keys = 角色形象.mobAnimKeys((e && e.key) || 'claw');
      return keys[action || 'walk'] || keys.walk;
    }

    buildBackground() {
      var W = this.scale.width, H = this.scale.height;
      var env = this.env || ENV_THEMES.normal;
      this.bgStars = [];
      for (var layer = 0; layer < 3; layer++) {
        var cnt = Math.floor(qp().stars * (0.5 + layer * 0.4));
        for (var i = 0; i < cnt; i++) {
          var s = this.add.rectangle(rnd(0, W), rnd(0, H), layer === 2 ? 2 : 1, layer === 2 ? 2 : 1,
            env.star, 0.12 + layer * 0.16);
          s.scrollFactorX = 0.05 + layer * 0.07;
          s.scrollFactorY = 0.05 + layer * 0.07;
          s._layer = layer;
          this.bgStars.push(s);
        }
      }
      this.fog = this.add.rectangle(W / 2, H + 60, W * 3, 300, env.fog, env.fogAlpha);
      this.fog.setScrollFactor(0.2, 1);
      this.refreshEnvironment();
    }

    /**
     * 应用环境主题（难度 → 星色 / 雾色 / 火星粒子）
     * 阶段5：简单·白星光 普通·蓝星光 困难·暖色 地狱·红色火焰
     */
    applyEnvironment(diff) {
      this.difficulty = diff || 'normal';
      this.env = envThemeFor(this.difficulty);
      if (!this.bgStars) return;   // 背景尚未建立
      this.refreshEnvironment();
    }

    refreshEnvironment() {
      var env = this.env || ENV_THEMES.normal;
      var W = this.scale.width, H = this.scale.height;
      if (this.bgStars) {
        this.bgStars.forEach(function (s) {
          s.setFillStyle(env.star, 0.12 + s._layer * 0.16);
        });
      }
      if (this.fog) { this.fog.setFillStyle(env.fog, env.fogAlpha); }
      if (this.fogFar) { this.fogFar.setFillStyle(env.fog, env.fogAlpha * 0.7); }

      // 地狱 / 困难：上升火星
      var wantEmber = !!env.ember && qp().particles && !(state.settings && state.settings.particles === false);
      if (wantEmber && !this.emberEmitter) {
        try {
          this.emberEmitter = this.add.particles(0, 0, TEX.spark, {
            x: { min: -40, max: W + 40 }, y: H + 20,
            speedY: { min: -150, max: -60 }, speedX: { min: -24, max: 24 },
            lifespan: 2800, frequency: 120, quantity: 1,
            scale: { start: 0.5, end: 0 }, alpha: { start: 0.85, end: 0 },
            tint: [0xff7a3a, 0xffb060, 0xff4a20], blendMode: 'ADD'
          });
          this.emberEmitter.setDepth(3);
          this.emberEmitter.setScrollFactor(0.4, 0.4);
        } catch (e) { this.emberEmitter = null; }
      } else if (!wantEmber && this.emberEmitter) {
        this.emberEmitter.destroy();
        this.emberEmitter = null;
      }
    }

    buildHero() {
      this.hero = this.physics.add.sprite(120, 200, 角色形象.ensureHeroTexture(this, this.heroLookId || 'warrior'), 0);
      this.hero.setOrigin(0.5, 1);
      this.hero.body.setSize(26, 46);
      this.hero.body.setOffset((CELL - 26) / 2, CELL - 46);
      this.hero.setDepth(10);
      this.hero.setCollideWorldBounds(true);

      this.hero.hp = 100; this.hero.maxHp = 100; this.hero.shield = 0;
      this.hero.attack = 10; this.hero.critRate = 0; this.hero.critDamage = 150;
      this.hero.dodge = 0; this.hero.thorn = 0; this.hero.vampire = 0;
      this.hero.combo = 0; this.hero.execute = 0;
      this.hero.potions = 0; this.hero.name = '冒险者';

      this.invulnUntil = 0;
      this.attackReadyAt = 0;
      this.coyoteUntil = 0;
      this.jumpBufferUntil = 0;
      this.heroDead = false;

      // 体力（闪避资源）
      this.hero.stamina = STAMINA.max;
      this.hero.maxStamina = STAMINA.max;
      this.hero.perfectCount = 0;

      // 闪避（翻滚）状态
      this.dodging = false;
      this.dodgeStartAt = 0;
      this.dodgeUntil = 0;
      this.dodgeReadyAt = 0;
      this.staminaHoldUntil = 0;
      this.perfectUntil = 0;
      this._lastPerfectAt = -9999;
      this._staminaShown = STAMINA.max;
      this._afterimageAt = 0;

      // 狂怒（举盾）
      this.guarding = false;
      this.guardStartAt = 0;
      this.guardReadyAt = 0;
      this.guardFlashAt = 0;
      this.guardBlocked = false;
      this.blockCount = 0;

      // 狂怒（实时重做）：一管进攻资源 + 满值后 6 秒狂怒状态
      this.fury = 0;
      this.furyUntil = 0;
      this.furyAutoAt = 0;
      this._furyFull = false;
      this._furyWasOn = false;

      // 连招（三连斩 / 盾反 / 突进斩 / 落地斩）
      this.chainCount = 0;
      this.chainUntil = 0;
      this.counterUntil = 0;
      this.dodgeCounterUntil = 0;
      this.diveCounterUntil = 0;

      // 平台上的魂晶
      this.crystals = [];
      this.platformPerches = [];

      // 诅咒 / 环境效果（实时化）与腐化脉冲
      this.curses = [];
      this.worldEnv = null;
      this.pulseAt = 0;
      this._baseAtk = null;
      this._baseDodge = null;

      // 英雄技能（主动每层一次 / 被动常驻）
      this.skill = null;
      this.skillId = '';
      this.skillUsed = false;
      this.skillPowerUntil = 0;
      this.skillPowerMult = 1;
      this.skillVampire = 0;
      this.guardUntil = 0;
      this.skillLockUntil = 0;
      this._roomFirstHit = false;
      this._roomFirstKill = false;
      this.skillProjectiles = [];
      this.skillButtons = [];

      // 蓄力跳状态
      this.isCharging = false;
      this.chargeStart = 0;
      this.chargeRatio = 0;
      // 蓄力指示光圈（跟随脚底，随蓄力放大变色）
      this.chargeRing = this.add.circle(0, 0, 16, 0xa8e6ff, 0.2).setDepth(9).setVisible(false);
      // 举盾盾光：身前一道弧（随朝向翻转，挡下时闪金）
      this.guardArc = this.add.arc(0, 0, 26, -62, 62, false, 0x8ad8ff, 0.26).setDepth(10).setVisible(false);
      this.guardArc.setStrokeStyle(3, 0xffffff, 0.35);
      // 连招提示：窗口开着时贴在主角头顶
      this.chainHint = this.add.text(0, 0, '', { fontSize: '13px', color: UI.gold, fontStyle: 'bold' })
        .setOrigin(0.5).setDepth(12).setVisible(false);
      this.chainHint.setShadow(0, 1, '#04060f', 4, false, true);
      // 魂晶提示：走近时贴在魂晶下方，告诉玩家"这东西能捡"
      this.crystalHint = this.add.text(0, 0, '拾取', { fontSize: '12px', color: UI.accent, fontStyle: 'bold' })
        .setOrigin(0.5, 0).setDepth(12).setVisible(false);
      this.crystalHint.setShadow(0, 1, '#04060f', 4, false, true);
      this.chargeRing.setStrokeStyle(2, 0xffffff, 0.55);

      this.hero.play('hero_idle');
    }

    buildHud() {
      var W = this.scale.width, H = this.scale.height;
      this.hud = this.add.container(0, 0).setDepth(1000).setScrollFactor(0);

      // ===== 主角生命（与敌人血条同一套血条组件；护盾是叠加在生命上的第二层）=====
      this.heroMeter = this.createMeter({
        key: 'hero', h: 18, from: UI.heroFrom, to: UI.heroTo, glow: true, glowTint: UI.cPrimary
      });
      this.shieldMeter = this.createMeter({
        key: 'shield', h: 18, from: UI.shieldFrom, to: UI.shieldTo, track: false, trail: false
      });
      this.hud.add(this.meterParts(this.heroMeter));
      this.hud.add([this.shieldMeter.fill]);

      // ===== 体力（闪避资源）：青蓝细条，位于生命条正下方 =====
      this.staminaMeter = this.createMeter({
        key: 'stam', h: 9, from: UI.stamFrom, to: UI.stamTo, trail: false
      });
      // 狂怒条（金色，与青蓝体力条并排：一条管生存、一条管进攻）
      this.furyMeter = this.createMeter({
        key: 'fury', h: 9, from: '#8a3a1a', to: '#ffd76a', trail: false
      });
      this.hud.add(this.meterParts(this.furyMeter));
      // 狂怒状态的身周金环
      this.furyRing = this.add.circle(0, 0, 26, 0xffd76a, 0.24).setDepth(9).setVisible(false);
      this.furyRing.setStrokeStyle(2, 0xffd76a, 0.7);
      // 「可完美闪避」时机提示光（金色，只在危险窗口亮起）
      this.staminaTip = this.add.image(0, 0, glowTexture(this)).setTint(UI.cPerfect).setAlpha(0);
      this.hud.add([this.staminaTip].concat(this.meterParts(this.staminaMeter)));

      this.hpText = this.add.text(0, 0, '', { fontSize: '14px', color: UI.text, fontStyle: 'bold' }).setOrigin(0, 0.5);
      this.hpText.setShadow(0, 1, '#04060f', 5, false, true);
      this.shieldText = this.add.text(0, 0, '', { fontSize: '13px', color: UI.accent, fontStyle: 'bold' }).setOrigin(0, 0.5);
      this.shieldText.setShadow(0, 1, '#04060f', 5, false, true);
      this.nameText = this.add.text(24, 10, '冒险者', { fontSize: '13px', color: UI.good, fontStyle: 'bold' }).setOrigin(0, 0.5);
      this.staminaText = this.add.text(0, 0, '', { fontSize: '12px', color: UI.accent, fontStyle: 'bold' }).setOrigin(0, 0.5);
      this.staminaText.setShadow(0, 1, '#04060f', 5, false, true);
      this.sharpText = this.add.text(0, 0, '', { fontSize: '12px', color: UI.gold, fontStyle: 'bold' }).setOrigin(0, 0.5).setVisible(false);
      this.sharpText.setShadow(0, 1, '#04060f', 5, false, true);
      this.furyText = this.add.text(0, 0, '', { fontSize: '12px', color: UI.sub, fontStyle: 'bold' }).setOrigin(0, 0.5);
      this.furyText.setShadow(0, 1, '#04060f', 5, false, true);
      // 满怒 / 狂怒中的操作提示（贴在狂怒条下方，明确告诉玩家按 R）
      this.furyHint = this.add.text(0, 0, '按 R · 狂怒爆发', { fontSize: '12px', color: UI.gold, fontStyle: 'bold' }).setOrigin(0, 0.5).setVisible(false);
      this.furyHint.setShadow(0, 1, '#04060f', 5, false, true);
      this.nameText.setShadow(0, 1, '#04060f', 5, false, true);

      this.floorText = this.add.text(W - 24, 18, '第 1 层', { fontSize: '19px', color: UI.title, fontStyle: 'bold' }).setOrigin(1, 0.5);
      this.pointText = this.add.text(W - 24, 42, '试炼点数 0', { fontSize: '14px', color: UI.good }).setOrigin(1, 0.5);
      this.enemyCountText = this.add.text(W - 24, 64, '', { fontSize: '13px', color: UI.danger }).setOrigin(1, 0.5);
      this.roomText = this.add.text(W - 24, 86, '', { fontSize: '13px', color: UI.sub }).setOrigin(1, 0.5);

      // ===== 本房间环境效果（钉在「房间 · 已探索」正下方）=====
      // 面板内容全部按「右边缘 = 0」的局部坐标画，容器整体贴到 W - 24，窄屏只需改宽度。
      this.envPanel = this.add.container(0, 0).setVisible(false);
      this.envBg = this.add.graphics();
      this.envMark = this.add.graphics();
      this.envLabel = this.add.text(0, 0, '本房间环境', { fontSize: '10px', color: '#8f86c8', fontStyle: 'bold' });
      this.envName = this.add.text(0, 0, '', { fontSize: '15px', color: '#efe8ff', fontStyle: 'bold' });
      this.envValueText = this.add.text(0, 0, '', { fontSize: '12px', color: UI.gold, fontStyle: 'bold' }).setOrigin(1, 0);
      this.envEffect = this.add.text(0, 0, '', { fontSize: '11px', color: '#a99fd0', lineSpacing: 3 });
      this.envName.setShadow(0, 1, '#04060f', 5, false, true);
      this.envValueText.setShadow(0, 1, '#04060f', 4, false, true);
      this.envLabel.setShadow(0, 1, '#04060f', 4, false, true);
      this.envPanel.add([this.envBg, this.envMark, this.envLabel, this.envName, this.envValueText, this.envEffect]);

      // 诅咒胶囊（排在环境面板**上方**）：与「本房间环境」同一套语言 —— 菱形标记 + 小标签 + 内容
      this.cursePanel = this.add.container(0, 0).setVisible(false);
      this.curseBg = this.add.graphics();
      this.curseMark = this.add.graphics();
      this.curseLabel = this.add.text(0, 0, '诅咒', { fontSize: '10px', color: '#d98a96', fontStyle: 'bold' });
      this.curseLabel.setShadow(0, 1, '#04060f', 4, false, true);
      this.curseText = this.add.text(0, 0, '', {
        fontSize: '12px', color: UI.danger, lineSpacing: 4
      });
      this.curseText.setShadow(0, 1, '#04060f', 4, false, true);
      this.cursePanel.add([this.curseBg, this.curseMark, this.curseLabel, this.curseText]);

      // 腐化脉冲倒计时（垫在环境面板下方；没有对应内容时不占位）
      this.pulseText = this.add.text(W - 24, 150, '', {
        fontSize: '12px', color: UI.muted, fontStyle: 'bold'
      }).setOrigin(1, 0).setVisible(false);
      this.pulseText.setShadow(0, 1, '#04060f', 4, false, true);
      this.floorText.setShadow(0, 1, '#04060f', 5, false, true);
      this.pointText.setShadow(0, 1, '#04060f', 5, false, true);
      this.enemyCountText.setShadow(0, 1, '#04060f', 5, false, true);
      this.roomText.setShadow(0, 1, '#04060f', 5, false, true);

      // ===== 属性面板（攻击 / 暴击 / 闪避 / 护盾 / 荆棘 / 吸血 / 连击 / 斩杀）=====
      this.statPanel = this.add.container(0, 0).setScrollFactor(0);
      this.statItems = [];
      var statDefs = [
        { key: 'attack',   label: '攻', color: 0xff8a7a, always: true },
        { key: 'critRate', label: '暴', color: 0xffd76a, suffix: '%' },
        { key: 'dodge',    label: '闪', color: 0x8ab8ff, suffix: '%' },
        { key: 'shield',   label: '盾', color: 0x5fd0e0 },
        { key: 'thorn',    label: '棘', color: 0xc0a0ff },
        { key: 'vampire',  label: '吸', color: 0xff7ab0 },
        { key: 'combo',    label: '连', color: 0x9fe0c0, suffix: '%' },
        { key: 'execute',  label: '斩', color: 0xff6b6b, suffix: '%' }
      ];
      var self = this;
      statDefs.forEach(function (d) {
        // 圆形图例点：与画面内胶囊 / 血条的圆角语言一致
        var box = self.add.circle(0, 0, 4.5, d.color, 1).setOrigin(0, 0.5);
        var txt = self.add.text(0, 0, d.label + ' 0', { fontSize: '12px', color: UI.text }).setOrigin(0, 0.5);
        txt.setShadow(0, 1, '#04060f', 4, false, true);
        self.statPanel.add([box, txt]);
        self.statItems.push({ key: d.key, label: d.label, suffix: d.suffix || '', always: !!d.always, box: box, text: txt });
      });
      this.layoutStatPanel();

      // ===== 英雄技能（主动每层一次）：独立一行的胶囊，位置在 layoutHudButtons 里排 =====
      this.skillBtn = this.craftButton(this.hud, this.skillButtons, {
        action: 'skill', label: '技能', icon: 'skill', variant: 'primary',
        shape: 'pill', x: 24, y: 78, w: 72, h: 24
      });
      this.updateSkillHud();

      this.potionText = this.add.text(24, H - 48, '', { fontSize: '14px', color: '#ffb347' }).setOrigin(0, 0.5);
      this.hintText = this.add.text(W / 2, H - 22, 'A/D 移动 · 按住 W/空格 蓄力跳 · J 挥砍（空中=跳劈）· K 闪避 · E 技能 · L 药水', { fontSize: '13px', color: UI.muted }).setOrigin(0.5);
      this.comboText = this.add.text(W / 2, 44, '', { fontSize: '22px', color: UI.title, fontStyle: 'bold' }).setOrigin(0.5).setAlpha(0);

      // ===== 层主血条（顶部居中，命名 + 数值内嵌）=====
      this.bossMeter = this.createMeter({ key: 'hp', h: 14, glow: true, glowTint: UI.cDanger });
      this.hud.add(this.meterParts(this.bossMeter));
      this.bossName = this.add.text(W / 2, 82, '', { fontSize: '15px', color: UI.danger, fontStyle: 'bold' }).setOrigin(0.5);
      this.bossName.setShadow(0, 1, '#04060f', 5, false, true);
      this.bossText = this.add.text(W / 2, 100, '', { fontSize: '11px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setVisible(false);
      this.bossText.setShadow(0, 1, '#04060f', 4, false, true);
      this.bossName.setVisible(false);
      this.hud.add([this.bossName, this.bossText]);
      this.setMeterVisible(this.bossMeter, false);

      this.centerMsg = this.add.text(W / 2, H * 0.4, '', { fontSize: '30px', color: UI.title, fontStyle: 'bold' }).setOrigin(0.5).setAlpha(0);
      // 清空房间后的出口方向指引（出口在屏幕外时贴边显示）
      this.guideArrow = this.add.text(W - 52, H * 0.45, '▶ 出口', {
        fontSize: '16px', color: UI.good, fontStyle: 'bold'
      }).setOrigin(0.5).setVisible(false);

      // ===== 目标敌人属性（最近的敌人：名字 / 层级 / 生命 / 攻击 / 速度 / 行为）=====
      this.targetPanel = this.add.container(0, 0).setScrollFactor(0).setVisible(false);
      this.targetBg = this.add.graphics();
      this.targetName = this.add.text(0, 0, '', { fontSize: '13px', fontStyle: 'bold' }).setOrigin(0, 0.5);
      this.targetName.setShadow(0, 1, '#04060f', 4, false, true);
      this.targetTierBg = this.add.graphics();
      this.targetTier = this.add.text(0, 0, '', { fontSize: '11px' }).setOrigin(0, 0.5);
      this.targetHp = this.add.text(0, 0, '', { fontSize: '11px', color: UI.sub, fontStyle: 'bold' }).setOrigin(1, 0.5);
      this.targetMeter = this.createMeter({ key: 'hp', h: 10 });
      this.targetTags = [];
      var tg, tt;
      for (var ti = 0; ti < 3; ti++) {
        tg = this.add.graphics();
        tt = this.add.text(0, 0, '', { fontSize: '11px', color: UI.muted }).setOrigin(0, 0.5);
        this.targetTags.push({ gfx: tg, text: tt, last: '', x: 0, y: 0, w: 0 });
      }
      this.targetPanel.add([this.targetBg, this.targetName, this.targetTierBg, this.targetTier]);
      this.targetPanel.add(this.meterParts(this.targetMeter));
      this.targetPanel.add([this.targetHp]);
      this.targetTags.forEach(function (t) { self.targetPanel.add([t.gfx, t.text]); });

      this.hud.add([this.hpText, this.shieldText, this.staminaText, this.sharpText, this.nameText,
        this.statPanel, this.floorText, this.pointText, this.enemyCountText, this.roomText,
        this.envPanel, this.cursePanel, this.pulseText,
        this.potionText, this.hintText, this.comboText, this.centerMsg, this.guideArrow,
        this.targetPanel]);
      // 层主血条的名条 / 数值压在血条之上
      this.hud.bringToTop(this.bossName);
      this.hud.bringToTop(this.bossText);

      // ===== 画面内功能按钮（文字界面 / 商店 / 退出试炼）=====
      // 独立容器且层级最高：地图、商店、死亡面板打开时依然可用
      this.uiBar = this.add.container(0, 0).setDepth(2600).setScrollFactor(0);
      [
        { id: 'text', label: '文字界面', icon: 'text', variant: 'ghost' },
        { id: 'shop', label: '商店', icon: 'shop', variant: 'gold' },
        { id: 'codex', label: '图鉴', icon: 'codex', variant: 'ghost' },
        // 设置入口必须在画布内：实时战斗为了不挡住「攻击」键，把右下角的
        // 侧边栏开关（☰）收起来了，而设置正挂在侧边栏里 —— 不补这一颗，
        // 手机上就没法进设置，「按键自定义」也就够不着。
        { id: 'settings', label: '设置', variant: 'ghost' },
        { id: 'quit', label: '退出试炼', icon: 'quit', variant: 'danger' }
      ].forEach(function (d) {
        self.craftButton(self.uiBar, self.hudButtons, {
          action: d.id, label: d.label, icon: d.icon, variant: d.variant,
          shape: 'pill', x: 0, y: 0, w: 40, h: 28
        });
      });

      this.layoutHudButtons(W);
      this.refreshHud();
    }

    /** 主角 / 层主 / 目标面板 / 功能按钮的统一布局（随窗口宽度缩放） */
    layoutHudButtons(sizeW) {
      if (!this.heroMeter) return;
      var W = sizeW || this.scale.width;
      var k = clamp(Math.min(W / 900, 1), 0.68, 1);

      // ===== 主角：名字 + 生命条 + 数值 + 护盾 =====
      var x0 = 24, barY = 34, barW = Math.round(252 * k);
      this.nameText.setPosition(x0, 12).setFontSize(Math.max(11, Math.round(13 * k)));
      this.placeMeter(this.heroMeter, x0, barY, barW);
      this.placeMeter(this.shieldMeter, x0, barY, barW);
      this.hpText.setFontSize(Math.max(11, Math.round(14 * k)));
      this.shieldText.setFontSize(Math.max(10, Math.round(13 * k)));
      // gap 是「离条右边缘多远」，不是绝对坐标 —— 条被缩放了它才跟得住，
      // 实际位置由 meterTextX() 现算（见那里的说明）
      this._hpTextGap = 10;
      this._hpTextY = barY;

      // 体力条（生命条正下方，与属性面板 / 胶囊行保持间距）=====
      var stamY = barY + 22;
      this.placeMeter(this.staminaMeter, x0, stamY, barW);
      this.staminaTip.setPosition(x0 + barW / 2, stamY).setDisplaySize(barW * 1.08, 30);
      this.staminaText.setFontSize(Math.max(10, Math.round(12 * k)));
      this._stamTextGap = 10;
      this._stamTextY = stamY;

      // ===== 狂怒条（体力条正下方，金色；满怒时呼吸，狂怒中显示剩余秒数）=====
      var furyY = stamY + 20;
      this.placeMeter(this.furyMeter, x0, furyY, barW);
      this.furyText.setFontSize(Math.max(10, Math.round(12 * k)));
      this.furyTextPos = { gap: 10, y: furyY };
      this.furyHint.setFontSize(Math.max(10, Math.round(12 * k)));
      this.furyHintPos = { x: x0 + 4, y: furyY + 17 };
      this.paintFuryMeter();

      // ===== 英雄技能胶囊：紧贴在「攻 / 暴 / 闪 / 盾 …」属性面板正下方 =====
      // （原来排在狂怒条下方，和属性面板那一行叠在一起了）
      var gapY = Math.max(5, Math.round(6 * k));
      var skillH = Math.max(22, Math.round(24 * k));
      var statBottom = this.statPanelMetrics(W).bottom;   // 按当前宽度现算，不受上次布局影响
      if (this.skillBtn) {
        var sbY = statBottom + gapY + skillH / 2;
        this.layoutPillRow([this.skillBtn], x0, sbY, skillH, 0);
        this.updateSkillHud();
      }

      // ===== 常驻功能按钮：接在技能胶囊下面（文字界面 / 商店 / 图鉴 / 设置 / 退出试炼）=====
      var bh = Math.max(24, Math.round(28 * k));
      var rowTop = (this.skillBtn ? (this.skillBtn.y + skillH / 2) : statBottom) + gapY;
      var by = rowTop + bh / 2;
      var gapX = Math.round(8 * k);
      this.layoutPillRow(this.hudButtons, x0, by, bh, gapX);
      this._hudRowBottom = by + bh / 2;

      // 触摸设备 + 低高度横屏：目标面板要挪到顶部中央（见下），层主名字给它让一行
      var compact = this.isTouch && this.scale.height < 460;

      // ===== 层主血条 =====
      var bossW = Math.round(Math.min(460, W - 140) * Math.max(0.72, k));
      this.placeMeter(this.bossMeter, Math.round(W / 2 - bossW / 2), 100, bossW);
      this.bossName.setPosition(W / 2, compact ? 88 : 82).setFontSize(Math.max(13, Math.round(15 * k)));
      this.bossText.setPosition(W / 2, 100);

      // ===== 目标敌人属性面板 =====
      var tk = Math.max(0.84, k);
      var tpW = Math.round(252 * tk);
      var headH = Math.round(28 * tk);
      var meterY = headH + Math.round(15 * tk);
      var tagH = Math.round(18 * tk);
      var tagY = meterY + Math.round(22 * tk);
      var tpH = tagY + Math.round(tagH / 2) + Math.round(10 * tk);
      this._tp = {
        w: tpW, h: tpH, k: tk, pad: Math.round(12 * tk), headH: headH,
        headY: Math.round(14 * tk), meterY: meterY, tagY: tagY, tagH: tagH
      };
      this.paintTargetPanel();
      this.layoutTargetPanel();
      // 生命数值紧跟在血条右侧，宽度变化后必须重排（否则窄屏会脱节）
      this.refreshHud();

      // ===== 目标面板定位 =====
      // 触摸设备 + 低高度横屏（手机横着拿）：左下角整个被摇杆占住，而目标面板按
      // 老位置从 _hudRowBottom 往下排会到 y≈277，正好压在摇杆判定圈上（重叠 92×54）——
      // 玩家想瞄一眼敌人血量就会误触移动。这种屏幕上左右两侧都排满了 HUD
      // （左侧属性/按钮列，右侧诅咒胶囊 + 环境面板），只有顶部中央这一条是空的；
      // 而且锁定目标的血量本来就该摆在视线正前方，比挤在左下角更好读。
      // 必须排在 refreshHud() 之后：要按「生命数值」的实际宽度让开，否则会压住它。
      if (compact) {
        var hpx = this.meterTextX(this.heroMeter, this._hpTextGap);
        if (hpx == null) hpx = 0;
        var hpr = Math.round(hpx + (this.hpText ? this.hpText.width : 0) + 12);
        var tx = Math.max(Math.round(W / 2 - tpW / 2), hpr);
        this.targetPanel.setPosition(Math.min(tx, W - 24 - tpW), 2);
      } else {
        this.targetPanel.setPosition(24, this._hudRowBottom + Math.round(14 * tk));
      }
      this._targetCompact = compact;

      // ===== 窄屏：左右两列会横向撞上，把「诅咒 / 环境」整列压到左侧 HUD 下方 =====
      // 宽屏下左列（属性 + 技能 + 按钮 + 目标面板）到 x≈400 就结束了，右列从 x≈1058 起，互不干扰；
      // 窄屏（420）左列按钮行能伸到 x≈387，右列从 x≈124 起 —— 只能往下让，宁可往下走也不叠字。
      var leftRight = x0;
      this.hudButtons.forEach(function (b) { leftRight = Math.max(leftRight, b.x + b.w); });
      var rightLeft = W - 24 - (this._envPanelW || ENV.panelW);
      var minTop = 0;
      if (leftRight >= rightLeft) {
        minTop = (this.targetPanel.visible ? (this.targetPanel.y + this._tp.h) : this._hudRowBottom)
          + Math.round(10 * k);
      }
      if ((this._envHudMinTop || 0) !== minTop) {
        this._envHudMinTop = minTop;
        this.layoutEnvHud(W);   // 用新的下限重排一次；layoutEnvHud 不会再回调这里，无递归
      }
    }

    /** 目标面板底板：内嵌卡片风格（圆角 + 细分隔线） */
    paintTargetPanel() {
      var t = this._tp;
      if (!t || !this.targetBg) return;
      var g = this.targetBg, r = UI.boxR;
      g.clear();
      g.fillStyle(UI.trackBase, 0.42);
      g.fillRoundedRect(0, 0, t.w, t.h, r);
      g.fillStyle(UI.box, UI.boxAlpha);
      g.fillRoundedRect(0, 0, t.w, t.h, r);
      g.lineStyle(1, UI.boxLine, UI.boxLineAlpha);
      g.strokeRoundedRect(0.5, 0.5, t.w - 1, t.h - 1, r - 0.5);
      // 标题行与内容之间的分隔线（对齐 .trial-panel-header）
      g.lineStyle(1, 0xffffff, 0.07);
      g.beginPath();
      g.moveTo(t.pad, t.headH);
      g.lineTo(t.w - t.pad, t.headH);
      g.strokePath();
    }

    /** 目标面板内容排版（名字 / 层级胶囊 / 生命值 / 血条 / 属性胶囊） */
    layoutTargetPanel() {
      var t = this._tp;
      if (!t) return;
      var pad = t.pad;
      this.targetName.setPosition(pad, t.headY);
      var chipX = pad + Math.ceil(this.targetName.width) + Math.round(8 * t.k);
      var chipH = Math.round(16 * t.k);
      var chipW = Math.ceil(this.targetTier.width) + Math.round(16 * t.k);
      var g = this.targetTierBg;
      g.clear();
      g.fillStyle(0xffffff, 0.03);
      g.fillRoundedRect(chipX, t.headY - chipH / 2, chipW, chipH, chipH / 2);
      g.lineStyle(1, 0xffffff, 0.07);
      g.strokeRoundedRect(chipX + 0.5, t.headY - chipH / 2 + 0.5, chipW - 1, chipH - 1, chipH / 2 - 0.5);
      this.targetTier.setPosition(chipX + Math.round(8 * t.k), t.headY);
      this.targetHp.setPosition(t.w - pad, t.headY);
      this.placeMeter(this.targetMeter, pad, t.meterY, t.w - pad * 2);

      var x = pad;
      var self = this;
      var defs = this._targetTags || [];
      this.targetTags.forEach(function (tag, i) {
        if (!defs[i]) return;
        x = self.paintTag(tag, x, t.tagY, defs[i].text, t.tagH, defs[i].color);
      });
    }

    /** 属性小胶囊（对齐 .stat-tag：白 3% 底 + 白 7% 描边 + 全圆角） */
    paintTag(tag, x, y, text, h, color) {
      if (tag.last !== text) {
        tag.text.setText(text);
        if (color) tag.text.setColor(color);
        tag.last = text;
        tag.w = Math.ceil(tag.text.width) + 20;
        tag.x = null;              // 宽度变化 → 重画底板
      }
      if (tag.x !== x || tag.y !== y || tag._h !== h) {
        tag.x = x; tag.y = y; tag._h = h;
        var g = tag.gfx;
        g.clear();
        g.fillStyle(0xffffff, 0.03);
        g.fillRoundedRect(x, y - h / 2, tag.w, h, h / 2);
        g.lineStyle(1, 0xffffff, 0.07);
        g.strokeRoundedRect(x + 0.5, y - h / 2 + 0.5, tag.w - 1, h - 1, h / 2 - 0.5);
        tag.text.setPosition(x + 10, y);
      }
      return x + tag.w + 8;
    }

    buildInput() {
      var k = this.input.keyboard;
      this.keys = k.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.A, left2: Phaser.Input.Keyboard.KeyCodes.LEFT,
        right: Phaser.Input.Keyboard.KeyCodes.D, right2: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        jump: Phaser.Input.Keyboard.KeyCodes.W, jump2: Phaser.Input.Keyboard.KeyCodes.SPACE,
        jump3: Phaser.Input.Keyboard.KeyCodes.UP,
        attack: Phaser.Input.Keyboard.KeyCodes.J, potion: Phaser.Input.Keyboard.KeyCodes.L,
        dodge: Phaser.Input.Keyboard.KeyCodes.K,   // 闪避
        skill: Phaser.Input.Keyboard.KeyCodes.E,
        guard: Phaser.Input.Keyboard.KeyCodes.S,   // 防御（举盾）
        guard2: Phaser.Input.Keyboard.KeyCodes.DOWN,
        fury: Phaser.Input.Keyboard.KeyCodes.R     // 狂怒（满值后爆发）
      });
      k.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.DOWN, Phaser.Input.Keyboard.KeyCodes.LEFT, Phaser.Input.Keyboard.KeyCodes.RIGHT]);

      // ===== 触摸控制（虚拟摇杆 + 蓄力跳 / 攻击 / 药水）=====
      this.isTouch = isTouchDevice();
      this.touchInput = { left: false, right: false, jumpHeld: false, joyJumpHeld: false, jumpPressed: false, guardHeld: false };
      this.pointerRoles = {};
      this.joyOrigin = { x: 0, y: 0 };

      var self = this;
      var W = this.scale.width, H = this.scale.height;
      this.touchUI = this.add.container(0, 0).setDepth(1001).setScrollFactor(0);

      // 摇杆（左下）
      this.joyBase = this.add.circle(120, H - 120, 66, 0x0a0a14, 0.34).setStrokeStyle(3, 0xffffff, 0.2);
      this.joyKnob = this.add.circle(120, H - 120, 30, 0x73f0b4, 0.42);
      this.joyLabel = this.add.text(120, H - 120, '◀ ▶', { fontSize: '18px', color: '#cfe8dd' }).setOrigin(0.5);

      // 蓄力跳（右下，最大）
      this.btnJump = this.add.circle(W - 112, H - 112, 58, 0x73f0b4, 0.26).setStrokeStyle(3, 0x73f0b4, 0.65);
      this.btnJumpLabel = this.add.text(W - 112, H - 112, '蓄力跳', { fontSize: '17px', color: '#d8fff0', fontStyle: 'bold' }).setOrigin(0.5);
      // 攻击
      this.btnAttack = this.add.circle(W - 236, H - 92, 46, 0xffb347, 0.24).setStrokeStyle(3, 0xffb347, 0.65);
      this.btnAttackLabel = this.add.text(W - 236, H - 92, '攻击', { fontSize: '16px', color: '#ffe6bf', fontStyle: 'bold' }).setOrigin(0.5);
      // 药水
      this.btnPotion = this.add.circle(W - 86, H - 248, 34, 0x5fd0e0, 0.22).setStrokeStyle(2, 0x5fd0e0, 0.65);
      this.btnPotionLabel = this.add.text(W - 86, H - 248, '药水', { fontSize: '13px', color: '#d8f4ff' }).setOrigin(0.5);

      // 闪避（消耗体力 · 短时无敌）
      this.btnDodge = this.add.circle(W - 216, H - 268, 40, 0x5fd0e0, 0.24).setStrokeStyle(3, 0x5fd0e0, 0.65);
      this.btnDodgeLabel = this.add.text(W - 216, H - 268, '闪避', { fontSize: '15px', color: '#d8f4ff', fontStyle: 'bold' }).setOrigin(0.5);
      // 英雄技能（每层一次）
      this.btnSkill = this.add.circle(W - 300, H - 216, 38, 0x73f0b4, 0.24).setStrokeStyle(3, 0x73f0b4, 0.65);
      this.btnSkillLabel = this.add.text(W - 300, H - 216, '技能', { fontSize: '15px', color: '#d8fff0', fontStyle: 'bold' }).setOrigin(0.5);
      // 防御（按住举盾）
      this.btnGuard = this.add.circle(W - 312, H - 312, 36, 0xffd76a, 0.22).setStrokeStyle(3, 0xffd76a, 0.6);
      this.btnGuardLabel = this.add.text(W - 312, H - 312, '防御', { fontSize: '15px', color: '#fff0c8', fontStyle: 'bold' }).setOrigin(0.5);
      // 狂怒（满值才亮）
      this.btnFury = this.add.circle(W - 420, H - 240, 30, 0x6a5a30, 0.18).setStrokeStyle(3, 0xffb347, 0.5);
      this.btnFuryLabel = this.add.text(W - 420, H - 240, '狂怒', { fontSize: '13px', color: '#ffe0b0', fontStyle: 'bold' }).setOrigin(0.5);

      this.touchUI.add([this.joyBase, this.joyKnob, this.joyLabel,
        this.btnDodge, this.btnDodgeLabel,
        this.btnSkill, this.btnSkillLabel,
        this.btnGuard, this.btnGuardLabel,
        this.btnFury, this.btnFuryLabel,
        this.btnJump, this.btnJumpLabel, this.btnAttack, this.btnAttackLabel,
        this.btnPotion, this.btnPotionLabel]);
      this.touchUI.setVisible(this.isTouch);

      // 多点触控：可同时移动与跳跃
      this.input.addPointer(3);
      this.input.on('pointerdown', function (p) { self.updateInputMode(p); self.onPointerDown(p); });
      this.input.on('pointermove', function (p) { self.onPointerMove(p); });
      this.input.on('pointerup', function (p) { self.onPointerUp(p); });
      this.input.on('pointerupoutside', function (p) { self.onPointerUp(p); });

      // 每帧最后一站：把玩家在布局编辑器里关掉的单元按回去。
      // 放在 postupdate（而不是 update 里）—— update 中途有十几处 return，
      // 放里面必然会漏；postupdate 在渲染之前，也不会有「闪一帧」的问题。
      this.events.off('postupdate', this.enforceHiddenUnits, this);
      this.events.on('postupdate', this.enforceHiddenUnits, this);

      // 触摸设备：把操作提示换成触摸说明（短版 —— 横屏手机底部只剩摇杆与
      // 按键区之间一条窄缝，长句会被两头夹住；按钮上本来就有各自的名字）
      if (this.isTouch && this.hintText) {
        this.hintText.setText('摇杆移动（上推=蓄力跳）· 右下按键出手');
      }
      this.layoutTouchControls(this.scale.width, this.scale.height);
      this.applyCustomLayout();   // 玩家保存过的自定义布局，开局就叠上去
    }

    /**
     * 按输入方式自动切换控件：触摸 → 显示虚拟控件；鼠标 → 隐藏，保持画面干净
     */
    updateInputMode(p) {
      var isTouchPointer = (p.pointerType === 'touch') ||
        (p.pointerType === undefined && this.isTouch && p.wasTouch);
      if (this._lastInputWasTouch === isTouchPointer) return;
      this._lastInputWasTouch = isTouchPointer;
      if (this.touchUI) this.touchUI.setVisible(isTouchPointer);
      if (this.hintText) {
        this.hintText.setText(isTouchPointer
          ? '摇杆移动（上推=蓄力跳）· 右下按键出手'
          : 'A/D 移动 · 按住 W/空格 蓄力跳 · J 挥砍（空中=跳劈）· K 闪避 · E 技能 · L 药水');
      }
    }

    /** 触点是否命中某个圆形按钮 */
    hitCircle(p, circle, pad) {
      return Phaser.Math.Distance.Between(p.x, p.y, circle.x, circle.y) <= circle.radius + (pad || 16);
    }

    onPointerDown(p) {
      // 布局编辑模式：拖动面板 / 按钮，不触发任何战斗操作
      if (this.editMode) { this.layoutEditDown(p.x, p.y); return; }
      // 0) 悬停 / 按压状态先跟上，保证点下去的控制一定有反馈
      if (p.pointerType !== 'touch') this.updateUiHover(p);
      var hit = this.uiHitTest(p);
      if (hit) this.flashButtonDown(hit);
      // 1) 画面内界面按钮优先（死亡 / 商店 / 确认框 / 常驻功能按钮）
      if (this.handleUiClick(p)) return;
      // 2) 面板打开时不再接受战斗操作
      if (this.mapOpen || this.shopOpen || this.codexOpen || this.deathOpen || this.confirmOpen) return;
      if (!this.running || this.heroDead) return;

      // 摇杆与动作键（触摸设备）：取离触点最近的一个，而不是按固定顺序先到先得。
      // 小屏上按钮不可避免挨得近，而摇杆的容错半径又是最大的 —— 固定顺序会让
      // 「手指明明按在技能键上、触发的却是摇杆」。
      if (this.isTouch) {
        var hit = this.hitTouchButton(p);
        if (hit) {
          if (hit.role === 'joystick') {
            this.pointerRoles[p.id] = 'joystick';
            this.joyOrigin = { x: this.joyBase.x, y: this.joyBase.y };
            this.joyKnob.setPosition(this.joyBase.x, this.joyBase.y);
          } else if (hit.role === 'jump') {
            this.pointerRoles[p.id] = 'jump';
            this.touchInput.jumpHeld = true;
            this.touchInput.jumpPressed = true;
            this.btnJump.setFillStyle(0x73f0b4, 0.48);
            this.pressFeedback(this.btnJump, this.btnJumpLabel);
          } else if (hit.role === 'dodge') {
            this.pointerRoles[p.id] = 'dodge';
            this.pressFeedback(this.btnDodge, this.btnDodgeLabel);
            this.tryDodge();
          } else if (hit.role === 'skill') {
            this.pointerRoles[p.id] = 'skill';
            this.pressFeedback(this.btnSkill, this.btnSkillLabel);
            this.useSkill();
          } else if (hit.role === 'guard') {
            // 按住举盾：指针抬起才放下
            this.pointerRoles[p.id] = 'guard';
            this.touchInput.guardHeld = true;
            this.pressFeedback(this.btnGuard, this.btnGuardLabel);
          } else if (hit.role === 'fury') {
            this.pointerRoles[p.id] = 'fury';
            this.pressFeedback(this.btnFury, this.btnFuryLabel);
            this.tryFury();
          } else if (hit.role === 'attack') {
            this.pointerRoles[p.id] = 'attack';
            this.pressFeedback(this.btnAttack, this.btnAttackLabel);
            this.tryAttack();
          } else if (hit.role === 'potion') {
            this.pointerRoles[p.id] = 'potion';
            this.pressFeedback(this.btnPotion, this.btnPotionLabel);
            this.usePotion();
          }
          return;
        }
      }
      // 桌面/鼠标：点击画面即挥砍（滞空时自动变成跳劈）；触摸：点画面右侧空白处也挥砍
      if (!this.isTouch) this.tryAttack();
      else if (p.x > this.scale.width * (2 / 3) && p.y > this.scale.height * 0.25) this.tryAttack();
    }

    /**
     * 触摸按钮命中判定：返回离触点最近的那一个（无命中返回 null）
     * ------------------------------------------------------------
     * 用「距离 / 该按钮的判定半径」归一化后再比大小：
     * 这样判定半径小的按钮（攻击、技能）不会因为整体半径小而总被邻近的大按钮抢走，
     * 规则也更符合直觉 —— 手指落在哪个按钮中心附近，就是哪个按钮。
     */
    hitTouchButton(p) {
      if (this.touchUI && this.touchUI.visible === false) return null;
      // 容错半径只留 4px：按钮本身已经够大（直径 ≥46px），而 layoutTouchControls
      // 保证了视觉圆之间至少 10px 净空 —— 判定圈再各自外扩十几像素的话，
      // 相邻两键的判定就会重新叠在一起，又回到「按跳跃出攻击」。
      // 摇杆是拖动操作、且离按键区很远，所以它可以留大一点的容错。
      var cands = [
        { role: 'joystick', c: this.joyBase,   pad: 16 },
        { role: 'jump',     c: this.btnJump,   pad: 4 },
        { role: 'attack',   c: this.btnAttack, pad: 4 },
        { role: 'dodge',    c: this.btnDodge,  pad: 4 },
        { role: 'skill',    c: this.btnSkill,  pad: 4 },
        { role: 'guard',    c: this.btnGuard,  pad: 4 },
        { role: 'fury',     c: this.btnFury,   pad: 4 },
        { role: 'potion',   c: this.btnPotion, pad: 4 }
      ];
      var best = null, bestScore = Infinity;
      for (var i = 0; i < cands.length; i++) {
        var cd = cands[i];
        // 隐藏的按钮（技能未解锁 / 狂怒未满）不该响应触摸
        if (!cd.c || cd.c.visible === false) continue;
        var dist = Phaser.Math.Distance.Between(p.x, p.y, cd.c.x, cd.c.y);
        // 判定半径要跟着编辑器里的缩放走：玩家把它改小了，判定圈也得一起小，
        // 否则视觉分开了、手感还在打架（这正是「往小了改」的用处）。
        var reach = cd.c.radius * (cd.c.scaleX || 1) + cd.pad;
        if (dist > reach) continue;
        var score = dist / reach;   // 越接近中心越小
        if (score < bestScore) { bestScore = score; best = cd; }
      }
      return best;
    }

    /** 画面坐标下的矩形按钮命中测试（按列表顺序，返回首个命中的按钮） */
    hitBtnList(p, list) {
      if (!list || !list.length) return null;
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        var pad = b.pad || 2;
        if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - b.h / 2 - pad && p.y <= b.y + b.h / 2 + pad) return b;
      }
      return null;
    }

    /**
     * 界面点击分发（返回 true 表示已消费）
     * 层级：确认框 → 商店 → 死亡面板 → 常驻功能按钮
     */
    handleUiClick(p) {
      var pb = this.panelButtons || {};
      if (this.confirmOpen) {
        var cb = this.hitBtnList(p, pb.confirm);
        if (cb) {
          sfx('click');
          if (cb.action === 'yes') this.confirmYes(); else this.confirmNo();
        }
        return true;   // 严格模态：吞掉其余点击
      }
      // 常驻功能按钮：面板打开时整行已被 syncUiBarVisibility 收起 ——
      // 命中必须同步跳过，否则会出现「点在图鉴 / 结算面板上，触发的却是
      // 藏在后面的退出试炼」这种看不见却点得到的怪事。
      if (!this.panelOverlayOpen()) {
        var hb = this.hitBtnList(p, this.hudButtons);
        if (hb) { this.onHudAction(hb.id); return true; }
      }
      if (this.shopOpen) {
        var sb = this.hitBtnList(p, pb.shop);
        if (sb) { sfx('click'); this.onShopAction(sb.action); return true; }
        var item = this.hitBtnList(p, this.shopItemRects);
        if (item) { this.buyShopItem(item.id); return true; }
        return true;
      }
      if (this.codexOpen) {
        var xb = this.hitBtnList(p, pb.codex);
        if (xb) { sfx('click'); this.onCodexAction(xb.action); return true; }
        if (this.handleCodexClick(p)) return true;
        return true;
      }
      if (this.deathOpen) {
        var db = this.hitBtnList(p, pb.death);
        if (db) { sfx('click'); this.onDeathAction(db.action); return true; }
        return true;
      }
      if (this.mapOpen) {
        var mb = this.hitBtnList(p, pb.map);
        if (mb) { sfx('click'); this.onMapAction(mb.action); return true; }
        return true;
      }
      var skb = this.hitBtnList(p, this.skillButtons);
      if (skb) { sfx('click'); this.useSkill(); return true; }
      return false;
    }

    /**
     * 盯住设置面板的开关：面板关掉后恢复战斗。
     * 用 MutationObserver 而不是定时轮询 —— 面板可能被好几种方式关掉
     * （关闭按钮 / 点遮罩 / Esc / 从里面点「打开编辑器」时它自己隐藏）。
     * 编辑模式那边自己管 running，这里只管把 _viewPaused 放开。
     */
    watchSettingsClosed() {
      var self = this;
      var modal = document.getElementById('settingsModal');
      if (!modal || typeof MutationObserver === 'undefined') { this._viewPaused = false; return; }
      if (this._settingsObs) { this._settingsObs.disconnect(); this._settingsObs = null; }
      var prev = modal.classList.contains('hidden');
      this._settingsObs = new MutationObserver(function () {
        var now = modal.classList.contains('hidden');
        if (now && !prev) {
          self._viewPaused = false;
          self._settingsObs.disconnect();
          self._settingsObs = null;
        }
        prev = now;
      });
      this._settingsObs.observe(modal, { attributes: true, attributeFilter: ['class'] });
    }

    /** 常驻功能按钮：文字界面 / 商店 / 图鉴 / 设置 / 退出试炼 */
    onHudAction(id) {
      if (id === 'text') {
        sfx('click');
        if (!hasBridge('toggleView')) { this.showCenter('文字界面需从试炼入口进入', '#ffd76a'); return; }
        // 暂停本局（画面切走后不再推进战斗）
        this.pauseForView();
        callBridge('toggleView', this.buildSnapshot());
        return;
      }
      if (id === 'shop') {
        if (this.shopOpen) this.closeShop(); else this.openShop();
        return;
      }
      if (id === 'codex') {
        if (this.codexOpen) this.closeCodex(); else this.openCodex();
        return;
      }
      if (id === 'settings') {
        sfx('click');
        if (typeof window.openSettingsModal !== 'function') {
          this.showCenter('设置不可用', '#ffd76a');
          return;
        }
        // 设置面板是全屏模态（z-index 114514，盖在画布上），所以必须冻结战斗 ——
        // 否则玩家在调设置时会被看不见的敌人打死。
        this._viewPaused = true;
        this.clearStaleInput();
        window.openSettingsModal();
        this.watchSettingsClosed();
        return;
      }
      if (id === 'quit') {
        // 撤离确认要说清「现在走能拿到什么」—— 这是「稳 vs 贪」那个抉择的决策依据，
        // 不说清玩家只会觉得退出=放弃
        if (this.heroDead) {
          this.askQuit('已倒下，确认退出试炼？');
        } else {
          var rw = callBridge('rewardPreview', {
            floor: this.floor, points: this.points, kills: this.kills || 0, extracted: true
          });
          this.askQuit(rw
            ? '主动撤离 ×1.25 结算：\n本次带回 ' + rw.totalGold + ' 金币 · ' + rw.totalXp + ' 经验\n继续深入产出更高，但战死只有基础倍率'
            : '确认退出试炼？本局进度将结束');
        }
        return;
      }
    }

    /**
     * 是否有全屏面板正占用画面
     * ------------------------------------------------------------
     * 这些面板都是画布内的独立图层：地图 2000 / 商店 2200 / 死亡结算 2200 /
     * 图鉴 2310 / 撤离确认 2400；而常驻功能按钮行 uiBar 的层级是 2600 ——
     * 比它们全都高，于是看图鉴、看结算时这排按钮横在面板正上方，把内容盖住。
     * _viewPaused 时画面被 DOM 全屏模态（设置面板）盖住，同样让它让位。
     */
    panelOverlayOpen() {
      return !!(this.mapOpen || this.shopOpen || this.codexOpen ||
                this.deathOpen || this.confirmOpen || this._viewPaused);
    }

    /**
     * 常驻功能按钮行（文字界面 / 商店 / 图鉴 / 设置 / 退出试炼）的显隐
     * ------------------------------------------------------------
     * 面板一打开就整行收起。每个面板都自带关闭按钮（商店 / 图鉴的「关闭」、
     * 死亡结算的「试炼商店 / 退出试炼」、撤离确认的「继续战斗」），
     * 所以收起这排按钮不会把玩家困在面板里。
     * 面板打开期间战斗虽然被暂停，但场景 update 仍在跑（只有切文字界面才会
     * scene.pause），因此统一在这里每帧对齐状态，不必去每个开关点插调用。
     */
    syncUiBarVisibility() {
      if (!this.uiBar) return;
      var want = !this.panelOverlayOpen();
      if (this.uiBar.visible !== want) this.uiBar.setVisible(want);
    }

    /** 按钮按压缩放反馈（大按钮优化：手感更明确） */
    pressFeedback(circle, label) {
      var targets = label ? [circle, label] : [circle];
      try {
        this.tweens.add({ targets: targets, scaleX: 0.9, scaleY: 0.9, duration: 70, yoyo: true });
      } catch (e) { /* 忽略 */ }
    }

    onPointerMove(p) {
      if (this.editMode) { this.layoutEditMove(p.x, p.y); return; }
      // 界面按钮悬停（鼠标设备；与触摸摇杆互不干扰）
      if (p.pointerType !== 'touch') this.updateUiHover(p);
      if (this.pointerRoles[p.id] !== 'joystick') return;
      var dx = p.x - this.joyOrigin.x;
      var dy = p.y - this.joyOrigin.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      // 摇杆的拖动行程同样跟着缩放走（编辑器里把摇杆改小了，行程也该短）
      var maxR = 58 * (this.joyBase && this.joyBase.scaleX ? this.joyBase.scaleX : 1);
      var k = dist > maxR ? maxR / dist : 1;
      this.joyKnob.setPosition(this.joyOrigin.x + dx * k, this.joyOrigin.y + dy * k);
      // 横版只需左右；留一点死区避免误触
      this.touchInput.left = dx < -12;
      this.touchInput.right = dx > 12;

      // 摇杆上推 = 蓄力跳（松开摇杆即起跳），单手也能跳
      var up = dy < -34 && Math.abs(dy) > Math.abs(dx);
      if (up && !this.touchInput.joyJumpHeld) {
        this.touchInput.joyJumpHeld = true;
        this.touchInput.jumpPressed = true;
      } else if (!up && this.touchInput.joyJumpHeld) {
        this.touchInput.joyJumpHeld = false;
      }
    }

    onPointerUp(p) {
      if (this.editMode) { this.layoutEditUp(); return; }
      var role = this.pointerRoles[p.id];
      delete this.pointerRoles[p.id];
      if (role === 'joystick') {
        this.touchInput.left = false;
        this.touchInput.right = false;
        this.touchInput.joyJumpHeld = false;
        this.joyKnob.setPosition(this.joyBase.x, this.joyBase.y);
      } else if (role === 'jump') {
        this.touchInput.jumpHeld = false;
        this.btnJump.setFillStyle(0x73f0b4, 0.26);
      } else if (role === 'guard') {
        this.touchInput.guardHeld = false;
        this.btnGuard.setFillStyle(0xffd76a, 0.22);
      }
    }

    onResize(size) {
      if (!this.ready) return;
      if (!size || size.width < 40 || size.height < 40) return;   // 舞台隐藏期间容器为 0，忽略
      var W = size.width, H = size.height;
      this.floorText.setPosition(W - 24, 18);
      this.pointText.setPosition(W - 24, 42);
      this.enemyCountText.setPosition(W - 24, 64);
      if (this.roomText) this.roomText.setPosition(W - 24, 86);
      this.layoutEnvHud(W);   // 环境面板 / 诅咒条 / 脉冲倒计时（含环境面板底板重绘）
      // 触摸控件先排：底部文字要按摇杆与按键区的实际位置避让，得先知道它们在哪
      this.layoutTouchControls(W, H);
      // 药水数：摇杆占着左下角，它必须落在摇杆的判定圈之外。原来固定在 H-48，
      // 横屏落在圈里、竖屏更是直接被圆盖住（重叠 59×11）。
      var tz = this._touchZone;
      if (this.isTouch && tz) {
        this.potionText.setPosition(24, Math.max(96, Math.round(tz.joyTop) - 26));
      } else {
        this.potionText.setPosition(24, H - 48);
      }
      // 操作提示：横屏时摇杆与按键区之间只剩一条窄缝，居中摆会被两头夹住，
      // 所以放进缝里；竖屏底部空着，照常居中。
      if (this.isTouch && H < 460 && tz) {
        this.hintText.setPosition(Math.round((tz.joyRight + tz.left) / 2), H - 22);
      } else {
        this.hintText.setPosition(W / 2, H - 22);
      }
      this.centerMsg.setPosition(W / 2, H * 0.4);
      this.comboText.setPosition(W / 2, 44);
      if (this.fog) { this.fog.setSize(W * 3, 300); this.fog.setPosition(W / 2, H + 60); }
      this.layoutStatPanel(W);
      this.layoutHudButtons(W);

      // 画布高度变了（地址栏收起/展开、进出全屏、旋屏）→ 关卡是按**旧高度**铺的：
      // groundY、平台高度、地板、相机边界全都按旧尺寸算过，之后没人重算。
      // 真机实测到的典型症状：进试炼时先按 650 高建好关卡（groundY=554），
      // 画布随后缩到 334（地址栏让位）→ **地面永远留在屏幕外**，相机也无事可做。
      // 所以高度差超过阈值就按新尺寸重建当前房间（代价：本房间敌人会重置，
      // 但总比整关错位、看不见地面强）。重建走 buildLevel，不会回头调用 onResize，无递归。
      if (this.ready && this.levelWidth && Math.abs(H - (this._builtH || 0)) > 24) {
        this._builtH = H;
        this.buildLevel(this.roomNode);
        // 注意：**不能 return** —— 后面还有面板重排与 applyCustomLayout（玩家自定义的面板/按钮
        // 位置），跳过去就等于「尺寸一变，玩家调好的布局全丢」。buildLevel 不会再回调 onResize，无递归。
      }

      // HUD 下沿变了（安全线跟着变）→ 相机边界、跟随参数都要重算，
      // 否则竖屏↔横屏切换、地址栏收起等尺寸变化后会留下过时的死区/偏移。
      if (this.levelWidth) {
        this.applyCameraBounds();
        this.applyCameraFollow();
      }

      // 地图打开时按新尺寸重排（不改变地图状态）
      if (this.mapOpen && this.mapLayer) {
        this.destroyLayer('mapLayer');
        this.buildMapLayer(W, H);
      }
      // 画面内界面（死亡 / 商店 / 确认框）同样按新尺寸重排
      if (this.deathOpen) { this.destroyLayer('deathLayer'); this.buildDeathLayer(W, H); }
      if (this.shopOpen) { this.destroyLayer('shopLayer'); this.buildShopLayer(W, H); }
      if (this.codexOpen) { this.destroyLayer('codexLayer'); this.buildCodexLayer(W, H); }
      if (this.confirmOpen) { this.destroyLayer('confirmLayer'); this.buildConfirmLayer(W, H); }

      // 最后叠一层玩家自定义：上面刚把基准位置算好，这里覆盖成玩家要的位置。
      // 基准刚重算过，之前的「已应用偏移」记录必须作废 —— 不清的话 applyCustomLayout
      // 会以为偏移早就搬上去了，直接什么都不做。
      this._appliedOffset = {};
      this._invalidateEditCache();       // 基准变了，外框缓存跟着作废
      this.applyCustomLayout();
    }

    /** 遮罩层（对齐 .modal-backdrop：暗场让面板成为唯一焦点） */
    addDim(layer, W, H, alpha) {
      var r = this.add.rectangle(W / 2, H / 2, W, H, UI.dim, alpha != null ? alpha : UI.dimAlpha);
      layer.add(r);
      return r;
    }

    /**
     * 面板底板：圆角 + 1px 细描边 + 顶部内高光
     * 对齐 .modal-content（18px 圆角 / 白 12% 描边）与 .trial-player-panel（10px / 白 7%）
     */
    addPanel(layer, x, y, w, h, opts) {
      opts = opts || {};
      var r = Math.max(2, opts.radius != null ? opts.radius : UI.panelR);
      var g = this.add.graphics();
      g.fillStyle(opts.fill != null ? opts.fill : UI.panel,
        opts.fillAlpha != null ? opts.fillAlpha : UI.panelAlpha);
      g.fillRoundedRect(x, y, w, h, r);
      // 顶部内高光：让圆角面板有厚度的暗示（与胶囊、血条的高光同源）
      g.fillStyle(0xffffff, 0.03);
      g.fillRoundedRect(x + 1, y + 1, w - 2, Math.max(2, h * 0.16), Math.max(1, r - 1));
      g.lineStyle(1, opts.line != null ? opts.line : UI.panelLine,
        opts.lineAlpha != null ? opts.lineAlpha : UI.panelLineAlpha);
      g.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, r - 0.5);
      layer.add(g);
      return g;
    }

    /** 销毁某个界面层（含其中的补间） */
    destroyLayer(name) {
      var layer = this[name];
      if (!layer) return;
      var self = this;
      try { this.tweens.killTweensOf(layer); } catch (e) { /* 忽略 */ }
      if (layer.list) layer.list.forEach(function (c) { self.tweens.killTweensOf(c); });
      layer.destroy(true);
      this[name] = null;
      this._hoverBtn = null;   // 层被销毁后不能继续持有悬停按钮引用
      this._hoverRow = null;
    }

    /**
     * 触摸控件布局
     * ------------------------------------------------------------
     * 手机横屏的空间比桌面紧张得多：6.7 寸手机的横屏 CSS 视口只有约 800×360，
     * 而右手要在里面放下攻击 / 跳跃 / 闪避 / 技能 / 防御 / 药水 / 狂怒七个键。
     * 旧版沿「右下角向外辐射」摆，七个键挤进 228×163 的一小块里：最小键直径
     * 只有 42px（低于 44px 的触摸下限），判定圈更互相重叠 25px —— 手指按在
     * 「蓄力跳」上会触发「攻击」。
     *
     * 改成「两行网格 + 半径驱动间距」：
     *   · 下排三个主键（闪避 / 跳跃 / 攻击）最大，落在拇指最顺手的右下角
     *   · 上排四个次键（药水 / 防御 / 技能 / 狂怒）略小，排成一横排
     *   · 间距全部由「实际半径 + 净空」现算，所以任何屏幕上都不会挤到一起，
     *     也不会因为屏幕比例变化而算错
     *   · 半径有绝对下限（直径 46px），小屏上按键不会缩到点不中
     *   · 整块压在屏幕右侧，把中央视野还给战斗
     * 竖屏沿用同一套规则，只是列数从 4 收到 2、行数从 2 放到 4。
     */
    layoutTouchControls(W, H) {
      if (!this.touchUI) return;

      // 半径下限 23 → 直径 46px：比这个更小手指按不准
      function rad(base, k) { return Math.max(23, Math.round(base * k)); }

      var m, gap, jr, jx, jy, zoneLeft, zoneTop;

      if (W < H * 0.85) {
        // ---------- 竖屏：摇杆独占左下，动作键收进右侧两列四行 ----------
        var kp = clamp(W / 420, 0.72, 1);
        m = Math.max(10, Math.round(14 * kp));
        gap = Math.max(8, Math.round(12 * kp));

        var pA = rad(52, kp);              // 主键
        var pB = rad(31, kp);              // 次键
        var colB = W - m - pA;             // 贴右手拇指的一列
        var colA = colB - (pA + pA + gap);
        var r1 = H - m - pA;
        var r2 = r1 - (pA + pB + gap);
        var r3 = r2 - (pB + pB + gap);
        var r4 = r3 - (pB + pB + gap);

        this.placeTouchBtn(this.btnJump, this.btnJumpLabel, colB, r1, pA, 17 * kp);
        this.placeTouchBtn(this.btnAttack, this.btnAttackLabel, colA, r1, pA, 17 * kp);
        this.placeTouchBtn(this.btnDodge, this.btnDodgeLabel, colB, r2, pB, 14 * kp);
        this.placeTouchBtn(this.btnSkill, this.btnSkillLabel, colA, r2, pB, 14 * kp);
        this.placeTouchBtn(this.btnPotion, this.btnPotionLabel, colB, r3, pB, 14 * kp);
        this.placeTouchBtn(this.btnGuard, this.btnGuardLabel, colA, r3, pB, 14 * kp);
        this.placeTouchBtn(this.btnFury, this.btnFuryLabel, colB, r4, pB, 14 * kp);

        jr = rad(60, kp);
        jx = m + jr;
        jy = H - m - jr;
        zoneLeft = colA - pA;
        zoneTop = r4 - pB;
      } else {
        // ---------- 横屏（手机横屏 / 平板 / 桌面）：两行网格 ----------
        var kk = clamp(Math.min(W / 800, H / 360), 0.9, 1.25);
        m = Math.max(10, Math.round(14 * kk));
        gap = Math.max(8, Math.round(10 * kk));

        var rA = rad(32, kk);              // 主键
        var rB = rad(25, kk);              // 次键
        var dB = rA + rA + gap;            // 主键 ↔ 主键
        var dS = rB + rB + gap;            // 次键 ↔ 次键
        var dM = rA + rB + gap;            // 上下两行之间

        var col3 = W - m - rA;
        var col2 = col3 - dB;
        var col1 = col2 - dB;
        var col0 = col1 - dS;
        var rowA = H - m - rA;
        var rowB = rowA - dM;

        // 下排：攻击占最右下的拇指位，跳跃与闪避在其左
        this.placeTouchBtn(this.btnDodge, this.btnDodgeLabel, col1, rowA, rA, 15 * kk);
        this.placeTouchBtn(this.btnJump, this.btnJumpLabel, col2, rowA, rA, 15 * kk);
        this.placeTouchBtn(this.btnAttack, this.btnAttackLabel, col3, rowA, rA, 15 * kk);
        // 上排：低频 / 条件键，排成一横排
        this.placeTouchBtn(this.btnPotion, this.btnPotionLabel, col0, rowB, rB, 13 * kk);
        this.placeTouchBtn(this.btnGuard, this.btnGuardLabel, col1, rowB, rB, 13 * kk);
        this.placeTouchBtn(this.btnSkill, this.btnSkillLabel, col2, rowB, rB, 13 * kk);
        this.placeTouchBtn(this.btnFury, this.btnFuryLabel, col3, rowB, rB, 13 * kk);

        jr = rad(48, kk);
        jx = m + jr;
        jy = H - m - jr;
        zoneLeft = col0 - rB;
        zoneTop = rowB - rB;
      }

      this.joyBase.setRadius(jr).setPosition(jx, jy);
      this.joyKnob.setRadius(Math.round(jr * 0.45)).setPosition(jx, jy);
      this.joyLabel.setFontSize(Math.max(13, Math.round(jr * 0.34))).setPosition(jx, jy);

      // 供 onResize 摆底部文字：记下摇杆半径与按键区左上角，好把文字放进两者之间的空档
      this._joyR = jr;
      this._touchZone = { left: zoneLeft, top: zoneTop, joyRight: jx + jr, joyTop: jy - jr };
    }

    /** 摆放一个圆形触摸键（圆本体 + 居中标签） */
    placeTouchBtn(circle, label, x, y, r, fontPx) {
      if (circle) circle.setRadius(r).setPosition(x, y);
      if (label) label.setFontSize(Math.max(11, Math.round(fontPx))).setPosition(x, y);
    }

    /* ============================================================
       自定义布局（设置 → 2D 试炼按键自定义）
       ------------------------------------------------------------
       分工：布局函数（layoutTouchControls / layoutHudButtons / layoutEnvHud …）
       算出「响应式基准位置」，这一层在基准之上叠加玩家的偏移 / 缩放 /
       透明度 / 隐藏。

       为什么要分层：基准永远由布局函数算，玩家的自定义只是一层覆盖 ——
       换分辨率、转屏、切视图都不会把布局算坏。而 applyCustomLayout 总是
       紧跟在布局之后调用，所以「基准 + 偏移」每次都是从同一个起点重算
       （幂等），拖动时不会越拖越偏。

       坐标按屏幕比例（0~1）保存，同一份配置在任何分辨率下都成立。
       ============================================================ */

    /** 读取玩家保存的布局；返回 { 单元id: {dx,dy,s,a,v} } */
    loadCustomLayout() {
      if (this.customLayout) return this.customLayout;
      var items = {};
      try {
        var raw = localStorage.getItem(LAYOUT_KEY);
        var d = raw ? JSON.parse(raw) : null;
        if (d && d.items && typeof d.items === 'object') items = d.items;
      } catch (e) { /* 读坏了就按默认布局走 */ }
      this.customLayout = items;
      return items;
    }

    saveCustomLayout() {
      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify({ v: 1, items: this.customLayout || {} }));
      } catch (e) { /* 隐私模式写不进去，本次会话内仍然生效 */ }
    }

    /**
     * 去抖保存
     * ------------------------------------------------------------
     * 缩放 / 透明度滑杆拖一次会甩出几十个 input 事件，原来每个都同步
     * JSON.stringify + localStorage.setItem —— 那是**同步磁盘 I/O**，会把主线程
     * 堵住，手机上滑起来就是一顿一顿的。积到停手之后再落盘一次即可；
     * 退出编辑时还会立刻补一次（见 exitLayoutEdit），不会丢。
     */
    saveCustomLayoutSoon() {
      var self = this;
      if (this._saveTimer) clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(function () {
        self._saveTimer = null;
        self.saveCustomLayout();
      }, 250);
    }

    /** 取（必要时建）某一项的配置 */
    layoutEntry(id, create) {
      var L = this.loadCustomLayout();
      if (!L[id] && create) L[id] = { dx: 0, dy: 0, s: 1, a: 1, v: true };
      return L[id];
    }

    /** 该项是否被玩家改过 */
    isCustomized(id) {
      var c = (this.customLayout || {})[id];
      if (!c) return false;
      return !!(c.dx || c.dy || (c.s != null && c.s !== 1) ||
                (c.a != null && c.a !== 1) || c.v === false);
    }

    /**
     * 可编辑单元表
     * ------------------------------------------------------------
     * 每个单元 = 「一组一起移动、一起缩放的对象」。三类部件互不重叠，
     * 避免同一个对象被平移两次：
     *   meters → 走 placeMeter（血条的子对象由它统一重新定位）
     *   btns   → 数据按钮，改 x/y 后重绘
     *   objs   → 普通显示对象，直接平移 x/y
     * style 是「缩放 / 透明度 / 隐藏」的作用对象（含上面那些子对象）。
     * apply 用于位置由别处变量决定的特殊情况：生命数值这类文本每次
     * refreshHud 都会用 meterTextX 重新摆位，直接挪文本会被下一次刷新弹回去，
     * 所以必须改源头。
     */
    editableUnits() {
      var self = this;
      var U = [];
      function unit(id, label, group, o) {
        o.id = id; o.label = label; o.group = group;
        o.objs = o.objs || []; o.meters = o.meters || []; o.btns = o.btns || [];
        if (!o.style) {
          o.style = o.objs.slice();
          // 血条类单元：meter 的填充 / 拖影 / 底槽也要能缩放，否则「生命条」
          // 只有旁边的数字在缩，条本身纹丝不动。
          // 它们的纹理宽度就是条宽（placeMeter 用 setDisplaySize(w,h) 后 scale 恰为 1），
          // 所以直接 setScale 就是等比缩小；paintMeter 只动裁剪（纹理坐标），不受影响。
          // 唯独 glow 用固定尺寸纹理、scale 不等于 1，再叠一层会把它算成一个小点，必须排除。
          o.meters.forEach(function (m) {
            if (!m) return;
            ['track', 'trailImg', 'fill'].forEach(function (k) { if (m[k]) o.style.push(m[k]); });
          });
        }
        o.anchor = function () {
          if (o.anchorMeter) return { x: o.anchorMeter.x, y: o.anchorMeter.y };
          if (o.anchorBtn) return { x: o.anchorBtn.x, y: o.anchorBtn.y };
          if (o.anchorObj) return { x: o.anchorObj.x, y: o.anchorObj.y };
          return { x: 0, y: 0 };
        };
        U.push(o);
      }

      // ---------- 触摸按钮 ----------
      unit('t.joy', '摇杆', '按钮', { objs: [this.joyBase, this.joyKnob, this.joyLabel], anchorObj: this.joyBase });
      unit('t.jump', '蓄力跳', '按钮', { objs: [this.btnJump, this.btnJumpLabel], anchorObj: this.btnJump });
      unit('t.attack', '攻击', '按钮', { objs: [this.btnAttack, this.btnAttackLabel], anchorObj: this.btnAttack });
      unit('t.dodge', '闪避', '按钮', { objs: [this.btnDodge, this.btnDodgeLabel], anchorObj: this.btnDodge });
      unit('t.potion', '药水键', '按钮', { objs: [this.btnPotion, this.btnPotionLabel], anchorObj: this.btnPotion });
      unit('t.guard', '防御', '按钮', { objs: [this.btnGuard, this.btnGuardLabel], anchorObj: this.btnGuard });
      unit('t.skill', '技能键', '按钮', { objs: [this.btnSkill, this.btnSkillLabel], anchorObj: this.btnSkill });
      unit('t.fury', '狂怒', '按钮', { objs: [this.btnFury, this.btnFuryLabel], anchorObj: this.btnFury });

      // ---------- 左上：主角状态 ----------
      unit('h.name', '主角名', '信息面板', { objs: [this.nameText], anchorObj: this.nameText });
      unit('h.hp', '生命条', '信息面板', {
        meters: [this.heroMeter, this.shieldMeter],
        objs: [this.hpText, this.shieldText],
        anchorMeter: this.heroMeter,
        apply: function (dx, dy) {
          // 偏移叠在 gap 上而不是绝对坐标上：条被缩放后数字还要跟得住（见 meterTextX）
          if (self._hpTextGap != null) { self._hpTextGap += dx; self._hpTextY += dy; }
        }
      });
      unit('h.stam', '体力条', '信息面板', {
        meters: [this.staminaMeter], objs: [this.staminaText, this.staminaTip],
        anchorMeter: this.staminaMeter,
        apply: function (dx, dy) {
          if (self._stamTextGap != null) { self._stamTextGap += dx; self._stamTextY += dy; }
        }
      });
      unit('h.fury', '狂怒条', '信息面板', {
        meters: [this.furyMeter], objs: [this.furyText, this.furyHint],
        anchorMeter: this.furyMeter,
        apply: function (dx, dy) {
          if (self.furyTextPos) { self.furyTextPos.gap += dx; self.furyTextPos.y += dy; }
          if (self.furyHintPos) { self.furyHintPos.x += dx; self.furyHintPos.y += dy; }
        }
      });
      // 属性面板 / 环境面板 / 诅咒面板 / 目标面板都是 Container：
      // 内部子对象按局部坐标排，整体挪容器即可，不会干扰内部布局
      unit('h.stats', '属性面板', '信息面板', { objs: [this.statPanel], anchorObj: this.statPanel });
      unit('h.skillChip', '技能胶囊', '信息面板', { btns: [this.skillBtn], anchorBtn: this.skillBtn });
      // 功能按钮行：一颗按钮一个单元（原来整行是一个单元，只能一起挪，
      // 玩家没法只把「退出试炼」挪开、也没法只把某一颗缩小）
      (this.hudButtons || []).forEach(function (b) {
        if (!b) return;
        unit('h.fn.' + b.id, HUD_BTN_LABELS[b.id] || b.id, '功能按钮',
          { btns: [b], anchorBtn: b });
      });
      unit('h.potion', '药水数量', '信息面板', { objs: [this.potionText], anchorObj: this.potionText });

      // ---------- 右上：试炼信息（一行一个单元）----------
      unit('h.info.floor', '层数', '信息面板', { objs: [this.floorText], anchorObj: this.floorText });
      unit('h.info.point', '试炼点数', '信息面板', { objs: [this.pointText], anchorObj: this.pointText });
      unit('h.info.enemy', '敌人数', '信息面板', { objs: [this.enemyCountText], anchorObj: this.enemyCountText });
      if (this.roomText) {
        unit('h.info.room', '房间 · 已探索', '信息面板', { objs: [this.roomText], anchorObj: this.roomText });
      }
      unit('h.env', '环境面板', '信息面板', { objs: [this.envPanel], anchorObj: this.envPanel });
      unit('h.curse', '诅咒面板', '信息面板', { objs: [this.cursePanel], anchorObj: this.cursePanel });
      unit('h.pulse', '脉冲倒计时', '信息面板', { objs: [this.pulseText], anchorObj: this.pulseText });

      // ---------- 战斗相关 ----------
      unit('h.target', '目标敌人面板', '战斗', { objs: [this.targetPanel], anchorObj: this.targetPanel });
      unit('h.boss', '层主血条', '战斗', {
        meters: [this.bossMeter], objs: [this.bossName, this.bossText], anchorMeter: this.bossMeter,
        apply: function (dx, dy) {
          self.bossName.setPosition(self.bossName.x + dx, self.bossName.y + dy);
          if (self.bossText) self.bossText.setPosition(self.bossText.x + dx, self.bossText.y + dy);
        }
      });
      unit('h.hint', '操作提示', '战斗', { objs: [this.hintText], anchorObj: this.hintText });
      unit('h.combo', '连击数', '战斗', { objs: [this.comboText], anchorObj: this.comboText });

      return U.filter(function (u) {
        return u.anchorObj || u.anchorMeter || u.anchorBtn ||
               u.objs.length || u.meters.length || u.btns.length;
      });
    }

    /**
     * 把玩家的自定义叠到当前布局上。
     * 必须在所有布局函数之后调用（onResize / relayoutForEdit / beginRun）。
     */
    applyCustomLayout() {
      var L = this.loadCustomLayout();
      var W = this.scale.width, H = this.scale.height;
      if (W < 40 || H < 40) return;
      var self = this;
      this.editableUnits().forEach(function (u) {
        var c = L[u.id];
        var s = (c && c.s != null) ? c.s : 1;
        var a = (c && c.a != null) ? c.a : 1;
        var hide = !!(c && c.v === false);
        var dx = c ? (c.dx || 0) * W : 0;
        var dy = c ? (c.dy || 0) * H : 0;

        // 只在「偏移量本身变了」的时候才搬一次，而且搬的是**差量**。
        // 原来直接在当前坐标上累加：这个方法每被调用一次，整个单元就往自定义方向
        // 再走一截 —— 玩家什么都不做，狂怒条和旁边的数字也会一直往右飘。
        if (!self._appliedOffset) self._appliedOffset = {};
        var prevOff = self._appliedOffset[u.id] || { dx: 0, dy: 0 };
        var ddx = dx - prevOff.dx, ddy = dy - prevOff.dy;
        if (ddx || ddy) {
          u.meters.forEach(function (m) { if (m && m.fill) self.placeMeter(m, m.x + ddx, m.y + ddy, m.w); });
          u.btns.forEach(function (b) { if (!b) return; b.x += ddx; b.y += ddy; self.paintButton(b); });
          u.objs.forEach(function (o) { if (o) { o.x += ddx; o.y += ddy; } });
          if (u.apply) u.apply(ddx, ddy);
        }
        self._appliedOffset[u.id] = { dx: dx, dy: dy };
        // 取消隐藏时要把可见性还原回来 —— 但只还原「我们自己隐藏过的」，
        // 免得盖掉技能未解锁 / 狂怒未满这类游戏逻辑
        var wasHidden = !!(self._hiddenUnits && self._hiddenUnits[u.id]);
        // 记录上一次真正写进样式层的值。
        // 原来只在「值为非默认」时才写，于是把缩放从 40% 拖回 100% 毫无反应 ——
        // 滑块在动、画面不动，玩家只会以为编辑器坏了。改成跟上一帧的值比：
        // 只要变了就写，包括「写回默认」。
        if (!self._appliedStyle) self._appliedStyle = {};
        var prev = self._appliedStyle[u.id] || { s: 1, a: 1, hide: false };
        if (s !== prev.s || a !== prev.a || hide !== prev.hide || wasHidden) {
          u.style.forEach(function (o) {
            if (!o || !o.setScale) return;
            if (s !== prev.s) o.setScale(s);
            if (a !== prev.a) o.setAlpha(a);
            if (hide) o.setVisible(false);
            else if (prev.hide || wasHidden) o.setVisible(true);
          });
          // 按钮类单元：缩放 / 透明 / 显隐走 applyButtonStyle（见那里的说明），
          // 不能用 setScale —— 底板画在 Graphics 的绝对坐标上。
          u.btns.forEach(function (b) {
            if (!b) return;
            self.applyButtonStyle(b, s, a, hide);
            // applyButtonStyle 是**按 slotCenter 绝对定位**的，会把按钮摆回基准位置，
            // 连玩家拖出来的偏移一起抹掉 —— 表现就是「摆好的按钮一改缩放就跳回原位」。
            // 上面位置分支已经算好本轮该有的总偏移，这里补回去。
            var off = self._appliedOffset[u.id];
            if (off && (off.dx || off.dy)) {
              b.x += off.dx; b.y += off.dy;
              self.paintButton(b);
            }
          });
          self._appliedStyle[u.id] = { s: s, a: a, hide: hide };
        }
        if (hide) {
          if (!self._hiddenUnits) self._hiddenUnits = {};
          if (!self._hiddenStyles) self._hiddenStyles = {};
          self._hiddenUnits[u.id] = true;
          // 记下这批对象：有些单元（目标敌人面板 / 层主血条 / 环境面板 / 连击数）
          // 的战斗逻辑每帧都在 setVisible(true)，玩家在编辑器里关掉它们一进战斗就被顶回来。
          // 每帧末尾由 enforceHiddenUnits() 按这份清单把它们按回去。
          // 按钮类的部件（底板 Graphics / 文字 / 图标）不在 style 里，单独补上。
          var parts = u.style.slice();
          u.btns.forEach(function (b) {
            if (!b) return;
            if (b.gfx) parts.push(b.gfx);
            if (b.text) parts.push(b.text);
            if (b.icon) parts.push(b.icon);
          });
          self._hiddenStyles[u.id] = parts;
        } else if (self._hiddenUnits) {
          delete self._hiddenUnits[u.id];
          if (self._hiddenStyles) delete self._hiddenStyles[u.id];
        }
      });
    }

    /**
     * 落实「玩家在编辑器里关掉的那些单元」
     * ------------------------------------------------------------
     * 挂在场景的 postupdate 上：这是 update() 所有 return 之后的最后一站，
     * 渲染又排在它后面，所以不必去每个 setVisible(true) 处插判断也不会漏，
     * 更不会出现「先显示一帧再被按回去」的闪烁。
     */
    enforceHiddenUnits() {
      var S = this._hiddenStyles;
      if (!S) return;
      for (var id in S) {
        var arr = S[id];
        if (!arr) continue;
        for (var i = 0; i < arr.length; i++) {
          var o = arr[i];
          if (o && o.setVisible && o.visible !== false) o.setVisible(false);
        }
      }
    }

    /** 重算基准布局并重新叠加自定义（编辑时拖动一下就调一次） */
    relayoutForEdit() {
      var W = this.scale.width, H = this.scale.height;
      if (W < 40 || H < 40) return;
      // 与 onResize 里保持一致：先把固定坐标的文本摆回基准
      this.nameText.setPosition(24, 12);
      this.floorText.setPosition(W - 24, 18);
      this.pointText.setPosition(W - 24, 42);
      this.enemyCountText.setPosition(W - 24, 64);
      if (this.roomText) this.roomText.setPosition(W - 24, 86);
      this.comboText.setPosition(W / 2, 44);
      this.centerMsg.setPosition(W / 2, H * 0.4);

      this.layoutTouchControls(W, H);
      var tz = this._touchZone;
      if (this.isTouch && tz) {
        this.potionText.setPosition(24, Math.max(96, Math.round(tz.joyTop) - 26));
      } else {
        this.potionText.setPosition(24, H - 48);
      }
      if (this.isTouch && H < 460 && tz) {
        this.hintText.setPosition(Math.round((tz.joyRight + tz.left) / 2), H - 22);
      } else {
        this.hintText.setPosition(W / 2, H - 22);
      }
      this.layoutStatPanel(W);
      this.layoutHudButtons(W);
      this.layoutEnvHud(W);
      // 基准刚重算过，作废「已应用偏移」记录（见 applyCustomLayout）
      this._appliedOffset = {};
      this._invalidateEditCache();       // 基准变了，外框缓存跟着作废
      this.applyCustomLayout();
    }

    /* ============================================================
       布局编辑模式
       ------------------------------------------------------------
       进入后冻结战斗（不然一边挨打一边调布局），所有可编辑单元画上外框：
       白色 = 默认，金色 = 改过，绿色 = 当前选中。拖动即移动，配合
       底部工具条调缩放 / 透明度 / 显隐。
       ============================================================ */

    enterLayoutEdit() {
      if (this.editMode) return true;
      if (!this.ready) return false;
      this.loadCustomLayout();
      this.editMode = true;
      this.editSel = null;
      this.editDrag = null;
      this._invalidateEditCache();       // 单元表 / 外框缓存按本次编辑重建
      this._editWasRunning = this.running;
      this.running = false;              // 冻住战斗
      this.clearStaleInput();
      if (!this.editGfx) this.editGfx = this.add.graphics().setDepth(9000).setScrollFactor(0);
      this.editGfx.setVisible(true);
      this.drawEditOverlay();
      if (window.Trial2DLayoutBar) window.Trial2DLayoutBar.open(this);
      return true;
    }

    exitLayoutEdit(save) {
      if (!this.editMode) return;
      this.editMode = false;
      this.editDrag = null;
      // 去抖保存还挂着的话立刻补上：不然「拖完滑杆马上点完成」会丢掉最后一次
      if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
      if (this._lbSyncTimer) { clearTimeout(this._lbSyncTimer); this._lbSyncTimer = null; }
      if (this.editGfx) this.editGfx.setVisible(false).clear();
      this.running = !!this._editWasRunning && !this._finished;
      if (save !== false) this.saveCustomLayout();
      if (window.Trial2DLayoutBar) window.Trial2DLayoutBar.close();
      this.relayoutForEdit();
    }

    /** 单元当前的外框（拾取与画框共用） */
    unitBounds(u) {
      // 不依赖 getBounds() 返回值的类型：Phaser 各显示对象的 getBounds 实现不一，
      // 有的返回的对象没有 clone()。手动求并集最稳。
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
      function add(b) {
        if (!b || !(b.width > 0) || !(b.height > 0)) return;
        any = true;
        if (b.x < minX) minX = b.x;
        if (b.y < minY) minY = b.y;
        if (b.x + b.width > maxX) maxX = b.x + b.width;
        if (b.y + b.height > maxY) maxY = b.y + b.height;
      }
      u.objs.forEach(function (o) { if (o && o.getBounds) { try { add(o.getBounds()); } catch (e) {} } });
      u.meters.forEach(function (m) { if (m && m.track) { try { add(m.track.getBounds()); } catch (e) {} } });
      u.btns.forEach(function (b) { if (b) add({ x: b.x, y: b.y - b.h / 2, width: b.w, height: b.h }); });
      if (!any) return null;
      return new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY);
    }

    /** 命中测试：后声明的优先（多为更靠上的小元素），避免大面板吃掉小按钮 */
    unitAt(px, py) {
      var U = this._editUnits();
      var B = this._editBounds;
      for (var i = U.length - 1; i >= 0; i--) {
        var r = (B && B[U[i].id]) || this.unitBounds(U[i]);
        if (r && Phaser.Geom.Rectangle.Contains(r, px, py)) return U[i];
      }
      return null;
    }

    /* ============================================================
       拖动热路径
       ------------------------------------------------------------
       拖动**不能**每帧跑全量重排。relayoutForEdit 会把整个 HUD 从基准重算一遍
       （摇杆 / 属性面板 / 环境面板 / 功能按钮行 / 三条槽 ……），而拖动只改变
       **一个**单元的偏移 —— 原来每个 pointermove 都要付这一整套：

         重排 1.5ms + 全量画框 0.8ms + DOM 同步 0.5ms（还会触发样式重算）

       触摸设备一帧内往往不止一个 move 事件（120Hz 采样 / 高刷屏），于是一帧
       要付好几套，直接顶穿 16.7ms 的帧预算 —— 手感就是「提起来一卡一卡、
       跟不上手指」。另外每帧重建 editableUnits 会造出上百个闭包，触发
       周期性 GC，卡顿还会一顿一顿地来。

       所以拆开：位置只搬被拖的那一个单元、外框只重算它的包围盒、
       DOM 拖动期间完全不动（松手同步一次）、吸附改到松手时做。
       ============================================================ */

    /** 编辑期间复用的单元表：拖动时每帧都要按 id 找单元，不必每次重建 */
    _editUnits() {
      if (!this._editUnitsCache) this._editUnitsCache = this.editableUnits();
      return this._editUnitsCache;
    }

    _findEditUnit(id) {
      var U = this._editUnits();
      for (var i = 0; i < U.length; i++) if (U[i].id === id) return U[i];
      return null;
    }

    /** 基准布局变了（重排 / 转屏）：单元表与外框缓存都必须重建 */
    _invalidateEditCache() {
      this._editUnitsCache = null;
      this._editBounds = null;
      this._editBoundsDirty = true;
    }

    /** 把某个单元的显示对象整体搬 ddx/ddy，并同步「已应用偏移」记录 */
    _shiftUnit(id, ddx, ddy) {
      if (!ddx && !ddy) return false;
      var u = this._findEditUnit(id);
      if (!u) return false;
      var self = this;
      u.meters.forEach(function (m) { if (m && m.fill) self.placeMeter(m, m.x + ddx, m.y + ddy, m.w); });
      u.btns.forEach(function (b) { if (!b) return; b.x += ddx; b.y += ddy; self.paintButton(b); });
      u.objs.forEach(function (o) { if (o) { o.x += ddx; o.y += ddy; } });
      if (u.apply) u.apply(ddx, ddy);
      if (!this._appliedOffset) this._appliedOffset = {};
      var p = this._appliedOffset[id];
      if (!p) p = this._appliedOffset[id] = { dx: 0, dy: 0 };
      p.dx += ddx; p.dy += ddy;
      return true;
    }

    /** 偏移记录与显示对象一起走（拖动、松手吸附补零头都走这里） */
    _moveUnitBy(id, ddx, ddy) {
      var W = this.scale.width, H = this.scale.height;
      if (W < 40 || H < 40 || (!ddx && !ddy)) return false;
      var c = this.layoutEntry(id, true);
      c.dx = (c.dx || 0) + ddx / W;
      c.dy = (c.dy || 0) + ddy / H;
      return this._shiftUnit(id, ddx, ddy);
    }

    /** 只重算一个单元的外框再整体重画（其余用缓存） */
    _redrawUnitFrame(id) {
      if (!this._editBounds) { this.drawEditOverlay(); return; }
      var u = this._findEditUnit(id);
      if (!u) return;
      this._editBounds[id] = this.unitBounds(u);
      this.drawEditOverlay();
    }

    layoutEditDown(px, py) {
      var u = this.unitAt(px, py);
      this.editSel = u ? u.id : null;
      this.editDrag = u ? { id: u.id, lastX: px, lastY: py, moved: false } : null;
      this.drawEditOverlay();
      this.notifyLayoutBar();
      return !!u;
    }

    layoutEditMove(px, py) {
      if (!this.editDrag) return false;
      var dx = px - this.editDrag.lastX, dy = py - this.editDrag.lastY;
      if (!dx && !dy) return false;
      this.editDrag.lastX = px; this.editDrag.lastY = py;
      this.editDrag.moved = true;
      // 拖动过程**不吸附**：4px 步进会让位移一格一格地跳，手感就是「涩、不跟手」。
      // 吸附改到松手时补一次（见 layoutEditUp），既跟手又能对齐。
      this._moveUnitBy(this.editDrag.id, dx, dy);
      this._redrawUnitFrame(this.editDrag.id);
      return true;
    }

    layoutEditUp() {
      if (!this.editDrag) return false;
      var d = this.editDrag;
      this.editDrag = null;
      if (!d.moved) return false;
      var W = this.scale.width, H = this.scale.height;
      // 松手吸附到 4px 网格：手指拖动本来就有几像素误差，不吸附容易摆歪
      if (this.editSnap !== false && W >= 40 && H >= 40) {
        var c = this.layoutEntry(d.id, false);
        if (c) {
          var sx = Math.round(c.dx * W / 4) * 4 / W;
          var sy = Math.round(c.dy * H / 4) * 4 / H;
          var ex = (sx - c.dx) * W, ey = (sy - c.dy) * H;
          if (ex || ey) {
            c.dx = sx; c.dy = sy;
            this._shiftUnit(d.id, ex, ey);
            this._redrawUnitFrame(d.id);
          }
        }
      }
      this.saveCustomLayout();
      // DOM 侧拖动期间一律不动，松手同步一次就够：chip 的「已改 / 选中」标记
      // 拖动过程中本来也不看，而每帧改 31 个 chip 的 class 会引来样式重算
      this.notifyLayoutBar();
      return true;
    }

    /** 工具条改值（缩放 / 透明度 / 显隐） */
    setLayoutValue(id, key, v) {
      var c = this.layoutEntry(id, true);
      c[key] = v;
      this.relayoutForEdit();
      this.drawEditOverlay();
      this.saveCustomLayoutSoon();
      this.syncLayoutBarSoon();
    }

    /** 重置：给 id 就重置那一项，不给就全部 */
    resetCustomLayout(id) {
      var self = this;
      var ids = id ? [id] : Object.keys(this.loadCustomLayout());
      if (id) {
        delete this.loadCustomLayout()[id];
      } else {
        this.customLayout = {};
      }
      this.relayoutForEdit();
      // relayoutForEdit 里的 applyCustomLayout 现在会跟上一帧的记录比对，「改回默认」
      // 也能写回去了；这里再显式推一次是为了立刻生效，不依赖下一帧。
      var byId = {};
      this.editableUnits().forEach(function (u) { byId[u.id] = u; });
      ids.forEach(function (x) {
        var u = byId[x];
        if (!u) return;
        var wasHidden = !!(self._hiddenUnits && self._hiddenUnits[x]);
        u.style.forEach(function (o) {
          if (!o || !o.setScale) return;
          o.setScale(1);
          o.setAlpha(1);
          if (wasHidden) o.setVisible(true);
        });
        // 按钮类单元：样式走 applyButtonStyle（尺寸在数据上，不在 scale 上）
        u.btns.forEach(function (b) { if (b) self.applyButtonStyle(b, 1, 1, false); });
        if (self._hiddenUnits) delete self._hiddenUnits[x];
        if (self._hiddenStyles) delete self._hiddenStyles[x];
        if (self._appliedStyle) delete self._appliedStyle[x];
      });
      this.drawEditOverlay();
      this.saveCustomLayout();
      this.notifyLayoutBar();
    }

    /** 导出当前布局（方便备份 / 换机） */
    exportCustomLayout() {
      return JSON.stringify({ v: 1, items: this.loadCustomLayout() }, null, 2);
    }

    /** 导入布局；非法内容一律拒绝，不落盘 */
    importCustomLayout(text) {
      try {
        var d = JSON.parse(text);
        if (!d || typeof d !== 'object' || !d.items || typeof d.items !== 'object') return false;
        var clean = {};
        Object.keys(d.items).forEach(function (k) {
          var v = d.items[k];
          if (!v || typeof v !== 'object') return;
          clean[k] = {
            dx: Number(v.dx) || 0, dy: Number(v.dy) || 0,
            s: v.s == null ? 1 : Math.max(0.2, Math.min(2.5, Number(v.s) || 1)),
            a: v.a == null ? 1 : Math.max(0.1, Math.min(1, Number(v.a) || 1)),
            v: v.v !== false
          };
        });
        this.customLayout = clean;
        this.relayoutForEdit();
        this.drawEditOverlay();
        this.saveCustomLayout();
        this.notifyLayoutBar();
        return true;
      } catch (e) { return false; }
    }

    drawEditOverlay() {
      var g = this.editGfx;
      if (!g || !this.editMode) return;
      var self = this;
      var U = this._editUnits();
      // 包围盒缓存：unitBounds 要对每个显示对象调 getBounds（Container 还要遍历
      // 子节点），是这里最贵的一步。编辑期间基准不变、框也就不会变，没必要每帧
      // 把这 30 多个单元重算一遍 —— 只有被拖动的那一个由 _redrawUnitFrame 更新。
      if (!this._editBounds || this._editBoundsDirty) {
        this._editBounds = {};
        U.forEach(function (u) { self._editBounds[u.id] = self.unitBounds(u); });
        this._editBoundsDirty = false;
      }
      g.clear();
      U.forEach(function (u) {
        var r = self._editBounds[u.id];
        if (!r) return;
        var sel = (u.id === self.editSel);
        var on = self.isCustomized(u.id);
        g.lineStyle(sel ? 2 : 1, sel ? 0x73f0b4 : (on ? 0xffd76a : 0xffffff), sel ? 1 : (on ? 0.62 : 0.26));
        if (sel) { g.fillStyle(0x73f0b4, 0.1); g.fillRect(r.x - 2, r.y - 2, r.width + 4, r.height + 4); }
        g.strokeRect(r.x - 2, r.y - 2, r.width + 4, r.height + 4);
      });
    }

    notifyLayoutBar() {
      if (window.Trial2DLayoutBar) window.Trial2DLayoutBar.sync(this);
    }

    /**
     * DOM 同步去抖到「一帧最多一次」
     * ------------------------------------------------------------
     * 滑杆拖一下会甩出几十个 input 事件，每个都同步一遍工具条（31 个 chip 的
     * class 开关 + 一串文本）纯属白做 —— chip 上的「已改 / 选中」标记本来也
     * 不需要比一帧更频繁。用 setTimeout(0) 而不是 rAF：页面被切到后台时 rAF
     * 会停，挂着的标记就再也清不掉，同步会永久卡死。
     */
    syncLayoutBarSoon() {
      var self = this;
      if (this._lbSyncTimer) return;
      this._lbSyncTimer = setTimeout(function () {
        self._lbSyncTimer = null;
        if (self.editMode) self.notifyLayoutBar();
      }, 0);
    }

    // ---------- 开局 / 结束 ----------
    beginRun(d) {
      d = d || {};
      this.points = d.points || 0;
      this.running = true;
      this.heroDead = false;
      // 新一局：体力回满、闪避状态清空
      this.hero.stamina = this.hero.maxStamina;
      this.hero.perfectCount = 0;
      this.dodging = false; this.dodgeReadyAt = 0; this.perfectUntil = 0;
      this.staminaHoldUntil = 0; this._staminaShown = this.hero.maxStamina;
      // 新一局：防御与连招状态清空
      this.lowerGuard();
      this.chainCount = 0; this.chainUntil = 0;
      this.counterUntil = 0; this.dodgeCounterUntil = 0; this.diveCounterUntil = 0;
      this.blockCount = 0;
      // 新一局：狂怒归零
      this.fury = 0; this.furyUntil = 0; this.furyAutoAt = 0;
      this._furyFull = false; this._furyWasOn = false;
      this.paintFuryMeter();
      // 英雄形象：每位英雄一套专属精灵（宿主在 startRun 里传 heroId）
      this.setHeroLook(d.heroId || (d.skill && d.skill.id) || this.heroLookId || 'warrior');
      // 诅咒 / 环境效果（宿主在 startRun / 换层时传入）
      this.curses = [];
      this.worldEnv = null;
      this._baseAtk = null;
      this._baseDodge = null;
      this.setCursesAndEnv(d.curses, d.environment);
      // 英雄技能：宿主在 startRun 里传入（id / 技能名 / 主动技能名）
      this.skill = d.skill || null;
      this.skillId = (this.skill && this.skill.id) || '';
      this.skillUsed = !!(this.skill && this.skill.used);
      this.skillPowerUntil = 0; this.skillPowerMult = 1; this.skillVampire = 0;
      this.guardUntil = 0; this.skillLockUntil = 0;
      this._roomFirstHit = false; this._roomFirstKill = false;
      this.updateSkillHud();
      // 新一局：清空战绩与画面内界面
      this._finished = false;
      this.kills = 0;
      this.roomsCleared = 0;
      this.runStartedAt = this.time.now;
      this.diving = false;
      this.deathOpen = false;
      this.shopOpen = false;
      this.confirmOpen = false;
      this.pendingMapAfterShop = false;
      this._viewPaused = false;
      try { this.scene.resume(); } catch (e) { /* 忽略 */ }
      this.destroyLayer('deathLayer');
      this.destroyLayer('shopLayer');
      this.destroyLayer('confirmLayer');
      if (this.panelButtons) this.panelButtons = { confirm: [], shop: [], death: [], map: [] };
      this.shopItemRects = [];
      this.hero.name = d.heroName || '冒险者';
      this.nameText.setText(this.hero.name);
      this.applyPlayerStats(d.player || {});
      if (d.player && d.player.hp !== undefined) this.hero.hp = Math.min(d.player.hp, this.hero.maxHp);

      // 环境主题（按难度切换星雾与火星）
      this.applyEnvironment(d.difficulty || 'normal');

      // 生成第 1 层地图，从入口房间开始
      this.floor = 1;
      this.floorMap = generateFloorMap(1);
      this.roomNode = this.floorMap.current;
      this.buildLevel(this.roomNode);
      var rt = ROOM_TYPES[this.roomNode.type] || ROOM_TYPES.enemy;
      this.showCenter('深渊试炼 · 第 1 层 · ' + rt.name, rt.center || '#ffd76a');
      // 远程英雄：开局点明普攻是远程，免得玩家还在等挥砍
      var rg0 = this.heroRanged();
      if (rg0) {
        var self2 = this;
        this.time.delayedCall(900, function () {
          if (self2.running) self2.showFloat(self2.hero.x, self2.hero.y - 96, '普攻：' + rg0.name + '（远程）', hexOf(rg0.color), 15);
        });
        console.log('[试炼2D] 远程英雄：' + this.heroLookId + ' · 普攻 ' + rg0.name + '（' + rg0.kind + '）');
      }
      sfx('battleStart');
      setBgmScene(bgmForRoom(this.roomNode.type));
      console.log('[试炼2D] 战斗开始：' + this.hero.name + ' · 难度 ' + this.difficulty + ' · 第 1 层地图已生成（' + this.floorMap.nodes.length + ' 个房间）');

      // 触摸设备：操作提示只在开局亮几秒就淡出
      // 手机上它被夹在摇杆与按键区之间的一条窄缝里，常驻会一直占着底部一行；
      // 而各按钮上本来就写着名字、摇杆上也有箭头，看一次就够。
      if (this.isTouch && this.hintText) {
        var self3 = this;
        this.hintText.setAlpha(1).setVisible(true);
        if (this._hintFadeEv) { this._hintFadeEv.remove(); this._hintFadeEv = null; }
        this._hintFadeEv = this.time.delayedCall(5000, function () {
          if (self3._finished || !self3.running) return;
          self3.tweens.add({
            targets: self3.hintText, alpha: 0, duration: 700,
            onComplete: function () { self3.hintText.setVisible(false); }
          });
        });
      }
    }

    applyPlayerStats(p) {
      if (!p) return;
      var h = this.hero;
      if (p.maxHp !== undefined) { var diff = p.maxHp - h.maxHp; h.maxHp = p.maxHp; if (diff > 0) h.hp += diff; }
      if (p.hp !== undefined) h.hp = Math.min(p.hp, h.maxHp);
      if (p.attack !== undefined) h.attack = p.attack;
      if (p.critRate !== undefined) h.critRate = p.critRate;
      if (p.critDamage !== undefined) h.critDamage = p.critDamage;
      if (p.dodge !== undefined) h.dodge = p.dodge;
      if (p.thorn !== undefined) h.thorn = p.thorn;
      if (p.vampire !== undefined) h.vampire = p.vampire;
      if (p.combo !== undefined) h.combo = p.combo;
      if (p.execute !== undefined) h.execute = p.execute;
      if (p.shield !== undefined) h.shield = p.shield;
      if (p.potions !== undefined) h.potions = p.potions;
      this.refreshHud();
    }

    // ---------- 结束 / 视图切换 ----------
    endRun(reason) { this.finishRun(reason); }

    /**
     * 结束本局：交给宿主（写出结果并退出试炼）
     * 宿主未接入时回退到 game 事件，保证单独打开 2D 层也能收尾
     */
    finishRun(reason) {
      if (this._finished) return;
      this._finished = true;
      this.running = false;
      this.attacking = false;
      this.diving = false;
      if (this.diveFx) this.diveFx.setVisible(false);
      if (reason === 'dead') this.heroDead = true;

      var result = {
        reason: reason, floor: this.floor, points: this.points,
        hp: Math.max(0, Math.round(this.hero.hp)), maxHp: this.hero.maxHp,
        kills: this.kills || 0, rooms: this.roomsCleared || 0,
        elapsed: Math.max(0, Math.round((this.time.now - this.runStartedAt) / 1000))
      };
      console.log('[试炼2D] 结束本局：' + reason + ' · 第 ' + this.floor + ' 层 · 点数 ' + this.points);
      setBgmScene('explore');
      // 关闭画面内界面
      this.shopOpen = false; this.confirmOpen = false;
      this.destroyLayer('shopLayer'); this.destroyLayer('confirmLayer');
      if (this.panelButtons) { this.panelButtons.shop = []; this.panelButtons.confirm = []; }
      if (hasBridge('exit')) { callBridge('exit', result); return; }
      if (this.game && this.game.events) this.game.events.emit('trial2d:run-ended', result);
    }

    /** 退出试炼时的静默收尾（不发事件、不触发结算） */
    abortRun() {
      this.running = false;
      this.heroDead = false;
      this.attacking = false;
      this.diving = false;
      this._viewPaused = false;
      this.shopOpen = false;
      this.deathOpen = false;
      this.confirmOpen = false;
      this.pendingMapAfterShop = false;
      if (this.diveFx) this.diveFx.setVisible(false);
      this.destroyLayer('shopLayer');
      this.destroyLayer('deathLayer');
      this.destroyLayer('confirmLayer');
      if (this.mapOpen) {
        this.mapOpen = false;
        this.destroyLayer('mapLayer');
        try { this.physics.world.resume(); } catch (e) { /* 忽略 */ }
      }
      if (this.panelButtons) this.panelButtons = { confirm: [], shop: [], death: [], map: [] };
      this.shopItemRects = [];
      if (this.touchUI) this.touchUI.setVisible(this._lastInputWasTouch === true);
      this.syncUiBarVisibility();
    }

    /** 切到文字界面：冻结战斗（宿主负责隐藏画布与展示文字面板） */
    pauseForView() {
      if (this._viewPaused) return;   // 幂等：宿主与画面按钮可能都会调用
      this._viewPaused = true;
      this.attacking = false;
      this.diving = false;
      this.isCharging = false;
      this.dodging = false;
      this.dodgeReadyAt = 0;
      if (this.chargeRing) this.chargeRing.setVisible(false);
      if (this.diveFx) this.diveFx.setVisible(false);
      if (this.hero) this.hero.setVelocity(0, 0);
      if (this.touchInput) {
        this.touchInput.left = false; this.touchInput.right = false;
        this.touchInput.jumpHeld = false; this.touchInput.joyJumpHeld = false; this.touchInput.jumpPressed = false;
      }
      if (this.touchUI) this.touchUI.setVisible(false);
      try { this.physics.world.pause(); } catch (e) { /* 忽略 */ }
      try { this.scene.pause(); } catch (e) { /* 忽略 */ }
      this.setHudButtonOn('text', true);
      // scene.pause 之后 update 不再跑，功能按钮行的显隐要在这里补一次
      this.syncUiBarVisibility();
    }

    /** 从文字界面回到 2D 画面：恢复战斗 */
    resumeFromView() {
      this._viewPaused = false;
      this.clearStaleInput();   // 文字界面期间按下的键不该在切回时补发
      try { this.scene.resume(); } catch (e) { /* 忽略 */ }
      if (!this.mapOpen && !this.shopOpen && !this.deathOpen && !this.confirmOpen) {
        try { this.physics.world.resume(); } catch (e) { /* 忽略 */ }
      }
      if (this.touchUI) this.touchUI.setVisible(this._lastInputWasTouch === true);
      this.setHudButtonOn('text', false);
      this.syncUiBarVisibility();
      sfx('click');
    }

    /** 传给宿主的实时战况快照（文字界面用它显示 2D 战斗数据） */
    buildSnapshot() {
      var self = this;
      var h = this.hero;
      return {
        floor: this.floor, points: this.points,
        kills: this.kills || 0, roomsCleared: this.roomsCleared || 0,
        elapsed: Math.max(0, Math.round((this.time.now - this.runStartedAt) / 1000)),
        running: !!this.running, dead: !!this.heroDead, finished: !!this._finished,
        roomType: this.roomNode ? this.roomNode.type : null,
        roomName: this.roomNode ? ((ROOM_TYPES[this.roomNode.type] || ROOM_TYPES.enemy).name) : '—',
        mapOpen: !!this.mapOpen, shopOpen: !!this.shopOpen,
        enemiesAlive: this.enemies.filter(function (e) { return e.alive; }).length,
        enemies: this.enemies.map(function (e) {
          return {
            name: e.name, tier: e.tier, behavior: e.behavior, alive: !!e.alive,
            hp: Math.max(0, Math.round(e.hp)), maxHp: e.maxHp, atk: Math.round(e.atk),
            speed: e.def.speed, tierName: TIER_NAMES[e.tier] || '普通',
            behaviorName: BEHAVIOR_NAMES[e.behavior] || '追击'
          };
        }),
        hero: {
          name: h.name, hp: Math.max(0, Math.round(h.hp)), maxHp: h.maxHp, shield: Math.round(h.shield),
          attack: Math.round(h.attack), critRate: Math.round(h.critRate), critDamage: Math.round(h.critDamage),
          dodge: Math.round(h.dodge), thorn: Math.round(h.thorn), vampire: Math.round(h.vampire),
          combo: Math.round(h.combo), execute: Math.round(h.execute), potions: h.potions
        }
      };
    }

    // ---------- 死亡结算（画面内，不再回文字界面）----------
    /** 面板 / 文字界面期间的按键不该在恢复后「补发」（清掉 JustDown 残留） */
    clearStaleInput() {
      var k = this.keys;
      if (k) ['attack', 'potion', 'jump', 'jump2', 'jump3', 'jump4', 'dodge', 'dodge2', 'guard', 'guard2', 'fury'].forEach(function (n) {
        var key = k[n];
        if (key) { key._justDown = false; key._justUp = false; }
      });
      if (this.touchInput) { this.touchInput.jumpPressed = false; this.touchInput.guardHeld = false; }
      this.lowerGuard();   // 面板打开时不再举着盾
    }

    // ---------- 英雄技能（主动每层一次 / 被动常驻） ----------
    /**
     * 主动技能：按键 E，或点 HUD 技能胶囊 / 触摸「技能」钮
     * 文字模式是回合制数值，这里按实时战斗的尺度重做，技能名与语义不变：
     *   护盾类 → 立刻获得护盾；「下一次攻击 +N」→ 数秒内的攻击强化；
     *   元素风暴 → 范围爆发；精准射击 → 穿透箭；暗影突袭 → 无敌 + 重击
     */
    useSkill() {
      var now = this.time.now, h = this.hero;
      if (!this.running || this.heroDead) return false;
      // 面板 / 文字界面冻结期间战斗不推进，技能也不该生效
      if (this.mapOpen || this.shopOpen || this.codexOpen || this.deathOpen || this.confirmOpen || this._viewPaused) return false;
      if (!this.skill || !this.skill.activeName) {
        if (this.skill) this.showFloat(h.x, h.y - 70, '该英雄没有主动技能', UI.muted, 14);
        return false;
      }
      if (this.skillUsed) {
        this.showFloat(h.x, h.y - 70, '本层已使用', UI.muted, 14);
        sfx('error');
        return false;
      }
      if (now < this.skillLockUntil) return false;

      var id = this.skillId, name = this.skill.activeName, ok = true;
      switch (id) {
        case 'warrior':      // 战吼：6 点护盾 + 震退近身敌人
          this.addShield(6, '战吼');
          this.knockAround(150, 260, 0);
          break;
        case 'guardian':     // 护盾壁垒：6 点护盾 + 4 秒内受到的伤害减半
          this.addShield(6, '护盾壁垒');
          this.guardUntil = now + 4000;
          break;
        case 'paladin':      // 神圣审判：8 点护盾 + 回复 4 点生命
          this.addShield(8, '神圣审判');
          this.healHero(4, true);
          break;
        case 'rogue':        // 影舞突袭：3 秒内攻击 ×2
          this.grantPower(2, '影舞突袭');
          break;
        case 'ranger':       // 精准射击：射出一支穿透箭
          this.fireArrow(SKILL.arrowMult);
          break;
        case 'mage':         // 元素风暴：以自身为中心的元素爆发
          this.burstAround(SKILL.burstR, 2.5, 0x9a8ef0, '元素风暴');
          break;
        case 'berserker':    // 破釜沉舟：失去 15% 当前生命，8 秒内攻击 ×2.5 并吸血
          var cost = Math.max(1, Math.round(h.hp * 0.15));
          h.hp = Math.max(1, h.hp - cost);
          this.showFloat(h.x, h.y - 86, '-' + cost, '#ff6b6b', 15);
          this.grantPower(2.5, '破釜沉舟', 8000, 0.2);
          break;
        case 'sage':         // 法力灌注：回复 8 点生命 + 3 点护盾 + 3 秒内攻击 ×1.6
          this.healHero(8, true);
          this.addShield(3, '法力灌注');
          this.grantPower(1.6, '法力灌注');
          break;
        case 'shadow':       // 暗影突袭：1.2 秒无敌 + 下一次攻击 ×3
          this.invulnUntil = Math.max(this.invulnUntil, now + 1200);
          this.grantPower(3, '暗影突袭');
          break;
        default:
          ok = false;
          this.showFloat(h.x, h.y - 70, '该英雄的技能尚未适配试炼模式', UI.muted, 14);
          break;
      }
      if (!ok) return false;

      this.skillUsed = true;
      this.skillLockUntil = now + 320;
      this._skillFlashAt = now;
      if (hasBridge('skillUsed')) callBridge('skillUsed', true);

      // 施法表现：技能名飘字 + 绿色冲击环 + 轻微闪光
      this.showFloat(h.x, h.y - 100, name, UI.gold, 20);
      sfx('skill');
      this.cameras.main.flash(90, 235, 240, 200);
      var ring = this.add.circle(h.x, h.y - 24, 14, 0x73f0b4, 0.18).setDepth(11);
      ring.setStrokeStyle(3, 0x73f0b4, 0.9);
      this.tweens.add({
        targets: ring, radius: 120, alpha: 0, duration: 320,
        onComplete: function () { ring.destroy(); }
      });
      if (state.settings.screenShake2D !== false) this.cameras.main.shake(80, 0.004);
      this.updateSkillHud();
      this.refreshHud();
      console.log('[试炼2D] 使用英雄技能：' + name + '（' + id + '）');
      return true;
    }

    /** 技能胶囊 / 触摸钮的状态（技能名 · 已用 / 无主动技能时隐藏） */
    updateSkillHud() {
      var b = this.skillBtn;
      if (!b) return;
      var has = !!(this.skill && this.skill.activeName);
      if (b.gfx && b.gfx.visible !== has) {
        b.gfx.setVisible(has);
        b.text.setVisible(has);
        if (b.icon) b.icon.setVisible(has);
      }
      if (this.touchInput && this.btnSkill) this.btnSkill.setVisible(!!this.isTouch && has);
      if (!has) return;
      var label = this.skillUsed ? (this.skill.activeName + ' · 已用') : this.skill.activeName;
      if (b.text.text !== label) {
        b.text.setText(label);
        b.w = Math.round(b.text.width + Math.max(10, Math.round(b.h * 0.5)) * 2 + (b.icon ? 23 : 0));
      }
      b.disabled = !!this.skillUsed;
      this.paintButton(b);
    }

    /** 每层一次：换层 / 开局时恢复主动技能 */
    resetSkill(silent) {
      this.skillUsed = false;
      if (!silent && hasBridge('skillUsed')) callBridge('skillUsed', false);
      this.updateSkillHud();
      if (!silent && this.skill && this.skill.activeName) {
        this.showFloat(this.hero.x, this.hero.y - 108, '技能就绪', UI.good, 14);
      }
    }

    /** 立刻获得护盾（叠加在生命条之上） */
    addShield(n, tag) {
      var h = this.hero;
      h.shield += n;
      this.showFloat(h.x, h.y - 80, '+' + n + ' 护盾', UI.accent, 16);
      this.spark(h.x, h.y - 26, 0x5fd0e0);
      if (tag) this.showFloat(h.x, h.y - 102, tag, '#9fe0c0', 13);
      this.refreshHud();
    }

    /** 攻击强化（「下一次攻击 +N」的实时等价物） */
    grantPower(mult, tag, dur, vampire) {
      var now = this.time.now;
      this.skillPowerUntil = Math.max(this.skillPowerUntil || 0, now + (dur || SKILL.power));
      this.skillPowerMult = Math.max(this.skillPowerMult || 1, mult || 1);
      if (vampire) this.skillVampire = Math.max(this.skillVampire || 0, vampire);
      if (tag) this.showFloat(this.hero.x, this.hero.y - 108, tag, '#c79aff', 13);
    }

    /** 击退附近敌人（技能用；dmgMult > 0 时附带伤害） */
    knockAround(radius, force, dmgMult) {
      var h = this.hero, self = this;
      this.enemies.forEach(function (e) {
        if (!e.alive) return;
        if (Math.abs(e.sprite.x - h.x) > radius || Math.abs(e.sprite.y - h.y) > radius) return;
        var dir = e.sprite.x >= h.x ? 1 : -1;
        e.sprite.setVelocity(dir * force, -160);
        e.hurtUntil = self.time.now + 140;
        if (dmgMult > 0) self.damageEnemy(e, self.rollPlayerDamage(dmgMult), false);
        self.spark(e.sprite.x, e.sprite.y - 26, 0x8ad8ff);
      });
    }

    /** 以主角为中心的范围爆发（元素风暴） */
    burstAround(radius, mult, color, tag) {
      var h = this.hero, self = this;
      color = color || 0x9a8ef0;
      var ring = this.add.circle(h.x, h.y - 24, 20, color, 0.2).setDepth(11);
      ring.setStrokeStyle(4, color, 0.9);
      this.tweens.add({
        targets: ring, radius: radius, alpha: 0, duration: 340,
        onComplete: function () { ring.destroy(); }
      });
      if (state.settings.screenShake2D !== false) this.cameras.main.shake(160, 0.009);
      this.enemies.forEach(function (e) {
        if (!e.alive) return;
        if (Math.abs(e.sprite.x - h.x) > radius || Math.abs(e.sprite.y - h.y) > radius) return;
        var dir = e.sprite.x >= h.x ? 1 : -1;
        e.sprite.setVelocity(dir * 220, -220);
        self.showFloat(e.sprite.x, e.sprite.y - 74, tag || '爆发', UI.gold, 15);
        self.damageEnemy(e, self.rollPlayerDamage(mult), false);
      });
      this.spark(h.x, h.y - 26, color);
    }

    /** 精准射击：穿透箭（命中多个敌人、命中后不消失） */
    fireArrow(mult) {
      var h = this.hero, dir = h.flipX ? -1 : 1;
      // 施放者是远程英雄时，用他自己的弹道画得更亮更长 —— 同一套视觉语言，一眼认得出是谁的技能
      var rg = this.heroRanged();
      var kind = rg ? (rg.kind === 'wave' ? 'orb' : rg.kind) : 'orb';
      var tex = rg ? 角色形象.ensureShotTexture(this, kind, rg.color) : TEX.projectile;
      var a = this.physics.add.sprite(h.x + dir * 26, h.y - 30, tex, 0);
      if (rg) {
        a.play(角色形象.ensureShotAnim(this, kind, rg.color, 16));
        a.setScale(1.35).setRotation(0);
        a.body.setSize(角色形象.shotSize(kind).bw * 1.35, 角色形象.shotSize(kind).bh * 1.35, true);
      } else {
        a.setTint(0x9fe0c0);
      }
      a.setDepth(9);
      a.body.setAllowGravity(false);
      a.setVelocityX(dir * SKILL.arrowSpeed);
      a._dmg = Math.round(h.attack * (mult || SKILL.arrowMult));
      a._friendly = true;
      a._hit = {};
      a._lifeUntil = this.time.now + SKILL.arrowLife;
      this.skillProjectiles.push(a);
      this.showFloat(h.x, h.y - 108, '精准射击', '#9fe0c0', 13);
      sfx('attack');
      this.spark(h.x + dir * 26, h.y - 30, 0x9fe0c0);
    }

    /** 穿透箭逐帧：飞行中命中每个敌人各结算一次 */
    updateSkillProjectiles() {
      if (!this.skillProjectiles || !this.skillProjectiles.length) return;
      var self = this, now = this.time.now;
      this.skillProjectiles = this.skillProjectiles.filter(function (a) {
        if (!a || !a.active) return false;
        if (now > a._lifeUntil || a.x < -60 || a.x > self.levelWidth + 60 ||
          a.body.blocked.left || a.body.blocked.right || a.body.blocked.down) {
          a.destroy(); return false;
        }
        var hit = false;
        self.enemies.forEach(function (e, idx) {
          if (!e.alive || a._hit[idx]) return;
          if (Phaser.Geom.Intersects.RectangleToRectangle(a.getBounds(), e.sprite.getBounds())) {
            a._hit[idx] = true;
            self.damageEnemy(e, { dmg: a._dmg, crit: true }, false);
            hit = true;
          }
        });
        if (hit) self.spark(a.x, a.y, 0x9fe0c0);
        return true;
      });
    }

    /** 被动：进入房间的「战斗开始」效果（战士 / 圣骑士） */
    applyRoomStartPassive() {
      if (this.skillId === 'warrior') this.addShield(3, '坚韧之盾');
      else if (this.skillId === 'paladin') this.addShield(4, '圣光护盾');
    }

    /** 被动：伤害修正（首击 / 概率 / 低血，对应文字模式的首回合、30% 概率、生命低于 50%） */
    heroPassiveDamage() {
      var h = this.hero, id = this.skillId, flat = 0, forceCrit = false;
      if (id === 'mage' && Math.random() < 0.3) flat += 3;            // 奥术爆发
      if (id === 'berserker' && h.hp <= h.maxHp / 2) flat += 2;        // 嗜血狂暴
      if (!this._roomFirstHit) {
        if (id === 'rogue') flat += 2;                                // 迅捷突袭
        if (id === 'shadow') forceCrit = true;                        // 暗影步
      }
      return { flat: flat, forceCrit: forceCrit };
    }

    /** 被动：击杀触发的「战斗胜利」效果（贤者 / 游侠，每房间一次） */
    applyKillPassive() {
      if (this._roomFirstKill) return;
      this._roomFirstKill = true;
      if (this.skillId === 'sage') {
        this.healHero(2, true);
        this.showFloat(this.hero.x, this.hero.y - 96, '灵能回响', '#9fe0c0', 13);
      } else if (this.skillId === 'ranger') {
        this.points += 1;
        this.showFloat(this.hero.x, this.hero.y - 96, '寻宝天赋 +1 点', UI.gold, 13);
        this.refreshHud();
      }
    }

    /** 被动：守护者的「坚壁防御」——2D 里的防守动作是闪避，闪避成功即获得护盾 */
    onDodgeSuccess() {
      if (this.skillId !== 'guardian') return;
      this.addShield(2, '坚壁防御');
    }
    // ---------- 闪避与体力 ----------
    /** 闪避（翻滚冲刺）：消耗体力换取短时无敌；命中瞬间闪避 = 完美闪避 */
    tryDodge() {
      var now = this.time.now, h = this.hero;
      if (!this.running || this.heroDead || this.dodging || this.diving) return false;
      if (now < this.dodgeReadyAt) return false;
      if (h.stamina < DODGE.cost) {
        this.showFloat(h.x, h.y - 70, '体力不足', UI.accent, 15);
        sfx('error');
        this.staminaMeter.fill.setTint(0xff8a7a);
        return false;
      }

      h.stamina -= DODGE.cost;
      this.staminaHoldUntil = now + STAMINA.delay;
      this.dodging = true;
      this.dodgeStartAt = now;
      this.dodgeUntil = now + DODGE.time;
      this.dodgeReadyAt = now + DODGE.time + DODGE.recover;
      // 无敌帧：闪避的全部意义在这里
      this.invulnUntil = Math.max(this.invulnUntil, now + DODGE.invuln);
      this.dodgeFxUntil = now + DODGE.invuln;
      // 闪避可取消攻击后摇与蓄力
      this.attacking = false;
      this.isCharging = false;
      this.chargeRatio = 0;
      if (this.chargeRing) this.chargeRing.setVisible(false);

      var dir = h.flipX ? -1 : 1;
      var onGround = h.body.blocked.down || h.body.touching.down;
      h.setVelocityX(dir * DODGE.speed);
      if (!onGround) h.setVelocityY(h.body.velocity.y * 0.3);   // 空中闪避：短暂滞空
      h.play('hero_roll', true);
      this._afterimageAt = 0;
      this.spawnAfterimage(h);
      sfx('dash');
      this.spark(h.x - dir * 12, h.y - 22, 0x8ae0ff);
      if (state.settings.screenShake2D !== false) this.cameras.main.shake(60, 0.002);
      this.refreshHud();
      return true;
    }

    /** 闪避逐帧：冲刺位移 + 残影，结束后交还控制 */
    updateDodge(dt, onGround) {
      var now = this.time.now, h = this.hero;
      if (now < this.dodgeUntil) {
        var dir = h.flipX ? -1 : 1;
        if (Math.abs(h.body.velocity.x) < DODGE.speed * 0.5) h.setVelocityX(dir * DODGE.speed);
        if (!onGround) h.setVelocityY(h.body.velocity.y * DODGE.airDrag);
        if (now - this._afterimageAt > 45) {
          this._afterimageAt = now;
          this.spawnAfterimage(h);
        }
        h.play('hero_roll', true);
      } else {
        this.dodging = false;
        h.setVelocityX(h.body.velocity.x * 0.4);
        // 翻滚收招后的短暂窗口内接攻击 = 突进斩（连招）
        this.dodgeCounterUntil = Math.max(this.dodgeCounterUntil || 0, now + CHAIN.dodgeWindow);
      }
      h.setAlpha(this.invulnAlpha());
    }

    /**
     * 无敌帧的闪烁：闪避用柔和虚影（角色仍要看得清），受击无敌沿用快速闪烁
     */
    invulnAlpha() {
      var now = this.time.now;
      if (now >= this.invulnUntil) return 1;
      if (now < (this.dodgeFxUntil || 0)) return 0.62 + 0.22 * Math.sin(now / 55);
      return 0.45 + 0.35 * Math.sin(now / 60);
    }

    /** 闪避残影：复用主角当前帧，短时淡出（对象数量与生命周期都受控） */
    spawnAfterimage(h) {
      var img = this.add.image(h.x, h.y, h.texture.key, h.frame.name)
        .setOrigin(0.5, 1).setDepth(9).setFlipX(h.flipX).setAlpha(0.32).setTint(0x7fd8ff);
      this.tweens.add({ targets: img, alpha: 0, duration: 240, onComplete: function () { img.destroy(); } });
    }

    /**
     * 完美闪避：在敌人攻击命中的瞬间闪避成功
     * 奖励：体力全额返还 + 震开（定身）周围敌人 + 锐利（短时伤害强化）+ 化解逼近的弹幕
     */
    onPerfectDodge() {
      var now = this.time.now, h = this.hero;
      if (now - (this._lastPerfectAt || -9999) < 200) return;   // 同一次攻击只结算一次
      this._lastPerfectAt = now;
      this._perfectAt = now;

      h.stamina = h.maxStamina;
      this.perfectUntil = now + DODGE.sharp;
      h.perfectCount = (h.perfectCount || 0) + 1;
      this.perfectCount = h.perfectCount;
      this.addFury(FURY.gainPerfect);          // 完美闪避攒怒（技巧奖励）

      this.showFloat(h.x, h.y - 96, '完美闪避!', UI.gold, 22);
      this.spark(h.x, h.y - 26, 0xffd76a);
      sfx('perfect');
      this.cameras.main.flash(120, 250, 226, 150);
      if (state.settings.screenShake2D !== false) this.cameras.main.shake(90, 0.005);

      var ring = this.add.circle(h.x, h.y - 24, 16, 0xffd76a, 0.16).setDepth(11);
      ring.setStrokeStyle(3, 0xffd76a, 0.9);
      this.tweens.add({
        targets: ring, radius: DODGE.radius, alpha: 0, duration: 320,
        onComplete: function () { ring.destroy(); }
      });

      // 震开：范围内的敌人定身（正在冲锋的也会被打断）
      var self = this, r = DODGE.radius;
      this.enemies.forEach(function (e) {
        if (!e.alive) return;
        if (Math.abs(e.sprite.x - h.x) > r || Math.abs(e.sprite.y - h.y) > r) return;
        e.state = 'chase';
        e.stunUntil = now + DODGE.stun;
        e.sprite.setVelocity(0, 0);
        self.showFloat(e.sprite.x, e.sprite.y - 80, '定身', UI.gold, 14);
        self.spark(e.sprite.x, e.sprite.y - 26, 0xffd76a);
      });
      // 逼近的弹幕直接化解，避免完美闪避后立刻被同一波弹幕打中
      this.clearNearbyProjectiles(h.x, h.y, 150);
      this.refreshHud();
    }

    /** 化解范围内的敌方弹幕 */
    clearNearbyProjectiles(x, y, r) {
      var self = this;
      this.projectiles = this.projectiles.filter(function (p) {
        if (!p || !p.active || p._friendly) return !!p;
        if (Math.abs(p.x - x) > r || Math.abs(p.y - y) > r) return true;
        self.spark(p.x, p.y, 0xffd76a);
        p.destroy();
        return false;
      });
    }

    /** 体力回复 + 闪避提示（危险时机体力条发光 = 可完美闪避） */
    updateStamina(dt) {
      var h = this.hero, now = this.time.now;
      if (!this.staminaMeter || !h) return;
      if (!this.heroDead && now >= this.staminaHoldUntil && h.stamina < h.maxStamina) {
        h.stamina = Math.min(h.maxStamina, h.stamina + STAMINA.regen * dt / 1000);
      }
      this.setMeterValue(this.staminaMeter, h.stamina / h.maxStamina);
      this.updateMeter(this.staminaMeter, dt, now);

      var low = h.stamina < DODGE.cost;
      var sharpLeft = this.perfectUntil - now;
      var v = Math.round(h.stamina);
      if (v !== this._staminaShown || Math.abs(sharpLeft - (this._sharpLeftShown || 0)) > 90) {
        this._sharpLeftShown = sharpLeft;
        this.updateStaminaText();
      }
      // 体力不足：条体转红（还能不能再闪，一眼可读）
      var wantTint = low ? 0xff8a7a : 0xffffff;
      if (this.staminaMeter.fill.tintTopLeft !== wantTint) this.staminaMeter.fill.setTint(wantTint);

      var danger = !low && this.perfectWindowOpen();   // 体力不足时不再提示可完美闪避
      var tip = danger ? (0.2 + 0.18 * (0.5 + 0.5 * Math.sin(now / 130))) : 0;
      if (Math.abs((this.staminaTip.alpha || 0) - tip) > 0.012) this.staminaTip.setAlpha(tip);
      if (this.isTouch && this.btnDodge) {
        this.btnDodge.setFillStyle(0x5fd0e0, low ? 0.1 : (danger ? 0.44 : 0.24));
      }
    }

    /** 当前是否处于「可完美闪避」窗口：附近敌人在前摇 / 冲锋，或有弹幕正在逼近 */
    perfectWindowOpen() {
      var h = this.hero;
      if (!h) return false;
      var es = this.enemies || [];
      for (var i = 0; i < es.length; i++) {
        var e = es[i];
        if (!e.alive) continue;
        if (e.state !== 'windup' && e.state !== 'charge') continue;
        if (Math.abs(e.sprite.x - h.x) < 200 && Math.abs(e.sprite.y - h.y) < 150) return true;
      }
      var ps = this.projectiles || [];
      for (var j = 0; j < ps.length; j++) {
        var p = ps[j];
        if (!p || !p.active || p._friendly) continue;
        var dx = h.x - p.x;
        if (Math.abs(dx) < 170 && Math.abs((h.y - 30) - p.y) < 80 && dx * p.body.velocity.x > 0) return true;
      }
      return false;
    }

    /** 体力数值 + 锐利倒计时（只在数值变化时更新文本） */
    updateStaminaText() {
      if (!this.staminaText) return;
      var h = this.hero, now = this.time.now;
      var v = Math.round(h.stamina);
      this._staminaShown = v;
      this.staminaText.setText('体力 ' + v).setColor(h.stamina < DODGE.cost ? UI.danger : UI.accent);
      var x = this.meterTextX(this.staminaMeter, this._stamTextGap);
      if (x == null) x = 286;
      var y = this._stamTextY != null ? this._stamTextY : 56;
      this.staminaText.setPosition(x, y);

      var left = this.perfectUntil - now;
      var show = left > 0;
      if (this.sharpText.visible !== show) this.sharpText.setVisible(show);
      this.sharpText.setPosition(x + this.staminaText.width + 10, y);
      if (show) this.sharpText.setText('锐利 ' + (left / 1000).toFixed(1) + 's');
    }

    heroDie() {
      this.heroDead = true;
      this.attacking = false;
      this.diving = false;
      this.dodging = false;
      if (this.diveFx) this.diveFx.setVisible(false);
      this.hero.hp = 0;
      this.hero.play('hero_dead', true);
      this.hero.setVelocity(0, -200);
      this.hero.body.checkCollision.none = true;
      this.running = false;
      this.refreshHud();
      sfx('defeat');
      setBgmScene('explore');
      if (this.targetPanel) this.targetPanel.setVisible(false);
      // 稍等死亡动画再弹出结算面板
      var self = this;
      this.time.delayedCall(600, function () { if (self.heroDead) self.showDeathPanel(); });
    }

    showDeathPanel() {
      if (this.deathOpen || !this.ready) return;
      this.deathOpen = true;
      if (this.mapOpen) this.destroyLayer('mapLayer');
      this.confirmOpen = false;
      this.destroyLayer('confirmLayer');
      if (this.touchUI) this.touchUI.setVisible(false);
      this.buildDeathLayer();
      if (this.deathLayer) {
        this.deathLayer.setAlpha(0);
        this.tweens.add({ targets: this.deathLayer, alpha: 1, duration: 280 });
      }
    }

    buildDeathLayer(sizeW, sizeH) {
      var W = (sizeW && sizeW >= 40) ? sizeW : this.scale.width;
      var H = (sizeH && sizeH >= 40) ? sizeH : this.scale.height;
      if (W < 40 || H < 40) return null;
      var mini = W < 700;
      var L = this.add.container(0, 0).setDepth(2200).setScrollFactor(0);
      this.deathLayer = L;
      this.panelButtons.death = [];

      this.addDim(L, W, H);
      L.add(this.add.text(W / 2, H * 0.18, '你倒下了', {
        fontSize: (mini ? 28 : 42) + 'px', color: UI.danger, fontStyle: 'bold', letterSpacing: 4
      }).setOrigin(0.5));
      var roomName = this.roomNode ? ((ROOM_TYPES[this.roomNode.type] || ROOM_TYPES.enemy).name) : '深渊';
      L.add(this.add.text(W / 2, H * 0.18 + (mini ? 26 : 38), '深渊试炼 · 第 ' + this.floor + ' 层 · ' + roomName, {
        fontSize: (mini ? 12 : 15) + 'px', color: UI.muted
      }).setOrigin(0.5));

      var boxW = Math.min(W * 0.84, 460), boxH = mini ? 200 : 232;
      var boxY = H * 0.5;
      this.addPanel(L, W / 2 - boxW / 2, boxY - boxH / 2, boxW, boxH, {});

      var lines = [
        ['到达层数', '第 ' + this.floor + ' 层'],
        ['试炼点数', '' + this.points],
        ['击败敌人', (this.kills || 0) + ' 个'],
        ['通过房间', (this.roomsCleared || 0) + ' 个'],
        ['存活时间', fmtTime(this.time.now - this.runStartedAt)]
      ];
      // 深渊回响：把「这一局能带回经典模式什么」直接摆在结算面板上。
      // 战死按基础倍率结算（不打折，但层数就此定格）；活着撤离才有 ×1.25。
      var rw = callBridge('rewardPreview', {
        floor: this.floor, points: this.points, kills: this.kills || 0, extracted: false
      });
      if (rw) {
        lines.push(['深渊回响', '+' + rw.totalGold + ' 金币 / +' + rw.totalXp + ' 经验']);
      }
      var self = this;
      var top = boxY - boxH / 2 + (mini ? 20 : 26);
      var step = mini ? 25 : 29;
      lines.forEach(function (ln, i) {
        var y = top + i * step;
        L.add(self.add.text(W / 2 - boxW / 2 + 24, y, ln[0], {
          fontSize: (mini ? 12 : 14) + 'px', color: UI.muted
        }).setOrigin(0, 0.5));
        L.add(self.add.text(W / 2 + boxW / 2 - 24, y, ln[1], {
          fontSize: (mini ? 14 : 17) + 'px', color: UI.title, fontStyle: 'bold'
        }).setOrigin(1, 0.5));
      });

      L.add(this.add.text(W / 2, boxY + boxH / 2 + (mini ? 22 : 28),
        '活着撤离可多得 25%；点数可在商店换永久强化（试炼内生效）', {
          fontSize: (mini ? 11 : 13) + 'px', color: UI.accent
        }).setOrigin(0.5));

      var bw = Math.min(200, W * 0.37), bh = mini ? 38 : 44;
      var gap = Math.min(28, W * 0.04);
      var by = Math.min(H - (mini ? 54 : 70), boxY + boxH / 2 + (mini ? 62 : 80));
      var bx = W / 2 - (bw * 2 + gap) / 2;
      this.uiButton(L, this.panelButtons.death, 'shop', '试炼商店', bx, by, bw, bh, true);
      this.uiButton(L, this.panelButtons.death, 'exit', '退出试炼', bx + bw + gap, by, bw, bh, false);
      return L;
    }

    onDeathAction(action) {
      if (action === 'shop') { this.openShop({ returnToDeath: true }); return; }
      if (action === 'exit') { this.finishRun('dead'); return; }
    }

    // ---------- 商店（画面内）----------
    openShop(opts) {
      if (this.shopOpen) return;
      this.shopOpen = true;
      this.shopReturnToDeath = !!(opts && opts.returnToDeath);
      this.dodging = false;
      this.dodgeReadyAt = 0;
      this.shopTab = 0;
      this.shopPage = 0;
      // 商店盖在地图之上：先收起地图层（逻辑状态保留，关闭时重建）
      if (this.mapOpen) this.destroyLayer('mapLayer');
      this._pausedForShop = !this.mapOpen && !this.deathOpen;
      if (this._pausedForShop) { try { this.physics.world.pause(); } catch (e) { /* 忽略 */ } }
      this.attacking = false;
      this.diving = false;
      this.isCharging = false;
      if (this.chargeRing) this.chargeRing.setVisible(false);
      if (this.diveFx) this.diveFx.setVisible(false);
      if (this.hero) this.hero.setVelocity(0, 0);
      if (this.touchUI) this.touchUI.setVisible(false);
      this.shopData = callBridge('shopData', this.points);
      this.buildShopLayer();
      if (this.shopLayer) {
        this.shopLayer.setAlpha(0);
        this.tweens.add({ targets: this.shopLayer, alpha: 1, duration: 200 });
      }
      setBgmScene('shop');
      sfx('shop');
      this.setHudButtonOn('shop', true);
    }

    closeShop() {
      if (!this.shopOpen) return;
      this.shopOpen = false;
      this.destroyLayer('shopLayer');
      this.shopItemRects = [];
      if (this.panelButtons) this.panelButtons.shop = [];
      this.setHudButtonOn('shop', false);      setBgmScene(bgmForRoom(this.roomNode ? this.roomNode.type : 'enemy'));
      sfx('click');

      // 结束 Boss 房间后打开过商店：关闭后继续选房间
      if (this.pendingMapAfterShop && !this.deathOpen) {
        this.pendingMapAfterShop = false;
        this.openMap();
        return;
      }
      // 从地图界面打开的商店：关闭后回到地图
      if (this.mapOpen) {
        this.buildMapLayer();
        if (this.mapLayer) {
          this.mapLayer.setAlpha(0);
          this.tweens.add({ targets: this.mapLayer, alpha: 1, duration: 180 });
        }
        return;
      }
      if (this._pausedForShop) {
        this._pausedForShop = false;
        try { this.physics.world.resume(); } catch (e) { /* 忽略 */ }
      }
      if (this.touchUI) this.touchUI.setVisible(this._lastInputWasTouch === true);
    }

    onShopAction(action) {
      if (action === 'close') { this.closeShop(); return; }
      if (action === 'prev') { this.shopPage = Math.max(0, this.shopPage - 1); this.rebuildShop(); return; }
      if (action === 'next') { this.shopPage = this.shopPage + 1; this.rebuildShop(); return; }
      if (action.indexOf('tab') === 0) {
        this.shopTab = parseInt(action.slice(3), 10) || 0;
        this.shopPage = 0;
        this.rebuildShop();
        return;
      }
    }

    rebuildShop() {
      if (!this.shopOpen) return;
      this.destroyLayer('shopLayer');
      this.buildShopLayer();
    }

    /** 购买：点数与解锁由宿主处理，2D 层只负责展示与反馈 */
    buyShopItem(id) {
      var res = callBridge('shopBuy', id, this.points);
      if (!res) { sfx('error'); this.showCenter('商店数据不可用', '#ff8a7a'); return; }
      if (res.ok) {
        sfx('buy');
        if (typeof res.points === 'number') this.points = res.points;
        this.showCenter(res.name ? ('已购买 · ' + res.name) : '购买成功', '#73f0b4');
        this.refreshHud();
      } else {
        sfx('error');
        this.showCenter(res.msg || '无法购买', '#ff8a7a');
      }
      this.shopData = callBridge('shopData', this.points) || this.shopData;
      this.rebuildShop();
    }

    // ---------- 图鉴（画面内）----------
    /**
     * 深渊图鉴：只讲 **2D 试炼** 里真实成立的规则
     *   · 内容全部从运行中的表里现算（英雄 / 怪物 / 技巧 / 连招 / 诅咒 / 环境），
     *     所以改数值不会让图鉴说谎
     *   · 形象直接用 角色形象.js 生成的同一张精灵（与战场完全一致）
     *   · 诅咒与环境写清「文字模式原描述 → 在 2D 里实际变成什么」
     */
    codexEntries(section) {
      var A = 角色形象, self = this, out = [];

      if (section === 'hero') {
        var HERO_INFO = {
          warrior:   { tag: '重甲长剑 · 正面硬吃', atk: '长剑挥砍（近战 · 380ms · ×1.0）', ult: '战吼 —— 立刻 +6 护盾，震退 150px 内的敌人', pas: '开战 +3 护盾（进入每个房间时）', tip: '举盾顶住正面、蓄力跳追高台；血厚，适合先手探房。' },
          guardian:  { tag: '塔盾壁垒 · 举盾换命', atk: '塔盾撞击（近战 · 380ms · ×1.0）', ult: '护盾壁垒 —— +6 护盾，4 秒内受到的伤害减半', pas: '坚壁防御 —— 每次完美格挡 +2 护盾', tip: '全场最吃「完美格挡」的人：挡一下就多 5 点护盾，还会顶开敌人。' },
          paladin:   { tag: '圣光剑 · 越打越稳', atk: '圣光剑（近战 · 380ms · ×1.0）', ult: '神圣审判 —— +8 护盾并回复 4 点生命', pas: '开战 +4 护盾（进入每个房间时）', tip: '开房先存护盾，用护盾换走位，血线始终比对手高一截。' },
          ranger:    { tag: '长弓 · 放风筝（远程）', atk: '疾风箭（远程 · 300ms · ×1.0 · 可穿 2 个）', ult: '精准射击 —— 射出强化箭（×2，穿透到底）', pas: '寻宝天赋 —— 每房间首次击杀 +1 试炼点', tip: '全场射速最快；滞空按 J 会自动朝最近敌人射击，边跳边打。' },
          rogue:     { tag: '双匕 · 爆发窗口（最瘦）', atk: '双匕连刺（近战 · 380ms · ×1.0）', ult: '影舞突袭 —— 3 秒内攻击 ×2', pas: '迅捷突袭 —— 房间内首次命中 +2 伤害', tip: '突进斩（翻滚后接 J）命中后开技能，3 秒 ×2 能秒掉普通怪。' },
          shadow:    { tag: '长镰 · 高风险爆发', atk: '长镰横扫（近战 · 380ms · ×1.0）', ult: '暗影突袭 —— 1.2 秒无敌，3 秒内攻击 ×3', pas: '暗影步 —— 房间内首次命中必定暴击', tip: '无敌帧里硬穿弹幕，落地接盾反/横扫把爆发一次倒出去。' },
          mage:      { tag: '法杖 · 控场（远程）', atk: '奥术弹（远程 · 560ms · ×1.15 · 追踪 + 溅射）', ult: '元素风暴 —— 以自身为中心 210px 爆发（×2.5 + 击退）', pas: '奥术爆发 —— 每次命中 30% 概率 +3 伤害', tip: '弹丸会转弯，对着人堆放；被围住时元素风暴是解围牌。' },
          sage:      { tag: '卷轴法杖 · 续航（远程）', atk: '灵能波（远程 · 470ms · ×0.85 · 穿透全场）', ult: '法力灌注 —— +8 生命 +3 护盾，3 秒内攻击 ×1.6', pas: '灵能回响 —— 每房间首次击杀回复 2 生命', tip: '一道波穿一条线，适合站在平台边缘往走廊里推。' },
          berserker: { tag: '双斧 · 残血更凶（最宽）', atk: '双斧劈砍（近战 · 380ms · ×1.0）', ult: '破釜沉舟 —— 失去 15% 当前生命，8 秒攻击 ×2.5 且吸血 20%', pas: '嗜血狂暴 —— 生命 ≤50% 时 +2 伤害', tip: '先挨到半血再开技能，吸血叠加后能靠打伤害回血。' }
        };
        Object.keys(A.LOOKS).forEach(function (id) {
          var L = A.LOOKS[id];
          if (L.kind !== 'hero') return;
          var info = HERO_INFO[id] || {};
          out.push({
            id: id, name: id, cn: (L.className || '').split(' · ')[0], tag: info.tag || L.className,
            portrait: { kind: 'hero', key: id },
            rows: [
              ['普攻', info.atk || '—'],
              ['主动技能', info.ult || '—'],
              ['被动', info.pas || '—'],
              ['装备', [L.weapon, L.offhand].filter(Boolean).join(' + ') + (L.legs && L.legs !== 'legs' ? ' · ' + L.legs : '')],
              ['体型', '宽 ' + L.build.bw + ' × 高 ' + L.build.bh]
            ],
            note: info.tip || ''
          });
        });

      } else if (section === 'mob') {
        var TIER = { normal: '普通', elite: '精英', mirror: '镜像', boss: '首领' };
        var MOB_EXTRA = {
          skeleton: '中远距离（96~380px）每 1.4 秒判定一次，35% 概率改掷长矛；长矛走抛物线、落地插住，看得见也闪得掉。',
          mimic: '完全照当前玩家：体型、装备、攻击方式全都一样 —— 你远程它就远程（换镜像紫），你近战它就贴身。镜像房里它会按你的属性成长。',
          guard: '举盾冲锋，被打断会立刻再冲；重戟横扫范围比看上去宽。',
          necro: '保持 220px 距离远程放弹幕，被逼近会后撤；平台上那只就是它。',
          magma: '先蓄力再高速冲锋，冲锋命中是 1.5 倍伤害；贴身后改用巨拳。',
          zombie: '走得最慢，但自带 1 点荆棘反伤 —— 打得越急自己越疼。',
          shade: '会飞，能绕过地形直线追你；近身突进快但没有远程手段。',
          lord: '每 2.8~4.4 秒跳起来砸地，落点半径 160px，落地前有影子可读。',
          shadowking: '层主的强化版：更宽、更抗打，砸地频率相同但伤害更高。',
          claw: '最快的普通怪之一，纯贴身扑击，没有远程手段。'
        };
        Object.keys(ENEMY_TYPES).forEach(function (key) {
          var d = ENEMY_TYPES[key];
          if (key === 'mimic' && !A.LOOKS[key]) return;
          out.push({
            id: key, name: key, cn: d.name, tag: TIER[d.tier] + ' · ' + (BEHAVIOR_NAMES[d.behavior] || '追击'),
            tier: d.tier,
            portrait: { kind: 'mob', key: key },
            rows: [
              ['层级', TIER[d.tier] || d.tier],
              ['行为', (BEHAVIOR_NAMES[d.behavior] || '追击') + (d.behavior === 'shooter' ? '（保持 ' + (d.keepDist || 200) + 'px）' : '')],
              ['生命 / 攻击', d.hp + ' / ' + d.atk + '（每层 +20% / +15%）'],
              ['移动速度', d.speed + ' px/s'],
              ['攻击距离', d.attackRange + 'px · 前摇 ' + d.windup + 'ms · 后摇 ' + d.recover + 'ms'],
              ['动画帧率', '×' + (A.animRateOf ? A.animRateOf(key) : 1) + (A.animRateOf && A.animRateOf(key) > 1 ? '（动作多，帧率更高）' : '')]
            ],
            note: MOB_EXTRA[key] || ''
          });
        });

      } else if (section === 'skill') {
        out = [
          { id: 'charge', name: '蓄力跳', tag: '按住 空格 / W / ↑，松开起跳', rows: [['跳跃高度', '轻点 520（约 80px）· 半蓄力 835（约 205px）· 满蓄力 1150（约 380px）'], ['满蓄力耗时', '620ms'], ['代价', '蓄力期间移动速度减半'], ['宽限', '走出平台边缘后仍有约 120ms 可起跳（土狼时间）']], note: '平台都是按满蓄力可及范围生成的，够不到就再多蓄一点。' },
          { id: 'dive', name: '跳劈', tag: '滞空时按 J（近战英雄）', rows: [['下坠速度', '960 px/s'], ['下坠命中', '×1.9 伤害 + 额外击退'], ['落地冲击', '半径 130px 范围 ×1.15'], ['限制', '同一敌人一次只结算一次；两次跳劈间隔 360ms']], note: '补刀、清群、突围的主力；空中先蓄力跳再按 J 就能连续跳劈。' },
          { id: 'airshot', name: '空中射击', tag: '滞空时按 J（游侠 / 法师 / 贤者）', rows: [['行为', '自动朝最近的敌人射击'], ['区别', '落地是平射，滞空带俯角'], ['注意', '远程英雄没有跳劈']], note: '三人普攻本来就是远程，空中攻击换成射击而不是下落斩。' },
          { id: 'dodge', name: '闪避（翻滚）', tag: 'K', rows: [['体力消耗', '30 / 100'], ['无敌时间', '320ms'], ['翻滚速度', '520 px/s，持续 260ms'], ['可以取消', '攻击后摇、蓄力']], note: '空中闪避会把下坠速度压到 30% 并逐帧衰减，等于半滞空。' },
          { id: 'perfectDodge', name: '完美闪避', tag: '在敌人命中的瞬间按 K', rows: [['判定窗口', '闪避起手 150ms 内挡下伤害'], ['奖励', '体力全额返还 · 定身 0.9s（半径 175px）· 锐利 3 秒（伤害 ×2.2 且必暴）'], ['附带', '化解 150px 内逼近的弹幕']], note: '体力条在可以完美闪避时会亮起金色呼吸光 —— 看到就按下。' },
          { id: 'guard', name: '防御（举盾）', tag: '按住 S / ↓', rows: [['正面减伤', '只吃 25% 伤害'], ['背后', '不减伤（会提示「背后!」）—— 要转身顶着打'], ['体力消耗', '14 / 秒，与闪避共用同一个体力池'], ['代价', '移动速度 ×0.42、不能起跳'], ['自动收盾', '体力低于 12；回到 30 才能再举']], note: '按 J 会先收盾再攻击，所以「举盾 → 格挡 → 盾反」可以一口气接出来。' },
          { id: 'perfectBlock', name: '完美格挡', tag: '抬盾成型后 200ms 内挡下正面攻击', rows: [['免伤', '完全不掉血'], ['反弹', '攻击者被顶开并定身 0.7s'], ['奖励', '+3 护盾；守护者额外 +2'], ['附带', '化解 130px 内的弹幕，并打开 1.2 秒盾反窗口']], note: '奖励只给时机不给长按：一直举着盾只能减伤，还拿不到护盾。' },
          { id: 'potion', name: '治疗药水', tag: 'L', rows: [['回复量', '最大生命的 35%'], ['来源', '开局携带 + 宝箱 45% 概率掉落 + 商店购买']], note: '遇到「治疗抑制」环境或「药水衰减」诅咒时回复会打折。' },
          { id: 'fury', name: '狂怒（重做）', tag: '满值后按 R', color: '#ffd76a', rows: [
            ['原版（文字试炼）', '上限 10，攻击 / 防御 / 药水各 +1，满后手动「爆发」造成 10~14 点固定伤害；商店有「狂怒燃料」'],
            ['为什么重做', '实时挥砍的频率是回合制的几十倍，10 格瞬间就满；固定伤害在攻击力几十上百的实时尺度下也读不出来'],
            ['现在是什么', '一管进攻资源，上限 ' + FURY.max + '，攒满按 R 进入 ' + (FURY.duration / 1000) + ' 秒狂怒状态'],
            ['攒怒来源', '命中敌人（普通 +2 / 精英与镜像 +3 / 首领 +4）· 连招命中额外 +3 · 完美闪避与完美格挡各 +6 · 击杀 +5 · 挨打 +4'],
            ['为什么不给防御', '举盾与走位不攒怒 —— 它奖励的是"打得凶"，正好和奖励"会躲"的体力形成一组对立'],
            ['狂怒状态', '攻击间隔 ÷1.35 · 伤害 ×1.5 · 移动速度 ×1.25 · 不再被后仰打断'],
            ['代价', '受到的伤害 +15%（狂暴而不设防）'],
            ['不会浪费', '满值后 12 秒没按 R 会自动爆发，HUD 上有提示']
          ], note: '节奏感：体力管「活下来」，狂怒管「打得进去」——两者都靠打得好，但一个奖励规避、一个奖励压制。' }
        ];

      } else if (section === 'chain') {
        // 连招有两套招式：近战（挥砍）与远程（弹丸），触发时机完全一样，只换招式本身
        var rc = RANGED_CHAIN;
        out = [
          {
            id: 'sweep', name: '横扫 / ' + rc.triple.name, tag: '地面连按 J 的第 3 下（' + CHAIN.window + 'ms 内）', color: UI.gold,
            rows: [
              ['近战 · 横扫', '伤害 ×' + CHAIN.sweepMult + '、范围 ×' + CHAIN.sweepRange + '（实测 118px 外普通够不到、横扫打得到）'],
              ['远程 · ' + rc.triple.name, '一次射出 ' + rc.triple.spread + ' 支扇形弹（偏角 ±' + rc.triple.spreadDeg + '°），中间 ×1.0、两侧 ×' + rc.triple.sideMult],
              ['提示', '主角头顶显示「接 J · 连斩 1/2 → 2/2」，远程显示「连射 1/2 → 2/2」']
            ],
            note: '近战是一下把身前一整片扫开；远程是同一时间把三支弹铺成一个扇面 —— 都是清小怪的主力。'
          },
          {
            id: 'counter', name: '盾反 / ' + rc.counter.name, tag: '完美格挡后 1.2 秒内按 J', color: '#ffd76a',
            rows: [
              ['近战 · 盾反', '伤害 ×' + GUARD.counterMult + '、必定暴击，把敌人推开，附带短促前冲'],
              ['远程 · ' + rc.counter.name, '伤害 ×' + rc.counter.mult + '、必定暴击、穿透 ' + rc.counter.pierce + '、击退 ' + rc.counter.knock + ' —— 靠击退把人推开，自己不冲'],
              ['前提', '必须先成功完美格挡']
            ],
            note: '全场收益最高的连招：挡一下再打，伤害能到普通攻击的三倍。'
          },
          {
            id: 'roll', name: '突进斩 / ' + rc.roll.name, tag: '翻滚结束后 0.9 秒内按 J', color: '#8ad8ff',
            rows: [
              ['近战 · 突进斩', '伤害 ×' + CHAIN.dodgeMult + '、前冲 ' + CHAIN.dodgeLunge + ' px/s'],
              ['远程 · ' + rc.roll.name, '连续点射 ' + rc.roll.burst + ' 发（间隔 ' + rc.roll.burstGap + 'ms、几乎同一条线），每发 ×' + rc.roll.mult + '、速度 ×' + rc.roll.speedMult + '，三发全中合计 ×' + (rc.roll.mult * rc.roll.burst).toFixed(2)],
              ['每发重新锁定', '连射期间每一发都重新锁定最近的敌人（' + ENV.lockRange + 'px 内）—— 目标在跑、跳上高台，后面几发都会跟着改角度'],
              ['定位', '打「单个硬目标」（精英 / 首领）的持续输出；和三连散（一次铺开好多个目标）正好互补']
            ],
            note: '近战是「翻滚穿过敌人 → 回头一刀」；远程是「翻滚拉开 → 连续点射」，把闪避的无敌帧换成一轮实打实的输出。'
          },
          {
            id: 'landing', name: '落地斩 / ' + rc.land.name, tag: '近战：跳劈落地后 0.7 秒内按 J ｜ 远程：空中射击后落地', color: '#ff9a5a',
            rows: [
              ['近战 · 落地斩', '伤害 ×' + CHAIN.diveMult + '、半径 ' + CHAIN.diveSplashR + 'px 的二次范围伤害'],
              ['远程 · ' + rc.land.name, '伤害 ×' + rc.land.mult + '，弹丸带下坠弧线瞄向地面，命中或插地都会炸开半径 ' + rc.land.blast + 'px（溅射 ×' + rc.land.blastMult + '）'],
              ['窗口来源', '远程没有跳劈，窗口改挂在「空中射击后落地」上 —— 节奏与近战一致']
            ],
            note: '把单点爆发铺成一片：近战靠落地冲击，远程靠插在地上的那一炸。'
          }
        ];
        out.push({
          id: 'rule', name: '连招规则', tag: '窗口、优先级与消耗', color: UI.accent,
          rows: [
            ['优先级', '盾反（反击箭）> 突进斩（连珠箭）> 落地斩（踏地箭）> 三连斩（三连散）'],
            ['窗口', '每个窗口独立计时、各自消耗，不会叠成一次超大伤害'],
            ['打断', '举盾会清空连招计数'],
            ['两套招式', '触发时机、衔接窗口、优先级对近战与远程完全一样；差别只在招式本身 —— 近战靠冲上去挥砍，远程靠弹丸的形态（穿透 / 连射 / 落点 / 多目标）'],
            ['远程招式名', '游侠（弓）/ 法师（法杖）/ 贤者（卷轴）各有自己的四个招式名，见本页各条目的「远程」一行']
          ],
          note: '窗口开着时主角头顶会提示「接 J · XX」，照着按就是收益。'
        });

      } else if (section === 'curse') {
        out = TRIAL_CURSES.map(function (c) {
          return {
            id: c.name, name: c.name, cn: '', tag: '每层深入时随机获得，不重复',
            active: self.hasCurse(c.name),
            rows: [['文字模式', c.desc], ['2D 实时里', c.rt]],
            note: ''
          };
        });
        out.unshift({
          id: 'about', name: '诅咒总则', tag: '文字版试炼的诅咒，在 2D 里怎么生效', rows: [
            ['来源', '每深入一层随机获得一条，全 pool 不重复'],
            ['「每回合」译成', '每 5 秒一次的**腐化脉冲**（屏幕右上角有倒计时，最后 1.5 秒转红）'],
            ['两类改成每房间', '虚弱（攻击 -1）、迟钝（闪避 -5%）在同一房间内累积，清空房间后恢复到本局基础值'],
            ['为什么这么改', '实时战斗没有「回合」，脉冲是能看懂也能预期的等价物；永久削人的两条若按脉冲累积，一层打完角色就废了']
          ], note: ''
        });

      } else if (section === 'env') {
        var cur = this.worldEnv;
        if (cur) {
          out.push({
            id: '__cur', name: '当前环境 · ' + cur.name, tag: '当前生效' + (cur.displayValue ? ' · ' + cur.displayValue : ''), active: true,
            rows: [['原描述', envPlaceholderText((envByName(cur.name) || {}).desc || cur.description || '')], ['2D 实时里', this.envSummaryText() || envPlaceholderText((envByName(cur.name) || {}).rt) || ''], ['当前数值', cur.displayValue || '—']],
            note: '环境每进入一个房间重掷一次（袋抽发牌，15 种都会轮到），对双方同时生效 —— 它既是压力也是机会。'
          });
        }
        out = out.concat(WORLD_ENVS.map(function (e) {
          return {
            id: e.name, name: e.name, cn: '', tag: '每房间随机 · 对双方生效', active: !!(cur && cur.name === e.name),
            // 非当前环境拿不到本层的真实数值，占位符写成「<数值>」，免得图鉴里直接印出 {value}
            rows: [['文字模式（经典）', envPlaceholderText(e.desc)], ['2D 实时里', envPlaceholderText(e.rt)], ['结算位置', e.hook]],
            note: ''
          };
        }));
      }
      return out;
    }

    codexTabs() {
      return [
        { id: 'hero', label: '英雄' }, { id: 'mob', label: '怪物' },
        { id: 'skill', label: '技巧' }, { id: 'chain', label: '连招' },
        { id: 'curse', label: '诅咒' }, { id: 'env', label: '环境' }
      ];
    }

    openCodex(opts) {
      if (this.codexOpen) return;
      this.codexOpen = true;
      this.codexReturnToDeath = !!(opts && opts.returnToDeath);
      this.dodging = false; this.dodgeReadyAt = 0;
      this.lowerGuard();
      this.codexTab = opts && opts.tab ? opts.tab : (this.codexTab || 'hero');
      this.codexPage = 0;
      this.codexIndex = 0;
      if (this.mapOpen) this.destroyLayer('mapLayer');
      if (this.shopOpen) { this.shopOpen = false; this.destroyLayer('shopLayer'); this.setHudButtonOn('shop', false); }
      this._pausedForCodex = !this.mapOpen && !this.deathOpen;
      if (this._pausedForCodex) { try { this.physics.world.pause(); } catch (e) { /* 忽略 */ } }
      this.attacking = false; this.diving = false; this.isCharging = false;
      if (this.chargeRing) this.chargeRing.setVisible(false);
      if (this.diveFx) this.diveFx.setVisible(false);
      if (this.hero) this.hero.setVelocity(0, 0);
      if (this.touchUI) this.touchUI.setVisible(false);
      this.buildCodexLayer();
      if (this.codexLayer) {
        this.codexLayer.setAlpha(0);
        this.tweens.add({ targets: this.codexLayer, alpha: 1, duration: 200 });
      }
      sfx('click');
      this.setHudButtonOn('codex', true);
    }

    closeCodex() {
      if (!this.codexOpen) return;
      this.codexOpen = false;
      this.destroyLayer('codexLayer');
      this.panelButtons.codex = [];
      this.codexRects = [];
      this.setHudButtonOn('codex', false);
      sfx('click');
      if (this._pausedForCodex) {
        this._pausedForCodex = false;
        try { this.physics.world.resume(); } catch (e) { /* 忽略 */ }
      }
      if (this.mapOpen) { this.buildMapLayer(); return; }
      if (this.deathOpen) { return; }
      if (this.touchUI) this.touchUI.setVisible(this._lastInputWasTouch === true);
    }

    rebuildCodex() {
      if (!this.codexOpen) return;
      this.destroyLayer('codexLayer');
      this.buildCodexLayer();
    }

    onCodexAction(action) {
      if (action === 'close') { this.closeCodex(); return; }
      if (action === 'prev') { this.codexPage = Math.max(0, this.codexPage - 1); this.codexIndex = this.codexPage * this.codexPerPage(); this.rebuildCodex(); return; }
      if (action === 'next') { this.codexPage = this.codexPage + 1; this.codexIndex = this.codexPage * this.codexPerPage(); this.rebuildCodex(); return; }
      if (action.indexOf('tab:') === 0) {
        this.codexTab = action.slice(4);
        this.codexPage = 0; this.codexIndex = 0;
        this.rebuildCodex();
        return;
      }
    }

    codexPerPage() { return this._codexPerPage || 8; }

    selectCodexEntry(i) {
      var list = this.codexEntries(this.codexTab);
      if (i < 0 || i >= list.length) return;
      this.codexIndex = i;
      this.codexPage = Math.floor(i / this.codexPerPage());
      this.rebuildCodex();
    }

    buildCodexLayer(sizeW, sizeH) {
      var W = (sizeW && sizeW >= 40) ? sizeW : this.scale.width;
      var H = (sizeH && sizeH >= 40) ? sizeH : this.scale.height;
      if (W < 40 || H < 40) { fixCanvasSize(); return null; }
      // mini  = 真的窄：宽度摆不下「左栏列表 + 右栏详情」，只能单栏；
      // tight = 不窄但很矮（手机横屏 800×360：宽度够、高度只有 360）——
      //   它照样能用双栏，只是所有尺寸都得收一档。
      // 原来只有 mini 一个开关，手机横屏落进「不是 mini」的分支、直接套桌面尺寸：
      // 22px 内边距、138 高的形象卡、300px 侧栏，内容被挤出面板，和页脚文字叠成一团。
      var mini = W < 760;
      var tight = !mini && H < 520;
      var compact = mini || tight;   // 字号 / 间距走哪一档
      var self = this;
      var L = this.add.container(0, 0).setDepth(2310).setScrollFactor(0);
      this.codexLayer = L;
      this.panelButtons.codex = [];
      this.codexRects = [];

      this.addDim(L, W, H);

      var tabs = this.codexTabs();
      var list = this.codexEntries(this.codexTab);
      var panelW = Math.min(W * 0.94, 1040), panelH = Math.min(H * 0.92, 660);
      var panelX = W / 2 - panelW / 2, panelY = H / 2 - panelH / 2;
      this.addPanel(L, panelX, panelY, panelW, panelH, {});
      var pad = compact ? 14 : 22;

      // ---- 页眉：标题 + 收录条数 ----
      var headY = panelY + pad + (compact ? 2 : 6);
      L.add(this.add.text(panelX + pad, headY, '深渊图鉴', {
        fontSize: (compact ? 19 : 25) + 'px', color: UI.title, fontStyle: 'bold', letterSpacing: 3
      }).setOrigin(0, 0.5));
      L.add(this.add.text(panelX + pad + (compact ? 108 : 148), headY + 3, '2D 试炼', {
        fontSize: (compact ? 11 : 12) + 'px', color: UI.muted, letterSpacing: 1
      }).setOrigin(0, 0.5));
      // 收录统计（30 来个字）在单栏（真窄屏）下不画：360px 宽的面板里它会一路顶到
      // 左边，和「2D 试炼」副标题叠在一起。这一行信息价值最低，先让它让位 ——
      // 空出来的位置正好给「第 N / M 条」用（单栏没有列表可点，玩家得知道自己在哪）。
      if (!mini) {
        L.add(this.add.text(panelX + panelW - pad, headY,
          '收录 ' + this.codexEntries('hero').length + ' 英雄 · ' + this.codexEntries('mob').length + ' 怪物 · ' + this.codexEntries('curse').length + ' 诅咒 · ' + this.codexEntries('env').length + ' 环境', {
            fontSize: (compact ? 11 : 12) + 'px', color: UI.sub
          }).setOrigin(1, 0.5));
      } else {
        L.add(this.add.text(panelX + panelW - pad, headY, (this.codexIndex + 1) + ' / ' + list.length, {
          fontSize: '11px', color: UI.muted
        }).setOrigin(1, 0.5));
      }

      // ---- 分页签 ----
      var tabY = headY + (compact ? 26 : 34), tabH = compact ? 26 : 30;
      var availW = panelW - pad * 2;
      var tabW = Math.min(compact ? 58 : 74, (availW - 5 * 6) / 6);
      var tx = panelX + pad;
      tabs.forEach(function (t) {
        var on = t.id === self.codexTab;
        self.uiButton(L, self.panelButtons.codex, 'tab:' + t.id, t.label, tx, tabY, tabW, tabH, on);
        tx += tabW + 6;
      });

      // ---- 主体 ----
      var bodyTop = tabY + tabH / 2 + (compact ? 10 : 14);
      var footH = compact ? 40 : 48;
      var bodyBottom = panelY + panelH - pad - footH;
      // 侧栏宽度：矮屏再收一档，把宽度让给右侧详情 —— 详情里字段行少换一行就省一行高度
      var railW = mini ? 0
        : (tight ? Math.min(168, Math.max(132, panelW * 0.22))
                 : Math.min(300, Math.max(224, panelW * 0.29)));
      // 单栏时一页只放一条：翻页按钮的语义是「翻一页」，而单栏没有列表可以点，
      // 一页塞 5 条的话按一下「下一页」会直接跳过 4 条。
      var pageSize = mini ? 1 : (tight ? 5 : 8);
      this._codexPerPage = pageSize;
      var perPage = pageSize;
      var pageCount = Math.max(1, Math.ceil(list.length / perPage));
      if (this.codexPage >= pageCount) this.codexPage = 0;
      if (this.codexIndex >= list.length) this.codexIndex = 0;
      var cur = list[this.codexIndex] || list[0] || null;

      if (!mini) {
        // 左栏：词条列表（与右栏同高，选中项用绿胶囊）
        var railX = panelX + pad, railY = bodyTop;
        var railH = bodyBottom - bodyTop;
        this.addPanel(L, railX, railY, railW, railH, {
          fill: UI.box, fillAlpha: 0.42, radius: Math.max(8, UI.boxR), lineAlpha: 0.06
        });
        // 底部留 24px 给「第 N / M 页」提示：只留 16 的话提示会顶到最后一行上
        var rowH = (railH - 24) / perPage;
        var start = this.codexPage * perPage;
        for (var i = 0; i < perPage; i++) {
          var it = list[start + i];
          if (!it) break;
          var ry = railY + 8 + i * rowH;
          this.codexRow(L, railX + 8, ry, railW - 16, rowH - 4, it, start + i === this.codexIndex);
        }
        // 翻页提示
        if (pageCount > 1) {
          // 位置必须在左栏**内部**：原来写在 bodyBottom + 12，而那正好是页脚按钮所在的那一行，
          // 提示文字直接压在「‹ 上一页 / 下一页 ›」上面
          L.add(this.add.text(railX + railW / 2, railY + railH - 8,
            '第 ' + (this.codexPage + 1) + ' / ' + pageCount + ' 页 · 共 ' + list.length + ' 条', {
              fontSize: '11px', color: UI.muted
            }).setOrigin(0.5));
        }
      }

      // ---- 右栏 / 单栏：当前词条详情 ----
      var detailX = mini ? panelX + pad : panelX + pad + railW + 16;
      var detailW = mini ? panelW - pad * 2 : panelW - pad * 2 - railW - 16;
      // 传进去的是「紧凑档」而不是「单栏」：矮屏（手机横屏）走双栏，但尺寸必须收小
      this.codexDetail(L, detailX, bodyTop, detailW, bodyBottom - bodyTop, cur, compact);

      // ---- 页脚 ----
      var fy = panelY + panelH - pad - footH / 2;
      var bw = compact ? 92 : 108, bh = compact ? 32 : 36;
      if (pageCount > 1) {
        var pw = compact ? 74 : 88;
        this.uiButton(L, this.panelButtons.codex, 'prev', '‹ 上一页', panelX + pad, fy, pw, bh, false);
        this.uiButton(L, this.panelButtons.codex, 'next', '下一页 ›', panelX + pad + pw + 8, fy, pw, bh, false);
      }
      this.uiButton(L, this.panelButtons.codex, 'close', '返回战斗', panelX + panelW - pad - bw, fy, bw, bh, true);

      return L;
    }

    /** 图鉴左栏条目：中文名 + 英文 id/副标题，选中态用语义色描边 + 左侧色条 */
    codexRow(L, x, y, w, h, it, on) {
      var accent = it.color || (it.tier ? UI.tierHex[it.tier] : UI.cPrimary);
      var r = {
        x: x, y: y, w: w, h: h, i: this.codexRects.length, accent: accent, on: !!on, gfx: null
      };
      var g = this.add.graphics();
      r.g = g;
      L.add(g);
      this.codexRects.push(r);
      this.paintCodexRow(r, false);
      var name = it.cn || it.name;
      L.add(this.add.text(x + 14, y + h / 2 - (name !== it.name ? 7 : 0), name, {
        fontSize: '13px', color: on ? UI.text : UI.sub, fontStyle: on ? 'bold' : 'normal'
      }).setOrigin(0, 0.5));
      if (name !== it.name) {
        L.add(this.add.text(x + 14, y + h / 2 + 8, it.name, {
          fontSize: '10px', color: UI.muted
        }).setOrigin(0, 0.5));
      }
      if (it.active) L.add(this.add.circle(x + w - 14, y + 12, 3.5, UI.cGold, 1));
      return r;
    }

    /** 重画一条图鉴条目（选中 / 悬停 / 常态三态） */
    paintCodexRow(r, hover) {
      var g = r && r.g;
      if (!g || !g.scene) return;
      var rad = Math.max(4, UI.boxR - 4);
      g.clear();
      g.fillStyle(r.on ? r.accent : UI.box, r.on ? 0.16 : (hover ? 0.78 : 0.5));
      g.fillRoundedRect(r.x, r.y, r.w, r.h, rad);
      g.lineStyle(1, r.on ? r.accent : UI.panelLine, r.on ? 0.85 : (hover ? 0.2 : 0.06));
      g.strokeRoundedRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad);
      if (r.on) {   // 左侧 3px 色条：当前这一条的定位标记
        g.fillStyle(r.accent, 1);
        g.fillRoundedRect(r.x + 2, r.y + 4, 3, r.h - 8, 1.5);
      }
    }

    /** 图鉴右栏详情：形象（真实精灵）+ 名称 + 字段行 + 备注 */
    codexDetail(L, x, y, w, h, it, compact) {
      if (!it) return;
      var self = this;
      var A = 角色形象;
      var hasArt = !!(it.portrait && A);
      var artW = compact ? Math.min(150, w * 0.4) : 168;
      var artH = compact ? 118 : 138;
      // 详情区本身就很矮时，形象卡再收一档，把高度让给字段行
      if (h < 190) artH = Math.round(artH * 0.78);

      // ---- 形象卡：直接用战场上的那张精灵（idle + 出手两帧）----
      if (hasArt) {
        this.addPanel(L, x, y, artW, artH, { fill: UI.box, fillAlpha: 0.5, radius: Math.max(8, UI.boxR), lineAlpha: 0.07 });
        var tex = null, frames = [0, 9];
        try {
          if (it.portrait.kind === 'hero') {
            tex = A.ensureHeroTexture(this, it.portrait.key);
            frames = [0, 9];
          } else {
            tex = A.ensureMobTexture(this, it.portrait.key, this.heroLookId);
            frames = [0, 2];
          }
        } catch (e) { tex = null; }
        if (tex) {
          var sc = compact ? 0.86 : 1.0;
          var cx1 = x + artW * 0.32, cx2 = x + artW * 0.72, cy1 = y + artH * 0.62;
          L.add(this.add.image(cx1, cy1, tex, frames[0]).setOrigin(0.5, 1).setScale(sc));
          L.add(this.add.image(cx2, cy1, tex, frames[1]).setOrigin(0.5, 1).setScale(sc));
          // 地面线：两帧站在同一条线上，不然形象会"飘"
          var gl = this.add.graphics();
          gl.lineStyle(1, UI.panelLine, 0.16);
          gl.beginPath(); gl.moveTo(x + 12, cy1 + 1); gl.lineTo(x + artW - 12, cy1 + 1); gl.strokePath();
          L.add(gl);
          L.add(this.add.text(cx1, cy1 + 6, '待机', { fontSize: '10px', color: UI.muted }).setOrigin(0.5, 0));
          L.add(this.add.text(cx2, cy1 + 6, it.portrait.kind === 'hero' ? '出手' : '出手', { fontSize: '10px', color: UI.muted }).setOrigin(0.5, 0));
        }
      }

      // ---- 名称块 ----
      var textX = hasArt ? x + artW + 16 : x;
      var textW = hasArt ? w - artW - 16 : w;
      var nameColor = it.tier ? UI.tier[it.tier] : (it.color || UI.title);
      L.add(this.add.text(textX, y + 4, it.cn || it.name, {
        fontSize: (compact ? 17 : 20) + 'px', color: nameColor, fontStyle: 'bold'
      }).setOrigin(0, 0));
      if (it.cn && it.cn !== it.name) {
        L.add(this.add.text(textX, y + (compact ? 26 : 30), it.name, {
          fontSize: '11px', color: UI.muted
        }).setOrigin(0, 0));
      }
      if (it.tag) {
        L.add(this.add.text(textX, y + (compact ? 42 : 50), it.tag, {
          fontSize: (compact ? 11 : 12) + 'px', color: UI.sub, wordWrap: wrapCN(textW)
        }).setOrigin(0, 0));
      }
      if (it.active) {
        var ab = this.add.text(textX + textW, y + 6, '● 本层生效中', { fontSize: '11px', color: UI.gold, fontStyle: 'bold' }).setOrigin(1, 0);
        L.add(ab);
      }

      // ---- 字段行：标签（沉色，右对齐） + 值（正文色），与死亡结算面板同一套节奏 ----
      // 字段行是并排画在形象卡**右边**的（textX = x + artW + 16），所以不该按形象卡的高度
      // 往下推。原来推了整整 138px，而手机横屏下整个详情区只有 212px 高 —— 字段行直接被
      // 推到面板外面，叠在页脚按钮上，这就是「文字叠在一起」的由来。
      // 真正需要避开的只是上面那三行标题块。
      var listTop = y + (compact ? 74 : 86) + 12;
      var bottom = y + h;                          // 详情区下沿：任何内容都不该越过它
      // 标签列宽按这一条里最长的标签现算：原来固定 64px，遇到 7 个字的「两类改成每房间」
      // 就被撑破，标签直接压到右边的值上（这也是「文字叠在一起」的一种）。
      var labelFont = (compact ? 11 : 12) + 'px';
      var labelW = compact ? 64 : 78;
      (it.rows || []).forEach(function (r) {
        // make.text 且不加入显示列表：只为量一次宽度，不会闪一下
        var probe = self.make.text({ x: 0, y: 0, text: r[0], style: { fontSize: labelFont } }, false);
        var wpx = probe.width;
        probe.destroy();
        labelW = Math.max(labelW, Math.min(Math.round(wpx + 10), Math.round(textW * 0.45)));
      });
      var cy = listTop;
      (it.rows || []).forEach(function (r) {
        // 万一还是放不下，宁可少画一行，也不要画到面板外和页脚叠在一起
        if (cy + 18 > bottom) return;
        var lab = self.add.text(textX, cy, r[0], {
          fontSize: labelFont, color: UI.muted, wordWrap: wrapCN(labelW - 6)
        }).setOrigin(0, 0);
        L.add(lab);
        var val = self.add.text(textX + labelW, cy - 1, r[1], {
          fontSize: (compact ? 12 : 13) + 'px', color: UI.text, lineSpacing: 4,
          wordWrap: wrapCN(textW - labelW)
        }).setOrigin(0, 0);
        L.add(val);
        // 行高取标签和值里更高的那个：标签换行成两行时，行高只算值会把下一行压上来
        cy += Math.max(20, Math.max(val.height, lab.height) + 7);
      });

      // ---- 备注 ----
      if (it.note) {
        var noteY = cy + 6;
        var room = bottom - noteY;
        // 留不下两行就干脆不画：画一半会越过面板下沿盖住页脚
        if (room >= 34) {
          var bar = this.add.graphics();
          bar.fillStyle(UI.cAccentLine || 0x5fd0e0, 0.5);
          bar.fillRoundedRect(textX, noteY + 2, 2, Math.max(12, Math.min(56, room - 8)), 1);
          L.add(bar);
          var note = this.add.text(textX + 10, noteY, it.note, {
            fontSize: (compact ? 11 : 12) + 'px', color: UI.accent, lineSpacing: 5,
            wordWrap: wrapCN(textW - 14)
          }).setOrigin(0, 0);
          // 长备注整体缩一点，而不是溢出去 —— 缩放比截断保留的信息多
          if (note.height > room - 4) note.setScale(Math.max(0.74, (room - 4) / note.height));
          L.add(note);
        }
      }
    }

    /** 图鉴条目行的命中（悬停反馈用：返回该行的矩形） */
    hitCodexRow(p) {
      if (!this.codexRects) return null;
      for (var i = 0; i < this.codexRects.length; i++) {
        var r = this.codexRects[i];
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r;
      }
      return null;
    }

    /** 图鉴层内的条目点击（与面板按钮共用一套命中） */
    handleCodexClick(p) {
      if (!this.codexRects || !this.codexRects.length) return false;
      for (var i = 0; i < this.codexRects.length; i++) {
        var r = this.codexRects[i];
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
          var list = this.codexEntries(this.codexTab);
          var idx = this.codexPage * this.codexPerPage() + r.i;
          if (list[idx]) { sfx('click'); this.selectCodexEntry(idx); return true; }
        }
      }
      return false;
    }

    buildShopLayer(sizeW, sizeH) {
      var W = (sizeW && sizeW >= 40) ? sizeW : this.scale.width;
      var H = (sizeH && sizeH >= 40) ? sizeH : this.scale.height;
      if (W < 40 || H < 40) {
        // 尺寸异常（画布被压成 0）：先校正尺寸，下一帧重试
        fixCanvasSize();
        return null;
      }
      // 只看宽度是不够的：手机横屏 800×360 宽度过关、高度只有 360，于是套用桌面尺寸
      // （24px 内边距 + 3 行 70px 的商品格），cellH 被压到 37px，而商品名 / 描述 /
      // 备注叠起来要 40px 以上 —— 文字就叠在一起了。高度也得算进来。
      var mini = W < 700 || H < 520;
      var self = this;
      var L = this.add.container(0, 0).setDepth(2300).setScrollFactor(0);
      this.shopLayer = L;
      this.panelButtons.shop = [];
      this.shopItemRects = [];

      this.addDim(L, W, H);

      var data = this.shopData || { points: this.points, groups: [] };      var groups = data.groups || [];
      if (this.shopTab >= groups.length) this.shopTab = 0;

      var panelW = Math.min(W * 0.92, 920), panelH = Math.min(H * 0.9, 620);
      var panelX = W / 2 - panelW / 2, panelY = H / 2 - panelH / 2;
      this.addPanel(L, panelX, panelY, panelW, panelH, {});

      var pad = mini ? 14 : 24;
      var headY = panelY + pad + (mini ? 4 : 8);
      L.add(this.add.text(panelX + pad, headY, '试炼商店', {
        fontSize: (mini ? 18 : 24) + 'px', color: UI.title, fontStyle: 'bold', letterSpacing: 2
      }).setOrigin(0, 0.5));
      L.add(this.add.text(panelX + panelW - pad, headY,
        '试炼点数 ' + (data.points != null ? data.points : Math.round(this.points)), {
          fontSize: (mini ? 14 : 18) + 'px', color: UI.gold, fontStyle: 'bold'
        }).setOrigin(1, 0.5));

      if (!groups.length) {
        L.add(this.add.text(W / 2, H / 2, '商店数据不可用（请从试炼入口进入）', {
          fontSize: '15px', color: UI.danger
        }).setOrigin(0.5));
        var cw0 = mini ? 100 : 130;
        this.uiButton(L, this.panelButtons.shop, 'close', '返回', W / 2 - cw0 / 2, H / 2 + 60, cw0, mini ? 34 : 40, true);
        return L;
      }

      // 分组标签
      var tabY = headY + (mini ? 30 : 42);
      var tabH = mini ? 28 : 34;
      var tabW = Math.min(mini ? 100 : 136, (panelW - pad * 2 - 16) / Math.max(1, groups.length));
      var tx = panelX + pad;
      groups.forEach(function (g, i) {
        self.uiButton(L, self.panelButtons.shop, 'tab' + i, g.title || ('分组' + (i + 1)), tx, tabY, tabW, tabH, i === self.shopTab);
        tx += tabW + 8;
      });

      var listTop = tabY + tabH / 2 + (mini ? 12 : 18);
      var listBottom = panelY + panelH - pad - (mini ? 44 : 56);
      var cols = mini ? 1 : 2;
      var rows = mini ? 4 : 3;
      var perPage = cols * rows;
      var items = (groups[this.shopTab] && groups[this.shopTab].items) ? groups[this.shopTab].items : [];
      var pageCount = Math.max(1, Math.ceil(items.length / perPage));
      if (this.shopPage >= pageCount) this.shopPage = 0;
      var pageItems = items.slice(this.shopPage * perPage, this.shopPage * perPage + perPage);
      var gapX = 12, gapY = mini ? 8 : 12;
      var cellW = (panelW - pad * 2 - gapX * (cols - 1)) / cols;
      var cellH = Math.min(mini ? 54 : 70, ((listBottom - listTop) - gapY * (rows - 1)) / rows);

      pageItems.forEach(function (it, i) {
        var c = i % cols, r = Math.floor(i / cols);
        var x = panelX + pad + c * (cellW + gapX);
        var y = listTop + r * (cellH + gapY);
        var canBuy = !!it.affordable;
        var owned = !!it.owned;
        self.addPanel(L, x, y, cellW, cellH, {
          radius: UI.boxR,
          fill: owned ? 0x12201a : UI.box,
          fillAlpha: owned ? 0.95 : (canBuy ? 0.96 : 0.72),
          line: owned ? 0x2f5a48 : (canBuy ? UI.cPrimary : 0xffffff),
          lineAlpha: owned ? 0.85 : (canBuy ? 0.32 : 0.08)
        });
        L.add(self.add.text(x + 12, y + (mini ? 13 : 17), it.label || '—', {
          fontSize: (mini ? 12 : 15) + 'px', fontStyle: 'bold',
          color: owned ? '#8fd8b0' : (canBuy ? '#ffffff' : '#9aa0b0')
        }).setOrigin(0, 0.5));
        L.add(self.add.text(x + 12, y + (mini ? 30 : 38), it.desc || '', {
          fontSize: (mini ? 10 : 12) + 'px', color: UI.muted
        }).setOrigin(0, 0.5));
        L.add(self.add.text(x + cellW - 12, y + (mini ? 13 : 17),
          it.tag || (owned ? '已拥有' : (it.price + ' 点')), {
            fontSize: (mini ? 12 : 15) + 'px', fontStyle: 'bold',
            color: owned ? '#8fd8b0' : (canBuy ? UI.gold : UI.muted)
          }).setOrigin(1, 0.5));
        if (it.note) {
          L.add(self.add.text(x + cellW - 12, y + (mini ? 31 : 39), it.note, {
            fontSize: (mini ? 9 : 11) + 'px', color: UI.muted
          }).setOrigin(1, 0.5));
        }
        self.shopItemRects.push({ id: it.id, x: x, y: y + cellH / 2, w: cellW, h: cellH, pad: 0 });
      });

      if (!pageItems.length) {
        L.add(this.add.text(W / 2, (listTop + listBottom) / 2, '该分组暂无可购买的商品', {
          fontSize: '14px', color: UI.muted
        }).setOrigin(0.5));
      }

      var ctrlY = panelY + panelH - pad - (mini ? 8 : 10);
      if (pageCount > 1) {
        var pw = mini ? 36 : 44, ph = mini ? 26 : 32;
        this.uiButton(L, this.panelButtons.shop, 'prev', '◀', panelX + pad, ctrlY, pw, ph, false);
        this.uiButton(L, this.panelButtons.shop, 'next', '▶', panelX + pad + pw + 8, ctrlY, pw, ph, false);
        L.add(this.add.text(panelX + pad + pw * 2 + 22, ctrlY,
          '第 ' + (this.shopPage + 1) + ' / ' + pageCount + ' 页 · 共 ' + items.length + ' 项', {
            fontSize: (mini ? 11 : 13) + 'px', color: UI.muted
          }).setOrigin(0, 0.5));
      }
      var closeW = mini ? 96 : 130, closeH = mini ? 32 : 38;
      this.uiButton(L, this.panelButtons.shop, 'close',
        this.deathOpen ? '返回结算' : (this.mapOpen ? '返回地图' : '返回战斗'),
        panelX + panelW - pad - closeW, ctrlY, closeW, closeH, true);
      return L;
    }

    // ---------- 确认框（退出试炼二次确认）----------
    askQuit(msg) {
      if (this.confirmOpen) return;
      this.confirmOpen = true;
      this._confirmMsg = msg || '确认退出试炼？';
      if (this.running) {
        this._pausedForConfirm = true;
        try { this.physics.world.pause(); } catch (e) { /* 忽略 */ }
        this.attacking = false;
        this.diving = false;
        this.isCharging = false;
        if (this.chargeRing) this.chargeRing.setVisible(false);
        if (this.hero) this.hero.setVelocity(0, 0);
      }
      if (this.touchUI) this.touchUI.setVisible(false);
      this.buildConfirmLayer();
      sfx('click');
    }

    buildConfirmLayer(sizeW, sizeH) {
      var W = (sizeW && sizeW >= 40) ? sizeW : this.scale.width;
      var H = (sizeH && sizeH >= 40) ? sizeH : this.scale.height;
      if (W < 40 || H < 40) return null;
      var mini = W < 700;
      var L = this.add.container(0, 0).setDepth(2400).setScrollFactor(0);
      this.confirmLayer = L;
      this.panelButtons.confirm = [];

      this.addDim(L, W, H, 0.78);
      var bw = Math.min(W * 0.86, 420), bh = mini ? 158 : 176;
      this.addPanel(L, W / 2 - bw / 2, H / 2 - bh / 2, bw, bh, {});
      L.add(this.add.text(W / 2, H / 2 - (mini ? 44 : 50), '退出试炼', {
        fontSize: (mini ? 18 : 21) + 'px', color: UI.title, fontStyle: 'bold', letterSpacing: 2
      }).setOrigin(0.5));
      L.add(this.add.text(W / 2, H / 2 - (mini ? 12 : 14), this._confirmMsg || '', {
        fontSize: (mini ? 12 : 14) + 'px', color: UI.text, align: 'center',
        wordWrap: wrapCN(bw - 40)
      }).setOrigin(0.5));

      var btnW = mini ? 116 : 140, btnH = mini ? 36 : 42, gap = 18;
      var by = H / 2 + (mini ? 44 : 52);
      this.uiButton(L, this.panelButtons.confirm, 'no', '继续战斗', W / 2 - btnW - gap / 2, by, btnW, btnH, true);
      this.uiButton(L, this.panelButtons.confirm, 'yes', '确认退出', W / 2 + gap / 2, by, btnW, btnH, false);
      return L;
    }

    confirmYes() {
      var wasDead = this.heroDead;
      this.closeConfirm();
      this.finishRun(wasDead ? 'dead' : 'manual');
    }

    confirmNo() { this.closeConfirm(); }

    closeConfirm() {
      this.confirmOpen = false;
      this.destroyLayer('confirmLayer');
      if (this.panelButtons) this.panelButtons.confirm = [];
      if (this._pausedForConfirm) {
        this._pausedForConfirm = false;
        if (!this.mapOpen && !this.shopOpen && !this.deathOpen) {
          try { this.physics.world.resume(); } catch (e) { /* 忽略 */ }
        }
      }
      if (this.touchUI) this.touchUI.setVisible(this._lastInputWasTouch === true);
    }

    // ============================================================
    //  画面内控件：血条组件 + 按钮组件
    // ============================================================

    /**
     * 血条组件（轨道 + 语义色渐变填充 + 掉血残影 + 可选辉光）
     * 数值变化按 CSS transition 的节奏补间；静止帧只做位置同步，不产生计算。
     */
    createMeter(opts) {
      opts = opts || {};
      var trackH = opts.h || 7;
      var fillH = Math.max(3, trackH - 2);
      var key = opts.key || 'hp';
      var from = opts.from || UI.hpFrom, to = opts.to || UI.hpTo;
      var m = {
        key: key, from: from, to: to, trackH: trackH, fillH: fillH,
        tint: opts.tint != null ? opts.tint : UI.cPlain,
        x: 0, y: 0, w: 0, value: 1, shown: 1, trail: 1,
        track: null, glow: null, trailImg: null, fill: null, dot: null
      };
      m.bodyTex = barTexture(this, key, fillH, 64, from, to);
      // 残影统一用生命色：任何血条上都能直接读出「刚掉了多少」
      m.trailTex = (key === 'hp') ? m.bodyTex : barTexture(this, 'hp', fillH, 64, UI.hpFrom, UI.hpTo);
      if (opts.track !== false) {
        m.track = this.add.image(0, 0, trackTexture(this, trackH, 64, m.tint)).setOrigin(0, 0.5);
      }
      if (opts.glow) {
        m.glow = this.add.image(0, 0, glowTexture(this)).setOrigin(0.5, 0.5)
          .setTint(opts.glowTint != null ? opts.glowTint : UI.cPrimary).setAlpha(0.4);
      }
      if (opts.trail !== false) {
        m.trailImg = this.add.image(0, 0, m.trailTex).setOrigin(0, 0.5).setAlpha(0.38);
      }
      m.fill = this.add.image(0, 0, m.bodyTex).setOrigin(0, 0.5);
      return m;
    }

    /** 组成一个血条的显示对象（按绘制先后返回，便于按顺序入容器） */
    meterParts(m) {
      var out = [];
      if (m.glow) out.push(m.glow);
      if (m.track) out.push(m.track);
      if (m.trailImg) out.push(m.trailImg);
      out.push(m.fill);
      return out;
    }

    /** 血条几何布局（可逐帧调用：只有宽度变化才重建纹理） */
    placeMeter(m, x, y, w) {
      w = Math.max(4, Math.round(w));
      m.x = x; m.y = y;
      if (m.w !== w) {
        m.w = w;
        m.bodyTex = barTexture(this, m.key, m.fillH, w, m.from, m.to);
        m.fill.setTexture(m.bodyTex).setDisplaySize(w, m.fillH);
        if (m.key !== 'hp') m.trailTex = barTexture(this, 'hp', m.fillH, w, UI.hpFrom, UI.hpTo);
        if (m.trailImg) m.trailImg.setTexture(m.trailTex).setDisplaySize(w, m.fillH);
        if (m.track) m.track.setTexture(trackTexture(this, m.trackH, w, m.tint)).setDisplaySize(w, m.trackH);
      }
      if (m.track) m.track.setPosition(x, y);
      if (m.glow) m.glow.setPosition(x + w / 2, y).setDisplaySize(w * 1.1, m.trackH * 3.4);
      this.paintMeter(m);
    }

    /**
     * 「贴在条右侧」的文字该放在哪（生命值 / 体力 / 狂怒）
     * ------------------------------------------------------------
     * 不能记成布局时算死的坐标（x0 + barW + 10）：布局编辑器可以把条缩放到 20%~250%，
     * 条的实际右边缘一变，那个固定坐标就留在原地 —— 数字和条之间裂开一大截，
     * 玩家看到的就是「狂怒进度不固定在狂怒条旁边」。
     * gap 里已经含了玩家自定义的横向偏移（见 applyCustomLayout）。
     */
    meterTextX(meter, gap) {
      var tr = meter && meter.track;
      if (!tr) return null;
      var dw = (tr.displayWidth != null && tr.displayWidth > 0) ? tr.displayWidth : tr.width;
      return tr.x + dw + (gap == null ? 10 : gap);
    }

    /** 数值同步（只在数值变化时调用，不逐帧） */
    setMeterValue(m, v) {
      var nv = clamp(v, 0, 1);
      if (nv < m.shown) m.trail = Math.max(m.trail, m.shown);   // 掉血：残影留在原处慢慢收
      else m.trail = Math.max(m.trail, nv);
      m.value = nv;
      if (m.glow) m.glow.setAlpha(0.34 * (0.35 + 0.65 * nv));
    }

    /** 补间 + 濒危脉冲（逐帧） */
    updateMeter(m, dt, now) {
      var target = m.value;
      if (m.shown !== target) {
        m.shown += (target - m.shown) * Math.min(1, dt / 110);
        if (Math.abs(m.shown - target) < 0.0015) m.shown = target;
      }
      if (m.trail > m.shown) {
        m.trail += (m.shown - m.trail) * Math.min(1, dt / 340);
        if (m.trail - m.shown < 0.0015) m.trail = m.shown;
      } else if (m.trail !== m.shown) {
        m.trail = m.shown;
      }
      var crit = target > 0 && target <= 0.28;
      var pulse = crit ? 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(now / 150)) : 1;
      if (m._pulse !== pulse) {
        m._pulse = pulse;
        m.fill.setAlpha(pulse);
        if (m.trailImg) m.trailImg.setAlpha(0.38 * pulse);
      }
      this.paintMeter(m);
    }

    /** 血条绘制：位置 + 裁剪（1:1 纹理，裁剪即像素，不产生缩放失真） */
    paintMeter(m) {
      var vis = m.visible !== false;
      var w = m.w, shown = clamp(m.shown, 0, 1), trail = clamp(m.trail, 0, 1);
      var texW = Math.max(8, Math.ceil(w / 8) * 8);
      var dw = w * shown, dtr = w * trail, r = m.fillH / 2;
      if (dw > 0.6 && dw < r * 1.7) {
        // 极低血量：只留一个圆头，避免出现方角碎片
        m.fill.setVisible(false);
        var dot = this.ensureMeterDot(m);
        dot.setVisible(vis).setPosition(m.x, m.y).setDisplaySize(Math.max(1, dw), m.fillH);
      } else {
        if (m.dot && m.dot.visible) m.dot.setVisible(false);
        m.fill.setVisible(vis && dw > 0.6);
        if (dw > 0.6) {
          m.fill.setPosition(m.x, m.y).setCrop(0, 0, Math.max(1, dw * texW / w), m.fillH);
        }
      }
      if (m.trailImg) {
        if (vis && dtr > dw + 0.6) {
          m.trailImg.setVisible(true).setPosition(m.x, m.y)
            .setCrop(0, 0, Math.max(1, dtr * texW / w), m.fillH);
        } else if (m.trailImg.visible) {
          m.trailImg.setVisible(false);
        }
      }
    }

    /** 极低血量的圆头（懒创建：正常血量不占显示对象） */
    ensureMeterDot(m) {
      if (!m.dot) {
        m.dot = this.add.circle(0, 0, Math.max(2, m.fillH / 2),
          parseInt(m.from.replace('#', ''), 16), 1).setOrigin(0, 0.5).setDepth(9);
      }
      return m.dot;
    }

    /** 整条血条显示 / 隐藏 */
    setMeterVisible(m, v) {
      v = !!v;
      if (m.visible === v) return;
      m.visible = v;
      if (m.glow) m.glow.setVisible(v);
      if (m.track) m.track.setVisible(v);
      this.paintMeter(m);
    }

    /** 销毁整条血条（离开房间时回收，避免残留显示对象） */
    destroyMeter(m) {
      if (!m) return;
      ['glow', 'track', 'trailImg', 'fill', 'dot'].forEach(function (k) {
        if (m[k]) { m[k].destroy(); m[k] = null; }
      });
      m.visible = false;
    }

    /**
     * 一排常驻胶囊按钮的布局
     * ------------------------------------------------------------
     * 每颗按钮先在「未缩放」状态下量一次原生宽度，按它分到一个固定槽位；
     * 位置 = 槽位中心，缩放 = 改绘制尺寸。这样编辑器里把某一颗改小或隐藏，
     * 不会把它右边的按钮挤走 —— 「一颗一颗单独调」才成立。
     */
    layoutPillRow(btns, x0, by, bh, gapX) {
      var self = this;
      (btns || []).forEach(function (b) {
        if (!b || !b.gfx) return;
        b.baseH = bh;
        b._baseFont = Math.round(clamp(bh * 0.42, 11, 16));
        // 量原生宽度：临时把缩放 / 透明当作默认，免得量到缩放后的值
        var ku = b.userScale, ka = b.userAlpha;
        b.userScale = 1; b.userAlpha = 1; b.h = bh; b.w = 24;
        self.paintButton(b);
        b.baseW = Math.max(24, b.w);
        b.userScale = ku; b.userAlpha = ka;
      });
      var bx = x0;
      (btns || []).forEach(function (b) {
        if (!b || !b.gfx) return;
        b.slotCenter = bx + b.baseW / 2;
        bx += b.baseW + gapX;
      });
      (btns || []).forEach(function (b) {
        if (!b || !b.gfx) return;
        b.y = by;
        self.applyButtonStyle(b, b.userScale || 1,
          b.userAlpha == null ? 1 : b.userAlpha, b._hidden);
      });
      return bx - gapX;   // 行尾 x
    }

    /**
     * 按钮的样式落地（位置之外的缩放 / 透明度 / 显隐）
     * ------------------------------------------------------------
     * 按钮不能走 setScale：底板是 craftButton 用绝对坐标画在 Graphics 上的，
     * 缩放会以 (0,0) 为原点把整颗按钮拖到画面左上角去。
     * 所以缩放落在「数据尺寸」上（baseH / baseW × s），再重绘 ——
     * 字号、内边距、命中矩形都会跟着等比收放。
     */
    applyButtonStyle(b, s, a, hide) {
      if (!b || !b.gfx) return;
      s = (s > 0) ? s : 1;
      a = (a == null) ? 1 : a;
      b.userScale = s;
      b.userAlpha = a;
      b._hidden = !!hide;
      b.h = Math.max(12, Math.round((b.baseH || b.h) * s));
      b.w = Math.max(16, Math.round((b.baseW || b.w) * s));
      if (b.slotCenter != null) b.x = Math.round(b.slotCenter - b.w / 2);
      b.gfx.setVisible(!hide).setAlpha(a);
      if (b.icon) b.icon.setVisible(!hide);
      if (b.text) b.text.setVisible(!hide);
      this.paintButton(b);
    }

    /** 画面内按钮（统一控件）
     *   shape 'pill'：悬浮在战场之上的常驻控件（对齐 .trial-ghost-btn）
     *   shape 'card'：面板之内的动作按钮（对齐 .trial-action-btn）
     * 状态（常态 / 悬停 / 按下）由 paintButton 重绘，命中仍走矩形命中列表。
     */
    craftButton(layer, list, o) {
      var tint = o.variant === 'primary' ? UI.cPrimary
        : o.variant === 'danger' ? UI.cDanger
          : o.variant === 'gold' ? UI.cGold
            : o.variant === 'ghost' ? UI.cGhost : UI.cPlain;
      var color = o.variant === 'primary' ? '#d8fff0'
        : o.variant === 'danger' ? UI.danger
          : o.variant === 'gold' ? UI.gold
            : o.variant === 'ghost' ? UI.accent : UI.sub;
      if (o.color) color = o.color;
      var h = o.h;
      var g = this.add.graphics();
      var txt = this.add.text(0, 0, o.label, {
        fontSize: Math.round(clamp(h * 0.42, 11, 16)) + 'px',
        color: color, fontStyle: 'bold'
      }).setOrigin(0, 0.5);
      var ico = o.icon ? this.add.image(0, 0, 'rt_ico_' + o.icon).setOrigin(0, 0.5).setTint(tint) : null;
      var btn = {
        action: o.action, id: o.action, label: o.label, x: o.x, y: o.y, w: o.w, h: h, pad: 3,
        shape: o.shape || 'card', variant: o.variant || 'plain', tint: tint,
        gfx: g, text: txt, icon: ico, state: 'normal', disabled: !!o.disabled
      };
      layer.add(ico ? [g, ico, txt] : [g, txt]);
      list.push(btn);
      this.paintButton(btn);
      return btn;
    }

    /** 按钮绘制：底板 / 语义色薄涂 / 细描边 / 内容居中（状态变化时调用） */
    paintButton(b) {
      if (!b || !b.gfx || !b.gfx.scene) return;
      var g = b.gfx, st = b.state, a = b.disabled ? 0.38 : 1;
      var x = b.x, y = b.y, h = b.h;
      var hover = st === 'hover', down = st === 'down';
      // 常驻胶囊被编辑器缩放过：字号 / 内边距 / 图标都得跟着缩放走，
      // 否则缩小后文字与图标是固定像素、会把按钮撑成又矮又宽的一条。
      // us === 1 时下面每个值都与原来自动定宽的结果完全一致。
      var us = (b.userScale > 0) ? b.userScale : 1;
      if (b.shape === 'pill' && b._baseFont) {
        var fs = Math.max(8, Math.round(b._baseFont * us));
        if (parseInt(b.text.style.fontSize, 10) !== fs) b.text.setFontSize(fs);
      }
      var r = b.shape === 'pill' ? h / 2 : Math.max(3, Math.min(6, Math.round(h * 0.12)));
      var padX = Math.max(Math.round(10 * us), Math.round(h * 0.5));
      var icoW = b.icon ? Math.max(8, Math.round(16 * us)) : 0;
      var gap = b.icon ? Math.max(4, Math.round(7 * us)) : 0;
      var need = Math.round(b.text.width + padX * 2 + icoW + gap);
      if (b.w < need && b.shape === 'pill') b.w = need;
      var w = b.w;
      var content = icoW + gap + b.text.width;
      var cx = x + Math.max(padX, Math.round((w - content) / 2));
      var lift = down ? 1 : (hover ? -1 : 0);
      var top = y - h / 2 + lift;
      // 编辑器设的透明度要乘进来（paintButton 会重设 text/icon 的 alpha，
      // 不乘的话文字会被顶回全不透明，只剩底板是淡的）
      var ua = (b.userAlpha == null) ? 1 : b.userAlpha;
      a *= ua;

      g.clear();
      var on = !!b.on;   // 当前生效（例如商店已打开）
      if (b.shape === 'pill') {
        // 战场之上的常驻控件：先铺暗底保证可读，再叠语义色
        g.fillStyle(UI.box, (hover ? 0.9 : down ? 0.94 : 0.78) * a);
        g.fillRoundedRect(x, top, w, h, r);
        g.fillStyle(b.tint, (b.variant === 'plain' ? 0.07
          : (down ? 0.3 : hover ? 0.2 : (on ? 0.22 : 0.12))) * a);
        g.fillRoundedRect(x, top, w, h, r);
        g.lineStyle(1, b.tint, (b.variant === 'plain' ? 0.18
          : (down ? 0.72 : hover ? 0.5 : (on ? 0.62 : 0.28))) * a);
        g.strokeRoundedRect(x + 0.5, top + 0.5, w - 1, h - 1, Math.max(1, r - 0.5));
      } else {
        // 面板之内的动作：白底微提 + 语义色薄涂
        g.fillStyle(0xffffff, (hover ? 0.09 : down ? 0.13 : 0.035) * a);
        g.fillRoundedRect(x, top, w, h, r);
        if (b.variant !== 'plain') {
          g.fillStyle(b.tint, (down ? 0.3 : hover ? 0.2 : 0.1) * a);
          g.fillRoundedRect(x, top, w, h, r);
        }
        g.lineStyle(1, b.variant === 'plain' ? 0xffffff : b.tint,
          (hover ? 0.34 : b.variant === 'plain' ? 0.07 : 0.2) * a);
        g.strokeRoundedRect(x + 0.5, top + 0.5, w - 1, h - 1, Math.max(1, r - 0.5));
      }
      if (b.icon) {
        // 图标纹理本来就是 16×16，所以 us=1 时这个 setDisplaySize 不会改变外观，
        // 但它保证了「缩小后再改回 100%」能把图标恢复原尺寸。
        b.icon.setDisplaySize(icoW, icoW);
        b.icon.setPosition(cx, y + lift).setAlpha(a);
        b.text.setPosition(cx + icoW + gap, y + lift).setAlpha(a);
      } else {
        b.text.setPosition(cx, y + lift).setAlpha(a);
      }
    }

    setButtonState(b, state) {
      if (!b || !b.gfx || !b.gfx.scene || b.state === state) return;
      b.state = state;
      this.paintButton(b);
    }

    /** 常驻胶囊的「当前生效」状态（如商店已打开），与悬停 / 按压状态正交 */
    setHudButtonOn(id, on) {
      var b = (this.hudButtons || []).filter(function (x) { return x.id === id; })[0];
      if (!b || !!b.on === !!on) return;
      b.on = !!on;
      this.paintButton(b);
    }

    /** 命中测试（与 handleUiClick 同一优先级，保证「点亮的就是会响应的」） */
    uiHitTest(p) {
      var pb = this.panelButtons || {};
      // 二次确认是严格模态：其余控件一律不响应
      if (this.confirmOpen) return this.hitBtnList(p, pb.confirm);
      // 常驻功能按钮在面板打开时已被收起，命中也要跳过（与 handleUiClick 一致）
      if (!this.panelOverlayOpen()) {
        var hb = this.hitBtnList(p, this.hudButtons);
        if (hb) return hb;
      }
      if (this.shopOpen) return this.hitBtnList(p, pb.shop) || this.hitBtnList(p, this.shopItemRects);
      if (this.codexOpen) return this.hitBtnList(p, pb.codex) || this.hitCodexRow(p);
      if (this.deathOpen) return this.hitBtnList(p, pb.death);
      if (this.mapOpen) return this.hitBtnList(p, pb.map);
      // 技能胶囊画面上被面板盖住 → 命中排在面板之后，避免「看不见却点得到」
      var sb2 = this.hitBtnList(p, this.skillButtons);
      if (sb2) return sb2;
      return null;
    }

    /** 悬停状态（鼠标设备；触摸设备不产生悬停） */
    updateUiHover(p) {
      // 图鉴词条行：单独维护高亮（它不是胶囊按钮，没有 gfx 可复用）
      if (this.codexOpen) {
        var row = this.hitCodexRow(p);
        if (row !== this._hoverRow) {
          if (this._hoverRow) this.paintCodexRow(this._hoverRow, false);
          this._hoverRow = row;
          if (row) this.paintCodexRow(row, true);
        }
      } else if (this._hoverRow) {
        this.paintCodexRow(this._hoverRow, false);
        this._hoverRow = null;
      }
      var b = this.uiHitTest(p) || null;
      if (b === this._hoverBtn) return;
      if (this._hoverBtn) this.setButtonState(this._hoverBtn, 'normal');
      this._hoverBtn = (b && b.gfx && b.gfx.scene) ? b : null;
      if (this._hoverBtn) this.setButtonState(this._hoverBtn, 'hover');
    }

    /** 按压反馈：按下时轻微下沉，松手回到常态 */
    flashButtonDown(b) {
      if (!b || !b.gfx || !b.gfx.scene) return;
      var self = this;
      this.setButtonState(b, 'down');
      this.time.delayedCall(130, function () {
        self.setButtonState(b, b === self._hoverBtn ? 'hover' : 'normal');
      });
    }

    /** 面板动作按钮（面板内统一样式，保留旧签名以便各处调用） */
    uiButton(layer, list, action, label, x, y, w, h, primary) {
      return this.craftButton(layer, list, {
        action: action, label: label, x: x, y: y, w: w, h: h,
        shape: 'card', variant: primary ? 'primary' : 'plain'
      });
    }

    // ---------- 关卡（每个关卡 = 地图上的一个房间）----------

    /**
     * 顶部 HUD 的下沿（左侧那一列：属性面板 → 技能胶囊 → 常驻按钮行）
     * ------------------------------------------------------------
     * 短屏手机横屏（H≈360）时它能到 y≈157 —— 屏幕高度的 44%。
     * 而平台带的 y 由 max(groundY-350, H*0.14) 决定，360 上就是 50~154：
     * **整个平台带都落在 HUD 层里**，这就是「跳上台阶看不见自己、也看不见上面」
     * 的物理原因（桌面 H=720 时平台带在 274~514、HUD 只到 179，所以只有小屏中招）。
     */
    hudSafeTop() {
      var b = this._hudRowBottom;
      if (!b || !isFinite(b)) b = this.statPanelMetrics(this.scale.width).bottom + 30;
      return Math.round(b + 8);
    }

    /**
     * 相机边界：纵向留出跟随余量
     * ------------------------------------------------------------
     * 原来写死 setBounds(0, 0, levelWidth, H)：边界高度 == 视口高度 → scrollY 恒为 0，
     * 相机纵向一点都不能动（既谈不上"跟随"，跳上台阶也看不见人）。
     * 现在留「安全线 + 大半个屏高」的余量，纵向跟随（含满蓄力跳）都有空间走。
     */
    applyCameraBounds() {
      var H = this.scale.height;
      var head = this.hudSafeTop() + Math.round(H * 0.8);
      this._camHeadroom = head;
      this.physics.world.setBounds(0, -600, this.levelWidth, H + 1200);
      this.cameras.main.setBounds(0, -head, this.levelWidth, H + head);
    }

    /**
     * 相机跟随参数：纵向死区 + 跟随偏移
     * ------------------------------------------------------------
     * 目标：相机跟着主角上下左右动，而主角**始终整段落在屏幕里、且不缩到 HUD 后面**。
     *
     * 死区是居中于屏幕的（上沿 = H/2 − dz/2），小屏上做不到「上沿 ≥ 安全线 + 身高」
     * （H=360 时居中上沿最多到 180，而需要 221）——所以叠加**跟随偏移**：
     * setFollowOffset(0, offY) 让「参与死区判定的点」比主角高 offY，
     * 于是主角实际被允许出现的屏幕区间整体下移。合成后：
     *     可站区间 = [ offY + H/2 − dz/2 , offY + H/2 + dz/2 ]
     * 两条硬约束：
     *   ① 上沿 ≥ 安全线 + 可视身高 + 4   → 头顶永远不在 HUD 后面
     *   ② 下沿 ≤ 屏幕高 − 28             → **脚底永远在屏幕内**
     * ② 是第一版漏掉的，真机上被它坑得很惨：区间下沿跑到屏幕外（370 > 334）时，
     * 死区失去"把镜头拉回来"的能力 —— 镜头被台阶顶上去后，人落地了镜头也不下来，
     * 表现为「站在地上只能看到头以上的画面，身体和地面全在屏幕外」（实测 scrollY=−132）。
     * 所以先把 dz 压到「整段区间放得进屏幕」，再据此反算 offY。
     */
    applyCameraFollow() {
      var cam = this.cameras.main;
      if (!cam) return;
      var H = this.scale.height;
      var hh = ((this.hero && this.hero.displayHeight) || 64) * 0.82;
      var bandTop = Math.round(this.hudSafeTop() + hh + 4);   // 约束①
      var bandBottomMax = H - 28;                              // 约束②
      var dz = Math.max(60, Math.min(Math.round(H * 0.45), bandBottomMax - bandTop));
      var offY = Math.round(bandTop - (H / 2 - dz / 2));
      cam.setDeadzone(this.scale.width * 0.3, dz);
      cam.setFollowOffset(0, offY);
      this._camFollowOffsetY = offY;
      this._camBand = [bandTop, Math.round(offY + H / 2 + dz / 2)];
    }

    buildLevel(room) {
      this.clearLevel();
      if (room) this.roomNode = room;
      var node = this.roomNode || { type: 'enemy', row: 1, col: 1 };
      if (this.floorMap) this.floor = this.floorMap.floor;

      var W = this.scale.width, H = this.scale.height;
      this.groundY = H - 96;
      // 记住「这一关是按什么高度铺的」：onResize 靠它判断画布是否变了尺寸、
      // 要不要按新高度重建房间（见那里的说明）。
      this._builtH = H;
      // 房间长度：Boss 房间更宽阔；宝箱 / 祭坛房间「拿完就走」，只留一屏出头
      // （原来的 Math.max(W*2, base) 会把缩短量整个吃掉 —— 这也是之前宝箱房跑半天的原因）
      var base = 1400 + this.floor * 140;
      var nonCombat = (node.type === 'treasure' || node.type === 'shrine');
      if (node.type === 'boss') base += 380;
      if (nonCombat) base = Math.round(W * 0.95) + 260;
      this.levelWidth = Math.max(nonCombat ? Math.round(W * 0.85) : W * 2, base);

      // 相机边界与纵向余量：见 applyCameraBounds 的说明（短屏修「跳上台阶看不见」）
      this.applyCameraBounds();

      this.layoutFloor();
      this.spawnPlatforms(this.floor);
      this.spawnEnemies(node.type);
      this.spawnRoomGoal(node.type);
      this.spawnPortal();

      this.hero.setPosition(140, this.groundY - 80);
      this.hero.setVelocity(0, 0);
      this.hero.setAlpha(1).setAngle(0).setVisible(true);
      this.hero.body.checkCollision.none = false;
      this.heroDead = false;
      this.portalOpen = false;
      // 重置蓄力状态
      this.isCharging = false;
      this.chargeRatio = 0;
      this.coyoteUntil = 0;
      // 进房重置闪避状态（体力保留）
      this.dodging = false;
      this.dodgeReadyAt = 0;
      // 英雄被动：首击 / 首杀每房间各一次；开战护盾类被动在此生效
      this._roomFirstHit = false;
      this._roomFirstKill = false;
      // 诅咒「虚弱 / 迟钝」在同一房间内累积，进新房间时恢复到本局的基础值
      if (this.curses && (this.curses.indexOf('虚弱') >= 0 || this.curses.indexOf('迟钝') >= 0)) {
        if (this._baseAtk == null) { this._baseAtk = this.hero.attack; this._baseDodge = this.hero.dodge; }
        this.hero.attack = this._baseAtk;
        this.hero.dodge = this._baseDodge;
      }
      this._baseAtk = this.hero.attack;
      this._baseDodge = this.hero.dodge;
      // 腐化脉冲从进房开始重新计时
      this.pulseAt = this.time.now + PULSE.period;
      if (this.skillProjectiles && this.skillProjectiles.length) {
        this.skillProjectiles.forEach(function (a) { if (a) a.destroy(); });
        this.skillProjectiles = [];
      }
      if (this.shots && this.shots.length) {
        this.shots.forEach(function (a) { if (a) a.destroy(); });
        this.shots = [];
      }
      this.applyRoomStartPassive();
      if (this.chargeRing) this.chargeRing.setVisible(false);

      // 相机：横向 0.12 平滑跟随；纵向**同样跟随**（lerpY 也是 0.12），
      // 再叠加 applyCameraFollow 的死区 + 跟随偏移，让他在跟随范围内不缩到 HUD 后面。
      this.cameras.main.startFollow(this.hero, true, 0.12, 0.12);
      this.applyCameraFollow();
      // 进房立刻对齐到主角，别把上一房间的镜头偏移带过来
      this.cameras.main.centerOn(this.hero.x, this.hero.y);
      this.refreshHud();
      // 无战斗房间（宝箱/祭坛）：直接判定清空条件
      var self = this;
      this.time.delayedCall(400, function () { if (self.running) self.checkFloorClear(); });
      // 进房过渡：从暗处淡入
      this.cameras.main.fadeIn(240, 4, 4, 14);
    }

    clearLevel() {
      var self = this;
      this.enemies.forEach(function (e) {
        if (!e) return;
        if (e.throwFx) { e.throwFx.destroy(); e.throwFx = null; }
        if (e.sprite) e.sprite.destroy();
        if (e.meter) self.destroyMeter(e.meter);
        if (e.nameLbl) e.nameLbl.destroy();
        if (e.atkLbl) e.atkLbl.destroy();
      });
      this.enemies = [];
      this.nearestEnemy = null;
      if (this.targetPanel) this.targetPanel.setVisible(false);
      this.projectiles.forEach(function (p) { if (p) p.destroy(); });
      this.projectiles = [];
      if (this.skillProjectiles) {
        this.skillProjectiles.forEach(function (a) { if (a) a.destroy(); });
        this.skillProjectiles = [];
      }
      if (this.shots) {
        this.shots.forEach(function (a) { if (a) a.destroy(); });
        this.shots = [];
      }
      this.clearCrystals();
      this.platformPerches = [];
      this.platformTiles.forEach(function (t) { t.destroy(); });
      this.platformTiles = [];
      if (this.platformStrips) {
        this.platformStrips.forEach(function (s) { s.destroy(); });
        this.platformStrips = [];
      }
      // 飘字归还对象池（不残留到下一个房间）
      if (this.floats) {
        var pool = this.floatPool;
        this.floats.forEach(function (t) {
          t.setVisible(false);
          if (pool.length < 60) pool.push(t); else t.destroy();
        });
        this.floats = [];
      }
      if (this.portal) { this.portal.destroy(); this.portal = null; }
      if (this.roomGoal) {
        if (this.roomGoal.obj) this.roomGoal.obj.destroy();
        if (this.roomGoal.label) this.roomGoal.label.destroy();
        this.roomGoal = null;
      }
      this.boss = null;
      this.setMeterVisible(this.bossMeter, false);
      this.bossName.setVisible(false);
      this.bossText.setVisible(false);
    }

    layoutFloor() {
      var need = Math.ceil(this.levelWidth / 64) + 4;
      while (this.groundTiles.length < need) {
        var t = this.solids.create(this.groundTiles.length * 64 + 32, 0, TEX.ground);
        t.setOrigin(0.5, 0.5);
        t.setVisible(false);   // 只作碰撞体，视觉由整条地砖承担（降低绘制调用）
        t.refreshBody();
        this.groundTiles.push(t);
      }
      var y = this.groundY + 32;
      this.groundTiles.forEach(function (t, i) {
        t.setPosition(i * 64 + 32, y);
        t.refreshBody();
      });
      // 视觉地板：一条 TileSprite 铺满，替代 N 个独立精灵
      if (!this.groundStrip) {
        this.groundStrip = this.add.tileSprite(0, y, 64, 64, TEX.ground).setOrigin(0, 0.5).setDepth(1);
      }
      this.groundStrip.setPosition(0, y);
      this.groundStrip.setSize(this.levelWidth + 128, 64);
    }

    spawnPlatforms(floor) {
      // 非战斗房间（宝箱 / 祭坛）不放那么多平台：走两步就到，别摆障碍
      var nonCombat = this.roomNode && (this.roomNode.type === 'treasure' || this.roomNode.type === 'shrine');
      var count = nonCombat ? 2 : (4 + Math.min(5, Math.floor(floor / 2)));
      var H = this.scale.height;
      // 平台高度限制在满蓄力跳跃可及范围内（离地约 100~350px）
      // 上限为什么是 H*0.14 而不是 H*0.3：手机横屏 H 只有 360，groundY - 350 早就在屏幕
      // 外面了，真正的上限由 H 决定 —— H*0.3 只剩 46px 可用，4~9 段平台全挤进这 46px，
      // 必然叠成一坨。H*0.14 把可用高度翻了一倍多，桌面端（H 大）仍然由 350px 那段说了算。
      var topY = Math.max(this.groundY - 350, H * 0.14);
      var lowY = this.groundY - 110;
      if (lowY < topY + 30) lowY = topY + 30;   // 极矮视口的兜底，别让 rnd(topY, lowY) 反向

      var xMin = this.scale.width * 0.35;
      var xMax = Math.max(this.scale.width * 0.5, this.levelWidth - 260);
      var span = Math.max(120, xMax - xMin);
      var perSlot = span / Math.max(1, count);
      // 平台长度跟着可用空间伸缩：手机横屏水平方向也紧张，
      // 固定 3~6 格时 4 段平均宽度已经超过整段跨度，一样会互相压上来。
      var usable = Math.floor((perSlot - 20) / 64);
      var maxLen = Math.max(2, Math.min(6, usable));
      var minLen = Math.max(2, Math.min(maxLen, 3));

      // 摆放规则：两段平台只要「水平投影挨着」，高度就必须拉开 GAP_Y，
      // 否则玩家看到的是一个台阶、实际是两层碰撞体，踩上去的位置全靠运气。
      // GAP_Y 必须大于「敌人身高 + 平台厚度」：怪物高约 48、平台体厚 20，净空要够 48，
      // 所以中心间距至少要 68 —— 不然会有一只怪卡在两层平台之间，打不到也出不来。
      var GAP_X = 56;
      var GAP_Y = 68;
      var placed = [];

      for (var i = 0; i < count; i++) {
        var spot = null;
        for (var tries = 0; tries < 48 && !spot; tries++) {
          var len = ri(minLen, maxLen);
          var w = len * 64;
          var y = rnd(topY, lowY);
          var left;
          if (tries < 28) {
            // 前大半数尝试限制在自己的槽位里：先保证水平方向自然散开，
            // 而不是等到冲突了再满地图乱找
            var slotStart = xMin + perSlot * i;
            var slotEnd = Math.max(slotStart, slotStart + perSlot - w);
            left = rnd(slotStart, slotEnd);
          } else {
            // 槽里实在放不下（前一段太长，或者槽太窄）才放开全局
            left = rnd(xMin, Math.max(xMin, xMax - w));
          }
          var hit = false;
          for (var k = 0; k < placed.length; k++) {
            var p = placed[k];
            if (left < p.x1 + GAP_X && p.x0 < left + w + GAP_X &&
                Math.abs(y - p.y) < GAP_Y) { hit = true; break; }
          }
          if (!hit) spot = { x0: left, x1: left + w, y: y, len: len };
        }
        // 挤不下就少放一段 —— 叠成一坨比少一段难看得多，跳上去的判定也说不清
        if (!spot) continue;
        placed.push(spot);
        this.spawnPlatformAt(spot.x0, spot.y, spot.len);
      }

      // 保底：**最低的那段平台一定有魂晶** —— 否则一房间的魂晶全在 300px 以上的高处，
      // 玩家可能一颗都拿不到（平台高度实测 131~356px，越高的越要满蓄力）
      if (this.platformPerches.length) {
        var lowest = this.platformPerches.slice().sort(function (a, b) { return b.y - a.y; })[0];
        if (!lowest.crystal) {
          lowest.crystal = true;
          this.spawnCrystal(lowest.x, lowest.y - 26);
        }
      }
    }

    /**
     * 在指定位置铺一段平台
     * left 是平台左边缘（TileSprite 的 x），y 是平台中线。
     * 碰撞体按 64px 一格铺，视觉交给一整条 TileSprite（9 段平台 = 9 次绘制，
     * 而不是 40+ 个精灵）。
     */
    spawnPlatformAt(left, y, len) {
      var w = len * 64;
      for (var j = 0; j < len; j++) {
        var t = this.solids.create(left + 32 + j * 64, y, TEX.platform);
        t.setOrigin(0.5, 0.5);
        t.setVisible(false);   // 碰撞体不可见，视觉交给整段 TileSprite
        t.refreshBody();
        this.platformTiles.push(t);
      }
      var strip = this.add.tileSprite(left, y, w, 64, TEX.platform)
        .setOrigin(0, 0.5).setDepth(2);
      this.platformStrips.push(strip);

      // 平台不再只是"路过的地形"：上面放东西（魂晶），偶尔还站个远程敌人在等你
      var midX = left + w / 2;
      var topY2 = y - 20;
      this.platformPerches.push({ x: midX, y: topY2, len: len, crystal: false });
      if (Math.random() < 0.62) {
        this.spawnCrystal(midX, topY2 - 26);
        this.platformPerches[this.platformPerches.length - 1].crystal = true;
      }
    }

    // ---------- 平台上的魂晶（给平台一个"值得上去"的理由）----------
    spawnCrystal(x, y) {
      var core = this.add.rectangle(x, y, 13, 13, 0x8ad8ff, 1).setDepth(5).setAngle(45);
      core.setStrokeStyle(2, 0xffffff, 0.85);
      var glow = this.add.circle(x, y, 14, 0x8ad8ff, 0.16).setDepth(4);
      var spin = this.tweens.add({ targets: core, angle: 405, duration: 3600, repeat: -1 });
      var bob = this.tweens.add({
        targets: [core, glow], y: y - 6, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
      this.crystals.push({ x: x, y: y, core: core, glow: glow, taken: false, near: false, spin: spin, bob: bob });
    }

    /** 靠近时魂晶放大发亮（"这东西能碰"的可读性提示） */
    paintCrystal(c, near) {
      if (!c || !c.core || !c.core.active) return;
      c.core.setScale(near ? 1.45 : 1);
      c.core.setFillStyle(near ? 0xd8f4ff : 0x8ad8ff, 1);
      c.core.setStrokeStyle(near ? 3 : 2, 0xffffff, near ? 1 : 0.85);
      if (c.glow && c.glow.active) {
        c.glow.setScale(near ? 1.6 : 1);
        c.glow.setFillStyle(0x8ad8ff, near ? 0.34 : 0.16);
      }
    }

    /** 走近魂晶即拾取：按当前状态给最缺的那样（点 / 护盾 / 生命） */
    updateCrystals() {
      var h = this.hero, self = this;
      if (!this.crystals || !this.crystals.length) {
        if (this.crystalHint && this.crystalHint.visible) this.crystalHint.setVisible(false);
        return;
      }
      var hintFor = null;
      this.crystals.forEach(function (c) {
        if (c.taken || !c.core || !c.core.active) return;
        var dx = Math.abs(c.core.x - h.x), dy = Math.abs(c.core.y - (h.y - 26));
        if (dx <= CRYSTAL.pickupX && dy <= CRYSTAL.pickupY) {
          c.taken = true;
          self.takeCrystal(c);
          return;
        }
        // 还没够到但在附近：发亮 + 提示
        var near = dx <= CRYSTAL.nearX && dy <= CRYSTAL.nearY;
        if (near !== c.near) { c.near = near; self.paintCrystal(c, near); }
        if (near && !hintFor) hintFor = c;
      });
      if (this.crystalHint) {
        var show = !!hintFor;
        if (this.crystalHint.visible !== show) this.crystalHint.setVisible(show);
        if (show) this.crystalHint.setPosition(hintFor.core.x, hintFor.core.y + 16);
      }
    }

    takeCrystal(c) {
      var h = this.hero, out = '', color = '#8ad8ff';
      var lowHp = h.hp < h.maxHp * CRYSTAL.lowHpAt;
      var roll = Math.random();
      if (lowHp && roll < 0.6) {
        var heal = Math.max(CRYSTAL.healMin, Math.round(h.maxHp * CRYSTAL.healPct));
        var real = this.healHero(heal, true);
        out = '魂晶 · 生命 +' + (real > 0 ? real : heal); color = '#7fd6a0';
      } else if (roll < 0.5) {
        var g = CRYSTAL.points + this.floor;
        this.points += g; out = '魂晶 · 点数 +' + g; color = '#ffd76a';
      } else {
        this.addShield(CRYSTAL.shield, null); out = '魂晶 · 护盾 +' + CRYSTAL.shield; color = '#5fd0e0';
      }
      this.showFloat(h.x, h.y - 96, out, color, 19);
      sfx('crystal');
      this.spark(c.core.x, c.core.y, 0x8ad8ff);
      // 拾取爆发：双环 + 四散火星，让这一下有分量
      var ring = this.add.circle(c.core.x, c.core.y, 6, 0x8ad8ff, 0.35).setDepth(11);
      ring.setStrokeStyle(2, 0xffffff, 0.9);
      this.tweens.add({ targets: ring, radius: 46, alpha: 0, duration: 260, onComplete: function () { ring.destroy(); } });
      for (var i = 0; i < 4; i++) this.spark(c.core.x + rnd(-16, 16), c.core.y + rnd(-16, 16), 0x8ad8ff);
      if (c.spin) c.spin.remove();
      if (c.bob) c.bob.remove();
      if (c.glow) c.glow.destroy();
      var core = c.core;
      this.tweens.add({
        targets: core, y: core.y - 26, alpha: 0, scaleX: 2, scaleY: 2, duration: 240,
        onComplete: function () { core.destroy(); }
      });
      this.refreshHud();
      return out;
    }

    clearCrystals() {
      if (!this.crystals) return;
      this.crystals.forEach(function (c) {
        if (c.spin) c.spin.remove();
        if (c.bob) c.bob.remove();
        if (c.core) c.core.destroy();
        if (c.glow) c.glow.destroy();
      });
      this.crystals = [];
    }

    /** 按房间类型决定敌人编成 */
    spawnEnemies(roomType) {
      var floor = this.floor;
      var pool = poolForFloor(floor);
      var list = [];
      var i, n;
      var nonCombat = (roomType === 'treasure' || roomType === 'shrine');

      if (roomType === 'treasure' || roomType === 'shrine') {
        // 非战斗房间：没有敌人
      } else if (roomType === 'boss') {
        list.push((floor >= 3 && Math.random() < 0.35) ? 'shadowking' : 'lord');
        if (floor >= 2) list.push(pool[ri(0, pool.length - 1)]);
      } else if (roomType === 'elite') {
        list.push(Math.random() < 0.5 ? 'guard' : 'necro');
        list.push(Math.random() < 0.5 ? 'guard' : 'necro');
        list.push(pool[ri(0, pool.length - 1)]);
      } else if (roomType === 'mirror') {
        n = clamp(1 + Math.floor(floor / 3), 1, 3);
        for (i = 0; i < n; i++) list.push('mimic');
      } else if (roomType === 'start') {
        n = clamp(1 + Math.floor(floor / 3), 1, 3);
        for (i = 0; i < n; i++) list.push(pool[ri(0, pool.length - 1)]);
      } else {
        n = clamp(2 + Math.floor(floor / 2) + ri(0, 2), 2, 7);
        for (i = 0; i < n; i++) list.push(pool[ri(0, pool.length - 1)]);
        if (floor >= 2 && Math.random() < 0.35) list.push(Math.random() < 0.5 ? 'guard' : 'necro');
      }

      var self = this;
      var baseX = this.scale.width + 140;

      // 出生点必须在**所有平台之上**。
      // 地面敌人原来固定用 groundY - 80，而这个高度正好落在平台的碰撞层里：敌人一出生
      // 就嵌在平台中间 —— 卡住不动、打不到、也不掉下来，于是「剩余敌人」永远清不了零。
      // 从平台上方落下，结果只有两种：站在平台顶面，或者落回地面，都正常。
      var platformTopY = self.groundY;
      self.platformTiles.forEach(function (t) { if (t.y < platformTopY) platformTopY = t.y; });
      var dropY = Math.min(self.groundY - 80, platformTopY - 60);

      // 水平铺开：原来 x 是「上一只 + 150~260」累加出来的，idx 越大越容易越过关卡右端，
      // 一旦越过就被塞回同一段区间 —— 几只敌人会叠在同一个点上，看起来像一个怪，
      // 实际是两个，打死一个还有一个。
      var spanStart = self.scale.width + 60;
      var spanEnd = Math.max(spanStart + 40, self.levelWidth - 100);
      var step = (spanEnd - spanStart) / Math.max(1, list.length);

      list.forEach(function (key, idx) {
        var def = ENEMY_TYPES[key];
        if (!def) return;
        var x = idx === 0 ? baseX
          : (spanStart + step * (idx + 0.5) + rnd(-step * 0.25, step * 0.25));
        x = clamp(x, spanStart, spanEnd);
        // 飞行怪的高度随便放都行（它们不与地形碰撞，见 spawnEnemy），
        // 地面怪则从平台上方落下
        var y = def.fly ? rnd(self.scale.height * 0.3, self.groundY - 130) : dropY;
        var e = self.spawnEnemy(key, x, y, floor);
        // 镜像房间：镜像怪按玩家属性成长（越强越难打）
        if (e && key === 'mimic' && roomType === 'mirror') {
          e.maxHp = Math.round(Math.max(36, self.hero.attack * 3 + self.hero.maxHp * 0.45));
          e.hp = e.maxHp;
          e.atk = Math.max(6, Math.round(self.hero.attack * 0.6));
          e.def = Object.assign({}, def, { name: '镜像·' + self.hero.name });
          e.name = e.def.name;
          if (e.nameLbl) e.nameLbl.setText(e.name);
          if (e.atkLbl) e.atkLbl.setText('攻 ' + e.atk);
        }
      });

      // 平台上站远程敌人：平台从「路过」变成「必须处理的战术地形」
      if (!nonCombat && this.platformPerches.length && list.length) {
        var perches = this.platformPerches.slice();
        var want = (this.floor >= 3 && Math.random() < 0.4) ? 2 : (Math.random() < 0.6 ? 1 : 0);
        for (var pi = 0; pi < want && perches.length; pi++) {
          var spot = perches.splice(ri(0, perches.length - 1), 1)[0];
          var pk = Math.random() < 0.5 ? 'necro' : 'skeleton';
          var pe = this.spawnEnemy(pk, spot.x, spot.y, this.floor);
          if (pe) {
            pe.name = pe.name + ' · 高台';
            pe.onPerch = true;
            if (pe.nameLbl) pe.nameLbl.setText(pe.name);
          }
        }
      }
    }

    /** 非战斗房间的目标物：宝箱 / 祭坛 */
    spawnRoomGoal(roomType) {
      var x = Math.round(this.levelWidth * 0.58);
      var y = this.groundY - 26;
      if (roomType === 'treasure') {
        var chest = this.add.rectangle(x, y, 52, 42, 0xd4a02a, 1).setDepth(6).setStrokeStyle(3, 0x7a5a10);
        var lid = this.add.rectangle(x, y - 22, 52, 8, 0xffe08a, 1).setDepth(7);
        var label = this.add.text(x, y - 62, '宝箱 · 走近开启', { fontSize: '13px', color: '#ffd76a' }).setOrigin(0.5).setDepth(7);
        this.roomGoal = { kind: 'chest', done: false, x: x, y: y, obj: chest, extra: lid, label: label };
      } else if (roomType === 'shrine') {
        var altar = this.add.rectangle(x, y - 14, 40, 68, 0x1f6f66, 1).setDepth(6).setStrokeStyle(3, 0x4ad0c0);
        var orb = this.add.circle(x, y - 62, 14, 0x7fe8d8, 0.9).setDepth(7);
        var label2 = this.add.text(x, y - 96, '祭坛 · 走近祈祷', { fontSize: '13px', color: '#7fe8d8' }).setOrigin(0.5).setDepth(7);
        this.roomGoal = { kind: 'shrine', done: false, x: x, y: y, obj: altar, extra: orb, label: label2 };
      }
    }

    /** 触碰宝箱 / 祭坛的结算 */
    resolveRoomGoal() {
      var g = this.roomGoal;
      if (!g || g.done) return;
      g.done = true;
      if (g.kind === 'chest') {
        var gain = 8 + this.floor * 3;
        if (this.hasCurse('贪婪')) gain = Math.max(1, Math.round(gain * 0.5));   // 诅咒：贪婪
        this.points += gain;
        var bonus = '';
        if (Math.random() < 0.45) { this.hero.potions++; bonus = ' · 药水 +1'; }
        this.showFloat(g.x, g.y - 70, '+' + gain + bonus, '#ffd76a', 20);
        this.showCenter('宝箱开启 · 试炼点数 +' + gain + bonus, '#ffd76a');
        this.spark(g.x, g.y - 30, 0xffd76a);
        sfx('chest');
        this.time.delayedCall(140, function () { sfx('coin'); });
      } else {
        var heal = Math.round(this.hero.maxHp * 0.35);
        var before = this.hero.hp;
        this.healHero(heal, true);
        var real = Math.round(this.hero.hp - before);
        this.showCenter(real > 0 ? ('祭坛祈祷 · 生命 +' + real) : '祭坛祈祷 · 生命已满，获得 3 点试炼点', '#7fe8d8');
        if (real <= 0) this.points += 3;
        this.spark(g.x, g.y - 60, 0x7fe8d8);
        sfx('heal');
      }
      if (g.extra) g.extra.destroy();
      if (g.obj) { g.obj.setFillStyle(0x3a3a44, 1); }
      if (g.label) g.label.setText('已使用');
      this.refreshHud();
      this.checkFloorClear();
    }

    spawnEnemy(key, x, y, floor) {
      var def = ENEMY_TYPES[key];
      if (!def) return null;
      // 镜像怪照玩家英雄：造型一致，攻击方式也一致（玩家远程，它就远程）
      if (key === 'mimic') def = this.mimicDef(def);
      var tex = 角色形象.ensureMobTexture(this, key, this.heroLookId);
      this.ensureMobAnims(key, tex);
      var spr = this.physics.add.sprite(x, y, tex, 0);
      spr.setOrigin(0.5, 1);
      spr.setScale(def.scale || 1);
      spr.setDepth(8);
      this.enemyGroup.add(spr);
      spr.body.setSize(def.w, def.h);
      // 偏移要按**这一帧的真实尺寸**算。原来写死 CELL(=64)，而各角色的精灵帧并不都是
      // 64 高（实测约 52）—— 碰撞体整体上移了十几像素：高台上的远程敌人一出生就嵌进
      // 平台、卡在那儿清不掉（「怪都打完了还显示剩余敌人 1」），玩家打它时的判定也偏上。
      var frameW = (spr.frame && spr.frame.realWidth) || CELL;
      var frameH = (spr.frame && spr.frame.realHeight) || CELL;
      spr.body.setOffset((frameW - def.w) / 2, frameH - def.h);
      spr.body.setAllowGravity(!def.fly);
      // 飞行怪不与地形碰撞：它们的悬浮高度必然和平台层重叠（手机横屏时平台几乎占满了
      // 地面以上的空间，没有能避开的空档），不穿过去就会被平台顶住 —— 卡在那儿不动、
      // 打不到、也不掉下来，于是「剩余敌人」永远清不了零。
      // 玩家打飞行怪靠的是距离判定而不是物理接触，所以关掉碰撞没有副作用。
      if (def.fly) spr.body.checkCollision.none = true;
      // 世界边界：不设的话，被击退时敌人会带着速度一路飞出关卡，直到 updateEnemies
      // 里那个「x < -120 或 x > levelWidth + 120」的兜底把它判成「脱离战斗」直接抹掉 ——
      // 玩家看到的就是「怪被打飞到屏幕外面，然后凭空消失」。
      // 主角一直有这条边界（hero.setCollideWorldBounds），敌人漏了。
      spr.setCollideWorldBounds(true);
      if (def.fly) spr.setVelocityY(0);
      if (def.tint) spr.setTint(def.tint);

      var scale = 1 + (floor - 1) * 0.2;
      var hp = Math.round(def.hp * scale);

      var e = {
        key: key, def: def, sprite: spr, name: def.name, tier: def.tier, behavior: def.behavior,
        hp: hp, maxHp: hp, atk: Math.round(def.atk * (1 + (floor - 1) * 0.15)),
        alive: true, state: 'patrol', dir: Math.random() < 0.5 ? -1 : 1,
        hurtUntil: 0, attackAt: 0, didHit: false, patrolUntil: 0,
        windupUntil: 0, recoverUntil: 0, nextSpecial: 0, chargeUntil: 0
      };
      spr.play(角色形象.mobAnimKeys(key).walk);
      this.enemies.push(e);

      // 头顶血条 + 名字/攻击标签（敌人属性显示）
      // 条宽贴着精灵本体，不再固定比精灵宽一截
      // 血条贴住该角色的实际体型（各角色视觉宽度差得很多，不再按 64px 单元算）
      var inkW = 角色形象.visualWidth(key, this.heroLookId) * (def.scale || 1);
      e.barW = Math.round(clamp(inkW * 1.15 + 8, 32, 76));
      e.meter = this.createMeter({ key: 'hp', h: 7 });
      e.nameLbl = this.add.text(0, 0, def.name, {
        fontSize: '11px', color: UI.tier[def.tier] || UI.tier.normal, fontStyle: 'bold'
      }).setOrigin(1, 0.5).setDepth(9).setVisible(false);
      e.nameLbl.setShadow(0, 1, '#04060f', 4, false, true);
      e.atkLbl = this.add.text(0, 0, '攻 ' + e.atk, {
        fontSize: '11px', color: UI.sub
      }).setOrigin(0, 0.5).setDepth(9).setVisible(false);
      e.atkLbl.setShadow(0, 1, '#04060f', 4, false, true);
      this.meterParts(e.meter).forEach(function (o) { o.setDepth(9); });
      this.setMeterVisible(e.meter, false);

      if (def.tier === 'boss') {
        this.boss = e;
        this.setMeterVisible(this.bossMeter, true);
        this.bossName.setVisible(true);
        this.bossText.setVisible(true);
        this.bossName.setText(def.name);
        this.bossText.setText('生命 ' + hp + ' / ' + hp);
        this.setMeterValue(this.bossMeter, 1);
      }
      return e;
    }

    /**
     * 镜像怪的运行时配置：照当前英雄切换近战 / 远程
     * 玩家是游侠 / 法师 / 贤者时，它改用「同一种弹道 + 镜像紫」远距离放风筝；
     * 玩家是近战英雄时维持原样。改的是副本，不动 ENEMY_TYPES 原表。
     */
    mimicDef(base) {
      var def = {};
      for (var k in base) def[k] = base[k];
      var rg = this.heroRanged();
      if (rg) {
        def.behavior = 'shooter';
        def.rangedKind = rg.kind;
        def.rangedSpeed = Math.round(rg.cfg.speed * 0.72);   // 比玩家慢一档：看得见、闪得掉
        def.attackRange = 330;
        def.keepDist = 200;
        def.name = '镜像怪 · ' + rg.name;
      } else {
        def.rangedKind = null;
      }
      return def;
    }

    spawnPortal() {
      this.portal = this.add.image(this.levelWidth - 100, this.groundY - 45, TEX.portal)
        .setDepth(5).setAlpha(0.25).setVisible(false);
      this.physics.add.existing(this.portal, true);
    }

    // ---------- 主角战斗 ----------
    tryAttack() {
      var now = this.time.now;
      if (!this.running || this.heroDead || now < this.attackReadyAt) return;
      // 举盾时攻击 = 先收盾再打（不阻断操作流，盾反就是这么接出来的）
      if (this.guarding) this.lowerGuard();
      // 连招判定：盾反 > 突进斩 > 落地斩 > 三连斩
      var chain = this.pickChain(now);
      // 远程英雄（游侠 / 法师 / 贤者）：普攻就是远程攻击，地空一致，不进入近战流程
      var rg = this.heroRanged();
      if (rg) { this.tryRangedAttack(now, rg, chain); return; }
      // 滞空挥砍 = 跳劈（下落攻击）
      if (!(this.hero.body.blocked.down || this.hero.body.touching.down)) { this.tryDiveAttack(now); return; }
      if (chain && chain.lunge) this.hero.setVelocityX((this.hero.flipX ? -1 : 1) * chain.lunge);
      // 狂怒状态：攻击间隔缩短 35%
      var rate = this.furyActive() ? FURY.atkSpeed : 1;
      this.attackReadyAt = now + (chain ? Math.max(240, 380 - 60) : 380) / rate;
      this.attacking = true;
      this.attackHits = {};
      this.hero.play('hero_attack', true);

      var dir = this.hero.flipX ? -1 : 1;
      var span = chain ? (chain.range || 1) : 1;
      var slash = this.add.image(this.hero.x + dir * (36 * span), this.hero.y - 34, TEX.slash).setDepth(11);
      slash.setFlipX(dir < 0);
      slash.setAngle(dir < 0 ? -22 : 22);
      if (span > 1) slash.setScale(span);
      if (chain) slash.setTint(parseInt(chain.color.replace('#', ''), 16));
      this.tweens.add({
        targets: slash, alpha: { from: 0.95, to: 0 }, scaleX: 1.3 * span, scaleY: 1.3 * span,
        duration: 180, onComplete: function () { slash.destroy(); }
      });

      var self = this;
      this.time.delayedCall(70, function () {
        if (!self.attacking || !self.running) return;
        self.resolveMeleeHit(chain);
        self.chainSplash(chain);
      });
      this.time.delayedCall(220, function () { if (!self.diving) self.attacking = false; });
      if (chain) this.chainFeedback(chain);
      sfx(chain ? 'crit' : 'attack');
    }

    /**
     * 跳劈起手：滞空时挥砍 → 高速下坠，刀光跟随
     * 下落中命中敌人（1.9 倍伤害），落地产生范围冲击波
     */
    tryDiveAttack(now) {
      if (this.diving || now < this.diveReadyAt || !this.running || this.heroDead) return;
      this.diving = true;
      this.diveHits = {};
      this.attacking = true;
      this.attackReadyAt = now + 240;
      this.diveReadyAt = now + 240;
      this.isCharging = false;
      if (this.chargeRing) this.chargeRing.setVisible(false);

      var h = this.hero;
      h.play('hero_attack', true);
      h.setVelocityY(DIVE.speed);
      h.setVelocityX(h.body.velocity.x * 0.6);

      // 下坠期间关掉「英雄 ↔ 敌人」的碰撞。
      // Arcade 会把互相重叠的两个动态体推开：英雄 960px/s 砸下来时，这个推力方向
      // 正好朝下，一帧挤一点，最后把敌人**压穿地面** —— 而沉到地面以下的敌人打不到
      // 也清不掉，整局卡死。关掉之后英雄直接穿过敌人体，手感上也更像「砸穿」。
      if (this._heroEnemyCollider) this._heroEnemyCollider.active = false;

      if (!this.diveFx) this.diveFx = this.add.image(0, 0, TEX.slash).setDepth(11);
      this.diveFx.setVisible(true).setAngle(90).setAlpha(0.95).setScale(0.95);

      this.showFloat(h.x, h.y - 78, '跳劈!', '#ffd76a', 18);
      sfx('attack');
      if (state.settings.screenShake2D !== false) this.cameras.main.shake(70, 0.003);
    }

    /** 跳劈逐帧：下坠命中判定 → 落地冲击 */
    updateDive(onGround) {
      var h = this.hero;
      var self = this;
      if (this.diveFx) this.diveFx.setPosition(h.x + (h.flipX ? -18 : 18), h.y - 8);
      if (h.body.velocity.y < DIVE.speed * 0.5) h.setVelocityY(DIVE.speed);

      var rect = new Phaser.Geom.Rectangle(h.x - 46, h.y - 34, 92, 96);
      var hitAny = false;
      this.enemies.forEach(function (e, idx) {
        if (!e.alive || self.diveHits[idx]) return;
        if (Phaser.Geom.Intersects.RectangleToRectangle(rect, e.sprite.getBounds())) {
          self.diveHits[idx] = true;
          self.showFloat(e.sprite.x, e.sprite.y - 92, '下落斩', '#ff9a5a', 16);
          self.damageEnemy(e, self.rollPlayerDamage(DIVE.mult), false);
          // 砸进地里：刻意保留的特性（见 DIVE 里的说明）。
          // 排在伤害之后 —— 已经被打死的敌人不该再演一遍「陷进地里」。
          if (e.alive && self.buryEnemy(e)) {
            self.showFloat(e.sprite.x, e.sprite.y - 120, '砸进地里!', '#c9a06a', 17);
          }
          hitAny = true;
        }
      });
      if (hitAny && state.settings.screenShake2D !== false) this.cameras.main.shake(140, 0.009);
      if (onGround) this.diveImpact();
    }

    /** 跳劈落地：冲击波范围伤害 + 震屏 + 尘环 */
    diveImpact() {
      var h = this.hero;
      var self = this;
      this.diving = false;
      this.attacking = false;
      this.diveReadyAt = this.time.now + DIVE.cooldown;
      this._wasAirborne = false;
      if (this.diveFx) this.diveFx.setVisible(false);
      // 恢复「英雄 ↔ 敌人」的碰撞（下坠期间临时关掉了，见 tryDiveAttack）
      if (this._heroEnemyCollider) this._heroEnemyCollider.active = true;
      // 砸地姿势：定格在下坠帧上再起身
      this._landingUntil = this.time.now + 150;
      // 脚下地裂
      this.groundCrack(h.x, h.y + 2, 460);

      var ring = this.add.circle(h.x, h.y - 6, 18, 0xffd76a, 0.22).setDepth(11);
      ring.setStrokeStyle(3, 0xffd76a, 0.9);
      this.tweens.add({
        targets: ring, radius: DIVE.splashRadius, alpha: 0, duration: 300,
        onComplete: function () { ring.destroy(); }
      });
      this.spark(h.x, h.y - 4, 0xffd76a);
      sfx('anvil');
      if (state.settings.screenShake2D !== false) this.cameras.main.shake(210, 0.013);

      // 冲击波：范围内尚未被下落斩命中的敌人补一次范围伤害
      var radius = DIVE.splashRadius;
      this.enemies.forEach(function (e, idx) {
        if (!e.alive || self.diveHits[idx]) return;
        if (Math.abs(e.sprite.x - h.x) <= radius && Math.abs(e.sprite.y - h.y) <= radius * 0.9) {
          self.damageEnemy(e, self.rollPlayerDamage(DIVE.splashMult), false);
        }
      });
      this.showFloat(h.x, h.y - 72, '冲击波', '#ffd76a', 15);
      // 落地后的短暂窗口内接攻击 = 落地斩（连招）
      this.diveCounterUntil = this.time.now + CHAIN.diveWindow;
    }

    /** 脚下地裂：几道从落点散开的裂纹，自己淡出。跳劈落地与敌人被砸进地里都用它 */
    groundCrack(x, y, life) {
      var g = this.add.graphics().setDepth(3);
      g.lineStyle(2, 0x1d140d, 0.85);
      for (var i = 0; i < 6; i++) {
        var dir = (i % 2 === 0) ? 1 : -1;
        var spread = 0.22 + 0.34 * Math.floor(i / 2);
        var len = rnd(16, 36);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + dir * Math.cos(spread) * len, y + Math.sin(spread) * rnd(3, 8));
        g.strokePath();
      }
      this.tweens.add({
        targets: g, alpha: 0, duration: Math.max(200, life || 420),
        onComplete: function () { g.destroy(); }
      });
      return g;
    }

    /**
     * 把敌人砸进地里（刻意保留的特性，不是 bug）
     * ------------------------------------------------------------
     * 只压扁**视觉**，物理体一动不动 —— 这样玩家照样打得到它、清得掉。
     * 以前「砸进地里」其实是物理事故的副产品：英雄下坠时和敌人之间挂着 collider，
     * 把敌人一帧一帧往地下挤，挤穿地面之后打不到也清不掉，整局就此卡住。
     * 现在换成显式机制：有概率触发、有固定时长、时间到自己拱出来。
     * 返回是否真的触发了。
     */
    buryEnemy(e) {
      if (!e || !e.alive || e.buried) return false;
      if (Math.random() >= DIVE.buryChance) return false;
      var spr = e.sprite;
      if (!spr || !spr.active) return false;
      var self = this;

      e.buried = true;
      e.buryUntil = this.time.now + DIVE.buryTime;
      // 陷在地里期间不行动：复用硬直通道（updateEnemies 里会直接 return）
      e.hurtUntil = Math.max(e.hurtUntil || 0, e.buryUntil);
      spr.setVelocity(0, 0);
      if (e._buryBaseScaleY == null) e._buryBaseScaleY = spr.scaleY;
      var baseY = e._buryBaseScaleY;

      this.tweens.add({ targets: spr, scaleY: baseY * DIVE.burySquash, duration: 90, ease: 'Quad.easeOut' });
      this.groundCrack(spr.x, spr.y + 2, DIVE.buryTime);
      this.spark(spr.x, spr.y - 12, 0xc9a06a);
      sfx('anvil');
      if (state.settings.screenShake2D !== false) this.cameras.main.shake(130, 0.007);

      // 时间到了自己从地里拱出来
      this.time.delayedCall(DIVE.buryTime, function () {
        if (!spr.active || !e.alive) return;
        e.buried = false;
        self.tweens.add({ targets: spr, scaleY: baseY, duration: 260, ease: 'Back.easeOut' });
        self.spark(spr.x, spr.y - 6, 0xc9a06a);
      });
      return true;
    }

    resolveMeleeHit(chain) {
      var dir = this.hero.flipX ? -1 : 1;
      var span = chain ? (chain.range || 1) : 1;
      var hx = this.hero.x + dir * 40 * span;
      var hy = this.hero.y - 36;
      var rect = new Phaser.Geom.Rectangle(hx - 44 * span, hy - 36, 88 * span, 72);
      var self = this;
      this.enemies.forEach(function (e, idx) {
        if (!e.alive || self.attackHits[idx]) return;
        if (Phaser.Geom.Intersects.RectangleToRectangle(rect, e.sprite.getBounds())) {
          self.attackHits[idx] = true;
          self.damageEnemy(e, self.rollPlayerDamage(chain ? chain.mult : 1, chain && chain.forceCrit, chain && chain.name), false);
          if (chain && chain.name === '盾反') {
            var kd = (e.sprite.x >= self.hero.x) ? 1 : -1;
            e.sprite.setVelocity(kd * 320, -180);
          }
        }
      });
    }

    // ============================================================
    //  远程攻击（游侠 · 长弓 / 法师 · 法杖 / 贤者 · 卷轴）
    //  这三种武器本来就不是用来挥砍的：普攻改成各自的专属远程攻击。
    //  外观（弹道 kind、颜色、招式名）来自 角色形象.RANGED，
    //  数值来自 RANGED_ATTACK —— 形象与手感分开调，互不牵扯。
    // ============================================================
    /** 当前英雄的远程配置；近战英雄返回 null */
    heroRanged() {
      var A = 角色形象;
      var id = this.heroLookId;
      if (!A || !A.RANGED || !A.RANGED[id]) return null;
      var cfg = RANGED_ATTACK[id];
      if (!cfg) return null;
      var art = A.RANGED[id];
      var look = A.LOOKS[id] || {};
      return {
        id: id, kind: art.kind, name: art.name, cfg: cfg,
        color: (look.colors && look.colors.acc) || 0xffffff
      };
    }

    /**
     * 远程普攻：落地平射；滞空时自动朝最近的敌人射击（空战也打得中）
     * 连招（chain）走远程自己的一套：反击箭 / 连珠箭 / 踏地箭 / 三连散，见 RANGED_CHAIN
     */
    tryRangedAttack(now, rg, chain) {
      var h = this.hero, cfg = rg.cfg;
      var grounded = h.body.blocked.down || h.body.touching.down;
      if (now < this.attackReadyAt) return;
      // 狂怒状态：远程攻击间隔同样缩短
      this.attackReadyAt = now + cfg.cd / (this.furyActive() ? FURY.atkSpeed : 1);
      this.attacking = true;
      this.attackHits = {};

      // 位移：近战连招是「自己冲上去」（lunge）；远程连招都不带位移 ——
      // 弓与法杖的收益在弹丸上，不在身位上（连珠箭是原地连射，见 RANGED_CHAIN.roll）
      var faceDir = h.flipX ? -1 : 1;
      if (chain && chain.lunge) h.setVelocityX(faceDir * chain.lunge);

      var aim = this.rangedAim(grounded);
      if (aim.dir !== faceDir) h.setFlipX(aim.dir < 0);
      h.play('hero_attack', true);

      // 滞空时射过一箭 → 落地打开踏地箭窗口（远程没有跳劈，用空中射击接同一套节奏）
      if (!grounded) this._airShotAt = now;
      if (!grounded) this.showFloat(h.x, h.y - 80, '空中射击', hexOf(rg.color), 14);
      if (chain) this.chainFeedback(chain);
      sfx(chain ? 'crit' : (cfg.spin ? 'magic' : 'shoot'));

      var self = this;
      // 拉弓 / 举杖需要一小段起手：起手帧先亮，弹丸 90ms 后离手。
      // 瞄准点在离手那一刻重算 —— 不然这 90ms 里主角自己移动/落地了，弹丸会飞歪。
      this.time.delayedCall(90, function () {
        if (!self.running || self.heroDead) return;
        var g2 = self.hero.body.blocked.down || self.hero.body.touching.down;

        // 三连散：一次射出多支。
        // 场上有多个敌人时**一支锁一个**（真·全覆盖，和近战横扫"扫开一整片"对应）；
        // 只剩一个敌人时退回按角度散开，仍然是一发三支的扇形。
        if (chain && chain.spread > 1) {
          var n = chain.spread, mid = (n - 1) / 2, deg = chain.spreadDeg || 12;
          var base = self.rangedAim(g2);
          var targets = self.nearestEnemies(n);
          for (var i = 0; i < n; i++) {
            var tgt = targets[i];
            var aimI = tgt
              ? { dir: (tgt.sprite.x >= self.hero.x ? 1 : -1), tx: tgt.sprite.x, ty: tgt.sprite.y - 26 }
              : base;
            self.fireShot(rg, aimI, chain, {
              angleDeg: tgt ? 0 : (i - mid) * deg,
              mult: (i === 0) ? 1 : (chain.sideMult || 0.7)   // 主目标满伤，其余两支打折
            });
          }
          return;
        }

        // 连珠箭：连续点射（间隔 burstGap），**每一发都重新锁定**最近的敌人 ——
        // 目标在跑、跳到高台，后面几发都会跟着改角度；总倍率靠打满三发换
        if (chain && chain.burst > 1) {
          var gap = chain.burstGap || 90;
          for (var b = 0; b < chain.burst; b++) {
            (function (idx) {
              self.time.delayedCall(idx * gap, function () {
                if (!self.running || self.heroDead) return;
                self.fireShot(rg, self.lockAim(ENV.lockRange), chain);
              });
            })(b);
          }
          return;
        }

        // 踏地箭：瞄向地面（就近敌人的脚下 / 前方地面），箭带下坠弧线，插地即炸
        if (chain && chain.blast) {
          self.fireShot(rg, self.groundAim(), chain, { grav: RANGED_CHAIN.land.grav });
          return;
        }

        self.fireShot(rg, self.rangedAim(g2), chain);
      });
      this.time.delayedCall(Math.min(cfg.cd - 40, 260), function () { self.attacking = false; });
    }

    /** 最近的 n 个敌人（三连散一支锁一个用） */
    nearestEnemies(n) {
      var h = this.hero;
      return this.enemies.filter(function (e) { return e.alive; })
        .map(function (e) {
          return { e: e, d: Math.abs(e.sprite.x - h.x) + Math.abs(e.sprite.y - h.y) * 0.5 };
        })
        .sort(function (a, b) { return a.d - b.d; })
        .slice(0, n)
        .map(function (o) { return o.e; });
    }

    /** 踏地箭的落点：优先瞄最近敌人的脚下，没有敌人就瞄前方地面 */
    groundAim() {
      var h = this.hero, dir = h.flipX ? -1 : 1;
      var best = null, bd = 1e9;
      this.enemies.forEach(function (e) {
        if (!e.alive) return;
        var d = Math.abs(e.sprite.x - h.x);
        if (d < bd) { bd = d; best = e; }
      });
      var tx = best ? best.sprite.x : (h.x + dir * 170);
      var ty = best ? (best.sprite.y - 4) : (this.groundY - 4);
      if (Math.abs(tx - h.x) > 12) dir = tx >= h.x ? 1 : -1;
      return { dir: dir, tx: tx, ty: ty };
    }

    /**
     * 锁定最近敌人的瞄准点（连珠箭每发重锁用）
     * 普攻落地时是**固定平射**（想打哪就打哪、也能空放），只有这招会锁人；
     * 超出 maxDist 就不锁，保持平射 —— 免得隔着半个房间拐弯。
     */
    lockAim(maxDist) {
      var h = this.hero;
      var best = null, bd = 1e9;
      this.enemies.forEach(function (e) {
        if (!e.alive) return;
        var d = Math.abs(e.sprite.x - h.x);
        if (d < bd) { bd = d; best = e; }
      });
      if (!best || (maxDist && bd > maxDist)) return this.rangedAim(true);
      return {
        dir: (best.sprite.x >= h.x) ? 1 : -1,
        tx: best.sprite.x,
        ty: best.sprite.y - 26
      };
    }

    /** 瞄准点：落地时朝正前方平射；滞空时朝最近的敌人（越近越优先） */
    rangedAim(grounded) {
      var h = this.hero;
      var dir = h.flipX ? -1 : 1;
      var tx = h.x + dir * 300, ty = h.y - 34;
      if (!grounded) {
        var best = null, bd = 1e9;
        this.enemies.forEach(function (e) {
          if (!e.alive) return;
          var d = Math.abs(e.sprite.x - h.x) + Math.abs(e.sprite.y - h.y) * 0.5;
          if (d < bd) { bd = d; best = e; }
        });
        if (best) {
          tx = best.sprite.x; ty = best.sprite.y - 26;
          if (Math.abs(tx - h.x) > 12) dir = tx >= h.x ? 1 : -1;
        }
      }
      return { dir: dir, tx: tx, ty: ty };
    }

    /**
     * 射出弹丸：箭矢 / 奥术弹 / 灵能波
     * extra（可选）是连招的额外参数：
     *   angleDeg  扇形偏角（三连散的左右两支）
     *   mult      这一发的伤害系数（三连散的两侧打折）
     *   grav      下坠加速度（踏地箭瞄地面）
     */
    fireShot(rg, aim, chain, e) {
      var h = this.hero, cfg = rg.cfg, A = 角色形象;
      var extra = e || {};
      var mult = (chain ? chain.mult : 1) * (extra.mult != null ? extra.mult : 1);
      var tex = A.ensureShotTexture(this, rg.kind, rg.color);
      var anim = A.ensureShotAnim(this, rg.kind, rg.color, rg.kind === 'wave' ? 9 : 16);
      var size = A.shotSize(rg.kind);
      var mx = h.x + aim.dir * 26, my = h.y - 34;

      var s = this.physics.add.sprite(mx, my, tex, 0);
      s.setDepth(9);
      s.play(anim);
      s.body.setAllowGravity(false);
      s.body.setSize(size.bw, size.bh, true);         // 判定框贴着可见弹体
      var boost = chain ? (chain.boost || 1.25) : 1;   // 连招弹丸更大更亮
      if (boost > 1) { s.setScale(boost); s.body.setSize(size.bw * boost, size.bh * boost, true); }

      var dx = aim.tx - mx, dy = aim.ty - my;
      if (Math.abs(dx) < 8) dx = aim.dir * 8;                 // 正上/正下不成立：兜个方向
      var ang = Math.atan2(dy, dx) + (extra.angleDeg ? Phaser.Math.DegToRad(extra.angleDeg) : 0);
      var spd = cfg.speed * (chain && chain.speedMult ? chain.speedMult : 1);
      s.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd);
      if (rg.kind !== 'orb') s.setRotation(ang);

      s._friendly = true;
      s._kind = rg.kind;
      s._color = rg.color;
      s._grav = extra.grav || 0;                       // 手动积分：弹丸不该吃满世界重力
      // 伤害在离手时定，吃到当下所有强化；连招额外乘倍率、盾反（反击箭）必定暴击
      s._roll = this.rollPlayerDamage(cfg.dmg * mult, chain && chain.forceCrit, chain && chain.name);
      s._pierce = Math.max(cfg.pierce || 1, (chain && chain.pierce) || 0);   // 取大值：反击箭不会把贤者的穿透 99 削弱
      s._counter = chain ? chain.name : null;          // 带上招式名，命中时飘字
      s._hit = {};
      s._lifeUntil = this.time.now + cfg.life;
      s._knock = Math.max(cfg.knock || 80, (chain && chain.knock) || 0);
      s._splash = cfg.splash || 0;
      s._splashMult = cfg.splashMult || 0;
      s._homing = cfg.homing || 0;
      // 踏地箭：命中会炸，落地 / 失效也会炸（blastShot）
      if (chain && chain.blast) { s._blast = chain.blast; s._blastMult = chain.blastMult || 0.6; }
      this.shots.push(s);

      // 出手表现：手上一点光 + 轻微后坐
      this.spark(mx, my, rg.color);
      var ring = this.add.circle(mx, my, 5, rg.color, 0.5).setDepth(11);
      this.tweens.add({ targets: ring, radius: 18, alpha: 0, duration: 150, onComplete: function () { ring.destroy(); } });
      return s;
    }

    /** 弹丸逐帧：追踪 → 命中 → 穿透 / 消失（踏地箭落地即炸） */
    updateShots(dt) {
      if (!this.shots || !this.shots.length) return;
      var self = this, now = this.time.now;
      this.shots = this.shots.filter(function (s) {
        if (!s || !s.active) return false;
        if (now > s._lifeUntil || s.x < -80 || s.x > self.levelWidth + 80 ||
          s.y < -240 || s.y > self.groundY + 800) {
          if (s._blast) self.blastShot(s);     // 飞到寿命尽头也要炸，不然踏地箭会静悄悄消失
          s.destroy(); return false;
        }
        if (s._grav) {                          // 踏地箭：手动积分出下坠弧线
          s.setVelocityY(s.body.velocity.y + s._grav * dt / 1000);
          if (s.body.blocked.down || self.projectileGroundY(s.x, s.y) !== null) {
            self.blastShot(s); s.destroy(); return false;
          }
        }
        if (s._homing) self.steerShot(s, dt);
        if (s._kind !== 'orb' && s.body) s.setRotation(Math.atan2(s.body.velocity.y, s.body.velocity.x));

        var hitAny = false;
        self.enemies.forEach(function (e, idx) {
          if (!e.alive || s._hit[idx]) return;
          if (!self.shotHitsBody(s, e)) return;
          s._hit[idx] = true;
          self.damageEnemy(e, s._roll, false);
          if (s._knock) e.hurtUntil = Math.max(e.hurtUntil, now + s._knock);   // 硬直 = 被弹丸顶住
          if (s._splash) self.splashShot(s, e, s._splash, s._splashMult);
          self.spark(s.x, s.y, s._color);
          hitAny = true;
          s._pierce -= 1;
        });
        if (hitAny && s._pierce <= 0) { s.destroy(); return false; }
        return true;
      });
    }

    /**
     * 弹丸是否打中敌人：拿判定框（body）比，而不是拿 64px 的贴图框比
     * 用贴图框会比视觉早约 40px 判中，看着像「还没碰到就炸了」。
     */
    shotHitsBody(s, e) {
      var sb = s.body, eb = e.sprite.body;
      if (!sb || !eb || !sb.enable || !eb.enable) return false;
      var a = _rectA.setTo(sb.x, sb.y, sb.width, sb.height);
      var b = _rectB.setTo(eb.x, eb.y, eb.width, eb.height);
      return Phaser.Geom.Intersects.RectangleToRectangle(a, b);
    }

    /** 追踪（奥术弹）：每秒朝最近敌人转过 homing 弧度，转不过来就擦身而过 */
    steerShot(s, dt) {
      var best = null, bd = 1e9;
      this.enemies.forEach(function (e) {
        if (!e.alive) return;
        var d = Math.abs(e.sprite.x - s.x) + Math.abs(e.sprite.y - s.y);
        if (d < bd) { bd = d; best = e; }
      });
      if (!best || !s.body) return;
      var cur = Math.atan2(s.body.velocity.y, s.body.velocity.x);
      var want = Math.atan2((best.sprite.y - 24) - s.y, best.sprite.x - s.x);
      var diff = Phaser.Math.Angle.Wrap(want - cur);
      var maxTurn = s._homing * dt / 1000;
      var next = cur + Phaser.Math.Clamp(diff, -maxTurn, maxTurn);
      var sp = Math.sqrt(s.body.velocity.x * s.body.velocity.x + s.body.velocity.y * s.body.velocity.y);
      s.setVelocity(Math.cos(next) * sp, Math.sin(next) * sp);
    }

    /**
     * 踏地箭：就地炸开一圈（命中敌人时由 _splash 走同一条路，这里管落地 / 失效那一下）
     * 与 splashShot 的区别：溅射中心是**弹丸自己所在的位置**，不是被打中的敌人。
     */
    blastShot(s) {
      var self = this, radius = s._blast || 96, cy = s.y - 6;
      var ring = this.add.circle(s.x, cy, 10, s._color, 0.26).setDepth(11);
      ring.setStrokeStyle(3, s._color, 0.9);
      this.tweens.add({
        targets: ring, radius: radius, alpha: 0, duration: 240,
        onComplete: function () { ring.destroy(); }
      });
      this.spark(s.x, cy, s._color);
      sfx('splash');
      if (state.settings.screenShake2D !== false) this.cameras.main.shake(80, 0.004);
      var mult = s._blastMult || 0.6;
      this.enemies.forEach(function (e, idx) {
        if (!e.alive || s._hit[idx]) return;
        if (Math.abs(e.sprite.x - s.x) > radius || Math.abs((e.sprite.y - 22) - cy) > radius) return;
        s._hit[idx] = true;
        self.damageEnemy(e, {
          dmg: Math.max(1, Math.round(s._roll.dmg * mult)), crit: false, chain: s._counter
        }, false);
        e.hurtUntil = Math.max(e.hurtUntil, self.time.now + 120);
      });
    }

    /** 命中溅射（奥术弹）：以被打中的那只为中心，主目标不重复吃溅射，只扫周围 */
    splashShot(s, hit, radius, mult) {
      var self = this;
      // 溅射中心 = 被打中的敌人（不是弹丸擦到它的那个位置，否则范围会偏出去半个身位）
      var cx = hit.sprite.x, cy = hit.sprite.y - 22;
      var ring = this.add.circle(cx, cy, 8, s._color, 0.26).setDepth(11);
      ring.setStrokeStyle(3, s._color, 0.9);
      this.tweens.add({ targets: ring, radius: radius, alpha: 0, duration: 230, onComplete: function () { ring.destroy(); } });
      if (state.settings.screenShake2D !== false) this.cameras.main.shake(70, 0.003);
      this.enemies.forEach(function (e, idx) {
        if (!e.alive || s._hit[idx]) return;
        if (Math.abs(e.sprite.x - cx) > radius || Math.abs((e.sprite.y - 22) - cy) > radius) return;
        self.damageEnemy(e, { dmg: Math.max(1, Math.round(s._roll.dmg * mult)), crit: false }, false);
        e.hurtUntil = Math.max(e.hurtUntil, self.time.now + 90);
      });
      sfx('splash');
    }

    rollPlayerDamage(mult, forceCrit, chainName) {
      var now = this.time.now;
      var sharp = now < this.perfectUntil;              // 完美闪避强化：锐利
      var power = now < (this.skillPowerUntil || 0) ? (this.skillPowerMult || 1) : 1;   // 英雄技能强化
      var pass = this.heroPassiveDamage();              // 英雄被动（首击 / 概率 / 低血）
      var env = this.envPlayerDamageMult();             // 环境：虚弱之雾 / 能量涌动
      var critEnv = this.envPlayerCrit();               // 环境：幸运 / 暴击共振
      var fury = this.furyActive() ? FURY.dmgMult : 1;  // 狂怒状态：伤害 ×1.5
      var base = this.hero.attack * env * fury * rnd(0.85, 1.15) * (mult || 1)
        * (sharp ? DODGE.sharpMult : 1) * power + pass.flat;
      if (this.hero.combo > 0 && this.comboCount > 0) {
        // 环境：连击风暴 —— 连击加成本身也被放大
        var comboRate = this.hero.combo + (this.hasEnv('连击风暴') ? this.envValue('comboBonus') * 100 : 0);
        base *= (1 + Math.min(this.comboCount, 8) * (comboRate / 100));
      }
      var crit = sharp || forceCrit || pass.forceCrit ||
        Math.random() < (this.hero.critRate / 100 + critEnv.rate);
      if (crit) base *= (this.hero.critDamage / 100) * critEnv.dmg;
      return { dmg: Math.max(1, Math.round(base)), crit: crit, chain: chainName || null };
    }

    damageEnemy(e, roll, fromThorn) {
      if (!e.alive) return;
      var dmg = roll.dmg;

      // 环境：闪避领域（敌人有几率闪开，只有直接命中会闪，反伤/环境伤害不闪）
      if (!fromThorn && this.envEnemyDodge() > 0 && Math.random() < this.envEnemyDodge()) {
        this.showFloat(e.sprite.x, e.sprite.y - 74, '闪开', '#b8a8ff', 16);
        return;
      }

      // 狂怒状态：伤害加成已经算进 rollPlayerDamage，这里只做"怒焰灼烧"的表现
      if (this.furyActive() && Math.random() < 0.5) {
        this.spark(e.sprite.x + rnd(-12, 12), e.sprite.y - rnd(10, 40), 0xffb347);
      }

      // 斩杀
      if (!fromThorn && this.hero.execute > 0 && (e.hp / e.maxHp) <= 0.25 && Math.random() < (this.hero.execute / 100)) {
        dmg = Math.max(dmg, Math.ceil(e.hp));
        this.showFloat(e.sprite.x, e.sprite.y - 74, '斩杀!', '#ff5555', 24);
        sfx('execute');
      }

      this._roomFirstHit = true;   // 被动：首击类技能（刺客 / 暗影）只在本房间的第一次命中生效
      e.hp -= dmg;
      // 用 max 而不是直接赋值：普通命中硬直只有 150ms，而「被砸进地里」是 1300ms ——
      // 直接覆盖会把长硬直砍短，怪就一边压扁着一边站起来乱跑了
      e.hurtUntil = Math.max(e.hurtUntil || 0, this.time.now + 150);
      // 破釜沉舟的吸血
      if (this.skillVampire && this.time.now < (this.skillPowerUntil || 0)) {
        this.healHero(Math.max(1, Math.round(dmg * this.skillVampire)), false);
      }
      // 陷在地里的怪不该被打飞：它已经钉在土里了
      if (!e.buried) {
        var dir = (e.sprite.x >= this.hero.x) ? 1 : -1;
        e.sprite.setVelocity(dir * 180, -130);
      }
      e.sprite.play(this.mobAnimKey(e, 'hurt'), true);

      this.showFloat(e.sprite.x, e.sprite.y - 56, '-' + fmt(dmg), roll.crit ? '#ffd700' : '#ffffff', roll.crit ? 23 : 17);
      this.spark(e.sprite.x, e.sprite.y - 30, roll.crit ? 0xffd700 : 0xff8a7a);
      if (roll.crit && state.settings.screenShake2D !== false) this.cameras.main.shake(90, 0.006);

      if (this.hero.vampire > 0) {
        this.healHero(Math.max(1, Math.round(dmg * Math.min(0.5, this.hero.vampire * 0.05))), false);
        sfx('vampire');
      }

      this.comboCount++;
      this.comboTimer = 900;
      if (this.comboCount >= 3) {
        this.comboText.setText(this.comboCount + ' 连击').setAlpha(1);
        if (this.comboCount % 3 === 0) sfx('combo');
      }

      // 敌人自带荆棘反伤
      if (e.def.thorn && !fromThorn) { sfx('thorn'); this.damageHero(e.def.thorn, e, true); }

      // 狂怒：命中攒怒（按层级，连招命中额外加成）
      if (!fromThorn) this.furyOnHit(e, roll.chain ? { name: roll.chain } : null);

      // ===== 环境 / 诅咒：挂在「我打中敌人」这个动作上的效果 =====
      if (!fromThorn) {
        // 吸血诅咒：所有单位攻击时回血 → 我也回
        if (this.hasEnv('吸血诅咒')) {
          this.healHero(Math.max(1, Math.round(this.hero.maxHp * this.envValue('lifesteal'))), false);
        }
        // 荆棘之地：每次攻击时受到反弹（无视护盾）
        if (this.hasEnv('荆棘之地')) {
          var rb = Math.max(1, Math.round(this.hero.hp * this.envValue('rebound')));
          this.hero.hp = Math.max(1, this.hero.hp - rb);
          this.showFloat(this.hero.x, this.hero.y - 78, '荆棘 -' + rb, '#c8ff9a', 14);
        }
        // 吸血反噬：每次攻击后自身损失 1 点生命（无视护盾）
        if (this.hasCurse('吸血反噬')) {
          this.hero.hp = Math.max(1, this.hero.hp - 1);
          this.showFloat(this.hero.x, this.hero.y - 92, '反噬 -1', UI.danger, 13);
        }
        this.refreshHud();
        if (this.hero.hp <= 0) { this.heroDie(); return; }
      }

      if (e.hp <= 0) this.killEnemy(e);
      else sfx(roll.crit ? 'crit' : 'block');
    }

    /** 敌人脱离关卡：静默移除（不给点数），只保证房间能正常清空 */
    dropEnemy(e) {
      e.alive = false;
      e.hp = 0;
      if (e.throwFx) { e.throwFx.destroy(); e.throwFx = null; }
      if (e.sprite) { e.sprite.setVelocity(0, 0); e.sprite.destroy(); }
      if (e.meter) this.destroyMeter(e.meter);
      if (e.nameLbl) e.nameLbl.destroy();
      if (e.atkLbl) e.atkLbl.destroy();
      if (this.boss === e) {
        this.boss = null;
        this.setMeterVisible(this.bossMeter, false);
        this.bossName.setVisible(false);
        this.bossText.setVisible(false);
      }
      this.showFloat(this.hero.x, this.hero.y - 84, '敌人脱离战斗', UI.muted, 13);
      this.refreshHud();
      this.checkFloorClear();
    }

    killEnemy(e) {
      e.alive = false;
      e.hp = 0;
      // 被砸进地里时是压扁着的，死亡动画得先把缩放还原 —— 不然尸体会是扁的
      if (e.buried) {
        e.buried = false;
        if (e._buryBaseScaleY != null && e.sprite && e.sprite.active) {
          e.sprite.setScale(e.sprite.scaleX, e._buryBaseScaleY);
        }
      }
      e.sprite.setVelocity(0, -170);
      e.sprite.play(this.mobAnimKey(e, 'dead'), true);
      e.sprite.body.checkCollision.none = true;
      this.tweens.add({
        targets: e.sprite, alpha: 0, y: e.sprite.y + 12, duration: 620, delay: 140,
        onComplete: function () { e.sprite.setVisible(false); }
      });
      this.spark(e.sprite.x, e.sprite.y - 30, 0xffd76a);
      this.setMeterVisible(e.meter, false);
      if (e.nameLbl) e.nameLbl.setVisible(false);
      if (e.atkLbl) e.atkLbl.setVisible(false);

      var gain = e.tier === 'boss' ? 12 : (e.tier === 'elite' ? 5 : 2);
      if (this.hasCurse('贪婪')) gain = Math.max(1, Math.round(gain * 0.5));   // 诅咒：贪婪
      this.points += gain;
      this.kills = (this.kills || 0) + 1;
      this.showFloat(e.sprite.x, e.sprite.y - 84, '+' + gain, '#73f0b4', 16);
      sfx(e.tier === 'boss' ? 'victory' : 'coin');

      // 环境：死亡回响 —— 敌人死亡时扣玩家最大生命的百分比（无视护盾）
      if (this.hasEnv('死亡回响') && !this.heroDead) {
        var de = Math.max(1, Math.round(this.hero.maxHp * this.envValue('deathDamage')));
        this.hero.hp = Math.max(1, this.hero.hp - de);
        this.showFloat(this.hero.x, this.hero.y - 76, '死亡回响 -' + de, '#b8a8ff', 15);
      }
      // 狂怒：击杀攒怒
      this.addFury(FURY.gainKill);

      if (this.boss === e) {
        this.boss = null;
        this.setMeterVisible(this.bossMeter, false);
        this.bossName.setVisible(false);
        this.bossText.setVisible(false);
      }
      this.applyKillPassive();
      this.refreshHud();
      this.checkFloorClear();
    }

    // ---------- 防御（举盾）----------
    /** 举盾是否成立：按住键 + 体力够 + 不在翻滚/跳劈/挥砍中 */
    updateGuard(dt, onGround) {
      var h = this.hero, now = this.time.now;
      var ti = this.touchInput;
      var held = (this.keys.guard.isDown || this.keys.guard2.isDown || ti.guardHeld) &&
        !this.dodging && !this.diving && !this.attacking && !this.isCharging && !this.heroDead;

      if (held && h.stamina < GUARD.minStamina) {
        if (this.guarding && now > (this._guardWarnAt || 0)) {
          this._guardWarnAt = now + 900;
          this.showFloat(h.x, h.y - 84, '体力不足', UI.danger, 14);
          sfx('error');
        }
        held = false;
        this.guardBlocked = true;      // 锁住：体力回到 reopen 之前不许再举
      } else if (this.guardBlocked) {
        if (h.stamina >= GUARD.reopen) this.guardBlocked = false;
        else held = false;
      }
      if (held && !this.guarding) {          // 刚举起来
        this.guarding = true;
        this.guardStartAt = now;
        this.guardReadyAt = now + GUARD.raise;   // 抬盾要一点时间
        this.chainCount = 0;                     // 举盾打断连招
      } else if (!held && this.guarding) {
        this.lowerGuard();
      }
      if (!this.guarding) return 0;

      // 持续消耗体力（和闪避共用资源池 → 闪 or 挡 是个真抉择）
      h.stamina = Math.max(0, h.stamina - GUARD.drain * dt / 1000);
      this.staminaHoldUntil = now + STAMINA.delay;   // 举盾期间不回体力
      if (h.stamina <= 0) {
        this.lowerGuard();
        this.guardBlocked = true;
        this.showFloat(h.x, h.y - 84, '体力耗尽', UI.danger, 14);
        return 0;
      }
      // 盾光：成型后亮起，完美窗口内更亮
      var ready = now >= this.guardReadyAt;
      var inWindow = ready && (now - this.guardStartAt) <= GUARD.perfect;
      var flash = Math.max(0, 1 - (now - this.guardFlashAt) / 220);
      if (this.guardArc) {
        this.guardArc.setVisible(true);
        this.guardArc.setPosition(h.x + (h.flipX ? -20 : 20), h.y - 34);
        this.guardArc.setScale(h.flipX ? -1 : 1, 1);
        var a = (ready ? (inWindow ? 0.5 : 0.26) : 0.1) + flash * 0.6;
        this.guardArc.setFillStyle(flash > 0.05 ? 0xffd76a : (inWindow ? 0xffe08a : 0x8ad8ff), Math.min(0.7, a));
      }
      if (!ready) return GUARD.front;        // 还在抬盾：不减免
      return inWindow ? -1 : GUARD.front;    // -1 = 完美格挡窗口
    }

    lowerGuard() {
      if (!this.guarding) return;
      this.guarding = false;
      this.guardReadyAt = 0;
      if (this.guardArc) this.guardArc.setVisible(false);
    }

    /**
     * 完美格挡：完全免伤 + 顶开攻击者 + 护盾 + 盾反窗口
     * 数字沿用文字模式的「防御 +3 护盾」，守护者的「坚壁防御」再 +2
     */
    onPerfectBlock(source) {
      var now = this.time.now, h = this.hero;
      this.guardFlashAt = now;
      this.blockCount = (this.blockCount || 0) + 1;
      this.counterUntil = now + GUARD.counter;
      this.addFury(FURY.gainPerfect);          // 完美格挡攒怒（技巧奖励）
      this.guarding = true;                    // 格挡后保持举盾，等玩家决定是否盾反
      this.guardStartAt = now - GUARD.perfect; // 窗口已过：继续举着只减伤，不再连出完美
      this.showFloat(h.x, h.y - 96, '完美格挡!', '#ffd76a', 22);
      this.addShield(GUARD.shieldGain, null);
      if (this.skillId === 'guardian') this.addShield(GUARD.guardianBonus, '坚壁防御');
      sfx('parry');
      this.cameras.main.flash(80, 255, 240, 200);
      if (state.settings.screenShake2D !== false) this.cameras.main.shake(110, 0.006);

      // 反弹：把攻击者顶住并推开
      if (source && source.alive && source.sprite) {
        source.hurtUntil = now + GUARD.stun;
        var dir = (source.sprite.x >= h.x) ? 1 : -1;
        source.sprite.setVelocity(dir * 240, -130);
        this.showFloat(source.sprite.x, source.sprite.y - 84, '被挡开', '#ffd76a', 14);
      }
      // 正面的弹幕一并挡开（与完美闪避的「化解弹幕」对称）
      this.clearNearbyProjectiles(h.x, h.y, 130);
      var fx = this.add.circle(h.x + (h.flipX ? -22 : 22), h.y - 34, 14, 0xffd76a, 0.3).setDepth(11);
      fx.setStrokeStyle(3, 0xffd76a, 0.95);
      this.tweens.add({ targets: fx, radius: 64, alpha: 0, duration: 240, onComplete: function () { fx.destroy(); } });
      this.spark(h.x + (h.flipX ? -22 : 22), h.y - 34, 0xffd76a);
      this.refreshHud();
      return 'blocked';
    }

    // ---------- 连招 ----------
    /** 远程连招定义：RANGED_CHAIN 的数值 + 本英雄的招式名 */
    rangedChain(rg, key) {
      var c = RANGED_CHAIN[key];
      if (!c) return null;
      var out = {};
      for (var k in c) out[k] = c[k];
      out.name = rangedChainName(rg, key, c.name);
      out.ranged = key;
      return out;
    }

    /**
     * 攻击时先判定「接的是哪一招」，优先级：盾反 > 突进斩 > 落地斩 > 三连斩
     * 返回 null 表示这一下就是普通攻击。
     * 远程英雄（游侠 / 法师 / 贤者）走**完全相同**的判定与窗口，
     * 只是每一招换成了远程版本（反击箭 / 连珠箭 / 踏地箭 / 三连散）。
     */
    pickChain(now) {
      var rg = this.heroRanged();
      if (now < this.counterUntil) {
        this.counterUntil = 0; this.chainCount = 0; this.chainUntil = 0;
        return rg ? this.rangedChain(rg, 'counter')
          : { name: '盾反', mult: GUARD.counterMult, range: 1.15, lunge: GUARD.counterLunge, forceCrit: true, color: '#ffd76a' };
      }
      if (now < this.dodgeCounterUntil) {
        this.dodgeCounterUntil = 0; this.chainCount = 0; this.chainUntil = 0;
        return rg ? this.rangedChain(rg, 'roll')
          : { name: '突进斩', mult: CHAIN.dodgeMult, range: 1.2, lunge: CHAIN.dodgeLunge, color: '#8ad8ff' };
      }
      if (now < this.diveCounterUntil) {
        this.diveCounterUntil = 0; this.chainCount = 0; this.chainUntil = 0;
        return rg ? this.rangedChain(rg, 'land')
          : { name: '落地斩', mult: CHAIN.diveMult, range: 1.35, splash: true, color: '#ff9a5a' };
      }
      // 三连：窗口内连着按，第 3 下变招（近战横扫 / 远程三连散）
      if (now < this.chainUntil) this.chainCount = Math.min(this.chainCount + 1, CHAIN.sweepAt);
      else this.chainCount = 1;
      this.chainUntil = now + CHAIN.window;
      if (this.chainCount >= CHAIN.sweepAt) {
        this.chainCount = 0;
        return rg ? this.rangedChain(rg, 'triple')
          : { name: '横扫', mult: CHAIN.sweepMult, range: CHAIN.sweepRange, color: UI.gold };
      }
      return null;
    }

    /** 连招窗口开着时在主角头顶提示「接 J」 */
    updateChainHint() {
      var t = this.chainHint;
      if (!t) return;
      var now = this.time.now, label = '', color = UI.gold;
      var rg = this.heroRanged();
      var nm = function (key, fallback) { return rg ? rangedChainName(rg, key, fallback) : fallback; };
      if (now < this.counterUntil) { label = '接 J · ' + nm('counter', '盾反'); color = RANGED_CHAIN.counter.color; }
      else if (now < this.dodgeCounterUntil) { label = '接 J · ' + nm('roll', '突进斩'); color = RANGED_CHAIN.roll.color; }
      else if (now < this.diveCounterUntil) { label = '接 J · ' + nm('land', '落地斩'); color = RANGED_CHAIN.land.color; }
      else if (now < this.chainUntil && this.chainCount > 0) {
        label = '接 J · ' + (rg ? '连射 ' : '连斩 ') + this.chainCount + '/2';
        color = '#9fe0c0';
      }
      var show = !!label && this.running && !this.heroDead;
      if (t.visible !== show) t.setVisible(show);
      if (!show) return;
      t.setText(label).setColor(color);
      t.setPosition(this.hero.x, this.hero.y - 112);
    }

    /** 连招命中的表现：招式名 + 一圈对应色的冲击环 */
    chainFeedback(chain) {
      if (!chain) return;
      var h = this.hero;
      this.showFloat(h.x, h.y - 104, chain.name, chain.color, 20);
      var ring = this.add.circle(h.x, h.y - 34, 12, 0xffffff, 0.22).setDepth(11);
      var col = parseInt(chain.color.replace('#', ''), 16);
      ring.setFillStyle(col, 0.22); ring.setStrokeStyle(3, col, 0.9);
      this.tweens.add({ targets: ring, radius: 54, alpha: 0, duration: 240, onComplete: function () { ring.destroy(); } });
      sfx('crit');
    }

    /** 落地斩的小范围冲击（只补一次范围伤害） */
    chainSplash(chain) {
      if (!chain || !chain.splash) return;
      var h = this.hero, self = this;
      var radius = CHAIN.diveSplashR;
      var ring = this.add.circle(h.x, h.y - 8, 16, 0xff9a5a, 0.24).setDepth(11);
      ring.setStrokeStyle(3, 0xff9a5a, 0.9);
      this.tweens.add({ targets: ring, radius: radius, alpha: 0, duration: 260, onComplete: function () { ring.destroy(); } });
      this.enemies.forEach(function (e, idx) {
        if (!e.alive || (self.attackHits && self.attackHits[idx])) return;
        if (Math.abs(e.sprite.x - h.x) > radius || Math.abs(e.sprite.y - h.y) > radius * 0.9) return;
        if (self.attackHits) self.attackHits[idx] = true;
        self.damageEnemy(e, self.rollPlayerDamage(CHAIN.diveMult * CHAIN.diveSplash), false);
      });
    }

    // ============================================================
    //  诅咒与环境效果（实时化）
    //  名字与文字版试炼 / 经典模式完全一致，落点写在 试炼2D 的各个结算口上。
    //  「每回合」类统一走腐化脉冲；会永久削人的两类改成「清空房间后恢复」。
    // ============================================================
    /** 宿主传入当前诅咒与环境（开新局 / 深入下一层时调用） */
    setCursesAndEnv(curses, env) {
      this.curses = (curses || []).filter(function (n) { return !!curseByName(n); });
      this.worldEnv = (env && env.name && envByName(env.name)) ? env : null;
      this.updateCurseHud();
      return { curses: this.curses.slice(), env: this.worldEnv ? this.worldEnv.name : null };
    }

    hasCurse(name) { return !!(this.curses && this.curses.indexOf(name) >= 0); }
    envValue(key, fallback) {
      var v = this.worldEnv && this.worldEnv.values ? this.worldEnv.values[key] : undefined;
      return (typeof v === 'number') ? v : (fallback || 0);
    }
    hasEnv(name) { return !!(this.worldEnv && this.worldEnv.name === name); }

    /** 环境对伤害的整体缩放（虚弱之雾 / 能量涌动 / 厄运 / 虚弱诅咒） */
    envPlayerDamageMult() {
      var m = 1;
      if (this.hasEnv('虚弱之雾')) m *= (1 - this.envValue('attackReduction'));
      if (this.hasEnv('能量涌动')) m *= (1 + this.envValue('attackBonus'));
      return Math.max(0.1, m);
    }
    /** 受到的伤害缩放（厄运 + 易伤诅咒 + 荆棘诅咒） */
    damageTakenMult() {
      var m = 1;
      if (this.hasEnv('厄运')) m *= (1 + this.envValue('extraDamage'));
      return m;
    }
    damageTakenFlat() {
      var f = 0;
      if (this.hasCurse('易伤')) f += 2;
      if (this.hasCurse('荆棘诅咒')) f += 1;
      return f;
    }
    /** 治疗缩放（治疗抑制环境 + 祭坛/技能；药水另有「药水衰减」诅咒） */
    healMult(isPotion) {
      var m = 1;
      if (this.hasEnv('治疗抑制')) m *= (1 - this.envValue('healReduction'));
      if (isPotion && this.hasCurse('药水衰减')) m *= 0.5;
      return clamp(m, 0, 1);
    }
    /** 敌人的暴击与闪避（幸运 / 暴击共振 / 闪避领域给的是「所有单位」） */
    envEnemyCrit() {
      var rate = this.hasEnv('幸运') ? this.envValue('luckyBonus') : 0;
      if (rate <= 0 || Math.random() >= rate) return 1;
      var mult = 1.5 + (this.hasEnv('暴击共振') ? this.envValue('critDamageBonus') : 0);
      return mult;
    }
    envEnemyDodge() { return this.hasEnv('闪避领域') ? this.envValue('dodgeBonus') : 0; }
    /** 玩家暴击率 / 暴击伤害的环境加成（幸运 / 暴击共振） */
    envPlayerCrit() {
      var rate = this.hasEnv('幸运') ? this.envValue('luckyBonus') : 0;
      var dmg = 1 + (this.hasEnv('暴击共振') ? this.envValue('critDamageBonus') : 0);
      return { rate: rate, dmg: dmg };
    }

    /**
     * 腐化脉冲：每 5 秒结算一次所有「每回合」类效果
     * 顺序固定（先扣护盾再扣血），并给一次可见的脉冲提示 —— 玩家能预期到它
     */
    applyPulse() {
      var h = this.hero, msgs = [];
      if (!this.running || this.heroDead) return;
      var eco = 0x9a8ef0;

      // --- 诅咒 ---
      var shieldLoss = 0;
      if (this.hasCurse('脆弱')) shieldLoss += 2;
      if (this.hasCurse('护甲腐蚀')) shieldLoss += 1;
      if (shieldLoss > 0 && h.shield > 0) {
        var used = Math.min(h.shield, shieldLoss);
        h.shield -= used;
        this.showFloat(h.x, h.y - 84, '诅咒 · 护盾 -' + used, UI.danger, 15);
        msgs.push('护盾 -' + used);
      }
      if (this.hasCurse('生命流失')) {
        h.hp = Math.max(1, h.hp - 1);
        this.showFloat(h.x, h.y - 66, '诅咒 · 生命 -1', UI.danger, 15);
        msgs.push('生命 -1');
      }
      if (this.hasCurse('虚弱')) {
        h.attack = Math.max(1, h.attack - 1);
        msgs.push('攻击 -1');
      }
      if (this.hasCurse('迟钝')) {
        h.dodge = Math.max(0, h.dodge - 5);
        msgs.push('闪避 -5%');
      }

      // --- 环境：护盾崩坏 / 缓慢凋零 / 时间扭曲 / 能量涌动自伤 / 能量导管 ---
      if (this.hasEnv('护盾崩坏') && h.shield > 0) {
        var sl = Math.max(1, Math.round(h.shield * this.envValue('shieldLoss')));
        h.shield = Math.max(0, h.shield - sl);
        this.showFloat(h.x, h.y - 90, '环境 · 护盾 -' + sl, '#b8a8ff', 14);
        msgs.push('环境 · 护盾 -' + sl);
      }
      if (this.hasEnv('能量涌动')) {
        var sd = Math.max(1, Math.round(h.maxHp * this.envValue('selfDamage')));
        h.hp = Math.max(1, h.hp - sd);
        this.showFloat(h.x, h.y - 72, '能量涌动 -' + sd, '#ffb060', 14);
        msgs.push('环境 · 生命 -' + sd);
      }
      if (this.hasEnv('能量导管')) {
        var sg = Math.max(1, Math.round(h.maxHp * this.envValue('shieldGain')));
        this.addShield(sg, null);
        msgs.push('环境 · 护盾 +' + sg);
      }
      if (this.hasEnv('缓慢凋零')) {
        var dec = Math.max(1, Math.round(h.maxHp * this.envValue('decay')));
        h.maxHp = Math.max(6, h.maxHp - dec);
        h.hp = Math.min(h.hp, h.maxHp);
        this.showFloat(h.x, h.y - 78, '凋零 · 生命上限 -' + dec, '#b8a8ff', 14);
        msgs.push('环境 · 生命上限 -' + dec);
      }
      if (this.hasEnv('时间扭曲')) {
        var tw = Math.max(1, Math.round(h.hp * this.envValue('timeLoss')));
        h.hp = Math.max(1, h.hp - tw);
        this.showFloat(h.x, h.y - 84, '时间扭曲 -' + tw, '#b8a8ff', 14);
        msgs.push('环境 · 生命 -' + tw);
      }
      // 敌人也吃脉冲类环境（缓慢凋零 / 时间扭曲）
      var self = this;
      this.enemies.forEach(function (e) {
        if (!e.alive) return;
        if (self.hasEnv('缓慢凋零')) {
          var ed = Math.max(1, Math.round(e.maxHp * self.envValue('decay')));
          e.maxHp = Math.max(1, e.maxHp - ed);
          e.hp = Math.min(e.hp, e.maxHp);
          if (e.hp <= 0) self.damageEnemy(e, { dmg: 0, crit: false }, false);
        }
        if (self.hasEnv('时间扭曲')) {
          var et = Math.max(1, Math.round(e.hp * self.envValue('timeLoss')));
          e.hp = Math.max(1, e.hp - et);
        }
      });

      // 脉冲表现：一圈紫环 + 轻微震屏 + **屏幕中间的横幅**（玩家能预期到这一下，也能看清扣了什么）
      var ring = this.add.circle(h.x, h.y - 30, 16, eco, 0.22).setDepth(11);
      ring.setStrokeStyle(3, eco, 0.85);
      this.tweens.add({ targets: ring, radius: 96, alpha: 0, duration: 380, onComplete: function () { ring.destroy(); } });
      sfx('curse');
      // HUD 上的诅咒胶囊同步闪一下：屏幕中间有横幅、右上角有落点，不再是「只有一圈光」
      this.curseFlashUntil = this.time.now + ENV.flash;
      // 以前这条只在「生命流失 / 虚弱 / 迟钝」命中时才弹，其余情况（脆弱、护甲腐蚀、纯环境类…）
      // 屏幕中间什么都没有，只剩光圈 —— 现在无论扣了什么都会弹，并逐条写清
      this.showCenter('腐化脉冲' + (msgs.length ? ' · ' + msgs.join(' / ') : ''), '#c79aff');
      this.refreshHud();
      if (h.hp <= 0) this.heroDie();
    }

    /**
     * 当前环境效果在这套实时战斗里**实际是什么**
     * 用 WORLD_ENVS 的 rt 文案（"在 2D 里变成什么"），把 {值} 换成宿主给的真实数值。
     * 例：厄运 → 「双方受到伤害 ×(1+21.0%)」；荆棘之地 → 「每次命中敌人，自己也掉 3.2% 当前生命…」
     */
    envSummaryText() {
      var e = this.worldEnv;
      if (!e) return '';
      var def = envByName(e.name);
      var tpl = def ? (def.rt || '') : (e.description || '');
      var vals = e.values || {};
      var keys = Object.keys(vals);
      return String(tpl).replace(/\{(\w+)\}/g, function (m, key) {
        var v = vals[key];
        // 兼容 {value}：池子里只有唯一一个数值字段时直接取它（与 formatEnvDescription 同一套规则）
        if ((v === undefined || v === null) && key === 'value' && keys.length === 1) v = vals[keys[0]];
        if (typeof v !== 'number') return m;
        if (Math.abs(v) < 1) return (v * 100).toFixed(1) + '%';
        return String(Math.round(v * 10) / 10);
      });
    }

    /**
     * 右上角信息胶囊的底板（环境 / 诅咒共用同一套语言）
     * 圆角 + 1px 语义色描边 + 顶部内高光 + 左侧菱形标记；flash 让换内容时闪一下。
     */
    paintInfoBox(g, mk, pw, h, color, flash) {
      if (!g || !mk) return;
      g.clear();
      g.fillStyle(0x140f26, 0.62);
      g.fillRoundedRect(-pw, 0, pw, h, 12);
      g.fillStyle(0xffffff, 0.03);
      g.fillRoundedRect(-pw + 1, 1, pw - 2, Math.max(2, h * 0.2), 11);
      g.lineStyle(1, color, 0.20 + 0.55 * flash);
      g.strokeRoundedRect(-pw, 0, pw, h, 12);
      mk.clear();
      var mx = -pw + ENV.padX + 3, my = ENV.padY + 5;
      mk.fillStyle(color, 0.75 + 0.25 * flash);
      mk.beginPath();
      mk.moveTo(mx, my - 5); mk.lineTo(mx + 5, my); mk.lineTo(mx, my + 5); mk.lineTo(mx - 5, my);
      mk.closePath(); mk.fillPath();
    }

    /** 环境面板底板（紫色） */
    paintEnvPanelBg(h, flash) {
      this.paintInfoBox(this.envBg, this.envMark, this._envPanelW || ENV.panelW, h, 0xb8a8ff, flash);
      this._envBgFlash = flash;
    }

    /** 诅咒胶囊底板（红色） */
    paintCurseBg(h, flash) {
      this.paintInfoBox(this.curseBg, this.curseMark, this._envPanelW || ENV.panelW, h, 0xe86878, flash);
      this._curseBgFlash = flash;
    }

    /**
     * 右上角整列的排版：**诅咒 → 环境 → 腐化脉冲倒计时**，紧贴在「房间 · 已探索」下方
     * 两块都是同一套胶囊（菱形标记 + 小标签 + 内容），高度各自按内容现算，下面的依次让位。
     */
    layoutEnvHud(sizeW) {
      if (!this.envPanel || !this.cursePanel) return;
      var W = sizeW || this.scale.width;
      if (W < 40) return;
      var k = clamp(Math.min(W / 900, 1), 0.68, 1);
      var pw = Math.round(Math.min(ENV.panelW * Math.max(0.9, k), Math.max(180, W - 96)));
      this._envPanelW = pw;

      var padX = ENV.padX, padY = ENV.padY, textX = -pw + padX + 12;
      var wrapW = Math.max(80, pw - padX - 12 - padX);

      // ===== 环境面板内容行 =====
      var rowLab = padY + 1;              // 「本房间环境」+ 数值
      var rowName = rowLab + 15;          // 环境名（大字号）
      var rowEff = rowName + 23;          // 它在实时里实际是什么
      this.envLabel.setPosition(textX, rowLab);
      this.envName.setPosition(textX, rowName);
      this.envValueText.setPosition(-padX, rowLab + 1);
      this.envEffect.setPosition(textX, rowEff);
      this.envEffect.setWordWrapWidth(wrapW, true);
      var effH = this.envEffect.text ? this.envEffect.height : 0;
      var envH = rowEff + effH + padY - (effH ? 0 : 6);

      // ===== 诅咒胶囊：标签一行 + 名称列表若干行（先定宽再读高，换行会改 height）=====
      this.curseLabel.setPosition(textX, padY + 1);
      this.curseText.setPosition(textX, padY + 16);
      this.curseText.setWordWrapWidth(wrapW, true);
      var curseH = padY + 16 + this.curseText.height + padY - 4;

      // ===== 从「房间 · 已探索」下面开始往下堆 =====
      var top = ((this.roomText ? this.roomText.y : 86) + ENV.gapRoom);
      // 层主血条压在顶部中间（y≈100）：窄屏时这一列会钻到它底下，整体下移一行让开
      var bm = this.bossMeter;
      if (this.boss && this.boss.alive && bm && bm.w && (W - 24 - pw) < (bm.x + bm.w + 8) && top < ENV.bossClear) {
        top = ENV.bossClear;
      }
      // 窄屏：左右两列撞上时，整列下移到左侧 HUD 之下（下限由 layoutHudButtons 算出）
      if (this._envHudMinTop > top) top = this._envHudMinTop;

      var curseFlash = Math.max(0, Math.min(1, ((this.curseFlashUntil || 0) - this.time.now) / ENV.flash));
      this.cursePanel.setPosition(W - 24, top);
      this._cursePanelH = curseH;
      this._curseTop = top;
      this.paintCurseBg(curseH, curseFlash);

      // 环境面板紧跟在诅咒胶囊下方（诅咒隐藏时它就顶到第一位）
      var envTop = top + (this.cursePanel.visible ? curseH + ENV.gapCurse : 0);
      this.envPanel.setPosition(W - 24, envTop);
      this._envPanelH = envH;
      this._envPanelTop = envTop;
      var envFlash = Math.max(0, Math.min(1, ((this.envFlashUntil || 0) - this.time.now) / ENV.flash));
      this.paintEnvPanelBg(envH, envFlash);

      // 脉冲倒计时垫底
      if (this.pulseText) {
        var bottom = (this.envPanel.visible ? (envTop + envH) : envTop);
        this.pulseText.setPosition(W - 24, bottom + ENV.gapCurse);
      }
    }

    /** 换房间换到新环境：面板整体闪一下再落位（一次有节制的提示，不抢画面中心） */
    flashEnvPanel() {
      if (!this.envPanel) return;
      this.tweens.killTweensOf(this.envPanel);
      this.envPanel.setAlpha(0.3);
      this.tweens.add({ targets: this.envPanel, alpha: 1, duration: 260, ease: 'Cubic.easeOut' });
      sfx('env');
    }

    /** 诅咒胶囊 + 环境面板（HUD 右上角「房间 · 已探索」下方，诅咒在上、环境在下） */
    updateCurseHud() {
      if (!this.cursePanel || !this.envPanel) return;
      var hasEnv = !!this.worldEnv;
      var hasCurse = !!(this.curses && this.curses.length);

      // --- 环境面板 ---
      if (this.envPanel.visible !== hasEnv) this.envPanel.setVisible(hasEnv);
      if (hasEnv) {
        this.envName.setText(this.worldEnv.name);
        this.envValueText.setText(this.worldEnv.displayValue || '');
        var sum = this.envSummaryText();
        if (this.envEffect.text !== sum) this.envEffect.setText(sum);
        // 环境换了（换了房间）：闪一下，让「这次是什么」有机会被看见
        if (this._envShownName !== this.worldEnv.name) {
          var isChange = !!this._envShownName;
          this._envShownName = this.worldEnv.name;
          this.envFlashUntil = this.time.now + ENV.flash;
          if (isChange) this.flashEnvPanel();
        }
      } else {
        this._envShownName = null;
      }

      // --- 诅咒胶囊 ---
      if (this.cursePanel.visible !== hasCurse) this.cursePanel.setVisible(hasCurse);
      if (hasCurse) this.curseText.setText(this.curses.join(' · '));

      this.layoutEnvHud();
      this.updatePulseHud();
    }

    /** 脉冲倒计时（垫在最下面，最后 1.5 秒转红）+ 环境 / 诅咒胶囊高亮的逐帧衰减 */
    updatePulseHud() {
      // 高亮衰减：只在还亮着的时候重画，避免每帧刷 Graphics
      if ((this.envFlashUntil || 0) > 0) {
        var eLeft = ((this.envFlashUntil || 0) - this.time.now) / ENV.flash;
        var eFlash = eLeft > 1 ? 1 : (eLeft > 0 ? eLeft : 0);
        if (this.envPanel.visible && Math.abs((this._envBgFlash || 0) - eFlash) > 0.02) {
          this.paintEnvPanelBg(this._envPanelH || 30, eFlash);
        }
        if (eFlash <= 0) this.envFlashUntil = 0;
      }
      if ((this.curseFlashUntil || 0) > 0) {
        var cLeft = ((this.curseFlashUntil || 0) - this.time.now) / ENV.flash;
        var cFlash = cLeft > 1 ? 1 : (cLeft > 0 ? cLeft : 0);
        if (this.cursePanel.visible && Math.abs((this._curseBgFlash || 0) - cFlash) > 0.02) {
          this.paintCurseBg(this._cursePanelH || 40, cFlash);
        }
        if (cFlash <= 0) this.curseFlashUntil = 0;
      }
      if (!this.pulseText) return;
      var on = this.running && !this.heroDead && ((this.curses && this.curses.length) || this.worldEnv);
      if (this.pulseText.visible !== !!on) this.pulseText.setVisible(!!on);
      if (!on) return;
      var leftMs = Math.max(0, this.pulseAt - this.time.now);
      var urgent = leftMs <= PULSE.warn;
      var txt = '腐化脉冲 ' + (leftMs / 1000).toFixed(1) + 's';
      if (this.pulseText.text !== txt) this.pulseText.setText(txt);
      this.pulseText.setColor(urgent ? UI.danger : UI.muted);
      this.pulseText.setAlpha(urgent ? (0.6 + 0.4 * Math.abs(Math.sin(this.time.now / 160))) : 1);
    }

    // ---------- 狂怒（实时重做）----------
    /** 攒怒：clamp 到上限，满了就开自动触发倒计时 */
    addFury(n, tag) {
      if (!this.running || this.heroDead || n <= 0) return 0;
      if (this.furyActive()) return 0;                 // 狂怒期间不再攒（避免自己喂自己）
      var before = this.fury;
      this.fury = Math.min(FURY.max, this.fury + n);
      var gained = Math.round(this.fury - before);
      if (gained > 0) {
        if (this.fury >= FURY.max && !this._furyFull) {
          this._furyFull = true;
          this.furyAutoAt = this.time.now + FURY.autoDelay;
          this.showFloat(this.hero.x, this.hero.y - 118, '狂怒已满 · 按 R 爆发', '#ffd76a', 16);
          sfx('levelUp');
        }
        if (tag && gained >= 3) this.showFloat(this.hero.x + rnd(-16, 16), this.hero.y - 104, '+' + gained + ' 怒', '#ffb347', 12);
      }
      this.paintFuryMeter();
      return gained;
    }

    furyActive() { return this.furyUntil > this.time.now; }
    furyLeft() { return Math.max(0, this.furyUntil - this.time.now); }

    /** 按 R（或触摸「狂怒」钮）：满怒即可进入狂怒状态 */
    tryFury() {
      var now = this.time.now;
      if (!this.running || this.heroDead) return false;
      if (this.mapOpen || this.shopOpen || this.codexOpen || this.deathOpen || this.confirmOpen || this._viewPaused) return false;
      if (this.furyActive()) { this.showFloat(this.hero.x, this.hero.y - 84, '狂怒进行中', UI.gold, 14); return false; }
      if (this.fury < FURY.max) {
        this.showFloat(this.hero.x, this.hero.y - 84, '狂怒值未满 ' + Math.floor(this.fury) + '/' + FURY.max, UI.muted, 14);
        sfx('error');
        return false;
      }
      this.enterFury(true);
      return true;
    }

    /** 进入狂怒状态：清空狂怒值，换来 6 秒全面强化 */
    enterFury(manual) {
      var now = this.time.now, h = this.hero;
      this.fury = 0;
      this._furyFull = false;
      this.furyAutoAt = 0;
      this.furyUntil = now + FURY.duration;
      this.showCenter(manual ? '狂怒爆发！' : '狂怒自动爆发！', '#ffd76a');
      this.showFloat(h.x, h.y - 96, '狂怒 · 攻速 +35% 伤害 +50%', '#ffd76a', 15);
      sfx('skill');
      sfx('battleStart');
      this.cameras.main.flash(120, 255, 180, 90);
      if (state.settings.screenShake2D !== false) this.cameras.main.shake(160, 0.008);
      var ring = this.add.circle(h.x, h.y - 30, 18, 0xffd76a, 0.3).setDepth(11);
      ring.setStrokeStyle(4, 0xffd76a, 0.95);
      this.tweens.add({ targets: ring, radius: 150, alpha: 0, duration: 380, onComplete: function () { ring.destroy(); } });
      this.spark(h.x, h.y - 30, 0xffd76a);
      this.paintFuryMeter();
      this.refreshHud();
    }

    /** 狂怒状态的逐帧表现与结束判定 */
    updateFury(dt) {
      var h = this.hero, now = this.time.now;
      var on = this.furyActive();
      if (on) {
        if (this._furyWasOn !== true) { this._furyWasOn = true; }
        // 金色怒焰：持续从脚边升起火星 + 身周金环
        if (Math.random() < 0.55) this.spark(h.x + rnd(-18, 18), h.y - rnd(0, 46), 0xffb347);
        if (this.furyRing) {
          this.furyRing.setVisible(true);
          this.furyRing.setPosition(h.x, h.y - 28);
          var pulse = 0.22 + 0.12 * Math.sin(now / 110);
          this.furyRing.setRadius(26 + 3 * Math.sin(now / 140));
          this.furyRing.setFillStyle(0xffd76a, pulse);
        }
      } else {
        if (this._furyWasOn === true) {
          this._furyWasOn = false;
          this.showFloat(h.x, h.y - 92, '狂怒结束', UI.muted, 14);
        }
        if (this.furyRing && this.furyRing.visible) this.furyRing.setVisible(false);
      }
      // 满怒但没按：到点自动进入（不浪费）
      if (!on && this.fury >= FURY.max && this.furyAutoAt && now >= this.furyAutoAt) this.enterFury(false);
      this.paintFuryMeter();
    }

    /** 狂怒条的实时重绘（条体 + 满怒呼吸 + 自动爆发倒计时） */
    paintFuryMeter() {
      if (!this.furyMeter) return;
      var now = this.time.now;
      var on = this.furyActive();
      var ratio = on ? (this.furyLeft() / FURY.duration) : (this.fury / FURY.max);
      this.setMeterValue(this.furyMeter, ratio);
      var full = !on && this.fury >= FURY.max;
      var tint = on ? 0xffe6a0 : (full ? 0xffd76a : 0xffffff);
      if (this.furyMeter.fill.tintTopLeft !== tint) this.furyMeter.fill.setTint(tint);
      // 满怒：条体呼吸；狂怒中：条体显示剩余时间
      var alpha = 1;
      if (full) alpha = 0.72 + 0.28 * Math.abs(Math.sin(now / 180));
      if (this.furyMeter.fill.alpha !== alpha) { try { this.furyMeter.fill.setAlpha(alpha); } catch (e) { /* 忽略 */ } }
      if (this.furyText) {
        var txt;
        if (on) txt = '狂怒 ' + (this.furyLeft() / 1000).toFixed(1) + 's';
        else if (full) txt = '狂怒就绪 · R';
        else txt = '狂怒 ' + Math.floor(this.fury) + '/' + FURY.max;
        if (this.furyText.text !== txt) this.furyText.setText(txt);
        var col = on ? UI.gold : (full ? UI.gold : UI.sub);
        this.furyText.setColor(col);
        if (this.furyTextPos) {
          // 条被缩放 / 被移走后，数字要跟着条的**实际**右边缘走（见 meterTextX）
          var fx = this.meterTextX(this.furyMeter, this.furyTextPos.gap);
          this.furyText.setPosition(fx == null ? this.furyTextPos.gap : fx, this.furyTextPos.y);
        }
      }
      // 「R 狂怒」提示（满怒或进行中都显示，位置贴条尾）
      if (this.furyHint) {
        var show = this.running && !this.heroDead && (full || on);
        if (this.furyHint.visible !== show) this.furyHint.setVisible(show);
        if (show && this.furyHintPos) this.furyHint.setPosition(this.furyHintPos.x, this.furyHintPos.y);
      }
      if (this.isTouch && this.btnFury) {
        this.btnFury.setFillStyle(full ? 0xffd76a : (on ? 0xffb347 : 0x6a5a30), full ? 0.5 : (on ? 0.4 : 0.18));
      }
    }

    /**
     * 屏幕外的存活敌人 → 在对应的屏幕边缘画一个金色箭头
     * ------------------------------------------------------------
     * 关卡有两屏宽，怪还可能站在高台上。「剩余敌人 1」却怎么也找不到那一个，
     * 是这套 2D 试炼里最容易被当成 bug 的情况 —— 给个方向就不必满地图瞎找。
     */
    updateOffscreenEnemyMarkers() {
      if (!this.enemyMarkers) {
        this.enemyMarkers = this.add.graphics().setDepth(30).setScrollFactor(0);
      }
      var g = this.enemyMarkers;
      g.clear();
      if (!this.running || this.heroDead) return;
      var cam = this.cameras.main;
      var W = this.scale.width, H = this.scale.height;
      this.enemies.forEach(function (e) {
        if (!e.alive) return;
        var sx = e.sprite.x - cam.scrollX;
        var sy = e.sprite.y - cam.scrollY;
        var offX = (sx < -8) ? -1 : (sx > W + 8 ? 1 : 0);
        var offY = (sy < -8) ? -1 : (sy > H + 8 ? 1 : 0);
        if (!offX && !offY) return;
        var x, y, ax, ay;
        g.fillStyle(0xffd76a, 0.92);
        g.beginPath();
        if (offX) {
          // 这一关是横向的，优先指左右
          x = offX < 0 ? 16 : W - 16;
          y = clamp(sy, 56, H - 56);
          ax = (offX < 0) ? -9 : 9;
          g.moveTo(x + ax, y);
          g.lineTo(x - ax * 0.55, y - 11);
          g.lineTo(x - ax * 0.55, y + 11);
        } else {
          // 上下也指：敌人跑到很高处、或万一沉到地面以下时，玩家至少知道往下找
          y = offY < 0 ? 56 : H - 56;
          x = clamp(sx, 26, W - 26);
          ay = (offY < 0) ? -9 : 9;
          g.moveTo(x, y + ay);
          g.lineTo(x - 11, y - ay * 0.55);
          g.lineTo(x + 11, y - ay * 0.55);
        }
        g.closePath();
        g.fillPath();
        g.lineStyle(1, 0x04060f, 0.6);
        g.strokePath();
      });
    }

    /** 完美防御 / 连招 / 命中 / 击杀 / 挨打 的攒怒口 */
    furyOnHit(e, chain) {
      var tier = (e && e.tier) || 'normal';
      var g = FURY.gainHit[tier] || FURY.gainHit.normal;
      if (chain) g += FURY.gainChain;
      this.addFury(g, chain ? chain.name : null);
    }

    damageHero(dmg, source, ignoreInvuln, fromX) {
      if (this.heroDead || !this.running) return false;
      var now = this.time.now;
      if (!ignoreInvuln && now < this.invulnUntil) {
        // 无敌帧挡下攻击：闪避起手 150ms 内的即是「完美闪避」
        if (this.dodging && now - this.dodgeStartAt <= DODGE.perfect) this.onPerfectDodge();
        return 'immune';
      }

      // 环境 / 诅咒对「承受伤害」的修正（厄运 ×、易伤 +2、荆棘诅咒 +1）
      if (!ignoreInvuln) {
        dmg = dmg * this.damageTakenMult() + this.damageTakenFlat();
        // 狂怒状态：狂暴而不设防 —— 受到的伤害 +15%
        if (this.furyActive()) dmg *= FURY.takenMult;
        // 敌人的暴击（幸运 / 暴击共振）
        if (source && source.sprite) {
          var ec = this.envEnemyCrit();
          if (ec > 1) {
            dmg *= ec;
            this.showFloat(source.sprite.x, source.sprite.y - 96, '环境暴击', '#b8a8ff', 14);
          }
        }
      }

      // 防御（举盾）：正面减伤、背后不减伤；刚举起来的窗口内挡下 = 完美格挡
      var blockedFront = false;
      if (!ignoreInvuln && this.guarding && now >= this.guardStartAt + GUARD.raise) {
        var ax = (fromX !== undefined && fromX !== null) ? fromX
          : (source && source.sprite ? source.sprite.x : null);
        var facing = this.hero.flipX ? -1 : 1;
        var frontal = (ax === null) ? true : ((ax - this.hero.x) * facing >= -14);
        if (frontal) {
          var g = this.updateGuard(16.7, true);
          if (g === -1) return this.onPerfectBlock(source);
          dmg = Math.max(1, dmg * GUARD.front);
          blockedFront = true;
        } else {
          this.showFloat(this.hero.x, this.hero.y - 88, '背后!', '#ff9a5a', 15);
        }
      }

      // 闪避
      if (!ignoreInvuln && this.hero.dodge > 0 && Math.random() < (this.hero.dodge / 100)) {
        this.showFloat(this.hero.x, this.hero.y - 62, '闪避', '#8ab8ff', 18);
        sfx('dodge');
        this.invulnUntil = now + 280;
        this.onDodgeSuccess();
        return 'dodged';
      }

      // 护盾壁垒：4 秒内受到的伤害减半
      if (this.guardUntil && now < this.guardUntil) dmg = Math.max(1, dmg * 0.5);
      var remain = Math.round(dmg);
      if (this.hero.shield > 0) {
        var use = Math.min(this.hero.shield, remain);
        this.hero.shield -= use;
        remain -= use;
        this.showFloat(this.hero.x, this.hero.y - 80, '-' + fmt(use), '#5fd0e0', 16);
        sfx('shield');
      }
      if (remain > 0) {
        this.hero.hp -= remain;
        this.showFloat(this.hero.x, this.hero.y - 62, '-' + fmt(remain), '#ff6b6b', 18);
        // 挡下来的这一下不该把角色打得后仰 —— 盾还举着，人站着
        if (!blockedFront && !this.furyActive()) {
          this.hero.play('hero_hurt', true);
          this.hero.setTint(0xff8080);
          var self = this;
          this.time.delayedCall(140, function () { if (!self.heroDead) self.hero.clearTint(); });
        } else {
          this.spark(this.hero.x + (this.hero.flipX ? -22 : 22), this.hero.y - 34, blockedFront ? 0xffd76a : 0xffb347);
        }
      } else {
        this.showFloat(this.hero.x, this.hero.y - 80, blockedFront ? '格挡' : '护盾抵挡', blockedFront ? '#ffd76a' : '#5fd0e0', 15);
      }
      // 挡下的一下只给短促缓冲：举盾不是无敌，一直举着照样会被磨
      this.invulnUntil = now + (blockedFront ? 260 : 700);
      // 狂怒：挨打也攒怒（逆风翻盘的手感）
      if (remain > 0) this.addFury(FURY.gainHurt);
      if (state.settings.screenShake2D !== false) this.cameras.main.shake(140, 0.008);

      if (this.hero.thorn > 0 && source) this.damageEnemy(source, { dmg: this.hero.thorn, crit: false }, true);
      if (remain > 0) sfx('hurt');

      // 环境：荆棘之地（敌人出手也要被反噬）+ 吸血诅咒（敌人回血）+ 连击风暴（敌人再补一下）
      if (source && source.alive && source.sprite) {
        if (this.hasEnv('荆棘之地')) {
          var rb = Math.max(1, Math.round(source.hp * this.envValue('rebound')));
          source.hp = Math.max(0, source.hp - rb);
          this.showFloat(source.sprite.x, source.sprite.y - 76, '荆棘反噬 -' + rb, '#c8ff9a', 14);
          if (source.hp <= 0) this.killEnemy(source);
        }
        if (this.hasEnv('吸血诅咒') && source.alive) {
          var ls = Math.max(1, Math.round(source.maxHp * this.envValue('lifesteal')));
          source.hp = Math.min(source.maxHp, source.hp + ls);
          this.showFloat(source.sprite.x, source.sprite.y - 92, '吸血 +' + ls, '#ff8ab0', 13);
        }
        if (this.hasEnv('连击风暴') && remain > 0 && Math.random() < this.envValue('comboBonus') && !this.heroDead) {
          this.showFloat(source.sprite.x, source.sprite.y - 108, '连击风暴', '#b8a8ff', 14);
          this.damageHero(Math.round(dmg * 0.6), null, false, source.sprite.x);
        }
      }

      this.refreshHud();
      if (this.hero.hp <= 0) this.heroDie();
      return remain > 0 ? 'hit' : 'shield';
    }

    healHero(amount, showText, isPotion) {
      if (this.heroDead) return 0;
      var m = this.healMult(isPotion);
      var before = this.hero.hp;
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + amount * m);
      var real = Math.round(this.hero.hp - before);
      if (real > 0 && showText !== false) this.showFloat(this.hero.x, this.hero.y - 68, '+' + real, '#7fd6a0', 17);
      else if (real <= 0 && m < 1 && showText !== false) this.showFloat(this.hero.x, this.hero.y - 68, '治疗被抑制', '#b8a8ff', 13);
      this.refreshHud();
      return real;
    }

    usePotion() {
      if (!this.running || this.heroDead) return;
      if (this.hero.potions <= 0) { this.showFloat(this.hero.x, this.hero.y - 68, '没有药水', '#ffb347', 15); sfx('error'); return; }
      this.hero.potions--;
      this.healHero(Math.round(this.hero.maxHp * 0.35), true, true);
      sfx('potion');
      this.refreshHud();
    }

    // ---------- 特效 ----------
    /** 血条逐帧补间（数值同步在 refreshHud / setMeterValue） */
    updateMeters(dt, now) {
      if (this.heroMeter) this.updateMeter(this.heroMeter, dt, now);
      if (this.shieldMeter) this.updateMeter(this.shieldMeter, dt, now);
      if (this.bossMeter && this.boss) this.updateMeter(this.bossMeter, dt, now);
      if (this.targetMeter && this.targetPanel && this.targetPanel.visible) {
        this.updateMeter(this.targetMeter, dt, now);
      }
    }

    /**
     * 属性面板的行列参数（layoutStatPanel 与 layoutHudButtons 共用）
     * 抽出来是因为「英雄技能 / 常驻按钮」要接着属性面板往下排，
     * 必须按**当前宽度**算行数，不能读上一次布局留下的值（开局时宽度可能是 0）。
     */
    statPanelMetrics(sizeW) {
      var W = sizeW || this.scale.width;
      // 触摸设备 + 低高度横屏（手机横着拿）：这 8 个小格（攻/暴/闪/盾/棘/吸/连/斩）
      // 在整场战斗里一个数字都不会变，却是左侧 HUD 里最密的一块 —— 2 行 × 4 格。
      // 屏幕高度只有 ~360 时把它收起来：技能胶囊与功能按钮随之上移约 34px，
      // 把画面多让出来一条。想核对数值随时切「文字界面」。
      if (this.isTouch && this.scale.height < 460) {
        return { perRow: 4, step: 84, font: 12, rows: 0, top: 106, rowH: 18, bottom: 100 };
      }
      var perRow = W >= 880 ? 8 : (W >= 560 ? 4 : 3);
      var count = (this.statItems && this.statItems.length) || 8;
      var rows = Math.max(1, Math.ceil(count / perRow));
      return {
        perRow: perRow,
        step: perRow === 8 ? 74 : 84,
        font: W >= 560 ? 12 : 11,
        rows: rows,
        top: 106,
        rowH: 18,
        bottom: 106 + (rows - 1) * 18 + 9   // 最后一行的下沿（含半个行高）
      };
    }

    /** 属性面板布局：窄屏折行并缩小字号，避免越界；紧凑模式下（手机横屏）整块收起 */
    layoutStatPanel(sizeW) {
      if (!this.statItems || !this.statItems.length) return;
      var m = this.statPanelMetrics(sizeW);
      var collapsed = m.rows === 0;
      this.statItems.forEach(function (it, i) {
        it.box.setVisible(!collapsed);
        it.text.setVisible(!collapsed);
        if (collapsed) return;
        var row = Math.floor(i / m.perRow);
        var col = i % m.perRow;
        var x = 24 + col * m.step;
        var y = m.top + row * m.rowH;
        it.box.setPosition(x, y);
        it.text.setPosition(x + 13, y);
        it.text.setFontSize(m.font);
      });
      // 属性面板 → 英雄技能 → 常驻按钮：三层依次往下排
      this.hudStatBottom = m.bottom;
      this.hudBtnY = m.bottom + 14;   // 兼容旧字段（常驻按钮行的基准）
    }

    showFloat(x, y, text, color, size) {
      if (state.settings && state.settings.floatText === false) return;
      var t = this.floatPool.pop();
      if (!t) {
        t = this.add.text(0, 0, '', {
          fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
          stroke: '#000000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(60);
      }
      t.setVisible(true);
      t.setText(text);
      t.setColor(color || '#ffffff');
      t.setFontSize(size || 17);
      t.setPosition(x, y);
      t.setAlpha(1);
      t._life = 750;
      this.floats.push(t);
    }

    /** 飘字逐帧更新：复用对象，长时间战斗不产生垃圾 */
    updateFloats(dt) {
      var arr = this.floats;
      for (var i = arr.length - 1; i >= 0; i--) {
        var t = arr[i];
        t._life -= dt;
        t.y -= 0.075 * dt;
        t.setAlpha(clamp(t._life / 750, 0, 1));
        if (t._life <= 0) {
          t.setVisible(false);
          arr.splice(i, 1);
          if (this.floatPool.length < 60) this.floatPool.push(t);
          else t.destroy();
        }
      }
    }

    /** 火花发射器池：3 个轮转复用，不再每次命中都创建/销毁发射器 */
    getSparkEmitter() {
      if (!qp().particles || (state.settings && state.settings.particles === false)) return null;
      if (!this._sparkEmitters) {
        this._sparkEmitters = [];
        try {
          for (var i = 0; i < 3; i++) {
            var em = this.add.particles(0, 0, TEX.spark, {
              speed: { min: 70, max: 220 }, lifespan: 380, quantity: qp().count,
              scale: { start: 0.9, end: 0 }, blendMode: 'ADD', emitting: false
            });
            em.setDepth(50);
            this._sparkEmitters.push(em);
          }
        } catch (e) { this._sparkEmitters = []; }
      }
      if (!this._sparkEmitters.length) return null;
      this._sparkIdx = (this._sparkIdx || 0) + 1;
      return this._sparkEmitters[this._sparkIdx % this._sparkEmitters.length];
    }

    spark(x, y, color) {
      var em = this.getSparkEmitter();
      if (!em) return;
      try {
        if (typeof em.setParticleTint === 'function') em.setParticleTint(color);
        em.setPosition(x, y);
        em.explode(qp().count);
      } catch (e) { /* 忽略 */ }
    }

    showCenter(text, color) {
      // 长提示自动缩字号：脉冲横幅可能一口气列出四五条结算，30px 会在窄屏上横穿整屏
      var n = String(text || '').length;
      var size = n > 26 ? 20 : (n > 18 ? 24 : (n > 12 ? 27 : 30));
      this.centerMsg.setFontSize(size);
      this.centerMsg.setText(text).setColor(color || '#ffd76a').setAlpha(1).setScale(0.85);
      this.tweens.add({ targets: this.centerMsg, scale: 1, duration: 220, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.centerMsg, alpha: 0, delay: 1100, duration: 500 });
    }

    refreshHud() {
      var h = this.hero;
      // 生命 / 护盾：数值同步（补间由 updateMeters 逐帧推进）
      this.setMeterValue(this.heroMeter, h.hp / h.maxHp);
      this.setMeterValue(this.shieldMeter, h.shield / Math.max(1, h.maxHp));
      this.hpText.setText(Math.max(0, Math.round(h.hp)) + ' / ' + h.maxHp);
      this.shieldText.setText(h.shield > 0 ? '盾 ' + Math.round(h.shield) : '');
      var hx = this.meterTextX(this.heroMeter, this._hpTextGap);
      if (hx == null) hx = 286;
      var hy = this._hpTextY != null ? this._hpTextY : 34;
      this.hpText.setPosition(hx, hy);
      this.shieldText.setPosition(hx + this.hpText.width + 8, hy);
      this.updateStaminaText();
      if (this._lastFloorShown !== this.floor) {
        this._lastFloorShown = this.floor;
        this.floorText.setText('第 ' + this.floor + ' 层');
        this.floorText.setScale(1.35);
        this.tweens.add({ targets: this.floorText, scale: 1, duration: 260, ease: 'Back.easeOut' });
      }
      this.pointText.setText('试炼点数 ' + this.points);
      var alive = this.enemies.filter(function (e) { return e.alive; }).length;
      this.enemyCountText.setText(alive > 0 ? '剩余敌人 ' + alive
        : (this.roomGoal && !this.roomGoal.done ? '开启房间目标后开放传送门' : '已清空 → 传送门（打开地图）'));
      // 触摸设备没有键盘，[L] 这个快捷键提示只是噪音
      this.potionText.setText('药水 ×' + this.hero.potions + (this.isTouch ? '' : '   [L]'));

      // 属性面板（为 0 的项淡出，只突出当前生效的属性）
      if (this.statItems) {
        this.statItems.forEach(function (it) {
          var v = h[it.key];
          v = (typeof v === 'number') ? Math.round(v) : 0;
          it.text.setText(it.label + ' ' + v + it.suffix);
          var show = it.always || v > 0;
          it.text.setAlpha(show ? 1 : 0.26);
          it.box.setAlpha(show ? 1 : 0.22);
        });
      }

      // 当前房间信息
      if (this.roomText) {
        var rt = this.roomNode ? (ROOM_TYPES[this.roomNode.type] || ROOM_TYPES.enemy) : null;
        var progress = '';
        if (this.floorMap) {
          var total = this.floorMap.nodes.length;
          var seen = this.floorMap.nodes.filter(function (n) { return n.visited; }).length;
          progress = ' · 已探索 ' + seen + '/' + total;
        }
        this.roomText.setText(rt ? ('房间:' + rt.name + progress) : '');
      }

      if (this.boss && this.boss.alive) {
        this.setMeterValue(this.bossMeter, this.boss.hp / this.boss.maxHp);
        this.bossText.setText('生命 ' + Math.max(0, Math.round(this.boss.hp)) + ' / ' + this.boss.maxHp);
      }
    }

    // ---------- 主循环 ----------
    /**
     * WebGL 上下文被系统回收后恢复时的补丁
     * Phaser 自己会重传纹理（textureManager.restoreContext），这里只把
     * 尺寸与布局补一遍 —— iOS 从后台回来时可视区基本都变了。
     */
    onContextRestored() {
      try { if (this.scale && this.scale.refresh) this.scale.refresh(); } catch (e) { /* 忽略 */ }
      if (this.ready && this.onResize) {
        this.onResize({ width: this.scale.width, height: this.scale.height });
      }
    }

    update(time, delta) {
      if (!this.ready) return;
      var dt = Math.min(delta, 40);
      this._dt = dt;

      // 常驻功能按钮行让位：地图 / 商店 / 图鉴 / 死亡结算 / 撤离确认 / 设置弹窗
      // 打开时，它（depth 2600）会压在这些面板之上，必须先收起来。
      // 放在 running 判断之前：结算 / 死亡时 running 可能已经为 false。
      this.syncUiBarVisibility();

      // 背景星点缓慢左移（每 3 帧更新一次，降低 CPU 占用）
      this._starTick = (this._starTick || 0) + 1;
      if (this._starTick % 3 === 0) {
        var W = this.scale.width;
        var step = dt * 3;
        this.bgStars.forEach(function (s) {
          s.x -= (0.05 + s._layer * 0.06) * step * 0.02;
          if (s.x < -5) s.x = W + 5;
        });
      }

      // 血条补间要一直推进：倒下 / 结算动画期间血条也要落到真实数值
      this.updateMeters(dt, time);
      // 布局编辑：外框走包围盒缓存，每帧只重画描边；被拖动的那一个由
      // layoutEditMove 单独更新（见「拖动热路径」的说明）
      if (this.editMode) this.drawEditOverlay();
      if (!this.running) return;
      this.updateFloats(dt);
      if (this._viewPaused) { this.clearStaleInput(); return; }   // 切到文字界面时冻结
      if (this.mapOpen || this.shopOpen || this.codexOpen || this.deathOpen || this.confirmOpen) {
        this.clearStaleInput();   // 面板里按下的键不该在关闭后立刻生效
        this.updateEnemyMeters();     // 面板打开时只刷新敌人血条
        return;
      }

      // 自愈：房间已清空但传送门不可用（例如刚关掉地图）→ 自动恢复，玩家不会被困住
      if (time - (this._portalCheckAt || 0) > 500) {
        this._portalCheckAt = time;
        if (!this.portalOpen) this.checkFloorClear(true);
      }
      // 腐化脉冲：诅咒与环境的「每回合」类效果按 5 秒一拍结算
      this.updatePulseHud();
      if ((this.curses && this.curses.length) || this.worldEnv) {
        if (!this.pulseAt) this.pulseAt = time + PULSE.period;
        if (time >= this.pulseAt) {
          this.pulseAt = time + PULSE.period;
          this.applyPulse();
        }
      }
      this.updateStamina(dt);
      this.updateFury(dt);
      this.updateHero(dt);
      this.updateSkillProjectiles();
      this.updateShots(dt);
      this.updateGuide();
      this.updateEnemies(dt, time);
      this.updateEnemyMeters();
      this.updateOffscreenEnemyMarkers();
      this.updateProjectiles(dt);
      this.updateCombo(dt);
    }

    // ---------- 敌人属性显示 ----------
    /** 头顶血条 + 名字/攻击标签 + 目标面板（最近敌人：生命 / 攻击 / 速度 / 行为） */
    updateEnemyMeters() {
      var h = this.hero;
      var dt = this._dt || 16.7, now = this.time.now;
      var nearest = null, nd = 1e9;
      var self = this;
      var cam = this.cameras.main;
      var viewL = cam.scrollX - 80, viewR = cam.scrollX + this.scale.width + 80;

      this.enemies.forEach(function (e) {
        if (!e.alive || !e.meter) return;
        var d = Math.abs(e.sprite.x - h.x);
        if (d < nd) { nd = d; nearest = e; }
        var onScreen = e.sprite.x > viewL && e.sprite.x < viewR;
        var show = onScreen && (e.tier !== 'normal' || e === nearest || e.hp < e.maxHp);
        self.setMeterValue(e.meter, e.hp / e.maxHp);
        if (show) {
          var bw = e.barW;
          var by = e.sprite.y - e.sprite.displayHeight - 13;
          self.placeMeter(e.meter, Math.round(e.sprite.x - bw / 2), Math.round(by), bw);
          self.updateMeter(e.meter, dt, now);
          // 名字 + 攻击：两段不同语义色，合起来在血条上方居中
          var mid = e.sprite.x;
          var nw = e.nameLbl.width, aw = e.atkLbl.width, gap = 6;
          var start = mid - (nw + aw + gap) / 2;
          e.nameLbl.setPosition(Math.round(start + nw), Math.round(by - 10));
          e.atkLbl.setPosition(Math.round(start + nw + gap), Math.round(by - 10));
          e.nameLbl.setVisible(e === nearest || e.tier !== 'normal' || e.hp < e.maxHp);
          e.atkLbl.setVisible(e.nameLbl.visible);
        } else if (e.meter.visible !== false) {
          e.nameLbl.setVisible(false);
          e.atkLbl.setVisible(false);
        }
        self.setMeterVisible(e.meter, !!show);
      });
      this.nearestEnemy = nearest;

      if (!this.targetPanel) return;
      if (!nearest || this.heroDead) {
        if (this.targetPanel.visible) this.targetPanel.setVisible(false);
        return;
      }
      this.targetPanel.setVisible(true);
      this.setMeterValue(this.targetMeter, nearest.hp / nearest.maxHp);
      this.updateMeter(this.targetMeter, dt, now);

      // 内容变化才重排（避免逐帧重算文字与胶囊宽度）
      var hpNow = Math.max(0, Math.round(nearest.hp));
      var key = nearest.name + '|' + nearest.tier + '|' + nearest.atk + '|' + nearest.def.speed +
        '|' + nearest.behavior + '|' + nearest.maxHp + '|' + hpNow;
      if (this._targetKey !== key) {
        this._targetKey = key;
        var tierColor = UI.tier[nearest.tier] || UI.tier.normal;
        this.targetName.setText(nearest.name).setColor(tierColor);
        this.targetTier.setText(TIER_NAMES[nearest.tier] || '普通').setColor(tierColor);
        this.targetHp.setText(hpNow + ' / ' + nearest.maxHp);
        this._targetTags = [
          { text: '攻 ' + Math.round(nearest.atk), color: UI.danger },
          { text: '速 ' + nearest.def.speed, color: UI.sub },
          { text: BEHAVIOR_NAMES[nearest.behavior] || '追击', color: UI.accent }
        ];
        this.layoutTargetPanel();
      }
    }

    updateHero(dt) {
      var h = this.hero, k = this.keys;
      if (this.heroDead) return;

      var onGround = h.body.blocked.down || h.body.touching.down;

      // ===== 闪避（翻滚）：冲刺期间不接受其他操作 =====
      if (this.dodging) {
        this.updateDodge(dt, onGround);
        return;
      }
      if (!this.diving && Phaser.Input.Keyboard.JustDown(k.dodge)) {
        if (this.tryDodge()) return;
      }
      if (Phaser.Input.Keyboard.JustDown(k.skill)) this.useSkill();

      // ===== 跳劈：下落攻击（滞空挥砍触发），期间不接受其他操作 =====
      if (this.diving) {
        this.updateDive(onGround);
        h.setAlpha(this.invulnAlpha());
        return;
      }

      if (onGround) this.coyoteUntil = this.time.now + CHARGE.coyote;

      // 落地反馈：音效 + 扬尘
      if (onGround && this._wasAirborne) {
        this._wasAirborne = false;
        sfx('land');
        this.spark(h.x, h.y - 2, 0xb8c8d8);
        // 远程英雄没有跳劈，但「空中射击 → 落地」接得上同一套节奏：落地开踏地箭窗口
        if (this._airShotAt && this.heroRanged()) {
          this._airShotAt = 0;
          this.diveCounterUntil = this.time.now + CHAIN.diveWindow;
        }
      } else if (!onGround) {
        this._wasAirborne = true;
      }

      // ===== 防御（举盾）：按住 S / ↓ =====
      var guardState = this.updateGuard(dt, onGround);
      var guarding = this.guarding;

      // ===== 蓄力跳输入（键盘 + 触摸）=====
      var ti = this.touchInput;
      var jumpDown = Phaser.Input.Keyboard.JustDown(k.jump) || Phaser.Input.Keyboard.JustDown(k.jump2)
        || Phaser.Input.Keyboard.JustDown(k.jump3)
        || ti.jumpPressed;
      var jumpHeld = k.jump.isDown || k.jump2.isDown || k.jump3.isDown || ti.jumpHeld || ti.joyJumpHeld;
      ti.jumpPressed = false;

      // 在地面（或土狼宽限内）按下 → 开始蓄力：此时不下蹲起跳，只积蓄力量
      // 举盾时不能起跳（要先收盾）—— 避免「举盾跳」这种既挡又躲的无脑操作
      if (jumpDown && !this.isCharging && !guarding && (onGround || this.time.now < this.coyoteUntil)) {
        this.isCharging = true;
        this.chargeStart = this.time.now;
        this.chargeRatio = 0;
      }

      var leftDown = k.left.isDown || k.left2.isDown || ti.left;
      var rightDown = k.right.isDown || k.right2.isDown || ti.right;
      var speed = 250;
      if (this.attacking) speed *= 0.45;
      if (guarding) speed *= GUARD.moveScale;
      if (this.furyActive()) speed *= FURY.moveMult;   // 狂怒：移动速度 +25%

      // ===== 蓄力中：放慢移动 + 视觉反馈；松开瞬间才起跳 =====
      if (this.isCharging) {
        if (jumpHeld) {
          // 持续蓄力（有上限，按住不放保持满蓄力）
          this.chargeRatio = clamp((this.time.now - this.chargeStart) / CHARGE.max, 0, 1);
          speed *= 0.5;
          if (onGround && Math.random() < 0.4) {
            this.spark(h.x + rnd(-14, 14), h.y - 2, this.chargeRatio > 0.75 ? 0xffd76a : 0x8ad8ff);
          }
        } else {
          // 松开 → 按蓄力量起跳（轻点也有小跳保底）
          var ratio = this.chargeRatio;
          var power = CHARGE.minPower + (CHARGE.maxPower - CHARGE.minPower) * ratio;
          h.setVelocityY(-power);
          this.isCharging = false;
          this.coyoteUntil = 0;
          this.spark(h.x, h.y - 4, ratio > 0.75 ? 0xffd76a : 0xa8e6ff);
          sfx('jump');
          if (ratio > 0.85 && state.settings.screenShake2D !== false) {
            this.cameras.main.shake(90, 0.004);
          }
        }
      }

      if (leftDown && !rightDown) { h.setVelocityX(-speed); h.setFlipX(true); }
      else if (rightDown && !leftDown) { h.setVelocityX(speed); h.setFlipX(false); }
      else h.setVelocityX(h.body.velocity.x * 0.72);

      // 蓄力光圈：半径与亮度随蓄力增长，满蓄力转金
      if (this.chargeRing) {
        if (this.isCharging) {
          this.chargeRing.setVisible(true);
          this.chargeRing.setPosition(h.x, h.y - 3);
          this.chargeRing.setRadius(16 + this.chargeRatio * 34);
          this.chargeRing.setFillStyle(this.chargeRatio >= 0.999 ? 0xffd76a : 0xa8e6ff,
            0.16 + this.chargeRatio * 0.34);
        } else if (this.chargeRing.visible) {
          this.chargeRing.setVisible(false);
        }
      }

      // 触摸跳按钮同步蓄力反馈（按钮或摇杆上推都会点亮）
      if (this.isTouch && this.btnJump) {
        if (this.isCharging) {
          this.btnJump.setFillStyle(this.chargeRatio >= 0.999 ? 0xffd76a : 0x8ad8ff, 0.55);
        } else if (this.touchInput && !(this.touchInput.jumpHeld || this.touchInput.joyJumpHeld)) {
          this.btnJump.setFillStyle(0x73f0b4, 0.26);
        }
      }

      if (this.attacking) { /* 攻击动画优先 */ }
      // 砸地姿势：落地后短暂定格在「下坠」帧上 —— 没有专门的落地帧，
      // 把 7 号 fall 帧当作蹲伏姿势顶一下，比落地瞬间就弹回待机有分量得多
      else if (this.time.now < (this._landingUntil || 0)) h.play('hero_fall', true);
      else if (guarding) h.play('hero_guard', true);
      else if (!onGround) h.play(h.body.velocity.y < 0 ? 'hero_jump' : 'hero_fall', true);
      else if (this.isCharging) h.play('hero_idle', true);
      else if (Math.abs(h.body.velocity.x) > 24) h.play('hero_run', true);
      else h.play('hero_idle', true);

      if (Phaser.Input.Keyboard.JustDown(k.attack)) this.tryAttack();
      if (Phaser.Input.Keyboard.JustDown(k.potion)) this.usePotion();
      if (Phaser.Input.Keyboard.JustDown(k.fury)) this.tryFury();
      this.updateChainHint();
      this.updateCrystals();

      h.setAlpha(this.invulnAlpha());

      // 房间目标物（宝箱 / 祭坛）：走近即触发
      var goal = this.roomGoal;
      if (goal && !goal.done && Math.abs(h.x - goal.x) < 58 && Math.abs(h.y - goal.y) < 120) {
        this.resolveRoomGoal();
      }

      if (this.portalOpen && this.portal && Math.abs(h.x - this.portal.x) < 54 &&
        this.time.now >= (this._portalGraceUntil || 0)) this.nextFloor();
    }

    /** 出口指引：清空房间后若出口在屏幕外，在屏幕边缘提示方向 */
    updateGuide() {
      if (!this.guideArrow) return;
      if (!this.running || this.mapOpen || this.shopOpen || this.codexOpen || this.deathOpen || this.confirmOpen || !this.portalOpen || !this.portal) {
        if (this.guideArrow.visible) this.guideArrow.setVisible(false);
        return;
      }
      var cam = this.cameras.main;
      var sx = this.portal.x - cam.scrollX;
      if (sx > this.scale.width - 30) {
        this.guideArrow.setText('▶ 出口').setColor('#73f0b4')
          .setPosition(this.scale.width - 48, this.scale.height * 0.45).setVisible(true);
      } else if (sx < 30) {
        this.guideArrow.setText('◀ 出口').setColor('#73f0b4')
          .setPosition(48, this.scale.height * 0.45).setVisible(true);
      } else if (this.guideArrow.visible) {
        this.guideArrow.setVisible(false);
      }
    }

    updateCombo(dt) {
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) { this.comboCount = 0; this.comboText.setAlpha(0); }
      }
    }

    /**
     * 投射物逐帧（敌方弹幕 / 投掷物）
     * 投掷物（长矛）自己算抛物线并朝速度方向旋转，落地或撞墙后插住，过一会儿消失。
     */
    updateProjectiles(dt) {
      var self = this, now = this.time.now;
      dt = dt || 16.7;
      this.projectiles = this.projectiles.filter(function (p) {
        if (!p || !p.active) return false;

        if (p._grounded) {
          if (now > p._stickUntil) { self.spark(p.x, p.y, 0xd8d8e8); p.destroy(); return false; }
          return true;                       // 插在地上：不再判伤害，只等消失
        }

        if (p._grav) {                       // 抛物线（手动积分：弹丸不该吃满世界重力）
          p.setVelocityY(p.body.velocity.y + p._grav * dt / 1000);
          if (p._spin) p.setRotation(Math.atan2(p.body.velocity.y, p.body.velocity.x));
        }
        if (p.x < -80 || p.x > self.levelWidth + 80 || p.y > self.groundY + 800 || p.y < -400) {
          p.destroy(); return false;
        }

        // 触地 / 撞墙 → 插住（不挂碰撞体，直接查静态砖块）
        if (self.projectileGroundY(p.x, p.y) !== null || p.body.blocked.left || p.body.blocked.right || p.body.blocked.down) {
          p._grounded = true;
          p.setVelocity(0, 0);
          p._stickUntil = now + (p._stick || 700);
          self.spark(p.x, p.y, 0xd8d8e8);
          return true;
        }

        if (!self.heroDead && Phaser.Geom.Intersects.RectangleToRectangle(p.getBounds(), self.hero.getBounds())) {
          // 传弹丸的 x 进去：举盾时才知道这一下是从正面还是背后打来的
          self.damageHero(p._dmg || 6, null, false, p.x);
          self.spark(p.x, p.y, 0xd8b0ff);
          p.destroy();
          return false;
        }
        return true;
      });
    }

    /** 投掷物的落点：命中地面砖块 / 平台时返回台面 y，否则 null */
    projectileGroundY(x, y) {
      var surf = null;
      this.groundTiles.forEach(function (t) {
        if (Math.abs(t.x - x) > 32) return;
        var top = t.y - 32;
        if (y >= top - 2 && y <= top + 46 && (surf === null || top > surf)) surf = top;
      });
      this.platformTiles.forEach(function (t) {
        if (Math.abs(t.x - x) > 32) return;
        var top = t.y - 10;
        if (y >= top - 2 && y <= top + 16 && (surf === null || top > surf)) surf = top;
      });
      return surf;
    }

    /** 开放传送门（门对象丢失时补建，保证界面状态与场景一致） */
    openPortal(quiet) {
      if (!this.portal) this.spawnPortal();
      if (!this.portal) return false;
      var first = !this.portalOpen;
      this.portalOpen = true;
      this.portal.setVisible(true).setAlpha(1);
      if (!quiet && first) {
        var def = this.roomNode ? (ROOM_TYPES[this.roomNode.type] || ROOM_TYPES.enemy) : ROOM_TYPES.enemy;
        this.showCenter(def.name + '已清空 · 走向右方传送门', '#73f0b4');
      }
      this.refreshHud();
      return true;
    }

    /** 房间是否已清空（敌人全灭 + 房间目标已完成） */
    isRoomCleared() {
      var alive = this.enemies.filter(function (e) { return e.alive; }).length;
      if (alive > 0) return false;
      if (this.roomGoal && !this.roomGoal.done) return false;
      return true;
    }

    checkFloorClear(quiet) {
      if (!this.isRoomCleared()) return;
      if (this.portalOpen && this.portal) return;
      this.openPortal(quiet);
    }

    /** 走进传送门：打开地图选择下一个房间；Boss 房间则深入下一层 */
    nextFloor() {
      if (!this.portalOpen || this.mapOpen) return;
      this.portalOpen = false;
      var node = this.roomNode;
      if (node) { node.visited = true; node.cleared = true; }
      this.roomsCleared = (this.roomsCleared || 0) + 1;

      if (node && node.type === 'boss') {
        this.points += 8;
        var next = this.floor + 1;
        this.floor = next;
        this.floorMap = generateFloorMap(next);
        this.resetSkill(false);   // 每层一次：深入下一层后技能可再次使用
        // 深渊侵蚀：每深入一层扣 3 点生命（文字版试炼的规则，实时里同样保留）
        var erode = 3;
        this.hero.hp = Math.max(1, this.hero.hp - erode);
        this.showFloat(this.hero.x, this.hero.y - 96, '深渊侵蚀 -' + erode, '#c79aff', 16);
        // 诅咒与环境效果换层重掷：交给宿主（它持有文字版试炼的诅咒池与环境池），
        // 掷完会通过 setCursesEnv 回传，保证 2D 与文字界面用的是同一份数据
        if (this.game && this.game.events) this.game.events.emit('trial2d:floor', { floor: next });
        this.roomNode = this.floorMap.current;
        this.refreshHud();
        this.showCenter('层主已陨落 · 深入第 ' + next + ' 层', '#ffd76a');
        sfx('floor');
        setBgmScene('explore');
        console.log('[试炼2D] Boss 击败，进入第 ' + next + ' 层 · 点数 ' + this.points);
        // 击败层主后：先在画面内打开商店，关闭后再进入地图选下一个房间
        this.pendingMapAfterShop = true;
        this.openShop();
        return;
      }
      this.openMap();
    }

    // ---------- 地图界面（房间网格 / 悬停信息 / 点击进入）----------
    openMap() {
      if (this.mapOpen || !this.floorMap) return;
      this.mapOpen = true;
      this.attacking = false;
      this.isCharging = false;
      this.dodging = false;
      this.dodgeReadyAt = 0;
      if (this.chargeRing) this.chargeRing.setVisible(false);
      this.hero.setVelocity(0, 0);
      if (this.touchInput) { this.touchInput.left = false; this.touchInput.right = false; this.touchInput.jumpHeld = false; this.touchInput.joyJumpHeld = false; }
      if (this.touchUI) this.touchUI.setVisible(false);
      try { this.physics.world.pause(); } catch (e) { /* 忽略 */ }
      this.buildMapLayer();
      if (this.mapLayer) {
        this.mapLayer.setAlpha(0);
        this.tweens.add({ targets: this.mapLayer, alpha: 1, duration: 200 });
      }
      sfx('click');
    }

    closeMap() {
      this.mapOpen = false;
      this.destroyLayer('mapLayer');
      if (this.panelButtons) this.panelButtons.map = [];
      try { this.physics.world.resume(); } catch (e) { /* 忽略 */ }
      if (this.touchUI) this.touchUI.setVisible(this._lastInputWasTouch === true);
      // 关上地图后：房间已清空就要能再次进入传送门，否则玩家会被困在房间里
      this.checkFloorClear(true);
      this._portalGraceUntil = this.time.now + 500;   // 站在门口时不要立刻又弹开地图
      this.syncUiBarVisibility();
    }

    /** 地图界面的按钮（目前只有一颗「返回房间」） */
    onMapAction(action) {
      if (action === 'close') { sfx('click'); this.closeMap(); }
    }

    buildMapLayer(sizeW, sizeH) {
      var W = (sizeW && sizeW >= 40) ? sizeW : this.scale.width;
      var H = (sizeH && sizeH >= 40) ? sizeH : this.scale.height;
      if (W < 40 || H < 40) { fixCanvasSize(); return null; }
      var map = this.floorMap;
      var self = this;

      this.mapLayer = this.add.container(0, 0).setDepth(2000).setScrollFactor(0);
      if (!this.panelButtons) this.panelButtons = { confirm: [], shop: [], death: [], map: [] };
      this.panelButtons.map = [];

      var dim = this.add.rectangle(W / 2, H / 2, W, H, UI.dim, UI.dimAlpha);
      var mini = W < 620;
      var title = this.add.text(W / 2, mini ? 34 : 48, '第 ' + map.floor + ' 层 · 深渊地图', {
        fontSize: (mini ? 19 : 26) + 'px', color: UI.title, fontStyle: 'bold', letterSpacing: 2
      }).setOrigin(0.5);
      var status = this.add.text(W / 2, mini ? 58 : 78,
        '生命 ' + Math.max(0, Math.round(this.hero.hp)) + '/' + this.hero.maxHp +
        '　点数 ' + this.points + '　药水 ×' + this.hero.potions, {
        fontSize: (mini ? 11 : 14) + 'px', color: UI.good
      }).setOrigin(0.5);
      this.mapLayer.add([dim, title, status]);

      // 网格坐标：列 → x，行 → y（小屏自动收紧间距并缩小方块）
      this._mapCompact = W < 620;
      var compact = this._mapCompact;
      var padX = compact ? 46 : Math.min(W * 0.5 - 60, Math.max(90, W * 0.16));
      var colGap = (W - padX * 2) / (MAP_COLS - 1);
      var rowGap = compact ? Math.min(96, H * 0.16) : Math.min(120, H * 0.18);
      var gridTop = H * 0.52 - rowGap;
      var pos = {};
      map.nodes.forEach(function (n) {
        pos[n.id] = { x: padX + n.col * colGap, y: gridTop + n.row * rowGap };
      });

      // 连线（当前房间的出路高亮）
      var g = this.add.graphics();
      map.nodes.forEach(function (n) {
        var active = map.current && n.id === map.current.id;
        n.links.forEach(function (tid) {
          var t = map.nodes[tid];
          if (!t) return;
          g.lineStyle(active ? 4 : 2, active ? 0x73f0b4 : 0x3a3a4a, active ? 0.95 : 0.55);
          g.beginPath();
          g.moveTo(pos[n.id].x, pos[n.id].y);
          g.lineTo(pos[t.id].x, pos[t.id].y);
          g.strokePath();
        });
      });
      this.mapLayer.add(g);

      // 房间节点
      map.nodes.forEach(function (n) {
        self.buildRoomNode(n, pos[n.id].x, pos[n.id].y,
          !!(map.current && n.id === map.current.id),
          !!(map.current && map.current.links.indexOf(n.id) >= 0));
      });

      // 悬停信息 + 图例（小屏只留色块，避免文字重叠）
      this.mapDefaultInfo = mini ? '点击发光房间继续深入' : '点击发光的房间继续深入　·　绿色勾选表示已通过';
      // 手机横屏（宽而不高，800×360）时地图格子从 y≈100 一直排到 y≈275，底部提示原来在 272：
      // 上面撞第一行格子的图标，下面撞最后一行的房间名。唯一空着的地方是图例下面那条 ——
      // 所以矮屏时把提示压到最底部，而不是硬塞在两行格子中间。
      var tight = H < 520;
      this.mapInfo = this.add.text(W / 2, tight ? H - 22 : (mini ? H - 74 : H - 88), this.mapDefaultInfo, {
        fontSize: (mini ? 11 : 15) + 'px', color: '#c8cede'
      }).setOrigin(0.5);

      var legendKeys = ['start', 'enemy', 'elite', 'mirror', 'boss', 'treasure', 'shrine'];
      var step = Math.min(mini ? 42 : 122, (W - 60) / legendKeys.length);
      var lx = W / 2 - step * (legendKeys.length - 1) / 2;
      var legend = [this.mapInfo];
      legendKeys.forEach(function (k, i) {
        var d = ROOM_TYPES[k];
        var x = lx + i * step;
        if (mini) {
          legend.push(self.add.rectangle(x, H - 40, 12, 12, d.fill, 1).setStrokeStyle(2, d.line, 1));
        } else {
          legend.push(self.add.rectangle(x - 26, H - 52, 12, 12, d.fill, 1).setStrokeStyle(2, d.line, 1));
          legend.push(self.add.text(x - 16, H - 52, d.name.replace('房间', ''), {
            fontSize: '11px', color: '#a8b0c0'
          }).setOrigin(0, 0.5));
        }
      });
      this.mapLayer.add(legend);

      // 右上角「返回房间」
      // ------------------------------------------------------------
      // 常驻功能按钮行（uiBar）现在只要面板一打开就整行收起，地图也不例外 ——
      // 而地图原来没有任何自己的退出口，玩家不点房间就走不了。补这一颗，
      // 不想深入时可以先退出去买点东西 / 看状态，再回来走传送门。
      var backW = mini ? 80 : 100, backH = mini ? 26 : 30;
      // uiButton 的 x 是**左边缘**，不是中心 —— 这里原来写的是 W - 12 - backW / 2
      // （中心坐标），按钮整个右移了半个宽度，在 800 宽的手机横屏上会溢出画布 13px。
      this.uiButton(this.mapLayer, this.panelButtons.map, 'close', '返回房间',
        W - 12 - backW, mini ? 34 : 48, backW, backH, false);

      return this.mapLayer;
    }

    buildRoomNode(n, px, py, isCurrent, selectable) {
      var def = ROOM_TYPES[n.type] || ROOM_TYPES.enemy;
      var self = this;
      // 小屏（手机竖屏）自动缩小房间方块与字号，避免互相挤压
      var compact = !!this._mapCompact;
      var size = compact ? 44 : 56;
      var iconFont = compact ? 17 : 22;
      var nameFont = compact ? 9 : 11;

      var box = this.add.rectangle(px, py, size, size, def.fill, selectable ? 1 : (n.visited ? 0.8 : 0.5));
      box.setStrokeStyle(isCurrent ? 3 : 2, isCurrent ? 0xffffff : def.line, isCurrent ? 1 : (selectable ? 1 : 0.45));
      // 无滚动因子：地图随屏幕固定；也是点击命中判定所必需的
      box.setScrollFactor(0);
      var icon = this.add.text(px, py - size * 0.16, def.icon, { fontSize: iconFont + 'px', color: '#ffffff' }).setOrigin(0.5);
      var name = this.add.text(px, py + size * 0.3, def.name.replace('房间', ''), {
        fontSize: nameFont + 'px', color: '#e8ecf6'
      }).setOrigin(0.5);
      this.mapLayer.add([box, icon, name]);

      if (n.cleared) {
        var mark = this.add.text(px + size / 2 - 9, py - size / 2 + 9, '✓', {
          fontSize: '14px', color: '#73f0b4', fontStyle: 'bold'
        }).setOrigin(0.5);
        this.mapLayer.add(mark);
      }

      if (isCurrent) {
        var glow = this.add.rectangle(px, py, size + 16, size + 16).setStrokeStyle(2, 0xffd76a, 0.9);
        this.mapLayer.add(glow);
        this.tweens.add({ targets: glow, alpha: { from: 0.95, to: 0.3 }, duration: 900, yoyo: true, repeat: -1 });
      }

      if (selectable) {
        box.setInteractive({ useHandCursor: true });
        this.tweens.add({ targets: [box, icon], scaleX: 1.09, scaleY: 1.09, duration: 660, yoyo: true, repeat: -1 });
        var info = def.name + '　' + def.desc;
        box.on('pointerover', function () {
          self.mapInfo.setText(info).setColor(def.center || '#ffffff');
        });
        box.on('pointerout', function () {
          self.mapInfo.setText(self.mapDefaultInfo).setColor('#c8cede');
        });
        box.on('pointerdown', function () { self.enterRoom(n); });
      }
      return box;
    }

    /** 点击地图上的房间进入 */
    enterRoom(n) {
      if (!this.mapOpen || !n || !this.floorMap) return;
      var cur = this.floorMap.current;
      if (!cur || cur.links.indexOf(n.id) < 0) return;   // 只能走进相邻房间

      this.floorMap.current = n;
      n.visited = true;
      this.closeMap();
      this.cameras.main.flash(300, 6, 6, 18);
      this.buildLevel(n);

      var def = ROOM_TYPES[n.type] || ROOM_TYPES.enemy;
      this.showCenter('第 ' + this.floor + ' 层 · ' + def.name, def.center || '#ffd76a');
      console.log('[试炼2D] 进入房间：' + def.name + '（第 ' + this.floor + ' 层 · 第 ' + (n.col + 1) + ' 列 第 ' + (n.row + 1) + ' 行）');

      // 环境效果：每进一个房间重掷一次（宿主用袋抽发牌，掷完通过 setCursesEnv 回传）
      this.rollRoomEnv(n.type);

      // 音效：开门 + 按房间类型切 BGM 与登场音
      sfx('door');
      setBgmScene(bgmForRoom(n.type));
      if (n.type === 'elite') sfx('elite');
      else if (n.type === 'mirror') sfx('mirror');
      else if (n.type === 'boss') sfx('boss');
    }

    /**
     * 通知宿主为本房间重掷环境效果
     * 2D 不自己掷：环境的名字与数值都由经典模式的池子生成（难度、层数都影响强度），
     * 掷完宿主会通过 setCursesEnv 回传，文字界面读到的也就是同一份。
     */
    rollRoomEnv(type) {
      if (!this.running) return false;
      if (!this.game || !this.game.events || typeof this.game.events.emit !== 'function') return false;
      this.game.events.emit('trial2d:room', { floor: this.floor, type: type || null });
      return true;
    }

    // ---------- 敌人 AI ----------
    updateEnemies(dt, time) {
      var self = this;
      this.enemies.forEach(function (e) {
        if (!e.alive) {
          if (e.throwFx) { e.throwFx.destroy(); e.throwFx = null; }
          return;
        }
        var spr = e.sprite, def = e.def;

        // 兜底：万一它还是被挤进了地面（物理意外、穿模）。
        // 沉在地面以下的敌人打不到、也清不掉 —— 整局卡死；而且它还在视野里，
        // 连方向箭头都不会给，玩家只能看着「剩余敌人 1」发呆。
        // 所以这里拉回地面，而不是判它「脱离战斗」把房间草草清空。
        if (spr.y > self.groundY + 40 && spr.y <= self.groundY + 700) {
          spr.y = self.groundY;
          if (spr.body) { try { spr.body.reset(spr.x, self.groundY); } catch (err) { /* 忽略 */ } }
          spr.setVelocityY(0);
        }

        // 掉出关卡范围（被击退甩出去 / 从边缘坠落）→ 视为脱离战斗，避免房间永远清不空。
        // 这一条必须排在硬直检查**之前**：硬直期间敌人不受控地飞，等硬直结束再查，
        // 它已经飞出去很远了。阈值也跟着从 ±400 收到 ±120 —— 那是「已经离开关卡」，
        // 而不是「跑出去两个屏幕」。正常情况下有 world bounds 兜着，这里只接住坠落。
        if (spr.y > self.groundY + 700 || spr.x < -120 || spr.x > self.levelWidth + 120) {
          self.dropEnemy(e);
          return;
        }

        // 受击硬直期间不受控
        if (time < e.hurtUntil) {
          spr.setFlipX(spr.body.velocity.x < 0);
          return;
        }

        // 完美闪避定身：完全静止（与受击硬直区分，不吃惯性）
        if (time < e.stunUntil) {
          spr.setVelocityX(0);
          if (def.fly) spr.setVelocityY(0);
          return;
        }

        var dx = self.hero.x - spr.x;
        var dy = self.hero.y - spr.y;
        var dist = Math.abs(dx);
        var dirToHero = dx >= 0 ? 1 : -1;

        if (!self.running || self.heroDead) {
          spr.setVelocityX(0);
          spr.play(self.mobAnimKey(e, 'walk'), true);
          return;
        }

        // --- 攻击后摇 / 判定 ---
        if (e.state === 'attack') {
          spr.setVelocityX(0);
          if (time >= e.attackAt && !e.didHit) { e.didHit = true; self.enemyStrike(e); }
          if (time >= e.recoverUntil) { e.state = 'chase'; e.attackAt = time + 300; }
          return;
        }

        // --- 起手（前摇）---
        if (e.state === 'windup') {
          spr.setVelocityX(0);
          if (e.willThrow) {
            // 掷矛：定在「后仰蓄力」帧不动，出手瞬间才切到「前倾发力」帧（动作读得出蓄与发）
            spr.setFlipX(self.hero.x < spr.x);
            spr.anims.stop();
            spr.setFrame(ENEMY_FRAMES.attack[0]);
          } else {
            spr.play(self.mobAnimKey(e, 'attack'), true);
          }
          // 掷矛前摇：手里多一支矛，出手前一直看得见（给玩家闪避的余地）
          if (e.throwFx && e.throwFx.active) {
            var flip = spr.flipX;
            e.throwFx.setPosition(spr.x + (flip ? -12 : 12), spr.y - 42);
            e.throwFx.setFlipX(flip);
            e.throwFx.setRotation(flip ? 0.6 : -0.6);
          }
          if (time >= e.windupUntil) {
            if (e.willThrow) {
              e.willThrow = false;
              self.enemyThrowSpear(e);
              e.state = 'attack'; e.attackAt = time; e.didHit = true; e.recoverUntil = time + def.recover;
            } else if (def.behavior === 'shooter') {
              self.enemyShoot(e);
              e.state = 'attack'; e.attackAt = time; e.didHit = true; e.recoverUntil = time + def.recover;
            } else if (def.behavior === 'charger') {
              spr.setVelocityX(dirToHero * def.speed * 3.1);
              e.state = 'charge'; e.chargeUntil = time + 420; e.didHit = false;
            } else {
              e.state = 'attack'; e.attackAt = time + 90; e.didHit = false; e.recoverUntil = time + 90 + def.recover;
            }
          }
          return;
        }

        // --- 冲锋 ---
        if (e.state === 'charge') {
          spr.setFlipX(spr.body.velocity.x < 0);
          if (!e.didHit && Phaser.Geom.Intersects.RectangleToRectangle(spr.getBounds(), self.hero.getBounds())) {
            e.didHit = true;
            self.damageHero(Math.round(def.atk * 1.5), e, false);
          }
          if (time >= e.chargeUntil || spr.body.blocked.left || spr.body.blocked.right) {
            e.state = 'chase'; spr.setVelocityX(0); e.attackAt = time + 500;
          }
          return;
        }

        var aware = dist < def.detect && Math.abs(dy) < 240;

        // --- 远程单位保持距离 ---
        if (aware && def.behavior === 'shooter' && dist < (def.keepDist || 200)) {
          spr.setVelocityX(-dirToHero * def.speed);
          spr.setFlipX(dirToHero < 0);
          spr.play(self.mobAnimKey(e, 'walk'), true);
          return;
        }

        if (aware) {
          e.state = 'chase';
          spr.setFlipX(dirToHero < 0);

          // 骷髅骑兵：中远距离有概率改掷长矛（贴脸不掷；每次决策只掷一次判定）
          if (def.throw && dist >= MOB_THROW.minDist && dist <= MOB_THROW.maxDist &&
            Math.abs(dy) < 150 && time >= (e.throwAt || 0)) {
            e.throwAt = time + MOB_THROW.cd;
            if (Math.random() < MOB_THROW.chance) {
              e.willThrow = true;
              e.state = 'windup';
              e.windupUntil = time + def.windup;
              spr.setVelocityX(0);
              spr.setFlipX(dirToHero < 0);
              self.showThrowWindup(e);
              return;
            }
          }

          if (dist <= def.attackRange && Math.abs(dy) < 90 && time >= (e.attackAt || 0)) {
            e.willThrow = false;
            e.state = 'windup';
            e.windupUntil = time + def.windup;
            spr.setVelocityX(0);
            return;
          }

          var vx = dirToHero * def.speed;
          if (def.fly) {
            spr.setVelocityY(clamp(dy * 1.7, -170, 170));
          } else if (spr.body.blocked.left || spr.body.blocked.right) {
            spr.setVelocityY(-560);
          }
          spr.setVelocityX(vx);
          spr.play(self.mobAnimKey(e, 'walk'), true);
        } else {
          // 巡逻
          if (time > e.patrolUntil) {
            e.patrolUntil = time + ri(900, 2200);
            e.dir = Math.random() < 0.5 ? -1 : 1;
          }
          if (spr.body.blocked.left) e.dir = 1;
          if (spr.body.blocked.right) e.dir = -1;
          if (!def.fly && spr.body.blocked.down && !self.groundAhead(spr, e.dir)) e.dir *= -1;
          spr.setVelocityX(e.dir * def.speed * 0.5);
          spr.setFlipX(e.dir < 0);
          spr.play(self.mobAnimKey(e, 'walk'), true);
        }

        // --- Boss 特殊：周期性跳跃砸地 ---
        if (def.behavior === 'boss' && aware) {
          if (!e.nextSpecial) e.nextSpecial = time + ri(2800, 4400);
          if (time >= e.nextSpecial && spr.body.blocked.down) {
            e.nextSpecial = time + ri(2800, 4400);
            self.bossSlam(e);
          }
        }
      });
    }

    /** 前方是否有落脚点（防止走下悬崖） */
    groundAhead(spr, dir) {
      var probeX = spr.x + dir * 42;
      var probeY = spr.y + 14;
      var found = false;
      this.groundTiles.forEach(function (t) {
        if (!found && Math.abs(t.x - probeX) < 42 && Math.abs(t.y - probeY) < 70) found = true;
      });
      if (!found) {
        this.platformTiles.forEach(function (t) {
          if (!found && Math.abs(t.x - probeX) < 46 && Math.abs(t.y - probeY) < 40) found = true;
        });
      }
      return found;
    }

    enemyStrike(e) {
      var spr = e.sprite, def = e.def;
      var dir = this.hero.x >= spr.x ? 1 : -1;
      var reach = def.attackRange + 20;
      var hx = spr.x + dir * (def.attackRange * 0.55);
      var rect = new Phaser.Geom.Rectangle(hx - reach / 2, spr.y - 54, reach, 64);
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, this.hero.getBounds())) {
        this.damageHero(e.atk, e, false);
      } else {
        this.showFloat(spr.x + dir * 30, spr.y - 48, '落空', '#8a8a9a', 14);
      }
    }

    /** 掷矛前摇：手里亮出长矛 + 一声提示（玩家有时间闪避） */
    showThrowWindup(e) {
      var spr = e.sprite;
      var color = this.throwColor();
      var tex = 角色形象.ensureShotTexture(this, 'spear', color);
      if (e.throwFx) e.throwFx.destroy();
      e.throwFx = this.add.image(spr.x, spr.y - 42, tex).setDepth(10).setFrame(0);
      e.throwFx.setFlipX(spr.flipX);
      e.throwFx.setRotation(spr.flipX ? 0.6 : -0.6);
      this.showFloat(spr.x, spr.y - 96, '掷矛!', '#ffd76a', 15);
      sfx('spearwind');
    }

    /** 骷髅骑兵的长矛颜色（骨头白，取自形象表） */
    throwColor() {
      var m = 角色形象.MOB_SHOTS && 角色形象.MOB_SHOTS.skeleton;
      return (m && m.color) || 0xd8d8e8;
    }

    /**
     * 骷髅骑兵：掷出长矛
     * 自己算抛物线（世界重力对弹丸太重），落点按玩家当前位置解算 —— 不做提前量，
     * 所以「看到矛 → 按 K 闪开」永远有效。
     */
    enemyThrowSpear(e) {
      var spr = e.sprite;
      if (e.throwFx) { e.throwFx.destroy(); e.throwFx = null; }
      spr.setFrame(ENEMY_FRAMES.attack[1]);      // 发力帧：前倾把矛送出去
      var color = this.throwColor();
      var tex = 角色形象.ensureShotTexture(this, 'spear', color);
      var anim = 角色形象.ensureShotAnim(this, 'spear', color, 10);
      var dir = this.hero.x >= spr.x ? 1 : -1;
      var mx = spr.x + dir * 18, my = spr.y - 40;

      var p = this.physics.add.sprite(mx, my, tex, 0);
      p.setDepth(9);
      p.play(anim);
      p.body.setAllowGravity(false);
      var szs = 角色形象.shotSize('spear');
      p.body.setSize(szs.bw, szs.bh, true);

      var dx = this.hero.x - mx;
      var dy = (this.hero.y - 34) - my;
      var t = clamp(Math.abs(dx) / MOB_THROW.speed, 0.3, 1.1);        // 飞行时间
      var vx = dx / t;
      var vy = (dy - 0.5 * MOB_THROW.gravity * t * t) / t;            // 抛物线解算
      p.setVelocity(vx, vy);
      p.setRotation(Math.atan2(vy, vx));

      p._dmg = Math.round(e.atk * MOB_THROW.mult);
      p._grav = MOB_THROW.gravity;
      p._stick = MOB_THROW.stick;
      p._spin = true;
      this.projectiles.push(p);
      this.spark(mx, my, color);
      sfx('spear');
    }

    enemyShoot(e) {
      var spr = e.sprite, def = e.def;
      var dir = this.hero.x >= spr.x ? 1 : -1;

      // 镜像怪：用玩家英雄的同一种弹道（颜色换成镜像紫），慢一档，看得见、闪得掉
      if (def.rangedKind && 角色形象.SHOTS[def.rangedKind]) {
        var kind = def.rangedKind;
        var color = 角色形象.LOOKS.mimic.colors.acc;
        var tex = 角色形象.ensureShotTexture(this, kind, color);
        var anim = 角色形象.ensureShotAnim(this, kind, color, kind === 'wave' ? 9 : 16);
        var mx = spr.x + dir * 26, my = spr.y - 34;
        var s = this.physics.add.sprite(mx, my, tex, 0);
        s.setDepth(9);
        s.play(anim);
        s.body.setAllowGravity(false);
        var sz = 角色形象.shotSize(kind);
        s.body.setSize(sz.bw, sz.bh, true);
        var dx = this.hero.x - mx, dy = (this.hero.y - 30) - my;
        if (Math.abs(dx) < 8) dx = dir * 8;
        var ang = Math.atan2(dy, dx);
        var sp = def.rangedSpeed || 520;
        s.setVelocity(Math.cos(ang) * sp, Math.sin(ang) * sp);
        if (kind !== 'orb') s.setRotation(ang);
        s._dmg = Math.round(e.atk * 0.9);
        this.projectiles.push(s);
        this.spark(mx, my, color);
        return;
      }

      var p = this.physics.add.image(spr.x + dir * 24, spr.y - 34, TEX.projectile);
      p.setDepth(9);
      p.body.setAllowGravity(false);
      p.setVelocity(dir * 330, clamp((this.hero.y - 30 - (spr.y - 34)) * 0.9, -170, 170));
      p._dmg = Math.round(e.atk * 0.9);
      this.projectiles.push(p);
      this.spark(spr.x + dir * 24, spr.y - 34, 0xd8b0ff);
    }

    bossSlam(e) {
      var spr = e.sprite;
      spr.setVelocityY(-820);
      var self = this;
      this.tweens.add({ targets: spr, angle: 12, duration: 200, yoyo: true });
      this.showFloat(spr.x, spr.y - 96, '砸地!', '#ff8a7a', 18);
      var check = this.time.addEvent({
        delay: 60, repeat: 34, callback: function () {
          if (!spr.active) { check.remove(); return; }
          if (spr.body.blocked.down && spr.body.velocity.y >= 0) {
            check.remove();
            self.cameras.main.shake(260, 0.014);
            self.spark(spr.x, spr.y, 0xff8a7a);
            if (Math.abs(self.hero.x - spr.x) < 160 && self.hero.body.blocked.down) {
              self.damageHero(Math.round(e.atk * 1.2), e, false);
            }
          }
        }
      });
    }
  }

  /**
   * 创建 Phaser.Game
   * 渲染器由调用方决定，失败时可以换另一种再试一次 —— Phaser.AUTO 内部不会这么做。
   */
  /**
   * 渲染配置：标称档 / 极简档
   * ------------------------------------------------------------
   * 标称档就是原来那一套。极简档是给「WebGL 检测得到、真建 context 就翻脸」的
   * 设备准备的 —— iOS 省电模式、Safari 里关掉硬件加速、WebGL context 名额被上一个
   * 页面占着、低内存机型，这些情况下标称参数会直接创建失败，而失败就等于
   * 「被丢回文字界面」，对玩家来说就是"苹果玩不了 2D"。
   *
   * 极简档只动渲染与显存相关的开关，**完全不动 scale / physics / scene**，
   * 所以退到极简档只是画面糙一点（关抗锯齿、关像素吸附以外的修饰），玩法一模一样。
   *   · preserveDrawingBuffer / desynchronized：iOS 上最吃显存的两项
   *   · powerPreference 压到 low-power：省电模式下 high-performance 会被直接拒绝
   *   · batchSize 减半：顶点缓冲占用减半
   */
  function renderConfig(minimal) {
    if (!minimal) return { antialias: false, pixelArt: true, roundPixels: false };
    return {
      antialias: false,
      pixelArt: false,
      roundPixels: true,
      preserveDrawingBuffer: false,
      desynchronized: false,
      failIfMajorPerformanceCaveat: false,
      clearBeforeRender: true,
      powerPreference: 'low-power',
      batchSize: 2048
    };
  }

  function createGame(container, Phaser, renderType, minimal) {
    return new Phaser.Game({
      type: renderType,
      parent: container,
      width: 960,
      height: 540,
      backgroundColor: '#07070f',
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
      physics: { default: 'arcade', arcade: { gravity: { y: GRAVITY }, debug: false } },
      render: renderConfig(minimal),
      audio: { noAudio: true },
      scene: [BattleScene]
    });
  }

  // ============================================================
  //  苹果设备（iOS / iPadOS / macOS Safari）专项适配
  // ============================================================

  /** 是否苹果移动端。iPadOS 13+ 的 UA 伪装成 Mac，靠「Mac + 多指触摸」识别 */
  function isAppleTouch() {
    try {
      var ua = navigator.userAgent || '';
      if (/iPad|iPhone|iPod/.test(ua)) return true;
      if (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1) return true;
      return false;
    } catch (e) { return false; }
  }

  /** 是否已经从主屏幕启动（iOS 上这是唯一能拿到「真全屏 + 无地址栏」的方式） */
  function isStandalone() {
    try {
      if (navigator.standalone) return true;
      if (window.matchMedia) {
        if (window.matchMedia('(display-mode: standalone)').matches) return true;
        if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
      }
      return false;
    } catch (e) { return false; }
  }

  /**
   * 手势守卫
   * ------------------------------------------------------------
   * iOS Safari 从 10 开始就**忽略** user-scalable=no：双指捏合、双击仍然会缩放页面。
   * 在横版动作里这是灾难 —— 玩家手指一并拢，画面就被放大到只剩半个屏幕，
   * 而界面上没有任何入口能缩回去（只能刷新重进）。
   * Safari 专有的 gesture* 事件是唯一能拦住它的钩子，双指 touchmove 作为兜底。
   *
   * 这里刻意**不碰 touchend**：在 touchend 上 preventDefault 会连带吃掉 DOM 按钮的
   * click 合成，设置 / 图鉴 / 退出试炼就全都点不动了。双击缩放交给 CSS 的
   * touch-action: manipulation（iOS 13+ 生效）去解决。
   */
  function installGestureGuard() {
    if (state._gestureGuard) return;
    state._gestureGuard = true;
    try {
      ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) {
        document.addEventListener(ev, function (e) {
          if (e && e.cancelable) e.preventDefault();
        }, { passive: false });
      });
      document.addEventListener('touchmove', function (e) {
        // 双指 = 缩放意图，一律拦；单指放行，交给画布里的摇杆
        if (e.touches && e.touches.length > 1 && e.cancelable) e.preventDefault();
      }, { passive: false });
    } catch (e) { /* 老浏览器不支持 passive 选项：忽略，CSS 那一层仍在 */ }
  }

  /**
   * 渲染健康看门狗
   * ------------------------------------------------------------
   * iOS 上「切出去看一眼消息 / 锁屏 / 来电横幅」之后回来，WebGL context 被系统回收
   * 是常态（Safari 比安卓激进得多）。原来的表现是全黑，只能刷新页面重进。
   * 这里补三件事：
   *   · 拦 webglcontextlost 并 preventDefault —— 不拦的话浏览器根本不会再发 restored
   *   · restored 之后刷新尺寸 + 唤醒循环（Phaser 自己会重传纹理，这里只补外围）
   *   · 回到前台主动 wake + refresh，修掉 iOS 上 rAF 被系统掐掉后不再续上的情况
   */
  function bindRenderHealth(game) {
    if (game && game.canvas && !game.canvas.__dshRenderHealth) {
      game.canvas.__dshRenderHealth = true;
      game.canvas.addEventListener('webglcontextlost', function (e) {
        if (e && e.cancelable) e.preventDefault();
        state.contextLost = true;
        console.warn('[试炼2D] WebGL 上下文被系统回收，等待自动恢复…');
      }, false);
      game.canvas.addEventListener('webglcontextrestored', function () {
        state.contextLost = false;
        console.log('[试炼2D] WebGL 上下文已恢复');
        API.show();
        fixCanvasSize();
        if (state.scene && state.scene.onContextRestored) {
          try { state.scene.onContextRestored(); } catch (e) { /* 恢复辅助失败不影响主流程 */ }
        }
      }, false);
    }

    if (state._visibilityBound) return;
    state._visibilityBound = true;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      // 回到前台：rAF 停过、visualViewport 变了，尺寸与循环都要补一手
      try { if (state.game && state.game.loop) state.game.loop.wake(); } catch (e) { /* 忽略 */ }
      try { if (typeof global._updateTrial2DVh === 'function') global._updateTrial2DVh(); } catch (e) { /* 忽略 */ }
      fixCanvasSize();
      try { if (state.game && state.game.scale) state.game.scale.refresh(); } catch (e) { /* 忽略 */ }
    });
  }

  // ============================================================
  //  公开 API
  // ============================================================
  var API = {
    available: function () { return state.available; },
    isBooted: function () { return !!state.booted; },
    isEnabled: function () { return state.enabled !== false; },
    isReady: function () { return !!(state.available && state.scene && state.scene.ready); },
    getGame: function () { return state.game; },
    /** 实际落地的渲染器：'webgl' | 'canvas' | null（未启动） */
    getRenderMode: function () { return state.renderMode; },
    /** 初始化失败原因（宿主可直接显示给玩家，替代干巴巴的 console） */
    lastError: function () { return state.lastInitError || null; },
    /** 当前画质档位 */
    getQuality: function () { return state.quality; },
    getSettings: function () { return state.settings || loadSettings(); },

    setSettings: function (patch) {
      var s = saveSettings(patch);
      if (s.enabled === false) API.hide(); else if (state.booted) API.show();
      return s;
    },
    setEnabled: function (f) { return API.setSettings({ enabled: !!f }); },
    setActionHandler: function (fn) { state.actionHandler = fn; },

    /**
     * 注册宿主桥接（试炼文字逻辑）：
     *   exit(result)          结束本局并退出试炼（宿主负责回写结果）
     *   toggleView(snapshot)  切到文字界面（宿主负责隐藏画布 + 显示文字面板）
     *   shopData(points)      取商店目录（含点数同步）
     *   shopBuy(id, points)   购买商品（返回 {ok,msg,points,name}）
     */
    setBridge: function (b) {
      if (!b) { state.bridge = {}; return state.bridge; }
      for (var k in b) {
        if (typeof b[k] === 'function') state.bridge[k] = b[k];
      }
      return state.bridge;
    },

    init: function (container, force) {
      if (state.booted) return true;
      var Phaser = global.Phaser;
      if (!Phaser) {
        state.lastInitError = '未检测到 Phaser（vendor/phaser.min.js 未加载）';
        console.warn('[试炼2D] ' + state.lastInitError);
        state.available = false;
        return false;
      }
      if (!container) {
        state.lastInitError = '缺少画布容器';
        console.warn('[试炼2D] ' + state.lastInitError);
        state.available = false;
        return false;
      }

      // 这几步原本裸奔在 try 之外：任意一步抛异常都会直接冒泡出去，
      // 绕过下面的降级逻辑（表现为「点了没反应」或直接回退文字模式）。
      try {
        loadSettings();
        if (force) probeWebGL(true);      // 强制重试时重新探测 WebGL
        state.quality = detectQuality();
        state.container = container;
        installFontDefault();
      } catch (e) {
        state.lastInitError = '初始化前置步骤失败：' + e;
        console.error('[试炼2D] ' + state.lastInitError, e);
        state.available = false;
        return false;
      }
      state.available = true;

      // 逐个尝试渲染方案：标称 WebGL → 标称 Canvas → 极简 WebGL → 极简 Canvas。
      // 为什么排满四种而不是「探测到什么就用什么」：
      //   苹果设备上「探测得到 WebGL、真建 context 却失败」非常常见 ——
      //   省电模式、Safari 里关掉硬件加速、WebGL context 名额被上一个页面占着、
      //   低内存机型，探测那一下是能过的（只建了 1×1 的小 context），
      //   真建 960×540 的游戏 context 时就翻脸。反过来某些老 WebKit 上
      //   Canvas 渲染器会因像素格式不兼容而失败。
      //   四条里只要有一条能过，玩家就能进 2D，而不是被丢回文字界面。
      var plans = [
        { type: Phaser.WEBGL,  minimal: false, label: 'WebGL' },
        { type: Phaser.CANVAS, minimal: false, label: 'Canvas' },
        { type: Phaser.WEBGL,  minimal: true,  label: 'WebGL(兼容)' },
        { type: Phaser.CANVAS, minimal: true,  label: 'Canvas(兼容)' }
      ];
      var tried = [];

      for (var i = 0; i < plans.length; i++) {
        var plan = plans[i];
        try {
          // 换档前重新探测：上一轮失败可能刚刚把 context 用掉，缓存会误导画质决策
          if (plan.minimal) probeWebGL(true);
          state.game = createGame(container, Phaser, plan.type, plan.minimal);
          state.booted = true;
          state.renderMode = (state.game.renderer && state.game.renderer.type === Phaser.WEBGL) ? 'webgl' : 'canvas';
          state.compatMode = !!plan.minimal;
          // Canvas 渲染器是纯 CPU 光栅化：强制最低画质，否则移动端必掉帧
          if (state.renderMode === 'canvas') state.quality = 'low';
          state.lastInitError = null;
          bindRenderHealth(state.game);
          installGestureGuard();
          // 场景引导兜底（热刷新时序问题会导致场景不入队）
          scheduleBootGuard();
          console.log('========================================');
          console.log(' 深渊回廊 · 试炼 2D 实时战斗 启动成功');
          console.log(' 引擎: Phaser ' + Phaser.VERSION);
          console.log(' 渲染: ' + (state.renderMode === 'webgl' ? 'WebGL' : 'Canvas（已自动降画质）') +
            (state.compatMode ? ' · 兼容模式' : '') + ' · 画质 ' + state.quality);
          console.log(' 设备: ' + (isAppleTouch() ? '苹果移动端' : '其他') + (isStandalone() ? '（主屏幕启动）' : ''));
          console.log(' 操作: A/D 或 ←/→ 移动 · W/空格 跳跃 · J/鼠标 挥砍 · L 药水');
          console.log('========================================');
          return true;
        } catch (e) {
          var why = (e && (e.message || e.name)) || String(e);
          tried.push(plan.label + '（' + why + '）');
          console.warn('[试炼2D] ' + plan.label + ' 创建引擎失败，换下一种渲染方式重试：', e);
          try { if (state.game && state.game.destroy) state.game.destroy(true); } catch (e2) { /* 忽略 */ }
          state.game = null;
          state.booted = false;
        }
      }

      // 把四条路各自的失败原因全部留下来：苹果设备上玩家看不到 console，
      // 只有把原文摆到界面上，才可能一次说清「到底哪一步过不去」。
      state.lastInitError = '四种渲染方式都失败 → ' + tried.join('；');
      console.error('[试炼2D] 初始化失败：' + state.lastInitError);
      state.available = false; state.booted = false;
      return false;
    },

    show: function () {
      if (state.container) state.container.classList.remove('trial2d-hidden');
      if (state.game && state.game.loop) state.game.loop.wake();
      fixCanvasSize();
    },
    hide: function () {
      if (state.container) state.container.classList.add('trial2d-hidden');
      if (state.game && state.game.loop) state.game.loop.sleep();
    },
    enter: function () { if (!state.available || !state.enabled) return false; API.show(); return true; },
    exit: function () { API.hide(); },

    /** 开始一局（场景未就绪时自动缓存） */
    startRun: function (d) {
      state.pendingStart = d || {};
      ensureSceneBooted(state.game, BattleScene);
      if (state.scene && state.scene.ready) {
        state.scene.beginRun(state.pendingStart);
        state.pendingStart = null;
        return true;
      }
      return false;
    },

    /** 更新英雄技能（宿主换英雄 / 状态变化时调用） */
    setSkill: function (skill) {
      if (!state.scene || !state.scene.ready) return false;
      var s = state.scene;
      s.skill = skill || null;
      s.skillId = (skill && skill.id) || '';
      s.skillUsed = !!(skill && skill.used);
      s.updateSkillHud();
      return true;
    },

    /**
     * 更新诅咒与环境效果（宿主在换层 / 状态变化时调用）
     * curses 传名字数组（与文字版试炼同一份），environment 传 generateEnvironmentEffect 的结果
     */
    setCursesEnv: function (curses, env) {
      if (!state.scene || !state.scene.ready) return null;
      return state.scene.setCursesAndEnv(curses, env);
    },

    /** 图鉴：打开 / 关闭（宿主按钮或触摸都能用） */
    openCodex: function (tab) {
      if (!state.scene || !state.scene.ready) return false;
      if (state.scene.codexOpen) state.scene.closeCodex();
      else state.scene.openCodex({ tab: tab });
      return true;
    },
    isCodexOpen: function () { return !!(state.scene && state.scene.codexOpen); },

    /** 狂怒：宿主（商店的「狂怒燃料」）用这个直接把怒槽充满 */
    fillFury: function () {
      if (!state.scene || !state.scene.ready) return false;
      return state.scene.addFury(FURY.max) > 0;
    },
    getFury: function () {
      if (!state.scene || !state.scene.ready) return null;
      return { fury: Math.round(state.scene.fury), max: FURY.max, active: state.scene.furyActive() };
    },

    stopRun: function () {
      state.pendingStart = null;
      if (state.scene && state.scene.ready) state.scene.abortRun();
    },

    /** 切到文字界面：暂停本局（画面交给宿主隐藏） */
    pauseRun: function () {
      if (state.scene && state.scene.ready) state.scene.pauseForView();
      return true;
    },

    /** 从文字界面回到 2D 画面 */
    resumeRun: function () {
      if (state.scene && state.scene.ready) state.scene.resumeFromView();
      return true;
    },

    /** 实时战况快照（文字界面显示用） */
    snapshot: function () {
      if (state.scene && state.scene.ready) return state.scene.buildSnapshot();
      return null;
    },

    /** 直接设置当前试炼点数（文字商店购买后回写） */
    setPoints: function (n) {
      if (!state.scene || !state.scene.ready || typeof n !== 'number' || !isFinite(n)) return false;
      state.scene.points = Math.max(0, Math.round(n));
      state.scene.refreshHud();
      return true;
    },

    /** 直接打开 / 关闭画面内商店（供宿主或测试调用） */
    openShop: function () {
      if (state.scene && state.scene.ready) { state.scene.openShop(); return true; }
      return false;
    },
    closeShop: function () {
      if (state.scene && state.scene.ready) { state.scene.closeShop(); return true; }
      return false;
    },

    /** 运行时同步玩家属性（商店/遗物生效） */
    syncPlayer: function (p) {
      if (state.scene && state.scene.ready) state.scene.applyPlayerStats(p);
    },

    debug: function () {
      var s = state.scene;
      var o = {
        available: state.available, enabled: state.enabled, booted: state.booted,
        quality: state.quality, ready: API.isReady(),
        renderType: (state.game && state.game.renderer && global.Phaser)
          ? (state.game.renderer.type === global.Phaser.WEBGL ? 'WebGL' : 'Canvas') : null,
        fps: state.game && state.game.loop ? Math.round(state.game.loop.actualFps) : null,
        // 苹果设备排障用：兼容模式 / 上下文回收 / 是否主屏幕启动，一眼能看出退到了哪一档
        compatMode: !!state.compatMode,
        contextLost: !!state.contextLost,
        appleTouch: isAppleTouch(),
        standalone: isStandalone()
      };
      if (s && s.ready) {
        o.floor = s.floor;
        o.points = s.points;
        o.kills = s.kills || 0;
        o.roomsCleared = s.roomsCleared || 0;
        o.running = s.running;
        o.finished = !!s._finished;
        o.difficulty = s.difficulty;
        o.env = s.env ? s.env.name : null;
        o.mapOpen = !!s.mapOpen;
        o.shopOpen = !!s.shopOpen;
        o.deathOpen = !!s.deathOpen;
        o.confirmOpen = !!s.confirmOpen;
        o.viewPaused = !!s._viewPaused;
        o.roomGoal = s.roomGoal ? { kind: s.roomGoal.kind, done: s.roomGoal.done } : null;
        o.room = s.roomNode ? { type: s.roomNode.type, col: s.roomNode.col, row: s.roomNode.row } : null;
        o.target = s.nearestEnemy ? {
          name: s.nearestEnemy.name, hp: Math.round(s.nearestEnemy.hp),
          atk: Math.round(s.nearestEnemy.atk), tier: s.nearestEnemy.tier,
          behavior: s.nearestEnemy.behavior,
          panelVisible: s.targetPanel ? s.targetPanel.visible : null,
          barVisible: s.nearestEnemy.meter ? s.nearestEnemy.meter.fill.visible : null,
          barWidth: s.nearestEnemy.meter ? s.nearestEnemy.meter.w : null
        } : null;
        o.meters = {
          hero: s.heroMeter ? {
            w: s.heroMeter.w, shown: Math.round(s.heroMeter.shown * 1000) / 1000,
            trail: Math.round(s.heroMeter.trail * 1000) / 1000, h: s.heroMeter.trackH
          } : null,
          shield: s.shieldMeter ? { shown: Math.round(s.shieldMeter.shown * 1000) / 1000 } : null,
          boss: s.bossMeter ? { visible: s.bossMeter.track ? s.bossMeter.track.visible : null } : null,
          target: s.targetMeter ? { w: s.targetMeter.w } : null,
          enemyBars: s.enemies.filter(function (e) { return e.meter && e.meter.fill.visible; }).length
        };
        o.hudButtons = (s.hudButtons || []).map(function (b) {
          return { id: b.id, w: b.w, h: b.h, x: b.x, y: b.y, state: b.state };
        });
        o.shop = s.shopOpen ? {
          tab: s.shopTab, page: s.shopPage,
          groups: (s.shopData && s.shopData.groups) ? s.shopData.groups.map(function (g) {
            return { title: g.title, count: (g.items || []).length };
          }) : [],
          items: s.shopItemRects ? s.shopItemRects.length : 0
        } : null;
        o.buttons = {
          hud: (s.hudButtons || []).map(function (b) { return b.id; }),
          death: (s.panelButtons && s.panelButtons.death ? s.panelButtons.death : []).map(function (b) { return b.action; }),
          shop: (s.panelButtons && s.panelButtons.shop ? s.panelButtons.shop : []).map(function (b) { return b.action; }),
          confirm: (s.panelButtons && s.panelButtons.confirm ? s.panelButtons.confirm : []).map(function (b) { return b.action; })
        };
        o.map = s.floorMap ? {
          floor: s.floorMap.floor,
          total: s.floorMap.nodes.length,
          visited: s.floorMap.nodes.filter(function (n) { return n.visited; }).length,
          currentType: s.floorMap.current ? s.floorMap.current.type : null,
          selectable: s.floorMap.current ? s.floorMap.current.links.map(function (id) {
            var n = s.floorMap.nodes[id];
            return n ? n.type : null;
          }) : []
        } : null;
        o.enemiesAlive = s.enemies.filter(function (e) { return e.alive; }).length;
        o.enemiesTotal = s.enemies.length;
        o.bossHp = s.boss ? Math.round(s.boss.hp) : null;
        o.hero = {
          hp: Math.round(s.hero.hp), maxHp: s.hero.maxHp, shield: Math.round(s.hero.shield),
          x: Math.round(s.hero.x), y: Math.round(s.hero.y),
          vx: Math.round(s.hero.body.velocity.x), vy: Math.round(s.hero.body.velocity.y),
          onGround: !!(s.hero.body.blocked.down || s.hero.body.touching.down),
          facing: s.hero.flipX ? -1 : 1,
          attacking: s.attacking,
          potions: s.hero.potions,
          dead: s.heroDead,
          charging: !!s.isCharging,
          chargeRatio: Math.round((s.chargeRatio || 0) * 100) / 100,
          diving: !!s.diving,
          stamina: Math.round(s.hero.stamina),
          maxStamina: s.hero.maxStamina,
          dodging: !!s.dodging,
          dodgeReady: s.time.now >= s.dodgeReadyAt,
          perfectLeft: Math.max(0, Math.round(s.perfectUntil - s.time.now)),
          perfectCount: s.hero.perfectCount || 0,
          perfectWindow: s.perfectWindowOpen(),
          skillId: s.skillId || null,
          skillName: (s.skill && s.skill.activeName) || null,
          skillUsed: !!s.skillUsed,
          skillPowerLeft: Math.max(0, Math.round((s.skillPowerUntil || 0) - s.time.now)),
          skillPowerMult: s.skillPowerMult || 1,
          skillBridge: hasBridge('skillUsed')
        };
        o.enemySample = s.enemies.filter(function (e) { return e.alive; }).slice(0, 3).map(function (e) {
          return { name: e.name, hp: Math.round(e.hp), state: e.state, x: Math.round(e.sprite.x) };
        });
      }
      return o;
    },

    /** 模拟按键（自动化测试用） */
    press: function (action) {
      var s = state.scene;
      if (!s || !s.ready) return false;
      if (action === 'dodge') return s.tryDodge();
      if (action === 'skill') return s.useSkill();
      if (action === 'guard') { s.touchInput.guardHeld = true; return true; }
      if (action === 'guardOff') { s.touchInput.guardHeld = false; return true; }
      if (action === 'guardState') return { guarding: s.guarding, ready: s.guardReadyAt > 0 }; 
      if (action === 'chain') return s.pickChain(s.time.now);
      if (action === 'crystals') return (s.crystals || []).map(function (c) { return { x: Math.round(c.x), y: Math.round(c.y), taken: c.taken, near: c.near }; });
      if (action === 'pickCrystal') {
        var list = (s.crystals || []).filter(function (c) { return !c.taken; });
        var c0 = list[arguments[1] || 0];
        if (!c0) return false;
        s.hero.body.reset(c0.core.x, c0.core.y + 26);
        return true;
      }
      if (action === 'perches') return (s.platformPerches || []).map(function (p) { return { x: Math.round(p.x), y: Math.round(p.y) }; });
      if (action === 'perfect') { s.onPerfectDodge(); return true; }
      if (action === 'attack') { s.tryAttack(); return true; }
      if (action === 'potion') { s.usePotion(); return true; }
      if (action === 'jump') {
        // 轻点：以最小力度起跳
        if (s.hero.body.blocked.down || s.hero.body.touching.down) {
          s.hero.setVelocityY(-CHARGE.minPower);
          s.spark(s.hero.x, s.hero.y - 4, 0xa8e6ff);
        }
        return true;
      }
      if (action === 'charge') {
        // 开始蓄力（需在地面）
        if (s.hero.body.blocked.down || s.hero.body.touching.down) {
          s.isCharging = true; s.chargeStart = s.time.now; s.chargeRatio = 0;
        }
        return true;
      }
      if (action === 'jumpFull') {
        // 以蓄力比例起跳（默认满蓄力）
        var ratio = (s.chargeRatio !== undefined) ? s.chargeRatio : 1;
        s.isCharging = false;
        s.hero.setVelocityY(-(CHARGE.minPower + (CHARGE.maxPower - CHARGE.minPower) * ratio));
        s.spark(s.hero.x, s.hero.y - 4, ratio > 0.75 ? 0xffd76a : 0xa8e6ff);
        return true;
      }
      // 测试辅助：打开地图 / 进入第 idx 个可选房间（默认第一个）
      if (action === 'map') { s.openMap(); return true; }
      if (action === 'mapClose') { s.closeMap(); return true; }
      if (action === 'enterRoom') {
        if (!s.floorMap || !s.floorMap.current) return false;
        var linkIds = s.floorMap.current.links;
        if (!linkIds.length) return false;
        var target = s.floorMap.nodes[linkIds[0]];
        s.openMap();
        s.enterRoom(target);
        return true;
      }
      if (action === 'clear') {
        // 测试辅助：直接清空当前房间的敌人
        s.enemies.forEach(function (e) { if (e.alive) s.damageEnemy(e, { dmg: 999999, crit: false }, false); });
        return true;
      }
      // ===== 画面内界面（死亡 / 商店 / 确认框 / 视图）测试辅助 =====
      if (action === 'dive') {
        // 跳劈：滞空时挥砍（需先离地，否则为普通挥砍）
        s.tryAttack();
        return !!s.diving;
      }
      if (action === 'shop') { s.openShop(); return true; }
      if (action === 'shopClose') { s.closeShop(); return true; }
      // ===== 图鉴 / 诅咒 / 环境 测试辅助 =====
      if (action === 'codex') { if (s.codexOpen) s.closeCodex(); else s.openCodex(); return true; }
      if (action === 'codexTab') { s.codexTab = arguments[1] || 'hero'; s.codexPage = 0; s.codexIndex = 0; if (s.codexOpen) s.rebuildCodex(); return true; }
      if (action === 'codexSelect') { s.selectCodexEntry(arguments[1] || 0); return true; }
      if (action === 'codexEntries') return s.codexEntries(s.codexTab).map(function (e) { return { id: e.id, name: e.name, cn: e.cn || '', rows: (e.rows || []).length, note: (e.note || '').slice(0, 30) }; });
      if (action === 'codexClick') {
        var r0 = (s.codexRects || [])[arguments[1] || 0];
        if (!r0) return false;
        return s.handleCodexClick({ x: r0.x + r0.w / 2, y: r0.y + r0.h / 2 });
      }
      if (action === 'setCurses') { return s.setCursesAndEnv(arguments[1] || [], arguments[2] || null); }
      if (action === 'curseState') return {
        curses: (s.curses || []).slice(), env: s.worldEnv ? s.worldEnv.name : null,
        envSummary: s.envSummaryText ? s.envSummaryText() : '',
        envPanelVisible: s.envPanel ? s.envPanel.visible : null,
        envPanelX: s.envPanel ? s.envPanel.x : null, envPanelY: s.envPanel ? s.envPanel.y : null,
        envPanelW: s._envPanelW || null, envPanelH: s._envPanelH || null,
        envPanelPinned: !!(s.envPanel && s.envPanel.parentContainer),
        envName: s.envName ? s.envName.text : null, envValue: s.envValueText ? s.envValueText.text : null,
        cursePanelVisible: s.cursePanel ? s.cursePanel.visible : null,
        cursePanelY: s.cursePanel ? s.cursePanel.y : null,
        cursePanelH: s._cursePanelH || null,
        cursePanelPinned: !!(s.cursePanel && s.cursePanel.parentContainer === s.hud),
        curseLabel: s.curseLabel ? s.curseLabel.text : null,
        curseY: s._curseTop != null ? s._curseTop : null,
        pulseY: s.pulseText ? s.pulseText.y : null,
        roomY: s.roomText ? s.roomText.y : null,
        flashLeftMs: Math.max(0, Math.round((s.envFlashUntil || 0) - s.time.now)),
        curseFlashLeftMs: Math.max(0, Math.round((s.curseFlashUntil || 0) - s.time.now)),
        centerText: s.centerMsg ? s.centerMsg.text : null,
        centerAlpha: s.centerMsg ? Number(s.centerMsg.alpha.toFixed(2)) : null,
        pulseInMs: Math.max(0, Math.round(s.pulseAt - s.time.now)),
        hudVisible: s.cursePanel ? s.cursePanel.visible : null,
        hudText: s.curseText ? s.curseText.text : null
      };
      if (action === 'envRoll') { s.rollRoomEnv(arguments[1] || null); return true; }
      // 左侧 HUD 竖排几何：属性面板 → 英雄技能 → 常驻按钮（验"三层不重叠"用）
      if (action === 'layoutState') {
        var boxOf = function (o) {
          return o ? { x: o.x, y: o.y, w: o.w, h: o.h, top: o.y - o.h / 2, bottom: o.y + o.h / 2, right: o.x + o.w } : null;
        };
        var items = s.statItems || [];
        var btns = (s.hudButtons || []).map(function (b) {
          var g = boxOf(b); g.id = b.label; return g;
        });
        return {
          statFirstY: items[0] ? items[0].text.y : null,
          statLastY: items[items.length - 1] ? items[items.length - 1].text.y : null,
          statBottom: s.hudStatBottom, statRows: s.statPanelMetrics(s.scale.width).rows,
          skill: boxOf(s.skillBtn), buttons: btns, rowBottom: s._hudRowBottom,
          targetPanelY: s.targetPanel ? s.targetPanel.y : null
        };
      }
      if (action === 'pulse') { s.applyPulse(); return true; }
      if (action === 'fury') return s.tryFury();
      if (action === 'furyAdd') { return s.addFury(arguments[1] || 0); }
      if (action === 'furyState') return {
        fury: Math.round(s.fury), max: FURY.max, active: s.furyActive(),
        leftMs: Math.round(s.furyLeft()), autoInMs: s.furyAutoAt ? Math.max(0, Math.round(s.furyAutoAt - s.time.now)) : 0,
        text: s.furyText ? s.furyText.text : null, hintVisible: s.furyHint ? s.furyHint.visible : null, ringVisible: s.furyRing ? s.furyRing.visible : null
      };
      if (action === 'shopTab') { s.onShopAction('tab' + (s.shopTab + 1)); return true; }
      if (action === 'shopNext') { s.onShopAction('next'); return true; }
      if (action === 'shopBuy') {
        var id = arguments[1];
        if (!id) { var it = (s.shopItemRects || [])[0]; id = it ? it.id : null; }
        if (!id) return false;
        s.buyShopItem(id);
        return true;
      }
      if (action === 'shopClick') {
        // 走真实点击路径（命中测试）
        var r = (s.shopItemRects || [])[arguments[1] || 0];
        if (!r) return false;
        s.handleUiClick({ x: r.x + r.w / 2, y: r.y, id: -1 });
        return true;
      }
      if (action === 'clickHud') {
        var name = arguments[1] || 'shop';
        var btn = (s.hudButtons || []).filter(function (b) { return b.id === name; })[0];
        if (!btn) return false;
        s.handleUiClick({ x: btn.x + btn.w / 2, y: btn.y, id: -2 });
        return true;
      }
      if (action === 'clickDeath') {
        var want = arguments[1];
        var d = (s.panelButtons.death || []).filter(function (b) { return b.action === want; })[0];
        if (!d) return false;
        s.handleUiClick({ x: d.x + d.w / 2, y: d.y, id: -3 });
        return true;
      }
      if (action === 'clickShop') {
        var wantS = arguments[1];
        var sb = (s.panelButtons.shop || []).filter(function (b) { return b.action === wantS; })[0];
        if (!sb) return false;
        s.handleUiClick({ x: sb.x + sb.w / 2, y: sb.y, id: -4 });
        return true;
      }
      if (action === 'clickConfirm') {
        var wantC = arguments[1];
        var c = (s.panelButtons.confirm || []).filter(function (b) { return b.action === wantC; })[0];
        if (!c) return false;
        s.handleUiClick({ x: c.x + c.w / 2, y: c.y, id: -5 });
        return true;
      }
      if (action === 'kill') {
        // 测试辅助：直接击杀主角（触发画面内死亡结算）
        s.damageHero(999999, null, true);
        return true;
      }
      if (action === 'hint') { return { text: s.hintText ? s.hintText.text : '' }; }
      return false;
    },

    /* ---- 自定义布局（设置 → 2D 试炼按键自定义）---- */
    enterLayoutEdit: function () {
      var s = state.scene;
      return s ? s.enterLayoutEdit() : false;
    },
    exitLayoutEdit: function (save) {
      var s = state.scene;
      if (s) s.exitLayoutEdit(save);
    },
    isLayoutEditing: function () { return !!(state.scene && state.scene.editMode); },
    /** 列出所有可编辑单元及其当前自定义值（工具条用） */
    getLayoutUnits: function () {
      var s = state.scene;
      if (!s) return [];
      return s.editableUnits().map(function (u) {
        var c = (s.customLayout || {})[u.id] || {};
        return {
          id: u.id, label: u.label, group: u.group,
          dx: c.dx || 0, dy: c.dy || 0,
          s: c.s == null ? 1 : c.s,
          a: c.a == null ? 1 : c.a,
          v: c.v !== false,
          changed: s.isCustomized(u.id),
          sel: s.editSel === u.id
        };
      });
    },
    selectLayoutUnit: function (id) {
      var s = state.scene; if (!s || !s.editMode) return;
      s.editSel = id; s.drawEditOverlay(); s.notifyLayoutBar();
    },
    setLayoutValue: function (id, key, v) {
      var s = state.scene; if (s && s.editMode) s.setLayoutValue(id, key, v);
    },
    resetLayout: function (id) {
      var s = state.scene; if (s) s.resetCustomLayout(id);
    },
    exportLayout: function () { var s = state.scene; return s ? s.exportCustomLayout() : '{}'; },
    importLayout: function (text) { var s = state.scene; return s ? s.importCustomLayout(text) : false; },

    destroy: function () {
      if (state.game) { try { state.game.destroy(true); } catch (e) { /* 忽略 */ } state.game = null; }
      state.scene = null; state.booted = false; state.pendingStart = null;
      console.log('[试炼2D] 引擎已销毁');
    }
  };

  /* ============================================================
     布局自定义工具条（DOM 层）
     ------------------------------------------------------------
     分工：画布内拖动负责「位置」，工具条负责「缩放 / 透明度 / 显隐 /
     重置 / 导入导出」。滑杆这类控件放 DOM 上既好点又好调，画布内
     只需要画外框。
     ============================================================ */
  var LayoutBar = {
    scene: null,
    bound: false,
    ioMode: null,      // 'export' | 'import'：导入导出面板当前模式

    el: function (id) { return document.getElementById(id); },

    open: function (scene) {
      this.scene = scene;
      var bar = this.el('trial2dLayoutBar');
      if (!bar) return;
      if (!this.bound) { this.bind(); this.bound = true; }
      bar.classList.remove('hidden');
      this.buildList();
      this.sync(scene);
    },

    close: function () {
      this.scene = null;
      this.hideIO();
      var bar = this.el('trial2dLayoutBar');
      if (bar) bar.classList.add('hidden');
    },

    /** 单元列表（横向滚动的胶囊）：比在画面上点更准，小元素也不怕点不到 */
    buildList: function () {
      var list = this.el('trial2dLbList');
      if (!list) return;
      var units = (global.试炼2D && global.试炼2D.getLayoutUnits) ? global.试炼2D.getLayoutUnits() : [];
      list.innerHTML = '';
      units.forEach(function (u) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 't2d-lb-chip';
        b.textContent = u.label;
        b.setAttribute('data-unit', u.id);
        b.addEventListener('click', function () {
          if (global.试炼2D && global.试炼2D.selectLayoutUnit) global.试炼2D.selectLayoutUnit(u.id);
        });
        list.appendChild(b);
      });
    },

    selUnit: function () {
      var units = (global.试炼2D && global.试炼2D.getLayoutUnits) ? global.试炼2D.getLayoutUnits() : [];
      for (var i = 0; i < units.length; i++) if (units[i].sel) return units[i];
      return null;
    },

    sync: function (scene) {
      if (scene) this.scene = scene;
      if (!this.scene) return;
      var units = (global.试炼2D && global.试炼2D.getLayoutUnits) ? global.试炼2D.getLayoutUnits() : [];
      var sel = this.selUnit();

      var nameEl = this.el('trial2dLbName');
      if (nameEl) {
        nameEl.textContent = sel
          ? (sel.label + (sel.changed ? ' · 已改' : '') + (sel.v === false ? ' · 已隐藏' : ''))
          : '点选面板或按钮';
      }

      var s = sel ? sel.s : 1, a = sel ? sel.a : 1;
      var sr = this.el('trial2dLbScale'), sv = this.el('trial2dLbScaleVal');
      var ar = this.el('trial2dLbAlpha'), av = this.el('trial2dLbAlphaVal');
      var vb = this.el('trial2dLbVisible');
      if (sr) { sr.value = Math.round(s * 100); sr.disabled = !sel; }
      if (sv) sv.textContent = Math.round(s * 100) + '%';
      if (ar) { ar.value = Math.round(a * 100); ar.disabled = !sel; }
      if (av) av.textContent = Math.round(a * 100) + '%';
      if (vb) { vb.checked = sel ? sel.v : true; vb.disabled = !sel; }

      var byId = {};
      units.forEach(function (u) { byId[u.id] = u; });
      document.querySelectorAll('#trial2dLbList .t2d-lb-chip').forEach(function (c) {
        var u = byId[c.getAttribute('data-unit')];
        c.classList.toggle('sel', !!(u && u.sel));
        c.classList.toggle('changed', !!(u && u.changed));
        c.classList.toggle('off', !!(u && u.v === false));
      });
    },

    /* ============================================================
       导入 / 导出
       ------------------------------------------------------------
       刻意不用 window.prompt：系统对话框会把页面顶出全屏，而 2D 试炼的横屏
       锁定是绑在全屏上的 —— 一弹 prompt，屏幕就转回竖屏而且再也回不来
       （方向锁随全屏一起失效）。另外 prompt 里看不了带缩进换行的长 JSON，
       手机上也几乎没法长按选中复制。
       ============================================================ */
    showIO: function (mode, text) {
      var self = this;
      var panel = this.el('trial2dIoPanel');
      var ta = this.el('trial2dIoText');
      // HTML 没跟着更新（或浏览器还在用旧缓存）时退回提示框：难看，但功能不能丢
      if (!panel || !ta) {
        if (mode === 'export') {
          window.prompt('布局 JSON（可复制备份）：', text || '');
        } else {
          var t = window.prompt('粘贴布局 JSON：');
          if (t && global.试炼2D) {
            this.toast(global.试炼2D.importLayout(t) ? '导入成功' : '格式不对，已忽略');
          }
        }
        return;
      }

      var isExport = (mode !== 'import');
      this.ioMode = isExport ? 'export' : 'import';

      var title = this.el('trial2dIoTitle'), hint = this.el('trial2dIoHint');
      if (title) title.textContent = isExport ? '导出布局' : '导入布局';
      if (hint) {
        hint.textContent = isExport
          ? '复制后存到别处，换机时再导入'
          : '粘贴之前导出的 JSON，会覆盖当前布局';
      }

      ta.value = text || '';
      ta.readOnly = isExport;   // 导出只读：手抖改了它就不再是原布局了

      var show = function (id, on) {
        var e = self.el(id);
        if (e) e.classList.toggle('hidden', !on);
      };
      show('trial2dIoCopy', isExport);
      show('trial2dIoPaste', !isExport);
      show('trial2dIoOk', !isExport);

      panel.classList.remove('hidden');
      if (!isExport) { try { ta.focus(); } catch (e) { /* 忽略 */ } }
    },

    hideIO: function () {
      var panel = this.el('trial2dIoPanel');
      if (panel) panel.classList.add('hidden');
      this.ioMode = null;
    },

    /** 剪贴板 API 不可用（局域网 http 不是安全上下文）时的退路：全选，让玩家长按复制 */
    selectIO: function () {
      var ta = this.el('trial2dIoText');
      if (!ta) return;
      try { ta.focus(); ta.select(); } catch (e) { /* 忽略 */ }
      this.toast('已全选，长按复制');
    },

    bind: function () {
      var self = this;
      function on(id, ev, fn) { var e = self.el(id); if (e) e.addEventListener(ev, fn); }
      function withSel(fn) {
        return function () { var u = self.selUnit(); if (u && global.试炼2D) fn(u, this); };
      }

      on('trial2dLbScale', 'input', withSel(function (u, el) {
        global.试炼2D.setLayoutValue(u.id, 's', el.value / 100);
      }));
      on('trial2dLbAlpha', 'input', withSel(function (u, el) {
        global.试炼2D.setLayoutValue(u.id, 'a', el.value / 100);
      }));
      on('trial2dLbVisible', 'change', withSel(function (u, el) {
        global.试炼2D.setLayoutValue(u.id, 'v', el.checked);
      }));
      on('trial2dLbSnap', 'change', function () {
        if (self.scene) self.scene.editSnap = this.checked;
      });
      on('trial2dLbResetItem', 'click', withSel(function (u) {
        global.试炼2D.resetLayout(u.id);
      }));
      on('trial2dLbResetAll', 'click', function () {
        if (global.试炼2D) global.试炼2D.resetLayout(null);
        self.toast('已恢复默认布局');
      });
      on('trial2dLbDone', 'click', function () {
        if (global.试炼2D) global.试炼2D.exitLayoutEdit(true);
      });
      on('trial2dLbExport', 'click', function () {
        var json = global.试炼2D ? global.试炼2D.exportLayout() : '{}';
        self.showIO('export', json);
      });
      on('trial2dLbImport', 'click', function () {
        self.showIO('import', '');
      });
      on('trial2dIoCopy', 'click', function () {
        var ta = self.el('trial2dIoText');
        if (!ta) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(ta.value).then(
            function () { self.toast('已复制到剪贴板'); self.hideIO(); },
            function () { self.selectIO(); });
        } else {
          self.selectIO();
        }
      });
      on('trial2dIoPaste', 'click', function () {
        var ta = self.el('trial2dIoText');
        if (!ta) return;
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(
            function (t) { ta.value = t || ''; },
            function () { try { ta.focus(); } catch (e) { /* 忽略 */ } });
        } else {
          try { ta.focus(); } catch (e) { /* 忽略 */ }
        }
      });
      on('trial2dIoOk', 'click', function () {
        var ta = self.el('trial2dIoText');
        var ok = !!(ta && global.试炼2D && global.试炼2D.importLayout(ta.value));
        self.hideIO();
        self.toast(ok ? '导入成功' : '格式不对，已忽略');
      });
      on('trial2dIoClose', 'click', function () { self.hideIO(); });
    },

    toast: function (msg) {
      var el = this.el('trial2dLbToast');
      if (!el) return;
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(this._t);
      this._t = setTimeout(function () { el.classList.remove('show'); }, 1800);
    }
  };
  global.Trial2DLayoutBar = LayoutBar;

  loadSettings();
  global.试炼2D = API;
  global.Trial2D = API;

})(window);
