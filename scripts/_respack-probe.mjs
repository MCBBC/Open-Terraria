// M13 资源包端到端探针:上传→启用→覆盖生效(atlas/vicon/sfx)→IDB 持久化(重载恢复)→卸载。
// 运行(私有 vite 实例):
//   SW_PORT=5203 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5203 nohup npx vite > /tmp/vite-5203.log 2>&1 &
//   SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_respack-probe.mjs
// 哨兵包:Cursor_0 全品红 20×20 / Item_75 全青 32×32 / Item_29.wav 占位字节。
import puppeteer from 'puppeteer-core';
import { zipSync, strToU8 } from 'fflate';
import { PNG } from 'pngjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';

function solidPng(w, h, r, g, b) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = r; png.data[i * 4 + 1] = g; png.data[i * 4 + 2] = b; png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

const ZIP_B64 = Buffer.from(zipSync({
  'pack.json': strToU8(JSON.stringify({
    Name: '探针光标包', Description: 'E2E 哨兵', Author: 'probe', Version: { major: 9, minor: 9 },
  })),
  'Content/Images/UI/Cursor_0.png': solidPng(20, 20, 255, 0, 255),
  'Content/Images/Item_75.png': solidPng(32, 32, 0, 255, 255),
  'Content/Sounds/Item_29.wav': new Uint8Array(16).fill(7),
})).toString('base64');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 500)));

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

try {
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__swResourcePacks, { timeout: 60000 });
  await page.waitForFunction(() => !!window.__swAtlas, { timeout: 60000 });

  // ---- 1. 导入(默认禁用;同 fileName 重跑幂等覆盖) ----
  const row = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const file = new File([bytes], 'ProbeCursorPack.zip', { type: 'application/zip' });
    const r = await window.__swResourcePacks.importPack(file);
    return { id: r.id, enabled: r.enabled, name: r.name, fileCount: r.fileCount, author: r.author };
  }, ZIP_B64);
  check('导入 zip:默认禁用+清单入行',
    row.enabled === false && row.name === '探针光标包' && row.author === 'probe' && row.fileCount === 2,
    JSON.stringify(row));

  // ---- 2. 启用 → 哨兵像素生效 ----
  const applied = await page.evaluate(async (id) => {
    await window.__swResourcePacks.setEnabled(id, true);
    await new Promise((r) => setTimeout(r, 1000));   // 解码落地窗口
    const atlas = window.__swAtlas;
    const cur = atlas.uiimages.get('vanilla-ui/UI_Cursor_0.png') ?? null;
    let cursorPx = 'MISS';
    if (cur) {
      const c = document.createElement('canvas');
      c.width = cur.width; c.height = cur.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(cur, 0, 0);
      cursorPx = [...ctx.getImageData(10, 10, 1, 1).data].join(',');
    }
    const icon = atlas.vicon(75);
    return {
      cursorSize: cur ? `${cur.width}x${cur.height}` : 'MISS',
      cursorPx,
      vicon: icon ? `${icon.sw}x${icon.sh}@${icon.sx},${icon.sy}` : 'null',
    };
  }, row.id);
  check('光标包替换 UI_Cursor_0(品红 20×20 哨兵)',
    applied.cursorSize === '20x20' && applied.cursorPx === '255,0,255,255', JSON.stringify(applied));
  check('物品覆盖 Item_75(vicon 整图 32×32)', applied.vicon === '32x32@0,0', JSON.stringify(applied));

  // ---- 3. 音效覆盖键(Sfx 模块整表下发) ----
  const sfxKeys = await page.evaluate(async () => (await import('/src/core/Sfx.ts')).sfxPackOverrideKeys());
  check('音效覆盖 Item_29 下发', JSON.stringify(sfxKeys) === '["Item_29"]', JSON.stringify(sfxKeys));

  // ---- 4. 禁用 → 撤销回原版 ----
  const afterOff = await page.evaluate(async (id) => {
    await window.__swResourcePacks.setEnabled(id, false);
    await new Promise((r) => setTimeout(r, 1500));   // 原版重拉窗口
    const img = window.__swAtlas.uiimages.get('vanilla-ui/UI_Cursor_0.png') ?? null;
    if (!img) return { px: 'MISS' };
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return { px: [...ctx.getImageData(10, 10, 1, 1).data].join(','), w: img.width };
  }, row.id);
  check('禁用后回原版光标(非品红)', afterOff.px !== '255,0,255,255', JSON.stringify(afterOff));

  // ---- 5. 重启用 → 重载 → IDB 持久化恢复 ----
  await page.evaluate(async (id) => { await window.__swResourcePacks.setEnabled(id, true); }, row.id);
  await new Promise((r) => setTimeout(r, 500));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__swResourcePacks, { timeout: 60000 });
  const restored = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 2000));   // applyInstalled 完成窗口
    const rows = window.__swResourcePacks.rows;
    const img = window.__swAtlas.uiimages.get('vanilla-ui/UI_Cursor_0.png');
    const sfx = await (await import('/src/core/Sfx.ts')).sfxPackOverrideKeys();
    return { rows: rows.map((x) => ({ name: x.name, enabled: x.enabled })), cursor: img ? `${img.width}` : 'MISS', sfx };
  });
  check('重载后 IDB 恢复(行+启用态+光标覆盖+音效覆盖)',
    restored.rows.length === 1 && restored.rows[0].enabled === true
      && restored.cursor === '20' && JSON.stringify(restored.sfx) === '["Item_29"]',
    JSON.stringify(restored));

  // ---- 6. 卸载 → 清干净(光标回原版 14px 基线;restoreVanilla 会重拉基础图入表) ----
  const removed = await page.evaluate(async () => {
    const rows = window.__swResourcePacks.rows;
    await window.__swResourcePacks.remove(rows[0].id);
    await new Promise((r) => setTimeout(r, 1200));
    const img = window.__swAtlas.uiimages.get('vanilla-ui/UI_Cursor_0.png') ?? null;
    return {
      rows: window.__swResourcePacks.rows.length,
      cursorW: img ? img.width : 0,   // 0=已删待懒加载 / 14=原版基线;均非包哨兵 20
      sfx: await (await import('/src/core/Sfx.ts')).sfxPackOverrideKeys(),
    };
  });
  check('卸载(行清空+光标回原版+音效清空)',
    removed.rows === 0 && removed.cursorW !== 20 && removed.sfx.length === 0, JSON.stringify(removed));

  const pass = results.filter(Boolean).length;
  console.log(`\n== 资源包 E2E: ${pass}/${results.length} PASS ==`);
  if (pass !== results.length) process.exitCode = 1;
} finally {
  await browser.close();
}
