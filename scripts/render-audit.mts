// 渲染审计 CLI：校对世界存档/生成世界的全部方块物件贴图渲染正确性。
// 用法（vite-node 跑，与其他 scripts 一致）：
//   node_modules/.bin/vite-node scripts/render-audit.mjs --map /path/to/map-*.json
//   node_modules/.bin/vite-node scripts/render-audit.mjs --seed 9293480 [--w 4200 --h 1200]
//   node_modules/.bin/vite-node scripts/render-audit.mjs --seed 9293480,12345   （多种子批量）
// 退出码：有 error=1，仅 warn=2，全过=0。可挂 CI 或改码后手动回归。
import { readFileSync } from 'node:fs';

// ---- 参数 ----
const argv = process.argv.slice(2);
const argOf = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
const mapPath = argOf('map');
const seedArg = argOf('seed');
const W = Number(argOf('w') ?? 4200);
const H = Number(argOf('h') ?? 1200);
if (!mapPath && !seedArg) {
  console.error('用法: render-audit.mjs --map <存档.json> | --seed <种子[,种子...]> [--w] [--h]');
  process.exit(64);
}

// ---- RLE 解码（SaveFile 格式：varint(run-1)+varint(value)；tiles 在 type≠0 时附 fx/fy 两值） ----
function b64ToU8(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
function readVarint(u8: Uint8Array, pos: { i: number }): number {
  let v = 0, shift = 0;
  while (pos.i < u8.length) {
    const b = u8[pos.i++];
    v |= (b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return v;
}
function decodePairs(b64: string, n: number): Uint16Array {
  const u8 = b64ToU8(b64);
  const out = new Uint16Array(n);
  const pos = { i: 0 };
  let idx = 0;
  while (pos.i < u8.length && idx < n) {
    const run = readVarint(u8, pos) + 1;
    const v = readVarint(u8, pos);
    out.fill(v, idx, Math.min(n, idx + run));
    idx += run;
  }
  return out;
}
function decodeTiles(b64: string, n: number, internalOfStable: Uint16Array) {
  const u8 = b64ToU8(b64);
  const type = new Uint16Array(n), flags = new Uint8Array(n);
  const fx = new Uint16Array(n), fy = new Uint16Array(n);
  const pos = { i: 0 };
  let idx = 0;
  while (pos.i < u8.length && idx < n) {
    const run = readVarint(u8, pos) + 1;
    const stable = readVarint(u8, pos);
    const internal = stable === 0 ? 0 : internalOfStable[stable];
    let fxv = 0, fyv = 0;
    if (stable !== 0) { fxv = readVarint(u8, pos); fyv = readVarint(u8, pos); }
    const end = Math.min(n, idx + run);
    type.fill(internal, idx, end);
    flags.fill(internal !== 0 ? 1 : 0, idx, end);
    fx.fill(fxv, idx, end);
    fy.fill(fyv, idx, end);
    idx = end;
  }
  return { type, flags, frameX: fx, frameY: fy };
}

async function runOne(label: string, view: {
  w: number; h: number; type: Uint16Array; flags: Uint8Array;
  frameX: Uint16Array; frameY: Uint16Array; wall: Uint16Array;
}): Promise<number> {
  const { auditWorldRender, formatAuditReport } = await import('../src/render/RenderAudit');
  const t0 = Date.now();
  const r = auditWorldRender(view);
  console.log(formatAuditReport(r, `${label}（${Date.now() - t0}ms）`));
  return r.errors > 0 ? 1 : r.warns > 0 ? 2 : 0;
}

let exit = 0;
if (mapPath) {
  const raw = JSON.parse(readFileSync(mapPath, 'utf8')) as {
    meta: { w: number; h: number }; tiles: string; walls: string;
  };
  const { TILE_INTERNAL_OF_STABLE } = await import('../src/data/tiles');
  const n = raw.meta.w * raw.meta.h;
  const t = decodeTiles(raw.tiles, n, TILE_INTERNAL_OF_STABLE);
  exit = await runOne(mapPath, {
    w: raw.meta.w, h: raw.meta.h, ...t, wall: decodePairs(raw.walls, n),
  });
} else {
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  for (const seed of seedArg!.split(',')) {
    const world = await generateWorld({ width: W, height: H, seedText: seed });
    const st = world.store;
    exit = Math.max(exit, await runOne(`seed ${seed} ${W}×${H}`, {
      w: st.w, h: st.h, type: st.type, flags: st.flags,
      frameX: st.frameX, frameY: st.frameY, wall: st.wall,
    }));
  }
}
process.exit(exit);
