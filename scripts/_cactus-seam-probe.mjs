// 仙人掌 chunk 底缝（tileTop+2 溢出跨 chunk）复现/验收探针 v2（2026-08-27 用户报 FTW V2 导入图）。
// 原理：格 (x,y) 内容画在 y*16+2..y*16+18，chunk 末行(y%16==15)底部 2px 溢出带被
//   烘焙 clip 裁掉；下一 chunk 首格自 +2 起画，两 chunk 都不画这 2px → 主干断缝。
// v2：修 v1 坐标 bug（世界坐标误当 chunk 局部坐标=越界读零假阴性）；
//   加贴图源帧 rows14-15 逐像素精确比对；修截图 clip NaN。
// 采集（全部读烘焙 chunk tile 层原像素，与光照无关）：
//   A chunk(240,28) 顶部 0-1 行（世界 7168-7169）主干列——修复前=全透明，修复后=cell(3840,447) 源帧 rows14-15
//   B chunk(240,27) cell(3840,447) 底部 254-255 行——修复前=padding 垃圾，修复后=rows12-13 正常内容
//   C 缝带像素 vs Tiles_80 cell(0,1) rows14-15 逐像素相等率（期望 100%）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const WLD = '/Users/vinlic/Downloads/FTW V2.wld';
const OUT = process.env.OUT ?? '/tmp/cactus-seam';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wldB64 = fs.readFileSync(WLD).toString('base64');

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'], defaultViewport: { width: 1512, height: 862 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await p.goto(ORIGIN + '/?nosw', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 120000 });

const conv = await p.evaluate(async (b64) => {
  const { parseWldToSave } = await import('/src/wld/WldImport.ts');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const r = parseWldToSave(buf);
  return { json: JSON.stringify(r.save), name: r.save.header.name };
}, wldB64);
console.log('wld→save:', conv.name, 'jsonLen', conv.json.length);
await p.evaluate((t) => window.__swLoadJson(t), conv.json);
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  await sleep(1000);
  inGame = await p.evaluate(() => !!(window.__swGame && window.__swGame.renderer && window.__swGame.player));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
await sleep(4000);
// 传送到右株仙人掌 (3840,443..448) 旁，确保 chunk (240,27)/(240,28) 已烘焙
await p.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 3832 * 16; g.player.y = 440 * 16;
  g.player.vx = 0; g.player.vy = 0;
});
await sleep(5000);
// 关掉欢迎弹窗 + 等资源加载遮罩消失，保证截图可读
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button, .btn, [class*=button]')]
    .find((el) => (el.textContent ?? '').includes('我已知晓'));
  if (btn) btn.click();
});
await sleep(2500);

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const CACT = st.type[st.idx(3840, 445)];

  // chunk tile 层读：局部坐标（v1 把世界坐标当局部=越界读零，已修）
  const chunkTile = (cx, cy) => {
    const ch = g.chunks.get(cx, cy);
    if (!ch || !ch.tile) return null;
    const tcv = document.createElement('canvas'); tcv.width = 256; tcv.height = 256;
    const tctx = tcv.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(ch.tile, ch.sx, ch.sy, 256, 256, 0, 0, 256, 256); // 1:1
    return tctx;
  };

  // 1) 贴图真值：Tiles_80 cell(0,1)（=cell(3840,447) 的帧:中段干）rows 14-15
  const { cactusFrameAt } = await import('/src/render/VanillaTiler.ts');
  const fr = cactusFrameAt(st, 3840, 447, CACT);
  const img = g.chunks.autotiler.atlas.ensureVImage('vanilla/Tiles_80.png');
  const icv = document.createElement('canvas'); icv.width = img.width; icv.height = img.height;
  icv.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
  const sheetStrip = icv.getContext('2d', { willReadFrequently: true })
    .getImageData(fr.col * 18, fr.row * 18 + 14, 16, 2).data;

  // 2) 缝带实测：chunk(240,28) 顶部 0-1 行、主干格 local x=0（世界 3840）
  const tctx28 = chunkTile(240, 28);
  const band = tctx28.getImageData(0, 0, 16, 2).data;
  let bandOpCols = 0, eqCols = 0;
  const bandCols = [];
  for (let x = 0; x < 16; x++) {
    let op = 0, eq = 0;
    for (let y = 0; y < 2; y++) {
      const a = band[(y * 16 + x) * 4 + 3];
      if (a > 0) op++;
      const si = (y * 16 + x) * 4;
      if (Math.abs(band[si] - sheetStrip[si]) <= 1 && Math.abs(band[si + 1] - sheetStrip[si + 1]) <= 1
        && Math.abs(band[si + 2] - sheetStrip[si + 2]) <= 1 && Math.abs(a - sheetStrip[si + 3]) <= 1) eq++;
    }
    if (op) bandOpCols++;
    if (eq === 2) eqCols++;
    bandCols.push(op ? '#' : '.');
  }

  // 3) 缝格底部：chunk(240,27) cell(3840,447) local(0,240) 16×16
  const tctx27 = chunkTile(240, 27);
  const seam = tctx27.getImageData(0, 240, 16, 16).data;
  const seamRows = [];
  for (let y = 0; y < 16; y++) {
    let m = '';
    for (let x = 0; x < 16; x++) m += seam[(y * 16 + x) * 4 + 3] > 0 ? '#' : '.';
    seamRows.push(m);
  }
  const bottom2 = [];
  for (let y = 14; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4;
    if (seam[i + 3] > 0) bottom2.push([seam[i], seam[i + 1], seam[i + 2]]);
  }

  // 4) twin bake 复核（独立画布同代码路径）：chunk(240,28) rows 0-1 主干列
  const wallCv = document.createElement('canvas'); wallCv.width = 256; wallCv.height = 256;
  const tileCv = document.createElement('canvas'); tileCv.width = 256; tileCv.height = 256;
  g.chunks.bakeChunkInto(240, 28, wallCv, tileCv, -1);
  const twin = tileCv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 16, 2).data;
  let twinOp = 0;
  for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) if (twin[(y * 16 + x) * 4 + 3] > 0) { twinOp++; break; }

  return {
    frameOfSeamCell: fr,
    bandOpaqueCols: bandOpCols, bandMask: bandCols.join(''),
    bandEqToSheetCols: eqCols, sheetStripSample: [sheetStrip[0], sheetStrip[1], sheetStrip[2], sheetStrip[3]],
    seamBottom2Colors: bottom2.slice(0, 8),
    twinBandOpaqueCols: twinOp,
  };
});
console.log(JSON.stringify(out, null, 1));

fs.mkdirSync(OUT, { recursive: true });
await p.screenshot({ path: OUT + '/shot.png' });
const clip = await p.evaluate(() => {
  const g = window.__swGame;
  const fn = g.camera?.worldToScreen ?? g.renderer?.camera?.worldToScreen?.bind(g.renderer.camera);
  if (!fn) return null;
  const [sx, sy] = fn.call(g.camera ?? g.renderer.camera, 3840 * 16 + 8, 445 * 16 + 8);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
  return { x: Math.max(0, Math.round(sx) - 120), y: Math.max(0, Math.round(sy) - 160), width: 240, height: 320 };
});
if (clip) await p.screenshot({ path: OUT + '/trunk.png', clip });
console.log('截图 →', OUT + '/shot.png', clip ? ', ' + OUT + '/trunk.png' : '(clip 无效,仅全屏)');
await b.close();
