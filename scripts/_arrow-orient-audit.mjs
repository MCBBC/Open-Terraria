// 全弹药箭姿态审计:遍历所有箭类弹药(ammo 40)的 volley 解析 pid,各自在网格上
// 生成一发向上右飞的箭,冻结截帧,输出 pid→网格坐标映射供逐格检查镜像
// 运行:SW_ORIGIN=http://localhost:5216 node tools/run-diag.mjs scripts/_arrow-orient-audit.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 600000 });
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

  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const { resolveAmmoProjId, itemCombat, viIdFromKey } = await import('/src/data/vanillaItemCombat.ts');
  // 收集所有箭类弹药（ammoId 40 或 vid 40 族）并解析 volley pid（3540 链）
  const arrowDefs = [];
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
    if (!d) continue;
    const vid = d.vid ?? viIdFromKey(d.key);
    if (vid < 0) continue;
    const c = itemCombat(vid);
    const ammoId = d.ammoId ?? c?.ammo ?? 0;
    if (ammoId === 40) arrowDefs.push({ vid, key: d.key, shoot: c?.shoot ?? 0 });
  }
  // 去重按 pid
  const byPid = new Map();
  for (const a of arrowDefs) {
    const pid = resolveAmmoProjId(3540, a.vid, 40, 630, a.shoot || undefined);
    if (!byPid.has(pid)) byPid.set(pid, a.vid);
  }
  // 网格生成（12×N,间距 90px,全部向上右 (12,-12)）
  const grid = [];
  const pids = [...byPid.keys()].sort((a, b) => a - b);
  const cols = 12;
  const baseX = g.player.cx - (cols - 1) * 45, baseY = g.player.cy - 420;
  for (let i = 0; i < pids.length; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const a = new Arrow(baseX + col * 90, baseY + row * 90, 12, -12, 30, 2, pids[i], null, {});
    a.frostEligible = true;
    g.entities.add(a, 'projectiles');
    grid.push({ pid: pids[i], ammoVid: byPid.get(pids[i]), col, row });
  }
  // 等贴图加载;冻结后把箭网格 teleport 到当前相机中心四周（相机漂移不参与）
  await new Promise((r) => setTimeout(r, 1500));
  g.paused = true;
  const ccx = g.camera.x, ccy = g.camera.y;
  for (let i = 0; i < pids.length; i++) {
    const gd = grid[i];
    const e = g.entities.projectiles.find((q) => q.projId === gd.pid && !q.dead);
    if (!e) continue;
    e.x = ccx + gd.col * 90 - (cols - 1) * 45;
    e.y = ccy + gd.row * 90 - 60;
    e.vx = 12; e.vy = -12;
  }
  await new Promise((r) => setTimeout(r, 300));
  const cells = grid.map((gd) => {
    const e = g.entities.projectiles.find((q) => q.projId === gd.pid && q.age >= 0 && !q.dead);
    const [sx, sy] = e ? g.camera.worldToScreen(e.cx, e.cy) : [-1, -1];
    return { ...gd, sx: Math.round(sx), sy: Math.round(sy), dead: !e };
  });
  window.__grid = cells;
  return { count: pids.length, pids, cells, camZoom: g.camera.zoom };
});
console.log(JSON.stringify(info, null, 1));
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: './shots/arrow-orient-grid.png' });
console.log('页面异常:', errors.slice(0, 3));
await browser.close();
