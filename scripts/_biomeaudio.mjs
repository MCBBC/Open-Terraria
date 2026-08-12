// 群系 BGM + 世界背景验证：传送到各群系/深度 → 断言 scene zone / bgStyle / ugStyle / 曲目 id
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 180000 });
// 垫片 select 出现需等主菜单挂载（HMR 重载会废掉 waitForSelector 的 context，手动轮询）
for (let i = 0; i < 60; i++) {
  const has = await page.evaluate(() => !!document.querySelector('select')).catch(() => false);
  if (has) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const KEY = {};
  tiles.TILE_DEFS.forEach((d, i) => { if (d) KEY[d.key] = i; });
  const idx = (x, y) => st.idx(x, y);

  // 找某类 tile 的近地表位置（扫 400 列 × 地表下 60 行）
  const findBiome = (pred) => {
    for (let x = 200; x < st.w - 200; x += 3) {
      for (let y = Math.floor(g.world.groundLevel) - 10; y < g.world.groundLevel + 60; y++) {
        if (st.flags[idx(x, y)] && pred(st.type[idx(x, y)], st.wall[idx(x, y)])) return [x, y - 8];
      }
    }
    return null;
  };
  const isJungle = (t) => t === KEY['mud'] || t === KEY['v_60_jungle_grass'];
  const isSnow = (t) => t === KEY['snow'] || t === KEY['v_147_snow_block'] || t === KEY['v_161_snow_brick'];
  const isSand = (t) => t === KEY['sand'] || t === KEY['v_396_sandstone_fossils'] || t === KEY['v_404_hardened_sand_block'];

  /** 传送到 (tx,ty) 并等待场景采样+淡入稳定 */
  const visit = async (x, y, settleMs = 2600) => {
    g.player.x = x * 16 + 8; g.player.y = y * 16;
    g.camera.x = g.player.x; g.camera.y = g.player.y;
    await new Promise((r) => setTimeout(r, settleMs));
    return {
      scene: {
        zoneJungle: g.scene.zoneJungle, zoneSnow: g.scene.zoneSnow, zoneDesert: g.scene.zoneDesert,
        zoneBeach: g.scene.zoneBeach, zoneCorrupt: g.scene.zoneCorrupt, zoneUnderworldHeight: g.scene.zoneUnderworldHeight,
        tileY: g.scene.tileY,
      },
      bgStyle: g.renderer.biomeBg.bgStyle,
      ugStyle: g.renderer.biomeBg.ugStyle,
      music: window.__swAudio ? window.__swAudio.curMusic : null,
    };
  };

  const res = {};
  // 1) 出生点（森林地表）
  res.spawn = await visit(g.world.spawnX, g.world.spawnY - 4);
  // 2) 丛林
  const j = findBiome(isJungle);
  res.jungle = j ? await visit(j[0], j[1]) : { skip: true };
  // 3) 雪原
  const sn = findBiome(isSnow);
  res.snow = sn ? await visit(sn[0], sn[1]) : { skip: true };
  // 4) 沙漠
  const sd = findBiome(isSand);
  res.desert = sd ? await visit(sd[0], sd[1]) : { skip: true };
  // 5) 海洋（最左沙滩）
  res.ocean = await visit(Math.floor(st.w * 0.03), Math.floor(g.world.groundLevel) + 6);
  // 6) 地下岩石层
  res.underground = await visit(g.world.spawnX, g.world.rockLevel + 120);
  // 7) 地狱
  res.hell = await visit(g.world.spawnX, st.h - 100);

  // 8) 地下天空遮挡采样：地下时屏幕顶部不再是天空渐变蓝
  g.player.x = g.world.spawnX * 16; g.player.y = (g.world.rockLevel + 120) * 16;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  await new Promise((r) => setTimeout(r, 1200));
  const px = g.renderer.ctx.getImageData(640, 20, 1, 1).data;
  res.ugSkyHidden = { r: px[0], g: px[1], b: px[2] };
  return res;
});
console.log(JSON.stringify(out, null, 1));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
const s = out.spawn, mus = (o) => o.music;
check('森林出生点：bgStyle 森林段(0/10/11/12)', [0, 10, 11, 12].includes(s.bgStyle), `bgStyle=${s.bgStyle} music=${mus(s)}`);
check('森林出生点：白昼森林曲(1/18/46)', [1, 18, 46].includes(mus(s)), `music=${mus(s)}`);
if (!out.jungle.skip) check('丛林：zoneJungle + bgStyle=3 + 丛林曲(7/55)', out.jungle.scene.zoneJungle && out.jungle.bgStyle === 3 && [7, 55].includes(mus(out.jungle)), JSON.stringify(out.jungle));
if (!out.snow.skip) check('雪原：zoneSnow + bgStyle=7 + 雪曲(14/20)', out.snow.scene.zoneSnow && out.snow.bgStyle === 7 && [14, 20].includes(mus(out.snow)), JSON.stringify(out.snow));
if (!out.desert.skip) check('沙漠：zoneDesert + bgStyle=2 + 沙漠曲(21)', out.desert.scene.zoneDesert && out.desert.bgStyle === 2 && mus(out.desert) === 21, JSON.stringify(out.desert));
check('海洋：zoneBeach + 海洋曲(22/43/46/47)', out.ocean.scene.zoneBeach && [22, 43, 46, 47].includes(mus(out.ocean)), JSON.stringify(out.ocean));
check('地下：泥土/岩石分层背景(ugStyle≥3)', out.underground.ugStyle >= 3, JSON.stringify(out.underground));
check('地下：天空被背景遮住（顶部非天空蓝）', out.ugSkyHidden.b < 180, JSON.stringify(out.ugSkyHidden));
check('地狱：zoneUnderworldHeight + 地狱曲(36)', out.hell.scene.zoneUnderworldHeight && mus(out.hell) === 36, JSON.stringify(out.hell));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
