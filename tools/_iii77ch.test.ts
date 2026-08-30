// IIII71b：#59 Buried_Chests 残差(2格)定位仪——全程跟踪 v135(超级飞镖陷阱/压力板)
// 写入点。SW_I77PLATE=1 开启；标签门=▶UndergroundHousesAndBuriedChests..▶SurfaceChests。
// 输出：每个 135-写入的 (x,y)+writer 源栈首帧+掷计数；窗内(1290..1350×600..660)全量打印。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_I77PLATE === '1';
const OUT = process.env.SW_I77_OUT ?? '/tmp/iii77-out';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const SEED = process.env.SW_M8_SEED ?? '51620200';

if (RUN) {
  process.env.SW_DG_LTMARK = '';
}

(RUN ? it : it.skip)('trace v135 writes across buried-chest slot', async () => {
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync2(file).split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  function readFileSync2(p: string): string { return require('node:fs').readFileSync(p, 'utf8'); }

  // 全程 watch：setTile / setTileSilent 中 type==SW-id(sheet135)
  const proto = TileStore.prototype as unknown as Record<string, (...a: unknown[]) => void>;
  const orig = new Map<string, ((...a: unknown[]) => void)>();
  const logs: string[] = [];
  const boxLog: string[] = [];
  let curLabel = '(pre)';
  let count = 0;
  const SH135 = Number(process.env.SW_I77_ID ?? '163');
  for (const fn of ['setTile', 'setTileSilent'] as const) {
    orig.set(fn, proto[fn]);
    proto[fn] = function (this: TileStore, ...a: unknown[]) {
      try {
        const x = Number(a[0]), y = Number(a[1]), t = Number(a[2]);
        const WATCH = String(process.env.SW_I77_WATCH ?? '').split(';').filter(Boolean);
        if (WATCH.includes(`${x},${y}`)) {
          count++;
          const st = new Error().stack ?? '';
          let writer = '?'; let rc = -1;
          for (const line of st.split('\n')) {
            const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
            if (m && !m[1].includes('/TileStore') && !m[1].includes('_iii77ch')) {
              writer = `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`; break;
            }
          }
          const gl = globalThis as { __swRc?: () => number };
          if (gl.__swRc) rc = gl.__swRc();
          logs.push(`#${count} @${curLabel} (${x},${y}) ${fn} <- ${writer}`);
          if (x >= 1290 && x <= 1350 && y >= 600 && y <= 660) boxLog.push(logs[logs.length - 1]!);
        }
      } catch { /* keep flow */ }
      return orig.get(fn)!.apply(this, a);
    };
  }
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: -1,
      seedFlags: { drunkWorld: true },
      onWorldPartial: () => { /* label 门经 RNG 钩太重，这里直接整程跟踪 */ },
    });
  } finally {
    for (const [fn, o] of orig) proto[fn] = o;
  }
  console.log(`v135 writes total=${count}`);
  writeFileSync(`${OUT}/plate-writes.log`, logs.join('\n') + '\n');
  console.log(`box(1290-1350,600-660)=${boxLog.length}`);
  for (const l of boxLog.slice(0, 40)) console.log('  ' + l);
}, 900_000);
