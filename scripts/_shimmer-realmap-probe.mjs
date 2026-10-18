// 真档 E2E：用户世界（Starter_World 存档）玻璃窑/篝火基地区域，烘焙确定性取证。
// 判据：含动画件的 chunk 在连续重烘中，【静态子区域】像素哈希是否随动画 tick 变化。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const MAP = needInput(join(DOWNLOADS, 'map-Starter_World (12).json'));
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5214', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp failed'); }
}
// 不建新角色——直接 loadJson 用户存档
const mapText = readFileSync(MAP, 'utf8');
const res = await page.evaluate(async (mapText) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(400);
  const flow = window;
  if (!flow.__swLoadJson) return { fail: 'no __swLoadJson' };
  await flow.__swLoadJson(mapText);
  // 等世界就绪
  for (let i = 0; i < 300 && !(window.__swGame?.world); i++) await wait(200);
  if (!window.__swGame?.world) return { fail: 'world not ready' };
  await wait(2000);
  return { ok: true };
}, mapText);
if (!res.ok) { console.log(JSON.stringify(res)); await browser.close(); process.exit(1); }

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // 瞬移到报告坐标：tile(3185,382)，镜头中心对齐；站定
  g.player.x = 3185 * 16 + 8 - g.player.w / 2;
  g.player.y = 381 * 16 + 8;
  g.player.vx = 0; g.player.vy = 0;
  for (let i = 0; i < 20; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  g.fullbright = true;
  // 邻域动画件清单
  const seen = new Map();
  for (let y = 370; y < 404; y++) for (let x = 3160; x < 3216; x++) {
    const i = st.idx(x, y), t = st.type[i];
    if (!t) continue;
    const d = window.__swTileDefs?.[t] ?? null;
    void d;
    seen.set(t, (seen.get(t) ?? 0) + 1);
  }
  // 动画 chunk 登记面（谁在驱动 churn）
  const cc = g.chunks;
  const animSheets = [...cc.animChunksBySheet.entries()].map(([s, set]) => [s, set.size]);
  const animWalls = [...(cc.animChunksByWall?.entries() ?? [])].map(([s, set]) => [s, set.size]);
  // 包 bakeChunkInto：记录每次烘焙 (cx,cy) 的 tile 层全 cell 哈希（局部坐标 stride=256）
  const proto = Object.getPrototypeOf(cc);
  const orig = proto.bakeChunkInto;
  const bakes = [];
  proto.bakeChunkInto = function (cx, cy, wallPage, tilePage, cell) {
    const pair = orig.call(this, cx, cy, wallPage, tilePage, cell);
    try {
      const tctx = tilePage.getContext('2d');
      const d = tctx.getImageData(pair.sx, pair.sy, 256, 256).data;
      let h = 0 | 0;
      for (let i = 0; i < d.length; i += 4) h = (h * 31 + (d[i] << 16 | d[i + 1] << 8 | d[i + 2])) | 0;
      const rec = { cx, cy, h };
      // 找出该 chunk 内动画格（登记表反查）：用 animChunksBySheet 判定本 chunk 是否动画成员
      rec.isAnim = false;
      for (const [, set] of cc.animChunksBySheet) if (set.has(cc.constructor.key(cx, cy))) { rec.isAnim = true; break; }
      bakes.push(rec);
    } catch (e) { bakes.push({ cx, cy, err: String(e && e.stack || e).slice(0, 160) }); }
    return pair;
  };
  await new Promise((r) => setTimeout(r, 8000));   // 静置 8s 收集 churn
  // 汇总：同 (cx,cy) 多次烘焙的哈希多样性；动画 chunk 与非动画 chunk 分开看
  const byChunk = new Map();
  for (const b of bakes) {
    if (b.err || b.h === undefined) continue;
    const k = `${b.cx},${b.cy}`;
    (byChunk.get(k) ?? byChunk.set(k, []).get(k)).push(b);
  }
  const summary = [];
  for (const [k, list] of byChunk) {
    if (list.length < 2) continue;
    const uniqH = [...new Set(list.map((x) => x.h))].length;
    summary.push({ chunk: k, bakes: list.length, uniqHashes: uniqH, isAnim: list[0].isAnim });
  }
  return {
    playerTile: [Math.floor(g.player.cx / 16), Math.floor(g.player.cy / 16)],
    animSheets, animWalls,
    bakeCount: bakes.length,
    errCount: bakes.filter((b) => b.err).length,
    errSample: bakes.filter((b) => b.err).slice(0, 2),
    multiBakeChunks: summary.sort((a, b) => b.bakes - a.bakes).slice(0, 14),
  };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/shimmer-realmap.png' });
await browser.close();
