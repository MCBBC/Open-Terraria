// BJ632 件2:刃杖(vid 4758 Smolstar)贴图「闪白」定谳探针(一次性)。
// 三站取样(worldToScreen 版):
//   A DOM 图标面:热栏槽 0 图标 dataURL 解码+内容指纹+3s 监听(src 变更)
//   B 手持静持面:玩家手持刃杖静止,主画布手部区域逐帧白块率/指纹(180 帧)
//   C 挥舞面:按住左键连挥(autoReuse),同区域逐帧 180 帧
//   D 召唤物面:projId 864 在场,其包围盒逐帧白块率(180 帧)
// 白闪判据:每帧白块率(>=240,>=240,>=240,α>0)序列峰谷交替。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj632-bladestaff-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump, giveItems, mouseHold, aimAt } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260909 });

// ---- 给物:刃杖 4758 + 前缀 95(渴望) 进槽 0 并选中 ----
const gave = await giveItems(page, [{ vid: 4758, stack: 1, slot: 0 }], { wipe: true, select: 0 });
await page.evaluate(() => {
  const g = window.__swGame;
  const s = g.player.inv.slots[0];
  if (s) { s.prefix = 95; }
});
await pump(page, 30);

// ---- 页内逐帧取样器:区域=世界像素矩形(worldToScreen 换算),逐 rAF 读主画布 ----
async function sampleRegion(name, frames, regionOf) {
  return page.evaluate(async ({ name, frames, regionOfSrc }) => {
    const regionOf = eval('(' + regionOfSrc + ')');
    const g = window.__swGame;
    const cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
    if (!cv) return { why: 'no-canvas' };
    const out = [];
    const scratch = document.createElement('canvas');
    const cam = g.camera;
    const w2s = (wx, wy) => {
      const s = cam.worldToScreen(wx, wy);
      return Array.isArray(s) ? s : [s.x, s.y];
    };
    const statsOf = (d, n) => {
      let white = 0, nz = 0, fnv = 0x811c9dc5;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 0) nz++;
        if (d[i] >= 240 && d[i + 1] >= 240 && d[i + 2] >= 240 && d[i + 3] > 0) white++;
        const q = ((d[i] >> 5) << 10) | ((d[i + 1] >> 5) << 5) | ((d[i + 2] >> 5) | (d[i + 3] ? 1 << 15 : 0));
        fnv ^= q; fnv = Math.imul(fnv, 0x01000193) >>> 0;
      }
      return { white: white / n, nz: nz / n, fp: fnv >>> 0 };
    };
    for (let f = 0; f < frames; f++) {
      await new Promise((r) => requestAnimationFrame(r));
      const reg = regionOf(g);
      if (!reg) { out.push(null); continue; }
      const z = cam.zoom;
      const [px, py] = w2s(reg.x, reg.y);
      const sx = Math.max(0, Math.round(px)), sy = Math.max(0, Math.round(py));
      const sw = Math.max(1, Math.min(cv.width - sx, Math.round(reg.w * z)));
      const sh = Math.max(1, Math.min(cv.height - sy, Math.round(reg.h * z)));
      if (sw <= 2 || sh <= 2) { out.push({ off: true }); continue; }
      scratch.width = sw; scratch.height = sh;
      const cx = scratch.getContext('2d', { willReadFrequently: true });
      cx.drawImage(cv, sx, sy, sw, sh, 0, 0, sw, sh);
      const d = cx.getImageData(0, 0, sw, sh).data;
      out.push({ t: performance.now() | 0, ...statsOf(d, sw * sh) });
    }
    const whites = out.map((o) => (o && o.white != null) ? o.white : null).filter((v) => v != null);
    const maxW = whites.length ? Math.max(...whites) : null, minW = whites.length ? Math.min(...whites) : null;
    let jumps = 0;
    for (let i = 1; i < whites.length; i++) if (Math.abs(whites[i] - whites[i - 1]) > 0.05) jumps++;
    const uniqFps = new Set(out.filter(Boolean).map((o) => o.fp));
    return { name, frames: out.length, nulls: out.filter((o) => o === null).length, offs: out.filter((o) => o && o.off).length, whiteMax: maxW, whiteMin: minW, whiteAvg: whites.reduce((a, b) => a + b, 0) / (whites.length || 1), jumps, uniqFps: uniqFps.size, seq: whites.map((v) => +(v.toFixed(3))) };
  }, { name, frames, regionOfSrc: regionOf.toString() });
}

const playerBox = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  return { x: p.x, y: p.y, w: p.w, h: p.h };
});

// ---- 站 A:DOM 图标 ----
const stationA = await page.evaluate(async () => {
  const g = window.__swGame;
  const slot = document.querySelector('.sw-hotbar .sw-slot') || document.querySelectorAll('.sw-slot')[0];
  if (!slot) return { why: 'no-slot-el' };
  const img = slot.querySelector('img');
  if (!img) return { why: 'no-img', slotHtml: slot.outerHTML.slice(0, 200) };
  const src0 = img.getAttribute('src') || '';
  const c = document.createElement('canvas');
  await new Promise((r) => { const im = new Image(); im.onload = () => { c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); r(); }; im.src = src0; });
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let white = 0, cyan = 0, nz = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 0) nz++;
    if (d[i] >= 240 && d[i + 1] >= 240 && d[i + 2] >= 240 && d[i + 3] > 0) white++;
    if (d[i + 2] > 150 && d[i] < 120 && d[i + 1] > 120) cyan++;
  }
  let srcChanges = 0;
  const obs = new MutationObserver(() => srcChanges++);
  obs.observe(img, { attributes: true, attributeFilter: ['src'] });
  const t0 = performance.now();
  while (performance.now() - t0 < 3000) await new Promise((r) => requestAnimationFrame(r));
  obs.disconnect();
  return {
    srcLen: src0.length, isData: src0.startsWith('data:'),
    px: { white: white / (c.width * c.height), cyan: cyan / (c.width * c.height), nz: nz / (c.width * c.height), w: c.width, h: c.height },
    srcChanges3s: srcChanges, srcStable: img.getAttribute('src') === src0,
  };
});

// ---- 站 B:静持(不按鼠标)手部区域 180 帧 ----
const regionB = `function (g) {
  const p = g.player;
  return { x: p.x + p.w / 2 - 24, y: p.y + p.h / 2 - 30, w: 48, h: 48 };
}`;
await aimAt(page, playerBox.x / 16 + 20, playerBox.y / 16);
const stationB = await sampleRegion('B-static-hold', 180, regionB);

// ---- 站 C:按住左键连挥 180 帧采样(采样期间按住) ----
await mouseHold(page, true);
const stationC = await sampleRegion('C-swing', 180, regionB);
await mouseHold(page, false);
await pump(page, 60);

// ---- 站 D:召唤物 864 区域(若已召唤) ----
const minionInfo = await page.evaluate(() => {
  const g = window.__swGame;
  const projs = g.entities.projectiles ?? [];
  return {
    count: projs.length,
    kinds: projs.slice(0, 8).map((p) => ({ cls: p.constructor.name, projId: p.projId ?? null, x: Math.round(p.x), y: Math.round(p.y), w: p.w, h: p.h, dead: !!p.dead })),
  };
});

let stationD = { skipped: true, minionInfo };
const has864 = minionInfo.kinds.some((k) => k.projId === 864);
if (has864) {
  const regionD = `function (g) {
    const m = (g.entities.projectiles ?? []).find((p) => p.projId === 864 && !p.dead);
    if (!m) return null;
    return { x: m.x + m.w / 2 - 28, y: m.y + m.h / 2 - 28, w: 56, h: 56 };
  }`;
  stationD = await sampleRegion('D-minion-864', 180, regionD);
}

console.log('BJ632-A(DOM图标)', JSON.stringify(stationA));
console.log('BJ632-B(静持手部180帧)', JSON.stringify({ ...stationB, seq: stationB.seq ? stationB.seq.slice(0, 60) : undefined }));
console.log('BJ632-C(挥舞180帧)', JSON.stringify({ ...stationC, seq: stationC.seq ? stationC.seq.slice(0, 60) : undefined }));
console.log('BJ632-D(召唤物180帧)', JSON.stringify({ ...stationD, seq: stationD.seq ? stationD.seq.slice(0, 60) : undefined, minionInfo: stationD.skipped ? minionInfo : undefined }));
await browser.close();
