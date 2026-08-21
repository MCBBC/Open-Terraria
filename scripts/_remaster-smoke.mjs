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
      const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      };
      if (req.method() === 'OPTIONS') {
        req.respond({ status: 204, headers: cors });
      } else {
        req.respond({
          status: 200, contentType: 'application/json', headers: cors,
          body: JSON.stringify({ data: [{ b64_json: PNG_B64 }] }),
        });
      }
    } else req.continue();
  });

  await page.goto(`${ORIGIN}/remaster.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 等 catalog + 启动块(默认选中)双就绪——state.load() 是 IDB 异步,只等 catalog 会太早
  await page.waitForFunction(() => window.__remasterBridge?.catalog, { timeout: 30000 });
  await page.waitForFunction(() => window.__remasterBridge?.curEntry(), { timeout: 30000 });

  // ---- ① 目录对拍 ----
  const cat = await page.evaluate(async () => {
    const b = window.__remasterBridge;
    const by = b.catalog.byCategory;
    const jf = (p2) => fetch(p2).then((r) => r.json());
    const vanilla = await jf('sprites/vanilla.json');
    const ui = await jf('sprites/vanilla-ui.json');
    const npcs = await jf('sprites/vanilla-npcs.json');
    return {
      tile: by.get('tile').length, wall: by.get('wall').length,
      npc: by.get('npc').length, item: by.get('item').length,
      proj: by.get('projectile').length, ui: by.get('ui').length,
      gore: by.get('gore').length, buff: by.get('buff').length,
      glow: by.get('glow').length,
      // 动态基线(素材库随并行会话重打包漂移:items 6119→6059 等)
      baseTile: Object.keys(vanilla.tiles).length,
      baseWall: Object.keys(vanilla.walls).length,
      baseNpc: Object.keys(npcs).length,
      baseItem: Object.keys(vanilla.items).length,
      baseUi: Object.keys(ui.files).length,
    };
  });
  chk('目录规模:tile=vanilla.tiles 全量', cat.tile === cat.baseTile, `${cat.tile}/${cat.baseTile}`);
  chk('目录规模:wall=vanilla.walls 全量', cat.wall === cat.baseWall, `${cat.wall}/${cat.baseWall}`);
  chk('目录规模:npc≥vanilla-npcs(网格兜底)', cat.npc >= cat.baseNpc, `${cat.npc}/${cat.baseNpc}`);
  chk('目录规模:item=vanilla.items 全量', cat.item === cat.baseItem, `${cat.item}/${cat.baseItem}`);
  chk('目录规模:gore 1403', cat.gore === 1403, `got ${cat.gore}`);
  chk('目录规模:buff 388', cat.buff === 388, `got ${cat.buff}`);
  chk('目录规模:glow 379', cat.glow === 379, `got ${cat.glow}`);
  chk('目录规模:projectile > 1000', cat.proj > 1000, `got ${cat.proj}`);
  chk('目录规模:ui=vanilla-ui 全量(整图类不滤,纸娃娃灰显)', cat.ui === cat.baseUi, `${cat.ui}/${cat.baseUi}`);

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

  // ---- ③b 整图重制模式(无法逐帧切分的素材:594 风气球横条) ----
  const whole = await page.evaluate(async () => {
    const b = window.__remasterBridge;
    const e = b.catalog.byKey.get('npc:594');
    b.selectEntry(e);
    await new Promise((r) => setTimeout(r, 1200));   // 等 sheet 加载
    const mode = { excluded: !!e.meta?.excluded, framesLen: e.frames.length };
    await b.remaster();
    await new Promise((r) => setTimeout(r, 3000));
    const rec = b.state.frame(e, -1);   // WHOLE_FRAME_IDX 哨兵
    return { mode, status: rec.status, prompt: rec.prompt };
  });
  chk('594(横条排除条目)默认整图模式(frames 空+excluded)', whole.mode.excluded === true && whole.mode.framesLen === 0, JSON.stringify(whole.mode));
  chk('整图重制管线通(记录键 -1=pending)', whole.status === 'pending', whole.status);
  chk('整图 prompt 用 whole 模板(逐元素原位)', /complete sprite sheet/.test(whole.prompt ?? ''), (whole.prompt ?? '').slice(0, 120));
  const wholeAcc = await page.evaluate(async () => {
    const b = window.__remasterBridge;
    const e = b.catalog.byKey.get('npc:594');
    await b.accept();
    return { complete: b.state.progress['npc:594'].complete, text: b.state.progressText(e) };
  });
  chk('整图验收 → 条目 complete(frames 空使完成度只取决于整图记录)', wholeAcc.complete === true && wholeAcc.text === '1/1', wholeAcc.text);

  // ---- ③c 单帧整图条目(gore):whole 模式与逐帧共享记录键 0(不分裂重复重制) ----
  const singleWhole = await page.evaluate(async () => {
    const b = window.__remasterBridge;
    const e = b.catalog.byKey.get('gore:910');
    if (!e) return { skip: true };
    b.selectEntry(e);
    await new Promise((r) => setTimeout(r, 900));
    // 逐帧模式(默认)重制 → 键 0
    await b.remaster();
    await new Promise((r) => setTimeout(r, 2500));
    const stFrames = b.state.frame(e, 0).status;
    // 切 whole 模式:记录应仍是键 0(-1 无记录 = 共享不分裂)
    const chk = document.getElementById('whole-mode');
    chk.checked = true; chk.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 200));
    const stWholeView = b.state.frame(e, 0).status;
    const negOne = b.state.frame(e, -1).status;
    return { skip: false, stFrames, stWholeView, negOne, framesLen: e.frames.length };
  });
  if (singleWhole.skip) {
    console.log('SKIP gore:910 不在目录');
    ok.push(true);
  } else {
    chk('单帧整图条目:whole 视图与逐帧共享键 0(状态一致)',
      singleWhole.framesLen === 1 && singleWhole.stFrames === 'pending' && singleWhole.stWholeView === singleWhole.stFrames && singleWhole.negOne === 'untouched',
      JSON.stringify(singleWhole));
  }

  // ---- ③d 效率件:B tile 默认整图 / A 队列并发 / D 候选 / F 导航 ----
  const eff = await page.evaluate(async () => {
    const b = window.__remasterBridge;
    // B:tile 条目默认整图模式
    const dirt = b.catalog.byKey.get('tile:0');
    b.selectEntry(dirt);
    await new Promise((r) => setTimeout(r, 600));
    const tileWhole = b.wholeMode();
    const tileWholeModeFor = b.wholeModeFor(dirt);
    // F:下一未完成导航(npc:1/npc:594 已完成 → 跳到别的)
    const nxt = b.gotoNextTodo();
    // D:候选——同帧两次生成 → 2 候选
    b.selectEntry(nxt || dirt);
    await new Promise((r) => setTimeout(r, 800));
    const k = `${b.curEntry().key}|${b.curFrameIdx()}`;
    await b.remaster();
    await b.remaster();
    await new Promise((r) => setTimeout(r, 2500));
    const cands = b.framePixelsMem.get(k);
    return {
      tileWhole, tileWholeModeFor,
      navKey: nxt?.key ?? null,
      candList: cands?.list?.length ?? 0, candSel: cands?.sel,
      stats: b.apiStats(),
    };
  });
  chk('B:tile 条目默认整图模式(单元 ×7 缩减)', eff.tileWhole === true && eff.tileWholeModeFor === true, JSON.stringify({ tileWhole: eff.tileWhole }));
  chk('F:gotoNextTodo 跳过已完成条目', eff.navKey !== null && eff.navKey !== 'npc:1' && eff.navKey !== 'npc:594', eff.navKey);
  chk('D:同帧两次生成 → 候选 2 个(不覆盖)', eff.candList === 2 && eff.candSel === 1, JSON.stringify({ candList: eff.candList, candSel: eff.candSel }));
  chk('A/F:API 计量在工作', eff.stats.calls >= 4, JSON.stringify(eff.stats));

  // ---- ③e 导出回归锁:内存候选存在时 exportPack 走选中候选(曾有 {list,sel}
  //      对象被当像素用 → new ImageData 长度不匹配抛错的 bug) ----
  const exp = await page.evaluate(async () => {
    const b = window.__remasterBridge;
    // 当前条目已 remaster(内存有候选)且验收一张 → exportPack 必须处理候选对象
    await b.accept();
    const r = await b.exportPack();
    return { error: r?.error ?? null, sheets: r?.sheets ?? 0, frames: r?.frames ?? 0 };
  });
  chk('exportPack 处理内存候选不炸(返回摘要)', exp.error === null && exp.sheets > 0, JSON.stringify(exp));

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
