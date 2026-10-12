// Lights And Shadows 探针 v9:用户真实存档(十周年纪念种子=极光世界)翻转复现+二分。
// 假设:极光→farInterlayerActive→_c10eFrame=false→非分体帧链路 × mod 常驻链=翻转。
// 二分腿:①mod 完整 ②mod pass 换纯直通(只保留"链常开"因子) ③mod 摘除。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { zipSync } = require('fflate');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const WLD = process.env.LAS_WLD || '/Users/vinlic/Downloads/十周年纪念种子 (3).wld';
const SHOT = '/tmp/las-shots';
fs.mkdirSync(SHOT, { recursive: true });
const LOG = fs.openSync('/tmp/las-probe9.log', 'w');
const log = (t) => { fs.writeSync(LOG, t + '\n'); console.log(t); };
if (!fs.existsSync(WLD)) { log(`FATAL: wld 不存在: ${WLD}`); process.exit(1); }

const modDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'mods', 'lights-and-shadows');
const walk = (dir, rel = '', out = {}) => {
  for (const name of fs.readdirSync(join(dir, rel))) {
    const p = rel ? `${rel}/${name}` : name;
    if (fs.statSync(join(dir, p)).isDirectory()) { walk(dir, p, out); continue; }
    if (p === 'PORTING.md' || p.startsWith('reference/')) continue;
    out[p] = new Uint8Array(fs.readFileSync(join(dir, p)));
  }
  return out;
};
const zipBytes = zipSync(walk(modDir));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
  userDataDir: '/tmp/las-profile9-' + Date.now() % 100000,
  args: ['--no-proxy-server'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => log(`PAGE-EXC ${String(e).slice(0, 300)}`));
page.on('console', (m) => {
  const t = m.text();
  if (/lights_and_shadows|编译失败|链接失败/i.test(t)) log(`PAGE: ${t.slice(0, 240)}`);
});

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => !!globalThis.__swMods, { timeout: 180000, polling: 1500 });
await page.evaluate(async (bytes) => {
  await globalThis.__swMods.install(new Uint8Array(bytes));
}, Array.from(zipBytes));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!globalThis.__swMods, { timeout: 180000, polling: 1500 });
log(`load: ${JSON.stringify(await page.evaluate(() => {
  const r = globalThis.__swMods.result();
  return { errors: r.errors, ids: r.loaded.map((m) => m.manifest?.id) };
}))}`);

await page.waitForFunction(() => document.body && document.body.innerText.includes('单人模式'), { timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));

// ---- 先过角色面板(新建角色),再进世界面板导入 wld ----
// ★角色面板先弹且同样有 [data-act=import](角色导入)——必须先建角色进世界面板,
//   否则 .wld 会被喂给角色导入=静默失败(前两次超时的真因)
const clickText0 = (txt) => page.evaluate((t) => {
  const els = [...document.querySelectorAll('button,div,span')].filter((e) => e.textContent?.trim() === t && e.offsetParent);
  if (!els.length) return false;
  els[els.length - 1].click();
  return true;
}, txt);
await clickText0('单人模式');
await new Promise((r) => setTimeout(r, 1500));
await clickText0('新建');
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const b = document.querySelector('[data-act="create"]');
  if (b && b.offsetParent) b.click();
});
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const row = document.querySelector('.sw-vitem.sw-vpanel-item');
  if (row && row.offsetParent) row.click();
});
await new Promise((r) => setTimeout(r, 1500));

// 世界面板=后挂载 → 取 DOM 里最后一个导入按钮(角色面板的在前)
const importBtns = await page.$$('[data-act="import"]');
log(`import buttons: ${importBtns.length}`);
if (!importBtns.length) { log('FATAL: 无导入按钮'); process.exit(1); }
await importBtns[importBtns.length - 1].click();
await new Promise((r) => setTimeout(r, 1000));
// 同理取最后一个 file input(世界面板的)
const fins = await page.$$('input[type=file]');
const fin = fins[fins.length - 1];
if (!fin) { log('FATAL: 无文件输入'); process.exit(1); }
await fin.uploadFile(WLD);
log('wld 导入中…(事件驱动等待)');
// 等世界条目出现(大世界导入可达数分钟;轮询到 300s)
let imported = false;
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const n = (await page.$$('.sw-vsel .sw-vitem')).length;
  if (n > 0) { imported = true; log(`导入完成(${(i + 1) * 2}s, ${n} 个世界)`); break; }
  if (i === 3 || i === 10) {
    await page.screenshot({ path: `${SHOT}/v9-import-${i}.png` });
    const ui = await page.evaluate(() => ({
      body: document.body.innerText.slice(0, 300).replace(/\n+/g, '|'),
      dialogs: [...document.querySelectorAll('[class*=dialog],[class*=modal],[class*=toast],[class*=confirm]')]
        .map((d) => d.textContent?.slice(0, 80)).filter(Boolean),
    }));
    log(`导入等待中 ui: ${JSON.stringify(ui)}`);
  }
}
if (!imported) { log('FATAL: 导入超时'); process.exit(1); }

// 进世界:世界列表第一项 play
const items = await page.$$('.sw-vsel .sw-vitem');
log(`worlds: ${items.length}`);
if (!items.length) { log('FATAL: 世界列表空'); process.exit(1); }
const imgs = await items[0].$$('.sw-vitem-btns img');
for (const img of imgs) {
  const src = await img.evaluate((e) => e.getAttribute('src') ?? '');
  if (src.includes('UI_ButtonPlay')) {
    await (await img.evaluateHandle((e) => e.parentElement ?? e)).asElement()?.click();
    break;
  }
}
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w && !!window.__swGame?.player, { timeout: 300000, polling: 2000 });
await new Promise((r) => setTimeout(r, 5000));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button,div,span')].filter((e) => e.textContent?.trim() === '我已知晓' && e.offsetParent);
  if (btns.length) btns[btns.length - 1].click();
});
await new Promise((r) => setTimeout(r, 1000));
log('IN-GAME(用户 wld)');

const state = () => page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  return {
    sfx: r?.sfxPathUsed, c10eFrame: r?._c10eFrame, composited: r?._c10eComposited,
    aurora: !!r?.sky?.aurora?.tileColorState?.(),
    stats: r?.sfxPathStats, gravDir: g.player?.gravDir,
  };
});

await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  g.player.vx = 0; g.player.vy = 0;
  await new Promise((r) => setTimeout(r, 2000));
});
await new Promise((r) => setTimeout(r, 1000));
log(`① mod 完整: ${JSON.stringify(await state())}`);
await page.screenshot({ path: `${SHOT}/v9-full-mod.png` });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${SHOT}/v9-full-mod-2.png` });

// ② 二分:mod pass 换纯直通(链仍常开)——若仍翻转=链常开×极光帧的引擎交互
await page.evaluate(async () => {
  const h = await import('/src/mods/hooks.ts');
  h._resetModHooksForTests();
  const glMod = await import('/src/render/GLPipeline.ts');
  void glMod;
  // 纯直通 pass:走 pipe present 语义同 mod 兜底
  h.registerModScreenFx({
    id: 'passthru_test',
    exec: (gl, pipe, inputTex, outFbo, w, h) => {
      const fp = pipe.program('las_flip', `attribute vec2 aPos; varying vec2 vUv;
        void main() { vUv = aPos; gl_Position = vec4(aPos.x*2.0-1.0, 1.0-aPos.y*2.0, 0.0, 1.0); }`,
        `precision highp float; varying vec2 vUv; uniform sampler2D uTex;
         void main() { gl_FragColor = texture2D(uTex, vUv); }`);
      if (!fp?.prog) return;
      pipe.bindTarget(outFbo);
      pipe.setBlend('off');
      gl.useProgram(fp.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTex);
      gl.uniform1i(pipe.uni(fp, 'uTex'), 0);
      pipe.drawQuad(fp, [0, 0, w, h], 0);
      gl.activeTexture(gl.TEXTURE0);
    },
  });
});
await new Promise((r) => setTimeout(r, 2000));
log(`② 直通 pass(链常开): ${JSON.stringify(await state())}`);
await page.screenshot({ path: `${SHOT}/v9-passthru.png` });

// ③ mod 摘除基线
await page.evaluate(async () => {
  const h = await import('/src/mods/hooks.ts');
  h._resetModHooksForTests();
});
await new Promise((r) => setTimeout(r, 2000));
log(`③ mod 摘除: ${JSON.stringify(await state())}`);
await page.screenshot({ path: `${SHOT}/v9-no-mod.png` });

await browser.close();
log('PROBE9-DONE');
process.exit(0);
