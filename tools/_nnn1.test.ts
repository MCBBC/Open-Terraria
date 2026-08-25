// NNN 批一次性诊断：抓 JS 管线指定槽边界前后 store 全 8 通道落盘。
// 用法：cd game && SW_NNND=1 SW_NNND_SLOT=<slotEndIdx> SW_NNND_LABELS=<▶label,...> \
//          SW_MB_1457=1 <chain envs> npx vitest run tools/_nnn1.test.ts
// 输出：/tmp/nnn-out/jspre.*（label 重播时点=上一原版 pass 末态）
//       /tmp/nnn-out/jspost.*（槽末回调时点）
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_NNND === '1';
const SLOT = Number(process.env.SW_NNND_SLOT ?? 12);
const LABELS = new Set((process.env.SW_NNND_LABELS ?? '').split(',').filter(Boolean));
const SEED = process.env.SW_NNND_SEED ?? '1321365005';
const EVIL = process.env.SW_NNND_EVIL !== undefined ? Number(process.env.SW_NNND_EVIL) : undefined;
const W = Number(process.env.SW_NNND_W ?? 4200), H = Number(process.env.SW_NNND_H ?? 1200);
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_NNND_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
function dump(st: {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
}, prefix: string): void {
  const N = W * H;
  const typ = new Uint16Array(N), wal = new Uint16Array(N);
  const act = new Uint8Array(N), liq = new Uint8Array(N), lty = new Uint8Array(N);
  const half = new Uint8Array(N), slope = new Uint8Array(N), inact = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    typ[i] = SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999;
    act[i] = st.flags[i]! & 1;
    wal[i] = st.wall[i]!;
    liq[i] = st.liquid[i]!;
    lty[i] = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    half[i] = st.half[i]!; slope[i] = st.slope[i]!;
    inact[i] = (st.wire[i]! >>> 5) & 1;
  }
  const le16 = (arr: Uint16Array): Buffer => {
    const b = Buffer.alloc(arr.length * 2);
    for (let i = 0; i < arr.length; i++) b.writeUInt16LE(arr[i]!, i * 2);
    return b;
  };
  const dir = '/tmp/nnn-out';
  writeFileSync(`${dir}/${prefix}.typ`, le16(typ));
  writeFileSync(`${dir}/${prefix}.act`, Buffer.from(act));
  writeFileSync(`${dir}/${prefix}.wal`, le16(wal));
  writeFileSync(`${dir}/${prefix}.liq`, Buffer.from(liq));
  writeFileSync(`${dir}/${prefix}.lty`, Buffer.from(lty));
  writeFileSync(`${dir}/${prefix}.half`, Buffer.from(half));
  writeFileSync(`${dir}/${prefix}.slope`, Buffer.from(slope));
  writeFileSync(`${dir}/${prefix}.inact`, Buffer.from(inact));
  console.log(`${prefix} dumped`);
}

const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

(RUN ? it : it.skip)('dump JS store at slot boundaries', async () => {
  let done = false;
  const rolls: string[] = [];
  let rec = false;
  // 单一漏斗：UnifiedRandom.internalSample（private 仅编译期，运行时可拦）
  const { UnifiedRandom } = (await import('../src/core/rng')) as never as {
    UnifiedRandom: { prototype: Record<string, (...a: unknown[]) => number> };
  };
  const URp = UnifiedRandom.prototype;
  const oIS = URp.internalSample;
  URp.internalSample = function (this: unknown) {
    const v = oIS.call(this);
    if (rec) { rolls.push(String(v | 0)); (globalThis as { __smpCount?: number }).__smpCount = rolls.length; }
    return v;
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (!done) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_nnn1')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (LABELS.has(lab)) {
            const st = (globalThis as { __nnndStore?: Parameters<typeof dump>[0] }).__nnndStore!;
            dump(st, 'jspre');
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  await generateWorld({
    width: W, height: H, seedText: SEED,
    evil: EVIL as (-1 | 0 | 1 | undefined),
    seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
    onWorldPartial: (w, i) => {
      if (i === SLOT - 1 && !done) { dump(w.store as never, 'jspre'); rec = true; }
      if (i === SLOT && !done) {
        dump(w.store as never, 'jspost');
        writeFileSync('/tmp/nnn-out/jsrolls.txt', rolls.join('\n'));
        const gsAny = (w as unknown as { _genState?: { worldSurface?: number } })._genState
          ?? (globalThis as { __nnndGs?: { worldSurface?: number } }).__nnndGs;
        console.log(`rolls recorded: ${rolls.length} worldSurface=${gsAny?.worldSurface ?? '?'}`);
        done = true;
      }
    },
  });
}, 900_000);
