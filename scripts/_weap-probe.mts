// vi_* 数据驱动武器 E2E 冒烟：进世界后给各族武器各点一次，验证投射物生成
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 120000 });
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

  const ITEM_BY_KEY = await import('/src/data/items.ts').then((m: any) => m.ITEM_BY_KEY);
  const fire = async (key: string, holdTicks = 0) => {
    const id = ITEM_BY_KEY[key];
    if (id === undefined) return { missing: true };
    const inv = game.player.inv;
    inv.slots[inv.selected] = { id, stack: 10 };
    const before = game.entities.projectiles.length;
    game.input.mouseDown = true;
    game.input.mouseX = game.renderer.canvas.width / 2 + 100;
    game.input.mouseY = game.renderer.canvas.height / 2;
    for (let i = 0; i < (holdTicks || 5); i++) {
      await new Promise((r) => setTimeout(r, 16));
    }
    if (!holdTicks) game.input.mouseDown = false;
    await new Promise((r) => setTimeout(r, 400));
    const after = game.entities.projectiles;
    game.input.mouseDown = false;
    return {
      spawned: after.length > before || after.some((p: any) => p.projId !== undefined && (p as any).vx !== 0),
      projTypes: after.slice(-3).map((p: any) => p.constructor.name + ':' + (p.projId ?? '?')),
      mana: game.player.mana,
      stackLeft: inv.slots[inv.selected]?.stack,
    };
  };
  res.boomerang = await fire('vi_55_enchanted_boomerang');
  res.spear = await fire('vi_274_spear');
  res.yoyo = await fire('vi_3278', 40); // 木悠悠球，按住 40 tick
  game.input.mouseDown = false;
  await new Promise((r) => setTimeout(r, 500));
  res.grenade = await fire('vi_166_grenade');
  res.staff = await fire('vi_739_amethyst_staff');
  res.sword = await fire('vi_4_iron_shortsword');
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
