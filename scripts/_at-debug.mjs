// 一次性:AttackType2/3 诊断——钉态读回/贴图加载态/绘制门逐项
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(1200);
const st = await p.evaluate(() => {
  const g = window.__swGame;
  const npcs = g.entities?.all?.() ?? g.npcs ?? [];
  const list = (Array.isArray(npcs) ? npcs : [...npcs]).filter((e) => e && e.vanillaId !== undefined);
  const guide = list.find((e) => e.vanillaId === 22);
  const wizard = list.find((e) => e.vanillaId === 108)
    ?? (() => {
      const n = new guide.constructor('wizard', g.player.x + 80, g.player.y - 20);
      g.entities.add(n, 'npcs');
      return n;
    })();
  let proto = Object.getPrototypeOf(wizard);
  while (proto && typeof proto.update !== 'function') proto = Object.getPrototypeOf(proto);
  if (proto && !proto.__swOrigUpdate) {
    proto.__swOrigUpdate = proto.update;
    proto.update = function (...a) {
      const r = proto.__swOrigUpdate.apply(this, a);
      if (this.vanillaId === 108) { this.atkState = 14; this.atkTick = (this.atkTick + 1) % 48; }
      return r;
    };
  }
  return { wizardSpawned: !!wizard };
});
await sleep(1000);
const st2 = await p.evaluate(() => {
  const g = window.__swGame;
  const npcs = g.entities?.all?.() ?? g.npcs ?? [];
  const list = (Array.isArray(npcs) ? npcs : [...npcs]).filter((e) => e && e.vanillaId === 108);
  const w = list[0];
  const img = g.renderer.atlas?.ensureVImage('vanilla/Extra_51.png');
  return {
    atkState: w ? w.attackState : 'no-npc',
    atkTick: w ? w.attackTick : null,
    at: window.__swGame.renderer ? 'renderer-ok' : null,
    extra51: img ? `${img.width}x${img.height}` : 'not-loaded',
    attackType: w ? 2 : null
  };
});
console.log('DIAG:', JSON.stringify(st2));
await b.close();
