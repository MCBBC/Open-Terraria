// 原版素材批次总验证：新世界生成 + 新图块存在 + 图标可取 + 帧率 + 渲染无品红
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
await page.type('input', 'vanilla-final');
await page.evaluate(() => document.querySelector('select').selectedIndex = 0);
const t0 = Date.now();
await page.click('button');
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.liquid; }, {timeout: 300000});
const loadMs = Date.now() - t0;
await new Promise(r => setTimeout(r, 2500));
const out = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store, atlas = g.autotiler.atlas;
  const BK = g.tileByKey;
  // 1) 新图块在世界中的存在性统计
  const count = (id) => { let n = 0; for (let i = 0; i < st.type.length; i++) if (st.type[i] === id) n++; return n; };
  const presence = {
    snow: count(23),
    alt_ore: count(BK['ore_tin']) + count(BK['ore_lead']) + count(BK['ore_tungsten']) + count(BK['ore_platinum']),
    gems: ['gem_sapphire','gem_ruby','gem_emerald','gem_topaz','gem_amethyst','gem_diamond'].reduce((s, k) => s + count(BK[k]), 0),
    clay_silt: count(BK['clay']) + count(BK['silt']),
    ice: count(BK['ice']),
    sandstone: count(BK['sandstone']) + count(BK['hardened_sand']),
  };
  // 2) 图标抽验（vicon 非 null）
  const icons = ['tin_ore','ruby','ice_block','table','candle','grandfather_clock','platinum_bar']
    .filter((k) => !!atlas.vicon({ tin_ore: 699, ruby: 178, ice_block: 664, table: 32, candle: 105, grandfather_clock: 359, platinum_bar: 706 }[k]));
  // 3) 帧率（5 秒）
  return { presence, iconOk: icons.length, tileTotal: Object.keys(BK).length };
});
const fps = await page.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  const cnt = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(cnt); else res(Math.round(n / 5)); };
  requestAnimationFrame(cnt);
}));
await page.screenshot({path: '/tmp/vanilla-final.png'});
console.log(JSON.stringify({ loadMs, out, fps, errs: errs.slice(0,5) }, null, 1));
await browser.close();
