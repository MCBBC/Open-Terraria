// IIII110b(涂装链车道):TrackGenerator 轨臂对拍探针——JS 侧 trk 铅簿。
// 镜像 FTW 车道 _iii143track 口径(R|raw/T|ATT/E|KTI|E|KTO/E|SS/E|TF),但:
//  - 全程 generateWorld 从零跑(涂装链无水合基座;0..49 槽 mile8 已证绿,直跑即等价态)
//  - 铅簿区域过滤(SW_I144P_BOX=x0,x1,y0,y1),区域外只记 placePath 列摘要
//  - PilesPass/SquareTileFrame 级联域(killObjectAt 等)不动
// 输出 $SW_I144P_OUT/js-trk-<chain>.txt(缺省 /tmp/iii144p-out)。
import { writeFileSync, mkdirSync } from 'node:fs';
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TrackGenerator } from '../src/world/gen/vanilla/TrackPass';
import { TILE_DEFS } from '../src/data/tiles';

const CHAINS: Record<string, { base: number; box: [number, number, number, number] }> = {
  xrayvision: { base: 106107, box: [2400, 2620, 660, 900] },
  invisibleplane: { base: 106106, box: [1980, 2200, 470, 700] },
  negativeinfinity: { base: 106109, box: [2860, 3040, 40, 220] },
};

const MODE = process.env.SW_I144P_MODE ?? 'all';   // all|place|kt|tf|ss|roll
const WANT = (m: string): boolean => MODE === 'all' || MODE === m;
const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[i] = s;
}

it('III144P paint chain track ledger', async () => {
  const chain = process.env.SW_I144P_CHAIN ?? 'xrayvision';
  const cfg = CHAINS[chain];
  if (!cfg) throw new Error(`unknown chain ${chain}`);
  const OUT = process.env.SW_I144P_OUT ?? '/tmp/iii144p-out';
  mkdirSync(OUT, { recursive: true });

  const rows: string[] = [];
  const inBox = (x: number, y: number): boolean =>
    x >= cfg.box[0] && x <= cfg.box[1] && y >= cfg.box[2] && y <= cfg.box[3];

  // ---- 全局掷漏斗(仅计数,口径=genRand 单实例;JS 世界生成单 genRand) ----
  let drawIdx = 0;
  const g = globalThis as { __swOnRoll?: unknown };
  const oRoll = g.__swOnRoll;
  g.__swOnRoll = () => { drawIdx++; };

  const TP = TrackGenerator.prototype as unknown as Record<string | symbol, ((...a: unknown[]) => unknown) & { __i144p?: boolean }>;
  const ST = (self: unknown): { inBounds(x: number, y: number): boolean; idx(x: number, y: number): number; flags: Uint8Array; type: Uint16Array; slope: Uint8Array; half: Uint8Array; wall: Uint16Array; frameY: Uint16Array } =>
    ((self as { st: unknown }).st) as never;

  // ---- place(ATT 行,rc=完成后累计) ----
  if (WANT('place')) {
    const orig = TP['place'];
    TP['place'] = function (this: unknown, ...a: unknown[]): boolean {
      const ok = (orig as (...x: unknown[]) => boolean).apply(this, a);
      rows.push(`T|ATT|${a[0]},${a[1]}|mm=${a[2]},${a[3]}|rc=${drawIdx}|ok=${ok ? 1 : 0}`);
      return ok;
    };
  }
  // ---- placePath 列摘要 + 区内 KT/TF ----
  if (WANT('placePath')) {
    const orig = TP['placePath'];
    TP['placePath'] = function (this: unknown, rng: unknown): void {
      const st = ST(this);
      const self = this as unknown as { hist: Array<{ x: number; y: number } | undefined>; len: number; playerHeight: number };
      let c0 = Number.MAX_SAFE_INTEGER, c1 = -1, y0 = Number.MAX_SAFE_INTEGER, y1 = -1;
      for (let i = 0; i < self.len; i++) {
        const h = self.hist[i]!;
        if (h.x < c0) c0 = h.x;
        if (h.x > c1) c1 = h.x;
        if (h.y < y0) y0 = h.y;
        if (h.y > y1) y1 = h.y;
        if (inBox(h.x, h.y)) rows.push(`P|COL|i=${i}|${h.x},${h.y}|ph=${self.playerHeight}`);
      }
      rows.push(`P|ARM|cols=${c0}..${c1}|y=${y0}..${y1}|len=${self.len}`);
      const origKT = (this as unknown as Record<string, (...a2: unknown[]) => void>)['killTileLane'];
      if (process.env.SW_I144P_NOSHADOW === '1') { try { return (orig as (...z: unknown[]) => void).apply(this, [rng]); } finally { return; } }
      (this as unknown as Record<string, (...a2: unknown[]) => void>)['killTileLane'] = function (this: unknown, ...a2: unknown[]) {
        const x = a2[1] as number, y = a2[2] as number;
        let emitted = false;
        const r0 = drawIdx;
        if (inBox(x, y) && st.inBounds(x, y)) {
          const i = st.idx(x, y);
          // 全量调用行(x86 B2 钩同口径:调用即记,act 标注活性)
          rows.push(`E|KTI|${x},${y}|t=${SHEET_OF[st.type[i]!] ?? -1}|w=${st.wall[i]}|fy=${st.frameY[i]}|rc=${r0}|act=${st.flags[i] !== 0 ? 1 : 0}`);
          emitted = true;
        }
        try {
          return origKT.apply(this, a2);
        } finally {
          if (emitted) rows.push(`E|KTO|${x},${y}|d=${drawIdx - r0}`);
        }
      };
      try {
        return (orig as (...z: unknown[]) => void).apply(this, [rng]);
      } finally {
        // 还原本实例包装(placePath 每实例每 Place 调一次,还原防嵌套重复)
        (this as unknown as Record<string, (...a2: unknown[]) => void>)['killTileLane'] = origKT;
      }
    };
  }
  // ---- smoothSlope(区内写坡/半砖事件) ----
  if (WANT('ss')) {
    const orig = TP['smoothSlope'];
    TP['smoothSlope'] = function (this: unknown, ...a: unknown[]): void {
      const st = ST(this);
      const x = a[0] as number, y = a[1] as number;
      const okSt = st && typeof st.inBounds === 'function';
      if (!okSt) rows.push(`# bad-this ctor=${(this as { constructor?: { name?: string } })?.constructor?.name} keys=${Object.keys(this as object).slice(0, 8).join(',')}`);
      const snap = (xx: number, yy: number): [number, number, number] => {
        if (!okSt || !st.inBounds(xx, yy)) return [-1, -1, -1];
        const i = st.idx(xx, yy);
        return [st.slope[i]!, st.half[i]!, st.flags[i]!];
      };
      const before = inBox(x, y) ? snap(x, y) : null;
      (orig as (...z: unknown[]) => void).apply(this, a);
      if (before) {
        const [s0, h0, f0] = before;
        const [s1, h1] = snap(x, y);
        if (f0 !== -1 && (s0 !== s1 || h0 !== h1)) {
          rows.push(`E|SS|${x},${y}|s=${s0}>${s1}|h=${h0}>${h1}`);
        }
      }
    };
  }
  // ---- wuTileFrame(区内帧事件——含 frameImportant 对象级联杀候选) ----
  if (WANT('tf')) {
    const orig = TP['wuTileFrame'];
    TP['wuTileFrame'] = function (this: unknown, ...a: unknown[]): void {
      if (inBox(a[1] as number, a[2] as number)) rows.push(`E|TF|${a[1]},${a[2]}`);
      return (orig as (...z: unknown[]) => void).apply(this, a);
    };
  }

  const t0 = Date.now();
  Error.stackTraceLimit = 100000;
  try {
    await generateWorld({
      width: 4200, height: 1200,
      seedText: `1.1.1.0.${chain}|${cfg.base}`,
      evil: -1,
    });
  } catch (e) {
    const cause = (e as Error & { cause?: Error }).cause;
    if (cause) {
      console.log(`[I144P-FULLSTACK]\n${cause.stack}`);
    }
    throw e;
  }
  rows.push(`# done ${((Date.now() - t0) / 1000).toFixed(0)}s draws=${drawIdx}`);
  writeFileSync(`${OUT}/js-trk-${chain}.txt`, rows.join('\n') + '\n');
  const arms = rows.filter((r) => r.startsWith('P|ARM|'));
  const kts = rows.filter((r) => r.startsWith('E|KTI'));
  const atts = rows.filter((r) => r.startsWith('T|ATT'));
  console.log(`[I144P] ${chain}: arms=${arms.length} atts=${atts.length} okAtt=${atts.filter((r) => r.endsWith('ok=1')).length} ktRegion=${kts.length}`);
  console.log(`[I144P] arms touching box: ${arms.filter((r) => {
    const m = r.match(/cols=(-?\d+)\.\.(-?\d+)/)!;
    return Number(m[1]) <= cfg.box[1] && Number(m[2]) >= cfg.box[0];
  }).join(' ; ')}`);
  g.__swOnRoll = oRoll;
}, 900_000);
