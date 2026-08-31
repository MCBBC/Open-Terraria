// IIII99b：toadstool 终段滚动收官——JS 侧逐槽末快照仪（_iii105tm 序列化范式）。
// 目的：对残余前沿 #98..#105 做「哪一 pass 引入」双侧定位——本工具在生成过程中把
// 指定槽末的 store 全通道快照落盘（.bin），离线脚本再与 G2 x86 dump 相邻差分。
// 用法：
//   cd game && SW_MB_1457=1 SW_I08CAP=1 \
//     SW_I08_OUT=/tmp/iii108-out/js npx vitest run tools/_iii108cap.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_I08CAP === '1';
const OUT = process.env.SW_I08_OUT ?? '/tmp/iii108-out/js';
const SLOT_NAMES = new Map<number, string>([
  [50, '微群系'], [51, '二次沉降'], [52, '仙人掌珊瑚'], [53, '瓦片清理'],
  [54, '蜥蜴祭坛'], [55, '水生植物'], [56, '钟乳石宝石树'], [57, '断线陷阱清理'],
  [58, '终清理'], [59, '多格残片清扫'],
]);
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall'] as const;

const doneSlots = new Set<string>();

(RUN ? it : it.skip)('III99b per-slot-end full snapshot (toadstool)', async () => {
  mkdirSync(OUT, { recursive: true });
  let saved = 0;
  await generateWorld({
    width: 4200, height: 1200, seedText: '771002', evil: 0,
    seedFlags: { surfaceIsMushrooms: true },
    onWorldPartial: (w, i, pn) => {
      if (!SLOT_NAMES.has(i) || pn !== SLOT_NAMES.get(i)) return;
      const tag = String(i).padStart(2, '0');
      if (doneSlots.has(tag)) return;
      doneSlots.add(tag);
      const st = w.store as never as TileStore;
      const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
      for (const c of CHANS) {
        const a = rec[c]!;
        writeFileSync(`${OUT}/s${tag}_${c}.bin`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
      }
      console.log(`snapshot slot#${i} ${pn} → ${OUT}/s${tag}_*`);
      saved++;
    },
  });
  console.log(`captured ${saved} slot snapshots`);
}, 900_000);
