// 跳变源定位：逐 tick 记录 slime 状态 + 跳变瞬间中心格/上下格实况
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = needInput(join(DOWNLOADS, 'map-害兽姐妹会.json'));
const json = fs.readFileSync(MAP, 'utf8');

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => window.__swFlow, { timeout: 60000 });

const out = await page.evaluate(async (text) => {
  await window.__swFlow.loadJson(text);
  const g = window.__swGame;
  const st = g.world.store;
  const p = g.player;
  p.x = 49537 - p.w / 2; p.y = 3808 - p.h / 2; p.vx = 0; p.vy = 0;
  await window.__swFlow.spawnVanillaEnemy(1, 3094.5 * 16, 244.5 * 16);
  const slime = g.enemies().filter((e) => e.vanillaId === 1 && !e.dead).pop();
  slime.w = slime.def.width = 26; slime.h = slime.def.height = 20;

  const rows = [];
  let prevY = null;
  for (let i = 0; i < 120; i++) {
    g.fixedUpdate(1 / 60);
    if (slime.dead) { slime.dead = false; slime.despawnTimer = 750; }
    if (!g.enemies().includes(slime)) g.entities.enemies.push(slime);
    const cy = +slime.cy.toFixed(1), cx = +slime.cx.toFixed(1);
    const jump = prevY !== null && prevY - slime.y >= 12;
    if (jump || rows.length < 3) {
      const cCol = Math.floor(cx / 16), cRow = Math.floor(cy / 16);
      rows.push({
        t: g.tickCount, jump, dy: prevY !== null ? +(prevY - slime.y).toFixed(1) : 0,
        x: +slime.x.toFixed(1), y: +slime.y.toFixed(1), cx, cy,
        vy: +slime.vy.toFixed(2), vx: +slime.vx.toFixed(2),
        g: slime.onGround ? 1 : 0, hh: slime.hitHead ? 1 : 0, hw: slime.hitWall ? 1 : 0,
        cY: slime.collideY ? 1 : 0, wet: slime.wet ? 1 : 0,
        eT: slime.embedTicks | 0, ai0: +slime.ai0.toFixed(0), ai2: +slime.ai2.toFixed(0),
        center: [cCol, cRow, st.isSolid(cCol, cRow) ? 1 : 0, st.type[st.idx(cCol, cRow)]],
        above: [cCol, cRow - 1, st.isSolid(cCol, cRow - 1) ? 1 : 0],
      });
    }
    prevY = slime.y;
  }
  return { rows };
}, json);
for (const r of out.rows) console.log(JSON.stringify(r));
await browser.close();
