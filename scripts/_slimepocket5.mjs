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
  // ★玩家放回存档位（用户会话玩家站 (49537,3808)=cx/cy 围观）——probe 加载器
  // 默认把 player 放在世界出生点(2098,230)，距水囊 996 格 → activeRange 外
  // despawn 秒杀 = 伪影。放回后 AI 索敌/消散域全部真实。
  {
    const p = g.player;
    p.x = 49537 - p.w / 2; p.y = 3808 - p.h / 2;
    p.vx = 0; p.vy = 0;
  }

  const spots = [{ name: "sealed_water_cell", x: 3094.5, y: 244.5 }];
  const results = [];
   const RUNS = 6;
   for (let run = 0; run < RUNS; run++) {
     const spawned = await window.__swFlow.spawnVanillaEnemy(1, spots[0].x * 16, spots[0].y * 16);
     const slime = g.enemies().filter((e) => e.vanillaId === 1 && !e.dead).pop();
     if (!slime) { results.push({ run, err: "spawn failed" }); continue; }
     slime.w = slime.def.width = 26; slime.h = slime.def.height = 20;
     const trace = [];
     let lifts = 0;
     for (let i = 0; i < 600; i++) {
       const py = slime.y;
       g.fixedUpdate(1 / 60);
       if (slime.dead) { slime.dead = false; slime.despawnTimer = 750; }
       if (!g.enemies().includes(slime)) g.entities.enemies.push(slime);
       if (py - slime.y >= 12) lifts++;
       trace.push({ x: Math.round(slime.cx), y: Math.round(slime.y), wet: slime.wet ? 1 : 0, g: slime.onGround ? 1 : 0 });
     }
     const xMaxSpread = Math.max(...trace.map((r) => r.x)) - Math.min(...trace.map((r) => r.x));
     results.push({ run, lifts, escaped: xMaxSpread > 40, finalX: trace[trace.length - 1].x, xSpread: xMaxSpread });
     slime.dead = true;
     const idx = g.entities.enemies.indexOf(slime);
     if (idx >= 0) g.entities.enemies.splice(idx, 1);
   }
   return { results };
}, json);
console.log(JSON.stringify(out.results, null, 1));
await browser.close();
