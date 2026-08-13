// 提取原版 tileSolid / tileSolidTop 全表（Main.cs 全部赋值 + for 循环段展开）+
// TileID.Sets.Platforms + TileID 名字 → src/data/vanilla-tilecollision.json。
// 供 tests/tile-collision-parity.test.ts 双向对账（通行性审计唯一真值源）。
// 用法：node tools/extract-tile-collision.mjs
import { readFileSync, writeFileSync } from 'node:fs';

// 仓库根 = game/tools/ 上两级（game/ 的父目录）
const ROOT = new URL('../../', import.meta.url).pathname;
const main = readFileSync(`${ROOT}/Terarria1456/Terraria/Main.cs`, 'utf8');
const tileId = readFileSync(`${ROOT}/Terarria1456/Terraria.ID/TileID.cs`, 'utf8');

// ---- TileID 名字表 ----
const names = {};
for (const m of tileId.matchAll(/public const ushort (\w+) = (\d+);/g)) {
  names[+m[2]] = m[1];
}

// ---- Platforms 集（Factory.CreateBoolSet）----
const platformIds = new Set();
{
  const m = tileId.match(/Platforms = Factory\.CreateBoolSet\(([^)]*)\)/);
  if (m) for (const part of m[1].split(',')) {
    const id = +part.trim();
    if (Number.isFinite(id)) platformIds.add(id);
  }
}

// ---- 展开全部赋值（含 for 循环体）----
const solid = new Map();
const solidTop = new Map();
const setVal = (arr, id, v, where) => {
  const prev = arr.get(id);
  if (prev !== undefined && prev.v !== v) {
    console.warn(`! id ${id} 双写冲突 ${prev.v}(${prev.where}) → ${v}(${where})，取后值`);
  }
  arr.set(id, { v, where });
};
{
  // 0) 行化
  const lines = main.split('\n');
  // 1) 记录全部循环区间
  const loops = [];
  for (let ln = 0; ln < lines.length; ln++) {
    const fm = lines[ln].match(/for \((?:int|ushort) (\w+) = (\d+); \1 <= (\d+); \1\+\+\)/);
    if (!fm) continue;
    let bal = 0, started = false, end = ln;
    for (let k = ln; k < Math.min(lines.length, ln + 80); k++) {
      for (const ch of lines[k]) {
        if (ch === '{') { bal++; started = true; }
        else if (ch === '}') bal--;
      }
      if (started && bal <= 0) { end = k; break; }
    }
    loops.push({ varName: fm[1], from: +fm[2], to: +fm[3], start: ln, end });
  }
  // 2) 逐行赋值；变量下标 → 找覆盖该行的最内层同名循环展开
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln];
    for (const arr of [solid, solidTop]) {
      const re = arr === solid ? /\btileSolid\[(\w+)\] = (true|false);/g : /\btileSolidTop\[(\w+)\] = (true|false);/g;
      for (const m of line.matchAll(re)) {
        const idTok = m[1], v = m[2] === 'true';
        if (/^\d+$/.test(idTok)) {
          setVal(arr, +idTok, v, `L${ln + 1}`);
        } else {
          const loop = loops.filter((l) => l.varName === idTok && ln >= l.start && ln <= l.end)
            .sort((a, b) => (b.start - a.start) || (a.end - b.end))[0];   // 最内层
          if (!loop) { console.warn(`! L${ln + 1} 循环变量 ${idTok} 无归属，跳过: ${line.trim()}`); continue; }
          for (let id = loop.from; id <= loop.to; id++) setVal(arr, id, v, `L${ln + 1} loop`);
        }
      }
    }
  }
}

// ---- 汇总输出 ----
const maxId = Math.max(...[...solid.keys(), ...solidTop.keys(), ...platformIds]);
const out = [];
for (let id = 0; id <= maxId; id++) {
  const s = solid.get(id)?.v ?? false;
  const st = solidTop.get(id)?.v ?? false;
  if (!s && !st && !platformIds.has(id)) continue;
  out.push({
    id, name: names[id] ?? `Tile_${id}`,
    solid: s, solidTop: st, platform: platformIds.has(id),
  });
}
const dest = new URL('../src/data/vanilla-tilecollision.json', import.meta.url).pathname;
writeFileSync(dest, JSON.stringify({
  source: 'Terarria1456/Terraria/Main.cs + Terraria.ID/TileID.cs',
  note: 'solid=Main.tileSolid；solidTop=Main.tileSolidTop（frameY==0 顶行可站，Platforms 集合走 PlatformProperTopFrame(frameX)）；platform=TileID.Sets.Platforms',
  tiles: out,
}, null, 0));
console.log(`solid=${[...solid.values()].filter((x) => x.v).length} solidTop=${[...solidTop.values()].filter((x) => x.v).length} platforms=${platformIds.size} → ${dest}`);
