// BJ254（2026-09-21）NPC.HitEffect 受击/死亡尘单源消费——vanilla-npcdust.json 查表驱动。
// BJ296（2026-09-23）批2 概率门接入：语句级分支（roll 单掷二选一）/循环组（loop body 逐拍
// 按序）/pre 臂条件（判负→e 臂不掷=原版 && 短路）与 gate 区域门（判负→整支跳过）/idRand 逐尘掷 id/
// scaleAddR01 post（scale+=NextFloat）。
// BJ304（2026-09-23）批3 fadeIn 定谳翻案接入：★fadeIn=生长目标语义（原版 Dust.cs :2148-2171:
// 0<fadeIn<100 时 scale+=0.03/t 至超 fadeIn 归零转衰落,无 alpha 参与——BJ296 曾误登记
// 「alpha 渐入/本仓不可用」;本仓 VDust.fadeIn 在位+老化链 1:1 fx/VanillaDust.ts :740-745）
// → 新 post 算子 ['fadeIn',N]（活尘对象后置赋值=原版 NewDust 后写同相）;无臂 branch=
// 掷流占位（roll 照耗零尘,524 静态死臂）;426/427 death 半接（d241 主环入表,SelectRandom
// 环 pending:noLight 引擎不消费+idPick 未建）。
//
// 数据源：tools/extract-npcdust.mjs（Terarria1457/Terraria/NPC.cs HitEffect
// :82492-:90939 机械提取；1458 同区逐字节全等）。首批 = 78 门组 / 275 型（BJ254）；
// 批2 = 概率门族 15 型（134-136/262-265/407/409/410/411/428/478/516/636,BJ296）；
// 批3 = fadeIn 定谳翻案族 18 型（415-421/423-427/429/518/524-527,BJ304）；
// _meta.pending = 未接组滚动清单（661 四缺口零尘登记/426-427 SelectRandom 环/批4 oldPos 族）。
//
// ★原版无通用尘尾（HitEffect 最终 else = `if (type != 156) return` 的 156 专属支）：
// 表外型受击/死亡【不出尘】= 原版本相。BJ254 双向偏差收口（旧仓对未列型发通用彩色
// 粒子 = 多发+参数错）是本批唯一故意行为变化，tests/bj254-npcdust.test.ts 结构锁钉死。
//
// 语义（对齐 Dust.NewDust :75-196 执行语义 + HitEffect 源序）：
//   · hit 相 count = ceil(dmg/lifeMax×hitK)（`for (num < dmg/(double)lifeMax*K)` 直译）；
//     death 相 = 固定 n；无 n/hitK = 1。
//   · ★掷序纪律（playbook 反伪影）：所有 Main.rand 掷与原版同拍同序——循环组逐拍走
//     body（先出尘后掷门/先掷门后出尘按源序）；分支单掷二选一（勿双掷）；pre 谓词在
//     掷前短路（life 判负→走 else 臂且不耗掷,与 C# && 短路同相）；alt/leaf 掷在 spawn
//     之后（post 形）。掷流通道 = Math.random（批1 alt 同源;测试侧 seededRandom 钉流）。
//   · hd = hitDirection（StrikeNPC 入参,调用侧恒 ±1；本仓由 kbx 符号蒸馏,0 兜 1）。
//   · alpha='npc' → npc.alpha（本仓 spawnAlpha）；color='npc' → npc.color（本仓
//     colorRGBA,null=default(Color)）；scale='npc' → npc.scale（本仓 vanillaScale）。
//   · pre 谓词（命中时点 hp=post-deduction,StrikeNPC :82206/:82213 life-=num 先于
//     HitEffect :82325——与原版 HitEffect 相位内 life 同相）：
//     lifeGtHalf = hp > floor(maxHp/2)（C# lifeMax/2 整除）；lifeLt0 = hp < 0（265
//     `life>=0 return`：life==0 拍原版不出尘）。
//   · posts 逐尘后置：ng/velMul/velDiv/scaleMul/scaleDiv/scaleSet/scaleSetNpc/
//     scaleAddR01（velMul/velDiv 对应 vanilla `velocity *= / /=`——先叠 NewDust 通用
//     ±2 抖动再乘除,由引擎 VanillaDust.spawn 侧保真,此处只做调用侧算子）。
//   · alt = `if (Main.rand.Next(K) op V) {posts} [else {posts}]` 逐尘掷骰直译
//     （59/60/151 尘 6 的 Next(8)!=0→noGravity 7/8、112/666 尘 18 的 Next(2)==0
//     → scale×0.6 否则 vel×1.4+noGravity）。
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
  | ['scaleSet', number] | ['scaleSetNpc', number]
  | ['scaleAddR01']
  | ['fadeIn', number];   // ★BJ304 批3:原版生长目标语义（Dust.cs :2148-2171）,引擎侧老化 1:1

/** 谓词求值：pre=臂条件（判负→e 臂不掷）|gate=区域门（判负→整元素跳过）；均不耗掷 */
export type NpcDustPre = 'lifeGtHalf' | 'lifeLt0';

/** `if (Main.rand.Next(K) op V) {ifOps} else {elseOps}` 概率分支（逐尘掷骰） */
interface DustAlt {
  k: number; op: '==' | '!='; v: number;
  ifOps: DustOp[] | null; elseOps: DustOp[] | null;
}

export interface NpcDustStmt {
  dust: number;
  idRand?: number;         // dust = dust + Next(idRand) 逐尘掷 id（478：237/238）
  n?: number;              // 固定计数（缺省 1）
  hitK?: number;           // ceil(dmg/lifeMax×K)——hit 相专用
  gate?: NpcDustPre[];     // 区域门（phaseAfterPre 早退面）：判负→整 stmt 跳过,不耗掷
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

/** 语句级概率分支：`if (Main.rand.Next(K) op V) {t} [else {e}]`（单掷二选一；pre 先短路） */
export interface NpcDustBranch {
  pre?: NpcDustPre[];      // 臂条件（与 roll 同一 if）：判负→e 臂且不耗掷（&& 短路同相）
  gate?: NpcDustPre[];     // 区域门（早退面）：判负→整支跳过
  roll: { k: number; op: '==' | '!='; v: number };
  n?: number; hitK?: number;
  t?: NpcDustEl[];
  e?: NpcDustEl[];
  line: number;
}

/** 循环组：for 体多元素（逐拍按序走 body——掷流/出尘序与原版同相） */
export interface NpcDustLoop {
  n?: number; hitK?: number;
  body: NpcDustEl[];
  line?: number;
}

export type NpcDustEl = NpcDustStmt | NpcDustBranch | NpcDustLoop;

interface NpcDustPhase { hit?: NpcDustEl[]; death?: NpcDustEl[]; }

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

/** pre 谓词求值（命中/死亡时点 hp = post-deduction,与原版 HitEffect 相位内 life 同相） */
function prePass(pre: NpcDustPre[] | undefined, e: Enemy): boolean {
  if (!pre) return true;
  for (const p of pre) {
    if (p === 'lifeGtHalf' && !(e.hp > Math.floor(e.maxHp / 2))) return false;
    if (p === 'lifeLt0' && !(e.hp < 0)) return false;
  }
  return true;
}

/** post 算子应用（spawnDust 返回的活尘对象;池满 null 静默跳过=原版尘池语义） */
function applyOps(d: { noGravity: boolean; vx: number; vy: number; scale: number; fadeIn: number }, ops: DustOp[] | null | undefined, e: Enemy): void {
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
      case 'scaleAddR01': d.scale += Math.random(); break;   // vanilla `scale += Main.rand.NextFloat()`
      case 'fadeIn': d.fadeIn = op[1]; break;                // vanilla `dust.fadeIn = N`（生长目标,首拍引擎老化链消费）
    }
  }
}

/** 循环计数：hitK=ceil(dmg/lifeMax×K)（hit 相 dmg 直传）;death 相固定 n */
function countOf(el: { n?: number; hitK?: number }, dmg: number, e: Enemy): number {
  if (el.hitK != null) return Math.ceil((dmg / e.maxHp) * el.hitK);
  return el.n ?? 1;
}

/** 单语句发射（盒/参解析 + 逐尘掷骰分支） */
function emitStmt(e: Enemy, game: GameHooks, hd: number, st: NpcDustStmt, dmg: number): void {
  const w0 = st.w ?? e.w;
  const h0 = st.h ?? e.h;
  const x = st.anchor === 'center' ? e.cx + (st.dx ?? 0) : e.x + (st.dx ?? 0);
  const y = st.anchor === 'center' ? e.cy + (st.dy ?? 0) : e.y + (st.dy ?? 0);
  const n = countOf(st, dmg, e);
  if (n <= 0) return;
  const alpha = st.alpha === 'npc' ? e.spawnAlpha : (st.alpha ?? 0);
  const color = st.color === 'npc'
    ? (e.colorRGBA ? { r: e.colorRGBA[0], g: e.colorRGBA[1], b: e.colorRGBA[2], a: e.colorRGBA[3] ?? 255 } : null)
    : (st.color ?? null);
  const scale = st.scale === 'npc' ? (e.vanillaScale ?? 1) : (st.scale ?? 1);
  const sx = resolveSpeed(st.sx, hd, e);
  const sy = resolveSpeed(st.sy, hd, e);
  if (!prePass(st.gate, e)) return;                     // 区域门：判负整 stmt 跳过（life==0 拍原版不出尘）
  for (let k = 0; k < n; k++) {
    const dustId = st.idRand != null ? st.dust + Math.floor(Math.random() * st.idRand) : st.dust;
    const d = game.spawnDust?.(x, y, w0, h0, dustId, sx, sy, alpha, color, scale);
    if (!d) continue;
    const dust = d as unknown as { noGravity: boolean; vx: number; vy: number; scale: number; fadeIn: number };
    applyOps(dust, st.posts, e);
    if (st.alt) {
      const roll = Math.floor(Math.random() * st.alt.k);
      const pass = st.alt.op === '==' ? roll === st.alt.v : roll !== st.alt.v;
      applyOps(dust, pass ? st.alt.ifOps : st.alt.elseOps, e);
    }
  }
}

/** 元素发射（stmt|branch|loop 统一入口；掷序=源序） */
function emitEl(e: Enemy, game: GameHooks, hd: number, el: NpcDustEl, dmg: number): void {
  if ('body' in el) {
    const n = countOf(el, dmg, e);
    for (let k = 0; k < n; k++) {
      for (const child of el.body) emitEl(e, game, hd, child, dmg);
    }
    return;
  }
  if ('roll' in el) {
    if (!prePass(el.gate, e)) return;                   // 区域门：判负整支跳过,不耗掷
    const n = countOf(el, dmg, e);
    for (let k = 0; k < n; k++) {
      if (!prePass(el.pre, e)) {                        // 臂条件判负：走 else 臂,不耗掷（&& 短路同相）
        if (el.e) for (const child of el.e) emitEl(e, game, hd, child, dmg);
        continue;
      }
      const roll = Math.floor(Math.random() * el.roll.k);
      const pass = el.roll.op === '==' ? roll === el.roll.v : roll !== el.roll.v;
      const arm = pass ? el.t : el.e;
      if (arm) for (const child of arm) emitEl(e, game, hd, child, dmg);
    }
    return;
  }
  emitStmt(e, game, hd, el, dmg);
}

function applyPhase(e: Enemy, game: GameHooks, hd: number, phase: 'hit' | 'death', dmg: number): void {
  const rec = e.vanillaId != null ? DUST_TABLE[String(e.vanillaId)] : undefined;
  if (!rec) return;                     // 表外型 = 原版本相不出尘（结构锁见 bj254 测试）
  const els = rec[phase];
  if (!els) return;
  for (const el of els) emitEl(e, game, hd, el, dmg);
}

/** 受击相（hurt() 实扣存活支,hitDirection=StrikeNPC 入参蒸馏,kbx 符号 0 兜 1） */
export function spawnNpcHitDust(e: Enemy, game: GameHooks, hd: number, dmg: number): void {
  applyPhase(e, game, hd, 'hit', dmg);
}

/** 死亡相（hurt() 死亡管线,HitEffect life<=0 支） */
export function spawnNpcDeathDust(e: Enemy, game: GameHooks, hd: number): void {
  applyPhase(e, game, hd, 'death', 0);
}
