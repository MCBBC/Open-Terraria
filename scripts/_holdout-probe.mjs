// 一次性:城镇 NPC 持械取证——向导(22,弓+Extra_52)与旅商(368,左轮+Extra_53)
// 钉攻击态 12/攻帧 22/aim 三档截图,验证 num12 修复+手部 overlay 贴合
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(2000);

// 找向导/旅商;旅商不在则用现有 TownNPC 的 constructor 现场生成一个
const found = await p.evaluate(() => {
  const g = window.__swGame;
  const npcs = g.entities?.all?.() ?? g.npcs ?? [];
  const list = (Array.isArray(npcs) ? npcs : [...npcs]).filter((e) => e && e.vanillaId !== undefined);
  const guide = list.find((e) => e.vanillaId === 22);
  let merch = list.find((e) => e.vanillaId === 368);
  let spawned = false;
  if (!merch && guide) {
    try {
      const ctor = guide.constructor;
      merch = new ctor('travelling_merchant', g.player.x + 120, g.player.y - 40);
      g.entities.add(merch, 'npcs');
      spawned = true;
    } catch (e) { /* 生成失败则只拍向导 */ }
  }
  return {
    npcIds: list.map((e) => e.vanillaId).slice(0, 10),
    hasGuide: !!guide, hasMerch: !!merch, spawned
  };
});
console.log('FOUND:', JSON.stringify(found));

// 钉攻击态截图(向导必在;旅商若在也拍)
for (const vid of [22, 368]) {
  const ok = await p.evaluate((vid) => {
    const g = window.__swGame;
    const npcs = g.entities?.all?.() ?? g.npcs ?? [];
    const list = (Array.isArray(npcs) ? npcs : [...npcs]).filter((e) => e && e.vanillaId === vid);
    const n = list[0];
    if (!n) return false;
    n.x = g.player.x + 60;
    n.y = g.player.y - 10;
    n.vx = 0; n.vy = 0;
    // attackState/holdoutAim 是只读 getter——patch 原型 update 后置强制
    let proto = Object.getPrototypeOf(n);
    while (proto && typeof proto.update !== 'function') proto = Object.getPrototypeOf(proto);
    if (proto && !proto.__swOrigUpdate) {
      proto.__swOrigUpdate = proto.update;
      proto.update = function (...a) {
        const r = proto.__swOrigUpdate.apply(this, a);
        this.atkState = 12;
        this.holdAim = -0.3;
        this.frame = 22;
        return r;
      };
    }
    return true;
  }, vid);
  if (!ok) { console.log(`vid ${vid}: 不在场,跳过`); continue; }
  await sleep(900);
  const crop = await p.evaluate((vid) => {
    const g = window.__swGame;
    const npcs = g.entities?.all?.() ?? g.npcs ?? [];
    const list = (Array.isArray(npcs) ? npcs : [...npcs]).filter((e) => e && e.vanillaId === vid);
    const n = list[0];
    const cam = g.camera;
    const [sx, sy] = cam.worldToScreen(n.cx, n.cy);
    return { x: Math.max(0, Math.round(sx - 90)), y: Math.max(0, Math.round(sy - 110)), width: 180, height: 170 };
  }, vid);
  await p.screenshot({ path: `${OUT}/holdout-${vid}.png`, clip: crop });
  console.log(`vid ${vid}: 截图完成`);
  await p.evaluate((vid) => {
    const g = window.__swGame;
    if (g.__pinNpc) { clearInterval(g.__pinNpc); g.__pinNpc = null; }
  }, vid);
}
await b.close();
console.log('DONE →', OUT);
