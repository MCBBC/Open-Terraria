// 夜间坠星（WorldGen.SpawnFallingObjects :71861-71898 → 弹幕 720 Spawner →
// AI_148 :50191-50225 弹幕 12 FallingStar）1:1：
//   生成：仅夜（非 remix）、X 列 100..maxTilesX-51、Y 顶部 maxTilesY×5% 内；
//         运气定向（FindClosest + RollLuck(15)==0 → 玩家 ±640px，ai[1] 记玩家）；
//         初速 = (Next(-100,101), Next(200)+100) 归一化到恒速 12px/tick（无重力）。
//   Spawner 期 180 tick（ai[0]+=dayRate；定向时 X 向玩家 ×0.35）后转正星。
//   正星（aiStyle 5）：撞实心即 Kill；白天+自然星（damage>500）Kill 不掉落；
//         每 20+Next(40) tick 播 SoundID.Item9。
//   落地（Kill :75593 掉落 + :77259-77323 type12 特效支）：自然星掉落 Item 75
//         坠落之星 ×1；SoundID.Item10 + 尘 58×7 + 尘 278×8 CornflowerBlue 环 +
//         尘 278×4 Gold 环 + 屏门 gore 16/17×7。
// ★G′ 对抗补刀批（2026-09-02）：T1 对敌伤害面（SetDefaults :926-940 friendly/
//         penetrate=-1；AI_148 临盆 NewProjectile :54059 damage=1000/kb 10f/
//         owner=Main.myPlayer → 穿行即伤怪,e.iframes 10t 去重 + GC1 桥写,命中不
//         消亡——唯一死亡路径=撞地/白天/越界）；T2 贴图 Projectile_9 → Projectile_12
//         （金星,两 PNG 同 22×24）；T3 α 振荡 0..200 ±25（:24179-24196,SetDefaults
//         :937 alpha=50 起步）+ GA=(255−α)/255 + lightRGB 0.9×[0.9,0.8,0.1]
//         （AI :24235 light=0.9 覆写 × ProjLight 乘区,同 Arrow 955||12 支）+ 滚转
//         (|vx|+|vy|)×0.01×direction（:24203 else 支,替换旧"对齐速度向"）+ 飞行
//         尾迹 1/20 尘 58 + 屏门 1/6 gore（:24226-24239,替换旧 0.5/t 近似）。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import { GorePiece } from './GorePiece';
import { applyBannerDamageDealt, noteVanillaProjImmune, playerCanHitEnemy } from './projTargets';
import type { GameHooks } from './types';

/** 弹 12 数据面（AI_148 星临盆 NewProjectile :54059 实参）：damage=1000（natural 星
 *  专值——白天 Kill 门 :24092 `damage == 1000` 印证）/ knockBack=10f /
 *  owner=Main.myPlayer（击退方向 = projectile.direction,vx=0 归 1） */
const STAR_DAMAGE = 1000;
const STAR_KB = 10;

export class FallingStar extends Entity {
  w = 18; h = 18;
  dead = false;
  /** 自然星标记（原版 damage>500；武器星不掉落品/白天不清除） */
  natural: boolean;
  /** 运气定向玩家（原版 ai[1]>-1：X 向玩家衰减追踪） */
  private homing = false;
  /** Spawner 阶段剩余 tick（原版 ai[0] 180 后转正星） */
  private warmup: number;
  private soundT = 0;
  private nextSound: number;
  // ---- ★G′ 补刀批（2026-09-02）视觉/数据对齐位 ----
  /** 弹体点光自报（AI_005 type12 支 :24235 `light = 0.9f` 覆写 SetDefaults 1.0 ×
   *  ProjLight 乘区 [0.9,0.8,0.1] = [0.81,0.72,0.09]，与 Arrow 955||12 支同值）。
   *  消费 = Game 实体光扫（Game.ts:8610 projectiles 桶读 lightRGB）；ProjLight 主
   *  循环（Game.ts:8479）对无 projId 实体跳过 → 无双重注入。Spawner（type 720
   *  SetDefaults 无 light 行）不发光 → warmup 期不写。 */
  lightRGB: [number, number, number] | null = null;
  /** 原版 Projectile.alpha（SetDefaults :937 =50；AI_005 缺省支 :24179-24196 每拍
   *  ±25 振荡、域 0..200）——draw 侧 GA=(255−α)/255 消费（1.0..0.216 闪烁面） */
  private alpha = 50;
  /** 振荡方向（原版 localAI[0]，1 起步 = 变透明方向先行；>200 翻 -1 / <0 翻 1） */
  private twinkleDir = 1;
  /** 滚转角（AI_005 :24203 else 支 rotation += (|vx|+|vy|)×0.01×direction 累积直绘；
   *  type 12 不属 503/1037/1049 的"对齐速度向"族，替换旧 atan2−π/2 画法） */
  private rot = 0;

  constructor(x: number, y: number, vx: number, vy: number, warmup: number, homing: boolean, natural: boolean) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.warmup = warmup;
    this.homing = homing;
    this.natural = natural;
    this.soundT = 0;
    this.nextSound = 20 + Math.floor(Math.random() * 40);
  }

  /** 出生点校验（原版 Collision.SolidCollision 门 :71887） */
  static canSpawnAt(st: GameHooks['world']['store'], x: number, y: number): boolean {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return st.inBounds(tx, ty) && !st.isSolid(tx, ty);
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    const w = game.world;
    // 白天清除（Spawner :50193 / 正星 :22141——仅自然星）
    if (w.clock.isDay) {
      if (this.natural || this.warmup > 0) { this.dead = true; return; }
    }
    if (this.warmup > 0) {
      // AI_148 Spawner 期：ai[0]+=dayRate；180 后定向时 velocity.X *= 0.35 再按玩家方向
      this.warmup--;
      if (this.warmup === 0) {
        if (this.homing) {
          const p = game.player;
          this.vx = Math.sign(p.cx - this.cx) * Math.abs(this.vx) * 0.35;
          if (this.vx === 0) this.vx = 0.1;
        }
      }
      return; // 悬停期不移动（原版 Spawner tileCollide=false 定点）
    }
    // ---- ★G′ T3：正星期每 tick AI 视觉段（AI() 先于 Update 内 HandleMovement——
    //      P.cs:16880 AI() → :17120 HandleMovement,故本段取 pre-move 位）----
    // ②光自报：AI :24235 light=0.9 × ProjLight [0.9,0.8,0.1]（Spawner 期无光）
    this.lightRGB = [0.81, 0.72, 0.09];
    // ①α 振荡（缺省支 :24179-24196：±25/拍,>200 翻向 / <0 翻向——α 恰 0 不翻,
    //   与 Arrow 955||12 支的 `<= 0` 翻相差一拍,此处按原版逐字）
    this.alpha += 25 * this.twinkleDir;
    if (this.alpha > 200) { this.alpha = 200; this.twinkleDir = -1; }
    if (this.alpha < 0) { this.alpha = 0; this.twinkleDir = 1; }
    // ③滚转（:24203 else 支）：type 12 不属 503/1037/1049 对齐速向族;direction
    //   每 tick 复评（Update :17121 AutomaticallyChangesDirection 含 aiStyle5,
    //   vx==0 → 1）
    this.rot += (Math.abs(this.vx) + Math.abs(this.vy)) * 0.01 * (this.vx < 0 ? -1 : 1);
    // 恒速直线下落（aiStyle 5 无重力）+ 落点碰撞
    const nx = this.x + this.vx, ny = this.y + this.vy;
    const tx = Math.floor((nx + this.w / 2) / TILE), ty = Math.floor((ny + this.h) / TILE);
    const st = w.store;
    if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) {
      // 落地 Kill（:75593 掉落 + :77259-77323 type12 特效支）
      this.dead = true;
      if (this.natural) {
        game.spawnDrop(this.cx - 8, this.y - 4, 'vi_75_fallen_star', 1, 0, -2);
      }
      // ★G′ T4：Kill 12 特效逐项（Projectile.cs:77259-77323；替换旧 spawnParticles/
      //  spawnBurst 近似——原版为 VanillaDust 池尘 + Gore 火苗,非编排粒子）
      game.playSfxFiles(['Item_10'], 0.8, this.cx, this.cy);            // SoundID.Item10 :77261
      for (let i = 0; i < 7; i++) {                                     // 7×d58 :77270-77273
        game.spawnDust?.(this.x, this.y, this.w, this.h, 58,
          this.vx * 0.1, this.vy * 0.1, 150, null, 0.8);
      }
      for (let i = 0; i < 8; i++) {                                     // CornflowerBlue 环 :77274-77277
        // NewDustPerfect(Center, 278, UnitY.RotatedBy(i·2π+rand·0.5)×(4+rand·4), 150,
        // CornflowerBlue(100,149,237)).noGravity——perfect 通道消解 NewDust 盒抖动,
        // 位=弹心、速=定向环速原样入池
        const a8 = i * (Math.PI * 2) / 8 + Math.random() * 0.5;
        const sp8 = 4 + Math.random() * 4;
        game.spawnDust?.(this.cx, this.cy, 0, 0, 278,
          -Math.sin(a8) * sp8, Math.cos(a8) * sp8, 150,
          { r: 100, g: 149, b: 237, a: 255 }, 1, true, true);
      }
      for (let i = 0; i < 4; i++) {                                     // Gold 环 :77278-77281（曾整缺）
        // NewDustPerfect(Center, 278, UnitY.RotatedBy(i·2π+rand·0.5)×(2+rand·3), 150,
        // Color.Gold(255,215,0)).noGravity——半速内环
        const a4 = i * (Math.PI * 2) / 4 + Math.random() * 0.5;
        const sp4 = 2 + Math.random() * 3;
        game.spawnDust?.(this.cx, this.cy, 0, 0, 278,
          -Math.sin(a4) * sp4, Math.cos(a4) * sp4, 150,
          { r: 255, g: 215, b: 0, a: 255 }, 1, true, true);
      }
      if (this.onScreen(game)) {                                        // 屏门 :77282-77289
        for (let i = 0; i < 7; i++) {
          // Gore.NewGore(position, NextVector2CircularEdge(0.5,0.5)×velocity.Length(),
          // SelectRandom(16,17×7))——圆缘半径 0.5×|v|=6 定向,newGore 非 perfect 保
          // 原版 NewGore 尾部扰动（Gore.cs:1347-1348,vy−=[1,3]/vx±[−2,2]）
          const ga = Math.random() * Math.PI * 2;
          const gv = 0.5 * Math.hypot(this.vx, this.vy);
          GorePiece.newGore(Math.random() < 0.25 ? 16 : 17, this.x, this.y,
            Math.cos(ga) * gv, Math.sin(ga) * gv);
        }
      }
      return;
    }
    this.x = nx; this.y = ny;
    // ★G′ T3：飞行尾迹 1:1（AI_005 type12 支 :24226-24239,替换旧 0.5/t spawnParticles
    //  近似）——1/20 尘 58（v×0.5,α150,scale1.2）+ 屏内 1/6 gore 16/17(1:3, v×0.2)。
    //  （十周年变体 :24229-24232/:24236 HotPink/1/15 未接,随 Arrow 955||12 支同账登记）
    if (Math.floor(Math.random() * 20) === 0) {
      game.spawnDust?.(this.x, this.y, this.w, this.h, 58, this.vx * 0.5, this.vy * 0.5, 150, null, 1.2);
    }
    if (Math.floor(Math.random() * 6) === 0 && this.onScreen(game)) {
      GorePiece.newGore(Math.random() < 0.25 ? 16 : 17, this.x, this.y, this.vx * 0.2, this.vy * 0.2);
    }
    // ★G′ T1：对敌伤害面（原版 Damage() 于 Update :17184 位移后结算）——SetDefaults
    //  :926-940 friendly=true / penetrate=-1,AI_148 临盆 :54059 damage=1000/kb 10f/
    //  owner=Main.myPlayer → 穿行即伤怪。命中【不消亡】（penetrate=-1,唯一死亡路径
    //  =撞地/白天/越界）;去重 = NPC.immune[owner] 语义:e.iframes（Enemy.hurt 头门
    //  :12752 pierce!==1 档,写 10t :13013）+ GC1 桥写 noteVanillaProjImmune（近战域
    //  表,Arrow/TrapShot 同款;crit=false = 原版面——弹 12 无近战/远程/魔法位,
    //  Damage :12909-12927 三掷支全不受理）。friendly NPC 免伤门同陷阱弹先例。
    //  小动物/城镇 NPC 不在 game.enemies() 桶 → 不入判定（本仓 friendly 弹同口径,
    //  登记残差;原版 trap=true 位 :939 的 critter 复权语义随之不涉）。
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;      // Damage_PVE_Inner :11892 friendly NPC 门
      const e = ent as unknown as {
        id: number; x: number; y: number; w: number; h: number; dead: boolean;
        hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean,
          pierce?: number, fromPlayer?: boolean) => boolean;
      };
      if (e.dead) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x
        && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      // 击退 = kb 10 × direction（vx 符号,0→1;Damage :13652 num40=direction 同源）
      const hurtOk = e.hurt(applyBannerDamageDealt(game, e, STAR_DAMAGE),
        (this.vx < 0 ? -1 : 1) * STAR_KB, 0, game, 0, false, -1, true);
      // Damage 尾梯（:14180-14183,pen≠1 档）写 immune[owner]=10——仅实扣跳写
      // （iframes 头门拒收跳原版不达尾梯）
      if (hurtOk) noteVanillaProjImmune(game, 12, e.id);
    }
    // 周期音效（AI :24132-24136 soundDelay 20+rand(40) 播 Item9）
    if (++this.soundT >= this.nextSound) {
      this.soundT = 0;
      this.nextSound = 20 + Math.floor(Math.random() * 40);
      game.playSfxFiles(['Item_9'], 0.5, this.cx, this.cy);
    }
    if (!st.inBounds(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) this.dead = true;
  }

  /** 屏门（AI :24226 / Kill :77283——Hitbox ∩ 屏幕矩形外扩 200px 半径）。本仓无相机
   *  钩,以 screenWorldSize 视口 + 玩家中心近似 Main.screenPosition（单机屏随玩家,
   *  Enemy.ts:2700 同口径先例;≤ 半格取整差登记） */
  private onScreen(game: GameHooks): boolean {
    const scr = game.screenWorldSize?.() ?? { w: 1920, h: 1080 };
    const p = game.player;
    return Math.abs(this.cx - p.cx) < scr.w / 2 + 200 + this.w / 2
      && Math.abs(this.cy - p.cy) < scr.h / 2 + 200 + this.h / 2;
  }

  draw(r: import('../render/Renderer').Renderer): void {
    if (this.warmup > 0) return; // Spawner 隐形（type 720 alpha=255 → GA=0）
    const ctx = r.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    // ★G′ T3③：滚转累积角直绘（AI_005 :24203 else 支,原版 Draw 无 π/2 补偿——
    //  替换旧 atan2−π/2"对齐速度向"画法）
    ctx.rotate(this.rot);
    // ★G′ T3①：GA 面 = (255−α)/255（Arrow 域 GA 兜底同式;本实体自绘面在此实现。
    //  α 振荡 0..200 → 1.0..0.216 闪烁;Spawner 期已由头部早退承载）
    ctx.globalAlpha = Math.max(0, (255 - this.alpha) / 255);
    // ★G′ T2：原版贴图 Projectile_12.png（金星,type 12 FallingStar;曾误用
    //  Projectile_9.png——两 PNG 同 22×24 单帧,直接换轨）
    const img = r.atlas?.ensureVImage?.('vanilla/Projectile_12.png') ?? null;
    if (img) {
      ctx.drawImage(img, -11, -12, 22, 24);
      ctx.restore();
      return;
    }
    // 星形：四角星简形（贴图缺失时程序兜底）
    ctx.fillStyle = this.natural ? '#FFF7D8' : '#D8E8FF';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(2.5, -2.5);
    ctx.lineTo(9, 0);
    ctx.lineTo(2.5, 2.5);
    ctx.lineTo(0, 9);
    ctx.lineTo(-2.5, 2.5);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-2.5, -2.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** Star.NightSetup（Star.cs:41-60）：每夜重掷 starfallBoost——
 *  10% → 3.0-5.0（流星夜）；余 1/3 → 1.0-1.5（弱流星夜）；其余 1.0。
 *  十周年世界阈值 1/5 与 1/2（:46-50）。 */
export function nightStarfallBoost(anniversary: boolean): number {
  const a = anniversary ? 1 / 5 : 1 / 10;
  const b = anniversary ? 1 / 2 : 1 / 3;
  if (Math.random() < a) return (300 + Math.floor(Math.random() * 201)) * 0.01;
  if (Math.random() < b) return (100 + Math.floor(Math.random() * 51)) * 0.01;
  return 1.0;
}
