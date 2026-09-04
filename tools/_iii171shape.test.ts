// IIII171 批一次性：三面（沙漠/地狱/活木）JS 面-末态 vs x86 对应槽 逐格形状差取证。
//   沙漠：锚=WorldGen.ts:1327（desert pass 末=reseed@GlowingMushroom 前）vs x86 #019
//   地狱：锚=WorldGen.ts:1361（Underworld 尾段后=reseed@Corruption 前）vs x86 #028
//   活木：锚=WorldGen.ts:1456（LivingTrees 末=reseed@LivingTreeWalls 前）vs x86 #042
// 输出 /tmp/iii171-out/shape-diff.json + 控制台摘要（diff 格按簇打印）。
// 用法：cd game && SW_I171=1 npx vitest run tools/_iii171shape.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

// JS internal → vanilla sheet（GHLIST 同法；inactive 残型域必须换算后再比）
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const OUT = process.env.SW_I171_OUT ?? '/tmp/iii171-out';
const G2 = process.env.HOME + '/GoldenChains/i106/x86-iamerror';
const W = 4200, H = 1200, N = W * H;

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const acts = (p: string): Uint8Array => Uint8Array.from(readFileSync(p));

// 关注的三面锚（与 fine-trace 同法：reseed 栈顶 src 帧行号）
const capturedW = new Map<string, Uint16Array>();
const ANCHORS: Record<string, { file: string; line: number; slot: string; box: [number, number, number, number] }> = {
  desert: { file: 'src/world/gen/WorldGen.ts', line: 1327, slot: '019_Full_Desert', box: [1450, 2050, 560, 920] },
  hell: { file: 'src/world/gen/WorldGen.ts', line: 1361, slot: '028_Underworld', box: [1000, 3300, 1000, 1140] },
  lt: { file: 'src/world/gen/WorldGen.ts', line: 1456, slot: '042_Living_Trees', box: [0, 4200, 0, 600] },
};

(RUN() ? it : it.skip)('shape diff at three face ends', async () => {
  const captured = new Map<string, { flags: Uint8Array; type: Uint16Array }>();
  let world: { store: { flags: Uint8Array; type: Uint16Array } } | null = null;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (world) {
      const stack = (new Error().stack ?? '').split('\n');
      for (const line of stack) {
        const m = line.match(/(src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng')) {
          for (const [k, a] of Object.entries(ANCHORS)) {
            if (m[1] === a.file && Number(m[2]) === a.line && !captured.has(k)) {
              // 必须复制快照——TileStore 底层 buffer 全程原地复用，持引用=终态
              captured.set(k, { flags: Uint8Array.from(world.store.flags), type: Uint16Array.from(world.store.type) });
              capturedW.set(k, Uint16Array.from(world.store.wall));
            }
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: '1.1.1.0.iamerror|106103', evil: 0,
      seedFlags: { errorWorld: true },
      onWorldPartial: (w) => { if (!world) world = w as never; },
    });
  } finally { RNGp.reseed = oReseed; }

  const report: Record<string, unknown> = {};
  for (const [k, a] of Object.entries(ANCHORS)) {
    const cap = captured.get(k);
    if (!cap) { console.log(`[i171] ${k}: anchor NOT captured`); continue; }
    // 落盘快照（wall 通道需重取——capture 只存了 flags/type；wall 从 cap 不可得，
    // 改由调用方需要时另行捕获。此处仅存 flags/type 供离线形状分析。）
    writeFileSync(`${OUT}/cap-${k}-flags.bin`, Buffer.from(cap.flags.buffer, cap.flags.byteOffset, cap.flags.byteLength));
    writeFileSync(`${OUT}/cap-${k}-type.bin`, Buffer.from(cap.type.buffer, cap.type.byteOffset, cap.type.byteLength));
    writeFileSync(`${OUT}/cap-${k}-wall.bin`, Buffer.from(capturedW.get(k)!.buffer, capturedW.get(k)!.byteOffset, capturedW.get(k)!.byteLength));
    const xa = acts(`${G2}/${a.slot}.act`), xt = le16(`${G2}/${a.slot}.typ`), xw = le16(`${G2}/${a.slot}.wal`);
    const [x0, x1, y0, y1] = a.box;
    const missed: Array<[number, number, number, number]> = [];  // vanilla 清型 JS 残型: x,y,jsType,x86wall
    const extra: Array<[number, number, number]> = [];           // 反向: x,y,jsType,x86Type
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        const jAct = cap.flags[i]! & 1, xAct = xa[i]!;
        if (jAct || xAct) continue;                      // 只看双 inactive 残型域
        const jtRaw = cap.type[i]!;
        const jT = jtRaw === 0 ? 0 : (SHEET[jtRaw]! >= 0 ? SHEET[jtRaw]! : 9999);
        const xT = xt[i]!;
        if (xT === 0 && jT !== 0) missed.push([x, y, jT, xw[i]!]);
        else if (xT !== 0 && jT === 0) extra.push([x, y, jT, xT]);
      }
    }
    console.log(`[i171] ${k}: missed(van清型JS残)=${missed.length} extra(JS清型van残)=${extra.length}`);
    report[k] = { missed, extra };
    // 按簇打印 missed（简单 BFS 邻接聚类）
    const seen = new Set<string>();
    const key = (x: number, y: number) => `${x},${y}`;
    const set = new Map<string, [number, number, number, number]>();
    for (const m of missed) set.set(key(m[0], m[1]), m);
    for (const m of missed) {
      if (seen.has(key(m[0], m[1]))) continue;
      const q = [m]; const cl: Array<[number, number, number, number]> = [];
      seen.add(key(m[0], m[1]));
      while (q.length) {
        const c = q.pop()!; cl.push(c);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const nk = key(c[0]! + dx, c[1]! + dy);
          if (set.has(nk) && !seen.has(nk)) { seen.add(nk); q.push(set.get(nk)!); }
        }
      }
      const xs = cl.map(c => c[0]!), ys = cl.map(c => c[1]!);
      const wt = [...new Set(cl.map(c => c[3]!))].join('/');
      console.log(`  cluster n=${cl.length} x[${Math.min(...xs)}..${Math.max(...xs)}] y[${Math.min(...ys)}..${Math.max(...ys)}] wall=${wt} jsTypes=${[...new Set(cl.map(c => c[2]!))].join('/')}`);
    }
  }
  writeFileSync(`${OUT}/shape-diff.json`, JSON.stringify(report));
  console.log(`[i171] -> ${OUT}/shape-diff.json`);
}, 600_000);

function RUN(): boolean { return process.env.SW_I171 === '1'; }
