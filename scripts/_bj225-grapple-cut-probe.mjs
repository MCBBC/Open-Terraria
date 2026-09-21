// ★BJ225 wiki 技巧实机探针：钩爪挂天花板 + 连放彩罐 → 钩爪割面立即打碎？
// 场景（wiki 原话）：「钩抓在天花板上然后只要放置它们即可。钩爪可以在玩家放置彩罐后
// 立即将其打碎。」三组对照：
//   A. 锚格正下方放置（钩盒内,期望=立即碎）
//   B. 锚格右 1 列（盒内边界,期望=立即碎）
//   C. 距锚 3 列（盒外,期望=不碎=原版 3×3 扫描界一致）
// 全程无武器挥击——彩罐若碎,唯一来源=钩爪 CutTiles 面。
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));

await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
await page.click('[data-act=sp]');
await new Promise((r) => setTimeout(r, 800));

// 直接造小世界（4200x1200）
await page.evaluate(() => { void window.__swFlow.newWorld('0522', 4200, 1200); });
for (let i = 0; i < 400; i++) {
  const ok = await page.evaluate(() => !!(window.__swGame?.player && window.__swGame?.world && window.__swTiles));
  if (ok) break;
  await new Promise((r) => setTimeout(r, 300));
}

const setup = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  const TK = window.__swTiles;
  const IK = window.__swItems;
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
  for (let dx = -30; dx <= 30; dx++) for (let dy = -14; dy <= 8; dy++) st.setTile(bx + dx, by + dy, 0);
  await wait(150);
  for (let dx = -30; dx <= 30; dx++) {
    st.setTile(bx + dx, by + 6, 1);
    st.setTile(bx + dx, by - 8, 1);
    st.setTile(bx + dx, by - 9, 1);
  }
  await wait(150);
  p.x = bx * 16; p.y = (by - 1) * 16; p.vx = 0; p.vy = 0;
  const hookKey = Object.keys(IK).find((k) => /^vi_84_/.test(k));
  const pgIid = IK['vi_3746_Pigronata'];
  if (!pgIid || !hookKey) return { fail: 'items', hookKey, hasPg: !!pgIid };
  p.inv.slots.fill(null);
  p.inv.slots[0] = { id: IK[hookKey], stack: 1 };
  p.inv.slots[1] = { id: pgIid, stack: 99 };
  p.inv.selected = 0;
  await wait(100);
  return {
    ok: true, bx, by, ceilingY: by - 8, hookKey,
    pigTileKey: (window.__swITEM_DEFS[pgIid] || {}).tile,
    pgTileId: TK[(window.__swITEM_DEFS[pgIid] || {}).tile ?? ''],
    ceilSolid: st.isSolid(bx, by - 8),
  };
});
console.log('[setup]', JSON.stringify(setup));
if (!setup.ok) { await browser.close(); process.exit(1); }

// 发射钩爪（真实 fireGrapple 入口,竖直向上 → 挂天花板）
const fire = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  g.fireGrapple(84, 0, -1);
  for (let i = 0; i < 240; i++) {
    await wait(16);
    const latched = g.player.grappleProjs.find((gr) => gr.ai0 === 2);
    if (latched) {
      return { latched: true, latchX: latched.latchX, latchY: latched.latchY, cx: latched.cx, cy: latched.cy, w: latched.projW, h: latched.projH };
    }
  }
  return { latched: false, n: g.player.grappleProjs.length };
});
console.log('[fire]', JSON.stringify(fire));
if (!fire.latched) { await browser.close(); process.exit(1); }

// 三组对照放置（真实 tryPlace + 真实实体轮钩爪割面;无任何武器参与）
const result = await page.evaluate(async (fireInfo) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  const st = g.world.store;
  const IK = window.__swItems;
  const pgIid = IK['vi_3746_Pigronata'];
  const def = window.__swITEM_DEFS[pgIid];
  const pgId = window.__swTiles[def.tile];
  const Lx = fireInfo.latchX, Ly = fireInfo.latchY;
  const countCells = (ax, ay) => {
    let n = 0;
    for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 3; dy++) {
      if (st.get(ax + dx, ay + dy) === pgId) n++;
    }
    return n;
  };
  const stillLatched0 = g.player.grappleProjs.some((gr) => gr.ai0 === 2);
  const trials = [
    { name: 'A-under-hook(盒内)', clickX: Lx + 1, clickY: Ly + 1, expect: 'broken' },
    { name: 'B-right1(盒内边界)', clickX: Lx + 2, clickY: Ly + 1, expect: 'broken' },
    { name: 'C-far3(盒外)', clickX: Lx + 4, clickY: Ly + 1, expect: 'intact' },
  ];
  const cases = [];
  for (const t of trials) {
    const ax = t.clickX - 2, ay = t.clickY;
    // 逐门诊断（放置前）
    const diag = {
      inRange: g.inTileRange(t.clickX, t.clickY, g.blockRange()),
      blockRange: g.blockRange(),
      anchorSolid: st.isSolid(ax + 1, ay - 1),
      cellsEmpty: (() => { for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 3; dy++) if (st.get(ax + dx, ay + dy) !== 0) return false; return true; })(),
      repGateTopRow: (() => { for (let dx = 0; dx < 4; dx++) if (st.get(ax + dx, ay) === pgId) return true; return false; })(),
      playerCx: Math.round(g.player.cx), playerCy: Math.round(g.player.cy),
      clickPx: [t.clickX * 16 + 8, t.clickY * 16 + 8],
    };
    const placed = (() => { g.player.useTime = 0; g.tryPlace(t.clickX, t.clickY, def); return countCells(ax, ay); })();
    cases.push({ name: t.name, ax, ay, diag, placed });
    // 采样 20 tick:记录逐拍残存格数
    const samples = [];
    for (let k = 0; k < 20; k++) { await wait(16); samples.push(countCells(ax, ay)); }
    const broken = placed === 12 && samples[19] < 12;
    cases[cases.length - 1].final = samples[19];
    cases[cases.length - 1].samples = samples.slice(0, 6);
    cases[cases.length - 1].expect = t.expect;
    cases[cases.length - 1].verdict = broken === (t.expect === 'broken') ? 'MATCH' : 'MISMATCH';
    for (let dx = -2; dx <= 6; dx++) for (let dy = -2; dy <= 4; dy++) {
      if (st.get(ax + dx, ay + dy) === pgId) st.setTile(ax + dx, ay + dy, 0);
    }
    await wait(30);
  }
  return { stillLatched0, hookBox: { Lx, Ly }, cases };
}, fire);
console.log('[result]', JSON.stringify(result, null, 1));

// —— 真实输入链路 + 连续打碎（wiki 原义:挂天花连放;puppeteer 可信鼠标事件）——
const chainPrep = await page.evaluate(async (fireInfo) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  const Lx = fireInfo.latchX, Ly = fireInfo.latchY;
  for (let i = 0; i < 200; i++) { await wait(16); if (Math.abs(g.player.cy - (Ly + 3) * 16) < 64) break; }
  g.player.inv.selected = 1;   // 持彩罐
  await wait(200);
  const ax = Lx, ay = Ly + 1;                      // 件左格=Lx(盒内);点击格=Origin=(Lx+2, Ly+1)
  const clickWx = (ax + 2) * 16 + 8, clickWy = ay * 16 + 8;
  const [sx, sy] = g.camera.worldToScreen(clickWx, clickWy);
  return { ax, ay, sx: Math.round(sx), sy: Math.round(sy) };
}, fire);
console.log('[chainPrep]', JSON.stringify(chainPrep));

const chain = { rounds: [] };
for (let k = 0; k < 5; k++) {
  await page.mouse.move(chainPrep.sx, chainPrep.sy);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 120));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 300));
  const s = await page.evaluate((prep) => {
    const g = window.__swGame;
    const st = g.world.store;
    const pgId = window.__swTiles[window.__swITEM_DEFS[window.__swItems['vi_3746_Pigronata']].tile];
    let cells = 0;
    for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 3; dy++) {
      if (st.get(prep.ax + dx, prep.ay + dy) === pgId) cells++;
    }
    const placedTotal = (() => { let n = 0; for (let x = prep.ax - 6; x <= prep.ax + 8; x++) for (let y = prep.ay - 2; y <= prep.ay + 4; y++) if (st.get(x, y) === pgId) n++; return n; })();
    return { cells, placedTotal, stackLeft: g.player.inv.slots[1]?.stack ?? -1, stillLatched: g.player.grappleProjs.some((gr) => gr.ai0 === 2) };
  }, chainPrep);
  chain.rounds.push({ k, ...s });
}
console.log('[chain]', JSON.stringify(chain, null, 1));

// 收尾截图（锚点区）
await page.screenshot({ path: '/tmp/bj225-probe-final.png' });
console.log('[pageerrors]', errs.length ? errs.slice(0, 3) : 'none');
await browser.close();
