// IIIII45 一次性诊断：JS DRUNK 地牢 bbox / 砖色统计 vs x86（铁证定位用）。
// 用法：cd game && SW_III47DUN=1 npx vitest run tools/_iii47dun.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_III47DUN === '1';
const G = '/tmp/iii47-out/x86-drunk';

(RUN ? it : it.skip)('dungeon brick bbox both sides', async () => {
  const world = await generateWorld({ width: 4200, height: 1200, seedText: '51620200', evil: -1, seedFlags: { drunkWorld: true } });
  const st = (world.store) as unknown as { type: Uint16Array; flags: Uint8Array; wall: Uint16Array };
  const W = 4200;
  // SHEET_OF via TILE_DEFS
  const { TILE_DEFS } = await import('../src/data/tiles');
  const sheets: number[] = [];
  for (const d of TILE_DEFS) sheets.push(d?.vanilla?.sheet ?? -1);
  const stat = (label: string, ok: (t: number) => boolean) => {
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
    const per: Record<number, number> = {};
    for (let i = 0; i < st.flags.length; i++) {
      if (!(st.flags[i] & 1)) continue;
      const s = sheets[st.type[i]!]!;
      if (!ok(s)) continue;
      if (s !== undefined && s >= 0) per[s] = (per[s] ?? 0) + 1;
      const x = i % W, y = (i / W) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; n++;
    }
    console.log(label, 'n=', n, 'bbox', minX, '..', maxX, ',', minY, '..', maxY, 'per-sheet', JSON.stringify(per));
  };
  stat('JS dungeon-brick(41/43/44)', (t) => t === 41 || t === 43 || t === 44);
  // x86 side
  const files = readdirSync(G);
  const b = files.find((x) => x.startsWith('105_Final_Cleanup') && x.endsWith('.typ'))!.replace('.typ', '');
  const act = readFileSync(`${G}/${b}.act`);
  const tb = readFileSync(`${G}/${b}.typ`);
  const typ = new Uint16Array(tb.buffer, tb.byteOffset, tb.length >> 1);
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
  const per: Record<number, number> = {};
  for (let i = 0; i < act.length; i++) {
    if (!act[i]) continue;
    const t = typ[i]!;
    if (t !== 41 && t !== 43 && t !== 44) continue;
    per[t] = (per[t] ?? 0) + 1;
    const x = i % W, y = (i / W) | 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; n++;
  }
  console.log('X86 dungeon-brick n=', n, 'bbox', minX, '..', maxX, ',', minY, '..', maxY, 'per-sheet', JSON.stringify(per));
  // 把 JS 终态导出为 JJHook 同构 8 通道（typ u16 LE raw 本仓 id / act / wal u16 LE /
  // liq / half / slope / lty(0 基) / inact(=wire bit5)），供离线逐格差异分析。
  const s2 = st;
  const N = st.flags.length;
  const typBuf = Buffer.alloc(N * 2);
  const walBuf = Buffer.alloc(N * 2);
  const actOut = Buffer.alloc(N);
  const liq = readFileSync('/dev/null');
  void liq;
  const liqOut = Buffer.alloc(N);
  const halfOut = Buffer.alloc(N), slopeOut = Buffer.alloc(N), ltyOut = Buffer.alloc(N), iaOut = Buffer.alloc(N);
  const storeUnknown = st as unknown as Record<string, Uint8Array | Uint16Array>;
  const liquidArr = storeUnknown['liquid'] as Uint8Array;
  const liquidTypeArr = storeUnknown['liquidType'] as Uint8Array;
  const halfArr = storeUnknown['half'] as Uint8Array;
  const slopeArr = storeUnknown['slope'] as Uint8Array;
  const wireArr = storeUnknown['wire'] as Uint8Array;
  const wallArr = st.wall;
  for (let i = 0; i < N; i++) {
    typBuf[i * 2] = st.type[i]! & 0xff; typBuf[i * 2 + 1] = st.type[i]! >> 8;
    walBuf[i * 2] = wallArr[i]! & 0xff; walBuf[i * 2 + 1] = wallArr[i]! >> 8;
    actOut[i] = st.flags[i]! & 1 ? 1 : 0;
    liqOut[i] = liquidArr?.[i] ?? 0;
    halfOut[i] = halfArr?.[i] ?? 0;
    slopeOut[i] = slopeArr?.[i] ?? 0;
    ltyOut[i] = (liquidArr?.[i] ?? 0) > 0 ? Math.max(0, (liquidTypeArr?.[i] ?? 1) - 1) : 0;
    iaOut[i] = ((wireArr?.[i] ?? 0) >>> 5) & 1;
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync('/tmp/iii47-out/js-final.typ', typBuf);
  writeFileSync('/tmp/iii47-out/js-final.wal', walBuf);
  writeFileSync('/tmp/iii47-out/js-final.act', actOut);
  writeFileSync('/tmp/iii47-out/js-final.liq', liqOut);
  writeFileSync('/tmp/iii47-out/js-final.half', halfOut);
  writeFileSync('/tmp/iii47-out/js-final.slope', slopeOut);
  writeFileSync('/tmp/iii47-out/js-final.lty', ltyOut);
  writeFileSync('/tmp/iii47-out/js-final.inact', iaOut);
  console.log('JS final channels written to /tmp/iii47-out/js-final.*');
  writeFileSync('/tmp/iii47-out/js-sheet.json', JSON.stringify(sheets));
  console.log('sheet map written');
}, 120_000);
