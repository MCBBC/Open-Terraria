// ★BJ647-B v16：旗数据直读——vmisc 可用性/houseBannerGeom 手算/旗布屏位。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = '/Users/vinlic/Downloads/十周年纪念种子(2).wld';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: { width: 1512, height: 862, deviceScaleFactor: 1 }, args: ['--window-size=1530,960', '--window-position=30,30'] });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&beh=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 90; i++) { if (await page.evaluate(() => !!(window.__swGame?.renderer)).catch(() => false)) break; await new Promise((r) => setTimeout(r, 2000)); }
await new Promise((r) => setTimeout(r, 1500));
const b64 = readFileSync(WLD).toString('base64');
await page.evaluate(async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await window.__swFlow.importWld(u8);
}, b64);
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => {
    const g = window.__swGame;
    return !!(g?.world?.store?.type?.length > 1000000 && g.world.name === '十周年纪念种子' && g.entities?.npcs?.some((n) => n.npcKey === 'witch_doctor'));
  }).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
const info = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const cloth = r.atlas ? r.atlas.vmisc('vanilla-ui/UI_House_Banner.png') : null;
  const st = g.world.store;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  // 手算 findBannerAnchorY：从 home.y-1 向上找第一实心/平台（tileSolidLike）
  const home = n.home;
  let cy = null, scan = [];
  if (home) {
    for (let y = home.y - 1; y > home.y - 30 && y > 0; y--) {
      const i = st.idx(home.x, y);
      const t = st.type[i];
      const solid = st.isSolid(home.x, y);
      const plat = st.isPlatform(home.x, y);
      scan.push({ y, t, solid, plat });
      if (solid || plat) { cy = y; break; }
    }
  }
  const cam = g.camera, z = cam.zoom ?? 1;
  const cw = g.renderer.canvas.clientWidth ?? 1512, ch = g.renderer.canvas.clientHeight ?? 862;
  return {
    cloth: cloth ? { sw: cloth.sw, sh: cloth.sh, loaded: true } : null,
    home, cy, scanTop: scan.slice(0, 8),
    bannerScreen: cy != null ? { sx: Math.round((home.x * 16 + 8 - cam.x) * z + cw / 2), sy: Math.round((cy * 16 + 21 - cam.y) * z + ch / 2) } : null,
    npcScreen: { sx: Math.round((n.cx - cam.x) * z + cw / 2), sy: Math.round((n.cy - cam.y) * z + ch / 2) },
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
