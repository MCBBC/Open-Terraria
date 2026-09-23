// ★BJ303 修复后全路径验证：反重力钩发射→挂墙→锚定态持续步进（lineLight 逐 tick 发光
// + 446 牵引支）→ 不崩；对照组普通钩挂墙回归。
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));

await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
await page.click('[data-act=sp]');
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => { void window.__swFlow.newWorld('0522', 4200, 1200); });
for (let i = 0; i < 400; i++) {
  const ok = await page.evaluate(() => !!(window.__swGame?.player && window.__swGame?.world && window.__swTiles));
  if (ok) break;
  await new Promise((r) => setTimeout(r, 300));
}

const run = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  const TK = window.__swTiles;
  const IK = window.__swItems;
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
  for (let dx = -30; dx <= 30; dx++) for (let dy = -14; dy <= 8; dy++) st.setTile(bx + dx, by + dy, 0);
  await wait(120);
  for (let dx = -30; dx <= 30; dx++) {
    st.setTile(bx + dx, by + 6, TK['dirt']);
    st.setTile(bx + dx, by - 8, TK['dirt']);
    st.setTile(bx + dx, by - 9, TK['dirt']);
  }
  await wait(120);
  p.x = bx * 16; p.y = (by - 1) * 16; p.vx = 0; p.vy = 0;
  const agKey = Object.keys(IK).find((k) => /^vi_2800_/.test(k));
  p.inv.miscEquips[4] = { id: IK[agKey], stack: 1 };
  await wait(100);
  const errBefore = (window.__swErrors ?? []).length;
  const out = { phases: [] };
  // A：反重力钩挂天花板 + 锚定态 400 帧带输入步进（446 牵引支 + 沿线光逐 tick）
  g.useEquippedGrapple(0, -1);
  for (let i = 0; i < 240; i++) {
    await wait(16);
    if (p.grappleProjs.some((gr) => gr.ai0 === 2)) break;
  }
  const latched = p.grappleProjs.find((gr) => gr.ai0 === 2);
  out.phases.push({ name: 'ag-latch', latched: !!latched, latchX: latched?.latchX, latchY: latched?.latchY });
  // 锚定态带输入走 400 帧（模拟用户挂墙反重力游走；持续触发光照路径）
  p.inputX = 1;
  for (let i = 0; i < 400; i++) { await wait(16); if (!g.running) break; }
  p.inputX = 0;
  out.phases.push({
    name: 'ag-anchored-400f', running: g.running, px: Math.round(p.x), py: Math.round(p.y),
    hooks: p.grappleProjs.map((x) => ({ ai0: x.ai0, lai0: x.lai0 })),
  });
  out.newErrors = (window.__swErrors ?? []).slice(errBefore).map((e) => String(e.msg ?? '').slice(0, 200));
  // B：普通钩 84 对照（挂墙回归）
  g.fireGrapple(84, 0, -1);
  for (let i = 0; i < 240; i++) {
    await wait(16);
    if (p.grappleProjs.some((gr) => gr.projType === 13 && gr.ai0 === 2)) break;
  }
  out.phases.push({
    name: 'normal-hook-latch', running: g.running,
    latched: p.grappleProjs.some((gr) => gr.projType === 13 && gr.ai0 === 2),
  });
  out.newErrors2 = (window.__swErrors ?? []).slice(errBefore).map((e) => String(e.msg ?? '').slice(0, 200));
  return out;
});
console.log(JSON.stringify(run, null, 2));
await browser.close();
