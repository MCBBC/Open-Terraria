// IIII97c 流反演重放：把 x86 真值骰流灌入 JS runLivingTreesPass（StreamRNG 定长队列），
// 每掷做值域闸：JS 若在此处多掷/少掷，队列后续取值将撞出 [a,b] ⇒ 首个越位点即
// 「语义面分叉」的现场。输出：八通道对拍 + 越位清单首 20 条。
// 用法：
//   cd game && SW_I109_X86STREAM=<rollwin> SW_I109_MARK=1 npx vitest run tools/_iii109s.test.ts
// 需要 cap-lt 基座（_iii101a CAP 已产）与 G2 dumps。
import { it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runLivingTreesPass } from '../src/world/gen/vanilla/LivingTreePass';

const RUN = process.env.SW_ORACLE === "1";   // ★一次性 rig/oracle 仪(2026-09-02 补门):夹具在 /tmp 不入库,缺省 skip 防默认 sweep 红;SW_ORACLE=1 启用

const OUT = process.env.SW_I101_OUT ?? '/tmp/iii101-out/cap-lt';
const G2 = process.env.SW_I101_G2 ?? '/tmp/iii80-out/x86-sparkle';
const CMP_IDX = Number(process.env.SW_I101_CMP ?? 42);
const STREAM = process.env.SW_I109_X86STREAM ?? '';
const W = RUN ? Number(JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8')).w) : 0;   // ★套件门:RUN=0 不读夹具
const H = RUN ? Number(JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8')).h) : 0;
const N = W * H;

function slicePass(p: string): number[] {
  const out: number[] = [];
  const wantName = process.env.SW_I109_PASSNAME ?? 'Living Trees';
  let on = process.env.SW_I109_SLICEON === '1'; // 无文件头模式=全量
  const vals: Array<string> = [];
  const lines = readFileSync(p, 'utf8').split('\n');
  let inTarget = false;
  for (const ln of lines) {
    const s = ln.trim();
    if (!s) continue;
    if (s.startsWith('---')) {
      if (inTarget && s.startsWith('---PASS') === false) continue; // ---END 等边界
      const isStart = s.startsWith('---START');
      const m = s.match(/^---PASS (\d+) (.+)$/);
      if (m) {
        if (inTarget && m[2] === wantName) break; // 目标 pass 结束行
        if (!inTarget && m[1] === String(CMP_IDX - 1)) { inTarget = true; continue; }
      }
      void isStart;
      continue;
    }
    if (inTarget) vals.push(s);
  }
  for (const s of vals) { const v = parseInt(s, 10); if (!Number.isNaN(v)) out.push(v); }
  return out;
}

class StreamRNG {
  /** ★IIIII97c 终版语义：队列存的是 UnifiedRandom.InternalSample **原始样本**
   * （非负 int32，与 rig JJHook.OnRoll 同位）。每次 Next 按原版公式还原逻辑值：
   *   Next(min,maxExcl) = min + trunc(sample × (range))
   * ⇒ 队列耗尽位即「形状完美对齐」判据；任何溢出/残余都是消费序分叉现场。 */
  static K = 4.656612875245797e-10;
  q: number[];
  i = 0;
  overflow: Array<{ pos: number; call: string }> = [];
  lastCall = '?';
  trace: Array<[number, string]> = [];
  TRACE_ON = false;
  constructor(queue: number[]) { this.q = queue; }
  private bump(call: string): number {
    const v = this.q[this.i];
    this.lastCall = call;
    this.i++;
    if (this.TRACE_ON && this.trace.length < 200000) this.trace.push([this.i - 1, call]);
    if (v === undefined) {
      this.overflow.push({ pos: this.i - 1, call });
      return 0;
    }
    return v;
  }
  /** 一次原始样本 → [0,1) Sample 等价 */
  private sample(v: number): number { return v * StreamRNG.K; }
  nextDouble(): number { return this.sample(this.bump('NextDouble')); }
  next(): number { return this.bump('Next()'); }
  nextIntRange(lo: number, hiExcl: number): number {
    const v = this.bump(`NextRange(${lo},${hiExcl})`);
    return lo + Math.trunc(this.sample(v) * (hiExcl - lo));
  }
  int(min: number, maxIncl: number): number {
    return this.nextIntRange(min, maxIncl + 1);
  }
  nextInt(maxV: number): number {
    const v = this.bump(`Next(${maxV})`);
    return Math.trunc(this.sample(v) * maxV);
  }
}

function hydrate(): { st: TileStore; hdr: Record<string, unknown>; gsRaw: Record<string, unknown> } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8')) as Record<string, unknown>;
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gsRaw = JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8')) as Record<string, unknown>;
  return { st, hdr, gsRaw };
}
function desVal(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(x => desVal(x));
  if (v && typeof v === 'object') {
    const o = v as { __t?: string; d?: unknown[] };
    if (o.__t) {
      const Ctor = (globalThis as unknown as Record<string, new (n: number) => { set(a: unknown[]): void }>)[o.__t];
      const arr = new Ctor((o.d ?? []).length);
      arr.set(o.d as never);
      return arr;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

(RUN ? it : it.skip)('III109s: stream-fed reverse replay', async () => {
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), f.replace(/\.typ$/, '').slice(4));
  }
  const pre = `${G2}/${String(CMP_IDX).padStart(3, '0')}_${DUMPNAME.get(CMP_IDX)}`;
  if (!existsSync(`${pre}.typ`)) throw new Error(`dump missing ${pre}`);
  const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
  const xa = readFileSync(`${pre}.act`), xt = le16(`${pre}.typ`), xw = le16(`${pre}.wal`);

  const { st } = hydrate();
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8')));

  const queue = slicePass(STREAM);
  console.log(`queue n=${queue.length} head=${queue.slice(0, 5)} tail=${queue.slice(-3)}`);
  const srng = new StreamRNG(queue);
  (globalThis as unknown as Record<string, unknown>).__ltRc = { n: 0 };
  runLivingTreesPass(st, srng as never, gs as never, []);
  console.log(`consumed=${srng.i}/${queue.length} overflowEvents=${srng.overflow.length} leftoverValues=${Math.max(0, queue.length - srng.i)}`);
  for (const o of srng.overflow.slice(0, 10)) console.log(`OVERFLOW#${o.pos} call=${o.call}`);
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i2 = 0; i2 < TILE_DEFS.length; i2++) { const s = TILE_DEFS[i2]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i2] = s; }
  let dA = 0, dT = 0, dW = 0;
  const fk = new Map<string, number>();
  for (let i2 = 0; i2 < N; i2++) {
    const va = xa[i2]!, ja = st.flags[i2]! & 1;
    if (va !== ja) { dA++; fk.set(`A${va}>${ja}`, (fk.get(`A${va}>${ja}`) ?? 0) + 1); continue; }
    const vt = va ? xt[i2]! : 0;
    const jt = ja ? (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!]! : 9999) : 0;
    if (vt !== jt) { dT++; fk.set(`T${vt}>${jt}`, (fk.get(`T${vt}>${jt}`) ?? 0) + 1); }
    else if (xw[i2] !== st.wall[i2]) { dW++; fk.set(`W${xw[i2]}>${st.wall[i2]}`, (fk.get(`W${xw[i2]}>${st.wall[i2]}`) ?? 0) + 1); }
  }
  console.log(`stream-replay cmp: A=${dA} T=${dT} W=${dW} pairs=` +
    [...fk.entries()].sort((a2, b2) => b2[1] - a2[1]).slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' '));
}, 300_000);
