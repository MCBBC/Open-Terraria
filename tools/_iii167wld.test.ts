// IIII167 物证校验仪：x86 rig 保存的 w.wld 逐格 frameX/frameY vs G2 终态 dump(105)。
// 目的：证明 rig159 .fx/.fy dump 通道 == 真实 w.wld 帧域（物理证据闭环）。
//   cd game && SW_I167WLD=1 npx vitest run tools/_iii167wld.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_I167WLD === '1';
const WLD = process.env.SW_I167_WLD ?? '/tmp/iii159-out/rig-out/w159/w.wld';
const G2 = process.env.SW_I167_G2 ?? '/tmp/iii159-out/rig-out/w159';
const OUT = process.env.SW_I167_OUT ?? '/tmp/iii167-out';
const COORDS_FILE = process.env.SW_I167_COORDS ?? '/tmp/iii163-out/winter-final-fx-coords.json';

(RUN ? it : it.skip)('IIIII167 w.wld physical evidence check', () => {
  const led = JSON.parse(readFileSync(COORDS_FILE, 'utf8')) as Array<{ x: number; y: number; fxX: number; fyX: number }>;
  const w = parseWld(new Uint8Array(readFileSync(WLD)));
  const dumpFx = new Uint16Array(readFileSync(`${G2}/105_Final_Cleanup.fx`).buffer,
    0, (readFileSync(`${G2}/105_Final_Cleanup.fx`).byteLength) >> 1);
  const dumpFy = new Uint16Array(readFileSync(`${G2}/105_Final_Cleanup.fy`).buffer,
    0, (readFileSync(`${G2}/105_Final_Cleanup.fy`).byteLength) >> 1);
  const dumpAct = readFileSync(`${G2}/105_Final_Cleanup.act`);
  let mismatchDump = 0, ledgerOk = 0, ledgerBad = 0, mismatchOnActive = 0;
  const bads: string[] = [];
  for (const e of led) {
    const k = e.x + e.y * w.tilesWide;
    const wx = w.tiles.frameX[k]!, wy = w.tiles.frameY[k]!;
    const dx = dumpFx[k]!, dy = dumpFy[k]!;
    const dumpActive = dumpAct[k]!; // rig dump act 通道（终态 active 位）
    if (wx !== dx || wy !== dy) {
      mismatchDump++;
      if (dumpActive) mismatchOnActive++;
      if (bads.length < 8) bads.push(`(${e.x},${e.y}) act=${dumpActive} wld(${wx},${wy}) dump(${dx},${dy})`);
    }
    if (wx === e.fxX && wy === e.fyX) ledgerOk++; else ledgerBad++;
  }
  const res = {
    wld: WLD, worldSize: [w.tilesWide, w.tilesHigh],
    coords: led.length, wldVsDumpMismatch: mismatchDump, mismatchOnActive, ledgerAgree: ledgerOk, ledgerDisagree: ledgerBad,
    note: 'w.wld 存档格式不保存 inactive 格 frameX/Y（WorldFile SaveTile 仅 active 格带帧）——mismatch 全集应为幽灵残帧被存档丢弃;active 格 mismatch>0 才是通道异常',
    bads,
  };
  console.log('[i167wld]', JSON.stringify(res));
  writeFileSync(`${OUT}/wld-evidence.json`, JSON.stringify(res, null, 1));
  if (mismatchDump === 0) throw new Error('零不一致——对照未生效（疑坐标/文件错位）');
}, 120_000);
