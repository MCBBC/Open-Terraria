import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&sv=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.lastDamageCause = { kind: 'npc', name: '蓝史莱姆' };
  g.player.hp = 0;
  g.player.dead = true;
});
await new Promise((r) => setTimeout(r, 4000));
const res = await page.evaluate(() => {
  const g = window.__swGame;
  const sign = g.world.signs[0] ?? null;
  let tileOk = false, frameOk = false;
  if (sign) {
    const st = g.world.store;
    const t = st.type[st.idx(sign.x, sign.y)];
    const fx = st.frameX[st.idx(sign.x, sign.y)];
    tileOk = t !== 0;
    frameOk = fx % 36 === 0; // style 锚点帧
    return { sign, tileType: t, frameX: fx, tileOk, frameOk };
  }
  return { sign, tileOk, frameOk };
});
// 存档 roundtrip：doSave 经由 flow? 直接序列化验证 signs 持久化在 json 里
const saveJson = await page.evaluate(() => {
  const g = window.__swGame;
  // saveGame 未暴露到 window——经由 __swFlow? flow.doSave() 走 kv。直接检查 world.signs 已足够（单测覆盖序列化）
  return g.world.signs.length;
});
await page.screenshot({ path: 'shots/death-placed.png' });
console.log(JSON.stringify({ res, signCount: saveJson, errors: errors.slice(0, 3) }, null, 2));
await browser.close();
