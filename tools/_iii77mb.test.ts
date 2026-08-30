// IIII71b：#97 Micro_Biomes 前沿定位仪（DRUNK 51620200）。
// 全程生成 + 微群系 pass 前后快照（onWorldPartial 槽名='蜂巢幼虫'/'微群系'）
// + segProbe/mbProbe 台账 → /tmp/iii77-out/mb-*。对拍 dump096/dump097。
// 用法：cd game && SW_I77MB=1 npx vitest run tools/_iii77mb.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TileStore } from '../../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I77MB === '1';
const OUT = process.env.SW_I77_OUT ?? '/tmp/iii77-out';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const SEED = process.env.SW_M8_SEED ?? '51620200';

(RUN ? it : it.skip)('micro-biomes pre/post capture + seg ledger', async () => {
  process.env.SW_DG_LTMARK = '';
  mkdirSync(`${OUT}/mb-pre`, { recursive: true });
  mkdirSync(`${OUT}/mb-post`, { recursive: true });
  const g = globalThis as unknown as Record<string, unknown>;
  const marks: string[] = [];
  g.__swSeg = (n: string, d?: unknown): void => {
    marks.push(d === undefined ? n : `${n} ${JSON.stringify(d)}`);
  };
  let n = 0;
  const saved = new Set<string>();
  // 权威 sheet 映射（运行时 TILE_DEFS，防解析偏差）
  {
    const SHEET: number[] = [];
    for (let q = 0; q < TILE_DEFS.length; q++) {
      const s = TILE_DEFS[q]?.vanilla?.sheet;
      SHEET.push(typeof s === 'number' ? s : -1);
    }
    writeFileSync(`${OUT}/mb-sheet.json`, JSON.stringify(SHEET));
  }
  function snap(w2: unknown, tag: string): void {
    if (saved.has(tag)) return;
    saved.add(tag);
    mkdirSync(`${OUT}/${tag}`, { recursive: true });
    const st = (w2 as { store: TileStore }).store;
    const chans = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
    const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
    for (const c of chans) {
      const v = rec[c]!;
      writeFileSync(`${OUT}/${tag}/base_${c}.bin`, Buffer.from(v.buffer, v.byteOffset, v.byteLength));
    }
    console.log(`snap ${tag} done`);
  }
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: -1,
      seedFlags: { drunkWorld: true },
      onWorldPartial: (w2, i, pn) => {
        const TAGS: Record<string, string> = {
          '蜂巢幼虫': 'mb-pre', '微群系': 'mb-post',
          '二次沉降': 'cc-pre', '仙人掌珊瑚': 'cc-post',
        };
        if (TAGS[pn]) snap(w2, TAGS[pn]!);
      },
    });
    void n;
  } finally {
    delete g.__swSeg;
  }
  writeFileSync(`${OUT}/mb-seg.log`, marks.join('\n') + '\n');
  console.log(`[i77mb] marks=${marks.length}`);
}, 900_000);
void TILE_DEFS;
