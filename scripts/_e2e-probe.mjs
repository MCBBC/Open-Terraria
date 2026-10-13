// ★实机探针(2026-10-13):mod 全 15 域 e2e 验证(私有静默实例 SW_PORT=5201)
import { readFileSync } from 'fs';
import puppeteer from 'puppeteer-core';

const MOD_B64 = Buffer.from(readFileSync('mods/dist/e2e-all.swmod')).toString('base64');
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser_ = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser_.newPage();
page.on('console', (msg) => { if (msg.text().includes('e2e')) console.log(`[page] ${msg.text()}`); });
page.on('pageerror', (err) => { console.error(`[page-error] ${err.message}`); });

try {
  // 装载 mod
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle0', timeout: 30000 });
  const allChecks = await page.evaluate(async (b64) => {
    const results = [];
    const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); };
    try {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const { ModStore } = await import('/src/mods/store.ts');
      const { readModPack } = await import('/src/mods/pack.ts');
      const storage = {
        reg: JSON.stringify([]), zips: new Map(),
        async getRegistry() { return this.reg; }, async setRegistry(j) { this.reg = j; },
        async putZip(id, b) { this.zips.set(id, b); return true; }, async getZip(id) { return this.zips.get(id) ?? null; },
        async deleteZip(id) { this.zips.delete(id); }
      };
      const store = new ModStore(storage);
      const pack = readModPack(bin);
      await store.install(pack.manifest, bin);
      await store.setEnabled('e2e', true);
      const { loadModsPhase1, getModLoadResult } = await import('/src/mods/loader.ts');
      await loadModsPhase1(storage);
      const r = getModLoadResult();
      const a = r?.allocation;
      check('mod 装载零错', r?.errors?.length === 0, JSON.stringify(r?.errors ?? []));
      if (!a) { check('allocation', false, 'null'); return results; }
      const toObj = (m) => { const o = {}; for (const [k, v] of m) o[k] = v; return o; };
      const walls = toObj(a.walls), mounts = toObj(a.mounts), hairs = toObj(a.hairs), dusts = toObj(a.dusts), items = toObj(a.items);
      check('墙 367+', walls['mod_e2e_e2e_brick'] === 367);
      check('坐骑 66+', mounts['mod_e2e_e2e_mount'] === 66);
      check('发型 228+', hairs['mod_e2e_e2e_hair'] === 228);
      check('尘埃 400+', dusts['mod_e2e_e2e_dust'] === 400);
      const { modRarityColorOf } = await import('/src/mods/rarity.ts');
      check('稀有度档色', modRarityColorOf(12) === '#FF6600');
      const { ITEM_DEFS } = await import('/src/data/items.ts');
      check('物品 rare 12 档', ITEM_DEFS[items['mod_e2e_e2e_sword']]?.rare === 12);
      check('ITEM_DEFS wallId', ITEM_DEFS[items['mod_e2e_e2e_brick_item']]?.wallId === 367);
      const { modPetInfoOf } = await import('/src/mods/pets.ts');
      check('宠物反查', modPetInfoOf(items['mod_e2e_e2e_pet_item']) !== null);
      const { modDustTexOf } = await import('/src/mods/dusts.ts');
      check('尘埃贴图', modDustTexOf(dusts['mod_e2e_e2e_dust']) !== null);
      const { equipKindOfInternal } = await import('/src/data/vanillaEquip.ts');
      check('mountItem 装备分类', equipKindOfInternal(items['mod_e2e_e2e_mount_item']) === 'mount');
      const { modMountDataOf } = await import('/src/mods/mounts.ts');
      check('坐骑 MOUNT_DATA', modMountDataOf(mounts['mod_e2e_e2e_mount'])?.runSpeed === 8);
      const { hairCountMax } = await import('/src/player/Appearance.ts');
      check('hairCountMax 扩域', hairCountMax() >= 229, `max=${hairCountMax()}`);

      // ★D8/D12(2026-10-13):atlas 贴图注入验证(boot atlas 复用;SW 别名支主路线)
      //  gore=vanilla/Gore_<id>.png(D8 债:注入支从未 e2e)/dust=vanilla/Dust_<id>.png(D12)
      const atlas = (window).__swAtlas;
      if (atlas) {
        const { applyModAssets } = await import('/src/mods/assets.ts');
        await applyModAssets(atlas);
        let goreId = -1;
        for (const [k, v] of a.gores) if (k === 'mod_e2e_e2e_gore') goreId = v;
        check('gore 段 1500+', goreId >= 1500, String(goreId));
        const dustId = dusts['mod_e2e_e2e_dust'];
        atlas.ensureVImage(`vanilla/Gore_${goreId}.png`);
        atlas.ensureVImage(`vanilla/Dust_${dustId}.png`);
        await new Promise((r) => setTimeout(r, 2500));   // SW fetch+decode 落表
        const vi = atlas.vimages;
        check('gore 贴图注入(D8)', !!vi?.get?.(`vanilla/Gore_${goreId}.png`), `vanilla/Gore_${goreId}.png`);
        check('dust 贴图注入(D12)', !!vi?.get?.(`vanilla/Dust_${dustId}.png`), `vanilla/Dust_${dustId}.png`);
        // ★D15:textures/ui/*.png 约定目录注入(sw.ui.panel addImage 消费面)
        check('UI 贴图注入(D15)', !!vi?.get?.('vanilla/ModUI_e2e_e2e_img.png'), 'vanilla/ModUI_e2e_e2e_img.png');
        // ★D12-图鉴:mod NPC 自动入册(VANILLA_NPCS 注册链 → bestiaryEntries id≥800)
        const { bestiaryEntries } = await import('/src/data/Bestiary.ts');
        const e2eNpcId = a.npcs.get('mod_e2e_e2e_zombie');
        const bEntry = bestiaryEntries().find((e) => e.id === e2eNpcId);
        check('图鉴 mod NPC 入册', !!bEntry && bEntry.sources.length > 0,
          bEntry ? `sources=${bEntry.sources.map((s) => s.t).join(',')}` : '无条目');
      } else {
        check('atlas 句柄', false, 'window.__swAtlas 缺失');
      }
    } catch (err) {
      check('探针异常', false, err.message);
    }
    return results;
  }, MOD_B64);

  for (const r of allChecks) {
    check(r.name, r.ok, r.detail);
  }
  await page.screenshot({ path: '/tmp/e2e-probe.png' });
} catch (err) {
  check('探针异常', false, err.message);
} finally {
  await browser_.close();
}

const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
