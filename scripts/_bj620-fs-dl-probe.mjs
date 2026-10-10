// BJ620 件6 探针 B（UNVERIFIED #1/#2 实测）：同秒 createWritable 并发 + Chrome 多重自动下载拦截。
// 运行：SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=180000 scripts/_bj620-fs-dl-probe.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5202');
const DL_DIR = '/tmp/bj620-dl';
mkdirSync(DL_DIR, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: { width: 1280, height: 800 } });
const page = (await browser.pages())[0] ?? await browser.newPage();
const consoleLines = [];
page.on('console', (m) => { const t = m.text(); if (/fsBackup|kv\]/.test(t)) consoleLines.push(t.slice(0, 220)); });
page.on('pageerror', (e) => consoleLines.push('PAGEERROR: ' + e.message.slice(0, 220)));
await page.goto(URL + '/?seedkv=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000, polling: 300 });

// ============ UNVERIFIED #1：同文件并发 createWritable（OPFS 同 API 通道） ============
console.log('==== #1 同文件并发 createWritable（OPFS 通道;与磁盘通道同 Chromium FileSystemWritableFileStream 实现） ====');
const opfs = await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  const fh = await root.getFileHandle('bj620-conc.txt', { create: true });
  const out = { secondCreateWritable: 'ok', error: null };
  const w1 = await fh.createWritable();
  try {
    const w2 = await fh.createWritable();   // 同文件第二个可写流——冲突与否在此定谳
    await w2.write('B');
    await w2.close();
  } catch (e) { out.secondCreateWritable = 'throw'; out.error = `${e.name}: ${e.message}`; }
  try { await w1.write('A'); await w1.close(); } catch (e) { out.firstClose = `${e.name}: ${e.message}`; }
  // 终态读回（最后 close 者胜 or 混合）——OPFS 句柄无 .text(),走 getFile()
  const f = await (await root.getFileHandle('bj620-conc.txt')).getFile();
  out.finalContent = await f.text();
  return out;
});
console.log('OPFS 并发 createWritable 实测:', JSON.stringify(opfs));

// ============ 全链形态：FS 备份句柄注入 → 双 doSave 同秒 → 观察快照写败/broken 闪断 ============
console.log('==== #1b 全链：OPFS 句柄入 IDB → 重载 → 连续两次 doSave（同秒快照） ====');
await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  await new Promise((res, rej) => {
    const req = indexedDB.open('sandboxworld', 2);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(root, 'sandboxworld.fsBackup.dir');
      tx.oncomplete = () => { db.close(); res(1); };
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
});
await page.goto(URL + '/?seedkv=bj620fs2&v2=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000, polling: 300 });
await new Promise((r) => setTimeout(r, 1500));   // FsBackup 模块预取装载句柄
// 小世界创建（4200×1200 快）
await page.evaluate(() => { void window.__swFlow.createWorldProbe({ name: 'BJ620快照', w: 4200, h: 1200, size: 0, seed: 'bj620fs' }); });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.world?.store?.w > 0; }, { timeout: 240000, polling: 500 });
await new Promise((r) => setTimeout(r, 2500));
const sameSecond = await page.evaluate(async () => {
  // 同秒双链：saveClient 串行序列化,两次快照窗口重叠/紧邻（同秒同名 quicksave.json）
  await Promise.all([window.__swFlow.doSave(true), window.__swFlow.doSave(true)]);
  return Date.now();
});
console.log('双 doSave 完成（同秒发起 @', sameSecond, '）;fsBackup 面console 物证:');
for (const l of consoleLines.filter((l) => /fsBackup/.test(l))) console.log('  ', l);
if (!consoleLines.some((l) => /fsBackup/.test(l) && /失败/.test(l))) {
  console.log('  → 全链双快照零失败告警（NoModificationAllowedError 未触发 noteWriteFailure）');
}
consoleLines.length = 0;

// ============ UNVERIFIED #2：Chrome 多重自动下载拦截 ============
console.log('==== #2 连续 6 次程序触发下载（无手势,= 存储写败自动导出同形态） ====');
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL_DIR, eventsEnabled: true });
const began = [];
cdp.on('Browser.downloadWillBegin', (e) => began.push({ guid: e.guid, file: e.suggestedFilename }));
for (let i = 0; i < 6; i++) {
  await page.evaluate((i) => {
    const blob = new Blob([JSON.stringify({ probe: 'bj620-dl', i })], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bj620-dl-${i}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }, i);
  await new Promise((r) => setTimeout(r, 350));
}
await new Promise((r) => setTimeout(r, 3000));
console.log(`downloadWillBegin 触发 ${began.length}/6：`, began.map((b) => b.file).join(', ') || '（全被拦）');
console.log(began.length < 6 ? '→ Chrome 对多重自动下载存在拦截（触发面成立）' : '→ 6/6 全部放行（拦截未触发=销案面）');
console.log('（#2 补充：有无 infobar 需人工核,headful 窗口保留 2s）');
await new Promise((r) => setTimeout(r, 2000));
await browser.close();
console.log('==== 探针 B 完 ====');
