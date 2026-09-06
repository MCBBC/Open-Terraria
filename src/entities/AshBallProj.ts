// 灰烬崩塌弹 40（ProjectileID.AshBallFalling）——FTW 灰烬连锁的伴生弹（WorldGen.cs
// :64297-64298 NewProjectile(邻格中心, vy=0.41, type 40, damage 15, knockBack 0)，
// 连锁侧接线在 Game.ts breakTile 灰烬支）。最近邻同型 = DirtBallProj（同 aiStyle 10
// 下落弹族），本文件按其形制 1:1 建最小实体。
//
// SetDefaults（Projectile.cs:1229-1237）：knockBack 6（NewProjectile 第 8 参 0f 覆写
// → 终值 0）+ 10×10 + aiStyle 10 + friendly=true + hostile=true + penetrate=-1；
// timeLeft 不覆写 = SetDefaults 头缺省 3600（Projectile.cs:789）。
//
// AI_010（Projectile.cs:58809-59083）type 40 通道逐项：
//   · 飞行尘（:58854-58861,type==40 支）：Next(2)==0 → Dust.NewDust(box,36,0f,vy/2)
//     后 dust.velocity *= 0.4——每 tick 恒评估
//   · tileCollide 每 tick 先置真（:58934）；首拍 owner 块（:58937-58980）：type 40
//     被 channel 支【显式排除】（`… && type != 40`）→ else 支 ai[0]=1（:58974-58978），
//     首拍 tileCollide=false（无清格/无碰撞），但重力判据在其后（:58999 `ai[0]==1f`）
//     → 首拍即吃 vy += 0.41（DirtBallProj 断链拍同款时序）
//   · 重力（:58999-59002）：ai[0]==1 → vy += 0.41/tick；旋转/封顶（:59075-59082 非
//     736-738 支）：rotation += 0.1、vy>10 → 10
//   · 沿途清植物/削坡（:59021-59054,owner==myPlayer && tileCollide）：盒内格
//     {185-187,165,12,665,639,105,178} → KillTile（无 noItem=照常掉落）；
//     topSlope(1|2) && 非平台 → SlopeTile + position.Y -= 16
//   · 撞格 → HandleMovement 通用 else `position += velocity; Kill()`（:19964）——
//     type 40 在碰撞响应链无特判支（19408-19964 全链无 type==40 落点）
// Kill（Projectile.cs:71752 起,音尘链头 :75447 无外门=任何死因恒跑）：
//   · 音尘（:77878-77886）：PlaySound(0)（dig）+ 5×尘 36（velocity *= 0.6）
//   · aiStyle10 亡格铺设段（:79107-79311）：type 40 → num17=57（灰烬格）/num18=0
//     （:79187-79190）——落点=中心格（:79108-79109 int 整除），半砖上推
//     （:79227-79230 nactive+halfBrick+vy>0+|vy|>|vx| → 上一行），落点空且 !flag2
//     （下方 314 轨道/421·422/BlockBelowMakesSandFall :79249-79271）→ PlaceTile(57,
//     forced:true)（:79276）+下方半砖/坡复原（:79280-79287）；被占/被拦 → num18=0
//     → 无掉落（:79292/:79298 else-if num18>0 两支均不成立）=灰烬弹落地要么补回
//     灰烬格要么消失，永不掉物品
//   · 落点/爆心锚用上一 tick 未嵌入位（prevX/prevY,SW-L1 F1 同口径——本仓无盒级
//     碰撞管线,kill 判定=中心格实心,直接用现位必 occupied;见 DirtBallProj 头注）。
//     ★平台/家具顶（★M13 A-1/A-4 2026-09-04 清偿）：40 ∈
//     ProjectileID.Sets.FallingBlockDoesNotFallThroughPlatforms（ProjectileID.cs:295）
//     → flag6=false=TileCollision 不透平台（Projectile.cs:17653-17655）→ kill 判据
//     改 isSolid||isPlatform（FallingBlock 同族几何）,平台上/家具顶照接;半砖落面
//     =死亡格半砖格本身→occupied→Vanish（FallingBlock surfHalf 特支同款）
// 联机：不入 msg27 kind 表（netMakeProj 无档,同 DirtBallProj/RollingBoulder 惯例）——
// 房主侧连锁毁格+弹侧 PlaceTile 经 TileStore setTile 的 listeners/netReporter 通道
// 自然同步（脏区/联机格操作均走该口）,弹体本身对访客不可见（视觉面缺口,备案）。
// ★通用湿段接入（2026-09-06 溅花缺口杂项批）：40 走 SetDefaults :1229-1238
//   （knockBack 6/10×10/aiStyle10/friendly/hostile/penetrate −1）【无 ignoreWater 行】
//   → 受段（vanilla-projectiles.json 同向;姊妹弹 17 DirtBall 是 :993 true=豁免,两姊妹
//   异面勿混）。AI_010 无 wet 消费（:58809-59083 grep 实证）→ 溅花+旗维护即全部效果。
//   ★阻尼 N/A 定谳：aiStyle 10 在 HandleMovement 走专支 :17701-17720（TileCollision
//   直连,与 wet 阻尼支 :17718 互斥）→ 位移不折减;湿段采样位=AI 后位移前（上拍结算位）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projSprite } from './Arrow';
import { hitPlayer } from './projTargets';
import { projectileWetSection } from './projWetSection';
import { projectileData } from '../data/vanillaProjectiles';
import { dirtBallDepositTile } from './DirtBallProj';
import { TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../data/tiles';

export class AshBallProj extends Entity {
  w = 10; h = 10;                                  // SetDefaults :1231-1232
  dead = false;
  readonly projId = 40;                            // ProjectileID.AshBallFalling
  // ---- ★通用湿段旗（ProjWetFlags 同形;projectileWetSection 共享体逐值维护）----
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗（Projectile.wetCount :16984 置 10 / :17109-17112 逐子步折减） */
  wetCount = 0;
  /** 出生预置已做（NewProjectile :10886-10892 等价;共享体首调自做） */
  presetDone = false;
  /** NewProjectile 第 6 参（WorldGen.cs:64298）——damage 15 直传,不吃面板 */
  readonly dmg: number;
  /** timeLeft 缺省 3600（Projectile.cs:789 SetDefaults 头;type 40 无覆写） */
  private life = 3600;
  /** AI_010 ai[0]：0=首拍（tileCollide=false）→1=坠落实（:58974-58978 else 支） */
  private ai0 = 0;
  private rotation = 0;
  /** SW-L1 F1 同口径：上一 tick 积分前位（未嵌入）——Kill 爆心/铺设落点锚 */
  private prevX = 0;
  private prevY = 0;
  /** friendly 面 per-target 免疫镜（target.immune[owner]=10t 镜像;RollingBoulder 同款） */
  private immunities = new Map<number, number>();
  private readonly ashTileId: number;

  constructor(x: number, y: number, vx: number, vy: number, damage: number) {
    super();
    // NewProjectile（Projectile.cs:10871-10873）：position = 入参 − width/2（中心锚）
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.prevX = this.x;
    this.prevY = this.y;
    this.vx = vx;
    this.vy = vy;
    this.dmg = damage;
    this.ashTileId = TILE_INTERNAL_BY_SHEET.get(57) ?? -1;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // 寿终 Kill（Update 尾 timeLeft-- → Kill,Projectile.cs:17307-17312）——现位即
    // 未嵌入位（嵌入态在上一拍碰撞支已 Kill）→ 爆心=现位中心
    if (--this.life <= 0) { this.kill(game, this.x + this.w / 2, this.y + this.h / 2); return; }
    const st = game.world.store;
    // 飞行尘（:58854-58861）：Next(2)==0 → d36,speedY=vy/2,后全速 ×0.4
    if (Math.floor(Math.random() * 2) === 0) {
      const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 36, 0, this.vy / 2);
      if (d) { d.vx *= 0.4; d.vy *= 0.4; }
    }
    // tileCollide 每 tick 先置真（:58934）;首拍 owner 块（type 40 不入 channel 支）
    let tileCollide = true;
    if (this.ai0 === 0) {
      tileCollide = false;             // :58937 首拍免碰撞（无清格/无撞格）
      this.ai0 = 1;                    // :58974-58978 else 支（channel 支带 && type!=40）
    }
    if (this.ai0 === 1) {
      this.vy += 0.41;                 // :58999-59002 重力（首拍 ai0 已置 1 即吃）
    }
    if (tileCollide) {
      // 沿途清植物/削坡（:59021-59054）——KillTile 无 noItem=照常掉落
      const bx0 = Math.trunc(this.x / 16), bx1 = Math.trunc((this.x + this.w) / 16);
      const by0 = Math.trunc(this.y / 16), by1 = Math.trunc((this.y + this.h) / 16);
      for (let i = bx0; i <= bx1; i++) {
        for (let j = by0; j <= by1; j++) {
          if (!st.inBounds(i, j)) continue;
          const ti = st.idx(i, j);
          if ((st.flags[ti] & 1) === 0) continue;          // !tile.active()（:59031-59033）
          const sheet = TILE_DEFS[st.type[ti]]?.vanilla?.sheet ?? -1;
          if ((sheet >= 185 && sheet <= 187) || sheet === 165 || sheet === 12
            || sheet === 665 || sheet === 639 || sheet === 105 || sheet === 178) {
            game.breakTile?.(i, j);                        // WorldGen.KillTile(i,j)（:59036-59043）
          } else if ((st.slope[ti] === 1 || st.slope[ti] === 2) && !st.isPlatform(i, j)) {
            st.setSlope(i, j, 0);                          // WorldGen.SlopeTile(i,j)（:59045-59051）
            this.y -= 16;                                  // position.Y -= 16f（:59051）
          }
        }
      }
    }
    // ---- ★通用湿段（:16903-17113,共享体）——AI(:16880)→湿段(:16903)→HandleMovement
    //      (:17120,本类融合拍序=下方撞格 Kill 判定)→UpdatePosition(:20561)位序。
    //      采样位=AI 后位移前 = 上拍移动结算位（撞格 Kill 判定读同一未积分位,同原版
    //      HandleMovement 在湿段【后】撞停的取位——杀拍湿段照跑）。首拍（ai0=0,
    //      tileCollide=false）也照跑（原版同）→ 出生预置即此拍落位;aiStyle10 无湿
    //      阻尼（见头注定谳）
    projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
      this.projId, !!projectileData(this.projId)?.ignoreWater);
    if (tileCollide) {
      // tileCollide:落面 → Kill（爆心=上一 tick 未嵌入位,F1）。落面判据对齐 FallingBlock
      // 同族几何（★M13 A-1/A-4,2026-09-04）：isSolid||isPlatform——平台/家具顶
      // （tileSolidTop 底行 frameY==0）照接（Collision.cs:2330-2333 flag 门;40 ∈
      // FallingBlockDoesNotFallThroughPlatforms → flag6=false=落平台,
      // Projectile.cs:17653-17655,原"穿台继续坠"备案就此清偿）
      const cx = Math.floor((this.x + this.w / 2) / 16);
      const cy = Math.floor((this.y + this.h / 2) / 16);
      if (st.inBounds(cx, cy) && (st.isSolid(cx, cy) || st.isPlatform(cx, cy))) {
        // 半砖特支（FallingBlock surfHalf 同款）：盒底钳到半砖面顶（Collision.cs
        // :2350-2354 vector4.Y+=8）→ 钳位中心=面顶+3 ∈半砖格 → 死亡格=半砖格本身
        // (:79120-79121);:79243 上推支 velocity.Y 已被 TileCollision 清 0=死支
        // （R2' F2 同谳）→ num16 停在半砖格=active → outer else :79298 → type 40
        // num18=0 → 不铺不掉=Vanish。爆心锚改钳位中心（x 不动,y=面顶+8−h/2）
        const surfHalf = st.half[st.idx(cx, cy)] !== 0;
        const bx = surfHalf ? this.x + this.w / 2 : this.prevX + this.w / 2;
        const by = surfHalf ? cy * 16 + 8 - this.h / 2 : this.prevY + this.h / 2;
        this.kill(game, bx, by, surfHalf ? { tx: cx, ty: cy } : undefined);
        return;
      }
    }
    // :59075-59082（非 736-738 支恒达）——旋转 + vy 封顶 10
    // （原版此段在 AI_010 尾=湿段【前】;本仓融合拍序保留在撞格 Kill 判定后——
    //  rotation/vyCap 与湿段无交互,杀拍二者皆死端,无观感差,登记）
    this.rotation += 0.1;
    if (this.vy > 10) this.vy = 10;
    // F1 爆心回退锚：记录本拍积分前位（下一拍撞格 Kill 时作铺设/音尘爆心）
    this.prevX = this.x;
    this.prevY = this.y;
    this.x += this.vx;
    this.y += this.vy;

    // 双面接触伤害（SetDefaults friendly+hostile :1234-1235;RollingBoulder 同制）：
    // friendly → NPC（kb=0,knockBack 被 NewProjectile 第 8 参 0f 覆写）、hostile →
    // 玩家（hitPlayer 全管线=Damage_EVP 镜像：iframes 门/DamageVar/难度乘区+×2）
    for (const [id, t] of [...this.immunities]) {
      if (t <= 1) this.immunities.delete(id); else this.immunities.set(id, t - 1);
    }
    for (const raw of game.enemies() as Array<Record<string, unknown>>) {
      const e = raw as unknown as {
        id: number; dead?: boolean; friendly?: boolean; immortal?: boolean; dontTakeDamage?: boolean;
        x: number; y: number; w: number; h: number; cx: number; cy: number;
        hurt?: (dmg: number, kbx: number, kby: number, game: unknown) => boolean | void;
      };
      if (!e || e.dead || e.friendly || e.immortal || e.dontTakeDamage) continue;
      if ((this.immunities.get(e.id) ?? 0) > 0) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      this.immunities.set(e.id, 10);
      e.hurt?.(this.dmg, 0, 0, game);                      // kb=0（:64298 knockBack 0f）
    }
    hitPlayer(this, game, this.dmg);
  }

  /** Kill → 音尘（:77878-77886）+ aiStyle10 铺设段（:79107-79311,num17=57/num18=0）。
   *  bx/by = 爆心（弹中心像素,F1 回退锚;半砖落面=钳位中心）;death = 已知钳位死亡格
   *  （半砖特支直传,跳过 dirtBallDepositTile 的半砖上推死支——见该函数注） */
  private kill(game: GameHooks, bx: number, by: number, death?: { tx: number; ty: number }): void {
    this.dead = true;
    const st = game.world.store;
    game.playSfx('dig', 1, bx, by);                        // PlaySound(0)（:77879）
    for (let i = 0; i < 5; i++) {                          // 5×尘 36（velocity *= 0.6）
      const d = game.spawnDust?.(bx - this.w / 2, by - this.h / 2, this.w, this.h, 36);
      if (d) { d.vx *= 0.6; d.vy *= 0.6; }
    }
    // 铺设段：落点=爆心中心格（num15/num16 :79108-79109）,半砖上推+flag2 门已封装在
    // dirtBallDepositTile（aiStyle10 通用段 1:1）。type 40 num18=0：被占/被拦均无掉落
    const dep = dirtBallDepositTile(st, bx, by, this.vx, this.vy, death);
    if (!dep.occupied && !dep.blocked && this.ashTileId > 0 && st.inBounds(dep.tx, dep.ty)) {
      st.setTile(dep.tx, dep.ty, this.ashTileId, 0, 0);    // PlaceTile(57,forced:true)（:79276）
      // 下方半砖/坡面复原（SlopeTile :79280-79287）
      if (st.inBounds(dep.tx, dep.ty + 1)) {
        const bi = st.idx(dep.tx, dep.ty + 1);
        if (st.half[bi] !== 0 || st.slope[bi] !== 0) {
          st.setHalfBrick(dep.tx, dep.ty + 1, false);
          st.setSlope(dep.tx, dep.ty + 1, 0);
        }
      }
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(this.projId);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.rotate(this.rotation);
    if (img && (img as HTMLImageElement).naturalWidth > 0) {
      const iw = (img as HTMLImageElement).naturalWidth;
      const ih = (img as HTMLImageElement).naturalHeight;
      ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    } else {
      // Projectile_40.png 未就绪/空桩回退：灰烬灰 10×10 色块（isBlank 族同语义）
      ctx.fillStyle = '#44444C';
      ctx.fillRect(-5, -5, 10, 10);
    }
    ctx.restore();
  }
}
