// BJ109-C 四柱小怪族实机探针（抽样 3 代表 + 新落刀面实录）:
//   A 召塔自然刷怪普查(25s × 5 采样,四柱事件态)
//   B 415 火蜥蜴喷火实录(生 516×3) + 516 耀斑渐隐/追踪/自爆
//   C 428 幼虫羽化→427 + 426 死亡分裂 3×428(新落刀面)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5208';

async function boot(browser, tag) {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/?play=small&bj109c' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let ok = false;
  for (let i = 0; i < 90 && !ok; i++) {
    ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
    if (!ok) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ok) throw new Error(tag + ' 未进游戏');
  await new Promise((r) => setTimeout(r, 1200));
  return { page, errors };
}

function census(page, label) {
  return page.evaluate((label) => {
    const g = window.__swGame;
    const IDS = [402, 405, 406, 407, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 423, 424, 425, 426, 427, 428, 429, 516, 518, 519];
    const byId = {};
    for (const e of g.entities.enemies) {
      if (!e.dead || e.vanillaId == null) continue;
      if (IDS.includes(e.vanillaId)) byId[e.vanillaId] = (byId[e.vanillaId] ?? 0) + 1;
    }
    const towers = [...g.entities.enemies].filter((e) => !e.dead && [517, 422, 507, 493].includes(e.vanillaId))
      .map((e) => e.vanillaId);
    return { label, towers, byId, event: g.world.lunarEvent?.active ?? null };
  }, label);
}

// 把玩家放到 X 列地表,返回落点
async function placeAtGround(page, tx) {
  return page.evaluate((tx) => {
    const g = window.__swGame;
    const st = g.world.store;
    for (let y = 40; y < st.h - 40; y++) {
      if (st.isSolid(tx, y) && !st.isSolid(tx, y - 1) && !st.isSolid(tx, y - 2) && !st.isSolid(tx, y - 3)) {
        g.player.x = tx * 16 - g.player.w / 2;
        g.player.y = (y - 3) * 16 - g.player.h;
        g.player.vy = 0;
        return { tx, ty: y - 3 };
      }
    }
    return null;
  }, tx);
}

async function spawnNpc(page, netId, px, py) {
  return page.evaluate((netId, px, py) => {
    const g = window.__swGame;
    const vs = g.vanillaSpawner ?? (g.vanillaSpawner = g.makeVanillaSpawner(g.world));
    const rng = { next: () => Math.random(), int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)) };
    const e = vs.spawnNPC(px, py, netId, rng);
    if (!e) return null;
    e.id = g.entities.nextId++;            // 直召不入桶:Game.trySpawnEnemy 负责入桶,此处自补
    g.entities.enemies.push(e);
    return { vanillaId: e.vanillaId, id: e.id };
  }, netId, px, py);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });

// ================= A:召塔自然刷怪普查 =================
{
  const { page, errors } = await boot(browser, 'bj109cA');
  const placed = await page.evaluate(() => {
    const g = window.__swGame;
    g.triggerLunarApocalypse();
    return true;
  });
  console.log('A 触发事件:', placed);
  await new Promise((r) => setTimeout(r, 2000));
  const tower = await page.evaluate(() => {
    const g = window.__swGame;
    const t = [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === 517);
    return t ? Math.floor(t.cx / 16) : null;
  });
  console.log('A 日耀塔列:', tower, '落位:', await placeAtGround(page, (tower ?? 100) + 8));
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    console.log(JSON.stringify(await census(page, 'A-' + (i + 1))));
  }
  console.log('A errors:', errors.slice(0, 3));
  await page.close();
}

// ================= B:415 喷火 + 516 耀斑实录 =================
{
  const { page, errors } = await boot(browser, 'bj109cB');
  const spot = await placeAtGround(page, 110);
  console.log('B 落位:', spot);
  console.log('B 415 召:', await spawnNpc(page, 415, (spot.tx + 5) * 16, spot.ty * 16));
  await new Promise((r) => setTimeout(r, 6000));
  console.log(JSON.stringify(await page.evaluate(() => {
    const g = window.__swGame;
    const ids = (t) => [...g.entities.enemies].filter((e) => !e.dead && e.vanillaId === t)
      .map((e) => ({ cx: Math.round(e.cx), cy: Math.round(e.cy), ai2: e.ai2 }));
    return { drako: ids(415), flares: ids(516) };
  })));
  console.log('B 516 召(近玩家):', await spawnNpc(page, 516, (spot.tx + 2) * 16, (spot.ty - 2) * 16));
  await new Promise((r) => setTimeout(r, 2500));
  console.log(JSON.stringify(await page.evaluate(() => {
    const g = window.__swGame;
    return { flaresAfter: [...g.entities.enemies].filter((e) => !e.dead && e.vanillaId === 516).length,
      dead516Seen: (window.__bj109cDead516 = (window.__bj109cDead516 ?? 0)) };
  })));
  console.log('B errors:', errors.slice(0, 3));
  await page.close();
}

// ================= C:428 羽化 + 426 死亡分裂实录 =================
{
  const { page, errors } = await boot(browser, 'bj109cC');
  const spot = await placeAtGround(page, 100);
  console.log('C 落位:', spot);
  const larva = await spawnNpc(page, 428, (spot.tx + 3) * 16, (spot.ty - 1) * 16);
  console.log('C 428 召:', larva);
  await page.evaluate(() => {
    const g = window.__swGame;
    const l = [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === 428);
    if (l) { l.lai0 = 299; }               // 直调龄计数到阈值
  });
  await new Promise((r) => setTimeout(r, 2000));
  console.log(JSON.stringify(await page.evaluate(() => {
    const g = window.__swGame;
    const ids = (t) => [...g.entities.enemies].filter((e) => !e.dead && e.vanillaId === t).length;
    return { n428: ids(428), n427: ids(427), n426: ids(426) };
  })));
  // 426 死亡分裂
  const queen = await spawnNpc(page, 426, (spot.tx + 6) * 16, (spot.ty - 2) * 16);
  console.log('C 426 召:', queen);
  await page.evaluate(() => {
    const g = window.__swGame;
    const q = [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === 426);
    if (q) { q.iframes = 0; q.hp = 0; q.hurt(9999, 0, 0, g); }
  });
  await new Promise((r) => setTimeout(r, 1500));
  console.log(JSON.stringify(await page.evaluate(() => {
    const g = window.__swGame;
    const ids = (t) => [...g.entities.enemies].filter((e) => !e.dead && e.vanillaId === t).length;
    return { n428: ids(428), n427: ids(427), n426: ids(426) };
  })));
  console.log('C errors:', errors.slice(0, 3));
  await page.close();
}

await browser.close();
console.log('BJ109-C probe done');
