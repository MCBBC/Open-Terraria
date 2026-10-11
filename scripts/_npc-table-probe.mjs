// NPC 表普查(★616 排障):browser 内 VANILLA_NPCS 是否含 mod 903 段
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
// 先装 mod(全新 profile=空 IDB;install+reload 两拍)
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise(r => setTimeout(r, 12000));
await page.evaluate(async () => {
  const buf = await fetch('mods/dist/calamity.swmod').then((r) => r.arrayBuffer());
  await window.__swMods.install(new Uint8Array(buf));
});
await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise(r => setTimeout(r, 12000));
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 });
for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 3000)); if (await page.evaluate(() => !!(window.__swGame && window.__swGame.player)).catch(() => false)) break; }
const r = await page.evaluate(async () => {
  const vn = await import('/src/data/vanillaNpcs.ts');
  const table = vn.VANILLA_NPCS;
  const keys = Object.keys(table || {});
  const modKeys = keys.filter((k) => Number(k) >= 800);
  const en = await import('/src/entities/Enemy.ts');
  const e = en.Enemy.fromVanilla(903, 400, 200);
  const alloc = window.__swMods && window.__swMods.result ? window.__swMods.result().allocation : null;
  return {
    total: keys.length, modCount: modKeys.length, firstMods: modKeys.slice(0, 4), has903: keys.includes('903'),
    fromVanilla903: e ? { name: e.vanilla && e.vanilla.name, boss: e.def && e.def.boss } : null,
    allocNpc: alloc ? alloc.npcs.get('mod_calamity_desert_scourge_head') : null,
    loadErrs: (window.__swMods && window.__swMods.result) ? window.__swMods.result().errors : [],
  };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
