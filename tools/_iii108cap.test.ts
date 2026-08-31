// IIII99b：toadstool 终段滚动收官——JS 侧逐槽末快照仪（_iii105tm 序列化范式）。
// 目的：对残余前沿 #98..#105 做「哪一 pass 引入」双侧定位——本工具在生成过程中把
// 指定槽末的 store 全通道快照落盘（.bin），离线脚本再与 G2 x86 dump 相邻差分。
// 用法：
//   cd game && SW_MB_1457=1 SW_I08CAP=1 \
//     SW_I08_OUT=/tmp/iii108-out/js npx vitest run tools/_iii108cap.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TileStore } from '../src/world/TileStore';
import { snapshotGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_I08CAP === '1';
const OUT = process.env.SW_I08_OUT ?? '/tmp/iii108-out/js';
const SLOT_NAMES = new Map<number, string>([
  [32, '矿骨堆'],[33,'出生点'],[34,'草墙'],[35,'起始镇民'],[36,'向日葵'],[37,'栽树'],[38,'炼金草药'],[39,'染料植物'],[40,'蛛网蜂巢'],[41,'地表植物'],[42,'丛林植物P2'],[43,'藤蔓'],[44,'地表花'],[45,'地表蘑菇'],[46,'宝石系统'],[47,'长苔藓'],[48,'丛林墙'],[49,'蜂巢幼虫'],
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
      // IIII99b：槽末同时落 gs + world 侧字段（反演重放基座；仅尾段够用）
      try {
        const gs = lastGenState();
        if (gs) {
          const serVal = (v: unknown): unknown => {
            if (v instanceof Uint8Array || v instanceof Int8Array || v instanceof Uint16Array
              || v instanceof Int16Array || v instanceof Uint32Array || v instanceof Int32Array
              || v instanceof Float32Array || v instanceof Float64Array) {
              return { __t: v.constructor.name, d: Array.from(v as ArrayLike<number>) };
            }
            if (Array.isArray(v)) return { __arr: v.map(serVal) };
            if (v && typeof v === 'object') {
              const o: Record<string, unknown> = {};
              for (const k of Object.keys(v as object)) o[k] = serVal((v as Record<string, unknown>)[k]);
              return o;
            }
            return v;
          };
          const world = w as unknown as Record<string, unknown>;
          writeFileSync(`${OUT}/s${tag}_ctx.json`, JSON.stringify({
            gs: serVal(gs),
            genSolid: Object.fromEntries(Object.entries(snapshotGenSolid()).map(([k, v]) => [k, Array.from(v as Uint8Array)])),
            world: {
              genWaterLine: world.genWaterLine, genDungeonExempt: world.genDungeonExempt,
              genRemixWater: world.genRemixWater, shimmerX: world.shimmerX, shimmerY: world.shimmerY,
              groundLevel: world.groundLevel, rockLevel: world.rockLevel,
              seedFlags: world.seedFlags,
            },
          }));
        }
      } catch (e) { console.log(`ctx dump skip slot#${i}: ${(e as Error).message}`); }
      console.log(`snapshot slot#${i} ${pn} → ${OUT}/s${tag}_*`);
      saved++;
    },
  });
  console.log(`captured ${saved} slot snapshots`);
}, 900_000);
