// 水囊系统穷举：在口袋区各候选格生成史莱姆，各跑 600t，记录行为签名
// （原地弹跳/逃逸路径/湿切换），定位"水面反复弹跳跳不起"的确切点位
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = '/Users/vinlic/Downloads/map-害兽姐妹会.json';
const json = fs.readFileSync(MAP, 'utf8');

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => window.__swFlow, { timeout: 60000 });

const out = await page.evaluate(async (text) => {
  await window.__swFlow.loadJson(text);
  const g = window.__swGame;
  window.__swPhysDbg = {};

  const spots = [
    { name: 'sealed_water_cell', x: 3094.5, y: 244.5 },
    { name: 'cavity_left', x: 3089.5, y: 246.5 },
    { name: 'water_3088_248', x: 3088.5, y: 248.5 },
    { name: 'cavity_3093_248', x: 3093.5, y: 248.5 },
    { name: 'above_pocket', x: 3094.5, y: 240.5 },
  ];
  const results = [];
  for (const s of spots) {
    const spawned = await window.__swFlow.spawnVanillaEnemy(1, s.x * 16, s.y * 16);
    const slime = g.enemies().find((e) => e.vanillaId === 1 && !e.dead && !e._tagged);
    if (!slime) { results.push({ name: s.name, err: 'spawn failed' }); continue; }
    slime._tagged = true;
    slime.w = slime.def.width = 26; slime.h = slime.def.height = 20;

    const trace = [];
    for (let i = 0; i < 600; i++) {
      g.fixedUpdate(1 / 60);
      if (slime.dead) { slime.dead = false; slime.despawnTimer = 750; }
      if (!g.enemies().includes(slime)) g.entities.enemies.push(slime);
      trace.push({ t: g.tickCount, x: +slime.x.toFixed(1), y: +slime.y.toFixed(1), vy: +slime.vy.toFixed(2), g: slime.onGround ? 1 : 0, hh: slime.hitHead ? 1 : 0, wet: slime.wet ? 1 : 0, eT: slime.embedTicks | 0, cx: +slime.cx.toFixed(1), cy: +slime.cy.toFixed(1) });
    }
    // 行为签名
    const yMin = Math.min(...trace.map((r) => r.y)), yMax = Math.max(...trace.map((r) => r.y));
    const xMin = Math.min(...trace.map((r) => r.cx)), xMax = Math.max(...trace.map((r) => r.cx));
    const wetTicks = trace.filter((r) => r.wet).length;
    const hhTicks = trace.filter((r) => r.hh).length;
    // 原地弹跳签名: x 活动范围 < 24px 且 y 活动 > 8px
    const bouncing = (xMax - xMin) < 24 && (yMax - yMin) > 8;
    const escaped = Math.abs(trace[trace.length - 1].cx - s.x * 16) > 40;
    results.push({ name: s.name, spawn: [s.x, s.y], yRange: [yMin, yMax].map((v) => +v.toFixed(1)), xRange: [xMin, xMax].map((v) => +v.toFixed(1)), wetTicks, hhTicks, bouncing, escaped, final: trace[trace.length - 1] });
    // 从桶里移除,准备下一个
    slime.dead = true;
    const idx = g.entities.enemies.indexOf(slime);
    if (idx >= 0) g.entities.enemies.splice(idx, 1);
    await new Promise((r) => setTimeout(r, 0));
  }
  return { results };
}, json);
console.log(JSON.stringify(out.results, null, 1));
await browser.close();
