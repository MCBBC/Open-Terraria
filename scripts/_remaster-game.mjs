// 素材重制 M6 游戏侧端到端探针:标题菜单「素材包」入口 → RemasterPanel →
// manager.importZip 应用(vimages 注入)→ 卸载还原 → 冷开启动自动应用(applyInstalled)。
// 运行:SW_ORIGIN=http://localhost:5205 node tools/run-diag.mjs scripts/_remaster-game.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 400)));
const ok = [];
const chk = (name, cond, extra = '') => {
  ok.push(!!cond);
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  [' + extra + ']' : ''}`);
};

/** 构造单 sheet 测试包字节(在页面上下文里,与游戏同源 IDB) */
async function makeTestPack() {
  return await page.evaluate(async () => {
    const { makePack, buildManifest } = await import('/src/remaster/PackFormat.ts');
    const png = new Uint8Array(await (await fetch('sprites/vanilla/NPC_1.png')).arrayBuffer());
    const m = buildManifest('E2E 测试包', 'probe', {
      'vanilla/NPC_1.png': { category: 'npc', complete: true, frames: { '0': { status: 'accepted', rect: [0, 0, 32, 26], hash: 'x' } } },
    });
    return Array.from(makePack(m, [{ file: 'vanilla/NPC_1.png', png }]));
  });
}

try {
  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__swRemaster, { timeout: 60000 });
  await page.waitForFunction(() => window.__swAtlas?.vimages, { timeout: 30000 });
  await page.waitForFunction(() => !!document.querySelector('.sw-title-menu'), { timeout: 30000 });

  // ---- ① Runtime/Manager 装配 ----
  const wired = await page.evaluate(() => {
    const w = window.__swRemaster;
    return { hasRt: !!w.runtime, hasMgr: !!w.manager, onApplied: !!w.runtime.onApplied };
  });
  chk('__swRemaster 装配(runtime+manager+onApplied 钩子)', wired.hasRt && wired.hasMgr && wired.onApplied, JSON.stringify(wired));

  // ---- ② 标题菜单入口 ----
  const menuBtn = await page.evaluate(() => {
    const el = document.querySelector('[data-act=packs]');
    return { exists: !!el, text: el?.textContent };
  });
  chk('标题菜单含「素材包」按钮', menuBtn.exists, menuBtn.text);

  // ---- ③ 点击打开面板 ----
  await page.click('[data-act=packs]');
  await page.waitForSelector('.sw-rmp', { timeout: 8000 });
  const panel = await page.evaluate(() => ({
    title: document.querySelector('.sw-rmp h2')?.textContent,
    empty: !!document.querySelector('.sw-rmp .empty'),
    importBtn: !!document.querySelector('.sw-rmp .import'),
  }));
  chk('RemasterPanel 打开(标题/空态/导入按钮)', !!(panel.title && panel.empty && panel.importBtn), JSON.stringify(panel));

  // ---- ④ importZip 应用注入 ----
  const zipBytes = await makeTestPack();
  const imported = await page.evaluate(async (bytes) => {
    const mgr = window.__swRemaster.manager;
    const before = window.__swAtlas.vimages.get('vanilla/NPC_1.png');
    const r = await mgr.importZip(new Uint8Array(bytes));
    const after = window.__swAtlas.vimages.get('vanilla/NPC_1.png');
    return { applied: r.apply.applied.length, changed: before !== after && !!after, name: r.meta.name };
  }, zipBytes);
  chk('importZip:applied 1 张 & vimages 引用已换', imported.applied === 1 && imported.changed, JSON.stringify(imported));

  // 已装列表(importZip 直调 manager,面板 UI 的刷新走面板自身交互;此处验数据层)
  const listed = await page.evaluate(async () => (await window.__swRemaster.manager.list()).map((m) => m.name));
  chk('已装列表出现条目', listed.length === 1 && listed[0] === 'E2E 测试包', JSON.stringify(listed));

  // ---- ⑤ 卸载还原(restoreVanilla 重拉原版) ----
  const removed = await page.evaluate(async () => {
    const mgr = window.__swRemaster.manager;
    const before = window.__swAtlas.vimages.get('vanilla/NPC_1.png');
    await mgr.remove((await mgr.list())[0].id);
    const after = window.__swAtlas.vimages.get('vanilla/NPC_1.png');
    return { changed: before !== after, isBitmapOrImg: after instanceof ImageBitmap || after instanceof HTMLImageElement };
  });
  chk('卸载:restoreVanilla 引用换回原版源', removed.changed && removed.isBitmapOrImg, JSON.stringify(removed));

  // ---- ⑥ 冷开自动应用:重装 → reload → 启动即已注入 ----
  await page.evaluate(async (bytes) => {
    await window.__swRemaster.manager.importZip(new Uint8Array(bytes));
  }, zipBytes);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__swAtlas?.vimages, { timeout: 60000 });
  const boot = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 1500));   // 启动应用发生在 loadAssets(菜单前)
    const mgr = window.__swRemaster.manager;
    const list = await mgr.list();
    return { installed: list.length, injected: !!window.__swAtlas.vimages.get('vanilla/NPC_1.png') };
  });
  chk('冷开:pack 持久化仍在(IDB)且启动应用注入完成', boot.installed >= 1 && boot.injected, JSON.stringify(boot));

  const pass = ok.filter(Boolean).length;
  console.log(`\n===== ${pass}/${ok.length} PASS =====`);
  // 清理测试 pack(留环境的探针自己扫尾;须在 browser.close 前)
  const clean = await browser.newPage();
  await clean.goto(`${ORIGIN}/remaster.html`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await clean.evaluate(async () => {
    const { remasterAll, remasterDelete } = await import('/src/save/KvStore.ts');
    for (const row of await remasterAll()) {
      if (row.name.includes('E2E')) await remasterDelete(row.id);
    }
  }).catch(() => {});
  await clean.close();
  await browser.close();
  process.exit(pass === ok.length ? 0 : 1);
} catch (err) {
  console.log('FATAL:', err);
  await browser.close();
  process.exit(1);
}
