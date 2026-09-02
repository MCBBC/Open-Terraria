// 火箭三型(140)出生锚实测:盒中心定案(v8)复验——出生(x,y) vs player 盒中心,
// 及 93 拍轨迹采样(用户截图 fuse:3507=已飞 93t 弹停在头顶 160px 的矛盾取证)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 300)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  const st = g.world.store;
  // 清空玩家上方与周围障碍(排除卡装饰物)
  const DIRT = window.__swTileByKey('v_2_dirt') ?? 1;
  const ptx = Math.floor(pl.cx / 16), pty = Math.floor((pl.y + pl.h) / 16);
  for (let x = ptx - 20; x <= ptx + 20; x++) {
    for (let y = pty - 40; y < pty; y++) st.setTile(x, y, 0);
    st.setTile(x, pty, DIRT);
  }
  // 装火箭发射器 759 + 火箭 III 弹药 773
  let gun = -1, ammo = -1;
  const m = await import('/src/data/items.ts');
  const ic = await import('/src/data/vanillaItemCombat.ts');
  const vidOf = (d) => d?.vid ?? (d?.key ? Number(String(d.key).match(/^vi_(\d+)_/)?.[1] ?? -1) : -1);
  for (let i = 0; i < m.ITEM_DEFS.length; i++) {
    const d = m.ITEM_DEFS[i]; const vid = vidOf(d);
    if (vid === 773) { ammo = i; }
    if (vid === 759 && ic.itemCombat(759)?.useAmmo === 771) { gun = i; }
  }
  if (gun < 0 || ammo < 0) return { err: 'items not found', gun, ammo };
  pl.inv.slots[pl.inv.selected] = { id: gun, stack: 1 };
  pl.inv.slots[54] = { id: ammo, stack: 99 };
  g.cb.onInventoryChanged();
  pl.vx = 0; pl.vy = 0;
  await new Promise((r) => setTimeout(r, 600));
  // 瞄准玩家正上方(屏幕坐标:玩家上方 300px)
  const [sx, sy] = g.camera.worldToScreen(pl.cx, pl.cy - 300);
  g.input.mouseX = sx; g.input.mouseY = sy;
  const cx0 = pl.cx, cy0 = pl.cy;   // 盒中心基准(发射前)
  // 开火一帧
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 80));
  g.input.mouseDown = false;
  const snap = () => {
    const r = (g.entities.projectiles || []).find((p) => p.projId === 140 && !p.dead);
    return r ? { x: r.x, y: r.y, cx: r.cx, cy: r.cy, vx: r.vx, vy: r.vy, fuse: r.fuse } : null;
  };
  const first = snap();
  const birth = first ? { dx: first.cx - cx0, dy: first.cy - cy0, ...first } : { err: 'no rocket after 80ms' };
  // 轨迹采样 ~93 拍
  const track = [];
  for (let t = 0; t < 94; t++) {
    await new Promise((r) => setTimeout(r, 16));
    const s = snap();
    track.push(s ? { t, cx: Math.round(s.cx), cy: Math.round(s.cy), vx: +s.vx.toFixed(2), vy: +s.vy.toFixed(2), fuse: s.fuse } : { t, gone: true });
  }
  return {
    playerCenter: { cx: cx0, cy: cy0 }, playerBox: { x: pl.x, y: pl.y, w: pl.w, h: pl.h },
    birth,
    trackHead: track.slice(0, 6), trackTail: track.slice(-8),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
