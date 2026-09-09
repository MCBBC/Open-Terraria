// SW-BJ46 快速堆叠实机探针：debug-save 载入 → 注入 place_v/普通物品箱与背包 →
// 逐例跑 g.quickStackAllChests('quick') 账目对拍原版直算（QuickStacking.cs:406-461）。
// 用法：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj46-quickstack.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
  protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto(ORIGIN, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });

// 拆步：新世界单独一步（★loadJson 的 json 源在读档链在途重构中暂断=worldGen.worker
// saveParse 只消费 req.key→「存档数据缺失」——SW-BJ46 探针绕行走 newWorld 桥,
// 勿在探针里修读档链）
await page.evaluate(async () => {
  await window.__swFlow.newWorld('424242', 4200, 1200);
});
await page.waitForFunction(() => !!window.__swGame, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  if (!g) return { error: '__swGame 缺失' };
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  const led = { exports: { quickStackAllChests: typeof g.quickStackAllChests }, cases: [] };
  const cobweb = ITEM_BY_KEY['place_v_51_cobweb'];
  const cloud = ITEM_BY_KEY['place_v_189_cloud_block'];
  const torch = ITEM_BY_KEY['vi_8_Torch'];
  const wood = ITEM_BY_KEY['vi_9_Wood'];
  led.ids = { cobweb, cloud, torch, wood };
  if (typeof g.quickStackAllChests !== 'function') return led;

  const p = g.player;
  const origChests = g.world.chests;
  const px = p.x, py = p.y;
  const wait = () => new Promise((r) => setTimeout(r, 300));   // 12t 锁窗

  const runCase = async (name, chests, invSetup, expectFn) => {
    g.world.chests = chests;
    for (let i = 0; i < p.inv.slots.length; i++) p.inv.slots[i] = null;
    invSetup();
    await wait();
    g.quickStackAllChests('quick');
    await wait();
    const snap = (arr) => arr.map((s) => (s ? { id: s.id, stack: s.stack, prefix: s.prefix ?? 0, favorited: !!s.favorited } : null));
    const got = { chests: chests.map((c) => snap(c.items)), inv: snap(p.inv.slots) };
    let ok = true, why = '';
    try { expectFn(got); } catch (e) { ok = false; why = String(e && e.message || e).slice(0, 160); }
    led.cases.push({ name, ok, why });
  };

  const chestAt = (dx, items) => ({ x: Math.floor(px / 16) + dx, y: Math.floor(py / 16), items });

  // 1 实报主场景：箱有 cobweb（place_v）,玩家 cloud（place_v 异物）→ 零转移
  await runCase('A1 无同物箱不收（place_v 异物）',
    [chestAt(6, [{ id: cobweb, stack: 200 }, ...Array(19).fill(null)])],
    () => { p.inv.slots[10] = { id: cloud, stack: 50 }; },
    (g2) => {
      if (g2.chests[0][0].stack !== 200) throw new Error('箱 cobweb 被动 ' + g2.chests[0][0].stack);
      const c = g2.inv[10]; if (!c || c.id !== cloud || c.stack !== 50) throw new Error('cloud 未留包 ' + JSON.stringify(c));
    });

  // 2 同物 place_v → 正常并叠
  await runCase('A2 箱有同物（place_v 同物）并叠',
    [chestAt(6, [{ id: cobweb, stack: 200 }, ...Array(19).fill(null)])],
    () => { p.inv.slots[10] = { id: cobweb, stack: 50 }; },
    (g2) => {
      if (g2.chests[0][0].stack !== 250) throw new Error('并叠错 ' + g2.chests[0][0].stack);
      if (g2.inv[10] !== null) throw new Error('源格未清');
    });

  // 3 vid 域异物不互入
  await runCase('A3 vid 域异物不入（火把箱 vs 木）',
    [chestAt(6, [{ id: torch, stack: 10 }, ...Array(19).fill(null)])],
    () => { p.inv.slots[10] = { id: wood, stack: 999 }; },
    (g2) => {
      if (g2.chests[0][0].stack !== 10) throw new Error('箱被动');
      if (!g2.inv[10] || g2.inv[10].stack !== 999) throw new Error('wood 未留包');
    });

  // 4 同名异前缀：不并叠 → 整件入空格（QuickStacking.cs:500/508 → :423-431）
  await runCase('B1 异前缀整件入空格',
    [chestAt(6, [{ id: torch, stack: 100, prefix: 0 }, ...Array(19).fill(null)])],
    () => { p.inv.slots[10] = { id: torch, stack: 30, prefix: 3 }; },
    (g2) => {
      if (g2.chests[0][0].stack !== 100 || g2.chests[0][0].prefix !== 0) throw new Error('互融了');
      const s = g2.chests[0][1];
      if (!s || s.id !== torch || s.stack !== 30 || s.prefix !== 3) throw new Error('空格直送缺失 ' + JSON.stringify(s));
      if (g2.inv[10] !== null) throw new Error('源格未清');
    });

  // 5 满堆：直送空格
  await runCase('B2 满堆整件入空格',
    [chestAt(6, [{ id: torch, stack: 9999 }, ...Array(19).fill(null)])],
    () => { p.inv.slots[10] = { id: torch, stack: 50 }; },
    (g2) => {
      if (g2.chests[0][0].stack !== 9999) throw new Error('满叠被动');
      const s = g2.chests[0][1];
      if (!s || s.stack !== 50) throw new Error('满堆直送缺失 ' + JSON.stringify(s));
    });

  // 6 收藏豁免 + 热栏豁免
  await runCase('B3 收藏/热栏豁免',
    [chestAt(6, [{ id: torch, stack: 10 }, ...Array(19).fill(null)])],
    () => { p.inv.slots[3] = { id: torch, stack: 9 }; p.inv.slots[11] = { id: torch, stack: 5, favorited: true }; },
    (g2) => {
      if (g2.chests[0][0].stack !== 10) throw new Error('豁免失效');
      if (!g2.inv[3] || g2.inv[3].stack !== 9) throw new Error('热栏件被卷入');
      if (!g2.inv[11] || g2.inv[11].stack !== 5) throw new Error('收藏件被卷入');
    });

  // 7 多箱邻域：唯含同物箱收货
  await runCase('B4 多箱邻域唯同物箱收',
    [chestAt(6, [{ id: torch, stack: 10 }, ...Array(19).fill(null)]),
     chestAt(10, [{ id: cobweb, stack: 5 }, ...Array(19).fill(null)])],
    () => { p.inv.slots[10] = { id: cobweb, stack: 40 }; p.inv.slots[11] = { id: wood, stack: 7 }; },
    (g2) => {
      if (g2.chests[0][0].stack !== 10) throw new Error('A 箱误收');
      if (g2.chests[1][0].stack !== 45) throw new Error('B 箱未收 ' + g2.chests[1][0].stack);
      if (!g2.inv[11] || g2.inv[11].stack !== 7) throw new Error('wood 未留包');
    });

  g.world.chests = origChests;
  p.x = px; p.y = py;
  return led;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
