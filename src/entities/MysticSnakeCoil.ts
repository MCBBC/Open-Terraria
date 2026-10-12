// 弄蛇笛绳蛇弹（proj 754 MysticSnakeCoil,Projectile.cs:7769-7778 规格 +
// AI_155_MysticSnakeCoil :52853-53028 + AI_155_RemoveRope :53030-53045 +
// AI_155_SpawnRopeIn :53047-53068 + 绘制 754 专支 Main.cs:31664-31708）。
// 入口：物品 4262 耍蛇笛（Snake Charmer's Flute/耍蛇者长笛,ItemID.MysticCoilSnake:
//   Item.cs:36653-36664——useTurn/20×20/useStyle 5/useTime=useAnimation=90/
//   UseSound Item151/rare 1/value 50000/shoot 754;★定谳：非 consumable（无
//   consumable 行）、非召唤武器（无 damage/mana/minion/minionSlots 行,弹 754 亦无
//   minion/projPet 旗）——承载类=工具弹（绳铺装器,同 Void Lens 4263 家族面），
//   出手扫描 Player.cs:48278-48334（鼠标向 ≤15 格 CanHitLine + Conditions.MysticSnake
//   落点扫描 WorldBuilding/Conditions.cs:57-67,Searches.Down(31)）。
// 规格：16×16/aiStyle 155/tileCollide false/ignoreWater true/penetrate −1/alpha 255
//   （Projectile.cs:7769-7778;Main.projFrames 无 754 赋值,帧由 AI/绘制自驱）。
// AI 三相（ai[1] 态机,本仓 ai1;原版相 0→1 落穿相 1 同拍执行,:52868-52874 无 return）：
//   相 0→1（:52868-52873）：spriteDirection 定朝（玩家在蛇右→−1,朝向玩家）、vy=−5
//     （同拍即被相 1 式覆写——原版 -5 为死写面,保留语义）;
//   相 1 上升（:52874-52962）localAI[1] 计时：0-14t 匀速 −3;15-30t Remap(15,30,0,1)
//     减速（(int) 朝零截断,t≈26 起归 0）;31-59t 悬停;60t 起火箭 −32 并一次性
//     30×d27 尘环（TopLeft+(−6,0) 24×16 盒,alpha150/scale0.6,X 抖 ±8,
//     终速=(0,−1)×(±9) 向上支 ×(1+rand×3)——原版 RotatedBy(…×0f)=恒等旋转死参数,
//     前置 X×0.5/Y=−3 全被终速覆写,语义照抄）;1/6 掷（60t 起每 tick,15-59t 悬停窗
//     !flag 压制）单 d27 同规格;alpha −5/t（255→51t 全显）;frame 0-3 每 12t 轮;
//     绳铺装门（Main.myPlayer==owner 本地恒真）：绳长（锚 tile Y−当前 tile Y）≥100
//     （num2）或列 [锚..当前] 任一 active 非 cut 非 504 格（:52933-52941,504 豁免=
//     自身绳不挡）或 InWorld(40) 越界 → 自锚（ai[0] tile=出手落点上一格）向上
//     [锚..当前) 逐格 TileEmpty||tileCut → PlaceTile(504)（:52944-52955,MP
//     NetMessage 面单机不建模）;随后 timeLeft=1800（num3）/ai[1]=2/
//     Top=(x·16+8,当前 tile·16+16)/velocity=0（:52956-52960）;落穿相 2 同拍首扫。
//   相 2 绳驻留（:52964-53027）：alpha=0;首 tick（localAI[0]==0）绳全列
//     SpawnRopeIn（:53047-53068——3/4 掷 gore 61-63 烟团:速=NextVector2Circular(1.5,0.8)
//     +X±0.1 偏置、位=vector−(16,16)、alpha=170;每格恒 1×d27 scale1.7 vel×2
//     noGravity + 1/8 掷 d31 vel×0.4,各 5 轮）;此后每 tick 逐绳格 1/80 掷 d27
//     （:52993-53000,28×16 盒 vx=0/fadeIn1.2/noGravity/scale0.6）;timeLeft==4 再
//     SpawnRopeIn 一轮（:53003-53013）;timeLeft≤4:InWorld(20) 门 → RemoveRope
//     （锚→顶逐格 KillTile 504——KillTile_GetItemDrops 504 无 drop 项
//     WorldGen.cs:66485,零掉落）→ Kill。
// 回收双路（Player.cs:48313-48327 旧蛇处理,该面原版把已铺装蛇 timeLeft=4 走相 2
//   撤绳支、上升中蛇立即 Kill）：requestRecall() 承载。
// timeLeft 源：NewProjectile 缺省 3600（相 1 不重置;上升窗最长 ~100 格≪3600）;
//   Update 每拍 timeLeft-- 后 AI（Projectile.cs:17307-17311,≤0 即 Kill）——本仓
//   life 同序（先减后跑 AI）,自然到期恰在 4 命中重SpawnRopeIn+撤绳同拍;回收置 4
//   则下拍 3 直接撤绳（跳过重演出,原版同构）。
// 绘制（Main.cs:31664-31708）：Projectile_754.png 90×36=Frame(5,2) 18×18 格;帧矩形
//   Width/Height −2=16×16,origin=(8,0) 顶心;上升相=自 position.Y 向下到 ai[0]−4
//   逐段 16px 竖列（首段=动帧 row0 col=frame,余段 row1 静帧——rect.Y+=Height+2）,
//   每段独立取格光（GetAlpha(Lighting.GetColor)）;列尾补画 col4 蛇盘于 ai[0]−6;
//   相 2 只画蛇盘（位/光同式）。逐格光近似=lightAt 亮度 × (255−alpha)/255 乘透
//   （WeaponProj 链节同式先例）;spriteDirection=−1 水平镜像（EntitySpriteDraw dir）。
import { Entity } from './Entity';
import { GorePiece } from './GorePiece';
import { projSprite } from './Arrow';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { TILE } from '../core/constants';
import { TILE_DEFS, TILE_INTERNAL_BY_SHEET, TILE_CUT_SHEETS } from '../data/tiles';
import type { TileStore } from '../world/TileStore';
import { canHitLine } from '../physics/LineOfSight';

/** 内部 tile id（tiles.ts 'v_504_mystic_snake_rope'） */
const TILE_504_INTERNAL = TILE_INTERNAL_BY_SHEET.get(504) ?? -1;

/** tile → 原版 sheet id（内部 id 域→sheet 域换轨） */
function sheetOf(st: TileStore, x: number, y: number): number {
  return TILE_DEFS[st.type[st.idx(x, y)]]?.vanilla?.sheet ?? -1;
}

/** Conditions.MysticSnake.CheckValidity（WorldBuilding/Conditions.cs:57-67）：
 *  active && !tileCut && type != 504——非实心域（树/平台/火把皆可落） */
function mysticSnakeCond(st: TileStore, x: number, y: number): boolean {
  if (!st.hasTile(x, y)) return false;
  const sheet = sheetOf(st, x, y);
  if (TILE_CUT_SHEETS.has(sheet)) return false;
  return sheet !== 504;
}

/** WorldGen.InWorld(x, y, fluff)（WorldGen.cs 通用边界式） */
function inWorld(st: TileStore, x: number, y: number, fluff: number): boolean {
  return x >= fluff && x < st.w - fluff && y >= fluff && y < st.h - fluff;
}

/** Utils.NextVector2Circular(w, h)（Utils.cs:1301-1304）：单位圆角 × 半径档 × NextFloat
 *  ——角均匀 + [0,1) 径向因子（非 sqrt 面积均匀,照抄分布） */
function nextVector2Circular(halfW: number, halfH: number): { x: number; y: number } {
  const ang = Math.random() * Math.PI * 2;
  const f = Math.random();
  return { x: Math.cos(ang) * halfW * f, y: Math.sin(ang) * halfH * f };
}

/**
 * 耍蛇笛出手落点扫描（Player.cs:48278-48334 1:1）。
 * 逐列（鼠标向 step=scanMax..0）：CanHitLine(玩家中心→同 Y 横向 step 格) &&
 * Searches.Down(31) + MysticSnake 条件找落点 → 顶上连叠回溯（≤7 层,:48300-48309,
 * 结果 Y≥10 门 :48310）→ 返回叠顶格（锚=其上一格）。
 * 返回 null = 本拍无落点（原版即空转:不 Kill 旧蛇/不生成,useTime 照走）。
 */
export function mysticSnakeLandingSpot(
  st: TileStore, pcx: number, pcy: number, ptx: number, pty: number,
  dir: number, scanMax: number,
): { x: number; y: number } | null {
  for (let step = scanMax; step >= 0; step--) {
    // Collision.CanHitLine(Center,1,1, Center+(16·step·dir,0),1,1)（:48298）
    if (!canHitLine(st, pcx, pcy, 1, 1, pcx + TILE * step * dir, pcy, 1, 1)) continue;
    const cx9 = ptx + dir * step;
    // Searches.Chain(Searches.Down(31), MysticSnake)（:48298;GenSearch.Find 含起点）
    let land: number | null = null;
    for (let down = 0; down < 31; down++) {
      const ty9 = pty + down;
      if (!st.inBounds(cx9, ty9)) break;
      if (mysticSnakeCond(st, cx9, ty9)) { land = ty9; break; }
    }
    if (land === null) continue;
    // 顶上连叠回溯（:48300-48309）：num58 = land;while 上格 active → num58--;
    //   越界/num58<10/爬升>7 → 本列弃（num58=−1）
    let top = land;
    let ok = true;
    while (st.hasTile(cx9, top - 1)) {
      top--;
      if (!st.inBounds(cx9, top - 1) || top < 10 || land - top > 7) { ok = false; break; }
    }
    if (!ok || top < 10) continue;                    // num58>=10 门（:48310）
    return { x: cx9, y: top };
  }
  return null;
}

export class MysticSnakeCoil extends Entity {
  readonly projId = 754;
  w = 16; h = 16;
  /** timeLeft（NewProjectile 缺省 3600;铺装重置 1800,回收置 4） */
  life = 3600;
  /** ai[1] 相位：0 未起 → 1 上升 → 2 铺装驻留 */
  ai1 = 0;
  /** localAI[0]（相 2 首 tick SpawnRopeIn 门） */
  private local0 = 0;
  /** localAI[1]（相 1 计时） */
  private local1 = 0;
  alpha = 255;
  frame = 0;
  private frameCounter = 0;
  /** spriteDirection（相 0→1 定朝,绘制镜像面） */
  spriteDir = 1;
  /** ai[0]：锚 Y px（= 出手落点叠顶格中心再上一格中心,Player.cs:48328 第 10 参） */
  readonly anchorY: number;

  /** cx/cy = 弹中心 px（NewProjectile 中心域） */
  constructor(cx: number, cy: number, anchorYPx: number) {
    super();
    this.x = cx - 8;
    this.y = cy - 8;
    this.anchorY = anchorYPx;
  }

  /** 旧蛇回收（Player.cs:48313-48327）：已铺装 → timeLeft=4 走相 2 撤绳支;
   *  上升中（绳未铺）→ 立即 Kill */
  requestRecall(): void {
    if (this.ai1 === 2) this.life = 4;
    else this.dead = true;
  }

  override fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.dead) return;
    // timeLeft-- 后 AI（Projectile.cs:17307-17311）
    if (--this.life <= 0) { this.dead = true; return; }
    const st = game.world.store;
    if (this.ai1 === 0) {
      // 相 0→1（:52868-52873）：定朝（玩家右→−1）+ vy=−5（同拍被相 1 式覆写）
      this.spriteDir = !(game.player.cx > this.cx) ? 1 : -1;
      this.ai1 = 1;
      this.vy = -5;
    }
    if (this.ai1 === 1) this.stepRise(st, game);       // 相 0→1 落穿（:52874 无 return）
    if (this.ai1 === 2) this.stepPlaced(st, game);     // 铺装拍落穿（:52964 门即过）
    if (this.dead) return;
    // 位移积分（tileCollide=false:7774/ignoreWater:7775——无碰撞无液阻直行）
    this.x += this.vx;
    this.y += this.vy;
  }

  /** 相 1 上升（:52874-52962） */
  private stepRise(st: TileStore, game: GameHooks): void {
    this.local1++;
    const remap = Math.max(0, Math.min(1, (this.local1 - 15) / 15));   // Remap(15,30→0,1)
    const num5 = this.local1 >= 60 ? 1 : 0;
    this.vy = Math.trunc(-3 * (1 - remap) + -32 * num5);               // (int) 朝零截断 :52879-52880
    const flag = remap > 0 && num5 <= 0;                               // 悬停窗 15-59t :52899
    if ((Math.random() * 6 < 1 || num5 > 0) && !flag) {
      // 常驻尘 1×d27（:52902-52908,60t 起每 tick;velocity*=1 原版恒等式不建模）
      const d = game.spawnDust?.(this.x - 6, this.y, 24, 16, 27, 0, 0, 150,
        { r: 0, g: 0, b: 0, a: 0 }, 0.6);
      if (d) {
        d.vx *= 0.5;
        d.vy = -3;
        d.fadeIn = 1.2;
        d.noGravity = true;
      }
    }
    if (this.local1 === 60) {
      // 30×d27 尘环（:52883-52897）：前置 X×0.5/Y=−3 被终速 (0,−1)×(±9) 整覆写
      for (let i = 0; i < 30; i++) {
        const d = game.spawnDust?.(this.x - 6, this.y, 24, 16, 27, 0, 0, 150,
          { r: 0, g: 0, b: 0, a: 0 }, 0.6);
        if (!d) break;
        d.fadeIn = 1.2;
        d.noGravity = true;
        d.x += (Math.random() * 2 - 1) * 8;                 // NextFloatDirection×8 :52891
        const dir9 = Math.random() * 2 - 1;                 // NextFloatDirection
        d.vx = 0;                                           // (0,−1) 基向量无 X 分量
        d.vy = -dir9 * 9;                                   // ×(±9)（RotatedBy(…×0)=恒等）
        if (d.vy < 0) d.vy *= 1 + Math.random() * 3;        // 向上支增幅 :52893-52896
      }
    }
    this.alpha = Math.max(0, Math.min(255, this.alpha - 5)); // :52909
    if (++this.frameCounter >= 12) {                         // :52910-52917
      this.frameCounter = 0;
      if (++this.frame >= 4) this.frame = 0;
    }
    // 绳铺装门（:52918-52962,myPlayer==owner 本地恒真）
    const x = Math.floor(this.cx / TILE);
    const point3Y = Math.floor(this.y / TILE);               // 当前 tile Y（y2=position.Y）
    const point4Y = Math.floor(this.anchorY / TILE);         // 锚 tile Y（num6=ai[0]）
    let flag2 = point4Y - point3Y >= 100;                    // num2=100 绳长帽 :52925
    if (!inWorld(st, x, point3Y, 40) || !inWorld(st, x, point4Y, 40)) flag2 = true;  // :52927-52930
    if (!flag2) {
      for (let ty = point4Y; ty >= point3Y; ty--) {          // 阻挡扫描 [锚..当前] :52933-52941
        const sheet = sheetOf(st, x, ty);
        if (st.hasTile(x, ty) && !TILE_CUT_SHEETS.has(sheet) && sheet !== 504) {
          flag2 = true;
          break;
        }
      }
    }
    if (!flag2) return;
    // PlaceTile 循环 [锚..当前)（:52944-52955）;num8 计数器原版无消费（死写,不建模）
    if (TILE_504_INTERNAL > 0) {
      for (let ty = point4Y; ty > point3Y; ty--) {
        // TileEmpty=active?inActive():true（WorldGen.cs:70506-70509）|| tileCut
        if (!st.hasTile(x, ty) || st.isActuated(x, ty)
          || TILE_CUT_SHEETS.has(sheetOf(st, x, ty))) {
          st.setTile(x, ty, TILE_504_INTERNAL);              // WorldGen.PlaceTile(504)（MP 面不建模）
        }
      }
    }
    this.life = 1800;                                        // num3 :52956
    this.ai1 = 2;
    this.x = x * TILE;                                       // Top=(x·16+8,·) → 左上=x·16 :52959
    this.y = point3Y * TILE + 16;
    this.vx = 0;
    this.vy = 0;
  }

  /** 相 2 绳驻留（:52964-53027） */
  private stepPlaced(st: TileStore, game: GameHooks): void {
    this.alpha = 0;                                          // :52968
    const x2 = Math.floor(this.cx / TILE);                   // point5.X（Center 域）
    const startY = Math.floor(this.anchorY / TILE);          // start2.Y（num10=ai[0]）
    const endY = Math.floor(this.y / TILE);                  // end2.Y（y3=position.Y）
    if (this.local0 === 0) {
      this.local0 = 1;
      for (let ty = startY; ty >= endY; ty--) {
        if (st.hasTile(x2, ty) && sheetOf(st, x2, ty) === 504) this.spawnRopeIn(x2, ty, game);
      }
    } else {
      for (let ty = startY; ty >= endY; ty--) {              // ambient 1/80 掷 :52990-53001
        if (st.hasTile(x2, ty) && sheetOf(st, x2, ty) === 504 && Math.floor(Math.random() * 80) === 0) {
          const d = game.spawnDust?.(x2 * TILE - 6, ty * TILE, 28, 16, 27, 0, 0, 150,
            { r: 0, g: 0, b: 0, a: 0 }, 0.6);
          if (d) {
            d.vx = 0;
            d.fadeIn = 1.2;
            d.noGravity = true;
          }
        }
      }
    }
    if (this.life === 4) {                                   // :53003-53013 回收演出
      for (let ty = startY; ty >= endY; ty--) {
        if (st.hasTile(x2, ty) && sheetOf(st, x2, ty) === 504) this.spawnRopeIn(x2, ty, game);
      }
    }
    if (this.life > 4) return;
    if (!inWorld(st, x2, endY, 20) || !inWorld(st, x2, startY, 20)) {
      this.dead = true;                                      // :53018-53021 出界免撤
      return;
    }
    this.removeRope(st, x2, startY, endY);                   // :53025
    this.dead = true;                                        // Kill :53027
  }

  /** AI_155_RemoveRope（:53030-53045）：[顶..锚] 逐格 504 → KillTile（零掉落,
   *  KillTile_GetItemDrops 504 无项 WorldGen.cs:66485;MP NetMessage 不建模） */
  private removeRope(st: TileStore, x: number, startY: number, endY: number): void {
    for (let ty = startY; ty >= endY; ty--) {
      if (st.hasTile(x, ty) && sheetOf(st, x, ty) === 504) st.setTile(x, ty, 0);
    }
  }

  /** AI_155_SpawnRopeIn（:53047-53068）：vector=(x·16+8,y·16+8) 格心 */
  private spawnRopeIn(x: number, y: number, game: GameHooks): void {
    const vx0 = x * TILE + 8, vy0 = y * TILE + 8;
    if (Math.floor(Math.random() * 4) !== 0) {               // 3/4 掷 :53050
      // gore 61-63 烟团（NewGoreDirect 后覆写速/位 :53052-53056;perfect=true 跳
      // NewGore 内建扰动——原版扰动随即被整速覆写;alpha=170 :53056）
      const c = nextVector2Circular(1.5, 0.8);
      const g = GorePiece.newGore(61 + Math.floor(Math.random() * 3), vx0 - 16, vy0 - 16, 0, 0, 1, true);
      if (g) {
        g.vx = c.x + 0.1 * (c.x > 0 ? 1 : -1);
        g.vy = c.y;
        g.alpha = 170;
      }
    }
    for (let i = 0; i < 5; i++) {                            // :53058-53067
      // ★C16a-F10（2026-10-12）：尘盒锚 `vector + new Vector2(-8f)`（:53060/:53062
      //  单参构造=双轴 −8,旧实现只偏 X 漏 Y=尘盒整体下沉半格）
      if (Math.floor(Math.random() * 8) === 0) {
        const d31 = game.spawnDust?.(vx0 - 8, vy0 - 8, 16, 16, 31, 0, 0, 100,
          { r: 0, g: 0, b: 0, a: 0 }, 1);
        if (d31) { d31.vx *= 0.4; d31.vy *= 0.4; }           // velocity *= 0.4f 双轴
      }
      const d = game.spawnDust?.(vx0 - 8, vy0 - 8, 16, 16, 27, 0, 0, 100,
        { r: 0, g: 0, b: 0, a: 0 }, 1.7);
      if (d) {
        d.vx *= 2;                                           // velocity *= 2f 双轴 :53065
        d.vy *= 2;
        d.noGravity = true;
      }
    }
  }

  /** 绘制（Main.cs:31664-31708）：见文件头注「绘制」段 */
  override draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projSprite(this.projId);
    if (!img || img.width <= 0) return;
    const cw = 18, chh = 18;                                 // Frame(5,2) 格距（90×36）
    const rect = (col: number, row: number): [number, number, number, number] =>
      [col * cw, row * chh, cw - 2, chh - 2];                // Width/Height −2 :31668-31669
    const lightAt = (wx: number, wy: number): number => {
      const lighting = (r as unknown as {
        lighting?: { lightAt: (tx: number, ty: number) => [number, number, number] } | null;
      }).lighting;
      if (!lighting) return 1;
      const [lr, lg, lb] = lighting.lightAt(Math.floor(wx / TILE), Math.floor(wy / TILE));
      return Math.max(0, Math.min(1, (lr * 0.3 + lg * 0.5 + lb * 0.2) / 255));
    };
    const fade = (255 - this.alpha) / 255;                   // GetAlpha 乘域
    const num205 = this.anchorY - 4;                         // ai[0]+8+2−16+2 :31672
    const topX = this.cx;                                    // proj.Top.X（w/2 居中）
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(topX, 0);                                  // 锚=X=Top 心（origin=(w/2,0)）
    if (this.spriteDir < 0) ctx.scale(-1, 1);                // EntitySpriteDraw dir 镜像
    if (this.ai1 === 2) {
      // 相 2：只画蛇盘 col4（:31675-31684）
      const [sx, sy, sw, sh] = rect(4, 0);
      const a = fade * lightAt(topX + sw / 2, num205 - 2 + sh / 2);   // :31681
      ctx.globalAlpha = a;
      ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, num205 - 2, sw, sh);
      ctx.restore();
      return;
    }
    // 上升相：竖列段自 position.Y 向下到 num205（:31685-31701）
    let [sx, sy, sw, sh] = rect(this.frame, 0);              // 首段=动帧 row0
    let headDone = false;
    for (let sy2 = this.y; sy2 < num205; sy2 += sh) {
      const segH = Math.min(sh, num205 - sy2);               // 末段截断 :31690-31694
      const a = fade * lightAt(topX + sw / 2, sy2 + segH / 2);
      ctx.globalAlpha = a;
      ctx.drawImage(img, sx, sy, sw, segH, -sw / 2, sy2, sw, segH);
      if (!headDone) {                                       // :31697-31700 row 切换
        sy += chh;
        headDone = true;
      }
    }
    {                                                        // 列尾蛇盘 col4 :31702-31707
      const [cx4, cy4, cw4, ch4] = rect(4, 0);
      const a = fade * lightAt(topX + cw4 / 2, num205 - 2 + ch4 / 2);
      ctx.globalAlpha = a;
      ctx.drawImage(img, cx4, cy4, cw4, ch4, -cw4 / 2, num205 - 2, cw4, ch4);
    }
    ctx.restore();
  }
}
