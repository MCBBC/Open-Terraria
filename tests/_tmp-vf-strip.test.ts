// 诊断脚本(via tools/run-diag.mjs):对 FTW V2.wld 标注区导出三条帧值轨道
// rig(oracle dump)/old(auto+blend 近似)/chain(vanillaFrameFor),供离线像素渲染对拍。
// 只读不写游戏数据;输出 /tmp/vf-strip.json。
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { vanillaFrameFor, setVanillaSolidTables, setVanillaFrameImportant } from '../src/render/VanillaFraming';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';
import { getUVForMasks } from '../src/render/BlendFraming';
import { vanillaIdOf, normalizedVidOf, halfNeighborConnects, frameMergesWith } from '../src/render/TileMergeFamily';
import { autoFrameAt } from '../src/render/VanillaTiler';

it('dump', () => {
const WLD = '/Users/vinlic/Downloads/FTW V2.wld';
const DUMP = '/tmp/frame-oracle/out-grass.txt';
const OUT = '/tmp/vf-strip.json';
const X0 = 3983, X1 = 4012, Y0 = 447, Y1 = 468;

// ---- solid 表(同 golden 测试) ----
const main = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/Terarria1457/Terraria/Main.cs', 'utf8');
const solid = new Array(800).fill(false);
const solidTop = new Array(800).fill(false);
for (const mm of main.matchAll(/tileSolid\[(\d+)\] = true/g)) solid[+mm[1]] = true;
for (const mm of main.matchAll(/tileSolidTop\[(\d+)\] = true/g)) solidTop[+mm[1]] = true;
setVanillaSolidTables(solid, solidTop);
const fiList = JSON.parse(readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/game/tests/golden/frameImportant.json', 'utf8'));
const fiArr = new Array(800).fill(false);
for (const t of fiList) fiArr[t] = true;
setVanillaFrameImportant(fiArr);

// ---- 世界装载(内部 id 域,同测试) ----
const buf = readFileSync(WLD);
const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const wld = parseWld(u8);
const v2i = new Map();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const v = TILE_DEFS[i]?.vanilla;
  if (v && !v2i.has(v.sheet)) v2i.set(v.sheet, i);
}
const st = new TileStore(wld.tilesWide, wld.tilesHigh);
{
  const N = wld.tilesWide * wld.tilesHigh;
  for (let i = 0; i < N; i++) {
    if (!wld.tiles.active[i]) continue;
    st.flags[i] = 1;
    st.type[i] = v2i.get(wld.tiles.type[i]) ?? 0;
    st.half[i] = wld.tiles.half[i];
    st.slope[i] = wld.tiles.slope[i];
    if (fiArr[wld.tiles.type[i]]) { st.frameX[i] = wld.tiles.frameX[i]; st.frameY[i] = wld.tiles.frameY[i]; }
    else { st.frameX[i] = -1; st.frameY[i] = -1; }
  }
}

// ---- rig dump ----
const rig = new Map(); // key y*1e6+x -> [fx,fy]
for (const line of readFileSync(DUMP, 'utf8').split('\n')) {
  if (line.startsWith('#')) continue;
  const p2 = line.split(',');
  if (p2.length < 9) continue;
  rig.set((+p2[1]) * 10000000 + (+p2[0]), [+p2[4], +p2[5], +p2[8]]);
}

// ---- vanilla.json meta(替代 atlas.vmeta 的 blend 分支依赖) ----
const VJ = JSON.parse(readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/game/public/sprites/vanilla.json', 'utf8')).tiles;
const mMeta = (sheet) => VJ[String(sheet)] ?? null;

// ---- old 路径 blend 分支逐行复刻(VanillaTiler.ts:999-1099) ----
const BLOCK_STYLE = [0b1111, 0b1110, 0b0110, 0b1010, 0b0101, 0b1001];
const DIR_EDGE = [[0b1000, 0b0100], [0b0001, 0b0010], [0b0100, 0b1000], [0b0010, 0b0001],
  [0b1001, 0b0110], [0b0101, 0b1010], [0b0110, 0b1001], [0b1010, 0b0101]];
const DIRS = [[1, 0], [0, -1], [-1, 0], [0, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]];
const CORNER_CROSS = [
  [], [], [], [],
  [[1, 0, 0b0101], [0, -1, 0b1010]],
  [[-1, 0, 0b1001], [0, -1, 0b0110]],
  [[-1, 0, 0b1010], [0, 1, 0b0101]],
  [[1, 0, 0b0110], [0, 1, 0b1001]],
];
function oldBlendUV(x, y, t) {
  const d = TILE_DEFS[t];
  const sheet = d?.vanilla?.sheet ?? -1;
  const myMeta = mMeta(sheet);
  const myMerge = myMeta?.mergeWith ?? null;
  const myStone = !!myMeta?.isStone;
  const nMeta = (ot) => {
    const od = TILE_DEFS[ot];
    return od?.vanilla ? mMeta(od.vanilla.sheet) : null;
  };
  const merges = (ot) => {
    if (ot === t) return true;
    const om = nMeta(ot);
    if (!om) return false;
    const oid = TILE_DEFS[ot]?.vanilla?.sheet ?? -1;
    if (om.mergeWith != null && om.mergeWith === sheet) return true;
    if (myMerge != null && myMerge === oid) return true;
    if (myMerge != null && om.mergeWith != null && myMerge === om.mergeWith) return true;
    return false;
  };
  const edgesOf = (ii) => {
    const b = st.half[ii] ? 1 : (st.slope[ii] >= 1 && st.slope[ii] <= 4 ? st.slope[ii] + 1 : 0);
    return BLOCK_STYLE[b];
  };
  const cE = edgesOf(st.idx(x, y));
  const edgeOK = (ax, ay, need) => st.inBounds(ax, ay) && (edgesOf(st.idx(ax, ay)) & need) === need;
  let same = 0, mergeMask = 0;
  for (let di = 0; di < 8; di++) {
    const [dx, dy] = DIRS[di];
    const [cNeed, nNeed] = DIR_EDGE[di];
    const ax = x + dx, ay = y + dy;
    if (!st.inBounds(ax, ay)) continue;
    const oi = st.idx(ax, ay);
    const ot = st.type[oi];
    if (ot === 0 && !st.flags[oi]) { /* 原码 ot===0 即 continue(空格) */ }
    if (ot === 0 && st.type[oi] === 0 && !st.flags[oi]) continue;
    if (ot === 0 && st.flags[oi]) continue;
    if ((cE & cNeed) !== cNeed || (edgesOf(oi) & nNeed) !== nNeed) continue;
    if (di >= 4) {
      let ok = true;
      for (const [cdx, cdy, need] of CORNER_CROSS[di]) {
        if (!edgeOK(x + cdx, y + cdy, need)) { ok = false; break; }
      }
      if (!ok) continue;
    }
    const om = nMeta(ot);
    const chainOK = (myStone ? !!om?.isStone : merges(ot)) || frameMergesWith(t, ot);
    const gateOK = di >= 4 || halfNeighborConnects(
      (['R', 'U', 'L', 'D'])[di],
      !!st.half[st.idx(x, y)], normalizedVidOf(t),
      !!st.half[oi], vanillaIdOf(ot), !!TILE_DEFS[ot]?.platform, true);
    if (chainOK && gateOK) same |= (di < 4 ? [0x1, 0x10, 0x100, 0x1000][di] : [0x10000, 0x100000, 0x1000000, 0x10000000][di]);
    if (myMerge != null && (TILE_DEFS[ot]?.vanilla?.sheet ?? -1) === myMerge && gateOK) mergeMask |= (di < 4 ? [0x1, 0x10, 0x100, 0x1000][di] : [0x10000, 0x100000, 0x1000000, 0x10000000][di]);
  }
  const strictness = myMeta?.isGrass ? 2 : myMerge != null ? 1 : 0;
  const variant = ((x * 7) + (y * 11)) % 3;
  const uv = getUVForMasks(same, mergeMask, strictness, variant);
  return [uv.col, uv.row];
}

// ---- 主循环 ----
const rows = [];
for (let y = Y0; y <= Y1; y++) {
  for (let x = X0; x <= X1; x++) {
    const idx = st.idx(x, y);
    if (!st.flags[idx]) { rows.push({ x, y, active: 0 }); continue; }
    const tInt = st.type[idx];
    const d = TILE_DEFS[tInt];
    const sheet = d?.vanilla?.sheet ?? -1;
    const vd = d?.vanilla;
    const isFI = !!fiArr[sheet >= 0 ? sheet : 9999] || sheet === 80;
    const rigKey = y * 10000000 + x;
    const rr = rig.get(rigKey);
    const fnV = rr ? rr[2] : ((x * 7) + (y * 11)) % 3;
    let chain = null;
    if (!isFI && (vd?.frame === 'auto' || vd?.frame === 'blend')) {
      const r = vanillaFrameFor(st, x, y, st, fnV, 200, true);
      chain = [r.fx, r.fy];
    }
    let olduv = null;
    if (vd?.frame === 'blend') olduv = oldBlendUV(x, y, tInt);
    else if (vd?.frame === 'auto') { const a = autoFrameAt(st, x, y, tInt); olduv = [a.col, a.row]; }
    rows.push({ x, y, active: 1, type: tInt, sheet, frame: vd?.frame ?? null,
      half: st.half[idx] ? 1 : 0, slope: st.slope[idx] ?? 0, wallish: false,
      fi: isFI ? 1 : 0, rig: rr ? [rr[0], rr[1], rr[2]] : null, chain, old: olduv });
  }
}
writeFileSync(OUT, JSON.stringify(rows));
console.log(`dumped ${rows.length} cells -> ${OUT}`);
});
