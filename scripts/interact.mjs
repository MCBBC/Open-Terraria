// 交互链测试：挖泥土 → 拾取掉落 → 打开背包 → 合成火把(若有凝胶) → 放置
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || 'http://localhost:5199';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));

// 1) 挖脚下的方块：目标 = 玩家脚下一格
const target = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const tx = Math.floor(p.cx / 16);
  const ty = Math.floor((p.y + p.h + 4) / 16);
  const [sx, sy] = g.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8);
  return { sx, sy, tile: g.world.store.get(tx, ty), inv: g.player.inv.slots.filter(Boolean).length };
});
console.log('TARGET tile=', target.tile, 'at screen', target.sx | 0, target.sy | 0, ' inv items=', target.inv);

// 选中镐（快捷栏第 1 格）
await page.keyboard.press('Digit1');
await page.mouse.move(target.sx, target.sy);
await page.mouse.down();
await new Promise((r) => setTimeout(r, 2500));
await page.mouse.up();

const afterMine = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const inv = {};
  for (const s of p.inv.slots) if (s) inv[s.id] = (inv[s.id] || 0) + s.stack;
  return {
    drops: g.entities.drops.length,
    inv,
    selected: p.inv.selected,
    held: p.inv.heldItem(),
  };
});
console.log('AFTER MINE:', JSON.stringify(afterMine));

// 等掉落物被磁吸拾取
await new Promise((r) => setTimeout(r, 2500));
const afterPickup = await page.evaluate(() => {
  const g = window.__swGame;
  const inv = {};
  for (const s of g.player.inv.slots) if (s) inv[s.id] = (inv[s.id] || 0) + s.stack;
  return { drops: g.entities.drops.length, inv };
});
console.log('AFTER PICKUP:', JSON.stringify(afterPickup));

// 2) 打开背包（E）
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 400));
const invOpen = await page.evaluate(() => {
  const ui = document.querySelector('.sw-root');
  const panel = Array.from(ui.querySelectorAll('.sw-panel')).find((p) => p.style.display !== 'none');
  return { open: !!panel, recipes: ui.querySelectorAll('.sw-recipe').length, uiBlocking: window.__swGame.input.uiBlocking };
});
console.log('INVENTORY UI:', JSON.stringify(invOpen));
await page.keyboard.press('KeyE'); // 关闭

// 3) 砍树测试：找最近的树，切斧头(2)，砍 4 秒
const tree = await page.evaluate(() => {
  const g = window.__swGame;
  if (!g.world.trees.length) return null;
  // 传送到第一棵树旁（树下落的地面）
  const t = g.world.trees[0];
  const baseY = t.y + t.h + 1; // 树底地面
  g.player.x = (t.x - 1) * 16 + 8;
  g.player.y = (baseY - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
  const ty = t.y + Math.floor(t.h / 2);
  const [sx, sy] = g.camera.worldToScreen(t.x * 16 + 8, ty * 16 + 8);
  let n = 0;
  for (let i = 0; i < g.world.store.type.length; i++) if (g.world.store.type[i] === 8) n++;
  return { sx, sy, treeTilesBefore: n, at: [t.x, ty] };
});
if (tree) {
  await new Promise((r) => setTimeout(r, 800)); // 相机跟上
  // 传送后重新计算屏幕坐标
  const reTree = await page.evaluate((at) => {
    const g = window.__swGame;
    const [sx, sy] = g.camera.worldToScreen(at[0] * 16 + 8, at[1] * 16 + 8);
    const tile = g.world.store.get(at[0], at[1]);
    return { sx, sy, tile };
  }, tree.at);
  console.log('TREE TARGET tile=', reTree.tile, 'screen', reTree.sx | 0, reTree.sy | 0);
  await page.keyboard.down('Digit2'); await new Promise(r => setTimeout(r, 80)); await page.keyboard.up('Digit2');
  await page.mouse.move(reTree.sx, reTree.sy);
  await page.mouse.down();
  // 计时：树倒下需要多久（铜斧期望 ~0.8s，必须 > 0.5s 才算"多次砍击"）
  const chopMs = await page.evaluate((before) => new Promise((resolve) => {
    const g = window.__swGame;
    const t0 = performance.now();
    const t = setInterval(() => {
      let n = 0;
      for (let i = 0; i < g.world.store.type.length; i++) if (g.world.store.type[i] === 8) n++;
      if (n < before || performance.now() - t0 > 6000) {
        clearInterval(t);
        resolve(Math.round(performance.now() - t0));
      }
    }, 50);
  }), tree.treeTilesBefore);
  await page.mouse.up();
  console.log('CHOP_TIME_MS:', chopMs);
  if (chopMs < 500) errors.push('tree fell too fast: ' + chopMs + 'ms');
  const afterTree = await page.evaluate(() => {
    const g = window.__swGame;
    let n = 0;
    for (let i = 0; i < g.world.store.type.length; i++) if (g.world.store.type[i] === 8) n++;
    let wood = 0;
    for (const s of g.player.inv.slots) if (s && s.id === 2) wood += s.stack;
    return { treeTilesAfter: n, drops: g.entities.drops.length, wood };
  });
  console.log('AFTER TREE CHOP:', JSON.stringify({ ...afterTree, treeTilesBefore: tree.treeTilesBefore }));
} else {
  console.log('NO TREE NEARBY - skip chop test');
}
await page.keyboard.down('Digit1'); await new Promise(r => setTimeout(r, 80)); await page.keyboard.up('Digit1');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'NO ERRORS');
await browser.close();
