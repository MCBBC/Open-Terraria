// Dirt Ball 弹 17（ProjectileID.DirtBall,Dirt Rod 114 的 shoot 弹;SW-K1 2026-09-03;
// SW-L1 2026-09-03 蓝队二轮 F1/F3/F5/F6/F7/F8/F9+红队 I-3a 清偿）。
// 锚点:Projectile.cs SetDefaults :987-994(10×10/aiStyle10/friendly/ignoreWater) +
// AI_010 :58809-59083(泥球通道支)+ Kill_Bombs_DoUsualKillCode :79119-79300(aiStyle10
// 亡格铺设段——num17=0 泥土格/num18=2 泥土块物品为 type 17 的表缺省值)。
//
// 行为逐项(AI_010,type 17 分支):
//   · 飞行尘:type!=109 && Next(20)==0 → Dust.NewDust(pos,10,10, 0)(泥土棕,
//     :58921-58924)——AI_010 头部【每 tick】评估,非仅 channel 期(I-3a)
//   · channel 期(player.channel && ai[0]==0):tileCollide=false,速度=鼠标-中心
//     向量钳长 12(:58936-58972;gravDir=-1 的 Y 反算本仓无反重力,略);
//     channel 断(松手)→ ai[0]=1(:58974-58978)
//   · 释放后(ai[0]==1):重力 vy += 0.41/tick(:59002);沿途清植物/削坡
//     (:59021-59054,F3);旋转 rotation += 0.1 + vy 封顶 10 为 ai[0]∈{0,1} 全程
//     评估(:59075-59082,F5——channel 期同样转/封顶)
//   · 撞格 → Kill → 铺设段(:79120-79300):落点=中心格(C# int 整除 :79120-79121),
//     半砖上推(nactive+halfBrick+vy>0+|vy|>|vx| → 上移一行 :79244-79246);
//     落点空 → flag2 门(下方 314 轨道/421·422/BlockBelowMakesSandFall
//     :79249-79271)后 PlaceTile(0,forced:true)(:79276,含下方半砖/坡面复原
//     :79280-79287);被占 → 掉泥土块 num18=2 锚 Center(:79298-79300,F7);
//     被拦/铺失败 → 掉泥土块锚 Center+(0,-2)(:79293-79296,F7)
//   · Kill 音尘:PlaySound(0)+5×尘 0(:77801-77808,F6)——每次 Kill 恒有,
//     铺设成功与掉落两支共用(原版无"铺设专属音",本仓旧 place 音即此音误置)
//   · 爆心(F1):原版 Kill 时 position 已被 TileCollision 回退到未嵌入位(弹盒
//     贴面),中心格=撞面邻接空气格 → PlaceTile 必成;本仓无盒级碰撞管线,kill 判定
//     用"已嵌入实心格的弹心"→ occupied 恒真 → 永远掉泥块。修=铺设/音尘爆心取
//     【上一 tick 未嵌入位置】(prevX/prevY;vy≤10/|vx|≤12 < 格宽 16 ⇒ 回退位
//     恒落原空气格,与原版回退后中心格逐格等价)
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
 *  下格 active 且 type==165(钟乳石) → true。i,j = 落点格(查其【下】格)。
 *  ★nactive = active && !inActive（Tile.cs:591-606/:242-248,0x20 位+非 0x40 致动位;
 *  本仓 TileStore.isActive 同口径——SW-L1 2026-09-03 F8:曾用裸 active 位漏致动格,
 *  已致动沙上清水/装饰误判"下方空"→ 误拦铺设） */
export function blockBelowMakesSandFallAt(st: TileStore, i: number, j: number): boolean {
  if (j >= st.h - 1) return false;
  if (!st.inBounds(i, j + 1)) return false;
  if (!st.isActive(i, j + 1)) return true;                      // !tile.nactive() → true（:87879-87882）
  const below2Inactive = !st.inBounds(i, j + 2) || !st.isActive(i, j + 2);
  if (below2Inactive) {
    const d = TILE_DEFS[st.type[st.idx(i, j + 1)]];
    if (!d || !d.solid) return true;                            // !tileSolid[type]
  }
  if (TILE_DEFS[st.type[st.idx(i, j + 1)]]?.vanilla?.sheet === 165) return true;
  return false;
}

export interface DirtBallDeposit {
  tx: number; ty: number;
  /** 落点格已被占(原版 tile.active()==true → num18 掉落分支 :79298-79300) */
  occupied: boolean;
  /** flag2:下方轨道 314/421·422/BlockBelowMakesSandFall(:79249-79271)→ 拒铺掉落 */
  blocked: boolean;
}

/** Kill_Bombs_DoUsualKillCode 的落点格计算(:79120-79271,aiStyle10 共用段):
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
  /** SW-L1 2026-09-03 F1：上一 tick 积分前位置（未嵌入）——铺设/音尘爆心回退锚。
   *  原版 Kill 时 position 已被 TileCollision 回退（弹盒贴撞面）→ 中心格=撞面
   *  邻接空气格;本仓无盒级碰撞管线,kill 判定时弹心已嵌入实心格,直接用会 occupied
   *  恒真。vy≤10/|vx|≤12 均 < 格宽 16 ⇒ 回退一位必落撞面前空气格,与原版回退后
   *  中心格逐格等价（见头注 F1）。 */
  private prevX = 0;
  private prevY = 0;
  private readonly channel: DirtBallChannelProvider;
  private readonly dropKey: string;
  private readonly dirtTileId: number;

  constructor(x: number, y: number, vx: number, vy: number,
    channel: DirtBallChannelProvider, dropKey: string) {
    super();
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.prevX = this.x;
    this.prevY = this.y;
    this.vx = vx;
    this.vy = vy;
    this.channel = channel;
    this.dropKey = dropKey;
    this.dirtTileId = TILE_INTERNAL_BY_SHEET.get(0) ?? -1;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // 寿终 Kill（Update 尾 timeLeft-- → Kill :17307-17312）——现位即未嵌入位
    // （嵌入态在上一拍碰撞支已 Kill）→ 爆心=现位中心
    if (--this.life <= 0) { this.kill(game, this.x + this.w / 2, this.y + this.h / 2); return; }
    const st = game.world.store;
    // 飞行尘（AI_010 头 :58921-58924:type!=109 && Next(20)==0 → d0,标准盒）——
    // 每 tick 恒评估,非仅 channel 期（红队 I-3a:曾误锁 ai0===0 分支）
    if (Math.random() < 0.05) game.spawnDust?.(this.x, this.y, this.w, this.h, 0);
    // tileCollide 每 tick 先置真（:58934）;channel 支再置假（:58937）——断链拍
    // （ai0 0→1）tileCollide 仍为假,原版该拍跑重力但跳过清格/碰撞（:58999/:59021）
    let tileCollide = true;
    if (this.ai0 === 0) {
      tileCollide = false;
      // channel 期:跟鼠标钳长 12（:58936-58972）
      const target = this.channel();
      if (target) {
        const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
        let dx = target.x - cx, dy = target.y - cy;
        const len = Math.hypot(dx, dy);
        if (len > 12) { dx *= 12 / len; dy *= 12 / len; }
        this.vx = dx; this.vy = dy;
      } else {
        this.ai0 = 1;                    // :58974-58978 松手 → 释放
      }
    }
    if (this.ai0 === 1) {
      this.vy += 0.41;                   // :58999-59002 重力（else if ai[0]==1——断链拍即吃）
    }
    if (tileCollide) {
      // SW-L1 F3：沿途清植物/削坡（:59021-59054——owner==Main.myPlayer && tileCollide
      // 恒跑;盒级扫格,植物族 KillTile / topSlope 削平+position.Y -= 16 可叠次）
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
      // tileCollide:中心格实心 → Kill → 铺设段（爆心=上一 tick 未嵌入位,F1）
      const cx = Math.floor((this.x + this.w / 2) / 16);
      const cy = Math.floor((this.y + this.h / 2) / 16);
      if (st.inBounds(cx, cy) && st.isSolid(cx, cy)) {
        this.kill(game, this.prevX + this.w / 2, this.prevY + this.h / 2);
        return;
      }
    }
    // SW-L1 F5：rotation += 0.1 / vy 封顶 10 = ai[0]∈{0,1} 全程评估（:59075-59082,
    // 736-738 分支后恒达的 else 支）——曾误锁释放支（channel 期不转不封顶）
    this.rotation += 0.1;
    if (this.vy > 10) this.vy = 10;
    // F1 爆心回退锚：记录本拍积分前位（下一拍撞格 Kill 时作铺设/音尘爆心）
    this.prevX = this.x;
    this.prevY = this.y;
    this.x += this.vx;
    this.y += this.vy;
  }

  /** Kill → aiStyle10 铺设段（Kill_Bombs_DoUsualKillCode :79120-79300）+ Kill 音尘
   *  （:77801-77808）。bx/by = 爆心（弹中心像素,F1 回退锚）:铺泥/掉泥块两支共用 */
  private kill(game: GameHooks, bx: number, by: number): void {
    this.dead = true;
    const st = game.world.store;
    // SW-L1 F6：PlaySound(0)(Dig)+5×尘 0（:77801-77808）——每次 Kill 恒有,含掉落
    // 分支。原版铺设路径无独立音,本仓旧 place 音即此音误置铺设支,已并入此处
    game.playSfx('dig', 1, bx, by);
    for (let i = 0; i < 5; i++) {
      game.spawnDust?.(bx - this.w / 2, by - this.h / 2, this.w, this.h, 0);
    }
    const dep = dirtBallDepositTile(st, bx, by, this.vx, this.vy);
    if (!dep.occupied && !dep.blocked && this.dirtTileId > 0 && st.inBounds(dep.tx, dep.ty)) {
      st.setTile(dep.tx, dep.ty, this.dirtTileId, 0, 0);   // PlaceTile(0,forced:true)（:79276）
      // 下方半砖/坡面复原(SlopeTile :79280-79287——放置后把下格敲平方)
      if (st.inBounds(dep.tx, dep.ty + 1)) {
        const bi = st.idx(dep.tx, dep.ty + 1);
        if (st.half[bi] !== 0 || st.slope[bi] !== 0) {
          st.setHalfBrick(dep.tx, dep.ty + 1, false);
          st.setSlope(dep.tx, dep.ty + 1, 0);
        }
      }
    } else if (dep.occupied) {
      // 被占 → 掉泥土块（num18=2）,锚=Center（:79298-79300——SW-L1 F7:曾统一 −2）
      game.spawnDrop(bx, by, this.dropKey, 1);
    } else {
      // flag2 被拦/铺失败 → 掉泥土块,锚=Center+(0,-2)（:79293-79296）
      game.spawnDrop(bx, by - 2, this.dropKey, 1);
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
