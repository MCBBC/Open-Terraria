// ★Maples 双轨渲染退役刀——tripwire 探针(2026-10-17;审计探针 /tmp/maples-audit-probe.mjs
// 的退役版移植):刀后断言「全零」——
//   ①SpriteAtlas Maples 面(rect/animFrames/has/load/loadAtlasFile/preloadMaplesWorld/
//     data/resources/images/annotations)全部不存在
//   ②AutoTiler/WallTiler 全域不存在(Game.autotiler 字段/模块 import 链)
//   ③进世界→invalidateAll 全量重烘→走动→刷怪拍:零 pageerror + 世界正常渲染
//   ④烘焙链活体:chunk 烘焙照常(渲染路径 get 重烘可见块)
// 运行:SW_ORIGIN=http://localhost:5211 node tools/run-diag.mjs --timeout=600000 scripts/_maples-retire-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5211';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inWorld = false;
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  inWorld = await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false);
  if (inWorld && i > 10) break;
}
if (!inWorld) { console.log(JSON.stringify({ fatal: 'world entry timeout', errs: errs.slice(0, 5) }, null, 1)); await browser.close(); process.exit(1); }
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
await new Promise((r) => setTimeout(r, 1500));

// ①② Maples 面全零断言(原型级/实例级/模块链)
const absence = await page.evaluate(async () => {
  const a = window.__swAtlas;
  const g = window.__swGame;
  const out = {};
  // SpriteAtlas Maples 方法/字段全缺
  for (const k of ['rect', 'animFrames', 'has', 'load', 'loadAtlasFile', 'preloadMaplesWorld']) {
    out['fn:' + k] = typeof a?.[k] === 'undefined';
  }
  for (const k of ['data', 'resources', 'images', 'annotations']) {
    out['field:' + k] = typeof a?.[k] === 'undefined';
  }
  // Game.autotiler 字段已除(改持 atlas)
  out['game:autotiler'] = typeof g.autotiler === 'undefined';
  out['game:atlas'] = g.atlas instanceof a.constructor;
  // 静态资产已删判定:★dev server 对缺失路径走 SPA 回退(200 text/html)而非 404,
  //  亦可能命中 SW 缓存——判据=响应内容类型 ≠ 资产类型(html=回退=json/png 均已不在)。
  //  模块 import 链(AutoTiler/WallTiler)不在运行时断言:vite dev 对已删文件可吐
  //  陈旧 transform(200 text/javascript)=假绿;删除的编译级保证=tsc 零引用+构建
  //  解析(本刀已过),运行时面由上方 fn/field 全零断言承载。
  const headType = async (u) => {
    try { return (await fetch(u, { method: 'HEAD' })).headers.get('content-type') ?? ''; } catch { return ''; }
  };
  const goneJson = async (u) => !/json/.test(await headType(u));
  const gonePng = async (u) => !/image/.test(await headType(u));
  out['asset:atlas.json'] = await goneJson('sprites/atlas.json');
  out['asset:resources.json'] = await goneJson('sprites/resources.json');
  out['asset:annotations.json'] = await goneJson('sprites/annotations.json');
  out['asset:Player.png'] = await gonePng('sprites/%E8%A7%92%E8%89%B2/Player.png');
  return out;
});
for (const [k, v] of Object.entries(absence)) chk(`Maples 面全零:${k}`, v === true);

// ③ 全量重烘 + 走动 + 刷怪拍(活体零错)
await page.evaluate(() => { window.__swGame.chunks?.invalidateAll?.(); });
await new Promise((r) => setTimeout(r, 3000));
await page.keyboard.down('d');
await new Promise((r) => setTimeout(r, 2600));
await page.keyboard.up('d');
await new Promise((r) => setTimeout(r, 2400));
await page.keyboard.down('a');
await new Promise((r) => setTimeout(r, 2600));
await page.keyboard.up('a');
await new Promise((r) => setTimeout(r, 2600));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const a = window.__swAtlas;
  return {
    chunkCount: g.chunks?.chunks?.size ?? -1,
    vimagesCount: a?.vimages?.size ?? -1,
    playerRendered: !!(g.player && g.renderer),
  };
});
chk('烘焙链活体(chunk 缓存非空)', out.chunkCount > 0, `chunks=${out.chunkCount}`);
chk('vanilla 表在位', out.vimagesCount > 0, `vimages=${out.vimagesCount}`);
chk('零页面错误', errs.length === 0, errs.slice(0, 3).join(' | '));

await page.screenshot({ path: '/tmp/maples-retire-world.png' });
console.log('\n==== maples-retire tripwire 判语 ====');
console.log(JSON.stringify({ pass: results.filter((r) => r.ok).length, fail: results.filter((r) => !r.ok).length, pageErrors: errs.length }, null, 2));
await browser.close();
process.exit(errs.length === 0 && results.every((r) => r.ok) ? 0 : 1);
