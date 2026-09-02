// 史莱姆冻结插桩：包装 slimeAI/groundPhysics/applyGravity 记录 vy 各阶段值
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = '/Users/vinlic/Downloads/map-害兽姐妹会.json';
const json = fs.readFileSync(MAP, 'utf8');

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.text().startsWith('SLIME')) console.log(m.text()); });
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => window.__swFlow, { timeout: 60000 });

const out = await page.evaluate(async (text) => {
  await window.__swFlow.loadJson(text);
  const g = window.__swGame;
  const spawned = await window.__swFlow.spawnVanillaEnemy(1, 3094.5 * 16, 244.5 * 16);
  const slime = g.enemies().find((e) => e.vanillaId === 1);
  slime.w = slime.def.width = 26; slime.h = slime.def.height = 20;
  const proto = Object.getPrototypeOf(slime);
  const log = [];
  const wrap = (name, tag) => {
    const orig = proto[name];
    proto[name] = function (...a) {
      const before = { vy: +this.vy.toFixed(2), wet: this.wet ? 1 : 0, g: this.onGround ? 1 : 0, hh: this.hitHead ? 1 : 0, cY: this.collideY ? 1 : 0, x: +this.x.toFixed(2), y: +this.y.toFixed(2), ai2: this.ai2, dY: this.dirY };
      const r = orig.apply(this, a);
      const after = { vy: +this.vy.toFixed(2), g: this.onGround ? 1 : 0, hh: this.hitHead ? 1 : 0, cY: this.collideY ? 1 : 0, x: +this.x.toFixed(2), y: +this.y.toFixed(2) };
      if (log.length < 300) log.push({ t: g.tickCount, tag, before, after });
      return r;
    };
  };
  wrap('slimeAI', 'ai');
  wrap('applyGravity', 'grav');
  wrap('groundPhysics', 'phys');
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  return { log: log.slice(0, 90), final: { x: slime.x, y: slime.y, vy: slime.vy, wet: slime.wet, dead: slime.dead, hp: slime.hp, stillInList: g.enemies().includes(slime), enemyCount: g.enemies().length } };
}, json);
for (const r of out.log) console.log(JSON.stringify(r));
console.log('final:', JSON.stringify(out.final));
await browser.close();
