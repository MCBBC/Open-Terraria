// 石巨人一阶段头部层序探针:头(246)须画在本体(245)【前】
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
  const st = g.world.store;
  // 玩家旁平地
  const px = Math.floor(g.player.cx / 16) + 12;
  let gy = Math.floor(g.player.cy / 16);
  while (gy < st.h - 4 && !st.isSolid(px, gy)) gy++;
  g.debugSpawnNpc(245, 1, false);
  // 部件由本体首帧生成——步进 5t
  for (let t = 0; t < 5; t++) g.fixedUpdate(1 / 60);
  const fam = g.entities.enemies.filter((n) => !n.dead && n.vanillaId >= 245 && n.vanillaId <= 249);
  const body = fam.find((n) => n.vanillaId === 245);
  const head = fam.find((n) => n.vanillaId === 246);
  const fl = fam.find((n) => n.vanillaId === 247);
  return {
    famIds: fam.map((n) => n.vanillaId),
    bodyY: body?.y, headY: head?.y, fistY: fl?.y,
    headMaster: head?.master?.vanillaId ?? null,
    fistMaster: fl?.master?.vanillaId ?? null,
  };
});
console.log(JSON.stringify(out, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('家族齐(245 本体/246 头/247/248 拳)', ['245','246','247','248'].every((id) => out.famIds.includes(Number(id))), out.famIds.join(','));
check('头 y < 本体 y(物理上头在上=旧 y 排序必垫后)', out.headY < out.bodyY, `headY=${out.headY} bodyY=${out.bodyY}`);
check('挂载头锚本体(master=245)', out.headMaster === 245);
check('拳锚本体(master=245)', out.fistMaster === 245);
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
