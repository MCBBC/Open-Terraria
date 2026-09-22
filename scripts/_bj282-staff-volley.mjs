// ★BJ282 多弹面实机探针——点名两件（2188 毒液/1308 剧毒）+ 普查五件发射实机弹数断言。
// 私有 vite 习语：SW_PORT=52xx / SW_NO_HMR=1 / 独立 SW_CACHE；经 run-diag 裸跑亦可。
// 用法：SW_ORIGIN=http://localhost:5231 node scripts/_bj282-staff-volley.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000,
});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5231', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const items = window.__swItems ?? {};
  const snapIds = () => new Set(g.entities.projectiles.map((e) => e));
  // 单击一次；逐拍快照累计【新出现】的目标弹型实体（按实体身份去重，死亡即删
  //  的池不能等冷却走完再数——弹寿命可短于冷却窗=零计数伪影,首轮探针已踩）
  const fireOnce = (itemId, projId, maxWait = 120) => {
    p.mana = 300; p.maxMana = 300;
    const cam = g.camera;
    const [sx, sy] = cam.worldToScreen(p.cx + 6 * 16, p.cy - 8);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    const seen = snapIds();
    const fresh = new Set();
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    for (let t = 0; t < maxWait; t++) {
      for (const e of g.entities.projectiles) {
        if (!seen.has(e) && e.projId === projId) { fresh.add(e); seen.add(e); }
      }
      g.fixedUpdate(1 / 60);
      if (t > 6 && g.player.useTime <= 0 && fresh.size > 0) break;
    }
    return fresh.size;
  };
  const run = (key, projId, clicks) => {
    const itemId = items[key];
    if (itemId === undefined) return { err: 'key-missing:' + key };
    p.inv.slots[0] = { id: itemId, stack: 1 };
    p.inv.selected = 0;
    g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);   // 换手稳定拍（selectedItemState 缓冲闸同相）
    const counts = [];
    for (let c = 0; c < clicks; c++) counts.push(fireOnce(itemId, projId));
    const min = Math.min(...counts), max = Math.max(...counts);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    return { key, projId, counts, min, max, mean: Math.round(mean * 100) / 100 };
  };
  // ---- 点名两件 + 普查件（每件 12 击）----
  const venom = run('vi_2188_VenomStaff', 355, 12);      // 期望 4..7,均值≈4.78
  const toxic = run('vi_1308_PoisonStaff', 265, 12);     // 期望 3..4,均值≈3.33
  const bat = run('vi_1801_BatScepter', 316, 12);        // 期望 2..3,均值≈2.5
  const pine = run('vi_1930_Razorpine', 336, 12);        // 期望 2..4,均值≈3.0
  const knives = run('vi_1569_VampireKnives', 304, 12);  // 期望 4..8,均值≈4.94
  // 1931：单击=1 对（2 发）;按住 90t 窗模型 → ≈9 窗×2 对=18 发,耗蓝≈9×9=81（窗）;
  // per-cast 回退 → 耗蓝 2 倍。记录两值判别。
  const blzKey = 'vi_1931_BlizzardStaff';
  const blzId = items[blzKey];
  p.inv.slots[0] = { id: blzId, stack: 1 }; p.inv.selected = 0;
  p.mana = p.maxMana;
  const blzSingle = fireOnce(blzId, 337);                // 期望 2
  p.mana = 300; p.maxMana = 300;
  const blzMana0 = p.mana;
  {
    const cam = g.camera;
    const [sx, sy] = cam.worldToScreen(p.cx + 6 * 16, p.cy - 8);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    g.input.mouseDown = true; g.input.mouseHeld = true;
  }
  let blzHold = 0;
  const blzBefore = snapIds();
  for (let t = 0; t < 90; t++) {
    g.fixedUpdate(1 / 60);
    if (t === 0) g.input.mouseDown = false;
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  for (const e of g.entities.projectiles) if (!blzBefore.has(e) && e.projId === 337) blzHold++;
  const blzManaSpent = blzMana0 - p.mana;
  // ---- 1156 食人鱼枪（既有支复核）：首发 3 → 满员 0 → 清场再 3 ----
  const pir = run('vi_1156_PiranhaGun', 190, 1);
  const pirAlive = g.entities.projectiles.filter((e) => e.projId === 190 && !e.dead).length;
  const pirSecond = fireOnce(items['vi_1156_PiranhaGun'], 190);   // 满员 → 期望 0
  for (const e of g.entities.projectiles) if (e.projId === 190) e.dead = true;
  const pirThird = fireOnce(items['vi_1156_PiranhaGun'], 190);    // 清场 → 期望 3
  return {
    venom, toxic, bat, pine, knives,
    blizzard: { single: blzSingle, hold90t: blzHold, manaSpent: blzManaSpent },
    piranha: { first: pir.counts, aliveAfterFirst: pirAlive, second: pirSecond, third: pirThird },
  };
});
console.log(JSON.stringify(out, null, 1));
console.log('[probe] pageerrors', pageErrors.length ? pageErrors.slice(0, 3) : 'none');
await browser.close().catch(() => {});
process.exit(0);
