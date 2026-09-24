// ★BGL 页纹理 tile 层饥饿探针（2026-09-24 用户实报:?bgl=1 部分物块不渲染=透明空白）。
// 定谳面:页纹理增量上传账 ChunkCache.glDirtyPages 为【单账共享】(页号键,不分层),
// 而 bakeChunkInto 一次烘焙同写墙/tile 两张页画布;Renderer bglStageGrid 墙段先跑
// → worldPageTex('w') 消费脏账并 delete → tile 段 worldPageTex('t') 读到空账
// → tile 页纹理永缺「页驻留后的增量烘焙」格 = 透明洞(墙纹理正常 → 背景/墙可见,
// 物块缺失,与用户截图 1:1)。
// 三相位(控制组+双红签名):
//   T  大距 teleport 一次到位:全部新 chunk 同帧烤完 → 新页 state① 全量上传画布
//      完整 = 预期 n=0(对照:单帧全量路径无病,证病不在「首传时机」而在「增量账」);
//   W  小步走(320px/步×8 步):同页格跨帧逐步烤 → 第 2 格起走 state② 增量账
//      → 墙段消费后 tile 段饥饿 = 洞(WALK RED);
//   E  实建编辑(store.setTile 置 6×3 实心块):markDirty 重烘 resident 页粘滞槽
//      = 用户「建筑区缺块」同机制(EDIT RED)。
// 判据:B(GL 态)vs A(2D 态=页画布直读真值) census;zoom 2.0 tie-free 逐字节档。
// 运行:SW_ORIGIN=http://localhost:5211 node tools/run-diag.mjs --timeout=600000 scripts/_bgl-tile-starve-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?bgl=1&cloudcache=0';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

// ---- 确定性套件(同 _b1-page-scan 锚) + 快照/翻转注入面 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.numClouds = 60; w.lightning = 0; w.update = () => {}; }
  window.__bglSet = (v) => r.constructor.bglSetForTest(v);
  window.__pause = (v) => { g.paused = v; };
  window.__teleport = (x, y) => {
    g.player.x = x; g.player.y = y;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = x + g.player.w / 2; g.camera.y = y + g.player.h / 2;
  };
  window.__state = () => {
    const glw = r['worldPipeLayer'];
    return {
      flag: r.constructor.bgl,
      path: r.bglPathUsed,
      uploaded: glw ? { ...r['_bglPageUploaded'] } : null,
      texKeys: glw ? [...glw.texs.keys()].sort() : [],
      chunkKeys: [...g.chunks.chunks.keys()].length,
      pageCount: g.chunks.pageCount,
    };
  };
  window.__chunkCells = () => {
    const m = new Map();
    for (const [k, p] of g.chunks.chunks) if (p && p.cell >= 0) m.set(k, p.cell);
    return [...m.entries()];
  };
  window.__bakeTimes = () => {   // chunk key → cell(定相用)
    const m = {};
    for (const [k, p] of g.chunks.chunks) if (p && p.cell >= 0) m[k] = p.cell;
    return m;
  };
});
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
  m.options.data.renderScale = 1;
}));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  Object.defineProperty(r, '_liquidNow', { get: () => 60_000, set: () => {}, configurable: true });
  window.__swGame.lighting.clock.tick = () => {};
});
// zoom 2.0 = tie-free 档(2:1 整档,quadTile ε 补正;AB 矩阵 strict 逐字节档)。
// ★直钉 zoom+zoomTarget 双写(暂停下 easeZoom 不推进,setZoomTarget 单写会停在 1.25)
await page.evaluate(() => {
  const cam = window.__swGame.camera;
  cam.zoom = 2.0; cam.zoomTarget = 2.0;
});

async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    });
  }
}

/** 主画布全幅快照 */
async function snapFin() {
  return page.evaluate(() => {
    const c = window.__swGame.renderer.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { w: c.width, h: c.height, b64: btoa(bin) };
  });
}

/** census + 逐 chunk 定位(diff 像素落进哪个 chunk 的设备矩形;bglStageGrid 同式) */
async function censusPerChunk(aFin, bFin, cellsBefore) {
  return page.evaluate(({ a, b, cellsBefore }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    const W = a.w, H = a.h;
    const g = window.__swGame, r = g.renderer, cam = g.camera, z = cam.zoom;
    const zz = z * (r._worldLowK || 1);
    const ox = Math.round(r._worldLowW / 2), oy = Math.round(r._worldLowH / 2);
    const camRX = Math.round(cam.x * z) / z, camRY = Math.round(cam.y * z) / z;
    const before = new Map(cellsBefore);
    const cc = g.chunks;
    const ts = 16;
    const rects = [];
    const seen = new Set();
    const cy0 = Math.floor((camRY - oy / zz) / (ts * 16)) - 1, cy1 = Math.ceil((camRY + (H - oy) / zz) / (ts * 16)) + 1;
    const cx0 = Math.floor((camRX - ox / zz) / (ts * 16)) - 1, cx1 = Math.ceil((camRX + (W - ox) / zz) / (ts * 16)) + 1;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = (cx & 0xffff) | ((cy & 0xffff) << 16);
        const pair = cc.chunks.get(k);
        if (!pair || pair.cell < 0 || seen.has(k)) continue;
        seen.add(k);
        const xd0 = ox + Math.round((cx * 256 - camRX) * zz), xd1 = ox + Math.round(((cx + 1) * 256 - camRX) * zz);
        const yd0 = oy + Math.round((cy * 256 - camRY) * zz), yd1 = oy + Math.round(((cy + 1) * 256 - camRY) * zz);
        rects.push({ k, cx, cy, cell: pair.cell, isNew: !before.has(String(k)),
          x0: Math.max(0, xd0), x1: Math.min(W, xd1), y0: Math.max(0, yd0), y1: Math.min(H, yd1) });
      }
    }
    const perChunk = rects.map((rc) => ({ ...rc, n: 0 }));
    let n = 0, maxd = 0;
    for (let py = 0; py < H; py++) {
      const row = py * W;
      for (let px = 0; px < W; px++) {
        const i = (row + px) * 4;
        const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]),
          Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
        if (dd <= 0) continue;
        n++; if (dd > maxd) maxd = dd;
        for (const rc of perChunk) {
          if (px >= rc.x0 && px < rc.x1 && py >= rc.y0 && py < rc.y1) { rc.n++; break; }
        }
      }
    }
    return { n, maxd, perChunk: perChunk.filter((r) => r.n > 0 || r.isNew).sort((a, b) => b.n - a.n) };
  }, { a: aFin, b: bFin, cellsBefore });
}

/** 单相位主流程:bgl=1 下动作+烤 → B 捕获 → 翻 2D 捕 A → census → 翻回 GL */
async function phase(label, cellsBefore) {
  const Bfin = await snapFin();
  await page.evaluate(() => window.__bglSet(false));
  await waitFrame(3);
  const Afin = await snapFin();
  await page.evaluate(() => window.__bglSet(true));
  await waitFrame(2);
  const rep = await censusPerChunk(Afin, Bfin, cellsBefore);
  console.log(`[${label}] census n=${rep.n} maxΔ=${rep.maxd}`);
  for (const rc of rep.perChunk.slice(0, 16)) {
    console.log(`  chunk(${rc.cx},${rc.cy}) cell=${rc.cell} page=${Math.floor(rc.cell / 16)} slot=${rc.cell % 16} isNew=${rc.isNew} diff=${rc.n}`);
  }
  return rep;
}

// ---- 暖机:出生点 bgl=1 渲染数帧 → 页驻立(帧1 双段 state① 全量,内容正确) ----
await page.evaluate(() => window.__pause(true));
await waitFrame(8);
const stWarm = await page.evaluate(() => window.__state());
console.log('[暖机]', JSON.stringify(stWarm));
chk('R3 暖机:页纹理双摞驻留(wpg+tpg 齐全)', stWarm.texKeys.length >= 2 && stWarm.texKeys.every((k) => /^(w|t)pg:\d+$/.test(k)),
  `keys=${stWarm.texKeys.join(',')} uploaded=${JSON.stringify(stWarm.uploaded)}`);

// ---- 相位 T(对照):大距 teleport 一次到位 → 全部新 chunk 同帧烤完,新页全量上传完整 ----
{
  const cellsBefore = await page.evaluate(() => window.__chunkCells());
  await page.evaluate(() => {
    const g = window.__swGame;
    window.__teleport(Math.round(g.player.x) + 1600, g.world.groundLevel * 16 - 48);
  });
  await waitFrame(8);
  const st = await page.evaluate(() => window.__state());
  console.log('[T后]', JSON.stringify(st));
  const rep = await phase('T 大距teleport(对照)', cellsBefore);
  chk('T 对照组:单帧新页全量路径 n=0(病不在首传时机)', rep.n === 0, `n=${rep.n} maxΔ=${rep.maxd}`);
}

// ---- 相位 W(RED 期待):小步走 8×320px——同页格跨帧烤,第 2 格起 state② 增量账 ----
// ★机制追踪钩:texFromImage(hit/create 区分)/texSubUpdate/glMarkPageDirty 调用流水
await page.evaluate(async () => {
  const G = await import('/src/render/GLSpriteLayer.ts');
  const P = G.GLSpriteLayer.prototype;
  window.__glLog = [];
  if (!P.__bglStarveHooked) {
    const oSub = P.texSubUpdate;
    P.texSubUpdate = function (key, src, x, y, w, h) {
      if (/^(w|t)pg:/.test(key)) window.__glLog.push(`sub ${key} @(${x},${y})`);
      return oSub.call(this, key, src, x, y, w, h);
    };
    const oFrom = P.texFromImage;
    P.texFromImage = function (key, img, repeatX, noMip) {
      if (/^(w|t)pg:/.test(key)) {
        const create = !this.texs.has(key);
        window.__glLog.push(`${create ? 'CREATE' : 'hit'} ${key}`);
      }
      return oFrom.call(this, key, img, repeatX, noMip);
    };
    P.__bglStarveHooked = true;
  }
  const C = await import('/src/render/ChunkCache.ts');
  const CP = C.ChunkCache.prototype;
  if (!CP.__bglStarveHooked) {
    const oMark = CP.glMarkPageDirty;
    CP.glMarkPageDirty = function (cell) {
      window.__glLog.push(`mark p${Math.floor(cell / 16)}s${cell % 16}`);
      return oMark.call(this, cell);
    };
    CP.__bglStarveHooked = true;
  }
  window.__glLogClear = () => { window.__glLog.length = 0; };
  // ★GL 纹理直读:FBO 挂页纹理 → readPixels 256² slot 区非透明像素计数(纹理级真值)
  window.__readTexSlot = (kind, idx, slot) => {
    const glw = window.__swGame.renderer['worldPipeLayer'];
    if (!glw) return null;
    const gl = glw['gl'];
    const e = glw.texs.get(`${kind}pg:${idx}`);
    if (!e) return { missing: true };
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, e.tex, 0);
    const sx = (slot % 4) * 256, sy = Math.floor(slot / 4) * 256;
    const px = new Uint8Array(256 * 256 * 4);
    gl.readPixels(sx, sy, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    let a = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) a++;
    return { alphaCount: a };
  };
  window.__canvasSlotAlpha = (layer, idx, slot) => {
    const pg = window.__swGame.chunks.pageCanvas(layer, idx);
    if (!pg) return null;
    const lc = document.createElement('canvas');
    lc.width = 256; lc.height = 256;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(pg, (slot % 4) * 256, Math.floor(slot / 4) * 256, 256, 256, 0, 0, 256, 256);
    const d = lx.getImageData(0, 0, 256, 256).data;
    let a = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) a++;
    return { alphaCount: a };
  };
});
{
  const cellsBefore = await page.evaluate(() => window.__chunkCells());
  for (let s = 0; s < 8; s++) {
    await page.evaluate(() => window.__glLogClear());
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__teleport(Math.round(g.player.x) + 320, g.world.groundLevel * 16 - 48);
    });
    await waitFrame(2);
    const log = await page.evaluate(() => window.__glLog.slice(0, 300));
    const tpgLines = log.filter((l) => l.includes('tpg:'));
    console.log(`[W step${s}] 共${log.length}条 | tpg相关: ${tpgLines.length ? tpgLines.slice(0, 24).join(' | ') : '(无)'}`);
    console.log(`[W step${s}] wpg增量: ${log.filter((l) => l.startsWith('sub wpg')).length}条 | tpg增量: ${log.filter((l) => l.startsWith('sub tpg')).length}条 | mark: ${log.filter((l) => l.startsWith('mark')).length}条`);
  }
  const st = await page.evaluate(() => window.__state());
  console.log('[W后]', JSON.stringify(st));
  // ★纹理级直读:终视野新烘焙 chunk 的 tile 纹理 slot vs 页画布同 slot 非透明计数
  const texAudit = await page.evaluate(() => {
    const g = window.__swGame;
    const out = [];
    for (const [k, p] of g.chunks.chunks) {
      if (!p || p.cell < 0) continue;
      const idx = Math.floor(p.cell / 16), slot = p.cell % 16;
      const cv = window.__canvasSlotAlpha('tile', idx, slot);
      const tx = window.__readTexSlot('t', idx, slot);
      const cvw = window.__canvasSlotAlpha('wall', idx, slot);
      const txw = window.__readTexSlot('w', idx, slot);
      out.push({ k, cell: p.cell, idx, slot, cvT: cv?.alphaCount, txT: tx?.alphaCount ?? tx?.missing,
        cvW: cvw?.alphaCount, txW: txw?.alphaCount ?? txw?.missing });
    }
    return out;
  });
  const staleT = texAudit.filter((r) => typeof r.txT === 'number' && r.cvT > 200 && r.txT < r.cvT * 0.5);
  const staleW = texAudit.filter((r) => typeof r.txW === 'number' && r.cvW > 200 && r.txW < r.cvW * 0.5);
  console.log(`[W纹理审计] tile 陈旧槽=${staleT.length} wall 陈旧槽=${staleW.length}(全 chunk=${texAudit.length})`);
  for (const r of staleT.slice(0, 12)) console.log(`  TLE陈旧 chunkKey=${r.k} cell=${r.cell} p${r.idx}s${r.slot} 画布α=${r.cvT} 纹理α=${r.txT}`);
  const rep = await phase('W 小步走', cellsBefore);
  const newHoled = rep.perChunk.filter((r) => r.isNew && r.n > 0).length;
  console.log(`[W] 新烘焙 chunk 洞数=${newHoled}/${rep.perChunk.filter((r) => r.isNew).length}`);
}

// ---- 相位 E(RED 期待):实建编辑——resident 页粘滞槽重烘(用户建筑区缺块同机制) ----
{
  await page.evaluate(() => {
    const g = window.__swGame;
    // 回出生点(视野 chunk 全缓存,页 0-2 resident)
    window.__teleport(400, g.world.groundLevel * 16 - 48);
  });
  await waitFrame(4);
  const cellsBefore = await page.evaluate(() => window.__chunkCells());
  const placed = await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    const ptx = Math.floor(g.player.x / 16), pty = Math.floor(g.player.y / 16);
    let t = 0;
    for (let y = pty; y < g.world.h; y++) {
      const i = st.idx(ptx, y);
      if (st.flags[i] && st.type[i] !== 0) { t = st.type[i]; break; }
    }
    const ok = [];
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 6; dx++) {
      const x = ptx - 10 + dx, y = pty - 8 + dy;
      if (x < 0 || y < 0) continue;
      const i = st.idx(x, y);
      if (!st.flags[i]) { st.setTile(x, y, t); ok.push([x, y]); }
    }
    return { type: t, n: ok.length };
  });
  console.log('[E] 置块', JSON.stringify(placed));
  await waitFrame(4);   // bgl=1 渲染帧内重烘(sticky 槽,resident 页 → state②)
  const st = await page.evaluate(() => window.__state());
  console.log('[E后]', JSON.stringify(st));
  const rep = await phase('E 实建编辑', cellsBefore);
  console.log(`[E] census n=${rep.n}(置块 ${placed.n} 格 ≈ 世界 96×48px)`);
}

if (pageErrors.length) { console.log('PAGE ERRORS (' + pageErrors.length + '):'); for (const e of pageErrors.slice(0, 8)) console.log('  ' + e); }
await browser.close();
console.log('PROBE DONE(判读:census n>0 且集中在新烘焙 chunk = tile 层饥饿红;全 0 = 绿)');
