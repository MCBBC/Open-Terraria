// IIII99d2：FTW Front-A（BiomeChests/AddBuriedChest 尝试数别）对账仪。
// 用法：SW_I115=1 SW_DG_BCTRACE=1 npx vitest run tools/_iii99d2.test.ts
// 产出（/tmp/iii115-out）：
//   js-bc.txt       —— DungeonPass 内建 bcA/bcR 迹（SW_DG_BCTRACE 直印，本测试转捕）
//   js-segs.txt     —— __dgSegWatch 阶段终态 8 通道归一化 FNV（C/B/G/I/T/F/Pa/Ba/Late…）
//   js-bounds.txt   —— __wvLines 的 dungeonL..dungeonBa 段末 rc/mc 标
//   sheetmap.json   —— SW 本地 tile id → vanilla sheet（跨端归一化用）
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I115 === '1';
const OUT = '/tmp/iii115-out';
const W = Number(process.env.SW_M8_W ?? 4200);
const H = Number(process.env.SW_M8_H ?? 1200);

(RUN ? it : it.skip)('IIII99d2 FTW BC attempt-ledger capture', async () => {
  const sheetmap: Record<string, number> = {};
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') sheetmap[String(i)] = s;
  }
  writeFileSync(`${OUT}/sheetmap.json`, JSON.stringify(sheetmap));

  // —— 捕获 SW_DG_BCTRACE 直印的 MARK|bcA/bcR 行（console.log 转接）——
  const bcLines: string[] = [];
  // ★IIIII99d2：样本级值流（__swOnRoll 样本钩；x86 SW_ROLLTXT 同位仪）——
  //   环形缓冲（防 OOM：全程主骰 >1 亿）+ mark 落点快照窗口
  const RING = 8192;
  const ring = new Int32Array(RING);
  let rollN = 0;
  const snapAt: Array<{ n: number; last: number[]; line: string }> = [];
  const oLog = console.log;
  {
    const g = globalThis as unknown as { __swOnRoll?: (v: number, inst: object) => void };
    const prev = g.__swOnRoll;
    g.__swOnRoll = (v: number, inst: object) => {
      ring[rollN % RING] = v;
      rollN++;
      prev?.(v, inst);
    };
  }
  const lastK = (k: number): number[] => {
    const out: number[] = [];
    const start = Math.max(0, rollN - k);
    for (let i = start; i < rollN; i++) out.push(ring[i % RING]!);
    return out;
  };
  console.log = ((...args: unknown[]) => {
    const s = args.map(String).join(' ');
    if (s.startsWith('MARK|bc')) {
      bcLines.push(s);
      // 每条 mark 记落点；OK 行重快照（覆盖「accept 尝试→OK」整窗，上限 300 样本）
      if (s.indexOf('|OK|') >= 0) snapAt.push({ n: rollN, last: lastK(300), line: s });
      else snapAt.push({ n: rollN, last: [], line: s });
      oLog(`[idx=${rollN}] ${s}`);
    } else oLog(...args);
  }) as typeof console.log;
  writeFileSync(`${OUT}/js-rollval.json`, '[]');

  // —— 阶段终态归一化 FNV（与 x86 Snap 全量 dump 可同口径换算比对的哈希面）——
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  interface SnapHash { tag: string; t: number; a: number; w: number; l: number; lt: number; hf: number; sl: number; ia: number }
  const segRows: SnapHash[] = [];
  const fnv = (h0: number, vals: ArrayLike<number>): number => {
    let h = h0 >>> 0;
    for (let i = 0; i < vals.length; i++) h = ((h ^ ((vals[i]! >>> 0) & 255)) * 16777619) >>> 0;
    return h >>> 0;
  };
  const N = W * H;
  const tn = new Uint16Array(N); // 归一化 tile sheet（act==1 才有效，其余 0）
  const an = new Uint8Array(N);
  const wn = new Uint16Array(N);
  const ln = new Uint8Array(N);
  const ltn = new Uint8Array(N); // liquid>0 ? lty(vanilla 0 基) : 0 —— 与 x86 .lty 同基
  const hn = new Uint8Array(N);
  const sn = new Uint8Array(N);
  const ian = new Uint8Array(N);
  (globalThis as unknown as { __dgSegWatch?: (name: string, s: never) => void }).__dgSegWatch =
    (name: string, store: never) => {
      const s = store as unknown as {
        type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
        liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
      };
      for (let i = 0; i < N; i++) {
        const act = s.flags[i]! & 1;
        an[i] = act;
        tn[i] = act && s.type[i] !== 0 && SHEET[s.type[i]!] >= 0 ? SHEET[s.type[i]!]! : 0;
        wn[i] = s.wall[i]!;
        ln[i] = s.liquid[i]!;
        ltn[i] = s.liquid[i]! > 0 ? Math.max(0, (s.liquidType[i] ?? 1) - 1) : 0; // JS +1 基→vanilla 0 基
        hn[i] = s.half[i]!;
        sn[i] = s.slope[i]!;
        ian[i] = ((s.wire[i]! >>> 5) & 1);
      }
      segRows.push({
        tag: name,
        t: fnv(2166136261, new Uint8Array(tn.buffer)),
        a: fnv(2166136261, an),
        w: fnv(2166136261, new Uint8Array(wn.buffer)),
        l: fnv(2166136261, ln), lt: fnv(2166136261, ltn), hf: fnv(2166136261, hn),
        sl: fnv(2166136261, sn), ia: fnv(2166136261, ian),
      });
      oLog(`[segwatch] ${name}`);
    };

  // —— capture __wvLines（snap 端 MARK|<tag>|rc=..|mc=..）——
  const wvLines: string[] = [];
  (globalThis as unknown as { __swWvLog?: boolean }).__swWvLog = true;
  (globalThis as unknown as { __wvLines?: string[] }).__wvLines = wvLines;

  try {
    await generateWorld({
      width: W, height: H, seedText: '1671560105', evil: 0,
      seedFlags: { getGoodWorld: true },
      onWorldPartial: () => {},
    });
  } finally {
    console.log = oLog;
  }
  writeFileSync(`${OUT}/js-bc.txt`, bcLines.join('\n'));
  writeFileSync(`${OUT}/js-rollval.json`, JSON.stringify({ totalRolls: rollN, okSnaps: snapAt.filter((s) => s.last.length > 0) }));
  writeFileSync(`${OUT}/js-bounds.txt`, wvLines.filter((l) => l.startsWith('MARK|dungeon') || l.startsWith('MARK|d61')).join('\n'));
  writeFileSync(`${OUT}/js-segs.txt`, segRows.map((r) =>
    `${r.tag}|t=${r.t.toString(16)}|a=${r.a.toString(16)}|w=${r.w.toString(16)}|l=${r.l.toString(16)}|lt=${r.lt.toString(16)}|hf=${r.hf.toString(16)}|sl=${r.sl.toString(16)}|ia=${r.ia.toString(16)}`).join('\n'));
  oLog(`[i115] bc lines=${bcLines.length} segs=${segRows.length} wv=${wvLines.length}`);
}, 900_000);
