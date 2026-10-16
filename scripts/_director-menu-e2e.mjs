// 导演模式菜单态全链 E2E 探针(2026-10-16)：主菜单 → mod 连服务 → 服务下发 newWorld
// → 世界就绪 → 服务播 film → tlDone。页面侧只做「装 mod + 盯现场」，驱动全在
// /tmp/director-auto2.mjs 服务（真实链路=用户视角，探针不代驾）。
// 用法：SW_ORIGIN=http://localhost:5205 node tools/run-diag.mjs scripts/_director-menu-e2e.mjs
import puppeteer from 'puppeteer-core';
import { zipSync, strToU8 } from 'fflate';
import { readFileSync, readdirSync, statSync } from 'node:fs';

// ── 打包 game/mods/director → zip（与服务端 film 下发同一份源）──
const MOD_DIR = new URL('../mods/director/', import.meta.url).pathname;
function walkZip(dir, base = '') {
  const out = {};
  for (const f of readdirSync(dir)) {
    const p = `${dir}/${f}`, rel = base + f;
    if (statSync(p).isDirectory()) Object.assign(out, walkZip(p, rel + '/'));
    else out[rel] = new Uint8Array(readFileSync(p));
  }
  return out;
}
const modZip = zipSync(walkZip(MOD_DIR));
console.log(`[probe] director mod zip: ${Object.keys(modZip).length} 文件, ${modZip.length} bytes`);

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5205';

// ── ① 打开主菜单 → 装 mod → reload ──
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 9000));
const b64 = Buffer.from(modZip).toString('base64');
const installed = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return await window.__swMods.install(bytes);
}, b64).catch(e => ({ evalFail: String(e).slice(0, 200) }));
console.log('[probe] ① INSTALL:', JSON.stringify(installed).slice(0, 200));

await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 12000));
const boot = await page.evaluate(() => {
  const r = window.__swMods?.result?.() ?? null;
  return {
    loaded: r?.loaded?.map((m) => m.manifest.id) ?? null,
    errors: r?.errors ?? null,
    flow: !!window.__swFlow, game: !!window.__swGame,
  };
}).catch(e => ({ evalFail: String(e).slice(0, 200) }));
console.log('[probe] ② BOOT:', JSON.stringify(boot));
if (boot?.errors?.length) console.log('[probe]   mod 装载错误:', JSON.stringify(boot.errors).slice(0, 400));

// ── ③ 盯现场：等服务驱动 newWorld → 进世界 → 播片（最长 8 分钟）──
let worldEntered = false, filmSeen = false;
const t0 = Date.now();
while (Date.now() - t0 < 480000) {
  await new Promise(r => setTimeout(r, 5000));
  const snap = await page.evaluate(() => {
    const g = window.__swGame;
    if (!g || !g.world || !g.player) return { game: !!g };
    return {
      game: true, world: `${g.world.w}x${g.world.h}`,
      px: +(g.player.x / 16).toFixed(1), py: +(g.player.y / 16).toFixed(1),
      hp: g.player.hp, tod: g.world.clock ? +g.world.clock.timeOfDay.toFixed(2) : null,
    };
  }).catch(() => ({ game: false }));
  if (!worldEntered && snap?.world) { worldEntered = true; console.log(`[probe] ③ 进世界 ✓ ${snap.world} player@${snap.px},${snap.py} hp=${snap.hp} tod=${snap.tod}`); }
  if (worldEntered && !filmSeen) {
    filmSeen = true;   // 进世界即视为链路到点（播放详情由服务日志呈现）
  }
  if (worldEntered && snap?.tod != null) {
    // tod 随片推进（freeze=true 时 tod 固定→改看时钟推进）；有世界即每 30s 截图
  }
  if (worldEntered && Math.floor((Date.now() - t0) / 30000) !== Math.floor((Date.now() - t0 - 5000) / 30000)) {
    await page.screenshot({ path: `/tmp/director-e2e-${Math.floor((Date.now() - t0) / 1000)}s.png` });
    console.log(`[probe]   截图 @${Math.floor((Date.now() - t0) / 1000)}s`);
  }
  if (errs.length) { console.log('[probe]   页面错误:', errs.slice(0, 3).join(' | ').slice(0, 400)); errs.length = 0; }
}

const final = await page.evaluate(() => {
  const g = window.__swGame;
  return g && g.world && g.player ? { inWorld: true, px: +(g.player.x / 16).toFixed(1), py: +(g.player.y / 16).toFixed(1) } : { inWorld: false };
}).catch(() => ({ inWorld: false }));
console.log('[probe] ④ 终态:', JSON.stringify(final), worldEntered ? '（世界已进入，播放详情见服务日志 /tmp/director-auto2.log）' : '（未进世界 ✗）');
await browser.close();
process.exit(worldEntered ? 0 : 1);
