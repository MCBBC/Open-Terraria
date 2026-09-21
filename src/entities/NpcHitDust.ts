// BJ254（2026-09-21）NPC.HitEffect 受击/死亡尘单源消费——vanilla-npcdust.json 查表驱动。
//
// 数据源：tools/extract-npcdust.mjs（Terarria1457/Terraria/NPC.cs HitEffect
// :82492-:90939 机械提取；1458 同区逐字节全等）。首批 = 78 门组 / 299 型；
// _meta.pending = 未接组滚动清单（batch2+ 可表达组 + 白名单外形态组）。
//
// ★原版无通用尘尾（HitEffect 最终 else = `if (type != 156) return` 的 156 专属支）：
// 表外型受击/死亡【不出尘】= 原版本相。BJ254 双向偏差收口（旧仓对未列型发通用彩色
// 粒子 = 多发+参数错）是本批唯一故意行为变化，tests/bj254-npcdust.test.ts 结构锁钉死。
//
// 语义（对齐 Dust.NewDust :75-196）：
//   · hit 相 count = ceil(dmg/lifeMax×hitK)（`for (num < dmg/(double)lifeMax*K)` 直译）；
//     death 相 = 固定 n；无 n/hitK = 1。
//   · hd = hitDirection（StrikeNPC 入参,调用侧恒 ±1；本仓由 kbx 符号蒸馏,0 兜 1——
//     与被替位的手块同约定,金标保形）。
//   · alpha='npc' → npc.alpha（本仓 spawnAlpha）；color='npc' → npc.color（本仓
//     colorRGBA,null=default(Color)）；scale='npc' → npc.scale（本仓 vanillaScale）。
//   · alt = `if (Main.rand.Next(K) op V) {posts} [else {posts}]` 逐尘掷骰直译
//     （59/60/151 尘 6 的 Next(8)!=0→noGravity 7/8、112/666 尘 18 的 Next(2)==0
//     → scale×0.6 否则 vel×1.4+noGravity）。
//   · posts 逐尘后置：ng/velMul/velDiv/scaleMul/scaleDiv/scaleSet/scaleSetNpc
//     （velMul/velDiv 对应 vanilla `velocity *= / /=`——先叠 NewDust 通用 ±2 抖动
//     再乘除,由引擎 VanillaDust.spawn 侧保真,此处只做调用侧算子）。
//   · anchor='center' → 盒顶左 = Center+(dx,dy)（372/373 中心±25 盒 50×50）。
//
// carve-out 不在本表/本模块：泼岩浆（BJ246 deathLavaSplash1457）、亡体 NewNPC 分裂链
// （母史莱姆/四柱/115 饿魂）、gore（vanilla-gore.json/GorePiece）、音效、135 探针生成。
import dustTableJson from '../data/vanilla-npcdust.json';
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';

/** post 算子（提取器 compilePostStmts 直译） */
type DustOp =
  | ['ng', boolean]
  | ['velMul', number] | ['velDiv', number]
  | ['scaleMul', number] | ['scaleDiv', number]
  | ['scaleSet', number] | ['scaleSetNpc', number];

/** `if (Main.rand.Next(K) op V) {ifOps} else {elseOps}` 概率分支（逐尘掷骰） */
interface DustAlt {
  k: number; op: '==' | '!='; v: number;
  ifOps: DustOp[] | null; elseOps: DustOp[] | null;
}

export interface NpcDustStmt {
  dust: number;
  n?: number;              // 固定计数（缺省 1）
  hitK?: number;           // ceil(dmg/lifeMax×K)——hit 相专用
  anchor?: 'center';       // 盒锚：Center+(dx,dy) 为盒顶左（缺省=实体 position）
  dx?: number; dy?: number;
  w?: number; h?: number;  // 盒尺寸（缺省=实体 w/h）
  sx?: number | string; sy?: number | string;
  alpha?: number | 'npc';
  color?: { r: number; g: number; b: number; a: number } | 'npc';
  scale?: number | 'npc';
  posts?: DustOp[];
  alt?: DustAlt;
  line: number;            // HitEffect 源锚行（守卫/对账反查用,运行时不消费）
}

interface NpcDustPhase { hit?: NpcDustStmt[]; death?: NpcDustStmt[]; }

const DUST_TABLE = dustTableJson as unknown as Record<string, NpcDustPhase>;

/** spX/spY token 求值（提取器白名单直译;白名单外 token 表里不会有,兜 0） */
function resolveSpeed(v: number | string | undefined, hd: number, e: Enemy): number {
  if (v === undefined) return 0;
  if (typeof v === 'number') return v;
  switch (v) {
    case 'hd': return hd;
    case '2hd': return 2 * hd;
    case '2.5hd': return 2.5 * hd;
    case '1.5hd': return 1.5 * hd;
    case '6hd': return 6 * hd;
    case '-1hd': return -hd;
    case '-1.5hd': return -1.5 * hd;
    case 'velX': return e.vx;
    case 'velY': return e.vy;
    case 'negVelX*0.2': return -e.vx * 0.2;
    case 'negVelY*0.2': return -e.vy * 0.2;
    case 'velX*0.2': return e.vx * 0.2;
    case 'velY*0.2': return e.vy * 0.2;
  }
  return 0;
}

/** post 算子应用（spawnDust 返回的活尘对象;池满 null 静默跳过=原版尘池语义） */
function applyOps(d: { noGravity: boolean; vx: number; vy: number; scale: number }, ops: DustOp[] | null | undefined, e: Enemy): void {
  if (!ops) return;
  for (const op of ops) {
    switch (op[0]) {
      case 'ng': d.noGravity = op[1]; break;
      case 'velMul': d.vx *= op[1]; d.vy *= op[1]; break;
      case 'velDiv': d.vx /= op[1]; d.vy /= op[1]; break;
      case 'scaleMul': d.scale *= op[1]; break;
      case 'scaleDiv': d.scale /= op[1]; break;
      case 'scaleSet': d.scale = op[1]; break;
      case 'scaleSetNpc': d.scale = op[1] * (e.vanillaScale ?? 1); break;
    }
  }
}

/** 单语句发射（盒/参解析 + 逐尘掷骰分支） */
function emitStmt(e: Enemy, game: GameHooks, hd: number, st: NpcDustStmt, dmg: number): void {
  const w0 = st.w ?? e.w;
  const h0 = st.h ?? e.h;
  const x = st.anchor === 'center' ? e.cx + (st.dx ?? 0) : e.x + (st.dx ?? 0);
  const y = st.anchor === 'center' ? e.cy + (st.dy ?? 0) : e.y + (st.dy ?? 0);
  const n = st.hitK != null
    ? Math.ceil((dmg / e.maxHp) * st.hitK)
    : (st.n ?? 1);
  if (n <= 0) return;
  const alpha = st.alpha === 'npc' ? e.spawnAlpha : (st.alpha ?? 0);
  const color = st.color === 'npc'
    ? (e.colorRGBA ? { r: e.colorRGBA[0], g: e.colorRGBA[1], b: e.colorRGBA[2], a: e.colorRGBA[3] ?? 255 } : null)
    : (st.color ?? null);
  const scale = st.scale === 'npc' ? (e.vanillaScale ?? 1) : (st.scale ?? 1);
  const sx = resolveSpeed(st.sx, hd, e);
  const sy = resolveSpeed(st.sy, hd, e);
  for (let k = 0; k < n; k++) {
    const d = game.spawnDust?.(x, y, w0, h0, st.dust, sx, sy, alpha, color, scale);
    if (!d) continue;
    const dust = d as unknown as { noGravity: boolean; vx: number; vy: number; scale: number };
    applyOps(dust, st.posts, e);
    if (st.alt) {
      const roll = Math.floor(Math.random() * st.alt.k);
      const pass = st.alt.op === '==' ? roll === st.alt.v : roll !== st.alt.v;
      applyOps(dust, pass ? st.alt.ifOps : st.alt.elseOps, e);
    }
  }
}

function applyPhase(e: Enemy, game: GameHooks, hd: number, phase: 'hit' | 'death', dmg: number): void {
  const rec = e.vanillaId != null ? DUST_TABLE[String(e.vanillaId)] : undefined;
  if (!rec) return;                     // 表外型 = 原版本相不出尘（结构锁见 bj254 测试）
  const stmts = rec[phase];
  if (!stmts) return;
  for (const st of stmts) emitStmt(e, game, hd, st, dmg);
}

/** 受击相（hurt() 实扣存活支,hitDirection=StrikeNPC 入参蒸馏,kbx 符号 0 兜 1） */
export function spawnNpcHitDust(e: Enemy, game: GameHooks, hd: number, dmg: number): void {
  applyPhase(e, game, hd, 'hit', dmg);
}

/** 死亡相（hurt() 死亡管线,HitEffect life<=0 支） */
export function spawnNpcDeathDust(e: Enemy, game: GameHooks, hd: number): void {
  applyPhase(e, game, hd, 'death', 0);
}
