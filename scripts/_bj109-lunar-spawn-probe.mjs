// BJ109-A 一次性探针 v2:修正落位（玩家放塔旁真实地表,非浮岛）
//  场景 A:自然事件态 + 玩家站日耀塔正下方偏移 6 格的地表 40s(8s 采样)
//  场景 B:F6 高空直召(事件不激活=BJ107 原场景) + 玩家站地面 30s
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5207';
const LUNAR_IDS = [402, 405, 406, 407, 409, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 423, 424, 425, 426, 427, 428, 429, 518, 519];

async function boot(browser, tag) {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/?play=small&' + tag + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let ok = false;
  for (let i = 0; i < 90 && !ok; i++) {
    ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
    if (!ok) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ok) throw new Error(tag + ' 未进游戏');
  await new Promise((r) => setTimeout(r, 1200));
  await page.evaluate(() => {
    const g = window.__swGame;
    const vs = g.vanillaSpawner ?? (g.vanillaSpawner = g.makeVanillaSpawner(g.world));
    window.__funnel = { trySpawn: 0, spawn: 0, findTile: 0, findTileOk: 0, anNpc: 0, npcCalls: [], returned: [] };
    const gp = Object.getPrototypeOf(g);
    if (gp.trySpawnEnemy && !gp.__bj109wrapped) {
      gp.__bj109wrapped = true;
      const ot = gp.trySpawnEnemy;
      gp.trySpawnEnemy = function () { window.__funnel.trySpawn++; return ot.apply(this, arguments); };
    }
    if (!vs.__bj109wrapped) {
      vs.__bj109wrapped = true;
      const os = vs.spawn.bind(vs);
      vs.spawn = function (px, py, rng, vw, vh) {
        window.__funnel.spawn++;
        const r = os(px, py, rng, vw, vh);
        window.__funnel.returned.push(r ? (r.vanillaId ?? r.def?.npc ?? -1) : null);
        return r;
      };
      const of_ = vs.findSpawnTile.bind(vs);
      vs.findSpawnTile = function (rng, vw, vh) {
        window.__funnel.findTile++;
        const r = of_(rng, vw, vh);
        if (r) window.__funnel.findTileOk++;
        return r;
      };
      const oa = vs.spawnAnNPC.bind(vs);
      vs.spawnAnNPC = function (rng) { window.__funnel.anNpc++; return oa(rng); };
      const on = vs.spawnNPC.bind(vs);
      vs.spawnNPC = function (x, y, netId, rng) {
        const r = on.apply(vs, arguments);
        window.__funnel.npcCalls.push({ id: netId, ok: !!r });
        return r;
      };
    }
  });
  return { page, errors };
}

async function sample(page, label) {
  return page.evaluate((label) => {
    const g = window.__swGame;
    const f = window.__funnel;
    const byId = {};
    for (const L of [402, 405, 406, 407, 409, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 423, 424, 425, 426, 427, 428, 429, 518, 519]) byId[L] = 0;
    for (const e of g.entities.enemies) {
      if (!e.dead && e.vanillaId != null && byId[e.vanillaId] !== undefined) byId[e.vanillaId]++;
    }
    const towers = [];
    for (const e of g.entities.enemies) {
      if (!e.dead && [517, 422, 507, 493].includes(e.vanillaId)) {
        towers.push({ id: e.vanillaId, cy: Math.round(e.cy), ai1: +e.ai1.toFixed(0) });
      }
    }
    const p = g.player;
    const tw = towers.find((t) => t.id === 517);
    const towerEnt = [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === 517);
    return {
      label,
      day: g.world.clock.isDay,
      active: g.world.lunarEvent.active,
      zone: g.vanillaSpawner.lunar ? { ...g.vanillaSpawner.lunar.zone } : null,
      player: { cx: Math.round(p.cx), cy: Math.round(p.cy) },
      tower517: tw ?? null,
      gateY: towerEnt ? Math.round(p.y - towerEnt.y) : null,
      gateDist: towerEnt ? Math.round(Math.hypot(p.cx - towerEnt.cx, p.cy - towerEnt.cy)) : null,
      minions: byId,
      total: Object.values(byId).reduce((s, n) => s + n, 0),
      funnel: { trySpawn: f.trySpawn, spawn: f.spawn, findOk: f.findTileOk + '/' + f.findTile, anNpc: f.anNpc, ret: f.returned.slice(-14), calls: f.npcCalls.slice(-14) },
    };
  }, label);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });

// ================= 场景 A =================
{
  const { page, errors } = await boot(browser, 'bj109a');
  const geo = await page.evaluate(() => {
    const g = window.__swGame;
    g.triggerLunarApocalypse();
    const st = g.world.store;
    const tower = [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === 517);
    if (!tower) return null;
    const tcol = Math.floor(tower.cx / 16);
    // 塔列 ±8 格内从【塔底往下】找第一块真实地表（3 格净空）→ 玩家站塔旁地面
    for (let dx = 0; dx <= 8; dx++) {
      for (const x of [tcol + dx, tcol - dx]) {
        if (x < 10 || x >= st.w - 10) continue;
        for (let y = Math.floor(tower.cy / 16); y < st.h - 60; y++) {
          if (st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)
            && st.isSolid(x, y + 1) && st.isSolid(x, y + 2)) {
            g.player.x = x * 16 - g.player.w / 2;
            g.player.y = (y - 3) * 16 - g.player.h;
            g.player.vy = 0;
            return { x, groundY: y, towerTopPx: tower.y, towerCyPx: Math.round(tower.cy) };
          }
        }
      }
    }
    return null;
  });
  console.log('===A 落位===', JSON.stringify(geo));
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    console.log(JSON.stringify(await sample(page, 'A-' + (i + 1))));
  }
  console.log('A errors:', errors.slice(0, 3));
  await page.close();
}

// ================= 场景 B:F6 高空直召 =================
{
  const { page, errors } = await boot(browser, 'bj109b');
  const geo = await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    let placed = null;
    for (let x = Math.floor(st.w / 2) - 30; x < Math.floor(st.w / 2) + 30 && !placed; x++) {
      for (let y = 60; y < st.h - 60; y++) {
        if (st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)) {
          g.player.x = x * 16 - g.player.w / 2;
          g.player.y = (y - 3) * 16 - g.player.h;
          g.player.vy = 0;
          placed = { x, y: y - 3 };
          break;
        }
      }
    }
    // F6 直召 517 于玩家头顶 800px（=BJ107 场景,事件不激活）
    g.debugSpawnNpc(517, 1, false);
    const tower = [...g.entities.enemies].reverse().find((e) => !e.dead && e.vanillaId === 517);
    if (tower) { tower.x = g.player.cx - tower.w / 2; tower.y = g.player.cy - 800 - tower.h / 2; }
    return { placed, tower: tower ? { y: Math.round(tower.y) } : null, lunarActive: g.world.lunarEvent.active };
  });
  console.log('===B 落位===', JSON.stringify(geo));
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    console.log(JSON.stringify(await sample(page, 'B-' + (i + 1))));
  }
  console.log('B errors:', errors.slice(0, 3));
  await page.close();
}
await browser.close();
