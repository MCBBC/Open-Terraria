// 三百十三真机验证:SW 同路线 mod 贴图(Bandit 837 回路闭合)
// 装 6.71.0 swmod(请求拦截供包)→ 重载 boot → 断言 alias/缓存/vnpc 三环
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:4173';
const SWMOD = 'mods/dist/calamity.swmod';
const LOG = fs.openSync('/tmp/mod-sw-probe.log', 'w');
const log = (t) => { fs.writeSync(LOG, t + '\n'); console.log(t); };

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  userDataDir: '/tmp/mod-sw-probe-' + Date.now() % 100000,
  args: ['--no-proxy-server'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const CDP = await page.createCDPSession();
await CDP.send('Fetch.enable', { patterns: [{ urlPattern: '*://*/mods/diag.swmod' }] });
const swmodBytes = fs.readFileSync(SWMOD);
CDP.on('Fetch.requestPaused', async (e) => {
  await CDP.send('Fetch.fulfillRequest', {
    requestId: e.requestId,
    responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: 'application/zip' }],
    body: swmodBytes.toString('base64'),
  });
});
page.on('pageerror', (e) => log(`PAGE-EXC ${String(e).slice(0, 140)}`));
page.on('console', (m) => { const t = m.text(); if (/404|AbortError|mods/.test(t)) log(`CONSOLE ${t.slice(0, 160)}`); });

const boot = async () => {
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__swAtlas && window.__swMods', { timeout: 90000, polling: 500 });
  await new Promise((r) => setTimeout(r, 3000));
};

await boot();
// 装 6.71.0 swmod(覆盖旧版)
const st = await page.evaluate(async () => {
  const buf = await (await fetch('/mods/diag.swmod')).arrayBuffer();
  const row = await window.__swMods.install(new Uint8Array(buf));
  return { id: row.id, version: row.version, enabled: row.enabled };
});
log(`INSTALL ${JSON.stringify(st)}`);

// 重载→boot→等待 mod 装载+贴图相位
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('window.__swAtlas && window.__swMods', { timeout: 90000, polling: 500 });
await page.waitForFunction('window.__swModsLoaded === true', { timeout: 60000, polling: 500 }).catch(() => log('WARN __swModsLoaded 未置(30s 护栏内未完?)'));
await new Promise((r) => setTimeout(r, 6000));

const diag = await page.evaluate(async () => {
  const a = window.__swAtlas;
  const out = {};
  out.modsLoaded = window.__swModsLoaded === true;
  const res = window.__swMods?.result?.();
  out.modsLoadedList = res?.loaded ?? [];
  out.modErrors = res?.errors ?? [];
  out.has837 = a.hasAssetAlias('vanilla/NPC_837.png');
  out.aliasUrl = null;
  try { out.aliasUrl = a.hasAssetAlias('vanilla/NPC_837.png') ? 'registered' : null; } catch {}
  out.vimages837 = !!a.vimages.get('vanilla/NPC_837.png');
  out.banditFetch = null;
  try { out.banditFetch = (await fetch('sprites/mods/calamity/textures/npcs/bandit.png')).status; } catch (e) { out.banditFetch = String(e).slice(0, 60); }
  out.modsCache = null;
  try {
    const c = await caches.open('sw-mods-v1');
    out.modsCache = (await c.keys()).length;
    out.modsCacheHas837 = !!(await c.match('/sprites/mods/calamity/textures/npcs/bandit.png'));
  } catch (e) { out.modsCache = String(e).slice(0, 60); }
  // vnpc 回路(等 fetch 落地两拍)
  out.vnpc837 = null;
  for (let i = 0; i < 10 && !out.vnpc837; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const r0 = a.vnpc(837, 0);
    if (r0) out.vnpc837 = { w: r0.sw, h: r0.sh };
  }
  out.vimages837After = !!a.vimages.get('vanilla/NPC_837.png');
  return out;
});
log(`DIAG ${JSON.stringify(diag, null, 1)}`);
const ok = diag.has837 && diag.modsCacheHas837 && diag.vnpc837;
log(ok ? 'VERDICT PASS' : 'VERDICT FAIL');
await browser.close();
fs.closeSync(LOG);
process.exit(ok ? 0 : 1);
