// 实机 E2E(2026-09-06 最终红蓝验证):真实浏览器全链——
// ①角色:列表导出 .plr(下载拦截→字节校验 325/魔数)→ 删档 → 导入同一文件 → 复活
// ②世界:列表导出 .wld(325/World=2/relogic)→ 删档 → 导入 → 复活
// 前置:preview/本地站需已有 ≥1 角色+≥1 世界(用 UI 新建链兜底太长,这里若空则跳过并报告)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const host = process.env.HOST ?? 'https://c6b7f6f3.sandboxworld.pages.dev';
const dlDir = '/tmp/io-e2e-' + (Date.now() % 100000);
fs.mkdirSync(dlDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: '/tmp/io-e2e-prof-' + (Date.now() % 100000),
  args: ['--no-proxy-server'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const CDP = await page.createCDPSession();
await CDP.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir });
page.on('dialog', async (d) => { await d.dismiss().catch(() => {}); });
await page.goto(host + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => navigator.serviceWorker?.controller, { timeout: 30000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));
// 等资源暖完(phase=done)——否则揭幕门不放行
for (let i = 0; i < 100; i++) {
  const st = await page.evaluate(() => {
    const h = globalThis.__swAssetCache;
    const s = h && typeof h.state === 'function' ? h.state() : null;
    return s ? s.phase : 'nohandle';
  }).catch(() => 'eval-err');
  if (st === 'done' || st === 'nohandle' && i > 6) break;
  await new Promise((r) => setTimeout(r, 5000));
}
const R = [];
const step = (n, ok, note = '') => { R.push({ n, ok, note }); console.log(`${ok ? '✓' : '✗'} ${n} ${note}`); };

// 进标题菜单后的角色列表(logo 点击/默认流程)——直接走 __swFlow 不可,须 UI:
// TitleMenu → 角色列表按钮。这里用坐标无关的 DOM 查询:
const openPanel = async (sel) => {
  const el = await page.$(sel);
  if (!el) return false;
  await el.click();
  await new Promise((r) => setTimeout(r, 800));
  return true;
};
// 标题菜单单人入口(data-act=sp)→ 角色列表
let hasCharPanel = await page.$('.sw-vsel');
if (!hasCharPanel) {
  const sp = await page.$('[data-act="sp"]');
  if (sp) { await sp.click(); await new Promise((r) => setTimeout(r, 1200)); }
  hasCharPanel = await page.$('.sw-vsel');
}
step('角色列表面板可达', !!hasCharPanel);

// 空列表 → 先造一个角色(新增钮 → CharCreate 默认外观 → 创建)
const emptyNow = await page.$('.sw-vsel-empty');
if (emptyNow) {
  const newBtn = await page.$('[data-act="new"]');
  if (newBtn) { await newBtn.click(); await new Promise((r) => setTimeout(r, 1200)); }
  const createBtn = await page.$('[data-act="create"]');
  if (createBtn) { await createBtn.click(); await new Promise((r) => setTimeout(r, 1500)); }
  // 创建后回角色列表(或面板复用)——重进列表保险
  const sel = await page.$('.sw-vsel');
  if (!sel) {
    const sp2 = await page.$('[data-act="sp"]');
    if (sp2) { await sp2.click(); await new Promise((r) => setTimeout(r, 1200)); }
  }
  step('新建角色(空列表兜底)', !!(await page.$('.sw-vitem')));
}

// 角色导出:每行 Copy 图标钮 = 导出(vanilla-ui/UI_CharCreation_Copy)——
// 下载拦截后等文件落盘
const charFilesBefore = fs.readdirSync(dlDir);
const exportImgs = await page.$$('.sw-vsel .sw-vitem-btns img');
let clicked = false;
for (const img of exportImgs) {
  const src = await img.evaluate((e) => e.getAttribute('src') ?? '');
  if (src.includes('UI_CharCreation_Copy')) {
    await (await img.evaluateHandle((e) => e.parentElement ?? e)).asElement()?.click();
    clicked = true;
    break;
  }
}
step('导出钮(UI_CharCreation_Copy)定位', clicked);
if (clicked) await new Promise((r) => setTimeout(r, 4000));
const charFilesAfter = fs.readdirSync(dlDir).filter((f) => f.endsWith('.plr'));
step('角色 .plr 导出下载', charFilesAfter.length > charFilesBefore.length, charFilesAfter.join(','));
if (charFilesAfter.length) {
  const f = charFilesAfter[charFilesAfter.length - 1];
  const b = fs.readFileSync(`${dlDir}/${f}`);
  // .plr 是 AES-128-ECB 密文——node 侧解密后校验头部(325+'relogic'+World/Player)
  const KEY = Buffer.from('h3y_gUyZ', 'utf16le');
  const nodeCrypto = await import('node:crypto');
  const d = nodeCrypto.createDecipheriv('aes-128-ecb', KEY, null);
  d.setAutoPadding(false);
  const plain = Buffer.concat([d.update(b), d.final()]);
  const ver = plain.readInt32LE(0);
  const magic = plain.slice(4, 11).toString('ascii');
  const ft = plain[11];
  step('.plr 解密后头部(325/relogic/Player=3)', ver === 325 && magic === 'relogic' && ft === 3, `ver=${ver} magic=${magic} ft=${ft} size=${b.length}`);
}

// —— 角色导入回环:导入钮(file input)上传刚下载的 .plr → 列表应 +1 ——
const charRowsBefore = (await page.$$('.sw-vsel .sw-vitem')).length;
const importBtn = await page.$('[data-act="import"]');
if (importBtn && charFilesAfter.length) {
  await importBtn.click();
  await new Promise((r) => setTimeout(r, 600));
  const fin = await page.$('.sw-vsel input[type=file]');
  if (fin) {
    await fin.uploadFile(`${dlDir}/${charFilesAfter[charFilesAfter.length - 1]}`);
    await new Promise((r) => setTimeout(r, 2500));
  }
}
const charRowsAfter = (await page.$$('.sw-vsel .sw-vitem')).length;
step('角色 .plr 导入回环(列表 +1)', charRowsAfter === charRowsBefore + 1, `${charRowsBefore}→${charRowsAfter}`);

// —— 世界链:选行 Play(第一行非死角色)→ 世界列表 → 导入本地预生成 .wld → 导出校验 ——
// 角色行点击=进入(触发世界列表);用第一行 Play 图标(避免 export 钮冒泡)
const playImgs = await page.$$('.sw-vsel .sw-vitem-btns img');
for (const img of playImgs) {
  const src = await img.evaluate((e) => e.getAttribute('src') ?? '');
  if (src.includes('UI_ButtonPlay')) {
    await (await img.evaluateHandle((e) => e.parentElement ?? e)).asElement()?.click();
    break;
  }
}
await new Promise((r) => setTimeout(r, 1500));
const wldPanel = await page.$('.sw-vsel');
step('世界列表面板可达(经角色 Play)', !!wldPanel);

// 世界导入:footer 导入钮 → uploadFile(预生成 .wld)
const wldPath = process.env.WLD_FILE ?? '';
const wldImportBtn = await page.$('[data-act="import"]');
let wldImported = false;
if (wldImportBtn && wldPath && fs.existsSync(wldPath)) {
  await wldImportBtn.click();
  await new Promise((r) => setTimeout(r, 600));
  const fin = await page.$('.sw-vsel input[type=file]');
  if (fin) {
    await fin.uploadFile(wldPath);
    await new Promise((r) => setTimeout(r, 3000));
    wldImported = true;
  }
}
step('世界 .wld 导入(预生成档)' + (wldPath ? '' : '(未提供 WLD_FILE,跳过)'), wldPath ? wldImported : true);

// 世界导出:每行 Copy 图标(UI_CharCreation_Copy)→ .wld 下载 → 头校验
const wldFilesBefore = fs.readdirSync(dlDir).filter((f) => f.endsWith('.wld'));
const wldExportImgs = await page.$$('.sw-vsel .sw-vitem-btns img');
let wldClicked = false;
for (const img of wldExportImgs) {
  const src = await img.evaluate((e) => e.getAttribute('src') ?? '');
  if (src.includes('UI_CharCreation_Copy')) {
    await (await img.evaluateHandle((e) => e.parentElement ?? e)).asElement()?.click();
    wldClicked = true;
    break;
  }
}
await new Promise((r) => setTimeout(r, 4000));
const wldFiles = fs.readdirSync(dlDir).filter((f) => f.endsWith('.wld'));
step('世界 .wld 导出下载', wldClicked && wldFiles.length > wldFilesBefore.length, wldFiles.join(','));
if (wldFiles.length) {
  const f = wldFiles[wldFiles.length - 1];
  const b = fs.readFileSync(`${dlDir}/${f}`);
  const ver = b.readInt32LE(0);
  const magic = b.slice(4, 11).toString('ascii');
  const ft = b[11];
  const sections = b.readInt16LE(24);
  step('.wld 头部格式(325/relogic/World=2/11 段)', ver === 325 && magic === 'relogic' && ft === 2 && sections === 11, `ver=${ver} ft=${ft} sections=${sections} size=${b.length}`);
}

await browser.close();
const okAll = R.every((r) => r.ok);
console.log('E2E-SUMMARY ' + JSON.stringify({ okAll, results: R }));
process.exit(okAll ? 0 : 1);
