// BJ277 实机探针：彩虹魔杖(79) 引导期碰墙行为面全流程取证。
// ① 引导按压相：channel 按住 + 光标钉墙后 → 星碰实心墙【不消亡】,夹速×0.1 贴墙
//    渐进（:19442-19456 特支）→ 连拍截图（星贴墙存活）;
// ② 松手相：松开 channel → 星按直飞/索敌继续飞,撞墙 Kill（BJ255 迸散面）→ 截图;
// ③ 非 79 对照：16 引导档碰墙照 Kill（原版 aiStyle 9 唯一豁免=79）。
// ★冻结纪律（BJ247 教训）：evaluate 间歇一律 paused=true,rAF 不撕采样。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5241';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));

await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
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
  await page.keyboard.type('BJ277探针');
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
  await page.keyboard.type('bj247probe');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

// ---------- 场地：开阔走廊 + 星高度竖墙（x=墙列,y=50..150 段） ----------
const prep = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) - 44;
  for (let dx = -420; dx <= 420; dx++) {
    for (let dy = -36; dy <= 2; dy++) st.setTile(px0 + dx, gy + dy, 0);
    st.setTile(px0 + dx, gy + 3, 2);
  }
  g.player.x = px0 * 16; g.player.y = (gy - 2) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.paused = false;
  for (let k = 0; k < 30; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  // 竖墙：星道高度（玩家 cy−56 行）起,3 格厚 × 14 格高,右缘距玩家 ~260px
  const starRow = gy - 4;                    // 星飞行行
  const wallX0 = px0 + 16;
  for (let t = 0; t < 3; t++) for (let h = -7; h <= 6; h++) st.setTile(wallX0 + t, starRow + h, 1);
  return { px0, gy, starRow, wallX0, wallFacePx: wallX0 * 16, pcy: Math.round(g.player.cy) };
});
console.log('prep', JSON.stringify(prep));

// ---------- ① 引导按压相 ----------
const press = await page.evaluate(async (prep) => {
  const g = window.__swGame;
  const st = g.world.store;
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const y0 = prep.starRow * 16 + 8;
  let held = true;
  const aim = { x: prep.wallFacePx + 1200, y: y0 };      // 光标钉墙后远处
  const m = new MagicMissileProj(g.player.cx + 24, y0 - 16, 24, 0, {
    projId: 79, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => held, aimCb: () => aim, payMana: () => true,
  });
  g.entities.add(m, 'projectiles');
  g.paused = false;
  const samples = [];
  let firstContact = -1;
  for (let k = 0; k < 90; k++) {
    g.fixedUpdate(1 / 60);
    const solidAhead = st.isSolid(Math.floor((m.cx + 4) / 16), prep.starRow);
    if (samples.length < 200) samples.push({ k, cx: +m.cx.toFixed(1), vx: +m.vx.toFixed(2), dead: m.dead });
    if (firstContact < 0 && Math.abs(m.vx) < 4 && m.vx !== 0) firstContact = k;   // 首个夹速拍
    if (m.dead) break;
  }
  g.paused = true;
  const alive = !m.dead;
  const cxAtEnd = +m.cx.toFixed(1);
  const crossed = m.cx > (prep.wallX0 + 3) * 16;         // 已穿出墙远缘
  return { alive, cxAtEnd, crossed, firstContact, tail: samples.slice(-6), pressed: samples.filter((s) => s.k >= 2 && s.k <= 8) };
}, prep);
console.log('①press', JSON.stringify(press));
await page.screenshot({ path: '/tmp/bj277-press.png' });

// ---------- ② 松手相：星继续飞 → 撞墙 Kill ----------
const release = await page.evaluate(async (prep) => {
  const g = window.__swGame;
  const st = g.world.store;
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const y0 = prep.starRow * 16 + 8;
  let held = false;                                       // 出生即松手=直飞档
  const m = new MagicMissileProj(g.player.cx + 24, y0 - 16, 24, 0, {
    projId: 79, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => held, aimCb: () => ({ x: prep.wallFacePx + 1200, y: y0 }), payMana: () => true,
  });
  g.entities.add(m, 'projectiles');
  g.paused = false;
  let deadAt = -1, cxDead = 0;
  for (let k = 0; k < 40; k++) {
    g.fixedUpdate(1 / 60);
    if (m.dead) { deadAt = k; cxDead = +m.cx.toFixed(1); break; }
  }
  g.paused = true;
  // 松手前墙未及 → 直飞撞墙死亡面（BJ255 Kill 迸散）
  return { died: deadAt >= 0, deadAt, cxDead, facePx: prep.wallFacePx };
}, prep);
console.log('②release', JSON.stringify(release));
await page.screenshot({ path: '/tmp/bj277-release.png' });

// ---------- ③ 非 79 对照：16 引导档碰墙照 Kill ----------
const ctrl16 = await page.evaluate(async (prep) => {
  const g = window.__swGame;
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const y0 = prep.starRow * 16 + 8;
  let held = true;
  const m = new MagicMissileProj(g.player.cx + 24, y0 - 16, 24, 0, {
    projId: 16, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => held, aimCb: () => ({ x: prep.wallFacePx + 1200, y: y0 }), payMana: () => true,
  });
  g.entities.add(m, 'projectiles');
  g.paused = false;
  let deadAt = -1;
  for (let k = 0; k < 40; k++) {
    g.fixedUpdate(1 / 60);
    if (m.dead) { deadAt = k; break; }
  }
  g.paused = true;
  return { died: deadAt >= 0, deadAt };
}, prep);
console.log('③ctrl16', JSON.stringify(ctrl16));

const ok = press.alive && release.died && ctrl16.died;
console.log('VERDICT', ok ? 'GREEN' : 'RED', JSON.stringify({ pressAlive: press.alive, releaseDied: release.died, ctrl16Died: ctrl16.died }));
await browser.close().catch(() => {});
process.exit(ok ? 0 : 1);
