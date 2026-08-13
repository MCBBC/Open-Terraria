// 血肉墙墙身渲染探针:实体层之前画 WallOfFlesh 墙身 + 肌腱链 + 舌头。
// 断言:113 在场 → 生成 2 眼(114)+11 饥饿者(115);墙列区域出现大片非天空像素;
// 截图人工核对层序(嘴/眼精灵压在墙身之上)。经 tools/run-diag.mjs 运行。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
let r = null;
for (let att = 0; att < 12 && r === null; att++) {
  try {
    await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    r = await page.evaluate(() => new Promise((res, rej) => {
      const t0 = Date.now();
      const iv = setInterval(async () => {
        if (window.__swGame?.player) {
          clearInterval(iv);
          try {
            const g = window.__swGame;
            const boss = await import('/src/entities/bossAI.ts');
            const { BuffType } = await import('/src/stats/Buffs.ts');
            const out = {};
            // 玩家右侧 400px 生成墙(墙向玩家推进;direction 由 vx==0 首帧按玩家侧定向)
            const head = boss.spawnVanillaEnemy(g, 113, Math.round(g.player.x) + 400, Math.round(g.player.y));
            out.headSpawned = !!head;
            if (!head) { res(out); return; }
            out.headBox = [head.x, head.y, head.w, head.h];
            // 舌头:玩家上狂卷之舌 buff(:37818 门 tongued)
            g.player.buffs.apply(BuffType.TheTongue, 10);
            out.tongued = g.player.buffs.has(BuffType.TheTongue);
            // 等 60 tick:部件生成 + draw area 平滑起步
            await new Promise((r2) => setTimeout(r2, 1500));
            const ents = g.entities.all();
            out.eyes = ents.filter((e) => e.vanillaId === 114 && !e.dead).length;
            out.hungry = ents.filter((e) => e.vanillaId === 115 && !e.dead).length;
            const h2 = ents.find((e) => e.vanillaId === 113);
            out.headStillAlive = !!(h2 && !h2.dead);
            out.headPos = h2 ? [Math.round(h2.x), Math.round(h2.y), h2.facing] : null;
            // 相机跟玩家,墙应在屏内(屏宽 1280/1.25 ≈ 1024 世界 px,墙距 400px)
            await new Promise((r3) => setTimeout(r3, 1500));
            res(out);
          } catch (e) { rej(String(e && e.message || e)); }
        } else if (Date.now() - t0 > 120000) {
          clearInterval(iv); rej('boot timeout');
        }
      }, 200);
    }));
  } catch (e) { console.log(`attempt ${att} failed: ${e}`); r = null; }
}
if (!r) { console.log('PROBE FAILED: no result'); await browser.close(); process.exit(1); }
// 截图:墙推进中(嘴/眼/饥饿者 + 墙身同屏)
await new Promise((r2) => setTimeout(r2, 2500));
await page.screenshot({ path: '/tmp/wof-body-1.png' });
// 像素断言:墙列(头 x 附近 190px 宽)中段应有大量非透明/非天空像素(墙身贴图覆盖)
const pix = await page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const g = window.__swGame;
  const head = g.entities.all().find((e) => e.vanillaId === 113 && !e.dead);
  if (!head) return { err: 'head gone' };
  const cam = g.camera ?? g.cam;
  const z = cam ? cam.zoom : 1.25;
  const viewW = cv.width, viewH = cv.height;
  // 世界 → 屏幕:屏心 + (世界-相机)×z
  const sx = Math.round(viewW / 2 + (head.x - (cam ? cam.x : head.x)) * z);
  const sy = Math.round(viewH / 2 + (head.cy - (cam ? cam.y : head.cy)) * z);
  const ctx = cv.getContext('2d');
  const x0 = Math.max(0, sx - 10), w = Math.min(190, cv.width - x0);
  const y0 = Math.max(0, sy - 200), h = Math.min(400, cv.height - y0);
  if (w <= 0 || h <= 0) return { err: 'region offscreen', sx, sy };
  const data = ctx.getImageData(x0, y0, w, h).data;
  let flesh = 0, total = 0, sumR = 0, sumG = 0, sumB = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 10) continue;
    total++;
    const rr = data[i], gg = data[i + 1], bb = data[i + 2];
    sumR += rr; sumG += gg; sumB += bb;
    // 肉墙贴图是红棕暗色:R 明显大于 B 且偏暗
    if (rr > bb + 15 && rr < 200) flesh++;
  }
  return {
    sx, sy, zoom: z, total,
    flesh, fleshPct: total ? Math.round((flesh / total) * 100) : 0,
    avgRGB: total ? [Math.round(sumR / total), Math.round(sumG / total), Math.round(sumB / total)] : null,
  };
});
console.log(JSON.stringify({ ...r, pix }, null, 2));
await browser.close();
