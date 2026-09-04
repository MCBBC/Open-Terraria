// Dirt Ball 弹 17（ProjectileID.DirtBall,Dirt Rod 114 的 shoot 弹;SW-K1 2026-09-03;
// SW-L1 2026-09-03 蓝队二轮 F1/F3/F5/F6/F7/F8/F9+红队 I-3a 清偿;SW-N1 2026-09-03
// 备案;★SW-AH1 2026-09-05 嵌入/Kill 语义按原版 TileCollision 重基线,N1 备案清偿）。
// 锚点:Projectile.cs SetDefaults :987-994(10×10/aiStyle10/friendly/ignoreWater) +
// AI_010 :58809-59083(泥球通道支)+ Kill_Bombs_DoUsualKillCode :79119-79300(aiStyle10
// 亡格铺设段——num17=0 泥土格/num18=2 泥土块物品为 type 17 的表缺省值)。
//
// ★SW-AH1 嵌入/Kill 语义重基线（N1 备案"忠实修必破坏钉面"就此清偿,钉面同步重推导）:
//   原版每拍序(Projectile.Update):HandleMovement(:17578)[velocity=TileCollision
//   (:17718,aiStyle10 支 :17701-17720) → lastVelocity≠velocity ⇒ flag(:18007) →
//   aiStyle10 else 支 position+=velocity;Kill()(:19964-19967)]
//   ★SW-AN1 2026-09-05:aiStyle10 干路【不调】SlopeCollision——该调用仅存于 wet 支
//   (:17767)与非 aiStyle10 的子步支(:17856/:17916/:17963),type17 三者皆不入(见下)
//   → timeLeft-- Kill(:17307-17311) → AI_010(尘/通道/重力/清植
//   削坡/转向封顶,dispatch :24646-24648)。本仓 Entity.fixedUpdate=全实体统一融合
//   拍序(AI+移动同拍,尘先于碰撞判定)——拍位较原版超前半拍,尘计数钉面按融合拍序
//   推导(测试头注),轨迹/死亡位/铺设落点逐值对齐。
//   TileCollision(Collision.cs:2299-2460)【嵌入不可见】:四 face 分支(:2388 down/
//   :2406 左/:2426 右/:2446 up)全部要求旧位盒【完全】在格一侧(vector3 对比
//   vector4),旧位已重叠的格四支全不触发 → 出生即嵌的弹不 Kill、原速下沉穿行
//   (UpdatePosition :20561 position+=velocity);前缘自非实心跨入【新】实心格那一拍
//   才回钳+Kill,死亡位=旧位+钳后速度=贴面(:19966;up 支 +0.01ε :2451),铺设爆心=
//   死亡位中心(:79120-79121 `(int)(position+w/2)/16`)。★SW-AN1 2026-09-05:
//   SlopeCollision(:1796-2040)对 type17 全程不可达——aiStyle10 干路不走(上)+永
//   不 wet:SetDefaults :993 ignoreWater=true ⇒ NewProjectile :10887-10891 强制
//   wet=false、Update :16895 `if(!ignoreWater)` 整段跳过 WetCollision ⇒ wet 恒假;
//   UpdatePosition 的 SlopeCollision(:20584)仅 correctSlopeCollision(=projPet,:709)
//   可达。⇒ 弹与坡 1/2/3/4 的唯一交互面=TileCollision 四 face+坡门 flag3
//   (:2361-2386,faceClamp :124-135 已照抄);slope1/2 Landing 由 AI_010 自带
//   topSlope 削平+position.Y−=16(:59044-59051,topSlope=Tile.cs:292-300 只认 1/2,F3)
//   链路承担——次拍弹底即"自非实心跨入削平后新实心面"→ face-crossing Kill,
//   死亡位=削平格顶贴面。
//   flag6=fallThrough=fall2=false:type17 ∈ FallingBlockDoesNotFallThroughPlatforms
//   (ProjectileID.cs:295,HandleMovement :17653-17656 置 flag6=false)→ 平台照常
//   下落拦截(down 支内门两 Clause 恒真仅剩 num6>tileTop :2391),X/上顶被
//   !tileSolidTop 豁免(:2406/:2426/:2446)。扫描界:(int)(pos/16)−1 ..
//   (int)((pos+size)/16)+2,X 端钳 maxTilesX−1、Y 端钳 maxTilesY−40(:2315-2318),
//   num6=(jEnd+3)*16(:2319)。corner 互锁 num/num2/num3/num4(:2393-2399/:2414-2422/
//   :2434-2442/:2449-2454)逐式保留。
//   F1 旧近似锚(prevX/prevY 回退位)退役:死亡位由钳后速度精确合成(=原版
//   position+=velocity 逐值);prev 锚在斜穿案(flush 中心列≠prev 中心列)曾差一格,
//   本批消除。
//   残差备案(有界):①【SW-AN1 2026-09-05 销案】原备案"slope3/4(悬顶底坡)侧向嵌入
//   原版次拍死于坡底面(:1883-:1922 下推解析)"系误诊:该解析闭在 SlopeCollision 内,
//   而 SlopeCollision 对 type17 不可达(见上)——干路唯一机制=TileCollision 四 face
//   (:2388/:2406/:2426/:2446 全要求旧位盒完全在格一侧)+坡门 flag3(:2361-2386)。
//   旧位盒已重叠坡 3/4 格(含穿越剪角区 flag3 放行后/出生嵌)⇒ 四支全不触发=嵌入
//   不可见,原速续行至跨入【新】实心面才 Kill;坡 3/4 整脸(3 左脸/4 右脸)照常
//   face-crossing Kill。本仓 faceClamp 现行为即原版逐值,补"坡底 Kill"反破 parity。
//   钉面 tests/dirtball-embed-slope34.test.ts。可达性:坡 3/4 玩家锤击可达(Game.ts
//   锤整形坡循环 num11=−1 反向支产 3/4)+世界生成可达(原版 WorldGen.cs:16654-16663
//   悬顶 SlopeTile 3/4+Tile.SmoothSlope 族;本仓 DesertPass Smooth 等已移植)。
//   slope1/2 Landing 已由 F3 削平链
//   等价覆盖。②碰撞 Kill 拍原版不再跑 AI(尘少 1),
//   融合拍序下尘先于碰撞判定恒出(见钉面推导)。③SwitchTiles(压力板,:19974-19979)
//   本仓无弹幕消费面,维持现状(全仓口径,非本批引入)。
//
// 行为逐项(AI_010,type 17 分支):
//   · 飞行尘:type!=109 && Next(20)==0 → Dust.NewDust(pos,10,10, 0)(泥土棕,
//     :58921-58924)——融合拍序下每拍恒评估,含 Kill 拍(I-3a)
//   · channel 期(player.channel && ai[0]==0):tileCollide=false,速度=鼠标-中心
//     向量钳长 12(:58936-58972;gravDir=-1 的 Y 反算本仓无反重力,略);
//     channel 断(松手)→ ai[0]=1(:58974-58978),同拍吃重力(:58999-59002
//     else-if ai[0]==1)
//   · 释放后:重力 vy += 0.41/tick;沿途清植物/削坡(:59021-59054,F3);旋转
//     rotation += 0.1 + vy 封顶 10 为 ai[0]∈{0,1} 全程评估(:59075-59082,F5)
//   · 撞格(face-crossing)→ Kill → 铺设段(:79120-79300):落点=死亡位中心格
//     (C# int 整除),半砖上推(nactive+halfBrick+vy>0+|vy|>|vx| → 上一行
//     :79243-79246,读 Kill 时钳后速度);落点空 → flag2 门(下方 314 轨道/421·422/
//     BlockBelowMakesSandFall :79249-79271)后 PlaceTile(0,forced:true)(:79276,
//     含下方半砖/坡面复原 :79280-79287);被占 → 掉泥土块 num18=2 锚 Center
//     (:79298-79300,F7);被拦/铺失败 → 掉泥土块锚 Center+(0,-2)(:79293-79296,F7)
//   · Kill 音尘:PlaySound(0)+5×尘 0(:77801-77808,F6)——每次 Kill 恒有,
//     铺设成功与掉落两支共用(原版无"铺设专属音",本仓旧 place 音即此音误置)
//   · 寿终 Kill:timeLeft-- → Kill(:17307-17311)在 HandleMovement【之后】→
//     爆心=本拍积分后中心(嵌入态寿终=嵌位中心 → occupied → 掉落支,原版同)
// 出生:ItemCheck_Shoot :47605 RotatedRelativePoint(MountedCenter) ≈ 玩家中心
// (fireSlimeGun 等仓内同口径 cx/cy-4);channel 目标与断链由 Game 侧 provider 注入
// (player.channel 全局旗语义——StartChanneling(114) 置位,:43158 !controlUseItem 清)。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projSprite } from './Arrow';
import { blockBelowMakesSandFall } from './FallingBlock';
import { TileStore } from '../world/TileStore';
import { TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../data/tiles';
import tileCollisionJson from '../data/vanilla-tilecollision.json';

// ★SW-AH1：原版 Main.tileSolidTop 查表（tools/extract-tile-collision.mjs 自
// Terarria1457/Terraria/Main.cs 全量提取，tests/tile-collision-parity.test.ts 对账
// 闸门锚定 def.platform↔solidTop）——X/上顶分支豁免门 `!Main.tileSolidTop[type]`
// （Collision.cs:2418/:2436/:2451）用；down 支 flag 门走 isSolid∪isPlatform
// （physics/TileCollision.ts:175/:379 仓内既定口径，parity 强制 def.platform ≡
// vanilla solidTop）。
const SOLID_TOP_BY_SHEET: ReadonlySet<number> = new Set(
  ((tileCollisionJson as unknown as { tiles: Array<{ id: number; solidTop: boolean }> }).tiles)
    .filter((t) => t.solidTop).map((t) => t.id),
);

/** ★SW-AH1 2026-09-05：Collision.TileCollision（Collision.cs:2299-2460）的 aiStyle10
 *  单弹内联移植——face-crossing Kill 语义核。输入=旧位盒（x,y 左上,10×10）与拟速度，
 *  返回钳后速度；`clamped` ⇔ 原版 `lastVelocity != velocity`（Projectile.cs:18007）⇒
 *  aiStyle10 else 支 `position+=velocity;Kill()`（:19964-19967）。四 face 分支全部
 *  要求旧位盒完全在格一侧（:2388/:2406/:2426/:2446）→ 旧位已重叠格（嵌入）恒不触发
 *  → 返回原速（不死,UpdatePosition 原速下沉 :20561）。fallThrough=fall2=false
 *  （type17 ∈ FallingBlockDoesNotFallThroughPlatforms,ProjectileID.cs:295）→ down 支
 *  内门 `(A||B)&&num6>tileTop` 两 Clause 恒真化简为 `num6>tileTop`（:2391）,
 *  平台照常下拦;X/上顶支 `!tileSolidTop` 豁免。SlopeCollision 对平坦格无动作
 *  （:1923）不移植;slope1/2 的 flag2/flag3 门照抄（:2359-2386）——弹底触坡顶不钳,
 *  次拍 AI_010 削平链（:59045-59051）转平坦 face-crossing Kill。corner 互锁
 *  num/num2/num3/num4 与 `result.Y=vector.Y`（:2420-2422/:2440-2442 角还原）、num4++（半砖
 *  :2395-2397）逐式保留。 */
function tileCollisionFaceClamp(
  st: TileStore, x: number, y: number, vx: number, vy: number,
): { vx: number; vy: number; clamped: boolean } {
  const W = 10, H = 10;
  // 扫描界（:2307-2318）:(int) 截断 = Math.trunc（负坐标同 C# int cast 向零截断）
  const i0 = Math.max(0, Math.min(Math.trunc(x / 16) - 1, st.w - 1));
  const i1 = Math.max(0, Math.min(Math.trunc((x + W) / 16) + 2, st.w - 1));   // 排他
  const j0 = Math.max(0, Math.min(Math.trunc(y / 16) - 1, st.h - 40));        // :2317-2318 maxTilesY−40
  const j1 = Math.max(0, Math.min(Math.trunc((y + H) / 16) + 2, st.h - 40));  // 排他
  let num = -1, num2 = -1, num3 = -1, num4 = -1;                              // :2311-2314
  let num6 = (j1 + 3) * 16;                                                   // :2319
  let rx = vx, ry = vy;                                                       // result=Velocity（:2300）
  for (let i = i0; i < i1; i++) {
    for (let j = j0; j < j1; j++) {
      if (!st.hasTile(i, j) || st.isActuated(i, j)) continue;                 // !active()||inActive()（:2326）
      const ti = st.idx(i, j);
      // flag 门（:2330-2334）:tileSolid || (tileSolidTop && frameY==0)——parity 闸门
      // 强制 def.platform≡solidTop → isSolid∪isPlatform 即原式（仓内既定口径）
      if (!st.isSolid(i, j) && !st.isPlatform(i, j)) continue;
      const sheet = TILE_DEFS[st.type[ti]]?.vanilla?.sheet ?? -1;
      const solidTop = sheet >= 0 && SOLID_TOP_BY_SHEET.has(sheet);
      let tx4 = i * 16, ty4 = j * 16, num7 = 16;
      if (st.half[ti] !== 0) { ty4 += 8; num7 -= 8; }                         // halfBrick（:2350-2353）
      // 新位盒（旧位+拟速）重叠门（:2355）——严格 >（贴面拍不重叠不钳）
      if (!(x + W + vx > tx4) || !(x + vx < tx4 + 16)
        || !(y + H + vy > ty4) || !(y + vy < ty4 + num7)) continue;
      // flag2/flag3 坡门（:2359-2382）——vector3=旧位盒、Velocity=拟速
      let flag2 = false, flag3 = false;
      const sl = st.slope[ti];
      if (sl > 2) {
        if (sl === 3 && y + Math.abs(vx) >= ty4 && x >= tx4) flag3 = true;
        if (sl === 4 && y + Math.abs(vx) >= ty4 && x + W <= tx4 + 16) flag3 = true;
      } else if (sl > 0) {
        flag2 = true;
        if (sl === 1 && y + H - Math.abs(vx) <= ty4 + num7 && x >= tx4) flag3 = true;
        if (sl === 2 && y + H - Math.abs(vx) <= ty4 + num7 && x + W <= tx4 + 16) flag3 = true;
      }
      if (flag3) continue;                                                    // :2384-2386
      if (y + H <= ty4) {                                                     // down（:2388-2404）
        if (num6 > ty4) {                                                     // fallThrough=false 化简（:2391）
          num3 = i; num4 = j;
          if (num7 < 16) num4++;                                              // 半砖（:2395-2397）
          if (num3 !== num && !flag2) {
            ry = ty4 - (y + H);                                               // gravDir=1 无 ε（:2401）
            num6 = ty4;                                                       // :2402
          }
        }
      } else if (x + W <= tx4 && !solidTop) {                                 // 左→右行（:2406-2424）
        num = i; num2 = j;
        if (num2 !== num4) rx = tx4 - (x + W);
        if (num3 === num) ry = vy;                                            // 角互锁还原（:2420-2422）
      } else if (x >= tx4 + 16 && !solidTop) {                                // 右→左行（:2426-2444）
        num = i; num2 = j;
        if (num2 !== num4) rx = tx4 + 16 - x;
        if (num3 === num) ry = vy;                                            // :2440-2442
      } else if (y >= ty4 + num7 && !solidTop) {                              // up（:2446-2456）
        num3 = i; num4 = j;
        ry = ty4 + num7 - y + 0.01;                                           // gravDir=1 ε（:2451）
        if (num4 === num2) rx = vx;                                           // :2452-2454
      }
    }
  }
  return { vx: rx, vy: ry, clamped: rx !== vx || ry !== vy };
}

/** 泥土块物品 vid（num18=2,:79237 缺省——type 17 不在 421/422/109 等覆写表内） */
export const DIRT_BALL_DROP_VID = 2;

/** ★M13 A-2/B-1（2026-09-04）单源化：BlockBelowMakesSandFall（WorldGen.cs:87868-87893）
 *  实现迁至 FallingBlock.blockBelowMakesSandFall（tileSolidOf=def.solid∪tileSolid∩
 *  tileSolidTop 九件套{19,239,380,427,435-439},WorldGen.cs:87884-87 逐字）——旧内联版
 *  arm2 用 `!d.solid` 朴素代理,平台 19 等 tileSolid 真值件被误判"下方撑不住"→
 *  flag2 误拦铺设。本函数（三副本之三）与 Game.sandFallsBelow 均改调单源,
 *  liqGateLegacy 朴素代理不在此列（判据点不同,红队已核净,勿动）。 */


export interface DirtBallDeposit {
  tx: number; ty: number;
  /** 落点格已被占(原版 tile.active()==true → num18 掉落分支 :79298-79300) */
  occupied: boolean;
  /** flag2:下方轨道 314/421·422/BlockBelowMakesSandFall(:79249-79271)→ 拒铺掉落 */
  blocked: boolean;
}

/** Kill_Bombs_DoUsualKillCode 的落点格计算(:79120-79271,aiStyle10 共用段):
 *  centerX/centerY = 弹中心像素;vx/vy = 撞格时速度(半砖上推判向用)。C# int
 *  整除 = Math.trunc(负坐标同截断语义)。
 *  `death`（★M13 A-1,2026-09-04）：碰撞 Kill 时已知的 TileCollision 钳位死亡格
 *  （AshBallProj 半砖落面特支传参）——显式给定时直接采用并【跳过半砖上推】：
 *  该上推支(:79243-79246)读 velocity.Y>0,而 AshBall 碰撞 Kill 路径 velocity.Y 已被
 *  其管线清 0=死支（R2' F2 同谳,FallingBlock surfHalf 同款）;DirtBallProj 不传
 *  death（★SW-AH1：其 Kill 位=:19966 钳后贴面位、velocity=钳后值,上推支按原版
 *  活支照跑）,上推支保持原样。 */
export function dirtBallDepositTile(
  st: TileStore, centerX: number, centerY: number, vx: number, vy: number,
  death?: { tx: number; ty: number },
): DirtBallDeposit {
  let tx = death ? death.tx : Math.trunc(centerX / 16);
  let ty = death ? death.ty : Math.trunc(centerY / 16);
  // :79244-79247 半砖上推（nactive+halfBrick+vy>0+|vy|>|vx| → 上一行）——
  // death 显式给定（碰撞 Kill 钳位死亡格）时跳过,见上注
  if (!death && st.inBounds(tx, ty) && st.isActive(tx, ty) && st.half[st.idx(tx, ty)] !== 0
    && vy > 0 && Math.abs(vy) > Math.abs(vx)) ty--;
  // :79248 `!tile.active()` → 空格判定;幽灵格(flags=0,残型)按空处理(与
  // FallingBlock :106-109 幽灵保域口径同)
  const i = st.inBounds(tx, ty) ? st.idx(tx, ty) : -1;
  const occupied = !(i >= 0 && (st.type[i] === 0 || (st.flags[i] & 1) === 0));
  let blocked = false;
  // SW-R3 2026-09-03（蓝队 L-4）：下格门改裸 active——原版 :79250 `tile.active()`
  // 不含致动位（与 BlockBelowMakesSandFall :87879 的 nactive 判不同函数不同门,
  // 各自照抄勿混;曾用 isActive(nactive) 误拦已致动轨道/沙下格）
  if (!occupied && ty < st.h - 2 && st.inBounds(tx, ty + 1)
    && st.hasTile(tx, ty + 1)) {
    const bs = TILE_DEFS[st.type[st.idx(tx, ty + 1)]]?.vanilla?.sheet;
    if (bs === 314 || bs === 421 || bs === 422) blocked = true;
    else if (blockBelowMakesSandFall(st, tx, ty)) blocked = true;
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
  // ★SW-AH1：F1 旧近似锚 prevX/prevY 退役——死亡位由 tileCollisionFaceClamp 的
  // 钳后速度精确合成（=原版 :19966 position+=velocity 贴面位,见头注），不再回退。
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
    const st = game.world.store;
    // 飞行尘（AI_010 头 :58921-58924:type!=109 && Next(20)==0 → d0,标准盒）——
    // 融合拍序下每拍恒评估,含 Kill 拍（红队 I-3a:曾误锁 ai0===0 分支）
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
    // SW-L1 F5：rotation += 0.1 / vy 封顶 10（:59075-59082,ai[0]∈{0,1} 全程评估）
    // ★SW-AH1 移到碰撞判定【前】：原版 AI_010 尾封顶的拟速即下一 HandleMovement
    // 的碰撞输入（:17718 velocity=TileCollision(position,velocity)）,融合拍序同式
    this.rotation += 0.1;
    if (this.vy > 10) this.vy = 10;
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
      // ★SW-AH1 face-crossing Kill（原版 TileCollision 语义,见头注/函数注）:
      // 钳后速度≠拟速 ⇒ aiStyle10 else 支 position+=velocity;Kill()（:19964-19967）
      // ——死亡位=旧位+钳后速度=贴面,铺设爆心=死亡位中心（:79120-79121）;嵌入态
      // （旧位盒已重叠格）四支全不触发 → 不死原速下沉（:20549-20562）。Kill 时
      // velocity=钳后值（半砖上推 :79243-79246 读此值,原版同）
      const clamp = tileCollisionFaceClamp(st, this.x, this.y, this.vx, this.vy);
      if (clamp.clamped) {
        this.vx = clamp.vx;
        this.vy = clamp.vy;
        this.kill(game, this.x + this.vx + this.w / 2, this.y + this.vy + this.h / 2);
        return;
      }
    }
    // 积分（UpdatePosition :20561-20562 position+=velocity,非碰撞路径原速直写）
    this.x += this.vx;
    this.y += this.vy;
    // 寿终 Kill（:17307-17311 timeLeft-- → Kill）——原版时点在 HandleMovement【后】
    // → 爆心=本拍积分后中心（嵌入态寿终=嵌位中心 → occupied → 掉落支,原版同;
    // 旧版把 life 判定放在拍首=积分前位,时点差一拍,本批对齐）
    if (--this.life <= 0) { this.kill(game, this.x + this.w / 2, this.y + this.h / 2); }
  }

  /** Kill → aiStyle10 铺设段（Kill_Bombs_DoUsualKillCode :79120-79300）+ Kill 音尘
   *  （:77801-77808）。bx/by = 爆心 = 死亡位中心像素（★SW-AH1：碰撞 Kill=
   *  :19966 position+=velocity 贴面位中心（:79120-79121 同式）;寿终 Kill=积分后
   *  中心）:铺泥/掉泥块两支共用。this.vx/vy 已是 Kill 时钳后速度（半砖上推
   *  :79243-79246 读原版 Kill 时 velocity,同值） */
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
