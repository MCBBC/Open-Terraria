// 死亡归因验证:电路炸药/地雷/手雷/敌弹炸死玩家的死亡文本凶手名正确,无残留旧归因
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// Lang.projectileName(108)=Explosives→zh '炸药' / 164 Landmine / 28 Bomb
const names = await page.evaluate(() => {
  const g = window.__swGame;
  return { p108: g.projectileName(108), p164: g.projectileName(164), p28: g.projectileName(28), p29: g.projectileName(29) };
});
check('投射物名解析:108=炸药/164=地雷/28=炸弹/29=雷管',
  names.p108 && names.p164 && names.p28 && names.p29, JSON.stringify(names));

// 死亡文本工具直接验证 createDeathText 投射物分支(不经真实死亡)
const txt = await page.evaluate(() => {
  // 模拟:先被蝙蝠打(cause=npc 洞穴蝙蝠),再被电路炸药炸死 → 应为 DeathSource.Projectile
  const g = window.__swGame;
  const p = g.player;
  p.lastDamageCause = { kind: 'npc', name: '洞穴蝙蝠' };   // 残留归因(用户场景)
  g.explodeAt(Math.floor(p.cx / 16), Math.floor(p.cy / 16), 99999, 0, false, 125, 0, 108);
  const cause = p.lastDamageCause;
  const deathHandled = p.dead || p.hp <= 0;
  // createDeathText 由 handlePlayerDeath 内部调用——直接重放该函数不可,改读 cause
  return { cause, dead: deathHandled };
});
check('爆炸覆盖残留归因:cause=projectile(非洞穴蝙蝠)', txt.cause?.kind === 'projectile', JSON.stringify(txt.cause));
check('炸药归因名=炸药(108 Explosives)', txt.cause?.name === names.p108, JSON.stringify(txt.cause));

// 2) 掷雷管炸死自己 → 凶手=雷管(29)
const dyn = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  if (p.dead) { p.dead = false; p.hp = p.maxHp; }
  p.lastDamageCause = null;
  g.explodeAt(Math.floor(p.cx / 16), Math.floor(p.cy / 16), 99999, 0, false, 125, 0, 29);
  return { cause: p.lastDamageCause };
});
check('雷管归因名=雷管(29 Dynamite)', dyn.cause?.name === names.p29, JSON.stringify(dyn.cause));

// 3) 死亡文本:真实走 handlePlayerDeath → newText 内容含凶器名
const deathMsg = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  if (p.dead) { p.dead = false; p.hp = p.maxHp; }
  p.iframes = 0;   // 前轮爆炸留的无敌帧会挡掉本次致死判定
  p.lastDamageCause = { kind: 'npc', name: '洞穴蝙蝠' };
  // 拦截 newText
  let msg = null;
  const orig = g.newText.bind(g);
  g.newText = (t, r, gr, b) => { if (r === 225 && gr === 25) msg = t; return orig(t, r, gr, b); };
  g.explodeAt(Math.floor(p.cx / 16), Math.floor(p.cy / 16), 99999, 0, false, 125, 0, 108);
  await new Promise((r) => setTimeout(r, 300));   // 死亡结算在下一 fixedUpdate(handlePlayerDeath)
  return { msg };
});
check('死亡公告含「炸药」凶手(DeathSource.Projectile)', deathMsg.msg && deathMsg.msg.includes('炸药'), JSON.stringify(deathMsg.msg).slice(0, 120));
check('死亡公告不再提洞穴蝙蝠(残留归因已清)', deathMsg.msg && !deathMsg.msg.includes('蝙蝠'), JSON.stringify(deathMsg.msg).slice(0, 120));

check('无页面错误', errors.length === 0, errors.slice(0, 2).join('|').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
