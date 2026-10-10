// ★BJ601 像素差分探针 v2——地下暗室（光照≈0）掉落物光罩 on/off 对拍：
//   物品本体被乘光压黑、光罩自发光逃逸（flushItemGlow）→ ON 帧独有亮斑。
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj601-item-glowmask-pixel-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const r = g.renderer;
  const defs = await import('/src/data/items.ts');
  const lava = Object.values(defs.ITEM_DEFS).find((d) => d && d.vid === 3253);
  if (!lava) return { fail: 'no-lava-def' };
  const st = g.world.store;
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // 暗室：地下 60 格挖 9×6 空腔 + 玩家传送进去（光照≈0 → 物品乘光近黑、光罩逃逸恒亮）
  const tx = Math.floor(g.player.cx / 16);
  const ty = Math.floor(g.player.cy / 16) + 60;
  for (let dy = -3; dy <= 2; dy++) for (let dx = -4; dx <= 4; dx++) {
    st.setTile(tx + dx, ty + dy, 0);
    st.liquid[st.idx(tx + dx, ty + dy)] = 0;
  }
  g.player.x = tx * 16 + 8 - g.player.w / 2;
  g.player.y = ty * 16 - g.player.h + 8;
  g.player.vx = 0; g.player.vy = 0;
  await sleep(900);

  const drop = g.spawnDrop(g.player.cx, g.player.cy + 12, lava.key, 1);
  if (drop) { drop.vx = 0; drop.vy = 0; drop.x = g.player.cx; drop.y = g.player.cy + 12; drop.noGrabDelay = 600; }
  const snap = () => {
    const c = g.renderer.canvas ?? document.querySelector('canvas');
    const ctx = c.getContext('2d');
    const cx = Math.floor(c.width / 2), cy = Math.floor(c.height / 2);
    return ctx.getImageData(cx - 64, cy - 64, 128, 128).data;
  };
  const origCollect = r.collectDropItemGlow.bind(r);
  r.collectDropItemGlow = () => {};          // glow OFF
  await sleep(500);
  const offData = snap();
  r.collectDropItemGlow = origCollect;       // glow ON
  await sleep(500);
  const onData = snap();
  let diffPx = 0, sumOff = 0, sumOn = 0, maxGain = 0;
  for (let i = 0; i < offData.length; i += 4) {
    const lo = offData[i] + offData[i + 1] + offData[i + 2];
    const ln = onData[i] + onData[i + 1] + onData[i + 2];
    sumOff += lo; sumOn += ln;
    if (ln - lo > 24) { diffPx++; maxGain = Math.max(maxGain, ln - lo); }
  }
  return { diffPx, maxGain, meanOff: sumOff / (offData.length / 4), meanOn: sumOn / (onData.length / 4),
    dropAlive: !!(drop && !drop.dead), lightAt: g.renderer.lighting ? g.renderer.lighting.lightAt(tx, ty) : null };
});
console.log(JSON.stringify({ out, errs }, null, 1));
await browser.close();
