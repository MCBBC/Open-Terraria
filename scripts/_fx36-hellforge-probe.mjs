// SW-FX36 探针：摆地狱熔炉 → 合成列表含熔炉系配方（钴锭/铅锭/钨锭/玻璃）
// 跑法：SW_ORIGIN=http://localhost:5234 node tools/run-diag.mjs scripts/_fx36-hellforge-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text().slice(0, 200)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store, ui = window.__swUI;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const raf = (n) => new Promise((res) => { const s = () => { if (--n <= 0) res(); else requestAnimationFrame(s); }; requestAnimationFrame(s); });
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  // ITEM_DEFS 索引即内部 item id；vi_<vanillaId>_<Name> 键反查
  const idOfVid = (vid) => { const i = ITEM_DEFS.findIndex((d) => d.key.startsWith('vi_' + vid + '_')); return i >= 0 ? i : undefined; };
  const keyOfVid = (vid) => ITEM_DEFS.find((d) => d.key.startsWith('vi_' + vid + '_'))?.key ?? ('vi_' + vid);

  const forge = TILE_BY_KEY['v_77_hellforge'];
  const floor = TILE_BY_KEY['stone'];
  // 玩家脚下清出平台，地狱熔炉(3×2)摆玩家左侧 2 格（reach 5×3 内）
  const px = Math.floor(p.x / 16), py = Math.floor((p.y + p.h) / 16);
  for (let x = px - 8; x <= px + 8; x++) {
    for (let y = py; y <= py + 4; y++) st.setTile(x, y, 0);
    st.setTile(x, py + 3, floor);
  }
  st.setTile(px - 4, py + 2, forge); st.setTile(px - 3, py + 2, forge); st.setTile(px - 2, py + 2, forge);
  st.setTile(px - 4, py + 1, forge); st.setTile(px - 3, py + 1, forge); st.setTile(px - 2, py + 1, forge);
  p.x = (px + 1) * 16; p.y = (py + 1) * 16 - p.h; p.vy = 0;   // 落回平台（熔炉旁）
  await raf(3); await wait(200);

  // 材料：钴矿364×3 / 铅矿700×3 / 钨矿701×4 / 沙169×2
  const inv = p.inv;
  const put = (slot, vid, n) => { const id = idOfVid(vid); if (id !== undefined) inv.slots[slot] = { id, stack: n }; };
  put(10, 364, 3); put(11, 700, 3); put(12, 701, 4); put(13, 169, 2);
  const granted = [364, 700, 701, 169].map((vid) => ({ vid, key: keyOfVid(vid), idx: idOfVid(vid), got: inv.slots[[10, 11, 12, 13][[364, 700, 701, 169].indexOf(vid)]]?.stack }));

  ui.openInventory();
  await raf(5); await wait(400);
  ui.refreshAll();
  await raf(10); await wait(300);

  const stations = [...g.vanillaNearbyStations()];
  const avail = g.vanillaAvailableRecipes();
  const hasVid = (vid) => avail.some((e) => e.r.create === vid);
  // 反向对照：把熔炉区清掉 → 熔炉系配方应从列表消失（邻接门仍有效）
  for (let x = px - 4; x <= px - 2; x++) { st.setTile(x, py + 2, 0); st.setTile(x, py + 1, 0); }
  ui.refreshAll(); await raf(5); await wait(200);
  const availNoForge = g.vanillaAvailableRecipes();
  return {
    forgeInternal: forge,
    nearHasForge: stations.includes(forge),
    nearStationsSample: stations.slice(0, 12),
    withForge: {
      cobaltBar381: hasVid(381), leadBar704: hasVid(704), tungstenBar705: hasVid(705), glass170: hasVid(170),
    },
    withoutForge: {
      cobaltBar381: availNoForge.some((e) => e.r.create === 381),
      glass170: availNoForge.some((e) => e.r.create === 170),
    },
    names: { cobalt: keyOfVid(381), glass: keyOfVid(170) },
    granted,
    uiAvailRef: ui.craftAvailRef?.length ?? null,
    pageVids: avail.slice(0, 6).map((e) => e.r.create),
  };
});
console.log(JSON.stringify(out, null, 1));
// 重摆回熔炉供截图（评估环境里已清掉——重新放一次再截）
await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const forge = TILE_BY_KEY['v_77_hellforge'];
  const px = Math.floor(p.x / 16), py = Math.floor((p.y + p.h) / 16);
  for (let x = px - 4; x <= px - 2; x++) { st.setTile(x, py + 2, forge); st.setTile(x, py + 1, forge); }
  const ui = window.__swUI;
  ui.refreshAll();
  await new Promise((r) => setTimeout(r, 600));
});
// 首启欢迎弹窗会盖住合成列表——点「我已知晓」关掉再截（WelcomeAnnounce.ts:58）
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')]
    .find((b) => (b.textContent || '').includes('我已知晓'));
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 800));
// vanilla 布局的合成窗 = vinvModernCraftEl（NewCraftingUI 等价）——强制开包+开窗后取条目池
const listInfo = await page.evaluate(() => {
  const ui = window.__swUI;
  ui.openInventory(true);
  if (!ui.vinvModernCraftOpen && typeof ui.vinvOpenModernCraft === 'function') ui.vinvOpenModernCraft(null, false);
  return new Promise((res) => setTimeout(() => {
    const win = ui.vinvModernCraftEl;
    const r = win ? win.getBoundingClientRect() : null;
    const entries = (ui.vinvModernEntries ?? []).map((e) => e.r.create);
    res({
      winOpen: !!ui.vinvModernCraftOpen,
      rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
      entryCount: entries.length,
      has: { cobaltBar381: entries.includes(381), leadBar704: entries.includes(704), tungstenBar705: entries.includes(705), glass170: entries.includes(170) },
      sample: entries.slice(0, 10),
    });
  }, 900));
});
console.log('CRAFT_WINDOW:', JSON.stringify(listInfo, null, 1));
await page.screenshot({ path: '/tmp/fx36-hellforge.png' });
if (listInfo && listInfo.rect && listInfo.rect.w > 0) {
  await page.screenshot({
    path: '/tmp/fx36-hellforge-list.png',
    clip: { x: Math.max(0, listInfo.rect.x - 6), y: Math.max(0, listInfo.rect.y - 6), width: Math.min(560, listInfo.rect.w + 12), height: Math.min(720, listInfo.rect.h + 12) },
  });
}
console.log('PAGE_ERRORS:', JSON.stringify(errs.slice(0, 5), null, 1));
await browser.close();
