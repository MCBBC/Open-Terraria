// FTW V2 导入世界"半透明墙面板"复现探针 v2（2026-08-27 用户报）。
// 采集：A 墙id/coat 分布 B tiler 直绘 alpha C 烘焙 chunk 墙层 cell alpha
//   D 缺表登记 chunkSheets E hasTexture/元数据/vimages 状态 F markDirty 自愈验证
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const WLD = '/Users/vinlic/Downloads/FTW V2.wld';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wldB64 = fs.readFileSync(WLD).toString('base64');

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'], defaultViewport: { width: 1512, height: 862 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
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
await sleep(6000);
// 传送到面板区（出生点与报告玩家位不同,面板在屏外）
await p.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 4056 * 16; g.player.y = 435 * 16;
  g.player.vx = 0; g.player.vy = 0;
});
await sleep(5000);

const out = await p.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const wallHist = {}, coatHist = {};
  const sample = [];
  for (let y = 424; y <= 440; y++) {
    let line = '';
    for (let x = 4046; x <= 4062; x++) {
      const i = st.idx(x, y);
      const w = st.wall[i];
      wallHist[w] = (wallHist[w] || 0) + 1;
      if (st.coat[i]) coatHist[st.coat[i]] = (coatHist[st.coat[i]] || 0) + 1;
      line += (w ? String(w).padStart(3) : '  .');
    }
    sample.push(y + ':' + line);
  }
  const cv = document.createElement('canvas'); cv.width = 48; cv.height = 48;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const trunc = ['glass', 'v_328_shadow_chest', 'v_459_glass_window', 'v_748_glass_window'];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = 4053 + dx, y = 425 + dy;
    const w = st.wall[st.idx(x, y)];
    if (w) g.chunks.wallTiler.draw(ctx, st, x, y, w, trunc, 24 + dx * 16, 24 + dy * 16);
  }
  const dd = ctx.getImageData(0, 0, 48, 48).data;
  const A = (x, y) => dd[(y * 48 + x) * 4 + 3];
  const cellAlpha = (chx, chy, tx, ty) => {
    const ch = g.chunks.get(chx, chy);
    if (!ch || !ch.wall) return 'no-chunk';
    const tcv = document.createElement('canvas'); tcv.width = 256; tcv.height = 256;
    const tctx = tcv.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(ch.wall, ch.sx, ch.sy, 256, 256, 0, 0, 256, 256);   // 1:1
    const d = tctx.getImageData((tx - chx * 16) * 16, (ty - chy * 16) * 16, 16, 16).data;
    let op = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 0) op++;
    return +(100 * op / 256).toFixed(0);
  };

  // 雕像壁画诊断：type/coat 分布 + 烘焙 tile 层 alpha + showInvisibleBlocks
  const statue = { types: {}, coats: {}, tileAlpha: null, showInv: st.showInvisibleBlocks ?? null, samples: [] };
  for (let y = 420; y <= 465; y++) for (let x = 4028; x <= 4050; x++) {
    const i = st.idx(x, y);
    if (!st.flags[i]) continue;
    const t = st.type[i];
    statue.types[t] = (statue.types[t] || 0) + 1;
    const c = st.coat[i] ?? 0;
    if (c) statue.coats[c] = (statue.coats[c] || 0) + 1;
  }
  {
    // 找一个雕像格(灰砖块且有 coat 或任意 type=38)测烘焙 alpha
    let pc = null;
    outer2: for (let y = 425; y <= 460; y++) for (let x = 4030; x <= 4048; x++) {
      const i = st.idx(x, y);
      if (st.flags[i] && st.type[i] === 38) { pc = [x, y]; break outer2; }
    }
    if (pc) {
      const chx = Math.floor(pc[0] / 16), chy = Math.floor(pc[1] / 16);
      const ch = g.chunks.get(chx, chy);
      if (ch && ch.tile) {
        const tcv = document.createElement('canvas'); tcv.width = 256; tcv.height = 256;
        const tctx = tcv.getContext('2d', { willReadFrequently: true });
        tctx.drawImage(ch.tile, ch.sx, ch.sy, 256, 256, 0, 0, 256, 256);
        const d = tctx.getImageData((pc[0] - chx * 16) * 16, (pc[1] - chy * 16) * 16, 16, 16).data;
        let op = 0, sumA = 0;
        for (let k = 3; k < d.length; k += 4) { if (d[k] > 0) op++; sumA += d[k]; }
        statue.tileAlpha = { cell: pc, opaquePct: +(100 * op / 256).toFixed(0), avgA: Math.round(sumA / 256) };
      }
    }
  }

  // 标注格逐格:烘焙 tile 层 alpha 分组(斜面 vs 非斜面)+ 帧
  const marks = [
    [4038,431],[4039,431],[4039,430],[4040,430],[4041,431],[4041,432],[4042,432],[4043,432],
    [4044,432],[4044,433],[4043,433],[4042,433],[4041,433],[4040,434],[4041,434],[4042,434],
    [4042,435],[4043,435],[4041,435],[4041,436],[4042,436],[4043,436],[4037,438],[4038,438],
    [4040,438],[4041,438],[4040,439],[4041,439],[4039,440],[4040,440],[4039,441],[4039,442],
    [4039,443],[4040,443],[4041,443],[4042,443],[4042,444],[4043,444],[4044,444],[4045,444],
    [4044,445],[4045,445],[4042,446],[4043,446],[4042,447],[4043,447],[4038,448],[4039,448],
  ];
  const grp = { slope: {n:0, sum:0, cells:[]}, flat: {n:0, sum:0, cells:[]} };
  for (const [mx, my] of marks) {
    const i = st.idx(mx, my);
    if (!st.flags[i]) continue;
    const sl = st.slope[i], hf = st.half[i];
    const chx = Math.floor(mx / 16), chy = Math.floor(my / 16);
    const ch = g.chunks.get(chx, chy);
    if (!ch || !ch.tile) continue;
    const tcv = document.createElement('canvas'); tcv.width = 256; tcv.height = 256;
    const tctx = tcv.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(ch.tile, ch.sx, ch.sy, 256, 256, 0, 0, 256, 256);
    const d = tctx.getImageData((mx - chx * 16) * 16, (my - chy * 16) * 16, 16, 16).data;
    let op = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 0) op++;
    const pct = +(100 * op / 256).toFixed(0);
    const g2 = (sl || hf) ? grp.slope : grp.flat;
    g2.n++; g2.sum += pct;
    if (pct < 100) g2.cells.push(mx + ',' + my + ':' + pct + '%:sl' + sl + (hf ? 'H' : '') + ':fx' + st.frameX[i] + ',fy' + st.frameY[i]);
  }
  const slopeStat = { 斜面格: grp.slope.n, 斜面均值不透明: grp.slope.n ? Math.round(grp.slope.sum / grp.slope.n) + '%' : '-', 非斜格: grp.flat.n, 非斜均值: grp.flat.n ? Math.round(grp.flat.sum / grp.flat.n) + '%' : '-', 不满格清单: [...grp.slope.cells, ...grp.flat.cells].slice(0, 12) };
  const key = (253 << 16) | 26;
  const cs = g.chunks.chunkSheets;
  const sheetsReg = cs ? [...(cs.get(key) ?? [])] : 'no-field';
  const atlas = g.atlas ?? g.chunks.atlasRef ?? null;
  const wmeta = atlas ? atlas.vanilla.walls['147'] : null;
  const vimg = wmeta && atlas.vimages ? atlas.vimages.has(wmeta.sheet) : '?';
  return {
    statue,
    wallHist, coatHist, slopeStat,
    tiler: { center: A(24, 24), top: A(24, 10), corner: A(2, 2) },
    bakedPanel: cellAlpha(253, 26, 4053, 425),
    bakedPanel2: cellAlpha(253, 26, 4057, 425),
    sheetsReg, hasTex147: g.chunks.wallTiler.hasTexture(147),
    wmetaSheet: wmeta ? wmeta.sheet : null, vimg147: vimg,
    // 分身烘焙：bakeChunkInto 外部目标模式（同代码同数据，独立画布）
    twinBake: (() => {
      const wallCv = document.createElement('canvas'); wallCv.width = 256; wallCv.height = 256;
      const tileCv = document.createElement('canvas'); tileCv.width = 256; tileCv.height = 256;
      g.chunks.bakeChunkInto(253, 26, wallCv, tileCv, -1);
      const tcv = document.createElement('canvas'); tcv.width = 256; tcv.height = 256;
      const tctx = tcv.getContext('2d', { willReadFrequently: true });
      tctx.drawImage(wallCv, 0, 0, 256, 256, 0, 0, 256, 256);   // 1:1
      const d = tctx.getImageData((4053 - 253 * 16) * 16, (425 - 26 * 16) * 16, 16, 16).data;
      let op = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 0) op++;
      return +(100 * op / 256).toFixed(0);
    })(),
    sample,
  };
});
console.log(JSON.stringify(out, null, 1).slice(0, 2600));

await p.evaluate(() => window.__swGame.chunks.markDirty(253, 26));
await sleep(1000);
const healed = await p.evaluate(() => {
  const g = window.__swGame;
  const ch = g.chunks.get(253, 26);
  if (!ch || !ch.wall) return 'no-chunk';
  const tcv = document.createElement('canvas'); tcv.width = 256; tcv.height = 256;
  const tctx = tcv.getContext('2d', { willReadFrequently: true });
  tctx.drawImage(ch.wall, ch.sx, ch.sy, 256, 256, 0, 0, 256, 256);   // 1:1
  const d = tctx.getImageData((4053 - 253 * 16) * 16, (425 - 26 * 16) * 16, 16, 16).data;
  let op = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 0) op++;
  return +(100 * op / 256).toFixed(0);
});
console.log('markDirty 后 cell 不透明% =', healed);
await p.mouse.click(617, 695);
await sleep(1000);
await p.mouse.click(617, 695);
await sleep(1000);
await p.mouse.click(617, 695);
await sleep(800);
await p.screenshot({ path: '/tmp/ftw-repro.png' });
console.log('截图 → /tmp/ftw-repro.png');
// 面板混色判定：面板区均值 vs 屋顶上天空参照（昼/夜都自洽：透=偏天空色，实=偏灰）
const mix = await p.evaluate(() => {
  const g = window.__swGame;
  const cam = g.camera ?? g.renderer.camera;
  const toScreen = (tx, ty) => { const [sx, sy] = g.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8); return [sx, sy]; };
  return { panel: toScreen(4056, 430), sky: toScreen(4056, 418), ptx: Math.round(g.player.x / 16) };
});
const tcv2 = await p.screenshot({ encoding: 'binary' });
fs.writeFileSync('/tmp/ftw-shot2.png', tcv2);
console.log('判定位 panel/sky 屏幕:', JSON.stringify(mix));

// 终局二分：雕像格【烘焙页 alpha】 vs 【最终主画布 alpha】
const final = await p.evaluate(() => {
  try {
    const g = window.__swGame;
    const st = g.world.store;
    const cells = [[4042,432],[4043,433],[4044,434],[4045,435],[4038,448],[4039,431]];
    const pageAlpha = (tx, ty) => {
      const chx = Math.floor(tx / 16), chy = Math.floor(ty / 16);
      const ch = g.chunks.get(chx, chy);
      if (!ch || !ch.tile) return 'no-chunk';
      const tcv = document.createElement('canvas'); tcv.width = 256; tcv.height = 256;
      const tctx = tcv.getContext('2d', { willReadFrequently: true });
      tctx.drawImage(ch.tile, ch.sx, ch.sy, 256, 256, 0, 0, 256, 256);
      const d = tctx.getImageData((tx - chx * 16) * 16 + 8, (ty - chy * 16) * 16 + 8, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };
    const main = g.renderer.canvas;
    const mcv = document.createElement('canvas'); mcv.width = main.width; mcv.height = main.height;
    const mctx = mcv.getContext('2d', { willReadFrequently: true });
    mctx.drawImage(main, 0, 0);
    const cam = g.camera;
    const canvasAlpha = (tx, ty) => {
      const [sx, sy] = cam.worldToScreen(tx * 16 + 8, ty * 16 + 8);
      const d = mctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };
    const out = [];
    for (const [tx, ty] of cells) {
      out.push({ c: tx + ',' + ty, t: st.type[st.idx(tx, ty)],
        wire32: (st.wire[st.idx(tx, ty)] & 32) !== 0, paint: st.paint[st.idx(tx, ty)],
        page: pageAlpha(tx, ty), canvas: canvasAlpha(tx, ty) });
    }
    out.push({ skyRef: canvasAlpha(4045, 415) });
    return out;
  } catch (e) { return 'err:' + String(e).slice(0, 150); }
});
console.log('终局二分:', JSON.stringify(final, null, 1));
await b.close();
