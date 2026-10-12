// ★626c worker boot 定位:无 mod 干净域→worker 握手是否 3s 内就绪;
//  带 mod 域→同测。记录 worker onerror/所有消息时间戳。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const WITH_MOD = process.env.WITH_MOD === '1';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});

if (WITH_MOD) {
  const p1 = await browser.newPage();
  await p1.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    if (await p1.evaluate(() => !!window.__swMods?.install).catch(() => false)) break;
  }
  await p1.evaluate(async () => {
    const buf = await fetch('mods/dist/calamity.swmod').then(r => r.arrayBuffer());
    await window.__swMods.install(new Uint8Array(buf));
  });
  await p1.close();
}

const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERR:', String(e?.stack ?? e).slice(0, 300)));
page.on('console', m => console.log(`  [c.${m.type()}] ${m.text().slice(0, 200)}`));
await page.evaluateOnNewDocument(() => {
  window.__hb = 0;
  setInterval(() => { window.__hb++; }, 500);
  window.__wlog = [];
  const OrigWorker = window.Worker;
  function SpyWorker(...args) {
    const w = new OrigWorker(...args);
    const tag = String(args[0]).split('/').pop() + '#' + window.__wlog.length;
    const t0 = performance.now();
    window.__wlog.push(`SPAWN ${tag} @${(t0 / 1000).toFixed(1)}s`);
    const origAdd = w.addEventListener.bind(w);
    w.addEventListener = function(type, fn, opts) {
      if (type === 'message') origAdd(type, (ev) => {
        const d = ev.data ?? {};
        window.__wlog.push(`MSG ${tag} ${(d.type ?? '?')} @${((performance.now()) / 1000).toFixed(1)}s`);
      });
      return origAdd(type, fn, opts);
    };
    w.onerror = (e) => { window.__wlog.push(`ERR ${tag} @${(performance.now() / 1000).toFixed(1)}s ${String(e.message ?? '').slice(0, 120)}`); };
    // ★插桩中立性:委托【原生】onmessage 描述符(替换式 defineProperty 会吞掉客户端
    //  处理器=制造假握手超时,首版探针判谳已翻案);只旁挂记录监听
    const dsc = Object.getOwnPropertyDescriptor(OrigWorker.prototype, 'onmessage');
    Object.defineProperty(w, 'onmessage', {
      get() { return dsc.get.call(w); },
      set(fn) {
        dsc.set.call(w, fn);
        origAdd('message', (ev) => {
          const d = ev.data ?? {};
          window.__wlog.push(`MSG ${tag} ${(d.type ?? '?')} @${(performance.now() / 1000).toFixed(1)}s`);
        });
      },
    });
    return w;
  }
  SpyWorker.prototype = OrigWorker.prototype;
  window.Worker = SpyWorker;
});
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 });
for (let i = 1; i <= 20; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const r = await Promise.race([
    page.evaluate(() => ({ hb: window.__hb, wlog: window.__wlog.slice(-14),
      inGame: !!(window.__swGame && window.__swGame.world) })).catch(e => ({ err: String(e).slice(0, 60) })),
    new Promise(res => setTimeout(() => res({ frozen: true }), 3000)),
  ]);
  console.log(`t+${i * 5}s:`, JSON.stringify(r).slice(0, 1200));
  if (r.inGame || r.frozen) break;
}
await browser.close();
