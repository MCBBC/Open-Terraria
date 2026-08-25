// DPS 计漏斗端到端:冰川之牙(1115 蓄力弹,dealContacts 路径)+ 炸弹(爆炸 ⑥ 路径)
// 命中敌怪 → player.getDPS() > 0。fromPlayer=true 修复的回归探针。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?dev=1';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.keyboard.type(' DPS');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// 公共准备:DPS 计入包(信息族背包即生效) + 清场
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.slots[40] = { id: window.__swItems['vi_3119_dps_meter'], stack: 1 };
});

// ① 冰川之牙:持械 → 面前刷僵尸 → 按住蓄力 0.6s → 松开 → 命中 → DPS>0
const gf = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  p.inv.slots[0] = { id: window.__swItems['vi_6153_GlacierFang'], stack: 1 };
  p.inv.selected = 0;
  p.statManaCurrent2 = p.statManaMax2 = 200;
  // 清场后刷一只僵尸在玩家右侧 3 格
  g.debugClearEnemies?.();
  g.debugSpawnNpc(3, 1, false);
  await new Promise((r) => setTimeout(r, 400));
  const z = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 3);
  if (!z) return { err: 'no zombie' };
  const [sx, sy] = g.camera.worldToScreen(z.cx, z.cy);
  return { sx, sy };
});
if (gf.err) { console.log('FAIL: 准备阶段 ' + gf.err); fail++; }
else {
  await page.mouse.move(gf.sx, gf.sy);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 600));   // 蓄力 36 帧
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 2500));  // 弹飞行+命中
  const dps1 = await page.evaluate(() => window.__swGame.player.getDPS());
  check('冰川之牙命中 → DPS>0', dps1 > 0, `dps=${dps1}`);
}

// ② 炸弹:手持雷管丢出 → 爆炸 ⑥ 路径 → DPS 累计
const bomb = await page.evaluate(async () => {
  const g = window.__swGame;
  g.debugClearEnemies?.();
  await new Promise((r) => setTimeout(r, 200));
  g.debugSpawnNpc(3, 1, false);   // 新目标(①阶段目标可能已被冰川之牙击杀)
  await new Promise((r) => setTimeout(r, 300));
  const p = g.player;
  p.inv.slots[0] = { id: window.__swItems['vi_166_bomb'], stack: 5 };
  p.inv.selected = 0;
  const z = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 3);
  if (!z) return { err: 'no target' };
  const [sx, sy] = g.camera.worldToScreen(z.cx, z.cy);
  return { sx, sy, zhp: z.hp };
});
if (bomb.err) { console.log('FAIL: 炸弹准备 ' + bomb.err); fail++; }
else {
  await page.mouse.move(bomb.sx, bomb.sy);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 400));
  const mid = await page.evaluate(() => {
    const g = window.__swGame;
    const bombs = g.entities.projectiles.filter((e) => !e.dead && (e.projId === 28 || e.constructor?.name === 'GrenadeProj'));
    return { bombs: bombs.length, held: g.player.inv.heldItem()?.id, useT: g.player.useTime };
  });
  await new Promise((r) => setTimeout(r, 3100));  // 引信 180t=3s + 爆炸
  await page.mouse.up();
  const post = await page.evaluate(() => {
    const g = window.__swGame;
    const z = g.entities.enemies.find((e) => e.vanillaId === 3);
    return { dps: g.player.getDPS(), zAlive: z ? !z.dead : null, zhp: z?.hp, started: g.player.dpsStarted };
  });
  check('炸弹已掷出(场上弹体)', mid.bombs > 0, JSON.stringify(mid));
  check('炸弹爆炸 → DPS>0', post.dps > 0, JSON.stringify({ ...post, mid }));
}

check('无页面错误', errors.length === 0, errors.join('|').slice(0, 160));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
