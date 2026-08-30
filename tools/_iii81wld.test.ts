// IIII81 取证：把 vanilla / rig 的 .wld 终态解出 8 通道并落盘（供离线字节对拍）。
// 用法：cd game && SW_I81_WLD=/path/w.wld SW_I81_OUT=/tmp/iii81-out/dir npx vitest run tools/_iii81wld.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = true;
const WLD = process.env.SW_I81_WLD ?? '';
const OUT = process.env.SW_I81_OUT ?? '/tmp/iii81-out/wld-dump';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('probe wld', async () => {
  const buf = readFileSync(WLD);
  const w = parseWld(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  mkdirSync(OUT, { recursive: true });
  const t = w.tiles;
  const N = t.active.length;
  // 与 JJHook dump 同编码：typ=sheet 视角（非活性=0）
  const typ = new Uint16Array(N);
  for (let i = 0; i < N; i++) {
    typ[i] = t.active[i] ? (SHEET[t.type[i]!] >= 0 ? SHEET[t.type[i]!]! : 9999) : 0;
  }
  writeFileSync(`${OUT}/105_w.typ`, Buffer.from(typ.buffer));
  writeFileSync(`${OUT}/105_w.act`, Buffer.from(t.active.slice().buffer));
  writeFileSync(`${OUT}/105_w.wal`, Buffer.from(Uint16Array.from(t.wall).buffer));
  writeFileSync(`${OUT}/105_w.liq`, Buffer.from(t.liquid.slice().buffer));
  writeFileSync(`${OUT}/105_w.half`, Buffer.from(t.half.slice().buffer));
  writeFileSync(`${OUT}/105_w.slope`, Buffer.from(t.slope.slice().buffer));
  writeFileSync(`${OUT}/105_w.lty`, Buffer.from(t.liquidType.slice().buffer));
  writeFileSync(
    `${OUT}/meta.txt`,
    `seed=${w.seed} spawn=${w.spawnX},${w.spawnY} dungeon=${w.dungeonX},${w.dungeonY} ` +
    `crimson=${w.isCrimson} hardMode=${w.hardMode} bloodMoon=${w.bloodMoon} groundLevel=${w.groundLevel} rock=${w.rockLevel} worldId=${w.worldId}`,
  );
  console.log(`III81WLD ${WLD} -> ${OUT}`);
});
