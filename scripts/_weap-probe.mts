// vi_* 数据驱动武器 E2E 冒烟：进世界后给各族武器各点一次，验证投射物生成
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 120000 });
// HMR 全页重载窗口（数据 JSON 变更会触发）：等稳定后再进页面
await new Promise((r) => setTimeout(r, 3000));
try { await page.evaluate(() => 1); } catch { await new Promise((r) => setTimeout(r, 5000)); }

const out = await page.evaluate(async () => {
  const res: Record<string, unknown> = {};
  // 生成小世界
  const g = await (window as any).__swGameReady;
  void g;
  const sel = document.querySelector('select');
  if (sel) { sel.selectedIndex = 0; (sel.parentElement!.querySelector('button') as HTMLButtonElement).click(); }
  const t0 = Date.now();
  while (!(window as any).__swGame?.world && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  const game = (window as any).__swGame;
  if (!game?.world) { res.err = 'world not ready'; return res; }
  res.worldReadyMs = Date.now() - t0;

  const itemsMod = await (new Function('return import("/src/data/items.ts")')() as Promise<any>);
  const ITEM_BY_KEY = itemsMod.ITEM_BY_KEY;
  const ITEM_DEFS = itemsMod.ITEM_DEFS;
  // 按 vid 反查 key（slug 命名不稳定）
  const keyByVid = (vid: number): string | null => {
    const d = ITEM_DEFS.find((x: any) => x.vid === vid || (/^vi_(\d+)_/.exec(x.key)?.[1] | 0) === vid);
    return d ? d.key : null;
  };
  const fire = async (vid: number, holdTicks = 0) => {
    const key = keyByVid(vid);
    if (!key) return { missing: true, vid };
    const id = ITEM_BY_KEY[key];
    if (id === undefined) return { missing: true, key };
    const inv = game.player.inv;
    inv.slots[inv.selected] = { id, stack: 10 };
    const seen = new Set<string>();
    const sample = () => {
      for (const p of game.entities.projectiles) seen.add(p.constructor.name + ':' + (p.projId ?? '?'));
    };
    game.input.mouseDown = true;
    game.input.mouseX = game.renderer.canvas.width / 2 + 100;
    game.input.mouseY = game.renderer.canvas.height / 2;
    const total = holdTicks || 5;
    for (let i = 0; i < total + 10; i++) {
      game.input.mouseDown = true; // 模拟物理按住（游戏侧掷出会消费一次 mouseDown）
      await new Promise((r) => setTimeout(r, 16));
      if (i >= total - 2) sample(); // 覆盖按住窗口与紧邻帧（短命投射物别漏采）
    }
    game.input.mouseDown = false;
    await new Promise((r) => setTimeout(r, 400));
    sample();
    return {
      key,
      seenTypes: [...seen],
      mana: game.player.mana,
      stackLeft: inv.slots[inv.selected]?.stack,
    };
  };
  res.boomerang = await fire(55);
  res.spear = await fire(274);
  res.yoyo = await fire(3278, 40); // 木悠悠球，按住 40 tick
  game.input.mouseDown = false;
  await new Promise((r) => setTimeout(r, 500));
  res.grenade = await fire(166);
  res.staff = await fire(739);
  res.sword = await fire(4);
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
