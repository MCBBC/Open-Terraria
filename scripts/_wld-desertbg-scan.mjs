// 扫描本机原版 .wld 世界的 desertBG(样式4=248/249/250 沙暴巨丘档)——为"原版运行时同款截图"选世界
// 用法: SW_WORLDS_DIR=<目录> node tools/run-diag.mjs scripts/_wld-desertbg-scan.mjs
import fs from 'node:fs';
import path from 'node:path';
// run-diag 是裸 node——TS 模块经 vite ssrLoadModule 加载
const vite = await import('vite');
const server = await vite.createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
});
const { parseWldToSave } = await server.ssrLoadModule('/src/wld/WldImport.ts');

const DIR = process.env.SW_WORLDS_DIR
  ?? path.join(process.env.HOME, 'Library/Application Support/Terraria/Worlds');

const files = fs.readdirSync(DIR)
  .filter((f) => f.toLowerCase().endsWith('.wld'))
  .map((f) => ({ f, m: fs.statSync(path.join(DIR, f)).mtimeMs }))
  .sort((a, b) => b.m - a.m)
  .map((e) => e.f);
console.log(`扫描 ${DIR} 共 ${files.length} 个世界(按修改时间新→旧)`);
const STYLES = ['样式0 经典沙丘', '样式1 沙丘', '样式2 岩丘', '样式3 沙丘', '样式4 沙暴巨丘(248/249/250)', '51 绿洲', '52 金字塔', '53 圣沙'];

const decodeTiles = null; // (弃)粗解码草稿——用下方 decodeSandColumns

// 精确解码:展开到稀疏列计数(y 0..groundLevel+80 内的沙)
const decodeSandColumns = (b64, w, h, yLimit) => {
  const raw = Buffer.from(b64, 'base64');
  let pos = 0;
  const readVarint = () => {
    let shift = 0, v = 0;
    for (;;) {
      const b = raw[pos++];
      v |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    return v >>> 0;
  };
  const col = new Int32Array(w);
  let idx = 0;
  const n = w * h;
  while (pos < raw.length && idx < n) {
    const run = readVarint() + 1;
    const t = readVarint();
    if (t !== 0) { readVarint(); readVarint(); }
    if (t === 53) {
      const end = Math.min(idx + run, n);
      for (let k = idx; k < end; k++) {
        const yy = Math.floor(k / w);
        if (yy > yLimit) { idx = end; break; }
        col[k % w]++;
      }
    }
    idx += run;
  }
  return col;
};

let found = [];
for (const f of files) {
  try {
    const buf = new Uint8Array(fs.readFileSync(path.join(DIR, f)));
    const r = parseWldToSave(buf);
    const save = r.save;
    const bg = save.header?.bgStyles ?? {};
    const d = bg.desert, o = bg.ocean;
    const tag = d === 4 ? ' ★★样式4★★' : '';
    const bg2 = bg;
    const forest = Array.isArray(bg2.forest) ? bg2.forest.join('/') : '?';
    console.log(`${f}  「${save.header?.name}」 desertBG=${d}(${STYLES[d] ?? '?'}) ocean=${o} forest=[${forest}] corrupt=${bg2.corrupt} snow=${bg2.snow} hallow=${bg2.hallow} crimson=${bg2.crimson}${tag}`);
    if (d === 4) {
      found.push({ f, save });
      const gl = Math.round(save.header.groundLevel ?? 300);
      const col = decodeSandColumns(save.tiles, save.header.w, save.header.h, gl + 80);
      // 找最大连续沙带
      let best = null, runStart = -1;
      const thresh = 60;
      for (let x = 0; x < col.length; x++) {
        if (col[x] >= thresh) { if (runStart < 0) runStart = x; }
        else if (runStart >= 0) { if (!best || x - runStart > best.w2 - best.w1) best = { w1: runStart, w2: x }; runStart = -1; }
      }
      if (best) {
        const cx = Math.floor((best.w1 + best.w2) / 2);
        let gy = 0; const h = save.header.h, w = save.header.w;
        // 粗找表面:复用列计数上界即可,这里只给 x 范围
        console.log(`   └ 沙带 x ${best.w1}..${best.w2}(中心 ${cx}),出生 (${save.header.spawnX},${save.header.spawnY}),地表 ${gl} → 出生${cx > save.header.spawnX ? '向右' : '向左'}走约 ${Math.abs(cx - save.header.spawnX)} 格`);
      }
    }
  } catch (e) {
    console.log(`${f}  解析失败: ${String(e?.message ?? e).slice(0, 120)}`);
  }
}
console.log(`\n样式4 世界数: ${found.length}`);
if (!found.length) console.log('现有世界无样式4 → 用 TerrariaServer 批量生成筛seed');
