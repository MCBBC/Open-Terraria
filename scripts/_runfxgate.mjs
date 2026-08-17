// 跑尘结构门验证：裸装跑=0尘0声；赫尔墨斯=尘16>0。修复回归（2026-08-17）。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const proto = Object.getPrototypeOf(p);
  const origSfrp = proto.spawnFastRunParticles;
  let fireCount = 0;
  proto.spawnFastRunParticles = function (game, maxRun, accRun) {
    const r = origSfrp.call(this, game, maxRun, accRun);
    if (r === undefined && Math.abs(this.vx) > (accRun + maxRun) / 2) fireCount++;
    return r;
  };
  const sounds = [];
  const origPlay = g.playSfxFiles;
  if (origPlay) g.playSfxFiles = (files, ...a) => { if (files?.includes('Item_17')) sounds.push(1); return origPlay(files, ...a); };
  const mkRunway = async () => {
    const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16) + 6;
    const under = st.type[st.idx(bx, by + 2)];
    for (let dx = -120; dx <= 120; dx++) for (let dy = -14; dy <= 2; dy++)
      st.setTile(bx + dx, by + dy, dy === 2 ? under : 0);
    await new Promise(r => setTimeout(r, 300));
    p.x = bx * 16 + 8; p.y = (by + 2) * 16 - p.h; p.vx = 0; p.vy = 0; p.onGround = false;
    await new Promise(r => setTimeout(r, 300));
    return by;
  };
  const runFor = async (ms) => {
    const before = g.vanillaDust.pool.filter(d => d.active && d.type === 16).length;
    g.input.touchKeys.add('KeyD');
    await new Promise(r => setTimeout(r, ms));
    g.input.touchKeys.delete('KeyD');
    await new Promise(r => setTimeout(r, 150));
    const spawned = g.vanillaDust.pool.filter(d => d.type === 16).length; // 全史（含已失活）
    const vxMax = +p.vx.toFixed(2);
    return { spawned, before, vxMax };
  };
  const res = {};
  // ① 裸装
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  await mkRunway();
  res.barefoot = await runFor(3000);
  res.barefoot.sounds = sounds.length;
  // ② 赫尔墨斯（armor[3] 功能配饰槽，g.itemId 助手）
  const hermesId = g.itemId('vi_54_hermes_boots');
  sounds.length = 0;
  p.inv.armor[3] = hermesId >= 0 ? { id: hermesId, stack: 1 } : null;
  await new Promise(r => setTimeout(r, 500));
  await mkRunway();
  res.hermes = await runFor(6000);
  res.hermes.sounds = sounds.length;
  res.fireCount = fireCount;
  res.poolLen = g.vanillaDust.pool.length;
  if (origPlay) g.playSfxFiles = origPlay;
  proto.spawnFastRunParticles = origSfrp;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
