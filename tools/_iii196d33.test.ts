// IIII196 批一次性取证仪（源=_iii81m8 载入点同源）：ddual2 #33 Dungeon 槽 JS 侧全通道快照。
// 捕获点=RNG reseed 栈锚（与 m8 cmp 同构）：
//   WorldGen.ts:1383 = ▶Dungeon（reseed 时 store=DitherSnake 末态 = x86 dump 032 域）
//   WorldGen.ts:1394 = ▶MountainCaveOpenings（reseed 时 store=Dungeon pass 末态 = x86 dump 033 域）
// 产出 /tmp/iii196-out/js33/{pre,post}_<chan>.bin + hdr.json。
// 用法：cd game && SW_I196D33=1 npx vitest run tools/_iii196d33.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I196D33 === '1';
const OUT = process.env.SW_I196_OUT ?? '/tmp/iii196-out';
const SEED = process.env.SW_I81_SEED ?? '1.1.1.0.doubledaringdangers|20260831';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);

const CHANS = ['flags', 'type', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat', 'frameX', 'frameY'] as const;

(RUN ? it : it.skip)('iii196 d33 snapshot', { timeout: 600_000 }, async () => {
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let storeRef: Record<string, Uint8Array | Uint16Array> | null = null;
  (globalThis as { __wvLines?: string[] }).__wvLines = [];   // ★IIIII196：LT 迹接收器预挂
  const caps: Record<string, Record<string, Uint8Array | Uint16Array>> = { pre: {}, post: {} };
  const want: Record<string, string> = {
    '1383': 'pre',   // ▶Dungeon（Dungeon pass 前）
    '1394': 'post',  // ▶MountainCaveOpenings（Dungeon pass 后）
  };
  RNGp.reseed = function (this: unknown, s: number) {
    const st = (new Error().stack ?? '').split('\n');
    for (const line of st) {
      const m = line.match(/src\/world\/gen\/WorldGen\.ts:(\d+):\d+/);
      if (m && want[m[1]!] && storeRef) {
        const tag = want[m[1]!]!;
        if (!caps[tag]!['flags']) {
          for (const c of CHANS) caps[tag]![c] = (storeRef[c] as Uint8Array | Uint16Array).slice() as never;
          console.log(`[i196] captured ${tag} @WorldGen.ts:${m[1]}`);
        }
        break;
      }
    }
    return oReseed.call(this, s);
  };
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: 0,
    onWorldPartial: (w) => {
      if (!storeRef) storeRef = w.store as unknown as Record<string, Uint8Array | Uint16Array>;
    },
  });
  RNGp.reseed = oReseed;
  mkdirSync(OUT, { recursive: true });
  // ★IIIII196：STAGE 窗标落盘（SW_I110_STAGE 窗经 stageDump/stgDumpEarly 推 __wvLines）
  const wv = (globalThis as { __wvLines?: string[] }).__wvLines;
  if (wv) {
    const sel = wv.filter((l) => l.startsWith('MARK|STAGE') || l.startsWith('I196|') || l.startsWith('LT|') || l.startsWith('P|i=') || l.startsWith('V|j='));
    writeFileSync(`${OUT}/wvlines.txt`, sel.join('\n') + '\n');
    console.log(`[i196] lines: ${sel.length} (i196 traces: ${wv.filter((l) => l.startsWith('I196|')).length})`);
  }
  for (const tag of Object.keys(caps)) {
    if (!caps[tag]!['flags']) { console.log(`[i196] ${tag}: NOT CAPTURED`); continue; }
    const dir = `${OUT}/js33-${tag}`;
    mkdirSync(dir, { recursive: true });
    for (const c of CHANS) {
      const a = caps[tag]![c]!;
      writeFileSync(`${dir}/${c}.bin`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    writeFileSync(`${dir}/hdr.json`, JSON.stringify({ w: W, h: H }));
  }
  console.log('[i196] done');
});
