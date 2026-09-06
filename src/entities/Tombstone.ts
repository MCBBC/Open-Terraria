// 墓碑实体：Player.DropTombstone + Projectile aiStyle 17 1:1（1456 :38427-38467 款式
//   段 / 1457 DropTombstone = Player.cs:39410-39462，aiStyle17 = 1457 Projectile.cs:25636-25690）。
//   Player.cs:39410-39462  款式按身家：≤10 万铜币 → 43（1/6）或 200+rand(6)；
//                           >10 万 → 527+rand(5)（金墓碑）；从玩家中心抛射
//                           （vx = rand(10..30)*0.1*击退方向 + 随机游走修正；vy = rand(-40..-20)*0.1 上抛）
//   ★FTW 伤害面（:39429-39439 + Projectile SetDefaults :1260-1271）：getGoodWorld →
//     damage=70 / knockBack=10 / 弹速 ×1.5，且 SetDefaults 对 43/201-205/527-531 置
//     friendly=true + hostile=true → Projectile.Damage（:12549-12580）三面全开：
//     PVE（friendly 臂）打敌怪 + hostile&friendly 臂（:12631 flag2）打城镇 NPC、
//     EVP（hostile, damage>0, netMode≠2）打本地玩家、小动物照杀（Player.cs:20675 面）。
//     非 FTW damage=0 纯物理（Damage_PVE/PVP/EVP 首门 `damage <= 0` 全早退）。
//     联机 PvP 面（Damage_PVP）本仓无该模拟域，不接（备案）。
//   ★击杀归因（成就 36 GRAVE_MISTAKE，Player.OnKillNPC :20623-20636）：
//     Projectile.cs:13702-13706 `attempt.DidNPCDie()` → OnKillNPC(ref attempt, this)
//     → IsAGravestone[type] && townNPC → NotifyProgressionEvent(36)。
//   Projectile.cs:25636-25690 aiStyle17 物理：vy+=0.2/帧；rotation+=vx*0.1（翻滚随位移）；
//                           落地（vy==0）vx*=0.98 摩擦；无弹跳。每帧检查底缘中心下方格：
//                           可放 2×2 墓碑(tile 85) → 放置 + 写碑文(死亡文本+日期) + 消失
//   style 映射（Projectile.cs:25681-25687）：43→0；201-205→1-5；527-531→6-10（Tiles_85 偶数列）
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { MAX_FALL_SPEED } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { TILE_BY_KEY } from '../data/tiles';
import { hitPlayer, hitTownNpcs, hitCritters } from './projTargets';
import { projectileWetSection, projWaterDragFactor } from './projWetSection';
import { projectileData } from '../data/vanillaProjectiles';

/** 程序化像素墓碑贴图（16×22）——仅作贴图缺失时的兜底 */
let tombstoneCanvas: HTMLCanvasElement | null = null;
export function getTombstoneCanvas(): HTMLCanvasElement {
  if (!tombstoneCanvas) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 22;
    const x = c.getContext('2d')!;
    const stone = '#A8A8B4', dark = '#70707E', light = '#C4C4D0', en = '#585864';
    x.fillStyle = stone;
    x.fillRect(4, 2, 8, 2);
    x.fillRect(3, 4, 10, 10);
    x.fillRect(2, 14, 12, 3);
    x.fillStyle = dark;
    x.fillRect(1, 17, 14, 2);
    x.fillRect(2, 19, 12, 1);
    x.fillStyle = light;
    x.fillRect(3, 5, 1, 11);
    x.fillStyle = dark;
    x.fillRect(12, 5, 1, 11);
    x.fillStyle = en;
    x.fillRect(6, 6, 4, 1);
    x.fillRect(5, 9, 6, 1);
    x.fillRect(6, 12, 4, 1);
    tombstoneCanvas = c;
  }
  return tombstoneCanvas;
}

/** DropTombstone 款式选择 → 原版 style（0-10） */
function pickStyle(coinsOwned: number): number {
  const roll = Math.floor(Math.random() * 6); // Main.rand.Next(6)
  let type: number;
  if (coinsOwned <= 100000) {
    type = roll !== 0 ? 200 + roll : 43;
  } else {
    type = 527 + Math.floor(Math.random() * 5);
  }
  // Projectile.cs:23696-23700 的 type→style 换算
  if (type === 43) return 0;
  if (type >= 201 && type <= 205) return type - 200;
  return type - 527 + 6; // 527-531 → 6-10
}

/** 原版长日期（en: "MMMM d, yyy"；zh culture: ToLongDate） */
function longDate(): string {
  return new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export class Tombstone extends Entity {
  w = 14; h = 14;
  angle = 0;             // 翻滚角（aiStyle17：rotation += vx*0.1，落地随摩擦冻结）
  /** 原版墓碑样式 0-10（Tiles_85 的 2×2 样式块起点列 = style*2） */
  style = 0;
  /** 碑文（原版 miscText = 死亡文本 + "\n" + 日期；安放时写入 world.signs） */
  readonly epitaph: string;
  /** 落格安放的墓碑 tile 左上角（安放成功后有效；渲染/交互用） */
  placedAt: { x: number; y: number } | null = null;
  /** DropTombstone damage（:39429-39433）：非 FTW 0（三伤害面早退）/ FTW 70 */
  dmg = 0;
  /** DropTombstone knockBack（num3,NewProjectile 第 8 参覆写 SetDefaults 12f） */
  knockBack = 0;
  /** per-enemy 免疫镜（NPC.immune[owner] 10t 等价;AshBallProj 同制） */
  private immunities = new Map<number, number>();

  // ---- ★通用湿段（Projectile.cs:16895-17113 全体弹共用段;2026-09-06 杂项弹簇批）----
  //  逐 id 豁免核对（SetDefaults P.cs 逐块）：43(:1260-1272)/201-205(:2874-2898 逐块)/
  //  527-531(:5973-5986 共档)——【均无 ignoreWater 行】= 全受段（props 桶实体;
  //  豁免分流由 ignoreWater 参数按 projId 数据面自动承载）。FTW 伤害面与本段正交。
  //  阻尼适用：aiStyle 17 tileCollide 缺省 true → HandleMovement :17721 湿支生效,
  //  乘进 moveAndCollide 入参（速度场不减,契约见 projWetSection 头）。
  //  位序：AI(摩擦/翻滚/重力,只写 velocity) → 湿段 → moveAndCollide = 原版 Update
  //  同序;采样位=上拍位移后 ≡ 原版湿段采样。杀拍口径：本类唯一杀位=落格安放
  //  （:25663-25689,在湿段【后】）→ 湿段逐拍恒跑,双调用点机不适用。
  //  登记残差：本仓判定盒 14×14 vs 原版 SetDefaults 24×24（:2877-2878）——溅花
  //  弹面盒 (w+12,24) 随判定盒窄 10px（盒尺寸差=既有面,非本批引入,不动码）。
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗（Projectile.wetCount :16984 置 10 / :17109-17112 逐拍 −1） */
  wetCount = 0;
  /** 出生预置已做（一次;NewProjectile :10886-10893 等价;共享体首调自做） */
  presetDone = false;

  constructor(x: number, y: number, coinsOwned: number, deathText: string, hitDirection: number,
    /** FTW（getGoodWorld）伤害面：damage 70 / knockBack 10 / 弹速 ×1.5
     *  （DropTombstone :39429-39439；SetDefaults :1260-1271 friendly+hostile） */
    getGood = false) {
    super();
    this.style = pickStyle(coinsOwned);
    this.epitaph = `${deathText}\n${longDate()}`;
    // DropTombstone L38446-38449：随机游走修正直到 |num|≥2（范围 ±3.5）
    let num = (Math.floor(Math.random() * 71) - 35) * 0.1;
    while (num < 2 && num > -2) num += (Math.floor(Math.random() * 61) - 30) * 0.1;
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    // :39437-39439 非 FTW 抛射 / :39440-39442 getGood 分支 ×1.5
    const mul = getGood ? 1.5 : 1;
    this.vx = ((Math.floor(Math.random() * 21) + 10) * 0.1 * hitDirection + num) * mul;
    this.vy = (Math.floor(Math.random() * 21) - 40) * 0.1 * mul; // -2 .. -4 上抛
    this.dmg = getGood ? 70 : 0;      // :39430-39433（damage=0 → 三伤害面全早退）
    this.knockBack = getGood ? 10 : 0; // num3（:39431-39433;NewProjectile 第 8 参覆写 12f）
  }

  /** 墓碑弹型（ProjectileID.IsAGravestone 域：ProjectileID.cs:29）——style 反查
   *  （:25681-25687 的正映射逆运算）：0→43、1-5→201-205、6-10→527-531 */
  get projId(): number {
    if (this.style === 0) return 43;
    if (this.style <= 5) return 200 + this.style;
    return 522 + this.style;
  }

  fixedUpdate(dt: number, game: GameHooks) {
    // aiStyle17（Projectile.cs:25636-25646）：落地摩擦 → 翻滚 → 重力
    if (this.vy === 0) this.vx *= 0.98;
    this.angle += this.vx * 0.1;
    // aiStyle17 专用重力 0.2/帧（Projectile.cs:25641，非全局 GRAVITY 0.36）
    this.vy = Math.min(this.vy + 0.2, MAX_FALL_SPEED);
    // ---- ★通用湿段（:16895-17113,共享体）——AI 后/位移前 = 原版 Update 同序;
    //  溅花尘/音由共享体 wetSplashStepShared 承载（水中墓碑入水/出水各溅 10 粒）;
    //  IsDestroyedByWater 域不含墓碑族（{85,15,188,34,1097,1106}）→ hooks 不接。
    projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
      this.projId, !!projectileData(this.projId)?.ignoreWater);
    // 水中位移阻尼（HandleMovement :17721-17764 + UpdatePosition :20561 `if (wet)
    // position += wetVelocity`）——moveAndCollide 契约：阻尼乘进 dx/dy 入参,
    // 速度场 vx/vy 不减（干态档=1 恒等）
    const df = projWaterDragFactor(this);
    moveAndCollide(this, game.world, this.vx * df, this.vy * df);
    // FTW 伤害面（Projectile.Damage :12549-12580 → PVE/PVP/EVP；dmg=0 非 FTW 全早退）。
    // 序 = 位置积分后、落格安放判定前——原版 Damage 在 Update 尾（积分后）恒跑，
    // 安放 Kill 在下拍 AI 头，落地拍照常结算接触
    if (this.dmg > 0) this.applyDamage(game);
    // 落格检查（:25663-25689）：底缘中心下方格可放墓碑 → 放置 + 碑文 + 消失
    const bx = Math.floor((this.x + this.w / 2) / 16);
    const by = Math.floor((this.y + this.h - 4) / 16); // 脚下贴地的行
    const top = by - 1;                                 // 2×2 物件顶行（底行与脚对齐）
    if (this.tryPlace(game, bx, top)) {
      this.dead = true;
      return;
    }
    void dt;
  }

  /** FTW 伤害面三通道（SetDefaults :1260-1271 FTW 支 friendly=true+hostile=true →
   *  Projectile.Damage :12549-12580 全开）：
   *  ① Damage_PVE friendly 臂 → 敌怪（kb 方向 = projectile.direction = sign(vx)）；
   *  ② hostile & friendly 臂（:12631 flag2 = victim.friendly && !dontTakeDamageFromHostiles）
   *     → 城镇 NPC（:12633 `(!friendly || !flag…) && !(hostile & flag2)` 双半开门——
   *     FTW 墓碑对镇民恒过门,不经巫毒娃娃窄门）+ 击杀归因 OnKillNPC → 成就 36；
   *  ③ Damage_EVP（:14846 hostile && damage>0 && netMode≠2）→ 本地玩家（hitPlayer
   *     = EVP 镜像:iframes/SkipDamage_EVP/DamageVar/难度乘区）。
   *  小动物照杀（:20675 面,hitCritters）。联机 PvP 面（Damage_PVP）不接（备案）。
   *  免疫镜 = per-enemy 10t（NPC.immune[owner] 等价,Projectile.cs:12651 门;AshBallProj
   *  同制）;墓碑 penetrate=-1 穿透不消失,持续翻滚。 */
  private applyDamage(game: GameHooks): void {
    for (const [id, t] of [...this.immunities]) {
      if (t <= 1) this.immunities.delete(id); else this.immunities.set(id, t - 1);
    }
    const dir = this.vx >= 0 ? 1 : -1;   // projectile.direction（NewProjectile 速度符）
    const kb = this.knockBack * dir;
    for (const raw of game.enemies() as Array<Record<string, unknown>>) {
      const e = raw as unknown as {
        id: number; dead?: boolean; friendly?: boolean; immortal?: boolean; dontTakeDamage?: boolean;
        x: number; y: number; w: number; h: number;
        hurt?: (dmg: number, kbx: number, kby: number, game: unknown) => boolean | void;
      };
      if (!e || e.dead || e.friendly || e.immortal || e.dontTakeDamage) continue;
      if ((this.immunities.get(e.id) ?? 0) > 0) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      this.immunities.set(e.id, 10);
      e.hurt?.(this.dmg, kb, 0, game);
    }
    // 城镇 NPC（hostile 臂恒过门）+ 击杀归因（:13702-13706 DidNPCDie → OnKillNPC
    // :20623-20636 IsAGravestone && townNPC → NotifyProgressionEvent(36) GRAVE_MISTAKE;
    // 单人 Main.myPlayer==whoAmI 恒真 = :20624 门）
    hitTownNpcs(this, game, this.dmg, kb, 'hostile', this.projId, undefined, () => {
      game.achievements?.notifyProgressionEvent(36);
    });
    hitCritters(this, game);
    hitPlayer(this, game, this.dmg);
  }

  /** TileObject.CanPlace(85) 近似：2×2 全空 + 底下两格实心支撑 */
  private tryPlace(game: GameHooks, x: number, y: number): boolean {
    const st = game.world.store;
    const tid = TILE_BY_KEY['tombstone_v'];
    if (tid === undefined) return false;
    if (x < 1 || y < 1 || x + 1 >= st.w || y + 2 >= st.h) return false;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        if (st.isActive(x + dx, y + dy)) return false;
      }
    }
    if (!st.isSolid(x, y + 2) || !st.isSolid(x + 1, y + 2)) return false;
    // 放置（TileObject.Place 帧语义：frameX = style*36 + dx*18，frameY = dy*18）
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        st.setTile(x + dx, y + dy, tid, this.style * 36 + dx * 18, dy * 18);
      }
    }
    this.placedAt = { x, y };
    game.world.signs.push({ x, y, text: this.epitaph });
    game.playSfx('dig');
    return true;
  }

  draw() { /* Renderer 统一绘制 */ }
}
