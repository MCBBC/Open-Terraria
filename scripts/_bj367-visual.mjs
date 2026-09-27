// ★BJ367 视觉留档——当前构建 404 飞行渲染截图(GPU 模式)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE_ERROR', String(e.message).slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const s = document.querySelector('select'); s.selectedIndex = 0; s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });
const info = await page.evaluate(async (MODE) => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  const { options } = await import('/src/core/Options.ts');
  options.set('renderMode', MODE);
  await new Promise((r) => setTimeout(r, 600));
  await g.newWorld('bj367v', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) { if (g.world && g.world.store && g.world.store.w === 4200) break; await new Promise((r) => setTimeout(r, 200)); }
  g.running = false;
  const p = g.player;
  const st = g.world.store;
  const c0 = Math.trunc(p.x / 16);
  let groundY = -1;
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  p.x = c0 * 16; p.y = groundY * 16 - p.h; p.vx = 0; p.vy = 0;
  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  p.inv.slots[0] = { id: items[key2611], stack: 1 };
  p.inv.selected = 0;
  const { projSprite } = await import('/src/entities/Arrow.ts');
  projSprite(404); projSprite(405);
  const { chainWarm } = {}; void chainWarm;
  fetch('sprites/vanilla/Chain37.png').catch(() => {});
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 300)); if (projSprite(404) && projSprite(405)) break; }
  const { FlaironHeadProj, FlaironSpike, flaironSpawnNudge } = await import('/src/entities/WeaponProj.ts');
  const dirx = p.cx + 150, diry = p.cy - 330;
  const sp = flaironSpawnNudge(-1, p.cx, p.cy, dirx, diry);
  const ddx = dirx - sp.x, ddy = diry - sp.y, dl = Math.hypot(ddx, ddy) || 1;
  const head = new FlaironHeadProj(sp.x, sp.y, ddx / dl * 14, ddy / dl * 14, 30, 4.5);
  head.x = sp.x - head.w / 2; head.y = sp.y - head.h / 2;
  head.pinUse = () => {};
  head.spawnProj = (sx, sy, svx, svy, sProj, sDmg, sKb) => {
    if (sProj !== 405) return;
    g.entities.add(new FlaironSpike(sx - 7, sy - 7, svx, svy, Math.max(1, Math.round(sDmg)), sKb), 'projectiles');
  };
  g.entities.add(head, 'projectiles');
  await new Promise((r) => setTimeout(r, 2500));   // 真墙钟等待:Chain37/405 贴图落地
  for (let t = 0; t < 60; t++) { g.paused = false; g.frame(performance.now()); if (t === 30) { const [sx, sy] = g.camera.worldToScreen(head.x, head.y); window.__bj367shot = { sx: Math.round(sx), sy: Math.round(sy) }; } }
  window.__bj367headState = { cx: Math.round(head.cx), cy: Math.round(head.cy), alpha: head.alphaView, dead: head.dead };
  const [sx, sy] = g.camera.worldToScreen(head.x, head.y);
  return { head: { sx: Math.round(sx), sy: Math.round(sy), cx: Math.round(head.cx), cy: Math.round(head.cy), alpha: head.alphaView, dead: head.dead }, mode: MODE };
}, process.env.SW_BJ367_MODE ?? 'gpu');
console.log('VIS=' + JSON.stringify(info));
await page.screenshot({ path: `/tmp/bj367-visual-${process.env.SW_BJ367_MODE ?? 'gpu'}.png` });
await browser.close();
