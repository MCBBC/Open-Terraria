// RB 彩虹魔杖弹幕贴图实报探针（用户截图:弹幕画成"白大圆内红衣人物像"）。
// ① 走菜单流进世界 → 发 495 彩虹魔杖（channel 弹 79）
// ② 飞行相/落地相各截图 + 弹幕实体清单 + projSprite 健康 + Projectile_* 请求清单
// ③ 弹幕邻域像素直方图（判别画的是什么:彩虹条带=多色相;白圆=单白团;妖精=白+粉红簇）
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5253';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
const imgReqs = [];
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('/sprites/')) imgReqs.push(u.split('/').pop());
});

await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
// ★UI 菜单流（同 _batch5-probe）：title → splash → sp → 角色（新建）→ 世界（新建）
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
  await page.keyboard.type('RB探针');
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
  await page.keyboard.type('rbrod');
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

const out = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  const st = g.world.store;
  const res = {};
  // 整平出生点高地（纯石台）
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) - 30;
  for (let dx = -140; dx <= 140; dx++) for (let dy = -40; dy <= 2; dy++) st.setTile(px0 + dx, gy + dy, 0);
  for (let dx = -140; dx <= 140; dx++) st.setTile(px0 + dx, gy + 3, 2);
  g.player.x = px0 * 16; g.player.y = (gy - 2) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.player.mana = g.player.maxMana ?? 200;
  g.paused = false;
  // 发彩虹魔杖（vanilla item 495,自动注册键 vi_495_RainbowRod）
  const { ITEM_BY_KEY, ITEM_DEFS } = await import('/src/data/items.ts');
  const rodId = ITEM_BY_KEY['vi_495_RainbowRod'];
  res.rainbowRodItemId = rodId;
  res.rainbowRodDef = rodId !== undefined ? { key: ITEM_DEFS[rodId]?.key, shoot: ITEM_DEFS[rodId]?.shoot, damage: ITEM_DEFS[rodId]?.damage } : null;
  for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
  g.player.inv.slots[0] = { id: rodId, stack: 1 };
  g.player.inv.selected = 0;
  g.player.useTime = 0;
  await wait(400);

  // channel 发射：直构造 MagicMissileProj(79)（绕过 useCombatWeapon 的 def 壳问题）
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const aim = { x: g.player.cx + 260, y: g.player.cy - 60 };
  const m = new MagicMissileProj(g.player.cx, g.player.cy - 18, 6, -1.5, {
    projId: 79, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => g.input.mouseHeld,
    aimCb: () => aim,
    payMana: () => true,
  });
  m.x = m.x - m.w / 2; m.y = m.y - m.h / 2;
  try { g.entities.add(m, 'projectiles'); } catch (e) { res.spawnErr = String(e && e.message); }
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let k = 0; k < 40; k++) g.fixedUpdate(1 / 60);
  await wait(250);
  const dump = () => (g.entities.projectiles ?? []).map((p) => ({ t: p.constructor?.name, id: p.projId ?? p.type ?? null, x: Math.round(p.cx ?? p.x), y: Math.round(p.cy ?? p.y), dead: !!p.dead }));
  res.projsFlying = dump();
  res.orb = res.projsFlying.find((p) => p.id === 79) ?? null;
  res.spriteHealth = (await import('/src/entities/Arrow.ts')).projSpriteHealth([79, 16, 34]);
  return res;
});

if (out.orb) {
  const [scx, scy] = await page.evaluate(([ox, oy]) => {
    const g = window.__swGame;
    return g.camera.worldToScreen(ox, oy);
  }, [out.orb.x, out.orb.y]);
  await page.screenshot({ path: '/tmp/rbrod-flying.png', clip: { x: Math.max(0, scx - 170), y: Math.max(0, scy - 170), width: 340, height: 340 } });
}

// 落地相：松手 + 80 拍
// 飞行相：松手直飞（无目标→归一 32px/t），飞行中截图
const outF = await page.evaluate(async () => {
  const g = window.__swGame;
  g.input.mouseDown = false; g.input.mouseHeld = false;
  // 重新生成一枚并直接给直飞速度（模拟松手索敌无目标分支 :40667-40676）
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const m = new MagicMissileProj(g.player.cx - 240, g.player.cy - 120, 20, 0, {
    projId: 79, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => false, aimCb: () => ({ x: g.player.cx + 400, y: g.player.cy - 200 }),
    payMana: () => true,
  });
  m.x = m.x - m.w / 2; m.y = m.y - m.h / 2;
  g.entities.add(m, 'projectiles');
  for (let k = 0; k < 14; k++) g.fixedUpdate(1 / 60);   // 飞行 ~14 拍=拖尾成形
  const projs = (g.entities.projectiles ?? []).filter((p) => p.projId === 79 && !p.dead);
  const orb = projs[projs.length - 1] ?? null;
  if (orb) { g.paused = true; g.camera.x = orb.cx; g.camera.y = orb.cy; }   // 暂停+钉相机=弹心（防 rAF 跟随重置）
  return orb ? { x: Math.round(orb.cx), y: Math.round(orb.cy), n: projs.length, stripLen: orb.strip?.length ?? 0 } : null;
});
if (outF) {
  await new Promise((r) => setTimeout(r, 120));
  await page.screenshot({ path: '/tmp/rbrod-flight.png' });
  console.log('FLIGHT orb', JSON.stringify(outF));
}

const out2 = await page.evaluate(async () => {
  const g = window.__swGame;
  for (let k = 0; k < 80; k++) g.fixedUpdate(1 / 60);
  await new Promise((r) => setTimeout(r, 300));
  const projs = (g.entities.projectiles ?? []).map((p) => ({ t: p.constructor?.name, id: p.projId ?? p.type ?? null, x: Math.round(p.cx ?? p.x), y: Math.round(p.cy ?? p.y), dead: !!p.dead }));
  return { projs, orb: projs.find((p) => p.id === 79) ?? null };
});
if (out2.orb) {
  const [scx, scy] = await page.evaluate(([ox, oy]) => window.__swGame.camera.worldToScreen(ox, oy), [out2.orb.x, out2.orb.y]);
  await page.screenshot({ path: '/tmp/rbrod-landed.png', clip: { x: Math.max(0, scx - 170), y: Math.max(0, scy - 170), width: 340, height: 340 } });
}
// 全帧截图（未 clip,含 HUD）+ 像素直方图
await page.screenshot({ path: '/tmp/rbrod-full.png' });
const hist = await page.evaluate(() => {
  const cv = [...document.querySelectorAll('#game-root canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!cv) return null;
  const sc = document.createElement('canvas');
  sc.width = cv.width; sc.height = cv.height;
  const c2 = sc.getContext('2d', { willReadFrequently: true });
  c2.drawImage(cv, 0, 0);
  const d = c2.getImageData(0, 0, sc.width, sc.height).data;
  const buckets = {};
  for (let i = 0; i < d.length; i += 16) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    if (r < 30 && gg < 30 && b < 40) continue;
    const key = `${Math.round(r / 48)},${Math.round(gg / 48)},${Math.round(b / 48)}`;
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  return Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 14);
});
const projReqs = [...new Set(imgReqs)].filter((n) => n.startsWith('Projectile_'));
console.log(JSON.stringify({ out, out2, projReqs, hist }, null, 1));
await browser.close();
