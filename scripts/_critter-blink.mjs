// 萤火虫/蝴蝶"怪力按压闪现"抓现行探针：逐 tick 采样 critters/enemies 位置，
// 检测单帧位移 >24px 的瞬移事件，记录实体构造名/vanillaId/aiStyle/前后速度/onGround。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:5199'}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const T = 16;
  const st = g.world.store;
  // 玩家钉在地表开阔处（白天,蝴蝶会自然刷;再直接点名造萤火虫/蝴蝶）
  const ptx = Math.floor(g.player.cx / T);
  let gy = 4;
  while (gy < st.h - 10 && !st.isSolid(ptx, gy)) gy++;
  // 清出一片开阔地
  for (let dx = -30; dx <= 30; dx++) for (let dy = -8; dy <= 0; dy++) st.setTile(ptx + dx, gy + dy, 0);
  g.player.x = ptx * T; g.player.y = (gy - 4) * T;
  g.player.vx = 0; g.player.vy = 0;
  g.world.clock.isDay = true;
  // 点名生成（走 debugSpawnNpc = Enemy 路径）+ 环境自然刷（本地 Critter 路径）
  for (let i = 0; i < 4; i++) g.debugSpawnNpc(356, (ptx - 8 + i * 5) * T, (gy - 6) * T, false);  // 蝴蝶
  for (let i = 0; i < 4; i++) g.debugSpawnNpc(355, (ptx - 8 + i * 5) * T, (gy - 6) * T, false);  // 萤火虫
  const track = new Map();   // id → {x,y,info}
  const events = [];
  const collect = () => {
    const list = [];
    for (const b of ['critters', 'enemies']) {
      for (const ent of g.entities[b]) {
        const e = ent;
        if (e.dead) continue;
        const isFly = e.vanillaId === 355 || e.vanillaId === 356 || e.vanillaId === 444
          || (e.def && (e.def.key === 'butterfly' || e.def.key === 'firefly' || e.def.key === 'gold_butterfly'));
        if (!isFly) continue;
        list.push(e);
      }
    }
    return list;
  };
  for (let t = 0; t < 1800; t++) {
    g.player.x = ptx * T; g.player.y = (gy - 4) * T; g.player.vx = 0; g.player.vy = 0;
    g.fixedUpdate(1 / 60);
    for (const e of collect()) {
      const prev = track.get(e.id);
      if (prev) {
        const jump = Math.hypot(e.x - prev.x, e.y - prev.y);
        if (jump > 24) {
          events.push({
            t, id: e.id, cls: e.constructor.name, vid: e.vanillaId ?? null,
            key: e.def?.key ?? null, jump: Math.round(jump),
            dy: Math.round(e.y - prev.y),
            vyBefore: +prev.vy.toFixed(2), vyAfter: +e.vy.toFixed(2),
            onGround: !!e.onGround, x: Math.round(e.x / T - ptx), y: Math.round(e.y / T - gy),
          });
          if (events.length > 40) break;
        }
      }
      track.set(e.id, { x: e.x, y: e.y, vy: e.vy });
    }
    if (events.length > 40) break;
  }
  return { events, tracked: track.size, ptx, gy };
});
console.log(JSON.stringify(out, null, 1).slice(0, 3000));
console.log('tracked:', out.tracked, '| events:', out.events.length);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
