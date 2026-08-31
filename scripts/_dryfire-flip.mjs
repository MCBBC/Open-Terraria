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
  window.__SAVE_TEXT__ = saveText;
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
  let dry, loaded, melee, place; const sweepFacing = []; const swordSweep = [];
  const fireClick = async (g) => {
    g.input.mouseDown = true;
    await new Promise((r) => setTimeout(r, 420));
    g.input.mouseDown = false;
  };
  const readState = (g, p) => ({
    facing: p.facing,
    useTime: p.useTime,
    swingAlive: !!g.swing || p.useTime > 0,
    projsAlive: g.entities.projectiles.filter((e) => !e.dead).length,
  });
  // 每场景独立冷加载（消除前一场景残留的存活弹/冷却窗串扰）
  const boot = async (items) => {
    await window.__swLoadJson(window.__SAVE_TEXT__);
    await new Promise((r) => setTimeout(r, 1100));
    const g = window.__swGame;
    const p = g.player;
    p.inv.slots.fill(null);
    for (const [key, slot] of items) {
      const id = ITEM_BY_KEY[key];
      if (id != null) p.inv.slots[slot] = { id, stack: 99 };
    }
    p.inv.selected = 0;
    return { g, p };
  };
  const makeStage = (g, p) => {
    return async () => {
      p.facing = -1; p.vx = 0; p.useTime = 0;
      g.input.mouseHeld = false; g.input.mouseDown = false;
      const [mx, my] = snapInput(g, p);
      g.input.mouseX = mx; g.input.mouseY = my;
      await new Promise((r2) => setTimeout(r2, 60));
    };
  };
  const snapInput = (g, p) => {
    const [sx] = g.camera.worldToScreen(p.cx, p.cy);
    void sx;
    const rect = g.renderer.canvas.getBoundingClientRect();
    const [sxCss] = (() => {
      const dprX = rect.width / g.renderer.canvas.width || 1;
      const [wx2, wy2] = g.camera.worldToScreen(p.cx, p.cy);
      // camera 返回设备像素 → 除 DPR 得 CSS px
      return [wx2 * dprX * (g.renderer.canvas.width / rect.width ? 1 : 1), wy2];
    })();
    void sxCss;
    // 直接用：鼠标坐标=canvas CSS px；camera.worldToScreen 输出同样 CSS 空间
    const [cxs, cys] = g.camera.worldToScreen(p.cx, p.cy);
    return [cxs + 300, cys];
  };

  // ── 场景 A：枪·无弹药 ──
  { const { g, p } = await boot([['vi_98_迷你鲨', 0]]); const stage = makeStage(g, p); p.useTime = 0; await stage(); await fireClick(g); dry = readState(g, p); }

  // ── 场景 B：枪·有弹 ──
  { const { g, p } = await boot([['vi_98_迷你鲨', 0], ['vi_97_火枪子弹', 54]]);
    const stage = makeStage(g, p); const before = p.inv.slots[54].stack;
    p.useTime = 0; await stage(); await fireClick(g);
    loaded = readState(g, p); loaded.ammoConsumed = before - (p.inv.slots[54]?.stack ?? 0); }

  // ── 场景 C：连发枪按住横扫 ──
  { const { g, p } = await boot([['vi_98_迷你鲨', 0], ['vi_97_火枪子弹', 54]]);
    const stage = makeStage(g, p); await stage();
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (const side of [-1, 1, -1]) {
      const [sx0] = g.camera.worldToScreen(p.cx, p.cy);
      g.input.mouseX = sx0 + side * 300;
      await new Promise((r2) => setTimeout(r2, 140));
      sweepFacing.push(p.facing);
    }
    g.input.mouseDown = false; g.input.mouseHeld = false; }

  // ── 场景 D：铜短剑起手翻向 + 按住横扫 ──
  { const { g, p } = await boot([['vi_3507_copper_shortsword', 0]]);
    const stage = makeStage(g, p); p.useTime = 0; await stage(); await fireClick(g);
    melee = readState(g, p);
    p.useTime = 0; await stage();
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (const side of [1, -1]) {
      const [sx0] = g.camera.worldToScreen(p.cx, p.cy);
      g.input.mouseX = sx0 + side * 300;
      await new Promise((r2) => setTimeout(r2, 260));
      swordSweep.push(p.facing);
    }
    g.input.mouseDown = false; g.input.mouseHeld = false; }

  // ── 场景 E：石块放置 ──
  { const { g, p } = await boot([['vi_3_stone_block', 0]]);
    const stage = makeStage(g, p); p.useTime = 0; await stage(); await fireClick(g);
    place = readState(g, p); }

  return { dry, loaded, place, sweepFacing, swordSweep, melee };

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
