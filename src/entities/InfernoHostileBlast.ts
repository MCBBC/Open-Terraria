// 292 InfernoHostileBlast（地狱火叉爆区，敌侧；原版权威 Projectile.cs 1457）：
//   SetDefaults :3817-3826 —— 130×130、aiStyle50、hostile、magic、alpha=255、
//   tileCollide=false、penetrate=-1（无 timeLeft 行 → 默认 3600，AI 侧先杀）。
//   AI（aiStyle50 通用支 :28782-28823，type 291/295 早退后的落地段）：
//     · localAI[0]==0 → SoundID.Item74 一次 + localAI[0]++（:28782-28786）
//     · ai[0]++ 每拍（:28787；type296 的 +3 加成与 ×0.7 尘量折减对本型不适用）
//     · num361=25；`if (ai[0] > 540) num361 -= (ai[0]-180)/2`（:28792-28796）——
//       ai[0]=541 时 25-180.5<0 → Kill（:28797-28800）。故存续 = 541 拍 ≈9.0s
//       （原式 540/180 两常数不对称是原版本相，非笔误——按 1457 字节码逐行承载）
//     · 每拍 25×d174 火焰柱（:28806-28823）：方向 Next(-10,11)² + 步幅 Next(3,9)
//       归一外发、出生位 = Center+Next(-10,11)²、scale1.5、noGravity、alpha100
//   接触伤害：hostile 盒对玩家 Damage_EVP 常规链（player.immune 门内每拍重判，
//   穿透不消耗=持续灼烧区）；On Fire(24) 60×Next(8,16) 由 statusPlayer 表
//   （vanilla-statusplayer.json 292 键 ← Projectile.cs:12337-12340）承载。
//   Kill：无专属段（全 Kill 检索无 type==292 分支）→ 静默消亡。
// 生成源：291 InfernoHostileBolt Kill 原位 spawn（Projectile.cs:75802-75807，
//   同 damage/kb）→ 本类由 Dart.inferno291Kill 构造入 'projectiles' 桶。
import { Entity } from './Entity';
import { hitPlayer, statusPlayer } from './projTargets';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

/** 292 存续拍数：ai[0] 首个 >540 的值 = 541（:28793 门 + :28787 先增后判） */
export const INFERNO_BLAST_LIFETIME = 541;

export class InfernoHostileBlast extends Entity {
  w = 130; h = 130;                        // SetDefaults :3819-3820
  vx = 0; vy = 0;                          // NewProjectile 速度 (0,0)（:75806）
  damage: number;
  hostile = true;                          // SetDefaults :3822（伤玩家）
  dead = false;
  /** ai[0] 年龄（:28787 每拍 +1；>540 → num361≤0 → Kill） */
  age = 0;
  /** localAI[0] 单次音门（Item74 :28782-28786） */
  private sounded = false;

  // ★刻意不设 projId 字段：联机快照收集器按 `projId !== undefined` 归 kind1（武器族
  //  弹幕）→ 访客端会重建成回旋镖伪弹；无 projId → kind<0 → 不同步（渲染缺类），
  //  与"未知弹幕类不同步"通道一致（Game.broadcast/快照双面）。292 的生成权在房主
  //  端 291 Kill 链内，访客缺口登记（同 Dart 直构子弹族 129/596 的既有口径）。
  // ★minion=true 仅借 Entity 收口 CutTiles 排除门（EntityManager.update 唯一消费
  //  位）：原版 CanCutTiles（Projectile.cs:15407）只对 friendly 弹跑 CutTiles，
  //  292 为 hostile 不砍地形；本仓中央收口无 friendly 门，130×130 盒每拍上报会
  //  误碎爆区内陶罐/草。本仓 minion 旗无召唤槽计数消费面（按类 instanceof 计数），
  //  借旗规避为最小侵入——若未来收口补 friendly 门可摘除。
  minion = true;

  constructor(cx: number, cy: number, damage: number) {
    super();
    this.x = cx - this.w / 2;              // Center 锚定（:75806 传 Center.X/Y）
    this.y = cy - this.h / 2;
    this.damage = damage;                  // 291 原 damage 直传（:75806）
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }   // 傀儡不本地模拟（未同步面）
    // Item74 单次（:28782-28786）
    if (!this.sounded) {
      this.sounded = true;
      game.playSfxFiles?.(['Item_74'], 1, this.cx, this.cy);
    }
    this.age++;                                             // ai[0]++（:28787）
    if (this.age >= INFERNO_BLAST_LIFETIME) { this.dead = true; return; }   // :28792-28800
    // ---- 25×d174 火焰柱（:28806-28823）----
    //  原式：NewDust(盒,174,0,0,100,default,1.5) 后逐尘覆写 position=Center+Next(-10,11)
    //  与 velocity=归一向——本仓 spawnDust 同式出生后覆写（掠过 NewDust 随机 ±2 掺速）
    const cx = this.cx, cy = this.cy;
    for (let i = 0; i < 25; i++) {
      let dx = Math.floor(Math.random() * 21) - 10;         // Next(-10,11)
      let dy = Math.floor(Math.random() * 21) - 10;
      const spd = 3 + Math.floor(Math.random() * 6);        // Next(3,9)=3..8
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len <= 0) continue;                               // 双零掷=原版 NaN 尘（1/441）→ 跳过登记
      const k = spd / len;
      dx *= k; dy *= k;
      const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 174, 0, 0, 100, null, 1.5, true);
      if (d) {
        d.x = cx + Math.floor(Math.random() * 21) - 10;     // 出生位独立双掷（:28817-28820）
        d.y = cy + Math.floor(Math.random() * 21) - 10;
        d.vx = dx; d.vy = dy;                               // velocity 直写（:28821-28822）
      }
    }
    // ---- 接触伤害（Damage_EVP 常规链；player.immune 门在 hitPlayer 内，命中不
    //      消耗穿透=灼烧区持续重判）+ On Fire 表（:12337-12340）----
    if (!game.player.dead && hitPlayer(this, game, this.damage)) {
      statusPlayer(game, 292);
    }
  }

  /** 本体恒隐：alpha=255（SetDefaults :3823）→ GetAlpha A=0；贴图 Projectile_292
   *  为官方空桩（68B 全零），可视面全在 d174 尘（fixedUpdate 直生） */
  draw(_r: Renderer, _cam: Camera): void {}
}
