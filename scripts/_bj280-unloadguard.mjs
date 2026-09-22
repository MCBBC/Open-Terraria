// ★BJ280 页面刷新/关闭存档拦截——探针（私有 vite 习语：SW_ORIGIN 指向 52xx 实例）。
// 断言面：
//  ①标题态不拦（unloadGuardDirty=false + 合成 beforeunload 不 preventDefault）
//  ②进世界置 dirty（enterGame→onWorldReady 收口）+ 合成 beforeunload 被拦
//    （defaultPrevented=true + returnValue=''——真实注册 handler 的页内实证）
//  ③visibilitychange hidden 兜底：dirty 会话切后台 → 静默自动保存
//    （IDB sandboxworld/kv 的 sandboxworld.quicksave 由无→有实证；silent 档不清 dirty）
//  ④真 reload 弹原生确认（headless 软实证：Page.javascriptDialogOpening type=beforeunload；
//    headless 变体可能吞框——硬断言以②的页内派发为准）
//  ⑤手动保存（doSave 非静默）清 dirty → 不拦
//  ⑥quitToMenu 回标题清 dirty
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 300)));
page.on('console', async (m) => {
  const texts = await Promise.all(m.args().map((a) => a.jsonValue().then((v) => String(v)).catch(() => '<unserializable>')));
  const line = `${m.type()}: ${texts.join(' ')}`;
  if (/error|fail/i.test(line)) console.log('[console]', line.slice(0, 300));
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const readQuicksave = () => page.evaluate(() => new Promise((res) => {
  try {
    const req = indexedDB.open('sandboxworld', 2);
    req.onerror = () => res(null);
    req.onsuccess = () => {
      const db = req.result;
      try {
        const g = db.transaction('kv', 'readonly').objectStore('kv').get('sandboxworld.quicksave');
        g.onsuccess = () => res(g.result ?? null);
        g.onerror = () => res(null);
      } catch { res(null); }
    };
  } catch { res(null); }
}));
/** 页内派发可取消 beforeunload：返回 {defaultPrevented, returnValue}（真实注册 handler 实证） */
const fireUnload = () => page.evaluate(() => {
  const ev = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(ev);
  return { defaultPrevented: ev.defaultPrevented, returnValue: ev.returnValue };
});
const dirty = () => page.evaluate(() => window.__swFlow?.unloadGuardDirty?.() ?? null);
/** 清 quicksave（探针可重入：③的「无→有」判据不受上轮残留污染） */
const clearQuicksave = () => page.evaluate(() => new Promise((res) => {
  try {
    const req = indexedDB.open('sandboxworld', 2);
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').delete('sandboxworld.quicksave');
        tx.oncomplete = () => res(true);
        tx.onerror = () => res(false);
      } catch { res(false); }
    };
    req.onerror = () => res(false);
  } catch { res(false); }
}));
const enterWorld = async (tag) => {
  await page.evaluate(() => { window.__swFlow.newWorld('', 4200, 1200); });
  await page.waitForFunction(() => !!window.__swGame?.world, { timeout: 180000, polling: 500 });
  await wait(1200);   // onWorldReady→enterGame 链 settling（首绘竞速 4 帧内完成）
  console.log(`[probe] ${tag} world ready, dirty=`, await dirty());
};

const t0 = Date.now();
const step = (n, ok, detail = '') => {
  console.log(`[probe] ${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? '  ' + detail : ''}`);
  if (!ok) process.exitCode = 1;
};

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
console.log('[probe] menu ok', Date.now() - t0, 'ms');
console.log('[probe] clear quicksave:', await clearQuicksave());

// ① 标题态：永不 dirty、不拦
step('①标题态不拦', (await dirty()) === false && (await fireUnload()).defaultPrevented === false,
  `dirty=${await dirty()} unload=${JSON.stringify(await fireUnload())}`);

// ② 进世界：dirty 置位 + 合成 beforeunload 被真 handler 拦下
await enterWorld('②');
const d2 = await dirty();
const u2 = await fireUnload();
// ★合成 Event.returnValue 是 boolean（''→强转 false）;真 BeforeUnloadEvent 才是字符串 ''。
// 判 falsy 两者通吃;defaultPrevented=true 才是拦截面真身。
step('②进世界 dirty+拦截', d2 === true && u2.defaultPrevented === true && !u2.returnValue,
  `dirty=${d2} unload=${JSON.stringify(u2)}`);

// ③ 隐藏兜底：切后台（visibilityState→hidden + 事件）→ 静默自动保存（quicksave 无→有）
const before = await readQuicksave();
await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
});
let after = null;
for (let i = 0; i < 40 && !after; i++) { await wait(500); after = await readQuicksave(); }
await page.evaluate(() => {
  delete document.visibilityState;   // 摘实例影射,原型 getter 复位
  document.dispatchEvent(new Event('visibilitychange'));
});
step('③隐藏兜底自动保存', !before && !!after && after.length > 1000,
  `quicksave ${before ? 'len=' + before.length : 'absent'} → ${after ? 'len=' + after.length : 'absent'}`);
step('③b静默档不清 dirty（保守语义）', (await dirty()) === true, `dirty=${await dirty()}`);

// ④ 真 reload 原生确认（headless 软实证）
let dialogType = null;
page.once('dialog', async (dlg) => { dialogType = dlg.type(); console.log('[probe] dialog:', dialogType, dlg.message().slice(0, 80)); await dlg.accept().catch(() => {}); });
const nav = await Promise.race([
  page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).then(() => 'navigated').catch((e) => 'nav-err:' + String(e).slice(0, 100)),
  wait(20000).then(() => 'nav-timeout'),
]);
if (dialogType === 'beforeunload') {
  step('④真reload弹原生确认', true, `nav=${nav}`);
} else {
  console.log(`[probe] NOTE ④ headless 未弹原生框（dialogType=${dialogType}, nav=${nav}）——硬断言以②页内派发为准`);
}
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
await wait(800);

// ⑤ 手动保存清 dirty → 不拦
await enterWorld('⑤');
step('⑤a重进再置 dirty（会话重臂）', (await dirty()) === true, `dirty=${await dirty()}`);
const saved = await page.evaluate(() => window.__swFlow.doSave().then((r) => r).catch((e) => 'err:' + String(e).slice(0, 80)));
const u5 = await fireUnload();
step('⑤b手动保存清 dirty+不拦', saved === true && (await dirty()) === false && u5.defaultPrevented === false,
  `doSave=${JSON.stringify(saved)} dirty=${await dirty()} unload=${JSON.stringify(u5)}`);

// ⑥ 保存并退出落定 → 回标题清（挂 rejection 捕获取证;dirty 与 __swGame 双轮询）
await page.evaluate(() => {
  window.__swQtmErr = null;
  window.__swFlow.quitToMenu().catch((e) => { window.__swQtmErr = String(e && e.stack || e).slice(0, 400); });
});
for (let i = 0; i < 60 && (await dirty()) !== false; i++) await wait(500);
let gameGone = false;
for (let i = 0; i < 20; i++) { gameGone = await page.evaluate(() => !window.__swGame); if (gameGone) break; await wait(500); }
const qtmErr = await page.evaluate(() => window.__swQtmErr);
step('⑥回标题清 dirty', (await dirty()) === false && gameGone,
  `dirty=${await dirty()} gameGone=${gameGone} qtmErr=${qtmErr ?? 'none'}`);

console.log('[probe] pageerrors', errs.length ? errs.slice(0, 3) : 'none');
await browser.close().catch(() => {});
process.exit(process.exitCode ?? (errs.length === 0 ? 0 : 1));
