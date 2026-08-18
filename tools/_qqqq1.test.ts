// QQQQ 批·取证1：golden 48/49 在 (1982,661) 邻域的液体布局（只读金标）。
// 回答：①口袋自身 48→49 态；②半径 4 内岩浆格分布；③岩浆格 7×7 是否含沙漠墙
//（187/216=LavaCheck 头 desert blast 触发条件）；④口袋自身是否在沙漠墙 7×7 内。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const G2 = '/tmp/sw-slp/g12345';
const W = 4200, H = 1200;
const PX = 1982, PY = 661;

const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
function chans(idx: number) {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  return { t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`), l: readFileSync(`${pre}.liq`), lt: readFileSync(`${pre}.lty`) };
}
const idx = (x: number, y: number) => y * W + x;
const LT = ['-', '水', '岩', '蜜', '微'];

it('forensic golden 48/49 around pocket', () => {
  for (const D of [48, 49]) {
    const c = chans(D);
    console.log(`\n===== dump ${D} ${DUMPNAME.get(D)} =====`);
    // 口袋 5×5 格局：type/act/liquid/liquidType/wall
    for (let y = PY - 4; y <= PY + 4; y++) {
      let rowA = '', rowL = '', rowT = '', rowW = '';
      for (let x = PX - 4; x <= PX + 4; x++) {
        const i = idx(x, y);
        const t = c.a[i] ? c.t[i] : -1;
        rowT += `${String(t).padStart(4)} `;
        const l = c.l[i], lt = l > 0 ? c.lt[i] + 1 : 0;
        rowL += l > 0 ? `${String(l).padStart(3)}${LT[lt]}` : '  · ';
        rowW += `${String(c.w[i]).padStart(4)} `;
      }
      console.log(`y=${y} T: ${rowT}`);
      console.log(`     L: ${rowL}`);
      if (y === PY - 4 || y === PY + 4 || true) console.log(`     W: ${rowW}`);
    }
    // 半径 4 内岩浆格
    const lavas: Array<[number, number, number]> = [];
    for (let y = PY - 4; y <= PY + 4; y++) for (let x = PX - 4; x <= PX + 4; x++) {
      const i = idx(x, y);
      if (c.l[i] > 0 && c.lt[i] === 0) lavas.push([x, y, c.l[i]]);
    }
    console.log(`lava cells (±4): ${lavas.length} → ${lavas.map(([x, y, l]) => `(${x},${y},${l})`).join(' ')}`);
    // 各岩浆格 7×7 沙漠墙检查
    for (const [lx, ly] of lavas) {
      let found: Array<[number, number, number]> = [];
      for (let y = ly - 3; y <= ly + 3; y++) for (let x = lx - 3; x <= lx + 3; x++) {
        const wv = c.w[idx(x, y)];
        if (wv === 187 || wv === 216) found.push([x, y, wv]);
      }
      console.log(`  lava(${lx},${ly}) desertWall7x7: ${found.length} first=${found[0] ?? '-'} → blast ${found.length ? 'FIRES' : 'no'}`);
      if (found.length) {
        // blast 覆盖盒与口袋关系
        const cover = Math.abs(lx - PX) <= 3 && Math.abs(ly - PY) <= 3;
        console.log(`    blast covers pocket: ${cover ? 'YES' : 'no (dx=${lx - PX}, dy=${ly - PY})'}`);
      }
    }
    // 口袋自身 7×7 是否有沙漠墙（若口袋被 blast 需要某个岩浆格在其 ±3）
    let des = 0;
    for (let y = PY - 3; y <= PY + 3; y++) for (let x = PX - 3; x <= PX + 3; x++) {
      const wv = c.w[idx(x, y)];
      if (wv === 187 || wv === 216) des++;
    }
    console.log(`pocket 7x7 desert walls: ${des}`);
    // 口袋周边大范围液体统计（找水源/岩浆源连通性提示）
  }
});
