// Dirt Ball 弹 17（ProjectileID.DirtBall,Dirt Rod 114 的 shoot 弹;SW-K1 2026-09-03）。
// 锚点:Projectile.cs SetDefaults :1115-1121(10×10/aiStyle10/friendly/ignoreWater) +
// AI_010 :58809-59073(泥球通道支)+ Kill_Bombs_DoUsualKillCode :79118-79290(aiStyle10
// 亡格铺设段——num17=0 泥土格/num18=2 泥土块物品为 type 17 的表缺省值)。
//
// 行为逐项(AI_010,type 17 分支):
//   · 飞行尘:type!=109 && Next(20)==0 → Dust.NewDust(pos,10,10, 0)(泥土棕,:58896-58899)
//   · channel 期(player.channel && ai[0]==0):tileCollide=false,速度=鼠标-中心
//     向量钳长 12(:58920-58951;gravDir=-1 的 Y 反算本仓无反重力,略);
//     channel 断(松手)→ ai[0]=1(:58953-58956)
//   · 释放后(ai[0]==1):重力 vy += 0.41/tick(:58977-58983),tileCollide=true,
//     旋转 rotation += 0.1(:59070-59073),vy 封顶 10
//   · 撞格 → Kill → 铺设段(:79239-79290):落点=中心格(C# int 整除),半砖上推
//     (nactive+halfBrick+vy>0+|vy|>|vx| → 上移一行 :79244-79247);落点空 →
//     flag2 门(下方 314 轨道/421·422/BlockBelowMakesSandFall :79250-79270)后
//     PlaceTile(0,forced:true)(含下方半砖/坡面复原 :79275-79280);被占或被拦 →
//     掉泥土块物品 num18=2(:79287-79290)
// 出生:ItemCheck_Shoot :47605 RotatedRelativePoint(MountedCenter) ≈ 玩家中心
// (fireSlimeGun 等仓内同口径 cx/cy-4);channel 目标与断链由 Game 侧 provider 注入
// (player.channel 全局旗语义——StartChanneling(114) 置位,:43158 !controlUseItem 清)。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projSprite } from './Arrow';
import { TileStore } from '../world/TileStore';
import { TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../data/tiles';

/** 泥土块物品 vid（num18=2,:79237 缺省——type 17 不在 421/422/109 等覆写表内） */
export const DIRT_BALL_DROP_VID = 2;

/** WorldGen.BlockBelowMakesSandFall（WorldGen.cs:87868-87893）1:1：
 *  j>=maxTilesY-1 → false;下格 null → false;下格 !nactive → true;
 *  下格 active 且再下格 !nactive 且(下格 !active || 非实心) → true;
 *  下格 active 且 type==165(钟乳石) → true。i,j = 落点格(查其【下】格) */
export function blockBelowMakesSandFallAt(st: TileStore, i: number, j: number): boolean {
  if (j >= st.h - 1) return false;
  if (!st.inBounds(i, j + 1)) return false;
  const bi = st.idx(i, j + 1);
  if ((st.flags[bi] & 1) === 0) return true;                    // !nactive → true
  const j2i = st.inBounds(i, j + 2) ? st.idx(i, j + 2) : -1;
  const below2Inactive = j2i < 0 || (st.flags[j2i] & 1) === 0;
  if (below2Inactive) {
    const d = TILE_DEFS[st.type[bi]];
    if (!d || !d.solid) return true;                            // !tileSolid[type]
  }
  if (TILE_DEFS[st.type[bi]]?.vanilla?.sheet === 165) return true;
  return false;
}

export interface DirtBallDeposit {
  tx: number; ty: number;
  /** 落点格已被占(原版 tile.active()==true → num18 掉落分支 :79287) */
  occupied: boolean;
  /** flag2:下方轨道 314/421·422/BlockBelowMakesSandFall(:79250-79270)→ 拒铺掉落 */
  blocked: boolean;
}

/** Kill_Bombs_DoUsualKillCode 的落点格计算(:79239-79270,aiStyle10 共用段):
 *  centerX/centerY = 弹中心像素;vx/vy = 撞格时速度(半砖上推判向用)。C# int
 *  整除 = Math.trunc(负坐标同截断语义)。 */
export function dirtBallDepositTile(
  st: TileStore, centerX: number, centerY: number, vx: number, vy: number,
): DirtBallDeposit {
  let tx = Math.trunc(centerX / 16);
  let ty = Math.trunc(centerY / 16);
  // :79244-79247 半砖上推（nactive+halfBrick+vy>0+|vy|>|vx| → 上一行）
  if (st.inBounds(tx, ty) && st.isActive(tx, ty) && st.half[st.idx(tx, ty)] !== 0
    && vy > 0 && Math.abs(vy) > Math.abs(vx)) ty--;
  // :79248 `!tile.active()` → 空格判定;幽灵格(flags=0,残型)按空处理(与
  // FallingBlock :106-109 幽灵保域口径同)
  const i = st.inBounds(tx, ty) ? st.idx(tx, ty) : -1;
  const occupied = !(i >= 0 && (st.type[i] === 0 || (st.flags[i] & 1) === 0));
  let blocked = false;
  if (!occupied && ty < st.h - 2 && st.inBounds(tx, ty + 1)
    && st.isActive(tx, ty + 1)) {
    const bs = TILE_DEFS[st.type[st.idx(tx, ty + 1)]]?.vanilla?.sheet;
    if (bs === 314 || bs === 421 || bs === 422) blocked = true;
    else if (blockBelowMakesSandFallAt(st, tx, ty)) blocked = true;
  }
  return { tx, ty, occupied, blocked };
}

/** Dirt Rod 的 channel 目标/断链注入(provider 返回 null = 松手 → ai[0]=1 坠落) */
export type DirtBallChannelProvider = () => { x: number; y: number } | null;

export class DirtBallProj extends Entity {
  w = 10; h = 10;
  dead = false;
  readonly projId = 17;
  private ai0 = 0;                    // AI_010 ai[0]:0=channel 期 / 1=释放坠落
  private rotation = 0;
  private life = 3600;                // timeLeft 缺省 3600(Projectile.cs SetDefaults 头)
  private readonly channel: DirtBallChannelProvider;
  private readonly dropKey: string;
  private readonly dirtTileId: number;

  constructor(x: number, y: number, vx: number, vy: number,
    channel: DirtBallChannelProvider, dropKey: string) {
    super();
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.vx = vx;
    this.vy = vy;
    this.channel = channel;
    this.dropKey = dropKey;
    this.dirtTileId = TILE_INTERNAL_BY_SHEET.get(0) ?? -1;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.kill(game); return; }
    const st = game.world.store;
    if (this.ai0 === 0) {
      // 飞行尘(:58896-58899:Next(20)==0 → d0,标准盒 position,10,10)
      if (Math.random() < 0.05) game.spawnDust?.(this.x, this.y, this.w, this.h, 0);
      // channel 期:tileCollide=false(:58925)+ 跟鼠标钳长 12(:58930-58951)
      const target = this.channel();
      if (target) {
        const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
        let dx = target.x - cx, dy = target.y - cy;
        const len = Math.hypot(dx, dy);
        if (len > 12) { dx *= 12 / len; dy *= 12 / len; }
        this.vx = dx; this.vy = dy;
      } else {
        this.ai0 = 1;                    // :58953-58956 松手 → 释放
      }
    } else {
      this.vy += 0.41;                   // :58977-58983 重力
      if (this.vy > 10) this.vy = 10;    // :59071-59072 vy 封顶
      this.rotation += 0.1;              // :59070
      // tileCollide(:58922 置真):中心格实心 → Kill → 铺设段
      const cx = Math.floor((this.x + this.w / 2) / 16);
      const cy = Math.floor((this.y + this.h / 2) / 16);
      if (st.inBounds(cx, cy) && st.isSolid(cx, cy)) { this.kill(game); return; }
    }
    this.x += this.vx;
    this.y += this.vy;
  }

  /** Kill → aiStyle10 铺设段(Kill_Bombs_DoUsualKillCode :79239-79290):铺泥/掉泥块 */
  private kill(game: GameHooks): void {
    this.dead = true;
    const st = game.world.store;
    const dep = dirtBallDepositTile(st, this.x + this.w / 2, this.y + this.h / 2, this.vx, this.vy);
    if (!dep.occupied && !dep.blocked && this.dirtTileId > 0 && st.inBounds(dep.tx, dep.ty)) {
      st.setTile(dep.tx, dep.ty, this.dirtTileId, 0, 0);   // PlaceTile(0,forced:true)
      // 下方半砖/坡面复原(SlopeTile :79275-79280——放置后把下格敲平方)
      if (st.inBounds(dep.tx, dep.ty + 1)) {
        const bi = st.idx(dep.tx, dep.ty + 1);
        if (st.half[bi] !== 0 || st.slope[bi] !== 0) {
          st.setHalfBrick(dep.tx, dep.ty + 1, false);
          st.setSlope(dep.tx, dep.ty + 1, 0);
        }
      }
      game.playSfxFile?.('place', 1, this.x + this.w / 2, this.y + this.h / 2);
    } else {
      // 被占/被拦 → 掉泥土块(num18=2,:79287-79290 RequestNewItem(Center+(0,-2)))
      game.spawnDrop(this.x + this.w / 2, this.y + this.h / 2 - 2, this.dropKey, 1);
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
      ctx.fillStyle = '#6B4E2E';
      ctx.fillRect(-5, -5, 10, 10);
    }
    ctx.restore();
  }
}
