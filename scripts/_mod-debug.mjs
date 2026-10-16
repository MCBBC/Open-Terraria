import { launchBrowser, openPage, gotoApp, ledger } from '../tools/probe/lib/index.mjs';
const L = ledger();
const browser = await launchBrowser({ viewport: { width: 800, height: 600 } });
try {
  const page = await openPage(browser, {});
  page.on('console', m => console.log(`[${m.type()}]`, m.text().slice(0, 200)));
  page.on('pageerror', e => console.log('[pageerror]', e.message.split('\n')[0]));
  await gotoApp(page, 'http://localhost:5199', { tries: 20 });
  
  // 装 mod 并检查
  const result = await page.evaluate(async () => {
    const out = { errors: [] };
    try {
      const res = await fetch('/mods/dist/director.swmod?t=' + Date.now());
      const bytes = new Uint8Array(await res.arrayBuffer());
      const { ModStore } = await import('/src/mods/store.ts');
      const { readModPack } = await import('/src/mods/pack.ts');
      const { loadModsPhase1 } = await import('/src/mods/loader.ts');
      const storage = { reg: JSON.stringify([]), zips: new Map(),
        async getRegistry() { return this.reg; }, async setRegistry(j) { this.reg = j; },
        async putZip(id, b) { this.zips.set(id, b); return true; }, async getZip(id) { return this.zips.get(id) ?? null; },
        async deleteZip(id) { this.zips.delete(id); } };
      const store = new ModStore(storage);
      const pack = readModPack(bytes);
      await store.install(pack.manifest, bytes, null);
      const r2 = await loadModsPhase1(storage);
      out.loaded = r2.loaded.map(x => x.manifest?.id);
      out.errors = r2.errors.map(e => `${e.modId}: ${e.error}`);
    } catch (e) { out.errors.push(String(e.message || e)); }
    return out;
  });
  console.log('装载:', JSON.stringify(result));
  
  // 检查 WebSocket 状态
  await new Promise(r => setTimeout(r, 3000));
  const wsState = await page.evaluate(() => {
    // mod 的 ws 是闭包内的，无法直接访问——但可以检查是否有 WebSocket 活动
    return { readyState: 'unknown (closure)' };
  });
  console.log('ws 状态:', JSON.stringify(wsState));
  
  // 检查 director host 是否注册
  const dirState = await page.evaluate(async () => {
    const dir = await import('/src/mods/director.ts');
    return { camTarget: dir.directorCamTarget(), locked: dir.directorInputLocked() };
  });
  console.log('引擎读点:', JSON.stringify(dirState));
} finally {
  await browser.close();
}
process.exit(0);
