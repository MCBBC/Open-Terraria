// 素材重制工作台冒烟探针:开页/目录对拍/mock 重制全流程/验收推进/导出 zip/热应用注入。
// 运行(私有 vite 实例):
//   SW_PORT=5201 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5201 nohup npx vite > /tmp/vite-5201.log 2>&1 &
//   SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_remaster-smoke.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 500)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300)); });
const ok = [];
const chk = (name, cond, extra = '') => {
  ok.push(!!cond);
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  [' + extra + ']' : ''}`);
};

try {
  // ---- mock OpenAI edits:返回固定位图(pngjs 生成 1024² 紫色,png base64) ----
  const { PNG } = await import('pngjs');
  const mockPng = new PNG({ width: 1024, height: 1024 });
  for (let i = 0; i < mockPng.data.length; i += 4) {
    mockPng.data[i] = 160; mockPng.data[i + 1] = 60; mockPng.data[i + 2] = 220; mockPng.data[i + 3] = 255;
  }
  const PNG_B64 = PNG.sync.write(mockPng).toString('base64');
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().includes('/v1/images/edits')) {
      req.respond({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: [{ b64_json: PNG_B64 }] }),
      });
    } else req.continue();
  });

  await page.goto(`${ORIGIN}/remaster.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__remasterBridge?.catalog, { timeout: 30000 });

  // ---- ① 目录对拍 ----
  const cat = await page.evaluate(() => {
    const b = window.__remasterBridge;
    const by = b.catalog.byCategory;
    return {
      total: b.catalog.entries.length,
      tile: by.get('tile').length, wall: by.get('wall').length,
      npc: by.get('npc').length, item: by.get('item').length,
      proj: by.get('projectile').length, ui: by.get('ui').length,
      gore: by.get('gore').length, buff: by.get('buff').length,
      glow: by.get('glow').length, misc: by.get('misc').length,
    };
  });
  chk('目录规模:tile 753', cat.tile === 753, `got ${cat.tile}`);
  chk('目录规模:wall 366', cat.wall === 366, `got ${cat.wall}`);
  chk('目录规模:npc 694(693+696 兜底)', cat.npc === 694, `got ${cat.npc}`);
  chk('目录规模:item 6119', cat.item === 6119, `got ${cat.item}`);
  chk('目录规模:gore 1403', cat.gore === 1403, `got ${cat.gore}`);
  chk('目录规模:buff 388', cat.buff === 388, `got ${cat.buff}`);
  chk('目录规模:glow 379', cat.glow === 379, `got ${cat.glow}`);
  chk('目录规模:projectile > 1000', cat.proj > 1000, `got ${cat.proj}`);
  chk('目录规模:ui > 1400(过滤纸娃娃)', cat.ui > 1400 && cat.ui <= 1509, `got ${cat.ui}`);

  // 默认选中蓝史莱姆
  const sel = await page.evaluate(() => {
    const b = window.__remasterBridge;
    return { key: b.curEntry()?.key, frames: b.curEntry()?.frames.length };
  });
  chk('默认选中 npc:1(蓝史莱姆,2 帧)', sel.key === 'npc:1' && sel.frames === 2, JSON.stringify(sel));

  // ---- ② mock 重制全流程 ----
  const remasterOk = await page.evaluate(async () => {
    const b = window.__remasterBridge;
    await b.remaster();
    await new Promise((r) => setTimeout(r, 3000));  // 等管线(拦截即时返回)
    const rec = b.state.frame(b.curEntry(), b.curFrame());
    return { status: rec.status, px: b.framePixelsMem.size, prompt: rec.prompt?.length > 0 };
  });
  chk('重制后帧状态=pending(管线通)', remasterOk.status === 'pending', JSON.stringify(remasterOk));
  chk('重制 prompt 已记录', remasterOk.prompt === true);

  // ---- ③ 验收推进 ----
  const adv = await page.evaluate(async () => {
    const b = window.__remasterBridge;
    const before = b.curFrame();
    await b.accept();
    return { before, after: b.curFrame(), st: b.state.frame(b.curEntry(), before).status };
  });
  chk('验收后状态=accepted', adv.st === 'accepted');
  chk('验收后自动推进到下一未完成帧', adv.after === adv.before + 1, JSON.stringify(adv));

  // 第二帧跳过 → 条目完成
  const comp = await page.evaluate(async () => {
    const b = window.__remasterBridge;
    await b.skip();
    return { complete: b.state.progress['npc:1'].complete, text: b.state.progressText(b.curEntry()) };
  });
  chk('全帧 accepted/skipped → 条目 complete', comp.complete === true, comp.text);

  // ---- ④ 导出链路 zip round-trip(PK 头+manifest+sheet 字节) ----
  const zipBytes = await page.evaluate(async () => {
    const { makePack, buildManifest, readPack } = await import('/src/remaster/PackFormat.ts');
    const { buildCatalog } = await import('/src/remaster/AssetCatalog.ts');
    const jf = (p2) => fetch(p2).then((r) => r.json());
    const vanilla = await jf('sprites/vanilla.json');
    const npcs = await jf('sprites/vanilla-npcs.json');
    const ui = await jf('sprites/vanilla-ui.json');
    const idx = await jf('sprites/remaster-index.json');
    const projf = await fetch('src/data/vanilla-projframes.json').then((r) => r.json());
    const catalog = buildCatalog({ vanilla, npcData: npcs, projFrames: projf, uiFiles: ui.files, sizes: { ...idx.vanilla, ...idx['vanilla-ui'] } });
    const e = catalog.byKey.get('npc:1');
    const m = buildManifest('探针包', 'probe', {
      [e.sheet]: { category: 'npc', complete: true, frames: { 0: { status: 'accepted', rect: [0, 0, 32, 26], hash: 'aa' } } },
    });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const bytes = makePack(m, [{ file: e.sheet, png }]);
    const back = await readPack(bytes);
    return {
      pk: bytes[0] === 0x50 && bytes[1] === 0x4b,
      manifestOk: back.manifest.name === '探针包',
      sheetBytes: new Uint8Array(await back.sheets.get(e.sheet).arrayBuffer()).length,
    };
  });
  chk('zip round-trip(PK 头+manifest+sheet)', zipBytes.pk && zipBytes.manifestOk && zipBytes.sheetBytes === 11, JSON.stringify(zipBytes));

  // ---- ⑤ 热应用注入(本页运行时) ----
  const applied = await page.evaluate(async () => {
    const b = window.__remasterBridge;
    // 直接构造单 sheet pack 注入 runtime,断言 atlas.vimages 引用已换
    const { makePack, buildManifest, readPack } = await import('/src/remaster/PackFormat.ts');
    const png = await (await fetch('sprites/vanilla/NPC_1.png')).arrayBuffer();
    const m = buildManifest('inj', 'probe', {
      'vanilla/NPC_1.png': { category: 'npc', complete: true, frames: {} },
    });
    const zip = makePack(m, [{ file: 'vanilla/NPC_1.png', png: new Uint8Array(png) }]);
    const pack = await readPack(zip);
    const before = b.atlas.vimages.get('vanilla/NPC_1.png');
    const r = await b.runtime.apply(pack);
    const after = b.atlas.vimages.get('vanilla/NPC_1.png');
    return { applied: r.applied.length, changed: before !== after && !!after };
  });
  chk('热应用:apply 后 atlas.vimages 引用已换', applied.changed && applied.applied === 1, JSON.stringify(applied));

  const pass = ok.filter(Boolean).length;
  console.log(`\n===== ${pass}/${ok.length} PASS =====`);
  await browser.close();
  process.exit(pass === ok.length ? 0 : 1);
} catch (err) {
  console.log('FATAL:', err);
  await browser.close();
  process.exit(1);
}
