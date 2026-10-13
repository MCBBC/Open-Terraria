import { readFileSync } from 'fs';
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MOD_B64 = Buffer.from(readFileSync('mods/dist/e2e-all.swmod')).toString('base64');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (m) => console.log('[c]', m.text().slice(0, 150)));
await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle0', timeout: 30000 });
const out = await page.evaluate(async (b64) => {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const { ModStore } = await import('/src/mods/store.ts');
  const { readModPack } = await import('/src/mods/pack.ts');
  const storage = { reg: '[]', zips: new Map(), async getRegistry() { return this.reg; }, async setRegistry(j) { this.reg = j; }, async putZip(id, b) { this.zips.set(id, b); return true; }, async getZip(id) { return this.zips.get(id) ?? null; }, async deleteZip(id) {} };
  const store = new ModStore(storage);
  const pack = readModPack(bin);
  await store.install(pack.manifest, bin);
  await store.setEnabled('e2e', true);
  const { loadModsPhase1, getModLoadResult } = await import('/src/mods/loader.ts');
  await loadModsPhase1(storage);
  const a = getModLoadResult().allocation;
  let goreId = -1;
  for (const [k, v] of a.gores) if (k === 'mod_e2e_e2e_gore') goreId = v;
  const atlas = window.__swAtlas;
  const aliasProbe = () => {
    const t = atlas.assetAliases ?? atlas._assetAliases ?? null;
    return t ? [...t.keys()].filter(k => k.includes('Gore_') || k.includes('Dust_')).slice(0, 5) : 'no-table-field';
  };
  const { applyModAssets } = await import('/src/mods/assets.ts');
  await applyModAssets(atlas);
  const before = aliasProbe();
  atlas.ensureVImage(`vanilla/Gore_${goreId}.png`);
  await new Promise(r => setTimeout(r, 2500));
  const url = `sprites/mods/e2e/textures/gores/e2e_gore.png`;
  const resp = await fetch(url).catch(e => ({ status: 'ERR ' + e.message }));
  const vi = atlas.vimages;
  return {
    goreId,
    aliasKeys: before,
    vimgGore: !!vi?.get?.(`vanilla/Gore_${goreId}.png`),
    fetchStatus: resp.status,
    fetchType: resp.headers?.get?.('content-type'),
    swCtl: !!navigator.serviceWorker?.controller,
    vimgCount: vi?.size,
  };
}, MOD_B64);
console.log(JSON.stringify(out, null, 1));
await browser.close();
