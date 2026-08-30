// 空枪干放翻转回归：无弹药点右 → 原版应转身(facing=1)+useStyle5 持举姿势、
// 无弹无声；有弹药对照 → 同样转身+射出向右弹。复现用户报障(2026-08-31)。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const txt = readFileSync(process.env.BULB_MAP, 'utf8');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await page.goto('' + ORIGIN + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
try {
  await page.waitForSelector('.sw-title-menu', { timeout: 60000 });
} catch {
  // 菜单未挂载 = 应用加载链可能被并行会话半成品炸掉：留证据后退出
  const diag = await page.evaluate(() => ({
    hasSplash: !!document.querySelector('#sw-splash'),
    bodyHead: document.body?.innerText?.slice(0, 200) ?? '',
    scripts: [...document.querySelectorAll('script[type=module]')].length,
  })).catch(() => ({ err: 'evaluate-fail' }));
  console.log('BOOT-DIAG:', JSON.stringify(diag));
  await browser.close();
  process.exit(2);
}
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 600));

const out = await page.evaluate(async (saveText) => {
  await window.__swLoadJson(saveText);
  await new Promise((r) => setTimeout(r, 1200));
  const g = window.__swGame;
  const p = g.player;
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  const gunId = ITEM_BY_KEY['vi_98_迷你鲨'];
  const ballId = ITEM_BY_KEY['vi_97_火枪子弹'];
  const swordId = ITEM_BY_KEY['vi_3507_copper_shortsword'];
  const blockId = ITEM_BY_KEY['vi_3_stone_block'] ?? ITEM_BY_KEY['vi_307_daybloom_seeds'];
  const give = (id, slot) => { if (id != null) p.inv.slots[slot] = { id, stack: 99 }; };
  // 清空所有弹药源（54-57 槽 + 背包内 bullet 类）
  for (let i = 0; i < p.inv.slots.length; i++) {
    const s = p.inv.slots[i];
    if (!s) continue;
    void s;
  }
  p.inv.slots.fill(null);
  give(gunId, 0);
  p.inv.selected = 0;
  const snapInput = () => {
    // 输入坐标 = canvas CSS px；把鼠标钉到玩家屏幕位右侧 300px
    const [sx] = g.camera.worldToScreen(p.cx, p.cy);
    return [sx + 300, Math.round(g.renderer.canvas.getBoundingClientRect().height / 2)];
  };
  const stage = async () => {
    p.facing = -1; p.vx = 0; p.useTime = 0;
    g.input.mouseHeld = false; g.input.mouseDown = false;
    const [mx, my] = snapInput();
    g.input.mouseX = mx; g.input.mouseY = my;
    await new Promise((r2) => setTimeout(r2, 60));
  };
  const fireClick = async () => {
    g.input.mouseDown = true;
    await new Promise((r2) => setTimeout(r2, 420));   // ≈25 帧：覆盖起手+useTime 窗
    g.input.mouseDown = false;
  };
  const projCount = () => g.entities.projectiles.filter((e) => !e.dead).length;
  let projBase = projCount();
  let ammoStackBefore = 0;
  const readState = () => ({
    facing: p.facing,
    useTime: p.useTime,
    swingAlive: !!g.swing || (p.useTime > 0),
    projsFired: Math.max(0, projCount() - projBase),
    ammoLeft54: p.inv.slots[54]?.stack ?? null,
  });
  const armSample = () => { projBase = projCount(); ammoStackBefore = p.inv.slots[54]?.stack ?? 0; };
  // ── 场景 A：无弹药 ──
  await stage(); armSample();
  await fireClick();
  const dry = readState();
  // ── 场景 B'：按住不松,横扫光标左→右→左,朝向应实时跟随(loaded autoReuse) ──
  const ballSlot2 = ballId != null ? 54 : -1;
  if (ballSlot2 >= 0) give(ballId, ballSlot2);
  p.useTime = 0;
  await stage();
  g.input.mouseDown = true; g.input.mouseHeld = true;
  const sweepFacing = [];
  for (const side of [-1, 1, -1]) {
    const [sx0] = g.camera.worldToScreen(p.cx, p.cy);
    g.input.mouseX = sx0 + side * 300;
    await new Promise((r2) => setTimeout(r2, 140));
    sweepFacing.push(p.facing);
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const sweepOk = sweepFacing[0] === -1 && sweepFacing[1] === 1 && sweepFacing[2] === -1;
  void sweepOk;

  // ── 场景 C2：非连发件按住横扫（铜短剑,swing 锁窗后仍应跟随）──
  p.inv.slots.fill(null);
  give(swordId ?? ITEM_BY_KEY['vi_3507_copper_shortsword'], 0);
  if (swordId == null) { /* 找不到键位也不崩 */ }
  p.inv.selected = 0;
  p.useTime = 0;
  await stage();
  g.input.mouseDown = true; g.input.mouseHeld = true;
  const swordSweep = [];
  for (const side of [1, -1]) {
    const [sx0] = g.camera.worldToScreen(p.cx, p.cy);
    g.input.mouseX = sx0 + side * 300;
    await new Promise((r2) => setTimeout(r2, 260));   // 越过单次挥窗
    swordSweep.push(p.facing);
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const swordSweepOk = swordSweep[0] === 1 && swordSweep[1] === -1;
  void swordSweepOk;

  // ── 场景 B：给火枪弹（放 54 弹药槽） ──
  const ballSlot = ballId != null ? 54 : -1;
  if (ballSlot >= 0) give(ballId, ballSlot);
  p.useTime = 0;
  await stage(); armSample();
  await fireClick();
  const loaded = readState();
  loaded.ammoConsumed = ammoStackBefore - (p.inv.slots[54]?.stack ?? 0);
  // ── 场景 C/D：同类异常排查——近战剑 & 可放置块（站定朝左,点右侧应同样翻转）──
  const findKey = (pred) => (Object.keys(window.__swITEMS ?? {}).length, null);
  void findKey;
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const pick = (pred) => {
    for (const d of ITEM_DEFS) {
      if (!d) continue;
      try { if (pred(d)) return d; } catch { /* skip */ }
    }
    return null;
  };
  // 近战剑：清弹药避免走远程支
  p.inv.slots.fill(null);
  give(swordId, 0);
  if (swordId == null) { /* 找不到键位也不崩 */ }
  p.inv.selected = 0;
  p.useTime = 0;
  await stage();
  await fireClick();
  const melee = readState();
  // 可放置块：同姿势放置尝试
  p.inv.slots.fill(null);
  give(blockId, 0);
  if (blockId == null) { /* 同上 */ }
  p.inv.selected = 0;
  p.useTime = 0;
  await stage();
  await fireClick();
  const place = readState();
  return {
    gunIdOk: gunId != null, ballIdOk: ballId != null,
    dry, loaded, melee, place,
    sweepFacing, swordSweep,
  };
}, txt);
out.pageErrors = errs.slice(0, 3);
console.log(JSON.stringify(out, null, 2));
const okDry = out.dry.facing === 1;                                    // 干放必须翻向右侧
const okLoaded = out.loaded.facing === 1 && (out.loaded.ammoConsumed ?? 0) >= 1; // 有弹照常射击耗弹
const okMelee = out.melee.facing === 1;                                // 近战站定点右必须翻向
const okPlace = out.place.facing === 1;                                // 放置同规
const okSweep = out.sweepFacing?.length === 3 && out.sweepFacing[0] === -1
  && out.sweepFacing[1] === 1 && out.sweepFacing[2] === -1;
const okSwordSweep = out.swordSweep?.length === 2 && out.swordSweep[0] === 1
  && out.swordSweep[1] === -1;
const allOk = okDry && okLoaded && okMelee && okPlace && okSweep && okSwordSweep;
console.log(`PASS ${allOk ? '✓' : '✗'}`
  + ` dry=${okDry} loaded=${okLoaded} melee=${okMelee} place=${okPlace}`
  + ` sweep=${okSweep}(${(out.sweepFacing ?? []).join(',')})`
  + ` swordSweep=${okSwordSweep}(${(out.swordSweep ?? []).join(',')})`);
await browser.close();
process.exit(allOk ? 0 : 1);
