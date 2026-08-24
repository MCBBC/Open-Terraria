// 僵尸嵌地复现:构造报告同款地形(slope1 坡 + 左侧 1 格悬崖下实心),
// 僵尸从左走向坡 → 观察是否嵌入实心格(盒与实心相交持续 N tick)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5311') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
const r = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!(window.__swGame?.player && window.__swGame.world && window.__swTiles)) {
    if (Date.now() - t0 > 120000) return { fatal: 'timeout' };
    await new Promise((res) => setTimeout(res, 300));
  }
  const g = window.__swGame;
  const st = g.world.store;
  const T = window.__swTiles;
  const dirt = T['dirt'] ?? Object.values(T)[0] ?? 1;
  // 找平地
  const px0 = Math.floor(st.w / 2);
  let gy = Math.floor(g.world.groundLevel) + 20;
  while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  // 报告地形 1:1(相对 gy=y259 行):
  //   y257: x508=74 x509=74
  //   y258: x508=60 slope1, x509=60
  //   y259: x507=60 x508=60 x509=60 x510=74 x511=60 x512=60
  //   y260: x508..511=60, x512=59
  //   y261+: 全实心
  for (let x = 500; x < 520; x++) for (let y = gy - 12; y < gy; y++) st.setTileSilent(x, y, 0);
  for (let x = 500; x < 520; x++) for (let y = gy; y < gy + 3; y++) st.setTileSilent(x, y, dirt);
  st.setTileSilent(508, gy - 2, T['stone_rock'] ?? dirt);
  st.setTileSilent(509, gy - 2, T['stone_rock'] ?? dirt);
  st.setTileSilent(508, gy - 1, dirt); st.setSlope(508, gy - 1, 1);
  st.setTileSilent(509, gy - 1, dirt);
  st.setTileSilent(508, gy - 2, T['stone_rock'] ?? dirt);   // ★坡格上方压实心(报告同款:坡被顶盖)
  st.setTileSilent(507, gy - 1, dirt);   // (507,259)=60
  st.setTileSilent(510, gy - 1, T['stone_rock'] ?? dirt);
  st.setTileSilent(511, gy - 1, dirt); st.setTileSilent(512, gy - 1, dirt);
  // 三相位测试:从坡顶右/坡顶左/正上方丢僵尸
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const results = [];
  const spawns = [
    ['from-right-top', 512 * 16, (gy - 4) * 16 - 20, -1],
    ['from-left', 502 * 16, (gy - 4) * 16 - 20, 1],
    ['from-above', 508 * 16, (gy - 10) * 16, 0],
  ];
  for (const [tag, sx, sy, dirForce] of spawns) {
    const z = Enemy.fromVanilla(3, sx, sy);
    if (!z) continue;
    z.id = g.entities.nextId++;
    if (dirForce) z.facing = dirForce;
    g.entities.enemies.push(z);
    let embedTicks = 0, maxEmbed = 0, firstAt = -1;
    const log = [];
    for (let t = 0; t < 900; t++) {
      g.fixedUpdate(1 / 60);
      const bx0 = Math.floor(z.x / 16), bx1 = Math.floor((z.x + z.w - 0.01) / 16);
      const by0 = Math.floor(z.y / 16), by1 = Math.floor((z.y + z.h - 0.01) / 16);
      let embed = 0;
      for (let x = bx0; x <= bx1; x++) for (let y = by0; y <= by1; y++) {
        if (st.inBounds(x, y) && st.isSolid(x, y) && st.slope[st.idx(x, y)] === 0 && !st.half[st.idx(x, y)]) embed++;
      }
      if (embed > 0) {
        embedTicks++;
        maxEmbed = Math.max(maxEmbed, embed);
        if (firstAt < 0) firstAt = t;
        if (log.length < 10 && (t - (firstAt < 0 ? t : firstAt)) < 8) log.push({ t, x: +z.x.toFixed(1), y: +z.y.toFixed(1), vx: +z.vx.toFixed(2), vy: +z.vy.toFixed(2), embed, onGround: z.onGround, hitWall: z.hitWall, hitHead: z.hitHead });
      }
    }
    results.push({ tag, embedTicks, maxEmbed, firstAt, log: log.slice(0, 4) });
    z.dead = true;
  }
  return { results, gy };
}, { timeout: 300000 });
console.log(JSON.stringify(r));
await browser.close();
