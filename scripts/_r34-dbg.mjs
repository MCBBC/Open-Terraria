// R34 诊断:950 魔法阵在运行环境早亡定位 + 3852 右键真实鼠标事件路径
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5228';
const browser = await puppeteer.launch({
  protocolTimeout: 400000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror:', String(e.message).slice(0, 150)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('R34D');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

// ---- 实验一:直接构造 950,数 engine tick 到移除 ----
const exp1 = await page.evaluate(async () => {
  const g = window.__swGame;
  const mod = await import('/src/entities/proj1457.ts');
  const c = new mod.PrincessMagicCircle(g.player.cx + 80, g.player.cy, 70, 5);
  g.entities.add(c, 'projectiles');
  const arrRef1 = g.entities.projectiles;
  let t = 0;
  while (!c.dead && t < 200) { g.fixedUpdate(1 / 60); t++; }
  return {
    ticksToDead: t,
    deadFlag: c.dead,
    arrSame: g.entities.projectiles === arrRef1,
    stillInArr: g.entities.projectiles.includes(c),
    hpOfCircle: undefined,
  };
});
console.log('exp1 (direct 950):', JSON.stringify(exp1));

// ---- 实验二:真实右键点击驱动 3852 ----
const shot = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const p = g.player;
  const key = items.VANILLA_ITEM_KEY_BY_ID[3852];
  const id = items.ITEM_BY_KEY[key] ?? items.ITEM_BY_KEY[`vi_3852_`];
  p.inv.slots[2] = { id, stack: 1 };
  p.inv.selected = 2;
  p.useTime = 0; p.itemTime = 0;
  p.statManaMax2 = 400; p.manaMax = 400; p.mana = 400;
  const calls = [];
  const oc = p.checkMana.bind(p);
  p.checkMana = (a) => { calls.push(a); return oc(a); };
  const [sx, sy] = g.camera.worldToScreen(g.player.cx + 96, g.player.cy);
  return { sx, sy, dpr: g.renderer.dpr || 1 };
});
console.log('screen point:', JSON.stringify(shot));
await page.mouse.click(shot.sx / shot.dpr, shot.sy / shot.dpr, { button: 'right' });
const exp2 = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = { twister: false, manaCalls: 'spy-not-visible', n704: 0 };
  for (let i = 0; i < 20; i++) {
    g.fixedUpdate(1 / 60);
    await new Promise((r) => requestAnimationFrame(r));
  }
  out.n704 = g.entities.projectiles.filter((q) => q.projId === 704).length;
  out.twister = out.n704 > 0;
  return out;
});
console.log('exp2 (real RMB):', JSON.stringify(exp2));
await browser.close();

// ---- 实验三:施法路径 950 早亡取证(dead 写入栈) ----
const shot3 = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const p = g.player;
  const key = items.VANILLA_ITEM_KEY_BY_ID[5065];
  const id = items.ITEM_BY_KEY[key] ?? items.ITEM_BY_KEY[`vi_5065_`];
  p.inv.slots[2] = { id, stack: 1 };
  p.inv.selected = 2;
  for (const q of g.entities.projectiles) q.dead = true;
  p.useTime = 0; p.itemTime = 0;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx + 96, g.player.cy);
  return { sx: sx / (g.renderer.dpr || 1), sy: sy / (g.renderer.dpr || 1) };
});
await page.mouse.click(shot3.sx, shot3.sy, { button: 'left' });
const exp3 = await page.evaluate(async () => {
  const g = window.__swGame;
  let circle = null;
  for (let i = 0; i < 10 && !circle; i++) {
    g.fixedUpdate(1 / 60);
    circle = g.entities.projectiles.find((q) => q.projId === 950);
  }
  if (!circle) return { found: false };
  const stacks = [];
  let v = circle.dead;
  Object.defineProperty(circle, 'dead', {
    get() { return v; },
    set(nv) { if (nv && !v) stacks.push(new Error().stack?.split('\n').slice(1, 4).join(' | ')); v = nv; },
    configurable: true,
  });
  // 同时数真实推进拍
  const origFixed = g.fixedUpdate.bind(g);
  let ftick = 0;
  g.fixedUpdate = (dt) => { ftick++; return origFixed(dt); };
  while (!v && ftick < 300) { origFixed(1 / 60); ftick++; }
  return {
    found: true,
    lifeTicksAtTrapInstall: undefined,
    ticksToDead: ftick,
    stacks,
    n950total: g.entities.projectiles.filter((q) => q.projId === 950).length,
    tField: circle.t,
  };
});
console.log('exp3 (cast-path forensics):', JSON.stringify(exp3, null, 1));
await browser.close();
