// 一次性（_ 前缀经 tools/run-diag.mjs 跑）：法杖魔法弹出生锚点+弹体效果审计探针。
// 用户实报（2026-08-26）：太阳花/宝石族弹出生位与效果不对——本探针对蓝晶杖(741→123
// SwirlTwins 孪生+拖尾)与日耀花杖(6152→1114)按住开火，抓出生位偏差、孪生对数、
// lightRGB 接线与飞行帧截图。仿 scripts/_gf-charge-shot.mjs（__swItems 反查+interval 按住）。
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/bolt-audit-probe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

async function auditItem(itemKey, projId, tag) {
  await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
  await sleep(800);
  // 清场并装备
  await p.evaluate((ik) => {
    const g = window.__swGame;
    const idx = window.__swItems[ik];
    if (!idx) throw new Error('missing item key ' + ik);
    g.player.inv.slots[0] = { id: idx, stack: 1 };
    g.player.inv.selected = 0;
    g.player.mana = 500; g.player.baseMaxMana = 500;
    // 平地开阔处（若已生成世界）：把玩家提到出生点，清弹幕桶
    for (const bucket of ['projectiles']) {
      const list = g.entities?.[bucket];
      if (Array.isArray(list)) list.length = 0;
      else if (list && typeof list.clear === 'function') list.clear();
    }
    const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
    g.input.mouseX = sx - 240;   // 左侧水平瞄准（与弹道同高）
    g.input.mouseY = sy;
    g.__pin && clearInterval(g.__pin);
    g.__pin = setInterval(() => { g.input.mouseDown = true; g.input.mouseHeld = true; }, 40);
  }, itemKey);
  // 每 ~24ms 采样新弹相对玩家中心的出生偏移 + 现存弹统计
  const samples = [];
  let shotFrames = 0;
  for (let i = 0; i < 70; i++) {
    await sleep(24);
    const s = await p.evaluate((pid) => {
      const g = window.__swGame;
      const arr = (g.entities?.all?.() ?? []).filter((e) => e && e.projId === pid);
      const pl = g.player;
      const nowS = performance.now() / 1000;
      return {
        n: arr.length,
        phases: arr.map((e) => e.gemPhase ?? null),
        offsets: arr.map((e) => [Math.round(e.cx - pl.cx), Math.round(e.cy - pl.cy)]),
        lights: arr.map((e) => e.lightRGB ?? null),
        ages: arr.map((e) => Math.round(e.age ?? -1)),
        vel: arr.slice(0, 2).map((e) => [Math.round(e.vx * 10) / 10, Math.round(e.vy * 10) / 10]),
        gt: Math.round(nowS * 100) / 100,
      };
    }, projId);
    samples.push(s);
  }
  await p.screenshot({ path: `${OUT}/${tag}-flight1.png`, clip: await shotCrop(p) });
  await sleep(120);
  await p.screenshot({ path: `${OUT}/${tag}-flight2.png`, clip: await shotCrop(p) });
  await sleep(60);
  await p.screenshot({ path: `${OUT}/${tag}-flight3.png`, clip: await shotCrop(p) });
  shotFrames++;
  await p.evaluate(() => window.__swGame && clearInterval(window.__swGame.__pin));
  // 出生偏移统计：取每个“新出现最小 age”的样本中最小 |offset|
  const minOffset = samples
    .flatMap((s) => s.offsets)
    .sort((a, b) => (Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1])))[0] ?? null;
  const maxTwins = Math.max(...samples.map((s) => s.n));
  console.log(`[${tag}] proj=${projId} maxInFlight=${maxTwins} closestSpawnRelCenter(min|dx|,dy)=${JSON.stringify(minOffset)}`);
  const withLights = samples.find((s) => s.lights.length > 0);
  console.log(`[${tag}] phasesSeen=${JSON.stringify([...new Set(samples.flatMap((s) => s.phases))])} lightSample=${JSON.stringify(withLights ? withLights.lights[0] : null)}`);
}

async function shotCrop(p) {
  return p.evaluate(() => {
    const g = window.__swGame;
    const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
    return { x: Math.max(0, Math.round(sx - 260)), y: Math.max(0, Math.round(sy - 140)), width: 520, height: 280 };
  });
}

fs.mkdirSync(OUT, { recursive: true });
await auditItem('vi_741_SapphireStaff', 123, 'sapphire');
await auditItem('vi_6152_DaybloomStaff', 1114, 'daybloom');
console.log('DONE → ' + OUT + '/*.png');
await b.close();
