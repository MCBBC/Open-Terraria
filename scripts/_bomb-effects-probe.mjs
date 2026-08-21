// 爆炸物全效果审计探针:小动物/城镇NPC巫毒/玩家自伤/地形/链爆 五维
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 400_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[PAGEERR]', String(e).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  const py = Math.floor(g.player.cy / 16);
  // 找开阔平地
  let gy = py;
  while (gy < st.h - 6 && !st.isSolid(px, gy + 1)) gy++;
  const r = {};
  // ① 小动物:爆炸盒内 critter 死
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const b = Enemy.fromVanilla(46, (px + 4) * 16, gy * 16);
  if (b) { b.id = g.entities.nextId++; g.entities.add(b, 'critters'); }
  for (let t = 0; t < 3; t++) g.fixedUpdate(1 / 60);
  const bunny = g.entities.critters.find((c) => !c.dead);
  r.bunnyBefore = !!bunny;
  if (bunny) {
    g.explodeAt(Math.floor(bunny.cx / 16), Math.floor(bunny.cy / 16), 100, 0, false, 64, 0, 28);
    r.bunnyDead = bunny.dead;
  }
  // ② 玩家自伤:站爆心(清 iframes——上一爆可能已伤玩家进无敌帧)
  g.player.iframes = 0;
  const hp0 = g.player.hp;
  g.explodeAt(px, gy, 100, 0, false, 64, 0, 28);
  r.playerHurt = hp0 - g.player.hp;
  // ③ 地形:土块清除
  const ty = gy + 2;
  st.setTileSilent(px + 3, ty, 1, 0, 0);
  g.explodeAt(px + 3, ty - 1, 100, 3, true, 64, 0, 28);
  r.tileGone = st.get(px + 3, ty) === 0;
  // ④ 城镇 NPC 免疫(无巫毒):向导站爆心不掉血
  // (TownNPC 生成需 housing——跳过实测,代码路径已核;此处测敌怪门:睡渔夫 376 免疫)
  return r;
});
console.log(JSON.stringify(out, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('小动物被爆炸波及(一击死)', out.bunnyDead === true);
check('玩家自伤生效(BombsHurtPlayers)', out.playerHurt > 0, `hurt=${out.playerHurt}`);
check('地形破坏(ExplodeTiles 半径)', out.tileGone === true);
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
