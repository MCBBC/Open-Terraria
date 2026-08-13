// 数据驱动近战/爆炸武器投射物（1456 aiStyle 家族行为，Game.useCombatWeapon 派发）：
//   Boomerang  aiStyle 3   —— 飞出减速后返回主角（AI_003）
//   SpearProj  aiStyle 19/161 —— 随主角前刺伸缩（AI_019 的 owner 相对位移简化）
//   YoyoProj   aiStyle 99  —— 按住鼠标滞留追光标，松手收回（AI_099 channel 语义）
//   FlailProj  aiStyle 15  —— AI_015_Flails 全状态机（旋转/掷出/回拉/坠落/悬荡/回收）
//   GrenadeProj aiStyle 16 —— 弹跳 + 引信爆炸（手雷 180/炸弹 150/炸药 135 tick）
// 贴图统一 Projectile_N.png 懒加载（Arrow.projSprite 共享缓存）。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projSprite } from './Arrow';
import { hitCritters, hitTownNpcs, playEnemyHitSound, tryReflectProjectile } from './projTargets';
import { applyProjStatus, applyMeleeImbue, applyFrostBurn, applyMagmaStoneProj } from './projStatus';
import { projectileData } from '../data/vanillaProjectiles';
import { canHit } from '../physics/LineOfSight';

/** 共用绘制：投射物贴图按角度旋转（贴图纵向，rotation = ang+π/2 与 AI_001 一致）。
 *  世界坐标绘制(Renderer 实体循环运行在世界变换内,勿再自算屏幕坐标) */
function drawProj(r: Renderer, _cam: Camera, e: { x: number; y: number; w: number; h: number }, projId: number, ang: number, fallbackColor: string, alpha = 1, drawSize = 0, mirror = false): void {
  // drawSize=绘制尺寸(0=取碰撞盒 w；-1=贴图原生尺寸——原版投射物绘制语义,
  // 爆炸族雷管 10×32 竖条等非方贴图必须走原生尺寸否则被拉方)
  // mirror=旋转坐标系内水平镜像（XNA dir=FlipHorizontally 等价，绕 origin 翻转）
  const img0 = projSprite(projId);
  const natural = drawSize < 0 && img0 && img0.complete && img0.naturalWidth > 0;
  const dw = natural ? img0!.naturalWidth : drawSize > 0 ? drawSize : e.w;
  const ctx = r.canvas.getContext('2d');
  if (!ctx) return;
  const img = img0;
  ctx.save();
  ctx.globalAlpha = alpha; // AI_161 细剑淡入淡出(:44993-44994)
  // y 中心用 h（342 冰霜刃 22×2 薄刃命中盒等非方形型号,勿用 w 兜）
  ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
  ctx.rotate(ang);
  if (mirror) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = false;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -dw / 2, -dw / 2, dw, dw * (img.naturalHeight / img.naturalWidth));
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(-dw / 2, -dw / 2, dw, dw);
  }
  ctx.restore();
}

/** 同敌命中去重 + 冷却的通用伤害结算。
 *  hitCd 记录每敌剩余冷却 tick，每 fixedUpdate 调用方先 tickCd() 递减；
 *  cooldown >= 9999 视作单次结算（突刺类：一击每敌只中一次） */
class HitCooldown {
  private map = new Map<number, number>();
  tick(): void {
    for (const [k, v] of this.map) {
      if (v <= 1) this.map.delete(k);
      else this.map.set(k, v - 1);
    }
  }
  ready(id: number, cooldown: number): boolean {
    if (this.map.has(id)) return false;
    if (cooldown < 9999) this.map.set(id, cooldown);
    else this.map.set(id, 2147483647); // 永不再中
    return true;
  }
  clear(): void { this.map.clear(); }
}

type ReflectableWeaponProj = {
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  damage: number; knockback: number;
  projId?: number;
  hostile?: boolean;
  reflected?: boolean;
  /** 暴击率（GetWeaponCrit：4 基础+武器 item.crit+装备/buff,Game 侧算好传入） */
  critChance?: number;
  /** 近战系投射物（吃武器浸剂 meleeEnchant,StatusNPC:10559 门 (melee||whip)） */
  meleeProj?: boolean;
};

function hitEnemies(
  self: { x: number; y: number; w: number; h: number; vx: number; damage: number; knockback: number },
  game: GameHooks,
  hitCd: HitCooldown,
  cooldown: number,
  dirX: number,
  pen = 0,
  /** 每次命中敌结算后的回调（Boomerang 的 Projectile.Damage 回收门 :12278-12291 用） */
  onHit?: () => void,
): void {
  // 小动物:一击致死(原版小动物是 NPC;近战挥砍同语义)。回旋镖/悠悠球等穿透型
  // 命中小动物不消耗穿透语义——hurt 自带 iframes 防同帧连击
  hitCritters(self, game);
  // 城镇 NPC 受击(原版 Projectile.Damage 对 friendly NPC 同样生效,杀裁缝师即此链);
  // 穿透型不消耗穿透语义(NPC.hurt 8t iframes 自去重)
  hitTownNpcs(self, game, self.damage, Math.sign(self.vx) * 2);
  const me = self as ReflectableWeaponProj;
  // 反射后的弹体 friendly 已翻——不再入敌怪判定（原版 Damage NPC 需 friendly 门禁）
  if (me.reflected) return;
  for (const ent of game.enemies()) {
    const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean; def?: { hitSound?: string[] }; reflectsProjectiles?: boolean };
    if (e.dead) continue;
    if (!(self.x < e.x + e.w && self.x + self.w > e.x && self.y < e.y + e.h && self.y + self.h > e.y)) continue;
    // 反射源命中（Projectile.cs:12050-12060）：按 projId 查 CanBeReflected 白名单——
    // 回旋镖 aiStyle3/长矛 19/161/悠悠球 99/15 均不在表内不反射，白名单内新弹型自动生效
    if (me.projId !== undefined && tryReflectProjectile(me, me.projId, e, game)) return;
    if (!hitCd.ready(e.id, cooldown)) continue;
    // 暴击 = GetWeaponCrit 语义:4 基础 + 武器 item.crit + 装备/buff（Game 侧合并传入；
    // 此前全族写死 4%——Sunfury 原版 crit=7 应为 11%）
    const crit = Math.random() < (me.critChance ?? 0.04);
    const dmg = crit ? self.damage * 2 : self.damage;
    const kdir = Math.sign((e.x + e.w / 2) - (self.x + self.w / 2)) || dirX;
    playEnemyHitSound(game, e);
    e.hurt(dmg, kdir * self.knockback, 0, game, pen, crit, 0, true); // 裸 kb（0.65 自造已摘）——hurt 内原版管线
    onHit?.(); // Damage 内回收门/穿透自减在此语义点求值（Projectile.cs:12278-12291）
    // 命中 debuff(StatusNPC:10555——阳炎之怒 50% OnFire 300t / 粉恒星之锤 OnFire 等,按型号查表)
    applyProjStatus(me.projId, e as unknown as Record<string, number>);
    // 武器浸剂（StatusNPC:10559 门 (melee||whip)&&meleeEnchant>0——近战四族命中施加,
    // 时长 Player.cs:6141-6171;挥砍侧同表在 Game 挥击结算）
    if (me.meleeProj) {
      const pl = game.player as unknown as { buffs: { has: (b: never) => boolean }; equipStats: { frostBurn: boolean; magmaStone: boolean } };
      applyMeleeImbue(pl.buffs, e as unknown as Record<string, number>,
        () => game.spawnParticles(e.x + e.w / 2, e.y + e.h / 2,
          ['#FF6090', '#60FF90', '#6090FF', '#FFD040'][Math.floor(Math.random() * 4)], 6, 2.4, { life: 40, damp: 0.96 }));
      // 冰霜盔甲引擎(melee 门,:93712)
      applyFrostBurn(pl.equipStats.frostBurn, e as unknown as Record<string, number>);
      // 岩浆石/火焰护手（melee 门,:10866 1/7 → OnFire3 6s）
      applyMagmaStoneProj(pl.equipStats.magmaStone, e as unknown as Record<string, number>);
    }
    game.addDamageNumber(self.x + self.w / 2, self.y, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
    // 配重球（counterWeight 装备时悠悠球命中落配重：YoyoBag 语义近似——
    // spawnWeight 回调由 Game 注入（无实体循环依赖）；伤害 = 武器 100%（原版））
    const wSpawn = (self as { spawnWeight?: (x: number, y: number, dmg: number) => void }).spawnWeight;
    if (wSpawn) wSpawn(e.x + e.w / 2, e.y, Math.round(self.damage));
  }
}

// ================= 回旋镖（aiStyle 3，AI_003_Boomerang，Projectile.cs:36623-37352） =================
// 原版四段（Update 的 numUpdates 循环内【先 AI(:15434) 后移动/碰撞(:15674)】——step() 同序）：
//   ① 出程 ai[0]==0（:36783-37087）：无摩擦直线——AI 内无任何通用摩擦/减速项,
//      速度只被特例族（下垂/追踪/双门）改写;
//   ② 回收门（三处独立）：
//      命中敌 → Projectile.Damage :12278-12291（出程速度反转 + ai[0]=1;
//              豁免 301/866/902/光刃族）;
//      撞墙  → HandleMovement :18103-18161（33/106/866 分轴反弹不回收;光刃转悬停
//              ai[0]=2(:17975-17990);其余 ai[0]=1 + 速度=-lastVelocity,383 豁免取反）;
//      计数门 → per-type 见下表;
//   ③ 返回段 ai[0]==1（:37111-37288）：tileCollide=false 穿墙（:37145）;目标速度制
//      逼近（朝玩家 num28 px/t,每轴步进 num29,异号加倍 :37249-37282;383 专属
//      沿差向量加速 :37237-37247）;距玩家 >3000px Kill（301 6000,:37223-37232）;
//   ④ 回收：与玩家 AABB 相交即 Kill（:37272-37288）。
//
// ★特例族计数门/出程行为小表（ai[1] 每 AI 次自增 :36790-36793;866 计数在 localAI[0]
//   :36985/:36999;extraUpdates 型号（182/866/301,SetDefaults）按 AI 次计数,
//   折合实际 tick = 计数 ÷ (1+extraUpdates)）：
//   6/19/52/113/272/333/867/902/1000/1052 → ai[1]≥30 回收（:37082-37086）
//   106 光碟     → 同 30 回收——独立 45 门（:36794-36799）在其后的类型链尾
//                  else if(ai[1]≥30)（:37082-37087,未豁免 106）之前永不可达
//                  =1456 影子死代码,实测回收点就是 30;撞墙反弹不回收（:18142-18151）
//   320 冰回旋镖 → ai[1]≥10 起下垂 vy+0.5/vx×0.95（:36868-36886）
//   383 附魔飞刀 → 同 320（上升再+0.35）;距玩家>800 回收（:36868-36888）
//   182 圣骑士锤 → 追踪窗 ai[1]∈(10,360) 取 800px 最近敌（CanHit 视线门）,
//                  无目标且 ≥30 回收（:36889-36973;目标速度 12/轴步进 0.25 :36937-36973）
//   866 飞刀     → localAI[0] 同窗（FindTargetWithLineOfSight 缺省 800 :42972）;
//                  无目标 ≥30 回收（:36980-37057）
//   301 弹跳盾   → 按住 ≥20/松手 ≥100 双门,回收时速度归零（:37062-37080）
//   光刃族 19 型 → ai[1]≥30 起垂落 vy+1/vx×0.96（:36800-36832）;撞墙转悬停 ai[0]=2
//                  （vy<0 减半/rotation=2.335/vx=0/vy+1,:37089-37109）

/** 返回段型号参数表（:37146-37206）：[num28 目标速率, num29 轴步进加速度]。
 *  未列型号 = 缺省 9/0.4（:37146-37147）;光刃族整族 40/3（:37148-37151） */
const BOOMERANG_RETURN: Record<number, [number, number]> = {
  19: [20, 1.5], 33: [18, 1.2], 106: [16, 1.2], 182: [16, 1.2],
  272: [20, 1.5], 866: [16, 1.2], 333: [12, 0.6], 301: [15, 3],
  320: [15, 3], 383: [16, 4], 1000: [9.5, 0.4],
};

/** Phaseblade 族（ProjectileID.cs:27 IsAPhaseblade,19 型）：
 *  出程 30t 后垂落;返回 40/3 高速穿墙归位 + extraUpdates 随距离增长（:37211-37221） */
const PHASEBLADE_PROJ = new Set([1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067,
  1068, 1069, 1070, 1071, 1072, 1074, 1075, 1076, 1101, 1102]);

/** 撞墙反弹族（:18142-18151）：33 荆棘轮/106 光碟/866 飞刀——撞墙不回收,
 *  命中轴速度取反（lastVelocity 语义）续飞 */
const WALL_BOUNCE_PROJ = new Set([33, 106, 866]);

/** 命中敌不触回收的型号（Damage :12278 豁免列;902 另走"返回段命中 direction 翻转"
 *  :12292-12297,301/383 命中时 direction 朝敌改写 :12249-12263） */
const NO_HIT_RETURN_PROJ = new Set([301, 866, 902]);

/** 出程尘近似表（AI_003 头段 :36652-36738 per-type Dust——颜色/概率近似,
 *  粒型/noGravity/光源不建模;未列型号原版本就无尘） */
const BOOMERANG_DUST: Record<number, [string, number]> = {
  19: ['#FFA040', 1], 33: ['#B0E080', 0.6], 6: ['#FFE0A0', 0.25],
  113: ['#B0C0FF', 1], 320: ['#C0E8FF', 0.4], 383: ['#D0A0FF', 0.3],
  867: ['#FF6060', 0.4], 1000: ['#FFD080', 0.3], 182: ['#FFD080', 0.5],
};

/** 回旋镖命中盒型号表（SetDefaults aiStyle=3 全 36 型提取：type→size;
 *  光刃族 1065-1070/1072/1074/1076/1102=46,其余 38） */
const BOOMERANG_SIZE: Record<number, number> = {
  6: 22, 19: 22, 33: 38, 52: 22, 106: 32, 113: 22, 182: 30, 272: 32,
  301: 38, 320: 34, 333: 38, 383: 34, 866: 30, 867: 22, 902: 20, 1000: 22,
  1052: 22, 1074: 46,
  1059: 38, 1060: 38, 1061: 38, 1062: 38, 1063: 38, 1064: 38, 1071: 38,
  1075: 38, 1101: 38,
  1065: 46, 1066: 46, 1067: 46, 1068: 46, 1069: 46, 1070: 46, 1072: 46,
  1076: 46, 1102: 46,
};

export class Boomerang extends Entity {
  w = 22; h = 22; // 默认（型号表覆盖）
  damage: number;
  knockback: number;
  projId: number;
  /** GetWeaponCrit 合并值（Game 侧传入；缺省 4 基础） */
  critChance = 0.04;
  /** ⑥ 护甲穿透（Game 注入，命中传 hurt 减防） */
  armorPen = 0;
  /** 近战系（吃武器浸剂） */
  meleeProj = true;
  /** channel 电平（301 Bouncing Shield 双门用；Game 仅 301 注入,其余族空挂无害） */
  channel: (() => boolean) | null = null;
  /** ★ai[0]（:36783 起）：0 飞出 / 1 返回 / 2 光刃撞墙悬停（:17975-17990 置 2） */
  ai0 = 0;
  /** 探针 _weapons-family-probe 读 returning——ai[0]==1 即返回段（保留旧名兼容） */
  get returning(): boolean { return this.ai0 === 1; }
  /** direction：掷出瞬间玩家 facing（NewProjectile 语义;旋转自旋符号 :37294 起） */
  private dir: number;
  /** ai[1]：飞出段计数（866 占用为目标索引,计数走 localT） */
  private outT = 0;
  /** localAI[0]：866 目标窗计数（:36985/:36999）;1074 悬停后置 -1 供返回音选择（:37102） */
  private localT = 0;
  /** localAI[1]：光刃悬停音一次性门（:37098-37109） */
  private hoverSfxDone = false;
  /** rotation（尾段 per-type :37294-37352 + 光刃出程/悬停/返回专属段） */
  private rot = 0;
  /** soundDelay（掷出呼啸 8t/301 10t,:36626-36651;每 tick 自减 :15427-15429） */
  private soundDelay = 0;
  /** SetDefaults penetrate（命中自减 :13175-13182;==0 Kill :15866-15868;866 特例 :13124-13137） */
  private penetrate: number;
  /** SetDefaults extraUpdates（AI 每 tick 跑 1+extra 次,Update :15336-15339 while 循环） */
  private extra: number;
  private hitCd = new HitCooldown();
  /** timeLeft 缺省 3600（SetDefaults :526,aiStyle 3 族无型号覆写——旧值 900 是自造） */
  life = 3600;
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number,
    projId: number, dir = 1) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    this.dir = dir >= 0 ? 1 : -1;
    const def = projectileData(projId);
    this.penetrate = def?.penetrate ?? -1;
    this.extra = def?.extraUpdates ?? 0;
    const sz = BOOMERANG_SIZE[projId]; // ⑬-2 命中盒按型号（曾统一 22×22）
    if (sz) { this.w = sz; this.h = sz; }
  }

  draw(r: Renderer, cam: Camera): void {
    drawProj(r, cam, this, this.projId, this.rot, '#C0A060');
  }

  /** 轴向目标速度逼近（AI_003 追踪/返回共用式 :36937-36973/:37249-37282）：
   *  每轴朝目标速度步进 acc,当前速度与目标异号再加倍 */
  private steerTo(tvx: number, tvy: number, acc: number): void {
    if (this.vx < tvx) { this.vx += acc; if (this.vx < 0 && tvx > 0) this.vx += acc; }
    else if (this.vx > tvx) { this.vx -= acc; if (this.vx > 0 && tvx < 0) this.vx -= acc; }
    if (this.vy < tvy) { this.vy += acc; if (this.vy < 0 && tvy > 0) this.vy += acc; }
    else if (this.vy > tvy) { this.vy -= acc; if (this.vy > 0 && tvy < 0) this.vy -= acc; }
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：纯位移外推，不跑命中/碰撞（伤害归拥有者客户端结算）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    if (this.soundDelay > 0) this.soundDelay--; // :15427-15429 每 tick 一次（AI 循环外）
    this.hitCd.tick();
    // extraUpdates（Update :15336-15339）：AI+移动每 tick 跑 1+extra 次;
    // 光刃返回段动态加速 = dist/3000（+1(1074),上限 20,:37211-37221）
    let runs = this.extra + 1;
    if (PHASEBLADE_PROJ.has(this.projId) && this.ai0 === 1) {
      const p0 = game.player;
      runs = Math.min(20, Math.floor(Math.hypot(p0.cx - this.cx, p0.cy - this.cy) / 3000)
        + (this.projId === 1074 ? 1 : 0)) + 1;
    }
    for (let i = 0; i < runs && !this.dead; i++) this.step(game);
  }

  /** 单次 AI 迭代（等价原版 numUpdates 循环体一次：AI → 移动/碰撞 → 尾段 → 命中） */
  private step(game: GameHooks): void {
    const p = game.player;
    const isPhase = PHASEBLADE_PROJ.has(this.projId);
    // ---- AI 段 ----
    // 掷出呼啸（:36626-36651;383/光刃族豁免;301 延时 10 其余 8,均 ×(extra+1)）。
    // 301 的 -0.33 变调未建模（playSfxFiles 无 pitch 参数）
    if (this.projId !== 383 && !isPhase && this.soundDelay === 0) {
      this.soundDelay = (this.projId === 301 ? 10 : 8) * (this.extra + 1);
      game.playSfxFiles(['Item_7'], 1, this.cx, this.cy);
    }
    if (isPhase) {
      // :36745-36748 中心出界（InWorld 外扩 10 格）→ 直接进返回
      const st = game.world.store;
      const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
      if (tx < 10 || ty < 10 || tx >= st.w - 10 || ty >= st.h - 10) this.ai0 = 1;
      // :36750-36756 timeLeft<5 且玩家存活 → 续命 5t 并回收（悬停/垂落态的唯一出路）
      else if (this.life < 5 && !(p as { dead?: boolean }).dead) {
        this.life = 5;
        if (this.ai0 !== 1) this.ai0 = 1;
      }
      // :36758-36764 再掷召回门（持光刃按 use 即回收）——需 Player controlUseItem/
      //   releaseUseItem 输入语义,本引擎未建模（GAP,登记 docs/weapon-proj-audit）
    }
    if (this.ai0 === 0) this.aiOut(game, isPhase);
    else if (isPhase && this.ai0 === 2) this.aiHover(game); // 光刃撞墙悬停
    else this.aiReturn(game, isPhase);
    // ---- 移动段（HandleMovement;ai[0]==1 时 tileCollide=false 穿墙 :37145） ----
    this.moveStep(game, isPhase);
    // ---- 尾段 rotation/尘（:37294-37352,全部状态运行） ----
    this.aiVisual(game, isPhase);
    // ---- 命中结算（同敌冷却 10t = NPC immune[owner]=10,:13172-13174） ----
    hitEnemies(this, game, this.hitCd, 10, Math.sign(this.vx) || this.dir, this.armorPen,
      () => this.onHitEnemy());
  }

  /** ① 出程段（ai[0]==0,:36783-37087）——分支序与源码一致 */
  private aiOut(game: GameHooks, isPhase: boolean): void {
    const p = game.player;
    if (this.projId !== 866) this.outT++; // :36786-36793（866 不计 ai[1],计数在 localT）
    // :36794-36799 独立 106/45 门——按源码原样保留,但 ai[1] 先被类型链尾的
    // else if(ai[1]≥30)（:37082-37087,106 未豁免）截住 → 1456 中此门不可达
    // （影子死代码）。实测 106 回收点=30,勿按 45 调参
    if (this.projId === 106 && this.outT >= 45) { this.ai0 = 1; this.outT = 0; return; }
    if (isPhase) {
      // 光刃族（:36800-36866）：前 30 AI 次自旋,之后 vy+1/vx×0.96 垂落（vy 钳 16）
      if (this.outT >= 30) {
        this.vy += 1;
        this.vx *= 0.96;
        if (this.vy > 16) this.vy = 16;
        if (this.vy > 0) {
          // :36811-36832 垂落姿态:rotation 逼近 dir>0→2.335 / dir<0→-3.948（差值绕 2π 取近路）
          const tgt = this.dir > 0 ? 2.335 : -3.948;
          this.rot = this.dir > 0
            ? (this.rot <= tgt ? (this.rot * 4 + tgt) / 5 : (this.rot * 9 + tgt + Math.PI * 2) / 10)
            : (this.rot >= tgt ? (this.rot * 4 + tgt) / 5 : (this.rot * 9 + tgt - Math.PI * 2) / 10);
        } else {
          this.rot += 0.4 * this.dir; // :36834-36844（音门 1074 9t/其余 14t）
          if (this.soundDelay === 0) {
            game.playSfxFiles([this.projId === 1074 ? 'Item_7' : 'Item_15'], 1, this.cx, this.cy);
            this.soundDelay = this.projId === 1074 ? 9 : 14;
          }
        }
      } else {
        this.rot += 0.4 * this.dir; // :36836-36847（1074 11t/其余 14t;-0.3 变调略）
        if (this.soundDelay === 0) {
          game.playSfxFiles([this.projId === 1074 ? 'Item_7' : 'Item_15'], 1, this.cx, this.cy);
          this.soundDelay = this.projId === 1074 ? 11 : 14;
        }
      }
      return;
    }
    if (this.projId === 320 || this.projId === 383) {
      // 320 冰回旋镖 / 383 附魔飞刀（:36868-36888）：≥10 起下垂 vy+0.5（383 上升再+0.35）/
      // vx×0.95/vy 钳 16;383 距玩家>800 回收
      if (this.outT >= 10) {
        this.vy += 0.5;
        if (this.projId === 383 && this.vy < 0) this.vy += 0.35;
        this.vx *= 0.95;
        if (this.vy > 16) this.vy = 16;
        if (this.projId === 383 && Math.hypot(p.cx - this.cx, p.cy - this.cy) > 800) {
          this.ai0 = 1; this.outT = 0;
        }
      }
      return;
    }
    if (this.projId === 182 || this.projId === 866) {
      // 182 圣骑士锤（:36889-36973）/ 866 飞刀（:36980-37057）:800px 内最近敌追踪
      // （CanHit 视线门）,目标速度=(目标-球心)norm×12,轴步进 0.25;无目标 ≥30 回收。
      // ★计数源不同:182=ai[1]（:36790-36793,顶部已自增）/ 866=localAI[0]（:36999,
      //   ai[1] 被 866 占用为目标索引）——数值门一致,这里统一取 cnt
      const cnt = this.projId === 866 ? ++this.localT : this.outT;
      let tx = this.cx + this.vx * 100, ty = this.cy + this.vy * 100; // :36944-36946 无目标前瞻点
      let found = false;
      if (cnt > 10 && cnt < 360) { // :36909-36938 / :36985-36997
        let best = 800; // :36907 / FindTargetWithLineOfSight 缺省 800 :42972
        for (const ent of game.enemies()) {
          const e = ent as { x: number; y: number; w: number; h: number; dead: boolean };
          if (e.dead) continue;
          if (!canHit(game.world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
          const d = Math.hypot(e.x + e.w / 2 - this.cx, e.y + e.h / 2 - this.cy);
          if (d < best) { best = d; tx = e.x + e.w / 2; ty = e.y + e.h / 2; found = true; }
        }
      }
      if (!found && cnt >= 30) { this.ai0 = 1; this.outT = 0; return; } // :36932-36938 / :37009-37017
      const dd = Math.hypot(tx - this.cx, ty - this.cy) || 1;
      this.steerTo(((tx - this.cx) / dd) * 12, ((ty - this.cy) / dd) * 12, 0.25); // :36937-36973
      return;
    }
    if (this.projId === 301) {
      // 301 Bouncing Shield（:37062-37080）：按住 ≥20/松手 ≥100 双门,回收时速度归零
      const held = this.channel ? this.channel() : false;
      if ((held && this.outT >= 20) || (!held && this.outT >= 100)) {
        this.ai0 = 1; this.outT = 0; this.vx = 0; this.vy = 0;
      }
      return;
    }
    // 缺省族（:37082-37086）：无摩擦直线,ai[1]≥30 回收
    if (this.outT >= 30) { this.ai0 = 1; this.outT = 0; }
  }

  /** 光刃撞墙悬停态（ai[0]==2,:37089-37109;由撞墙分支 :17975-17990 进入） */
  private aiHover(game: GameHooks): void {
    if (this.vy < 0) this.vy *= 0.5; // :37091-37093
    this.rot = 2.335;                // :37095
    this.vx = 0;                     // :37096
    this.vy += 1;                    // :37097
    if (!this.hoverSfxDone) {        // localAI[1] 一次性门 :37098-37109
      if (this.projId === 1074) { this.localT = -1; game.playSfxFiles(['Item_182'], 1, this.cx, this.cy); }
      else game.playSfxFiles(['Item_15'], 1, this.cx, this.cy);
      this.hoverSfxDone = true;
    }
  }

  /** ③ 返回段（ai[0]==1,:37111-37288） */
  private aiReturn(game: GameHooks, isPhase: boolean): void {
    const p = game.player;
    if (isPhase) {
      // :37114-37124 direction 朝玩家侧;rotation = 飞行向 - 2.335
      this.dir = this.cx < p.cx ? -1 : 1;
      this.rot = Math.atan2(this.vy, this.vx) - 2.335;
      if (this.localT <= 0) { // :37125-37144 localAI[0] 门（悬停过=Item_182,否则 Item_7）
        game.playSfxFiles([this.projId === 1074 ? (this.localT < 0 ? 'Item_182' : 'Item_7') : 'Item_15'],
          1, this.cx, this.cy);
        this.localT = 1;
      }
    }
    // tileCollide=false（:37145）——moveStep 直接积分
    const [spd, acc] = BOOMERANG_RETURN[this.projId] ?? (isPhase ? [40, 3] : [9, 0.4]); // :37146-37206
    let dx = p.cx - this.cx, dy = p.cy - this.cy;
    const d = Math.hypot(dx, dy) || 1;
    // :37223-37232 距离 Kill 门（301 6000/其余 3000）
    if (d > (this.projId === 301 ? 6000 : 3000)) { this.dead = true; return; }
    dx = (dx / d) * spd; dy = (dy / d) * spd; // :37234-37236 目标速度 = 朝向 × num28
    if (this.projId === 383) {
      // :37237-37247 383 专属:沿 (目标速度-当前速度) 方向加速 min(num29, 差距长)
      const ddx = dx - this.vx, ddy = dy - this.vy;
      const dl = Math.hypot(ddx, ddy);
      if (dl > 0) {
        const s = Math.min(acc, dl);
        this.vx += (ddx / dl) * s; this.vy += (ddy / dl) * s;
      }
    } else {
      this.steerTo(dx, dy, acc); // :37249-37282 轴步进,异号加倍
    }
    // ④ 回收:与玩家 AABB 相交即 Kill（:37272-37288,仅本机投射物）
    if (this.x < p.x + p.w && this.x + this.w > p.x && this.y < p.y + p.h && this.y + this.h > p.y) {
      this.dead = true;
    }
  }

  /** 移动/撞墙段（HandleMovement 撞墙分支 :18103-18161;分轴探测 = lastVelocity 语义） */
  private moveStep(game: GameHooks, isPhase: boolean): void {
    if (this.ai0 === 1) { this.x += this.vx; this.y += this.vy; return; } // 穿墙（:37145）
    const st = game.world.store;
    const solidBox = (x: number, y: number): boolean => {
      const x0 = Math.floor(x / TILE), y0 = Math.floor(y / TILE);
      const x1 = Math.floor((x + this.w - 1) / TILE), y1 = Math.floor((y + this.h - 1) / TILE);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) return true;
      }
      return false;
    };
    const lvx = this.vx, lvy = this.vy;
    let hitX = false, hitY = false;
    const nx = this.x + this.vx;
    if (solidBox(nx, this.y)) hitX = true; else this.x = nx;
    const ny = this.y + this.vy;
    if (solidBox(this.x, ny)) hitY = true; else this.y = ny;
    if (!hitX && !hitY) return;
    if (WALL_BOUNCE_PROJ.has(this.projId)) {
      // 撞墙尘 + 挖掘音（默认族 Collision.HitTiles :18139-18140 + SoundID 0 :18161）
      game.spawnParticles(this.cx, this.cy, '#A09080', 3, 1.5, { life: 14, size: 2 });
      game.playSfx('dig', 1, this.cx, this.cy);
      // :18142-18151 33/106/866 命中轴反弹,不回收（106 LightDisc_Bounce 溅射视觉略）
      if (hitX) this.vx = -lvx;
      if (hitY) this.vy = -lvy;
    } else if (isPhase) {
      // :17975-17990 光刃撞墙 → 悬停态（独立 else 链:无 HitTiles 尘/挖掘音,
      // 入态音尘由 aiHover 的 localAI[1] 门承担）
      this.ai0 = 2; this.outT = 0;
    } else {
      // 撞墙尘 + 挖掘音（同上 :18139-18140/:18161）
      game.spawnParticles(this.cx, this.cy, '#A09080', 3, 1.5, { life: 14, size: 2 });
      game.playSfx('dig', 1, this.cx, this.cy);
      // :18152-18160 其余:ai[0]=1 回收 + 速度=-lastVelocity（383 豁免取反 :18156）。
      // 383 ≥10 的 HitTilesInACircle(300)+Item14 / 301 冲击波粒（:18115-18138）未建模
      this.ai0 = 1; this.outT = 0;
      if (this.projId !== 383) { this.vx = -lvx; this.vy = -lvy; }
    }
  }

  /** 尾段 rotation/尘（:37294-37352,出程/悬停/返回全状态运行;光刃走专属段不进此链） */
  private aiVisual(game: GameHooks, isPhase: boolean): void {
    const p = game.player;
    if (this.projId === 106) {
      this.rot += 0.3 * this.dir; // :37294-37296 光碟两段自旋 0.3
    } else if (this.projId === 866) {
      this.rot = Math.atan2(this.vy, this.vx); // :37298-37308 飞刀贴图对准飞行向
    } else if (this.projId === 383) {
      // :37310-37325 出程对准飞行向 / 返回段对准 (球心-玩家) 向量,+π/2
      this.rot = (this.ai0 === 0
        ? Math.atan2(this.vy, this.vx)
        : Math.atan2(this.cy - p.cy, this.cx - p.cx)) + Math.PI / 2;
    } else if (this.projId === 301) {
      // :37326-37350 出程对准飞行向+π/4（尘略）/ 返回段自旋 0.4×direction
      if (this.ai0 === 0) this.rot = Math.atan2(this.vy, this.vx) + Math.PI / 4;
      else this.rot += 0.4 * this.dir;
    } else if (!isPhase) {
      this.rot += 0.4 * this.dir; // :37351-37352 缺省族两段自旋 0.4（非定角!）
    }
    // per-type 尘近似（:36652-36738,色/率近似）
    const dust = BOOMERANG_DUST[this.projId];
    if (dust && Math.random() < dust[1]) {
      game.spawnParticles(this.cx, this.cy, dust[0], 1, 0.4, { life: 18, grav: 0, size: 2 });
    }
  }

  /** 命中敌回调 = Projectile.Damage 回收门 + 穿透自减（:12278-12299/:13124-13182） */
  private onHitEnemy(): void {
    // :12278-12291 出程命中敌 → 速度反转 + ai[0]=1（豁免 301/866/902/光刃族;
    // 106 的 LightDisc_Bounce 溅射 :12282-12284 视觉略）
    if (this.ai0 === 0 && !NO_HIT_RETURN_PROJ.has(this.projId)
      && !PHASEBLADE_PROJ.has(this.projId)) {
      this.vx = -this.vx; this.vy = -this.vy;
      this.ai0 = 1; this.outT = 0;
    }
    // :12292-12297 902 返回段命中 direction 翻转
    if (this.projId === 902 && this.ai0 !== 0) this.dir *= -1;
    // penetrate 自减（:13175-13182）;==0 → Kill（:15866-15868）;
    // 866 特例（:13124-13137):五击后 penetrate 复位 1、伤害归零不消失
    if (this.penetrate > 0) {
      this.penetrate--;
      if (this.penetrate === 0) {
        if (this.projId === 866) { this.penetrate = 1; this.damage = 0; }
        else this.dead = true;
      }
    }
  }
}

// ================= 长矛（aiStyle 19，AI_019_Spears，Projectile.cs:43198） =================

/** 每型号伸缩参数（AI_019_Spears_GetSpearOffsetRelativeToPlayer :43417-43540 switch）：
 *  [初始偏移 num6, 伸出速 num7, 缩回速 num8]——位移 = dir × shootSpeed × offset。
 *  aiStyle 161（新短剑 802/842/938-945）不在此 AI,归 spear kind 直刺近似(GAP) */
const SPEAR_PARAMS: Record<number, [number, number, number]> = {
  46: [3, 1.4, 1.6], 105: [3, 2.1, 2.4], 367: [3, 1.5, 1.6], 368: [3, 1.4, 1.5],
  222: [3, 2.1, 2.4], 342: [3, 2.1, 2.4], 47: [4, 0.9, 1.2], 153: [4, 1.3, 1.5],
  49: [4, 0.85, 1.1], 730: [8, 1.2, 1.5], 877: [28, 0.4, 0.4], 878: [28, 0.4, 0.4],
  879: [28, 0.4, 0.4], 64: [3, 1.7, 1.9], 215: [3, 1.7, 1.9],
  66: [3, 1.9, 2.1], 97: [3, 1.9, 2.1], 212: [3, 1.9, 2.1], 218: [3, 1.9, 2.1],
  130: [3, 1.0, 1.3], 1103: [4, 0.85, 1.1],
};

/** aiStyle 161 细剑/短剑族(AI_161_RapierStabs :44987):线性外伸 velocity×(t-1),
 *  16t 消失;与 AI_019 包络完全不同的直刺模型。型号 = 161 全集合 */
const RAPIER_PROJ = new Set([802, 842, 938, 939, 940, 941, 942, 943, 944, 945]);

/** 长矛/细剑绘制角与镜像(纯函数,供 draw 与回归测试共用)。
 *  AI_019 = DrawProj_Spear 专支(Main.cs:34153-34157 按 aiStyle==19 派发,
 *  :34659-34668):num = atan2(vy,vx)+2.355(=3π/4);theOwner.direction>0(玩家朝右)
 *  → dir=FlipHorizontally 且 num -= π/2、origin.X=贴图宽。AI 侧 rotation 赋值同值
 *  (:43271-43276,:43214 spriteDirection=-direction)。
 *  AI_161 = :44990 rotation=atan2+π/2,DrawProjDirect 938-945 再 num327 -= π/4×sd
 *  (:32444);dir=spriteDirection==-1 → Flip(:29827)。
 *  ★朝向陷阱(2026-08-13 终审):AI_019 的翻转条件是"玩家朝右",曾写反成 dx<0 且丢
 *  mirror——右刺纯数值巧合仍指正右,左刺矛头指 φ-π/2(正下)偏 90°。 */
export function spearDrawAngle(dx: number, dy: number, isRapier: boolean): { ang: number; mirror: boolean } {
  const sd = dx >= 0 ? 1 : -1;
  if (isRapier) {
    return { ang: Math.atan2(dy, dx) + Math.PI / 2 - Math.PI / 4 * sd, mirror: sd === -1 };
  }
  let ang = Math.atan2(dy, dx) + 2.355; // :34659
  let mirror = false;
  if (sd > 0) { ang -= Math.PI / 2; mirror = true; } // :34664-34668 朝右翻转
  return { ang, mirror };
}

/** 命中盒型号表（SetDefaults 逐 type width/height,Projectile.cs:1036/1924/4045 等;
 *  其余型号均 18×18,46=20、130=22、877-879=25;342 是 22×2 薄刃——原版真值勿当
 *  提取器错值修掉）。161 细剑族全 18×18。此前恒 20×20 → 14 型号命中盒失真(2026-08-13 终审) */
const SPEAR_SIZE: Record<number, [number, number]> = {
  46: [20, 20], 130: [22, 22], 342: [22, 2],
  877: [25, 25], 878: [25, 25], 879: [25, 25],
};

export class SpearProj extends Entity {
  w = 18; h = 18;
  damage: number;
  knockback: number;
  projId: number;
  /** GetWeaponCrit 合并值（Game 侧传入；缺省 4 基础） */
  critChance = 0.04;
  /** ⑥ 护甲穿透（Game 注入，命中传 hurt 减防） */
  armorPen = 0;
  /** 近战系（吃武器浸剂） */
  meleeProj = true;
  /** 刺出方向（单位向量，原版出手时定死） */
  private dx: number;
  private dy: number;
  /** 原版 item.shootSpeed（velocity 模长——位移=offset×此值,勿当单位向量用） */
  private spd: number;
  private t = 0;
  private dur: number;
  /** 型号伸缩参数 */
  private prm: [number, number, number];
  private hitCd = new HitCooldown();
  dead = false;

  constructor(dirX: number, dirY: number, spd: number, dur: number, damage: number, knockback: number, projId: number) {
    super();
    const n = Math.hypot(dirX, dirY) || 1;
    this.dx = dirX / n;
    this.dy = dirY / n;
    this.spd = spd || 2.4; // 兜底:提取表 shootSpeed 缺失(七金属短剑模板坑)时按短剑族 2.1-2.4 档
    this.dur = dur;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    this.prm = SPEAR_PARAMS[projId] ?? [3, 1.9, 2.1];
    const sz = SPEAR_SIZE[projId];
    if (sz) { this.w = sz[0]; this.h = sz[1]; } // 342 薄刃 22×2 等按型号
  }

  draw(r: Renderer, cam: Camera): void {
    const isRap = RAPIER_PROJ.has(this.projId);
    const { ang, mirror } = spearDrawAngle(this.dx, this.dy, isRap);
    // Utils.GetLerpValue clamped:淡入 t/7(t≤7),淡出 (16-t)/4(t≥12)
    const aIn = Math.min(1, this.t / 7);
    const aOut = this.t <= 12 ? 1 : Math.max(0, (16 - this.t) / 4);
    drawProj(r, cam, this, this.projId, ang,
      '#A0A0B0', isRap ? aIn * aOut : 1, isRap ? 32 : 0, mirror);
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：纯位移外推，不跑命中/碰撞（伤害归拥有者客户端结算）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    const p = game.player;
    if (RAPIER_PROJ.has(this.projId)) {
      // AI_161_RapierStabs(:44987-45006):线性外伸,固定 16t 消失(与 AI_019 包络无关)
      if (this.t >= 16) { this.dead = true; return; }
      this.x = p.cx - this.w / 2 + this.dx * this.spd * (this.t - 1);
      this.y = p.cy - this.h / 2 + this.dy * this.spd * (this.t - 1);
      // CutTiles（Projectile.cs:14151-14155：Center 起 10px×scale 线段扫杂草/瓦罐
      // ——细剑戳击可清障的机制本体，曾整段漏接 2026-08-13 报障修复）
      game.cutTile(Math.floor((this.cx + this.dx * 10) / 16), Math.floor((this.cy + this.dy * 10) / 16));
      hitEnemies(this, game, this.hitCd, 9999, this.dx > 0 ? 1 : -1, this.armorPen);
      return;
    }
    if (this.t >= this.dur) { this.dead = true; return; }
    // AI_019 伸缩包络 1:1（:43441-43540）：
    //   itemAnimation 从 max 递减；伸出相占前 2/3（num5 增长），缩回相占后 1/3（num10 增长）
    const max = this.dur;
    const num3 = Math.floor(max / 3);
    const itemAnim = Math.max(0, max - this.t);
    const num4 = Math.min(itemAnim, num3);
    const num5 = itemAnim - num4;
    const num9 = (max - num3) - num5;
    const num10 = num3 - num4;
    const [n6, n7, n8] = this.prm;
    const offset = n6 + n7 * num9 - n8 * num10;
    this.x = p.cx - this.w / 2 + this.dx * offset * this.spd;
    this.y = p.cy - this.h / 2 + this.dy * offset * this.spd;
    hitEnemies(this, game, this.hitCd, 9999, this.dx > 0 ? 1 : -1, this.armorPen); // 一次突刺每敌只结算一次
  }
}

// ================= 燃烧瓶（proj 399 aiStyle 68；Molotov 2590→399，Kill 链 :70889-70928） =================
// 弹跳物理（ai[0]>=15 起重力 0.2/t，AI_068 :29048-29100）；死亡（撞块/命中/超时）→
// 6 朵火云 400+rand3（:70918-70927：散布 ±8/上抛，伤 ×0.5，火云=aiStyle 14 弹跳穿透 3、
// 360t、命中 OnFire 3-6s :10850-10852）
export class MolotovProj extends Entity {
  w = 14; h = 14;
  vx: number;
  vy: number;
  damage: number;
  critChance = 0.04;
  armorPen = 0;
  private t = 0;
  private hitSet = new Set<number>();
  dead = false;
  /** 火云生成回调（Game 注入——避免实体循环依赖） */
  spawnFires: (x: number, y: number, dmg: number, vx: number, vy: number) => void;

  constructor(x: number, y: number, vx: number, vy: number, damage: number,
    spawnFires: (x: number, y: number, dmg: number, vx: number, vy: number) => void) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.spawnFires = spawnFires;
  }

  private breakOpen(game: GameHooks): void {
    this.dead = true;
    // :70918-70927 六朵火云：x 散布 -vx×rand(20,50)%±8、y -|vy|×rand(30,50)%-8..+2
    for (let i = 0; i < 6; i++) {
      const fx = -this.vx * (20 + Math.floor(Math.random() * 30)) * 0.01 + (Math.random() * 40 - 20) * 0.4;
      const fy = -Math.abs(this.vy) * (30 + Math.floor(Math.random() * 20)) * 0.01 + (Math.random() * 24 - 20) * 0.4;
      this.spawnFires(this.cx + fx, this.cy + fy, Math.max(1, Math.round(this.damage * 0.5)), fx, fy);
    }
    game.spawnParticles(this.cx, this.cy, '#FF9A3C', 20, 5, { life: 30, grav: -0.06, damp: 0.94 });
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    if (++this.t >= 3) { /* alpha 淡入（:29054）视觉从略 */ }
    if (this.t >= 15) this.vy = Math.min(this.vy + 0.2, 16); // :29063
    else this.vy = Math.min(this.vy + 0.1, 16);
    this.vx *= 0.99;
    let nx = this.x + this.vx, ny = this.y + this.vy;
    const st = game.world.store;
    const solidAt = (px: number, py: number) => {
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      return st.inBounds(tx, ty) && st.isSolid(tx, ty);
    };
    if (solidAt(nx + this.w / 2, this.y + this.h / 2)) { this.breakOpen(game); return; } // 撞块即裂
    if (solidAt(this.x + this.w / 2, ny + this.h - 1)) { this.breakOpen(game); return; }
    this.x = nx; this.y = ny;
    if (this.t > 600) { this.dead = true; return; }
    // 命中敌即裂（penetrate 1）
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean };
      if (e.dead || this.hitSet.has(e.id)) continue;
      if (this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y) {
        this.hitSet.add(e.id);
        this.breakOpen(game);
        return;
      }
    }
  }

  draw(r: Renderer, cam: Camera): void {
    drawProj(r, cam, this, 399, Math.atan2(this.vy, this.vx) + Math.PI / 2, '#804020');
  }
}

// ================= 配重球（aiStyle 99 type 556-561/1079，AI_099_1 :64472-64610） =================
// 环绕玩家：半径 num=250×0.5=125（yoyoString +25%+10，:64487）；rotation+0.5/t；
// 超径钳回轨道（:64544-64550）+ 切向增速 vector2=(vy,vx) 翻转带象限符号（:64552-64610）；
// 生存绑 yoyo 存活（timeLeft=6 刷新语义：alive() false 即消亡）
export class CounterweightProj extends Entity {
  w = 18; h = 18;
  damage: number;
  knockback: number;
  projId: number;
  critChance = 0.04;
  armorPen = 0;
  meleeProj = true;
  private orbitR: number;
  private rot = 0;
  private alive: () => boolean;
  private ownerRef: () => { cx: number; cy: number } | null;
  private hitCd = new HitCooldown();
  dead = false;

  constructor(x: number, y: number, damage: number, knockback: number, projId: number,
    owner: () => { cx: number; cy: number } | null, alive: () => boolean, yoyoString: boolean) {
    super();
    this.x = x; this.y = y;
    this.damage = damage; this.knockback = knockback; this.projId = projId;
    this.ownerRef = owner; this.alive = alive;
    this.orbitR = 125; // 250×0.5（:64477/:64482）
    if (yoyoString) this.orbitR += this.orbitR * 0.25 + 10; // :64487
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    const p = this.ownerRef();
    if (!p || !this.alive()) { this.dead = true; return; } // timeLeft=6/宿主消亡
    this.rot += 0.5; // :64489
    // 超径钳回（:64540-64550）：钳到轨道 + 速度径向衰减（去超出的 num6）
    let dx = p.cx - this.cx, dy = p.cy - this.cy;
    const d = Math.hypot(dx, dy) || 1;
    if (d > this.orbitR) {
      const over = d - this.orbitR;
      dx /= d; dy /= d;
      this.x = p.cx - dx * this.orbitR - this.w / 2;
      this.y = p.cy - dy * this.orbitR - this.h / 2;
      const sp = Math.hypot(this.vx, this.vy);
      const cut = Math.min(over, Math.max(0, sp - 1)); // num6 钳（:64556）
      if (sp > 0) { this.vx *= (sp - cut) / sp; this.vy *= (sp - cut) / sp; }
    }
    // 切向增速（:64552-64610）：vector2=(vy,vx) 按象限定号后并入速度方向
    {
      const sp0 = Math.hypot(this.vx, this.vy);
      if (sp0 > 0.5) {
        let tx = this.vy, ty = this.vx; // vector2 翻转
        if (this.cy < p.cy) ty = Math.abs(ty); else if (this.cy > p.cy) ty = -Math.abs(ty);
        if (this.cx < p.cx) tx = Math.abs(tx); else if (this.cx > p.cx) tx = -Math.abs(tx);
        let nvx = this.vx + tx, nvy = this.vy + ty;
        const nl = Math.hypot(nvx, nvy) || 1;
        nvx = nvx / nl * sp0; nvy = nvy / nl * sp0; // 保速转朝
        if (Math.abs(tx) < 0.1 || Math.abs(ty) < 0.1) { this.vx = nvx; this.vy = nvy; }
        else { this.vx = (nvx + this.vx * 2) / 3; this.vy = (nvy + this.vy * 2) / 3; } // :64588
      }
    }
    this.x += this.vx;
    this.y += this.vy;
    hitEnemies(this, game, this.hitCd, 10, Math.sign(this.vx) || 1, this.armorPen);
  }

  draw(r: Renderer, cam: Camera): void {
    drawProj(r, cam, this, this.projId, this.rot + Math.PI / 2, '#B09060');
  }
}

// ================= 悠悠球 / 连枷（aiStyle 99 / 15，channel 语义） =================

/** 悠悠球型号三表（ProjectileID.cs:185/187/189 全量 1:1；键=projId，缺省=表默认） */
export const YOYO_RANGE: Record<number, number> = { // 最大射程 px（默认 200）
  541: 130, 548: 170, 542: 195, 543: 207, 544: 215, 534: 220, 564: 225, 999: 225,
  545: 235, 562: 235, 563: 250, 546: 275, 552: 270, 553: 330, 547: 280, 549: 290,
  554: 340, 550: 370, 551: 370, 555: 360, 603: 400,
};
export const YOYO_TOP: Record<number, number> = {  // 顶速（默认 10）
  541: 9, 548: 11, 542: 12.5, 543: 12, 544: 13, 534: 13, 564: 14, 999: 14,
  545: 14, 562: 17, 563: 12, 546: 15, 552: 14, 553: 15, 547: 17, 549: 16,
  554: 16, 550: 16, 551: 16, 555: 16.5, 603: 17.5,
};
export const YOYO_LIFE: Record<number, number> = {  // 寿命倍率（默认 -1=无限）
  541: 3, 548: 5, 542: 7, 543: 6, 544: 8, 534: 9, 564: 11, 999: 11,
  545: 13, 563: 30, 562: 16, 553: 12, 546: 16, 552: 15, 549: 14,
};

export class YoyoProj extends Entity {
  w = 16; h = 16;
  damage: number;
  knockback: number;
  projId: number;
  /** GetWeaponCrit 合并值（Game 侧传入；缺省 4 基础） */
  critChance = 0.04;
  /** ⑥ 护甲穿透（Game 注入，命中传 hurt 减防） */
  armorPen = 0;
  /** 近战系（吃武器浸剂） */
  meleeProj = true;
  /** 持续按住判定（原版 channel：按住时悠悠球滞留追光标） */
  private channel: () => boolean;
  /** 光标世界坐标 getter */
  private target: () => { x: number; y: number };
  /** ★废弃死参数（Game 侧传 0）:射程唯一源 = Sets.YoyosMaximumRange 表
   *  （ProjectileID.cs:187,21 型号缺省 200）+ yoyoString×1.25+30（:64968-64970）+
   *  ÷(1+meleeSpeed×3)/4（:64974）——旧"220+spd×10"自造公式已废,勿再启用 */
  private stringLen: number;
  private hitCd = new HitCooldown();
  private rot = 0;
  /** 手部坐标（线起点，fixedUpdate 每帧刷新为主角中心） */
  handX = 0;
  handY = 0;
  /** 存活秒数（AI_099 localAI[0]/60 ÷(1+ms)/2,超 YOYO_LIFE 回收） */
  private lifeT = 0;
  /** 回收锁（ai[0]=-1 终态:松手/超寿命/1.3×超程后不可复活,需重新使用掷出） */
  private recalled = false;
  /** 钳制后的目标点（原版 ai[0]/ai[1] 存量,:65049-65051——目标变化才重写并触发
   *  range-1 二次钳制;逼近段用的是这份存量而非实时光标） */
  private ai0 = 0;
  private ai1 = 0;
  /** projectile.direction（AI_099 ChangeDir 段 :64925-64935：球在玩家右侧 >2px → 1、
   *  左侧 → -1,±2 死区内保持原值）——击退方向以此为准（曾误用 sign(vx)） */
  private dir = 1;
  /** 存活 tick 上限:有限寿命型号 7200 防泄漏;无限寿命（YOYO_LIFE 缺省 -1）无上限——
   *  原版 timeLeft=6 每帧刷新（:64942）,无限寿命悠悠球可永久滞留直至松手回收 */
  life = 7200;
  /** 型号顶速（YOYO_TOP 注入，缺省 10——ProjectileID.cs:189） */
  topSpeed = 10;
  dead = false;

  constructor(x: number, y: number, damage: number, knockback: number, projId: number,
    stringLen: number, channel: () => boolean, target: () => { x: number; y: number }) {
    super();
    this.x = x; this.y = y;
    this.handX = x; this.handY = y;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    this.stringLen = stringLen;
    this.channel = channel;
    this.target = target;
    // 无限寿命型号（Sets.YoyosLifeTimeMultiplier 缺省 -1,ProjectileID.cs:185）不上限
    if ((YOYO_LIFE[projId] ?? -1) === -1) this.life = Number.POSITIVE_INFINITY;
  }

  draw(r: Renderer, cam: Camera): void {
    // 线（原版 yoyo string / 连枷链：手部 → 球体）。世界坐标(实体循环在世界变换内)
    const c = r.canvas.getContext('2d');
    if (c) {
      c.strokeStyle = '#D0D0D8';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(this.handX, this.handY);
      c.lineTo(this.x + this.w / 2, this.y + this.h / 2);
      c.stroke();
    }
    this.rot += 0.45; // :65203-65209 rotation += 0.45/tick(每 AI 次;0.25 系自造,2026-08-13 终审修)
    drawProj(r, cam, this, this.projId, this.rot, '#E04040');
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：纯位移外推，不跑命中/碰撞（伤害归拥有者客户端结算）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    const p = game.player;
    this.handX = p.cx;
    this.handY = p.cy;
    // ChangeDir 段（:64925-64935,活跃/回收态公共段）:球相对玩家 X 定 direction,
    // ±2px 死区内保持原值——击退方向用 this.dir（非 sign(vx)）
    if (this.cx > p.cx + 2) this.dir = 1;
    else if (this.cx < p.cx - 2) this.dir = -1;
    this.hitCd.tick();
    // ---- AI_099_2_Yoyos 参数链（:64945-64977）----
    const ms = p.attackSpeedMult || 1;
    const msRange = (1 + ms * 3) / 4;          // 射程/顶速缩放(:64974-64975)
    let range = YOYO_RANGE[this.projId] ?? 200;
    if (p.equipStats.yoyoString) range = range * 1.25 + 30;  // 线圈 yoyoString(:64971)
    range /= msRange;
    let top = (YOYO_TOP[this.projId] ?? 10) / msRange;
    let inertia = Math.max(1, 14 - top / 2);   // num7(:64968-64971)
    const deadZone = 5 + top / 2;              // num9 光标死区半径(:64972)
    // 寿命（:64840-64854）：秒数 ÷(1+ms)/2,超 YoyosLifeTimeMultiplier → 回收态
    this.lifeT += 1 / 60 / ((1 + ms) / 2);
    let lifeMul = YOYO_LIFE[this.projId] ?? -1;
    if (p.equipStats.yoyoString && lifeMul > 0) lifeMul *= 1.5;
    const expired = lifeMul !== -1 && this.lifeT > lifeMul;
    if (this.recalled || !this.channel() || expired) {
      this.recalled = true;
      // 回收态（ai[0]=-1,:65152-65172）：惯性 ×0.8 取整、顶速 ×1.5、穿墙,
      // lerp 朝玩家;距手 <num8+10 或 >2000 → Kill
      inertia = Math.floor(inertia * 0.8);
      top *= 1.5;
      const dx = p.cx - (this.x + this.w / 2);
      const dy = p.cy - (this.y + this.h / 2);
      const d = Math.hypot(dx, dy);
      if (d < top + 10 || d === 0 || d > 2000) { this.dead = true; return; }
      this.vx = (this.vx * (inertia - 1) + (dx / d) * top) / inertia;
      this.vy = (this.vy * (inertia - 1) + (dy / d) * top) / inertia;
      this.x += this.vx;
      this.y += this.vy;
      hitEnemies(this, game, this.hitCd, 10, this.dir, this.armorPen);
      return;
    }
    // ---- 活跃态（:64983-65148）----
    if (Math.hypot(this.vx, this.vy) > top) { this.vx *= 0.98; this.vy *= 0.98; }
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    const dPlayer = Math.hypot(p.cx - cx, p.cy - cy);
    const overRange = dPlayer > range;          // flag3:超程减速
    if (dPlayer > range * 1.3) { this.recalled = true; return; } // flag4:1.3×超程强制回收(下帧走回收态)
    // 光标目标钳在射程内（:65002-65034）
    const t = this.target();
    let tx = t.x, ty = t.y;
    let tdx = tx - p.cx, tdy = ty - p.cy;
    const td = Math.hypot(tdx, tdy);
    if (td > range) { tdx = (tdx / td) * range; tdy = (tdy / td) * range; tx = p.cx + tdx; ty = p.cy + tdy; }
    // :65038-65050:目标点变化时（ai[0]/ai[1] 存量比对）再钳 range-1——防球贴射程边缘抖动
    if (this.ai0 !== tx || this.ai1 !== ty) {
      let vx2 = tx - p.cx, vy2 = ty - p.cy;
      const vd = Math.hypot(vx2, vy2);
      if (vd > range - 1) { vx2 = (vx2 / vd) * (range - 1); vy2 = (vy2 / vd) * (range - 1); tx = p.cx + vx2; ty = p.cy + vy2; }
      this.ai0 = tx; this.ai1 = ty;
    }
    if (overRange) {
      inertia /= 2; top *= 2;
      if (cx > p.cx && this.vx > 0) this.vx *= 0.5;
      if (cy > p.cy && this.vy > 0) this.vy *= 0.5;
      if (cx < p.cx && this.vx < 0) this.vx *= 0.5;
      if (cy < p.cy && this.vy < 0) this.vy *= 0.5;
    }
    // lerp 逼近目标（:65071-65083）：死区外 velocity=(v×(num7-1)+dir×min(d/2,top))/num7
    const dx2 = tx - cx, dy2 = ty - cy;
    const d2 = Math.hypot(dx2, dy2);
    if (d2 > deadZone) {
      const step = overRange ? Math.min(d2 / 2, top / 2) : Math.min(d2 / 2, top);
      const k = overRange ? 1 : inertia; // flag3 时 num7=1（:65066-65067）
      this.vx = (this.vx * (k - 1) + (dx2 / d2) * step) / k;
      this.vy = (this.vy * (k - 1) + (dy2 / d2) * step) / k;
    } else {
      this.vx *= 0.8; this.vy *= 0.8;  // 死区内衰减(:65127)
    }
    this.x += this.vx;
    this.y += this.vy;
    // yoyo tileCollide=false 穿墙;命中冷却 10t(NPC immune[owner] 缺省——yoko SetDefaults
    // 未设 usesLocalNPCImmunity/Cooldown,走全局 10t)
    hitEnemies(this, game, this.hitCd, 10, this.dir, this.armorPen);
  }
}

// ================= 连枷/链球（aiStyle 15，AI_015_Flails，Projectile.cs:41051-41506） =================

/** 每型号参数（Projectile.cs:41073-41087 默认值 + :41088-41148 switch 各 case；单位 px/tick/tick）。
 *  meleeSpeed 缩放链（:41151-41159）：throwSpd/farPull/pullAccel/retractKill/returnAccel/
 *  returnKill ×(1/meleeSpeed)——orbitRadius(num15)不缩放 */
interface FlailParams {
  flightTicks: number;  // num:掷出态飞行上限 tick（超时 → 回拉）
  throwSpeed: number;   // num2:松手掷出初速
  pullAccel: number;    // num4:回拉态 MoveTowards 步长
  retractKill: number;  // num5:回拉态距手 ≤ 此值即消失
  returnAccel: number;  // num6:回收态 MoveTowards 步长
  returnKill: number;   // num7:回收态距手 ≤ 此值即消失
  farPullSpeed: number; // num9:远端回拉目标速率
  orbitRadius: number;  // num15:旋转态绕体半径
  spinHitCd: number;    // num12:旋转态每敌命中冷却
  thrownHitCd: number;  // num13:掷出/回拉/坠落态冷却
}
const FLAIL_DEFAULT: FlailParams = {
  flightTicks: 10, throwSpeed: 24, pullAccel: 3, retractKill: 16,
  returnAccel: 6, returnKill: 48, farPullSpeed: 14, orbitRadius: 30,
  spinHitCd: 15, thrownHitCd: 10,
};
const FLAIL_PARAMS: Record<number, Partial<FlailParams>> = {
  25:  { flightTicks: 15, throwSpeed: 14, retractKill: 10, returnKill: 15 },
  26:  { flightTicks: 15, throwSpeed: 16, retractKill: 13, returnKill: 17, orbitRadius: 32 },
  35:  { flightTicks: 15, throwSpeed: 17, retractKill: 14, returnKill: 18, orbitRadius: 37 },
  63:  { flightTicks: 13, throwSpeed: 21, retractKill: 20, returnKill: 24, spinHitCd: 12 },
  154: { flightTicks: 15, throwSpeed: 15, retractKill: 11, returnKill: 16 },
  247: { flightTicks: 13, throwSpeed: 23, spinHitCd: 12, orbitRadius: 40 },
  757: { flightTicks: 13, throwSpeed: 22, retractKill: 22, returnKill: 26, spinHitCd: 12, orbitRadius: 35 },
  947: { flightTicks: 13, throwSpeed: 12, retractKill: 8, returnKill: 13 },
  948: { flightTicks: 13, throwSpeed: 12, retractKill: 8, returnKill: 13 },
  1058: { flightTicks: 16, throwSpeed: 23, spinHitCd: 10, orbitRadius: 45 },
};

/** 链贴图（DrawProj_FlailChains Main.cs:34757-34781 switch）：型号 → Chain_N；
 *  948 三段混排（前 4 节 Chain43 全亮 → 2 节 Chain42 → 其余 Chain41）；
 *  757 = Extra_99 六帧竖条动画链 */
function flailChainTex(projId: number): string {
  switch (projId) {
    case 25: return 'Chain2';
    case 35: return 'Chain6';
    case 63: return 'Chain7';
    case 154: return 'Chain13';
    case 247: return 'Chain19';
    case 947: case 948: return 'Chain41';
    case 757: return 'Extra_99';
    default: return 'Chain3';
  }
}
const chainImgCache = new Map<string, HTMLImageElement>();
function chainImg(name: string): HTMLImageElement | null {
  let img = chainImgCache.get(name);
  if (img !== undefined) return img ?? null;
  if (typeof Image === 'undefined') return null;
  img = new Image();
  img.src = `sprites/vanilla/${name}.png`;
  chainImgCache.set(name, img);
  return img;
}

export class FlailProj extends Entity {
  /** 原版碰撞盒按型号(Projectile.SetDefaults):247/757=34 / 947/948=20 /
   *  1058=26 / 其余 22——写死 22 会让 5 个型号命中盒失真,2026-08-13 review */
  w: number;
  h: number;
  damage: number;
  knockback: number;
  projId: number;
  /** GetWeaponCrit 合并值（Game 侧传入；缺省 4 基础） */
  critChance = 0.04;
  /** ⑥ 护甲穿透（Game 注入，命中传 hurt 减防） */
  armorPen = 0;
  /** 近战系（吃武器浸剂） */
  meleeProj = true;
  /** channel 电平（mouseHeld && 手持原物品 && !uiBlocking）——Game 注入 */
  private channel: () => boolean;
  /** 鼠标世界坐标 getter（松手掷出方向） */
  private target: () => { x: number; y: number };
  private prm: FlailParams;
  /** 子弹生成回调(Game 侧注入 entities.add——GameHooks 不暴露实体桶)。
   *  AI_015 特例:247 Flairon 飞行中自机弹 248 / 757 Drippler 掷出回收气泡 928 /
   *  1058 轨道刺 405 */
  spawnProj: ((x: number, y: number, vx: number, vy: number, projId: number, dmg: number, kb: number) => void) | null = null;
  /** 247/1058 周期计数(247=localAI[0] :41451 / 1058=localAI[2] :41424) */
  private subT = 0;
  /** 1058 出场淡入:原版 alpha 语义(255=隐形,SetDefaults :9719;每 tick -50 至 0,
   *  :41386-41394)——其余型号恒 0(不透明) */
  private alpha = 0;
  /** ai[0] 状态：0 旋转 / 1 掷出 / 2 回拉 / 5 坠落 / 6 垂地悬荡 / 4 回收 */
  private st = 0;
  /** ai[1] 状态内计数 */
  private stT = 0;
  /** localAI[1] 旋转态累计 tick */
  private spinT = 0;
  /** localAI[0] 弹墙累计（AI_015_HandleMovementCollision:41006） */
  private bounces = 0;
  private rotation = 0;
  private hitCd = new HitCooldown();
  /** 手部坐标（链条起点，每 tick 刷新） */
  handX = 0;
  handY = 0;
  life = 7200;
  dead = false;

  constructor(x: number, y: number, damage: number, knockback: number, projId: number,
    channel: () => boolean, target: () => { x: number; y: number }) {
    super();
    this.x = x; this.y = y;
    this.handX = x; this.handY = y;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    this.channel = channel;
    this.target = target;
    this.prm = { ...FLAIL_DEFAULT, ...FLAIL_PARAMS[projId] };
    const pd = projectileData(projId);
    this.w = pd?.width ?? 22;
    this.h = pd?.height ?? 22;
    if (projId === 1058) this.alpha = 255; // SetDefaults :9719(出场淡入起点)
  }

  /** ai[0] 状态只读视图(0 旋转/1 掷出/2 回拉/3 垂链/4 回收/5 坠落/6 垂地悬荡)——测试对账用 */
  get aiState(): number { return this.st; }

  draw(r: Renderer, cam: Camera): void {
    const ctx = r.canvas.getContext('2d');
    if (ctx) this.drawChain(ctx, r);
    // alpha 原版语义(Main.cs:28965 color *= (255-alpha)/255——越大越透明)
    drawProj(r, cam, this, this.projId, this.rotation, '#E04040', Math.max(0, (255 - this.alpha) / 255));
  }

  /** 链条（DrawProj_FlailChains Main.cs:34752-34842 1:1）：球心 → 手臂方向逐节
   *  步长=链节高，每节按所在格光照着色；948 三段混排 / 757 六帧动画链 */
  private drawChain(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const img = chainImg(flailChainTex(this.projId));
    if (!img || !img.complete || img.naturalWidth === 0) {
      // 贴图未就绪兜底：细线（旧实现形态）
      ctx.strokeStyle = '#605848';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.handX, this.handY);
      ctx.lineTo(this.x + this.w / 2, this.y + this.h / 2);
      ctx.stroke();
      return;
    }
    // 光照采样（Lighting.GetColor 每节一次；拿不到则全亮。
    // ★lightAt 返回 0..255(Renderer 同源 /255 消费)——不除即恒满亮的静默 bug,2026-08-13 review)
    const lighting = (r as unknown as { lighting?: { lightAt: (tx: number, ty: number) => [number, number, number] } | null }).lighting;
    const lightAt = (wx: number, wy: number): number => {
      if (!lighting) return 1;
      const [lr, lg, lb] = lighting.lightAt(Math.floor(wx / TILE), Math.floor(wy / TILE));
      return Math.min(1, (lr * 0.3 + lg * 0.5 + lb * 0.2) / 255);
    };
    // 球心 → 臂方向（playerArmPosition.MoveTowards(center,4) 近似为手部）
    const cx0 = this.x + this.w / 2, cy0 = this.y + this.h / 2;
    let dx = this.handX - cx0, dy = this.handY - cy0;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    dx /= d; dy /= d;
    const frames = this.projId === 757 ? 6 : 1;
    const linkH = img.naturalHeight / frames + (this.projId === 757 ? -2 : 0);
    const rotation = Math.atan2(dy, dx) + Math.PI / 2;
    let px = cx0, py = cy0;
    let i = 0;
    for (let remain = d + linkH / 2; remain > 0; remain -= linkH, i++) {
      let tex = img;
      let sy = 0, sh = img.naturalHeight;
      if (this.projId === 757) { sy = (i % 6) * (img.naturalHeight / 6); sh = img.naturalHeight / 6; }
      else if (this.projId === 948) {
        // 三段：前 4 节 Chain43（全亮）→ 2 节 Chain42（最低亮度 140）→ 其余 Chain41
        if (i < 4) { tex = chainImg('Chain43') ?? img; }
        else if (i < 6) { tex = chainImg('Chain42') ?? img; }
      }
      if (!tex.complete || tex.naturalWidth === 0) tex = img;
      const alpha = this.projId === 948 && i < 4 ? 1
        : this.projId === 948 && i < 6 ? Math.max(lightAt(px, py), 140 / 255)
          : lightAt(px, py);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rotation);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = Math.max(0.15, alpha);
      ctx.drawImage(tex, 0, sy, tex.naturalWidth, sh, -tex.naturalWidth / 2, -sh / 2, tex.naturalWidth, sh);
      ctx.restore();
      px += dx * linkH;
      py += dy * linkH;
    }
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.life <= 0) { this.dead = true; return; }
    // 火焰重锤 948 入水(非岩浆)→ 变型 948→947(:41064-41067 type==948 && wet && !lavaWet)
    // wet 语义 = 任一液体(Collision.WetCollision :1608 liquid>0,含蜂蜜/微光)中心
    // 探盒交叠;lavaWet 单独判(:15456-15459)——"湿且非岩浆"即水/蜂蜜/微光都触发。
    // 变型在 switch(type) 参数提取之前 → 同 tick 起按 947 参数走(两型参数一致,无感)
    if (this.projId === 948 && this.inLiquid(game) && !this.inLiquid(game, 2)) this.projId = 947;
    const p = game.player;
    this.handX = p.cx;
    this.handY = p.cy;
    this.hitCd.tick();
    // meleeSpeed 缩放链（:41151-41159,1/meleeSpeed）——repo attackSpeedMult 语义同向(>1 更快)
    const inv = 1 / (p.attackSpeedMult || 1);
    const throwSpd = this.prm.throwSpeed * inv;
    const pullAccel = this.prm.pullAccel * inv;
    const retractKill = this.prm.retractKill * inv;
    const returnAccel = this.prm.returnAccel * inv;
    const returnKill = this.prm.returnKill * inv;
    const farPull = this.prm.farPullSpeed * inv;
    const maxRange = 800;
    // 击杀门（:41053-41059）：主角死亡/离手 900×(1/meleeSpeed)
    const distHand = () => Math.hypot(this.x + this.w / 2 - p.cx, this.y + this.h / 2 - p.cy);
    if (p.dead || distHand() > 900 * inv) { this.dead = true; return; }
    const held = this.channel();
    // num17/num18(:41164-41165):链长上限=掷速×飞行tick;垂地悬荡放行 +160
    const num17 = throwSpd * this.prm.flightTicks;
    const num18 = num17 + 160;
    let cd = 10; // num11 默认每敌冷却
    switch (this.st) {
      case 0: { // 旋转态（:41168-41228）：绕体公转,松手朝鼠标掷出
        // ChangeDir（:41195-41201,channel 判定【之前】）:vector5 = mountedCenter→鼠标
        // 方向,X>0 → 1 / 否则 -1——角色朝鼠标侧转面(GAP#8 ①)。
        // ★26/35 双球在场时原版取反(:41174-41191 flag5,且掷出速度 X 翻转 :41207-41209)——
        // 本仓 channel 绑定手持物品 id(换手即掷出),双球并存结构性不可达,登记偏差
        const t0 = this.target();
        const spinDir = t0.x > p.cx ? 1 : -1;
        this.changeDir(p, spinDir);
        if (!held) {
          this.st = 1; this.stT = 0;
          const dx = t0.x - p.cx, dy = t0.y - p.cy;
          const dd = Math.hypot(dx, dy) || 1;
          this.vx = (dx / dd) * throwSpd + p.vx;
          this.vy = (dy / dd) * throwSpd + p.vy;
          this.x = p.cx - this.w / 2;
          this.y = p.cy - this.h / 2;
          this.hitCd.clear(); // ResetLocalNPCHitImmunity
          cd = this.prm.thrownHitCd;
          break;
        }
        this.spinT++;
        // :41218-41227 vector6 = (direction,0).RotatedBy(π×10×(t/60)×direction);
        // Y×0.8;向下(gravDir>0)再减半——扁椭圆轨迹,上快下慢。
        // direction = 上面 ChangeDir 的结果(原版同 tick 先转面后取 player.direction)
        const a = Math.PI * 10 * (this.spinT / 60) * spinDir;
        let ox = Math.cos(a) * spinDir, oy = Math.sin(a) * spinDir;
        oy *= 0.8;
        if (oy > 0) oy *= 0.5;
        this.x = p.cx + ox * this.prm.orbitRadius - this.w / 2;
        this.y = p.cy + oy * this.prm.orbitRadius - this.h / 2;
        this.vx = 0; this.vy = 0;
        cd = this.prm.spinHitCd;
        break;
      }
      case 1: { // 掷出态（:41230-41263）：直线无重力;再按 → 垂地悬荡(6)
        this.stT++;
        // ★再按目标态 = 6(:41238),非 3——1456 的 case 3 在 AI_015 内无任何入口
        //   (ai[0] 全部赋值点 :41204/:41238/:41251/:41275/:41292/:41355/:41370 无 3),
        //   是死状态;此前误接 3(垂链) = 飞行中再按球悬链不落地,行为偏差
        if (held) {
          this.vx *= 0.2; this.vy *= 0.2; // :41241
          // 757 气泡:速度×0.2 后×1.3,当场生成(:41242-41246)——
          // 此前缓存到帧尾=迟 1t 且位置已积分,1:1 改当场
          this.bubble757(this.vx * 1.3, this.vy * 1.3);
          this.st = 6; this.stT = 0;
          break; // break 在 ChangeDir 之前(:41247)——本 tick 不转面
        }
        if (this.stT >= this.prm.flightTicks || distHand() >= maxRange) {
          this.vx *= 0.3; this.vy *= 0.3; // :41254
          this.bubble757(this.vx * 1.3, this.vy * 1.3); // :41255-41259
          this.st = 2; this.stT = 0;
        }
        this.changeDir(p, p.cx < this.cx ? 1 : -1); // :41261 面朝球
        cd = this.prm.thrownHitCd;
        break;
      }
      case 2: { // 回拉态（:41265-41286）：向手回拉,近手消失;再按 → 垂地
        if (distHand() <= retractKill) { this.dead = true; return; }
        if (held) { this.st = 6; this.stT = 0; this.vx *= 0.2; this.vy *= 0.2; break; }
        this.vx *= 0.98; this.vy *= 0.98;
        this.moveTowardsHand(p, retractKill, pullAccel);
        this.changeDir(p, p.cx < this.cx ? 1 : -1); // :41284 面朝球(仅未再按支)
        cd = this.prm.thrownHitCd;
        break;
      }
      case 3: { // 垂链态（:41288-41330 1:1）：持按悬垂摆动;松手 → 回收;
        //  超链长段 ×0.98 朝手 MoveTowards(num9=14, num8=1)；链内近停段 X×0.96/Y+0.2
        //  （玩家静止再 X×0.96）；tileCollide 按是否超 num17 切换；玩家面朝球(:41328)
        if (!held) { this.st = 4; this.stT = 0; break; }
        {
          const dHand3 = Math.hypot(p.cx - this.cx, this.cy - p.cy);
          if (dHand3 > num17) {
            this.vx *= 0.98; this.vy *= 0.98;
            this.moveTowardsHand(p, 14, 1); // velocity ×0.98 后朝手 MoveTowards(14, 1)（num9/num8）
          } else {
            if (Math.hypot(this.vx, this.vy) < 6) {
              this.vx *= 0.96;
              this.vy += 0.2;
            }
            if (p.vx === 0) this.vx *= 0.96;
          }
          this.changeDir(p, p.cx < this.cx ? 1 : -1); // :41328 面朝球
          cd = this.prm.thrownHitCd;
        }
        break;
      }
      case 5: { // 坠落态（:41352-41367,撞墙入口见下方 tile 碰撞）：重力坠地
        this.stT++;
        if (this.stT >= this.prm.flightTicks + 5) { this.st = 6; this.stT = 0; break; }
        cd = this.prm.thrownHitCd;
        this.vy += 0.6;
        this.vx *= 0.95;
        this.changeDir(p, p.cx < this.cx ? 1 : -1); // :41364 面朝球(else 支)
        break;
      }
      case 6: { // 垂地悬荡态（:41367-41382）：持按垂链;松手/超程 → 回收
        if (!held || distHand() > num18) { this.st = 4; this.stT = 0; break; }
        if (!this.inLiquid(game, 4)) this.vy += 0.8; // :41374-41376 微光中不受重力(!shimmerWet)
        this.vx *= 0.95;
        this.changeDir(p, p.cx < this.cx ? 1 : -1); // :41380 面朝球
        break;
      }
      case 4: { // 回收态（:41331-41351）：无视碰撞回手
        if (distHand() <= returnKill) { this.dead = true; return; }
        this.vx *= 0.98; this.vy *= 0.98;
        this.moveTowardsHand(p, returnKill, returnAccel);
        // 越手击杀（:41337-41343 Dot(dirToHand, dirFrom(目标点))<0 → Kill）
        const tx2 = this.x + this.w / 2 + this.vx, ty2 = this.y + this.h / 2 + this.vy;
        const hx = p.cx - tx2, hy = p.cy - ty2;
        const hd = Math.hypot(hx, hy) || 1;
        const sx = (p.cx - (this.x + this.w / 2)) / (distHand() || 1);
        const sy = (p.cy - (this.y + this.h / 2)) / (distHand() || 1);
        if (sx * (hx / hd) + sy * (hy / hd) < 0) { this.dead = true; return; }
        this.changeDir(p, p.cx < this.cx ? 1 : -1); // :41349 面朝球
        break;
      }
      default: break;
    }
    // 位移 + tile 碰撞（AI_015_HandleMovementCollision :40982-41049）：
    // 旋转态位置由 AI 直接钉死不积分;回收态 tileCollide=false
    if (this.st !== 0 && this.st !== 4) {
      const rest = this.st === 1 || this.st === 5 ? 0.4 : this.st === 6 ? 0 : 0.2;
      const world = game.world;
      const solid = (x: number, y: number): boolean => {
        const x0 = Math.floor(x / TILE), y0 = Math.floor(y / TILE);
        const x1 = Math.floor((x + this.w - 1) / TILE), y1 = Math.floor((y + this.h - 1) / TILE);
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
          if (world.store.inBounds(tx, ty) && world.store.isSolid(tx, ty)) return true;
        }
        return false;
      };
      const lvx = this.vx, lvy = this.vy;
      // num2(int,:40985):0=无音尘 / |lastV|>4 按轴置 1(:41001-41003/:41008-41010)/ 掷出态强制 2
      // (:41021)。结算(:41026-41033) = num2 次 Collision.HitTiles 尘 + 一次 SoundID 0
      // (挖掘音只一响,尘份量随档)——此前按轴各播一次会双响,1:1 收拢
      let dustN = 0;
      const nx = this.x + this.vx;
      if (solid(nx, this.y)) {
        this.vx = -lvx * rest;
        this.bounces++; // localAI[0]:每次接触都计(:41005/:41012)——只计 >4 会让缓磨墙永不触发逃生
        if (Math.abs(lvx) > 4) dustN = 1; // num2>0 门(:41001-41003)
      } else this.x = nx;
      const ny = this.y + this.vy;
      if (solid(this.x, ny)) {
        this.vy = -lvy * rest;
        this.bounces++;
        if (Math.abs(lvy) > 4) dustN = 1; // (:41008-41010)
      } else this.y = ny;
      // 掷出态撞墙 → 坠落态(:41014-41024):位移回卷 + num2 强制 2 + 冲击波(GAP#8 ④)
      if (this.st === 1 && (this.vx !== lvx || this.vy !== lvy)) {
        this.st = 5; this.stT = 0;
        this.x -= lvx; this.y -= lvy; // position -= vector(:41024)——撞墙 tick 不陷墙
        dustN = 2;                    // :41021 无视 |lastV|>4 门,音尘双份
        this.impactExplosion(game, lvx, lvy);
      }
      if (dustN > 0) this.hitTileFx(game, this.x, this.y, dustN);
      // 卡死逃生（:41035-41039）：弹墙≥10 次且非 3/0/5/6 态 → 强制回收
      if (this.st !== 3 && this.st !== 0 && this.st !== 5 && this.st !== 6 && this.bounces >= 10) {
        this.st = 4; this.stT = 0;
      }
    }
    // 旋转:247/1058 的 switch(type) 段内置 flag=false(:41437/:41395)——通用段
    // (:41485-41493 速度>1 对齐速度向,否则按 vx 缓转)被跳过,走各自专属式
    if (this.projId === 247) {
      // :41438-41442:rotation ±=(|vx|+|vy|)×0.01(按 vx 符号);旋转态再 +2π/15×direction
      const n22 = (Math.abs(this.vx) + Math.abs(this.vy)) * 0.01;
      this.rotation += this.vx > 0 ? n22 : -n22;
      if (this.st === 0) this.rotation += (Math.PI * 2 / 15) * p.facing;
    } else if (this.projId === 1058) {
      // :41396-41398:rotation 恒指玩家(-π/2 补偿),不随飞行向
      this.rotation = Math.atan2(p.cy - this.cy, p.cx - this.cx) - Math.PI / 2;
    } else {
      const spd = Math.hypot(this.vx, this.vy);
      if (spd > 1) this.rotation = Math.atan2(this.vy, this.vx) + this.vx * 0.1;
      else this.rotation += this.vx * 0.1;
    }
    // 1058 出场淡入(:41386-41394,SetDefaults alpha=255 :9719;全状态无门)
    if (this.alpha > 0) this.alpha = Math.max(0, this.alpha - 50);
    // ---- AI_015 特例子弹(:41383-41478 switch(type) 尾段) ----
    // ★原版该 switch(type) 特例段在【全部状态】运行(:41383-41478,无 ai[0] 门)——
    // 此前 st!==4 把回收态排除,1:1 对齐移除(2026-08-13)
    if (this.spawnProj) {
      if (this.projId === 247) {
        // Flairon:每 20t(脱靶续 17)600px 内最近敌(距离+CanHit)→ 自机弹 248
        // (:41435-41478)damage/1.5、kb/2、速 14
        this.subT++;
        if (this.subT >= 20) {
          this.subT = 17;
          const cx0 = this.x + this.w / 2, cy0 = this.y + this.h / 2;
          let best = 600, bx = 0, by = 0, found = false;
          for (const ent of game.enemies()) {
            const e = ent as { x: number; y: number; w: number; h: number; dead: boolean };
            if (e.dead) continue;
            if (!canHit(game.world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
            const d = Math.hypot(e.x + e.w / 2 - cx0, e.y + e.h / 2 - cy0);
            if (d < best) { best = d; bx = e.x + e.w / 2; by = e.y + e.h / 2; found = true; }
          }
          if (found) {
            this.subT = 0;
            const dd = Math.hypot(bx - cx0, by - cy0) || 1;
            this.spawnProj(cx0, cy0, ((bx - cx0) / dd) * 14, ((by - cy0) / dd) * 14,
              248, Math.round(this.damage / 1.5), this.knockback / 2);
          }
        }
      } else if (this.projId === 1058) {
        // 轨道刺(:41409-41430):旋转态每 3-6t/其余态每 6t,朝【玩家反向】掷 405
        // (:41425-41429 v=(ball-player)norm×(4.5-6.5)±π/4);damage 满额/旋转态 kb×0.5
        this.subT++;
        // :41412-41421 num28:默认 4;垂链/悬荡态(vanilla 6/3)→ 6;旋转态 Next(3,6)=3-5
        const need = this.st === 0 ? 3 + Math.floor(Math.random() * 3)
          : this.st === 3 || this.st === 6 ? 6 : 4;
        if (this.subT >= need) {
          this.subT = 0;
          const dxp = this.x + this.w / 2 - p.cx, dyp = this.y + this.h / 2 - p.cy;
          const dp = Math.hypot(dxp, dyp) || 1;
          const base = Math.atan2(dyp / dp, dxp / dp);
          const ang = base + (Math.random() - 0.5) * Math.PI / 2;
          const spd = (4.5 + Math.random() * 2);
          this.spawnProj(this.x + this.w / 2, this.y + this.h / 2,
            Math.cos(ang) * spd, Math.sin(ang) * spd, 405, this.damage,
            this.st === 0 ? this.knockback * 0.5 : this.knockback);
        }
      }
    }
    // 火尘（AI_015_Flails_Dust :41778-41785:type 35 每帧 1 颗火尘 noGravity）
    if (this.projId === 35 || this.projId === 948) {
      game.spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#FF8830', 1, 0.5,
        { life: 20, grav: 0, size: 2 });
    } else if (this.projId === 26) {
      // :41770-41775 hallow 尘近似
      if (Math.random() < 0.2) game.spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#B0A0FF', 1, 0.5, { life: 20, grav: 0, size: 2 });
    }
    // 击退方向 = projectile.direction(:41479-41482 velocity.X>0?1:-1,vx==0 → -1;
    // 1058 走专属式 :41398-41405 = 反(player→球)方向)——此前 Math.sign(vx)||1
    // 把 vx==0 档写成 1,1:1 修正
    const kdir = this.projId === 1058 ? (p.cx < this.cx ? 1 : -1) : (this.vx > 0 ? 1 : -1);
    hitEnemies(this, game, this.hitCd, cd, kdir, this.armorPen);
  }

  /** velocity MoveTowards(手方向×targetSpd, accel)（case2 :41283 / case3 :41311-41315 同式） */
  private moveTowardsHand(p: { cx: number; cy: number }, targetSpd: number, accel: number): void {
    const d = Math.hypot(p.cx - (this.x + this.w / 2), p.cy - (this.y + this.h / 2)) || 1;
    const tx = ((p.cx - (this.x + this.w / 2)) / d) * targetSpd;
    const ty = ((p.cy - (this.y + this.h / 2)) / d) * targetSpd;
    const ddx = tx - this.vx, ddy = ty - this.vy;
    const dd = Math.hypot(ddx, ddy);
    if (dd <= accel) { this.vx = tx; this.vy = ty; }
    else { this.vx += (ddx / dd) * accel; this.vy += (ddy / dd) * accel; }
  }

  /** Player.ChangeDir（Player.cs:41440-41460）:同向早退只写 direction;原版还镜像
   *  手臂合成旋转/itemRotation/itemLocation——本仓无手臂/持物朝向系统,仅落 facing */
  private changeDir(p: { facing: number }, dir: number): void {
    if (p.facing !== dir) p.facing = dir;
  }

  /** 中心格液体探测:type 省略=任一液体;1水/2岩浆/3蜂蜜/4微光(LIQUID_TYPE)。
   *  近似 Collision.WetCollision/LavaCollision(:1575-1651)中心探盒:阈值 64(≈1/4 格)
   *  近似原版表面偏移 (256-liquid)/16 的交叠判定(:1613-1616) */
  private inLiquid(game: GameHooks, type?: number): boolean {
    const st = game.world.store;
    const i = st.idx(Math.floor((this.x + this.w / 2) / TILE), Math.floor((this.y + this.h / 2) / TILE));
    return st.liquid[i] > 64 && (type === undefined || st.liquidType[i] === type);
  }

  /** 757 Drippler 气泡 928(:41243-41246/:41256-41259):两过渡点当场掷出,
   *  速度 = (衰减后 velocity)×1.3,damage/knockBack 满额——实际生成走 spawnProj 回调 */
  private bubble757(vx: number, vy: number): void {
    if (this.projId === 757 && this.spawnProj) {
      this.spawnProj(this.cx, this.cy, vx, vy, 928, this.damage, this.knockback);
    }
  }

  /** 撞墙反馈(num2 次 Collision.HitTiles 尘 + 一次 SoundID 0 挖掘音,:41026-41033) */
  private hitTileFx(game: GameHooks, hx: number, hy: number, n = 1): void {
    game.spawnParticles(hx + this.w / 2, hy + this.h / 2, '#A09080', 3 * n, 1.5, { life: 14, size: 2 });
    game.playSfx('dig', 1, hx + this.w / 2, hy + this.h / 2);
  }

  /** 掷出态撞墙冲击波(GAP#8 ④)。原版两连(:41031-41034):
   *  ①CreateImpactExplosion(2, center, 命中盒, width, :66367-66412)——命中盒内逐格,
   *    实心·非 solidTop·非 frameImportant 且上方空气的块,按 KillTile_GetTileDustAmount
   *    ×2 出【块色】尘(velocity.Y -= (3+num×1.5)×rand、scale += num×0.03,num 恒 4;
   *    num≥2 再补 num2-1 颗上抛),出过尘 → causedShockwaves=true;
   *  ②CreateImpactExplosion2_FlailTileCollision(:66452-66500)——8 颗椭圆(7×0.7)白尘
   *    (color=White×0.5,α=causedShockwaves?0:50,scale 0.4,velocity.Y-=0.8/X×0.8 后
   *    += 撞前速度向×2;无块尘再补 8 颗 α100 ×1.5)。
   *  近似:粒子系统无逐格块色尘/定点椭圆环 → 上抛尘团(①)+ 定向半环(②,沿撞前方向
   *  偏置 yMul 0.7 压轴;原版入墙半环本就被块遮住) */
  private impactExplosion(game: GameHooks, lvx: number, lvy: number): void {
    const cx0 = this.x + this.w / 2, cy0 = this.y + this.h / 2;
    game.spawnParticles(cx0, cy0, '#A09080', 8, 2.5, { life: 22, grav: 0.1, size: 2 });
    game.spawnBurst?.(cx0, cy0, '#E8E4DC', 8, 2, Math.atan2(-lvy, -lvx), Math.PI / 2,
      { life: 24, grav: -0.02, yMul: 0.7 });
  }
}

// ================= 弗莱龙刺（proj 405，aiStyle 70 全语义 1:1，:29188-29239） =================

/** 1058 掷出的轨道刺 405（AI_015 :41425-41430 传 ai0=-10）：
 *  -10→0 漂入段(:29224-29231)：每 tick ai0++、α-25(下限 50)、vel×0.95;
 *  ai0==0 首寻(:29191-29215)：650px 内最近敌(CanHit 视线门)→ ai0=idx+1 并
 *  初次转向 (v×20+dir×Next(35,75)/30)/21；无目标 → ai0=-15(再漂 15t);
 *  ai0>0 追踪段(:29217-29219)：(v×40+dir×12)/41;
 *  撞块(:16905-16921)：前 2 次接触反弹、第 3 次 Kill;Kill 爆 20 颗火尘(:69686)。
 *  scale=ai1=Next(80,121)/100(:29233-29239);timeLeft 120/penetrate 1(SetDefaults :4584) */
export class FlaironSpike extends Entity {
  w = 14; h = 14;
  damage: number;
  knockback: number;
  projId = 405;
  critChance = 0.04;
  meleeProj = true;
  private ai0: number;   // -10 起步(1058 传参语义)
  private ai1: number;   // scale
  private alpha = 255;
  private bounces = 0;
  private hitCd = new HitCooldown();
  life = 120;
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
    this.ai0 = -10;
    this.ai1 = (80 + Math.random() * 41) / 100; // Next(80,121)/100
  }

  draw(r: Renderer, cam: Camera): void {
    // α 原版语义(Main.cs:28965 color *= (255-alpha)/255,越大越透明):SetDefaults 255
    // (:4590)出生隐形,漂入段每 tick -25 至 50(:29225-29229)→ 淡入。
    // 此前直接 alpha/255 当不透明度 = 方向写反(出生全显、越漂越透明)。
    // scale=ai1(:29237)是贴图缩放非命中盒——此前改 w 会让绘制中心随缩放偏移
    drawProj(r, cam, this, this.projId,
      Math.atan2(this.vy, this.vx) + Math.PI / 2, '#FFB060',
      Math.max(0, (255 - this.alpha) / 255), Math.round(14 * this.ai1));
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.life <= 0) { this.dead = true; return; }
    this.hitCd.tick();
    const cx0 = this.x + this.w / 2, cy0 = this.y + this.h / 2;
    if (this.ai0 === 0) {
      // 首寻:650px 内最近敌(距离+CanHit)
      let best = 650, bx = 0, by = 0, found = false;
      for (const ent of game.enemies()) {
        const e = ent as { x: number; y: number; w: number; h: number; dead: boolean };
        if (e.dead) continue;
        if (!canHit(game.world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
        const d = Math.hypot(e.x + e.w / 2 - cx0, e.y + e.h / 2 - cy0);
        if (d < best) { best = d; bx = e.x + e.w / 2; by = e.y + e.h / 2; found = true; }
      }
      this.ai0 = found ? 1 : -15; // repo 无 NPC 索引,命中即锚定首敌(ai0=1)
      if (found) {
        const num605 = (35 + Math.random() * 40) / 30; // Next(35,75)/30
        const jx = bx - cx0 + (Math.random() * 200 - 100);
        const jy = by - cy0 + (Math.random() * 200 - 100);
        const jd = Math.hypot(jx, jy) || 1;
        this.vx = (this.vx * 20 + (jx / jd) * num605) / 21;
        this.vy = (this.vy * 20 + (jy / jd) * num605) / 21;
      }
    } else if (this.ai0 > 0) {
      // 追踪:(v×40+dir×12)/41——repo 无索引锚,朝当前最近敌(650 内)
      let best = 650, bx = 0, by = 0, found = false;
      for (const ent of game.enemies()) {
        const e = ent as { x: number; y: number; w: number; h: number; dead: boolean };
        if (e.dead) continue;
        const d = Math.hypot(e.x + e.w / 2 - cx0, e.y + e.h / 2 - cy0);
        if (d < best) { best = d; bx = e.x + e.w / 2; by = e.y + e.h / 2; found = true; }
      }
      if (found) {
        const dd = Math.hypot(bx - cx0, by - cy0) || 1;
        this.vx = (this.vx * 40 + ((bx - cx0) / dd) * 12) / 41;
        this.vy = (this.vy * 40 + ((by - cy0) / dd) * 12) / 41;
      }
    } else {
      // 漂入/无目标:ai0++、α-25(下限 50)、vel×0.95
      this.ai0++;
      this.alpha = Math.max(50, this.alpha - 25);
      this.vx *= 0.95; this.vy *= 0.95;
    }
    this.x += this.vx;
    this.y += this.vy;
    // 撞块:前 2 次反弹、第 3 次 Kill(:16905-16921)
    const tx = Math.floor((this.x + this.w / 2) / TILE), ty = Math.floor((this.y + this.h / 2) / TILE);
    if (game.world.store.inBounds(tx, ty) && game.world.store.isSolid(tx, ty)) {
      this.bounces++;
      if (this.bounces < 3) {
        this.x -= this.vx; this.y -= this.vy;
        this.vx = -this.vx; this.vy = -this.vy;
      } else {
        this.dead = true;
        // Kill 爆尘(:69686-69700):20 颗火尘向外喷(音效 Item54 未提取,登记 GAP)
        game.spawnParticles(cx0, cy0, '#FF9A3C', 20, 2.5, { life: 30, grav: -0.05 });
        return;
      }
    }
    hitEnemies(this, game, this.hitCd, 10, Math.sign(this.vx) || 1);
  }
}

// ================= 手雷/炸弹/炸药（aiStyle 16，AI_016 引信爆炸） =================

/** AI_016 全族分类表（Projectile.cs 权威行号） */
/** 粘性族（SetDefaults tileCollide=false + AI_016 :44325 贴附扫描） */
const STICKY_PROJ = new Set([37, 397, 470]);
/** 炸药棍族（Kill :74943 视觉/PrepareBombToBlow 250×250/半径 7/反弹 ×0.8/摩擦追加 ×0.99） */
const DYN_PROJ = new Set([29, 470, 637]);
/** 炸弹族（Kill :74881 视觉/PrepareBombToBlow 128×128 dmg100/半径 4） */
const BOMB_PROJ = new Set([28, 37, 516]);
/** 手雷族（不破坏地形；PrepareBombToBlow 128×128 用物品伤害） */
const NADE_PROJ = new Set([30, 397, 517]);
/** IsABombWithFuse（ProjectileID.cs:183——引信嘶声循环族；手雷族不在内！） */
const FUSE_SOUND_PROJ = new Set([28, 37, 516, 29, 470, 637]);

export class GrenadeProj extends Entity {
  // 碰撞盒 1:1（Projectile.SetDefaults :846-869/:938/:4508/:5173/:5584/:5592/:6571）：
  // 28/37/516=22×22 / 29/470/637=10×10 / 30/397/517=14×14——此前统一 14×14
  w = 14; h = 14;
  vx: number;
  vy: number;
  damage: number;
  projId: number;
  /** 引信 timeLeft 1:1（SetDefaults :10348-10408）：炸弹/手雷族 180、炸药棍族
   *  {29,470,637}=300——此前误写 150/135/180 */
  fuse: number;
  onExplode!: (x: number, y: number, damage: number) => void;
  private rot = 0;
  dead = false;
  /** 引信嘶声循环句柄（AI_016 :44276-44281 PlayTrackedLoopedSound；Kill :67373 Stop） */
  private fuseSnd: { stop(): void; setPos(px: number, py: number): void } | null | undefined;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, fuse: number,
    projId: number, onExplode: (x: number, y: number, damage: number) => void) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.fuse = fuse;
    this.projId = projId;
    this.onExplode = onExplode;
    const hb = BOMB_PROJ.has(projId) ? 22 : DYN_PROJ.has(projId) ? 10 : 14;
    this.w = hb; this.h = hb;
  }

  draw(r: Renderer, cam: Camera): void {
    // 原版投射物绘制 = 贴图原生尺寸 × scale 1（与碰撞盒解耦）——雷管 29 贴图 10×32
    // 此前按碰撞盒宽 14 拉方成 14×44.8（"雷管贴图这么大个"根因）
    drawProj(r, cam, this, this.projId, this.rot, '#408040', 1, -1);
  }

  /** 死亡清理：停引信嘶声（Kill :67373-67377 GetActiveSound?.Stop()） */
  destroy(): void {
    this.fuseSnd?.stop();
    this.fuseSnd = null;
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    const st = game.world.store;
    // ---- 引信嘶声循环（AI_016 :44276：IsABombWithFuse 且 timeLeft>1；0.2 音量跟踪弹体）----
    if (FUSE_SOUND_PROJ.has(this.projId) && this.fuse > 1) {
      // 首播可能缓冲未就绪返回 null → 每 tick 重试直至挂上（原版同帧不保证）
      if (!this.fuseSnd) {
        this.fuseSnd = game.startTrackedLoop?.('bombFuse', 0.2, this.cx, this.cy) ?? null;
      } else {
        this.fuseSnd.setPos(this.cx, this.cy);
      }
    }
    // ---- 接触引爆（Projectile.Damage :12330-12340 碰 NPC / :13533-13541 碰玩家：
    //      timeLeft 钳 3 → 3 tick 后炸）----
    {
      const pl = game.player;
      if (pl && !pl.dead
        && this.x < pl.x + pl.w && this.x + this.w > pl.x
        && this.y < pl.y + pl.h && this.y + this.h > pl.y
        && this.fuse > 3) this.fuse = 3;
      for (const ent of game.enemies()) {
        const e = ent as unknown as { x: number; y: number; w: number; h: number; dead?: boolean };
        if (e.dead) continue;
        if (this.x < e.x + e.w && this.x + this.w > e.x
          && this.y < e.y + e.h && this.y + this.h > e.y) { this.fuse = Math.min(this.fuse, 3); break; }
      }
    }
    // ---- 引信倒数 → 爆（PrepareBombToBlow 在 timeLeft≤3 置 alpha=255 隐形本体，此处直接爆）----
    if (--this.fuse <= 0) {
      this.dead = true;
      this.destroy();
      this.onExplode(this.x + this.w / 2, this.y + this.h / 2, this.damage);
      return;
    }
    // 旋转 = 滚动（AI_016 :44909-44915 rotation += velocity.X × 0.1；本族不在排除表）
    this.rot += this.vx * 0.1;
    // ---- 粘性族（AI_016 :44325-44390）：tileCollide=false 不碰块反弹；
    //      盒外扩 ±1..+2 格扫实心（跳过平台），4px 内缩重叠 → velocity=(0,-0.2) 贴附 ----
    if (STICKY_PROJ.has(this.projId)) {
      const x0 = Math.max(0, Math.floor(this.x / TILE) - 1);
      const x1 = Math.min(st.w, Math.floor((this.x + this.w) / TILE) + 2);
      const y0 = Math.max(0, Math.floor(this.y / TILE) - 1);
      const y1 = Math.min(st.h, Math.floor((this.y + this.h) / TILE) + 2);
      let stuck = false;
      for (let i = x0; i < x1 && !stuck; i++) {
        for (let j = y0; j < y1 && !stuck; j++) {
          if (!st.inBounds(i, j) || !st.isActive(i, j) || !st.isSolid(i, j) || st.isPlatform(i, j)) continue;
          if (this.x + this.w - 4 > i * TILE && this.x + 4 < i * TILE + TILE
            && this.y + this.h - 4 > j * TILE && this.y + 4 < j * TILE + TILE) stuck = true;
        }
      }
      if (stuck) { this.vx = 0; this.vy = -0.2; }  // 贴附：抵消重力悬停（:44376-44377）
      else this.vy = Math.min(this.vy + 0.2, 16);   // 未贴住时照常重力
      this.x += this.vx;
      this.y += this.vy;
      if (!st.inBounds(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) { this.dead = true; this.destroy(); }
      return;
    }
    // ---- 普通族物理：重力 0.2（:44897）+ 反弹（tile 碰撞响应 :18339-18357） ----
    this.vy = Math.min(this.vy + 0.2, 16);
    const lastVx = this.vx, lastVy = this.vy;
    let nx = this.x + this.vx;
    let ny = this.y + this.vy;
    const solidAt = (px: number, py: number) => {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      return st.inBounds(tx, ty) && st.isSolid(tx, ty);
    };
    // 撞墙（X 阻挡）：vx = lastVx × -0.4（炸药棍族再 ×0.8）（:18344-18350）
    if (solidAt(nx + this.w / 2, this.y + this.h / 2) || solidAt(nx + this.w / 2, this.y + this.h - 1)) {
      this.vx = lastVx * -0.4;
      if (DYN_PROJ.has(this.projId)) this.vx *= 0.8;
      nx = this.x;
    }
    // 落地（Y 阻挡）：lastVy>0.7 才反弹 vy = lastVy × -0.4（炸药棍族 ×0.8）（:18351-18357）；
    // 否则贴地 vy=0 + 滚动摩擦 vx×0.97（炸药棍族追加 ×0.99，|vx|<0.01 归零）（:44888-44895）
    if (solidAt(nx + this.w / 2, ny + this.h - 1)) {
      if (lastVy > 0.7) {
        this.vy = lastVy * -0.4;
        if (DYN_PROJ.has(this.projId)) this.vy *= 0.8;
      } else {
        this.vy = 0;
        this.vx *= DYN_PROJ.has(this.projId) ? 0.97 * 0.99 : 0.97;
        if (Math.abs(this.vx) < 0.01) this.vx = 0;
      }
      ny = this.y;
    }
    this.x = nx;
    this.y = ny;
    if (!st.inBounds(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) { this.dead = true; this.destroy(); }
  }
}

// ================= 荧光棒族（aiStyle 14，AI_014 + 碰撞反弹表 Projectile.cs:23482-23500/18261-18333） =================

/** 荧光棒物理 1:1：
 *  AI_014 主体（cs:23482-23500）：ai0++ >5 钳位；着地（本帧 vy 未变且 vx≠0）滚动摩擦
 *  vx×0.97（<0.01 归零）；重力 vy+=0.2；rotation += vx×0.1
 *  粘性（proj 53，tileCollide=false，cs:23245-23296）：与实心块重叠 → velocity=(0,-0.2)
 *  抵消重力 → 停在原位粘住
 *  妖精（proj 870）：首次碰墙全反射 → aiStyle 170（cs:42997-43053）：半径 10 实心排斥
 *  场（速度>1 时每 10 tick 重算）+ 速度 ×0.95 衰减、<1 归零
 *  碰撞反弹表（cs:18261-18333，碰墙后）：
 *    50      X→-0.2×；Y（lastV>1.5）→-0.2×
 *    ≥1089   彩虹：X→-0.99×（|Δ|<1 → ±1）；Y→-0.99×（0<lastV<1 → -1）——近似永动
 *    其余    473/515：X→-0.5×；Y（lastV>1）→-0.5×
 *  寿命：timeLeft×5（=9000，cs:1075）；矿工 473 ×2（=3600）。到期消失无掉落 */
export class GlowstickProj extends Entity {
  w: number; h: number;
  vx: number;
  vy: number;
  projId: number;
  dead = false;
  /** 原版 timeLeft（proj 50/53/515/870/1089 = 9000；473 = 3600） */
  timeLeft: number;
  private ai0 = 0;
  private rot = 0;
  /** 妖精阶段（870 反弹后） */
  private fairy = false;
  private fairyT = 0;

  constructor(x: number, y: number, vx: number, vy: number, projId: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.projId = projId;
    this.w = projId === 473 ? 8 : 6;
    this.h = this.w;
    this.timeLeft = projId === 473 ? 3600 : 9000;
  }

  draw(r: Renderer, _cam: Camera): void {
    // 原版投射物绘制尺寸 = 贴图原生尺寸 × scale（碰撞盒 6×6 与绘制解耦）——
    // 50/53/515/1089 贴图是 22×6 横条（此前按碰撞盒 6px 画成 1.6px 细丝）；
    // 870 妖精 = 18×96 纵条 6 帧（帧进 5t）；473 = 18×18 单帧
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const img = projSprite(this.projId);
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    if (img && img.complete && img.naturalWidth > 0) {
      if (this.projId === 870) {
        const fr = Math.floor(this.fairyT / 5) % 6;
        ctx.drawImage(img, 0, fr * 16, 18, 16, -9, -8, 18, 16);
      } else {
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      }
    } else {
      ctx.fillStyle = '#7FE8A8';
      ctx.fillRect(-3, -3, 6, 6);
    }
    ctx.restore();
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.timeLeft <= 0) { this.dead = true; return; }
    const st = game.world.store;
    const solidAt = (px: number, py: number) => {
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      return st.inBounds(tx, ty) && st.isSolid(tx, ty);
    };
    if (this.fairy) {
      // AI_170_FairyGlowstick（cs:42997-43053）：排斥场 + 衰减
      this.fairyT++;
      if (this.fairyT % 10 === 0 && Math.hypot(this.vx, this.vy) > 1) {
        const ptx = Math.floor((this.x + this.w / 2) / TILE), pty = Math.floor((this.y + this.h / 2) / TILE);
        let zx = 0, zy = 0, n = 0;
        for (let i = ptx - 10; i <= ptx + 10; i++) {
          for (let j = pty - 10; j <= pty + 10; j++) {
            if (!st.inBounds(i, j) || !st.isSolid(i, j)) continue;
            const dx = ptx - i, dy = pty - j;
            const len = Math.hypot(dx, dy) || 1;
            const f = Math.max(10 - len, 0) / len * 3;
            zx += dx * f; zy += dy * f; n++;
          }
        }
        if (n > 0) { zx /= n; zy /= n; }
        if (Math.hypot(zx, zy) > 1) { this.vx = zx; this.vy = zy; }
      }
      this.vx *= 0.95; this.vy *= 0.95;
      if (Math.hypot(this.vx, this.vy) < 1) { this.vx = 0; this.vy = 0; }
      this.x += this.vx; this.y += this.vy;
      return;
    }
    // AI_014 主体
    this.ai0++;
    if (this.ai0 > 5) {
      this.ai0 = 5;
      // 着地判定用上一帧 vy 是否未变（原版 velocity.Y == 0 即已落地）——落地格 vy 被置 0
      if (this.vy === 0 && this.vx !== 0) {
        this.vx *= 0.97;
        if (Math.abs(this.vx) < 0.01) this.vx = 0;
      }
      this.vy += 0.2;
    }
    this.rot += this.vx * 0.1;
    // 粘性（53）：tileCollide=false，与实心重叠 → 粘住
    if (this.projId === 53) {
      const overlap = solidAt(this.x + this.w / 2, this.y + this.h / 2)
        || solidAt(this.x + 1, this.y + 1) || solidAt(this.x + this.w - 2, this.y + this.h - 2);
      if (overlap) { this.vx = 0; this.vy = -0.2; return; }
      this.x += this.vx; this.y += this.vy;
      return;
    }
    // 移动 + 碰撞反弹（反弹表 cs:18261-18333）
    const lastVx = this.vx, lastVy = this.vy;
    let nx = this.x + this.vx, ny = this.y + this.vy;
    let hitX = false, hitY = false;
    if (solidAt(nx + this.w / 2, this.y + this.h / 2) || solidAt(nx + this.w / 2, this.y + 1)) { hitX = true; nx = this.x; }
    if (solidAt(nx + this.w / 2, ny + this.h) || solidAt(nx + 1, ny + this.h) || solidAt(nx + this.w - 1, ny + this.h)) { hitY = true; ny = this.y; }
    if (hitX || hitY) {
      if (this.projId === 870) {
        // 妖精首次反弹：全反射进入 170 阶段（cs:18270-18276）
        this.vx = -lastVx; this.vy = -lastVy;
        this.fairy = true;
        this.fairyT = 0;
        this.rot = 0;
        return;
      }
      if (this.projId === 50) {
        if (hitX) this.vx = lastVx * -0.2;
        if (hitY) this.vy = lastVy > 1.5 ? lastVy * -0.2 : 0;
      } else if (this.projId >= 1089) {
        // 彩虹：近全反射、最低 ±1 保底（cs:18279-18299）
        if (hitX) this.vx = Math.abs(this.vx - lastVx) < 1 ? (lastVx < 0 ? -1 : 1) : -lastVx * 0.99;
        if (hitY) this.vy = -lastVy * 0.99;
      } else {
        // 473 矿工 / 515 弹力（默认档，cs:18314-18327）
        if (hitX) this.vx = lastVx * -0.5;
        if (hitY) this.vy = lastVy > 1 ? lastVy * -0.5 : 0;
      }
    }
    this.x = nx; this.y = ny;
  }
}

// ================= 净化粉/邪恶粉云（proj 10/11/463，aiStyle 6，cs:22399-22533） =================

/** 粉末云 1:1（SetDefaults cs:637-662：64×64 命中盒、tileCollide=false、penetrate=-1、
 *  alpha=255 本体不可见——视觉全靠尘粒；AI_006 cs:22399-22533：速度 ×0.95 衰减、
 *  寿命 180 tick、首 tick 30 粒尘、每 tick 命中盒内逐格 Convert + Damage_TryUsingPowders
 *  （:13646）NPC 转化。tile/NPC 实效经 GameHooks.applyPowder 回调——实体层不触
 *  World/实体桶，与 cutTile/breakTile 同构） */
export class PowderProj extends Entity {
  w = 64; h = 64;
  projId: number;
  dead = false;
  private t = 0;
  private dusted = false;

  constructor(x: number, y: number, vx: number, vy: number, projId: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.projId = projId;
  }

  draw(): void { /* 原版 alpha=255：本体不绘制（cs:643），尘粒即全部视觉 */ }

  fixedUpdate(_dt: number, game: GameHooks): void {
    this.t++;
    if (this.t >= 180) { this.dead = true; return; } // ai[0]==180 → Kill（cs:22406）
    this.vx *= 0.95; this.vy *= 0.95;                // cs:22403
    this.x += this.vx;
    this.y += this.vy;
    if (!this.dusted) {
      // 首帧尘团（cs:22411-22452：30 粒，dust = 10+type → 净化 20 / 邪恶 21 / 猩红 231）
      this.dusted = true;
      const color = this.projId === 10 ? '#DCE8E2' : this.projId === 11 ? '#B070D0' : '#D06070';
      game.spawnParticles(this.cx, this.cy, color, 30, 1.6, { life: 45, damp: 0.94, size: 2 });
    }
    game.applyPowder?.(this.projId, this.x, this.y, this.w, this.h);
  }
}

// ================= Torch God 火把弹幕（proj 949，AI_184 cs:40100） =================

/** 直线飞行火把：射程(rangePx)耗尽前穿墙，之后撞块即毁；命中玩家 20 伤。
 *  ai0=尘色/ai1=射程——尘迹省略（粒子钩子未接），伤害/碰撞 1:1 */
export class TorchGodProj extends Entity {
  w = 4; h = 4;
  vx: number; vy: number;
  damage = 20;
  projId = 949;
  dead = false;
  private rangeLeft: number;
  private tileCollide = false;

  constructor(x: number, y: number, vx: number, vy: number, rangePx: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.rangeLeft = rangePx;
  }

  draw(r: Renderer, cam: Camera): void {
    drawProj(r, cam, this, 949, Math.atan2(this.vy, this.vx) + Math.PI / 2, '#FFB060');
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    const st = game.world.store;
    // ai[1] -= velocity.Length()（:40112-40119）：射程内 tileCollide=false
    this.rangeLeft -= Math.hypot(this.vx, this.vy);
    if (this.rangeLeft <= 0) this.tileCollide = true;
    const nx = this.x + this.vx, ny = this.y + this.vy;
    if (this.tileCollide) {
      const tx = Math.floor((nx + this.w / 2) / TILE), ty = Math.floor((ny + this.h / 2) / TILE);
      if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) { this.dead = true; return; }
    }
    // 命中玩家（无敌帧由 Player.damage 侧处理）。死亡归因 = ByProjectile
    // （Projectile.Damage→Hurt 同源弹型名;此前漏设→死因残留旧值）
    const p = game.player;
    if (nx < p.x + p.w && nx + this.w > p.x && ny < p.y + p.h && ny + this.h > p.y) {
      p.lastDamageCause = {
        kind: 'projectile',
        name: game.projectileName?.(this.projId) ?? '弹幕',
      };
      p.damage(this.damage, Math.sign(p.cx - (nx + this.w / 2)) || 1, 0, game as never);
      this.dead = true;
      return;
    }
    this.x = nx; this.y = ny;
  }
}
