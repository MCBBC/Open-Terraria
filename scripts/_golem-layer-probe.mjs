// 多部件 Boss 层序探针:石巨人(头/拳)+骑手(反转)+月总(头最前) 三族
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(() => {
  const g = window.__swGame;
  g.debugSpawnNpc(245, 1, false);
  g.debugSpawnNpc(390, 1, false);
  for (let t = 0; t < 8; t++) g.fixedUpdate(1 / 60);
  const fam = g.entities.enemies.filter((n) => !n.dead);
  const body = fam.find((n) => n.vanillaId === 245);
  const head = fam.find((n) => n.vanillaId === 246);
  const fist = fam.find((n) => n.vanillaId === 247);
  const rider = fam.find((n) => n.vanillaId === 390);
  const mount = fam.find((n) => n.vanillaId === 391);
  return {
    golem: { headMaster: head?.master?.vanillaId ?? null, fistMaster: fist?.master?.vanillaId ?? null, headY: head?.y, bodyY: body?.y },
    rider: { has: !!rider && !!mount, drawBehind: rider?.drawBehindMaster ?? null, riderY: rider?.y, mountY: mount?.y },
  };
});
console.log(JSON.stringify(out, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('石巨人:头/拳锚本体 245', out.golem.headMaster === 245 && out.golem.fistMaster === 245);
check('石巨人:头 y<本体 y(旧序必垫后,现锚前)', out.golem.headY < out.golem.bodyY);
check('骑手族在场(390+坐骑 391)', out.rider.has);
check('骑手 drawBehindMaster=坐骑画骑手前', out.rider.drawBehind === true && out.rider.riderY < out.rider.mountY);
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
