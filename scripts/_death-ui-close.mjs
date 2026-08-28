// 死亡收 UI 链验证（Main.cs:46433-46443 dead ⇒ playerInventory=false ⇒ chest=-1）：
//   开箱面板 → 击杀玩家 → 泵帧 → 断言箱面板引用清空 + 背包 UI 收起（inventoryOpen=false）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 200)));
const B = process.env.T || 'http://localhost:5201';
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 180000 });
await page.evaluate(async (b) => {
  const t = await (await fetch(b + '/_deadman-world.sbw.json')).text();
  await window.__swFlow.loadJson(t);
}, B);
await page.waitForFunction(() => !!window.__swGame && !!window.__swUI, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const raf = (n) => new Promise((res) => { const st = () => { if (--n <= 0) res(); else requestAnimationFrame(st); }; requestAnimationFrame(st); });
  g.player.debugGod = false;
  // 找任意真实箱子开面板
  const chest = g.world.chests.find((c) => c.items && c.items.some(Boolean));
  if (!chest) return { fail: 'no chest' };
  g.player.x = (chest.x + 2) * 16; g.player.y = (chest.y - 1) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.tryOpenChest(chest);
  const panelOpen0 = !!g.openChestRef?.();
  const invOpen0 = !!ui.inventoryOpen;
  // 击杀（走真实 damagePlayer 死亡链）
  g.player.iframes = 0;
  g.damagePlayer(99999, g.player.cx, g.player.cy - 40);
  for (let k = 0; k < 6; k++) { g.fixedUpdate(1 / 60); g.postUpdate(); await new Promise((r) => setTimeout(r, 12)); }
  return {
    panelOpen0, invOpen0,
    dead: g.player.dead,
    panelAfter: !!g.openChestRef?.(),
    invAfter: !!ui.inventoryOpen,
  };
});
console.log(JSON.stringify(out));
await browser.close();
process.exit(out && out.dead && out.panelOpen0 && !out.panelAfter && !out.invAfter ? 0 : 1);
