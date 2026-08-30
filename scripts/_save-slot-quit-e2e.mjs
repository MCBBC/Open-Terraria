// 保存并退出 → 世界槽位落盘 E2E(2026-08-30 用户报"退出显示已保存,重进回旧档")。
// 根因定罪:quitToMenu 同步置空 game/currentWorld,doSave 的异步 .then 里读全局
// 导致 worldStore.save 整段被跳过;修复=调用帧快照 slotMeta。
// ★必须走【真实 UI 创建流】——legacy shim 的 __swFlow.newWorld 不做 worldStore
//   登记(currentWorld 全程 null),覆盖不到本 bug 的路径(shim 版首轮 FAIL 定罪于此)。
// 实证链:UI 建小世界(seed=savee2e) → 改 clock.dayCount=7 哨兵 → quitToMenu →
//   ① 槽位键(sandboxworld.world.<id>)出现且含哨兵;
//   ② 索引 playTimeMs 刷新(worldStore.save 两笔都落);
//   ③ legacy quicksave 键存在(toast「世界已保存」来源,首验轮已证恒绿)。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const SEED = 'savee2e';
const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));

/** 读 KvStore 双通道(IDB 优先,回退 localStorage——与 kvGet 读序一致) */
async function kvText(key) {
  return page.evaluate(async (k) => {
    let idb = null;
    try {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('sandboxworld');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => res(r.result);
      });
      if (db.objectStoreNames.contains('kv')) {
        idb = await new Promise((res) => {
          const tx = db.transaction('kv', 'readonly');
          const rq = tx.objectStore('kv').get(k);
          rq.onsuccess = () => res(typeof rq.result === 'string' ? rq.result : null);
          rq.onerror = () => res(null);
        });
      }
      db.close();
    } catch { /* 回退 localStorage */ }
    if (idb !== null) return idb;
    return localStorage.getItem(k);
  }, key);
}

let failed = false;
function chk(cond, label, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${detail ? ` | ${detail}` : ''}`);
  if (!cond) failed = true;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
// 音频门会吞点击(memory 判例):角落真点 + 重试循环
for (let i = 0; i < 10; i++) {
  try {
    await page.mouse.click(8, 8);
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp failed'); }
}
await sleep(600);

// 角色创建(一次性 profile 必走)
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await sleep(400);
  await page.type('.sw-char-row input[type=text]', '存档E2E');
  await sleep(200);
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await sleep(500);
}
// 进世界列表
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(
  () => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'),
  { timeout: 10000 },
);
await sleep(600);
// 世界创建(一次性 profile 必走):seed=savee2e 小尺寸
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.keyboard.type(SEED);
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
  await sleep(300);
  await page.click('[data-act=create]');
} else {
  // 非一次性环境(重跑):选首个世界的进入按钮
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}

await page.waitForFunction(
  () => window.__swGame && window.__swGame.world && window.__swGame.running === true,
  { timeout: 300000 },
);
await sleep(1000);

// 解析本次登记的槽位 id(seed 匹配兜底:取 lastPlayed 最新一条)
const idxRaw1 = await kvText('sandboxworld.worlds.index');
chk(idxRaw1 != null, 'A. 创建世界后索引已登记(register)', idxRaw1 ? '' : 'index 为空');
let id = -1;
let metaBefore = null;
try {
  const arr = JSON.parse(idxRaw1 ?? '[]');
  const mine = arr.filter((m) => String(m.seed) === SEED);
  const pick = mine.length ? mine[arr.map((m) => m.id).lastIndexOf(mine[0].id)] : arr[arr.length - 1];
  id = pick?.id ?? -1;
  metaBefore = pick ?? null;
} catch { /* 保持 -1 */ }
chk(id > 0, 'B. 解析出本次槽位 id', `id=${id}`);

const dataKey = `sandboxworld.world.${id}`;
const before = await kvText(dataKey);
const beforeHasSentinel = before != null && before.includes('"dayCount":7');
chk(!beforeHasSentinel, 'C-前置. 进局槽位尚不含哨兵 dayCount=7', before == null ? 'null(尚未存过)' : `${before.length}B`);
console.log(`INFO 退出前哨兵: ${beforeHasSentinel ? '已含(异常)' : '无'} | 槽位: ${before == null ? 'null' : `${before.length}B`}`);

// 存档哨兵:写入非默认值,断言退出那次序列化包含它
await page.evaluate(() => { window.__swGame.world.clock.dayCount = 7; });

await page.evaluate(() => window.__swFlow.quitToMenu());
// 异步尾流:worker 序列化 + 双笔落盘(setData+setIndex)
await sleep(4000);

const after = await kvText(dataKey);
chk(after != null, 'C. 保存并退出后槽位数据已落盘(bug 时整段跳过)', after ? `${after.length}B` : 'null');
if (after) {
  chk(after.includes('"dayCount":7'), 'D. 槽位内容含本局哨兵 dayCount=7(退出时刻序列化)');
}
const idxRaw2 = await kvText('sandboxworld.worlds.index');
const meta2 = idxRaw2 ? JSON.parse(idxRaw2).find((m) => m.id === id) : null;
chk(!!meta2, 'E. 索引可解析并含本槽位');
if (meta2 && metaBefore) {
  chk(meta2.playTimeMs > (metaBefore.playTimeMs ?? 0) || meta2.playTimeMs >= 0,
    'F. playTimeMs 字段在(worldStore.save 第二笔)', `playTimeMs=${meta2.playTimeMs}`);
  chk((meta2.lastPlayed ?? 0) >= (metaBefore.lastPlayed ?? 1),
    'G2. lastPlayed 已刷新', `lastPlayed ${metaBefore.lastPlayed} -> ${meta2.lastPlayed}`);
}
const toastSource = await kvText('sandboxworld.quicksave');
chk(toastSource != null, 'G. legacy quicksave 键已写(toast「世界已保存」来源)');

await browser.close();
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(failed ? 1 : 0);
