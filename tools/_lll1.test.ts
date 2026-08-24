// 一次性诊断（LLL 批 2026-08-25）：#46 Jungle_Temple 定罪——JS(SW_MB_1457=1) vs
// x86-1457 金标 dump 046_Jungle_Temple 的 226 砖格形状差定量。
// 用法：cd game && SW_LLL=1 SW_MB_1457=1 npx vitest run tools/_lll1.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_LLL === '1';
const G2 = process.env.SW_M8_G2 ?? '/tmp/jjj-out/g1457';
const SEED = process.env.SW_LLL_SEED ?? '9293480';
const EVIL = Number(process.env.SW_LLL_EVIL ?? 0);
const W = Number(process.env.SW_LLL_W ?? 4200), H = Number(process.env.SW_LLL_H ?? 1200), N = W * H;
const OUT = '/tmp/lll-out';
const ABORT_LABEL = process.env.SW_LLL_ABORT ?? 'Beehives';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
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

(RUN ? it : it.skip)('LLL #46 temple brick-mask diff', async () => {
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  // 找目标 dump：SW_LLL_DUMP 或缺省 46（Jungle_Temple）
  const DUMP = Number(process.env.SW_LLL_DUMP ?? 46);
  console.log(`dump names: ${DUMPNAME.size}, target #${DUMP}=${DUMPNAME.get(DUMP)} seed=${SEED} evil=${EVIL} W=${W}`);

  interface Cap { typ: Uint16Array; act: Uint8Array; wal: Uint16Array; rooms: Array<{ x: number; y: number; w: number; h: number }>; depths: number[]; sx: number; sy: number }
  const cap: Partial<Cap> = {};
  (globalThis as Record<string, unknown>).__swTmRooms = (rs: Array<{ x: number; y: number; w: number; h: number }>, sx: number, sy: number) => {
    cap.rooms = rs.map((r) => ({ ...r })); cap.sx = sx; cap.sy = sy;
  };
  (globalThis as Record<string, unknown>).__swTmDepths = (d: number[]) => { cap.depths = d.slice(); };

  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let store: Parameters<typeof JSON.stringify>[0] | null = null;
  let aborted = false;
  RNGp.reseed = function (this: unknown, s: number) {
    if (!aborted) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_lll1')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === ABORT_LABEL) aborted = true;
          break;
        }
      }
    }
    if (aborted) throw new Error(`LLL-abort@${ABORT_LABEL}`);
    return oReseed.call(this, s);
  };
  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      onWorldPartial: (w) => { store = w.store as never; },
    });
  } catch (e) {
    if (!String(e).includes('LLL-abort')) throw e;
  } finally {
    RNGp.reseed = oReseed;
    delete (globalThis as Record<string, unknown>).__swTmRooms;
    delete (globalThis as Record<string, unknown>).__swTmDepths;
  }
  console.log(`gen+abort ${(Date.now() - t0) / 1000}s aborted=${aborted}`);
  if (!store || !cap.rooms) throw new Error('no capture');

  // ---- 读金标 dump ----
  const pre = `${G2}/${String(DUMP).padStart(3, '0')}_${DUMPNAME.get(DUMP)}`;
  if (!existsSync(`${pre}.typ`)) throw new Error(`no dump ${pre}`);
  const ld = (p: string) => new Uint16Array(readFileSync(p).buffer, readFileSync(p).byteOffset, N);
  const lb = (p: string) => new Uint8Array(readFileSync(p).buffer, readFileSync(p).byteOffset, N);
  const vt = ld(`${pre}.typ`), va = lb(`${pre}.act`), vw = ld(`${pre}.wal`);
  const st = store as unknown as { type: Uint16Array; flags: Uint8Array; wall: Uint16Array };

  // ---- 砖掩码与差分 ----
  const vB = new Uint8Array(N), jB = new Uint8Array(N);
  let vn = 0, jn = 0, miss = 0, extra = 0;
  const missByJ = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    if (va[i] && vt[i] === 226) { vB[i] = 1; vn++; }
    const ja = st.flags[i]! & 1;
    if (ja && SHEET[st.type[i]!] === 226) { jB[i] = 1; jn++; }
    if (vB[i] && !jB[i]) {
      miss++;
      const k = `T${SHEET[st.type[i]!] ?? -1}${ja ? '' : '/off'}`;
      missByJ.set(k, (missByJ.get(k) ?? 0) + 1);
    } else if (jB[i] && !vB[i]) extra++;
  }
  console.log(`v226=${vn} j226=${jn} miss(v-only)=${miss} extra(j-only)=${extra}`);
  console.log(`miss 构成:`, [...missByJ.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));

  // bbox（并集）与逐行差分直方
  let bx0 = 1e9, bx1 = -1, by0 = 1e9, by1 = -1;
  for (let i = 0; i < N; i++) if (vB[i] || jB[i]) {
    const x = i % W, y = (i / W) | 0;
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
    if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  console.log(`union bbox x${bx0}-${bx1} y${by0}-${by1} (${bx1 - bx0 + 1}x${by1 - by0 + 1})`);
  writeFileSync(`${OUT}/mask-v.bin`, vB);
  writeFileSync(`${OUT}/mask-j.bin`, jB);

  // ASCII 图（×3 下采样）：#=双方 v=仅vanilla j=仅JS .=无
  {
    const lines: string[] = [];
    for (let y = by0; y <= by1; y += 3) {
      let row = '';
      for (let x = bx0; x <= bx1; x += 3) {
        let vv = 0, jj = 0;
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
          const i = (y + dy) * W + x + dx;
          if (vB[i]) vv++; if (jB[i]) jj++;
        }
        row += vv && jj ? '#' : vv ? 'v' : jj ? 'j' : '.';
      }
      lines.push(row);
    }
    writeFileSync(`${OUT}/map.txt`, lines.join('\n'));
    console.log(`map → ${OUT}/map.txt (${lines.length} 行 × ${lines[0]!.length} 列, 每字符=3×3 格)`);
  }

  // 房间/深度账本
  console.log(`rooms(${cap.rooms.length}) depths=[${(cap.depths ?? []).join(',')}] sx,sy=${cap.sx},${cap.sy}`);
  console.log(cap.rooms!.map((r, n) => `  r${n}(d${cap.depths?.[n]}) ${r.x},${r.y} ${r.w}x${r.h}`).join('\n'));
  writeFileSync(`${OUT}/rooms.json`, JSON.stringify({ rooms: cap.rooms, depths: cap.depths, sx: cap.sx, sy: cap.sy }));
}, 600_000);
