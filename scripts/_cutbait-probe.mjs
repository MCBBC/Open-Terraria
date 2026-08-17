// 割草 DropBait E2E 探针（WorldGen.cs:66304-66480 1:1 验收）:
//   1. 装饰组 185 帧带（frameY0+fx<214）镐破坏 40 次 → 蚯蚓族出生 ≥3（1/6 掷）
//   2. cap：累计 ≤5（CountNPCS<5）
//   3. 出生姿势:背玩家水平弹速 + 上抛 vy∈[-5.0,-2.1]
//   4. 蝎/鸟族走 spawner——此处只验割草链
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  // 找玩家头顶空旷 3×3 区(地表上方),放置 185 装饰格(frameY 0,frameX 0——帧带内)
  const px = Math.floor(g.player.cx / 16);
  let py = Math.floor((g.player.y + g.player.h) / 16) - 1;   // 脚上一格
  while (py > 4 && st.type[st.idx(px, py)] !== 0) py--;
  return { px, py };
});
// tiles 模块在页面内取 TILE_BY_KEY
const tileId = await page.evaluate(async () => {
  const mod = await import('/src/data/tiles.ts');
  return mod.TILE_BY_KEY['v_185_small_decos'];
});
console.log('tileId(v_185)=', tileId, 'pos=', JSON.stringify(out));
const res = await page.evaluate(async (tid, px, py) => {
  const g = window.__swGame;
  const st = g.world.store;
  const before = g.entities.critters.length;
  const births = [];
  for (let k = 0; k < 40; k++) {
    st.setTile(px, py, tid, 0, 0);          // 重放装饰(frameY0/fx0 帧带内)
    g.breakTile(px, py, true);               // 185 非 tileCut——原版走镐破坏(KillTile 直达)
    for (const c of g.entities.critters) {
      if (!births.includes(c) && !c.dead && (c.vanillaId === 357 || c.vanillaId === 448)) {
        births.push({ vid: c.vanillaId, vx: +c.vx.toFixed(2), vy: +c.vy.toFixed(2), facing: c.facing, playerLeft: g.player.cx < c.cx });
      }
    }
  }
  return { before, count: births.length, births: births.slice(0, 6),
    wormsNow: g.entities.critters.filter((c) => !c.dead && (c.vanillaId === 357 || c.vanillaId === 448)).length };
}, tileId, out.px, out.py);
console.log(JSON.stringify(res, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('割装饰 40 次出生蚯蚓族 ≥3（1/6 掷）', res.count >= 3, `count=${res.count}`);
check('cap ≤5（CountNPCS<5）', res.wormsNow <= 5, `now=${res.wormsNow}`);
if (res.births.length) {
  const b = res.births[0];
  check('出生 vy ∈ [-5.0,-2.1]（Next(-50,-21)×0.1）', b.vy <= -2.05 && b.vy >= -5.05, `vy=${b.vy}`);
  check('水平弹速非零（背玩家弹开）', Math.abs(b.vx) > 0.01, `vx=${b.vx}`);
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
