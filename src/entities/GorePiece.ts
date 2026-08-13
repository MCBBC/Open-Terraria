// Gore 死亡碎块（Terraria/Gore.cs 1:1）+ NPC.HitEffect 死亡 gore 全表驱动。
//   数据：src/data/vanilla-gore.json（tools/extract-gore.mjs 从 NPC.cs HitEffect
//         :82421-:90873 提取；表结构/字段语义见其 _meta.notes）
//   物理：Gore.Update（Gore.cs:313-1102）——本表能产出的家族全实现：
//     · 默认粘滞碎块：重力 0.2 + rotation += vx*0.05（:762-763）→ 碰撞盒
//       min(w,h)*0.9*scale（:1000-1014）→ 落地 vx*=0.97（:1015-1029）→
//       timeLeft -= DisappearSpeed / alpha += DisappearSpeedAlpha（:1030-1037）
//     · 血块收缩族 {11,12,13,16,17,61,62,63,99,220-222,375-377,435-437,861-862}
//       非粘滞：v*=0.98 + scale-=0.007/0.01（:535-556）+ alpha += 2*AlphaSpeed（:1041）
//     · 276-282（庆典史莱姆彩带）：v*=0.98 + vy<scale 时 +0.05 + ±0.01 翻滚（:352-371）
//       叠加默认重力支与粘滞碰撞
//     · SpecialAI 1 帆降族（860/892/893 海盗船残骸、1014-1016 黑魔法师长袍）：
//       Gore_UpdateSail（:1231-1291）相位下落 + 碰撞转落地滑移
//     · SpecialAI 7（1218 暗影宝箱怪钱币）：UpdateLightningBunnySparks（:244-262）
//       timeLeft 倒数 + alpha = lerp(255,0,timeLeft/15)
//   出生：Gore.NewGore（:1306-1482）——vy -= rand(10,31)*0.1 / vx += rand(-20,21)*0.1
//   随机扰动（:1347-1348）、粘滞/时档（:1361-1374）、600 槽池（:1328-1340）。
//   落叶(SpecialAI 3)/滴水族不出自 HitEffect，由 render/NatureParticles 独占。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { moveAndCollide } from '../physics/TileCollision';
import goreTable from '../data/vanilla-gore.json';

/** Gore.goreTime（Gore.cs:16） */
export const GORE_TIME = 600;
/** Main.gore 池容量（Gore.cs:1328-1340：无空槽则丢弃） */
const MAX_GORE = 600;
/** 纹理缺失时的碰撞盒回退（Gore.cs:999 num36=32） */
const FALLBACK_TEX = 32;

/** NewGore :1361-1364 sticky=false 族（goreTime!=0 时） */
const NON_STICKY_TYPES = new Set([11, 12, 13, 16, 17, 61, 62, 63, 99, 220, 221, 222, 435, 436, 437, 861, 862]);
/** 血块收缩族（Gore.cs:535-556；16/17 为 0.01 档） */
const SHRINK_TYPES = new Set([11, 12, 13, 61, 62, 63, 99, 220, 221, 222, 375, 376, 377, 435, 436, 437, 861, 862]);
/** 彩带阻尼族（Gore.cs:352-371） */
const isDampRibbon = (t: number) => t >= 276 && t <= 282;
/** GoreID.Sets.SpecialAI==1（GoreID.cs:9）：帆降 */
const SAIL_TYPES = new Set([860, 892, 893, 1014, 1015, 1016]);
/** 多帧行数（NewGore :1391-1398：1201/1208→4、1217/1218→3；表内仅 1218 实际出现） */
const FRAME_ROWS: Record<number, number> = { 1201: 4, 1208: 4, 1217: 3, 1218: 3, 1225: 3 };
/** GoreID.Sets.DisappearSpeed（GoreID.cs:11，默认 1） */
const DISAPPEAR_SPEED: Record<number, number> = { 1007: 3, 1008: 10, 1024: 7, 1025: 7, 1026: 7 };
/** GoreID.Sets.DisappearSpeedAlpha（GoreID.cs:13，默认 1） */
const DISAPPEAR_ALPHA: Record<number, number> = { 1007: 3, 1008: 10, 1024: 7, 1025: 7, 1026: 7, 1218: 3 };
const vanishSpeed = (t: number) => DISAPPEAR_SPEED[t] ?? 1;
const vanishAlpha = (t: number) => DISAPPEAR_ALPHA[t] ?? 1;

/** vanilla-gore.json 表项（字段语义见提取器 _meta.notes） */
export interface GoreSpawnEntry {
  id?: number | null;
  idMin?: number; idMax?: number; ids?: number[]; n?: number;
  /** 常量速度 */
  vx?: number; vy?: number;
  /** NPC 速度系数（velocity * k） */
  kx?: number; ky?: number;
  /** 均匀随机速度 [m-a, m+a]（Main.rand.Next 区间编译产物） */
  mx?: number; my?: number; ax?: number; ay?: number;
  /** vx 取击退方向（new Vector2(hitDirection, 0f)） */
  hd?: number;
  /** 出生点 = npc 左上角 + off + frac*[w,h] + rand*[w,h] */
  ox?: number; oy?: number; fx?: number; fy?: number; rx?: number; ry?: number;
  scale?: number; scaleExpr?: string;
  /** 未编译的原文（登记用） */
  posExpr?: string; velExpr?: string; expr?: string;
  /** 原版 ai[N]==V 门（不满足跳过该条） */
  ai?: Array<{ slot: number; value: number; not?: boolean }>;
  gates?: string[];
  /** Gore.NewGorePerfect：精确 pos/vel（随机扰动后回写，:1293-1299） */
  perfect?: boolean;
  line?: number;
}

/** 死亡来源 NPC 的最小形状（Enemy/Critter 均满足；测试可传 mock） */
export interface GoreNpcSource {
  vanillaId: number | null;
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  vanillaScale: number;
  ai0: number; ai1: number; ai2: number; ai3: number;
  hitDir?: number;
}

type GoreTable = Record<string, GoreSpawnEntry[]> & {
  _meta: { tex: Record<string, { w: number; h: number }>; [k: string]: unknown };
};
const TABLE = goreTable as unknown as GoreTable;
const TEX = TABLE._meta?.tex ?? {};

/** NPC id → 死亡 gore 表项（无表项 = 原版只出尘不出块，如史莱姆族） */
export function deathGoreFor(npcId: number): GoreSpawnEntry[] {
  return TABLE[String(npcId)] ?? [];
}

const irand = (n: number) => Math.floor(Math.random() * n);
/** Main.rand.Next(min, max) 语义：[min, max-1] */
const irand2 = (min: number, max: number) => min + Math.floor(Math.random() * (max - min));
const uniform = (m: number, a: number) => m + (Math.random() * 2 - 1) * a;

/** 存活 gore 池（= Main.gore 600 槽；渲染层 drawGorePieces 也从这里取） */
const livePool = new Set<GorePiece>();
/** 切世界/重载时清池（EntityManager.clear 会丢弃引用但不置 dead，计数须同步归零） */
export function resetGorePool(): void {
  livePool.clear();
}
/** 当前存活 gore（渲染/诊断用） */
export function liveGorePieces(): GorePiece[] {
  return [...livePool];
}

export class GorePiece extends Entity {
  /** Gore.type（贴图 Gore_<type>.png） */
  readonly goreId: number;
  rotation = 0;
  scale: number;
  alpha = 0;
  timeLeft = GORE_TIME;
  sticky = true;
  /** 贴图原始尺寸（碰撞盒与绘制基准；缺失回退 32） */
  texW: number;
  texH: number;
  /** SpriteFrame 行（多帧竖条：1217/1218 等） */
  row = 0;
  private frameCounter = 0;

  constructor(type: number, x: number, y: number, scale: number) {
    super();
    this.goreId = type;
    this.scale = scale;
    const tex = TEX[type];
    this.texW = tex?.w ?? FALLBACK_TEX;
    this.texH = tex?.h ?? FALLBACK_TEX;
    this.x = x;
    this.y = y;
    this.resizeBox();
  }

  /** 碰撞盒 = min(texW,texH)*0.9*scale（Gore.cs:1000-1014） */
  private resizeBox() {
    const raw = Math.min(this.texW, this.texH) * 0.9 * this.scale;
    this.w = Math.max(2, Math.floor(raw));
    this.h = this.w;
  }

  /** Gore.NewGore（Gore.cs:1306-1482）：池满/type 非法则弃；返回 null */
  static newGore(
    type: number, x: number, y: number, vx: number, vy: number, scale = 1, perfect = false,
  ): GorePiece | null {
    if (type < 0 || livePool.size >= MAX_GORE) return null;
    const g = new GorePiece(type, x, y, scale);
    g.vx = vx; g.vy = vy;
    if (!perfect) {
      // :1347-1348 随机扰动：vy -= Next(10,31)*0.1 ∈ [-3.0,-1.0]；vx += Next(-20,21)*0.1 ∈ [-2.0,2.0]
      g.vy -= irand2(10, 31) * 0.1;
      g.vx += irand2(-20, 21) * 0.1;
    }
    g.rotation = 0;
    g.alpha = 0;
    // :1361-1374 粘滞与时档
    if (NON_STICKY_TYPES.has(type)) {
      g.sticky = false;
    } else if (type >= 375 && type <= 377) {
      g.sticky = false;
      g.alpha = 100;
    } else {
      g.sticky = true;
      g.timeLeft = GORE_TIME;
    }
    // :1391-1398 多帧族（Frame=SpriteFrame(1,rows)，行 0 起；1218 首帧随机行在 Update 内）
    if (FRAME_ROWS[type]) g.row = 0;
    // :1442-1449（907-909 随机起始帧；本表未出现，保留语义）
    if (type >= 907 && type <= 909) g.row = irand(3);
    livePool.add(g);
    return g;
  }

  /** 每固定 tick（Gore.Update，Gore.cs:313-1102） */
  fixedUpdate(dt: number, game: GameHooks): void {
    void dt;
    if (this.dead) return;
    const st = game.world.store;
    const t = this.goreId;

    // sticky 入口：越界消亡 + 速度钳 32（:319-329 / DeactivateIfOutsideOfWorld :297-311）
    if (this.sticky) {
      const tx = Math.floor(this.x / 16), ty = Math.floor(this.y / 16);
      if (!st.inBounds(tx, ty)) { this.kill(); return; }
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 32) { this.vx *= 32 / sp; this.vy *= 32 / sp; }
    }

    // SpecialAI 7（1218）：UpdateLightningBunnySparks :244-262（switch :331-345 早退）
    if (t === 1218) {
      if (this.frameCounter === 0) {
        this.frameCounter = 1;
        this.row = irand(3); // Frame(1,3) 内随机行
      }
      this.timeLeft -= vanishSpeed(t);
      if (this.timeLeft <= 0) { this.kill(); return; }
      this.alpha = Math.round(255 - (255 * Math.max(0, this.timeLeft)) / 15);
      this.x += this.vx;
      this.y += this.vy;
      if (this.alpha >= 255) this.kill();
      return;
    }

    if (SAIL_TYPES.has(t)) { this.updateSail(game); return; }

    // ---- 位移前物理（:352-769 链）----
    if (isDampRibbon(t)) {
      // :352-371 彩带阻尼
      this.vx *= 0.98;
      this.vy *= 0.98;
      if (this.vy < this.scale) this.vy += 0.05;
      if (this.vy > 0.1) this.rotation += this.vx > 0 ? 0.01 : -0.01;
      this.vy += 0.2;                 // 默认重力支（:760-764）
      this.rotation += this.vx * 0.05;
    } else if (SHRINK_TYPES.has(t)) {
      // :535-556 血块收缩（16/17 为 0.01 档——本表未出现，语义保留）
      this.vy *= 0.98;
      this.vx *= 0.98;
      this.scale -= (t === 16 || t === 17) ? 0.01 : 0.007;
      if (this.scale < 0.1) { this.scale = 0.1; this.alpha = 255; }
      this.resizeBox();
    } else {
      // 默认支（:760-764）：重力 0.2 + 随 vx 翻滚
      this.vy += 0.2;
      this.rotation += this.vx * 0.05;
    }

    // ---- 碰撞/时档尾段（:929-1042）----
    if (this.sticky) {
      moveAndCollide(this, game.world, this.vx, this.vy);
      if (this.vy === 0) {
        // 落地摩擦（:1015-1029）：|vx|<0.01 归零
        this.vx *= 0.97;
        if (this.vx > -0.01 && this.vx < 0.01) this.vx = 0;
      }
      if (this.timeLeft > 0) this.timeLeft -= vanishSpeed(t);
      else this.alpha += vanishAlpha(t);
    } else {
      // :1041 非粘滞：两倍速渐隐
      this.alpha += 2 * vanishAlpha(t);
      this.x += this.vx;
      this.y += this.vy;
    }

    if (this.alpha >= 255) this.kill();
  }

  /** Gore_UpdateSail（Gore.cs:1231-1291）：相位下落；碰撞转落地滑移支 */
  private updateSail(game: GameHooks): void {
    const t = this.goreId;
    if (this.vy < 0) {
      // 落地滑移支（:1233-1261）：只推 velocity.X，不推进 position
      let moveX = this.vx;
      const size = Math.floor(Math.min(this.texW, this.texH) * 0.9 * this.scale);
      const probe = { x: this.x, y: this.y, w: size, h: size, vx: moveX, vy: 0.6, onGround: false, hitWall: false, hitHead: false };
      moveAndCollide(probe, game.world, moveX, 0.6);
      moveX = probe.vx * 0.97;
      if (moveX > -0.01 && moveX < 0.01) moveX = 0;
      if (this.timeLeft > 0) this.timeLeft -= vanishSpeed(t);
      else this.alpha += vanishAlpha(t);
      this.vx = moveX;
      if (this.alpha >= 255) this.kill();
      return;
    }
    // 下落支（:1263-1290）：vy 兼作相位累加器；UnitY.RotatedBy(vy) = (−sin, cos)，Y 取 |·|
    this.vy += Math.PI / 60;
    const dx = -Math.sin(this.vy) * 2 * 2;
    const dy = Math.abs(Math.cos(this.vy)) * 3 * 2;
    const size = Math.floor(Math.min(this.texW, this.texH) * 0.9 * this.scale);
    const body = { x: this.x, y: this.y, w: size, h: size, vx: dx, vy: dy, onGround: false, hitWall: false, hitHead: false };
    moveAndCollide(body, game.world, dx, dy);
    if (body.vx !== dx || body.vy !== dy) this.vy = -1; // 碰撞 → 落地支
    this.x = body.x;
    this.y = body.y;
    this.rotation = Math.atan2(body.vy, body.vx) + Math.PI;
    if (this.timeLeft > 0) this.timeLeft -= vanishSpeed(t);
    else this.alpha += vanishAlpha(t);
    if (this.alpha >= 255) this.kill();
  }

  private kill(): void {
    if (this.dead) return;
    this.dead = true;
    livePool.delete(this);
  }

  /** Renderer 统一绘制（Main.DrawGore Main.cs:21712-21742：中心锚 + scale + rotation） */
  draw(): void { /* 见 Renderer.drawGorePieces */ }

  /** 多帧行数（1 = 整张贴图） */
  get frameRows(): number {
    return FRAME_ROWS[this.goreId] ?? 1;
  }
}

/** 表项 → 具体 gore id（区间/候选均匀取值；不可求值跳过） */
function entryId(e: GoreSpawnEntry): number | null {
  if (typeof e.id === 'number') return e.id;
  if (e.idMin != null && e.idMax != null) return e.idMin + irand(e.idMax - e.idMin + 1);
  if (e.ids?.length) return e.ids[irand(e.ids.length)];
  return null;
}

/** 表项 → 出生点（基准 = NPC 左上角；编译字段线性组合，未编译回退原点） */
function entryPos(e: GoreSpawnEntry, s: GoreNpcSource): { x: number; y: number } {
  return {
    x: s.x + (e.ox ?? 0) + (e.fx ?? 0) * s.w + (e.rx ? Math.random() * s.w : 0),
    y: s.y + (e.oy ?? 0) + (e.fy ?? 0) * s.h + (e.ry ? Math.random() * s.h : 0),
  };
}

/** 表项 → 初始速度（缺省继承 NPC 速度；编译字段线性组合） */
function entryVel(e: GoreSpawnEntry, s: GoreNpcSource): { vx: number; vy: number } {
  return {
    vx: (e.vx ?? (e.kx ?? 1) * s.vx) + (e.ax != null ? uniform(e.mx ?? 0, e.ax) : 0) + (e.hd ? s.hitDir ?? 0 : 0),
    vy: (e.vy ?? (e.ky ?? 1) * s.vy) + (e.ay != null ? uniform(e.my ?? 0, e.ay) : 0),
  };
}

/** 表项 ai 门（原版 `ai[N] == V`）：不满足跳过 */
function aiGateOk(e: GoreSpawnEntry, s: GoreNpcSource): boolean {
  if (!e.ai?.length) return true;
  return e.ai.every((g) => {
    const v = g.slot === 0 ? s.ai0 : g.slot === 1 ? s.ai1 : g.slot === 2 ? s.ai2 : s.ai3;
    return g.not ? v !== g.value : v === g.value;
  });
}

/** 按表炸出某 NPC 的全部死亡 gore；add = 实体入桶回调。返回生成数 */
export function spawnDeathGore(s: GoreNpcSource, add: (p: GorePiece) => void): number {
  if (s.vanillaId == null) return 0;
  const list = deathGoreFor(s.vanillaId);
  let n = 0;
  for (const e of list) {
    if (!aiGateOk(e, s)) continue;
    const type = entryId(e);
    if (type == null || type < 0) continue; // expr 留档条目（提取器不可静态求值）
    const pos = entryPos(e, s);
    const vel = entryVel(e, s);
    const scale = e.scale ?? (e.scaleExpr === 'scale' ? s.vanillaScale : 1);
    const g = GorePiece.newGore(type, pos.x, pos.y, vel.vx, vel.vy, scale, !!e.perfect);
    if (g) { add(g); n++; }
  }
  return n;
}

/** Enemy/Critter 死亡钩子：查表炸 gore（props 桶；表空 = 原版只出尘，返回 0）。
 *  hitDir = HitEffect 的 hitDirection（击退方向，`new Vector2(hitDirection, 0f)` 类表项用） */
export function spawnNpcDeathGore(npc: GoreNpcSource, game: GameHooks, hitDir?: number): number {
  const add = (game as unknown as {
    entities?: { add?: (p: unknown, bucket: string) => void };
  }).entities;
  if (!add?.add) return 0;
  const src: GoreNpcSource = hitDir === undefined ? npc : { ...npc, hitDir };
  return spawnDeathGore(src, (p) => add.add!(p, 'props'));
}
