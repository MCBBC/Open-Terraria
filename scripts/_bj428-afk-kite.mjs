// BJ428 实机验证探针（2026-10-01 用户实报「AFK 自动装备风筝但不放飞」）。
// 链路：挂机计满 AFKTimeNeededForAutoKiting(3600) → Game.updateSmartSelect AFK 臂
//   装备风筝槽（PickItemSelectionOverride :17537-17540）→ 同拍 updateUse G1 消费面
//   放行（★BJ428 断链修复层）→ useCombatWeapon case 'kite' → KiteProj(766) 出膛。
// 观测面：inv.selected 切到风筝槽 / afkCounterForKiting 自然步进过阈 / 场上 projId=766
//   活弹 / 截图留档 game/docs/evidence/bj428/。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const MAP = needInput(join(DOWNLOADS, 'map-Starter_World (12).json'));
const KITE_ID = 4367;          // vi_4367_KiteBlue（内置 id==vid）
const KITE_PROJ = 766;         // KITE_ITEM_PROJ[4367]
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5670';
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
{ // SW cache-first 清扫
  const cleared = await page.evaluate(async () => {
    try {
      const ks = await caches.keys();
      await Promise.all(ks.map((k) => caches.delete(k)));
      const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      return ks.length;
    } catch { return -1; }
  });
  if (cleared > 0) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 500));
  }
}
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 8000 }); break; }
  catch { if (i === 9) throw new Error('sp failed'); }
}
const mapText = readFileSync(MAP, 'utf8');
const boot = await page.evaluate(async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!window.__swLoadJson) return { fail: 'loader' };
  await window.__swLoadJson(t);
  for (let i = 0; i < 300 && !window.__swGame?.world; i++) await wait(200);
  return window.__swGame?.world ? { ok: true } : { fail: 'world' };
}, mapText);
if (!boot.ok) { console.log(JSON.stringify(boot)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));
for (const sel of ['button', '[data-act]']) {
  try {
    const done = await page.evaluate((s) => {
      const b = [...document.querySelectorAll(s)].find((x) => /我已知晓/.test(x.textContent ?? ''));
      if (b) { b.click(); return true; }
      return false;
    }, sel);
    if (done) break;
  } catch { /* next */ }
}
await new Promise((r) => setTimeout(r, 500));

mkdirSync('docs/evidence/bj428', { recursive: true });
const pre = await page.evaluate((kiteId, kp) => {
  const g = window.__swGame;
  // 静置面：清速度/输入（六输入皆空=AFK 步进条件）；风筝挂 5 号槽（非手持槽）
  g.player.vx = 0; g.player.vy = 0;
  g.player.inv.slots[5] = { id: kiteId, stack: 1 };
  g.cb?.onInventoryChanged?.();
  return {
    selected: g.player.inv.selected,
    heldId: g.player.inv.heldItem()?.id ?? -1,
    counter: g.player.afkCounterForKiting,
    kiteProjBefore: g.entities.projectiles.some((p) => p.projId === kp && !p.dead),
  };
}, KITE_ID, KITE_PROJ);

// 等落地静置（下落拍 vy≠0 → else 分支清零计数,写阈会被吃掉——BJ428 首跑实证）
for (let i = 0; i < 50; i++) {
  const st = await page.evaluate(() => {
    const g = window.__swGame;
    return { onGround: g.player.onGround, vx: g.player.vx, vy: g.player.vy, anim: g.player.itemAnimTicks };
  });
  if (st.onGround && Math.abs(st.vx) < 0.05 && Math.abs(st.vy) < 0.05 && st.anim === 0) break;
  await new Promise((r) => setTimeout(r, 200));
}
// 画布截图（canvas.toDataURL——世界运行在无角色绑定流,DOM 覆层「选择玩家」不遮画布证据）
const shot = async (path) => {
  const data = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('canvas')].sort((a, b) => (b.width * b.height) - (a.width * a.height));
    return cs[0].toDataURL('image/png');
  });
  writeFileSync(path, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
};
await shot('docs/evidence/bj428/afk-before.png');

// 静置后置 3590 → 自然步进十余拍过阈（实驱 fixedUpdate 步进链,非直写 3600）。
// ★注：本仓 afkCounterForKiting 每 tick 由 stepAfkCounter(afkCounter) 镜像重算
// （两计数同一 if/else 同值,Player.cs:25697/:25702 同相）——只写 ForKiting 会被
// 下拍覆写,须写源头 afkCounter。
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.vx = 0; g.player.vy = 0;
  g.player.afkCounter = 3590;
  g.player.afkCounterForKiting = 3590;
});
let obs = null;
for (let i = 0; i < 80; i++) {
  await new Promise((r) => setTimeout(r, 250));
  obs = await page.evaluate((kiteId, kp) => {
    const g = window.__swGame;
    return {
      selected: g.player.inv.selected,
      heldId: g.player.inv.heldItem()?.id ?? -1,
      counter: g.player.afkCounterForKiting,
      kiteProj: g.entities.projectiles.filter((p) => p.projId === kp && !p.dead).length,
      useTime: g.player.useTime,
      itemAnimTicks: g.player.itemAnimTicks,
      onGround: g.player.onGround,
    };
  }, KITE_ID, KITE_PROJ);
  if (obs.kiteProj > 0) break;
}
// 等线放长后留证（首拍 ai0=0 → 线长逐拍升至 250,弹稳挂在玩家上空）
await new Promise((r) => setTimeout(r, 2000));
obs = await page.evaluate((kiteId, kp) => {
  const g = window.__swGame;
  const k = g.entities.projectiles.find((p) => p.projId === kp && !p.dead);
  return {
    selected: g.player.inv.selected,
    heldId: g.player.inv.heldItem()?.id ?? -1,
    counter: g.player.afkCounterForKiting,
    kiteProj: g.entities.projectiles.filter((p) => p.projId === kp && !p.dead).length,
    kiteAliveMs: k ? k.constructor.name : 'gone',
    kitePos: k ? { x: Math.round(k.cx), y: Math.round(k.cy), ai0: k.ai0 } : null,
    playerPos: { x: Math.round(g.player.cx), y: Math.round(g.player.cy) },
  };
}, KITE_ID, KITE_PROJ);
await shot('docs/evidence/bj428/afk-after.png');
const verdict = {
  pre,
  obs,
  launched: !!obs && obs.kiteProj > 0,
  equipped: !!obs && obs.selected === 5 && obs.heldId === KITE_ID,
};
console.log('BJ428_VERDICT ' + JSON.stringify(verdict));
await browser.close();
process.exit(verdict.launched && verdict.equipped ? 0 : 2);
