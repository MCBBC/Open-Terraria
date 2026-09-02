// 实帧 CTM 捕获:拦截 drawImage,按 CTM.e/f（屏幕平移位）匹配 volley 箭/直生箭的
// 绘制调用,取贴图尺寸+矩阵,算箭头屏幕指向
// 运行:SW_ORIGIN=http://localhost:5216 node tools/run-diag.mjs scripts/_phantasm-ctm-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[probe]')) console.log(t); });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5216', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
});
await new Promise((r) => setTimeout(r, 700));

const info = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const py = Math.floor(g.world.groundLevel) - 60;
  for (let dx = -90; dx <= 130; dx++) for (let dy = -40; dy <= 2; dy++) {
    st.setTile(px0 + dx, py + dy, 0);
    st.liquid[st.idx(px0 + dx, py + dy)] = 0;
  }
  for (let dx = -90; dx <= 130; dx++) st.setTile(px0 + dx, py + 3, 2);
  g.player.x = px0 * 16; g.player.y = (py - 3) * 16;
  try { g.entities.enemies.length = 0; } catch { /* ignore */ }

  const findKey = (vid) => Object.keys(window.__swItems).find((k) => new RegExp(`^vi_${vid}_`).test(k)) ?? null;
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const ammoDefIdxByAmmoId = (ammoId) => {
    let byVid = -1;
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const d = ITEM_DEFS[i];
      const vid = d?.vid ?? (d?.key ? Number(String(d.key).match(/^vi_(\d+)_/)?.[1] ?? -1) : -1);
      if ((d?.ammoId ?? -1) === ammoId) return i;
      if (byVid < 0 && vid === ammoId) byVid = i;
    }
    return byVid;
  };
  const wid = window.__swItems[findKey(3540)];
  const aid = ammoDefIdxByAmmoId(40);
  for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
  g.player.inv.slots[0] = { id: wid, stack: 1 };
  g.player.inv.slots[54] = { id: aid, stack: 999 };
  g.player.inv.selected = 0;
  g.player.useTime = 0;
  g.entities.projectiles.length = 0;
  g.cb.onInventoryChanged();
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);

  g.input.mouseX = 640 + 240; g.input.mouseY = 400 - 240;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  let volleySeen = -1;
  for (let t = 0; t < 60; t++) {
    g.fixedUpdate(1 / 60);
    if (g.entities.projectiles.some((q) => q.projId !== 630 && !q.dead)) { volleySeen = t; break; }
  }
  for (let t = 0; t < 2 && volleySeen >= 0; t++) g.fixedUpdate(1 / 60);
  const vol = g.entities.projectiles.find((q) => q.projId === 1 && !q.dead);
  g.entities.projectiles.length = 0;
  g.entities.projectiles.push(vol);
  const dir = new Arrow(vol.cx, vol.cy, 12, -12, 30, 2, 1, null, {});
  dir.frostEligible = true;
  g.entities.projectiles.push(dir);
  vol.x = g.player.cx - 60; vol.y = g.player.cy - 160; vol.vx = 12; vol.vy = -12; vol.ph630Ctl = undefined;
  dir.x = g.player.cx + 60; dir.y = g.player.cy - 160; dir.vx = 12; dir.vy = -12;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy - 100;
  await new Promise((r) => setTimeout(r, 800));   // 贴图就绪
  const [volSx, volSy] = g.camera.worldToScreen(vol.cx, vol.cy);
  const [dirSx, dirSy] = g.camera.worldToScreen(dir.cx, dir.cy);
  if (new URLSearchParams(location.search).get('freeze') === '1') { g.paused = true; await new Promise((r) => setTimeout(r, 400)); }

  // 拦截 drawImage:记录全部调用（按屏幕平移位就近匹配两箭）
  window.__ctmLog = [];
  const proto = CanvasRenderingContext2D.prototype;
  if (!proto.__ctmPatched) {
    proto.__ctmPatched = true;
    proto.__optDrawImage2 = proto.drawImage;
    proto.drawImage = function (...a) {
      try {
        const img = a[0];
        const iw = img?.width ?? 0, ih = img?.height ?? 0;
        if (iw > 0) {
          const m = this.getTransform();
          const ex = m.e, ey = m.f;
          window.__ctmLog.push({
            ex: +ex.toFixed(1), ey: +ey.toFixed(1),
            mat: [m.a, m.b, m.c, m.d].map((v) => +v.toFixed(3)),
            iw, ih, argc: a.length,
            srcTag: (() => { try { return String(img.src ?? '').split('/').pop() ?? `bm${iw}x${ih}`; } catch { return `bm${iw}x${ih}`; } })(),
            dst: a.length > 5 ? [a[4], a[5]] : null,
          });
        }
      } catch (e) { /* ignore */ }
      return proto.__optDrawImage2.apply(this, a);
    };
  }
  await new Promise((r) => setTimeout(r, 120));
  const log = window.__ctmLog.splice(0, window.__ctmLog.length);
  const near = (x, y) => log.filter((L) => Math.abs(L.ex - x) < 30 && Math.abs(L.ey - y) < 30);
  const headDir = (L) => {
    // 头部局部点 (0,-ih/2)（dst 参数为 (-iw/2,-ih/2) 起画,头在 (0,-16) 局部）
    const lx = 0, ly = -L.ih / 2;
    const wx = L.mat[0] * lx + L.mat[2] * ly;
    const wy = L.mat[1] * lx + L.mat[3] * ly;
    return [+wx.toFixed(2), +wy.toFixed(2)];
  };
  return {
    volleySeen,
    expected: { vol: [Math.round(volSx), Math.round(volSy)], dir: [Math.round(dirSx), Math.round(dirSy)] },
    volDraws: near(volSx, volSy).map((L) => ({ ...L, head: headDir(L) })).slice(0, 4),
    dirDraws: near(dirSx, dirSy).map((L) => ({ ...L, head: headDir(L) })).slice(0, 4),
    totalDraws: log.length,
  };
});
console.log(JSON.stringify(info, null, 1));
await new Promise((r) => setTimeout(r, 200));
await page.screenshot({ path: './shots/phantasm-ctm.png' });
console.log('页面异常:', errors.slice(0, 3));
await browser.close();
