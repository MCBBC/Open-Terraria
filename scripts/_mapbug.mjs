// Starter World (6).json 载入诊断：①卡顿（分段计时）②向导瞬移 ③Golfer 贴图条（帧高）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = '/Users/vinlic/Downloads/map-Starter_World (6).json';
const json = fs.readFileSync(MAP, 'utf8');

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => window.__swFlow, { timeout: 60000 });

const out = await page.evaluate(async (text) => {
  const t = {};
  const mark = (k) => { t[k] = performance.now(); };
  mark('start');
  // 载入（内部 loadSaveData + loadWorld）
  await window.__swFlow.loadJson(text);
  mark('loaded');
  const g = window.__swGame;
  await new Promise((r) => setTimeout(r, 3000));
  mark('idle3s');
  // 向导位置与出生点
  const guide = g.entities.npcs.find((n) => n.npcKey === 'guide');
  const bound = g.entities.npcs.filter((n) => n.bound);
  // Golfer 帧高验证（vnpc meta）
  const atlas = g.atlas;
  const fr588 = atlas.vnpc(588, 0);
  // 载入后单帧耗时：记录 >8ms 的尖峰 tick 及当时状态
  let worst = 0, sum = 0;
  const spikes = [];
  for (let k = 0; k < 1200; k++) {
    const a = performance.now();
    g.fixedUpdate(1 / 60);
    const b = performance.now();
    const c = b - a;
    sum += c; if (c > worst) worst = c;
    if (c > 8 && spikes.length < 12) spikes.push({ k, ms: +c.toFixed(1), liqBuf: g.liquid.bufferLen, liqNum: g.liquid.numLiquid, enemies: g.entities.enemies.length });
  }
  return {
    times: { loadMs: Math.round(t.loaded - t.start), idle3sMs: Math.round(t.idle3s - t.loaded) },
    guide: guide && { x: Math.round(guide.x / 16), y: Math.round(guide.y / 16), dead: guide.dead, bound: guide.bound },
    spawn: [g.world.spawnX, g.world.spawnY],
    boundNpcs: bound.map((n) => ({ key: n.npcKey, x: Math.round(n.x / 16), y: Math.round(n.y / 16), id: n.vanillaId })),
    frame588: fr588 && { sw: fr588.sw, sh: fr588.sh },
    tickCost: { avgMs: +(sum / 1200).toFixed(2), worstMs: +worst.toFixed(1) }, spikes,
    enemyCount: g.entities.enemies.length,
  };
}, json);
console.log(JSON.stringify(out, null, 1));
await browser.close();
