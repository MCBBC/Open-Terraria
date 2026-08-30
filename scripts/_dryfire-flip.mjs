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
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 600));

const out = await page.evaluate(async (saveText) => {
  await window.__swLoadJson(saveText);
  await new Promise((r) => setTimeout(r, 1200));
  const g = window.__swGame;
  const p = g.player;
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  const gunId = ITEM_BY_KEY['vi_98_迷你鲨'];
  const ballId = ITEM_BY_KEY['vi_97_火枪弹'];
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
  const readState = () => ({
    facing: p.facing,
    useTime: p.useTime,
    swingAlive: !!g.swing || (p.useTime > 0),
    projsR: [...g.entities.projectiles].filter((e) => e.ownerPlayer === p && e.vx > 1 && !e.dead).length,
    projsL: [...g.entities.projectiles].filter((e) => e.ownerPlayer === p && e.vx < -1 && !e.dead).length,
    projsTotal: [...g.entities.projectiles].filter((e) => e.ownerPlayer === p && !e.dead).length,
  });
  // ── 场景 A：无弹药 ──
  await stage();
  await fireClick();
  const dry = readState();
  // ── 场景 B：给火枪弹（放 54 弹药槽） ──
  const ballSlot = ballId != null ? 54 : -1;
  if (ballSlot >= 0) give(ballId, ballSlot);
  p.useTime = 0;
  await stage();
  await fireClick();
  const loaded = readState();
  return {
    gunIdOk: gunId != null, ballIdOk: ballId != null,
    dry, loaded,
    pageErrors: undefined,
  };
}, txt);
out.pageErrors = errs.slice(0, 3);
console.log(JSON.stringify(out, null, 2));
const okDry = out.dry.facing === 1;                       // 干放必须翻向右侧
const okLoaded = out.loaded.facing === 1 && out.loaded.projsR > 0;   // 有弹照常射击
console.log(`PASS ${okDry && okLoaded ? '✓' : '✗'}: dryFacing=${okDry} loadedShot=${okLoaded}`);
await browser.close();
process.exit(okDry && okLoaded ? 0 : 1);
