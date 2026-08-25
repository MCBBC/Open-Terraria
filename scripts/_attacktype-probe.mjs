// 一次性:AttackType2/3 攻击视觉取证——巫师(108 魔法光环)/染料商(207 挥砍)钉态截图
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(1500);

for (const [key, vid, state] of [['wizard', 108, 14], ['dyer', 207, 15]]) {
  const ok = await p.evaluate((key, vid, state) => {
    const g = window.__swGame;
    const npcs = g.entities?.all?.() ?? g.npcs ?? [];
    const list = (Array.isArray(npcs) ? npcs : [...npcs]).filter((e) => e && e.vanillaId !== undefined);
    const guide = list.find((e) => e.vanillaId === 22);
    if (!guide) return false;
    let n = list.find((e) => e.vanillaId === vid);
    if (!n) {
      n = new guide.constructor(key, g.player.x + (vid === 108 ? 80 : 160), g.player.y - 20);
      g.entities.add(n, 'npcs');
    }
    n.x = g.player.x + (vid === 108 ? 80 : 160);
    n.y = g.player.y - 10;
    n.vx = 0; n.vy = 0;
    let proto = Object.getPrototypeOf(n);
    while (proto && typeof proto.update !== 'function') proto = Object.getPrototypeOf(proto);
    if (proto && !proto.__swOrigUpdate) {
      proto.__swOrigUpdate = proto.update;
      proto.update = function (...a) {
        const r = proto.__swOrigUpdate.apply(this, a);
        if (this.vanillaId === 108) { this.atkState = 14; this.atkTick = (this.atkTick + 1) % 48; }
        else if (this.vanillaId === 207) { this.atkState = 15; this.atkTimer = (this.atkTimer + 1) % 20; }
        return r;
      };
    }
    return true;
  }, key, vid, state);
  console.log(`${key}(${vid}):`, ok ? 'pinned' : 'MISSING');
}
await sleep(1200);
for (const [vid, name] of [[108, 'wizard'], [207, 'dyer']]) {
  const crop = await p.evaluate((vid) => {
    const g = window.__swGame;
    const npcs = g.entities?.all?.() ?? g.npcs ?? [];
    const list = (Array.isArray(npcs) ? npcs : [...npcs]).filter((e) => e && e.vanillaId === vid);
    const n = list[0];
    if (!n) return null;
    const [sx, sy] = g.camera.worldToScreen(n.cx, n.cy);
    return { x: Math.max(0, Math.round(sx - 80)), y: Math.max(0, Math.round(sy - 110)), width: 160, height: 170 };
  }, vid);
  if (crop) await p.screenshot({ path: `${OUT}/attacktype-${name}.png`, clip: crop });
  console.log(`${name}: 截图${crop ? '完成' : '跳过'}`);
}
await b.close();
console.log('DONE →', OUT);
