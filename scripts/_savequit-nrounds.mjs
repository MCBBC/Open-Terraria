// ★BJ144 保存并退出 N 轮采样探针(2026-09-18 用户实报「有时候感觉没保存到」)。
// 定谳假设:quitToMenu fire-and-forget——标题即现,保存链(worker 序列化+quicksave
// IDB+槽位 IDB)在后台跑;① 秒点重进世界读到旧槽位(A 组) ② 退出后立刻关/刷标签
// 在途链整段撕掉(B 组)。原版锚:WorldGen.SaveAndQuit(WF:6649) menuMode=10 保存屏
// → SaveAndQuitCallBack(:6612) SavePlayer+SaveWorld 全落盘才 menuMode=0。
// 方法:每轮写入唯一 dayCount 哨兵(1000+r / 2000+r)→ 触发 quitToMenu(不 await,
// 模拟真实用户「看到标题就点」)→ A 组标题一现立刻从 UI 秒进世界读回哨兵;
// B 组标题一现立刻 page.reload() 再进世界读回。对照组:doSave() 正常保存路径。
// 判据:读回 dayCount === 本轮哨兵。修后 20/20 应全绿;修前 B 组应红(确定性),
// A 组间歇红(世界越小窗口越窄——与「有时候」相称)。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const SEED = 'svq' + String(Math.floor(Math.random() * 9000) + 1000);
const ROUNDS = Number(process.env.SVQ_ROUNDS ?? 10);
const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 160)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0, passed = 0;
const rows = [];
function chk(ok, tag, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'} ${tag} ${detail}`;
  rows.push(line);
  console.log(line);   // 增量输出(中途异常不丢数据)
  ok ? passed++ : failed++;
}

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

/** 标题 → 角色选择 → 世界列表 → 进世界(重试容错,尽快点完) */
async function enterWorldFast() {
  for (let i = 0; i < 8; i++) {
    try {
      await page.waitForSelector('[data-act=sp]', { timeout: 8000 });
      await page.click('[data-act=sp]');
      await page.waitForSelector('.sw-vsel .sw-vitem .sw-vitem-btns img', { timeout: 8000 });
      await sleep(120);
      await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');   // 角色进世界列表
      await page.waitForFunction(
        () => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'),
        { timeout: 8000 },
      );
      await sleep(120);
      await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');   // 进世界
      await page.waitForFunction(
        () => window.__swGame && window.__swGame.world && window.__swGame.running === true,
        { timeout: 300000 },
      );
      await sleep(400);   // 首帧稳定
      return;
    } catch (e) {
      if (i === 7) {
        // 诊断快照:选择面板在不在、标题是什么、有没有别的层挡着
        const dbg = await page.evaluate(() => ({
          vsel: !!document.querySelector('.sw-vsel'),
          vselTitle: document.querySelector('.sw-vsel-title')?.textContent ?? null,
          items: document.querySelectorAll('.sw-vsel .sw-vitem').length,
          imgs: document.querySelectorAll('.sw-vsel .sw-vitem .sw-vitem-btns img').length,
          bodySnip: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200),
        }));
        console.log('DBG enterWorldFast:', JSON.stringify(dbg));
        throw e;
      }
      await sleep(400);
    }
  }
}

/** 触发 quitToMenu 但【不 await】(真实用户语义:看到标题就继续点)——
 *  返回 标题出现时刻,并量 quit→标题耗时 */
async function quitAndGetTitleMs() {
  const t0 = Date.now();
  await page.evaluate(() => { void window.__swFlow.quitToMenu(); });
  await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
  return Date.now() - t0;
}

async function readDayCount() {
  return page.evaluate(() => window.__swGame?.world?.clock?.dayCount ?? -999999);
}

// ---------- 建流(一次性 profile:角色+世界都要建) ----------
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
// 预置公告已读:WelcomeAnnounce 每次进世界后回标题都会 z-60 全屏拦点击(BJ144 探针适配)
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* 忽略 */ } });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.mouse.click(8, 8);   // 音频门(判例:角落真点)
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp failed'); }
}
await sleep(600);
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await sleep(400);
  await page.type('.sw-char-row input[type=text]', 'SVQ探针');
  await sleep(200);
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await sleep(500);
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(
  () => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'),
  { timeout: 10000 },
);
await sleep(600);
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.keyboard.type(SEED);
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
  await sleep(300);
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(
  () => window.__swGame && window.__swGame.world && window.__swGame.running === true,
  { timeout: 300000 },
);
await sleep(800);

// 槽位 id(唯一 seed 兜底:取 lastPlayed 最新)
const idxRaw = await kvText('sandboxworld.worlds.index');
const arr = idxRaw ? JSON.parse(idxRaw) : [];
const mine = arr.filter((m) => String(m.seed) === SEED);
const id = (mine.length ? mine : arr).slice(-1)[0]?.id ?? -1;
const dataKey = `sandboxworld.world.${id}`;
console.log(`INFO seed=${SEED} slotId=${id}`);

// ---------- 对照组:正常保存路径(doSave=暂停菜单「保存游戏」/Ctrl+S 同一处理) ----------
await page.evaluate(() => { window.__swGame.world.clock.dayCount = 901; });
await page.evaluate(() => { void window.__swFlow.doSave(); });
await sleep(4000);
{
  const txt = await kvText(dataKey);
  chk(txt != null && txt.includes('"dayCount":901'), 'CTRL. 正常保存路径 4s 后槽位含哨兵901', `${txt?.length ?? 0}B`);
}

// ---------- A 组 ×N:quit → 标题一现 → 立刻从 UI 秒进世界(重进读旧档窗口) ----------
for (let r = 1; r <= ROUNDS; r++) {
  const sentinel = 1000 + r;
  await page.evaluate((v) => { window.__swGame.world.clock.dayCount = v; }, sentinel);
  const tTitle = await quitAndGetTitleMs();
  const t1 = Date.now();
  await enterWorldFast();
  const enterMs = Date.now() - t1;
  const got = await readDayCount();
  chk(got === sentinel, `A${String(r).padStart(2, '0')} 秒进世界哨兵保留`, `want=${sentinel} got=${got} | quit→标题=${tTitle}ms 标题→进局=${enterMs}ms`);
}

// ---------- B 组 ×N:quit → 标题一现 → 立刻 reload(关/刷标签在途链被撕窗口) ----------
for (let r = 1; r <= ROUNDS; r++) {
  const sentinel = 2000 + r;
  await page.evaluate((v) => { window.__swGame.world.clock.dayCount = v; }, sentinel);
  const tTitle = await quitAndGetTitleMs();
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await enterWorldFast();
  const got = await readDayCount();
  chk(got === sentinel, `B${String(r).padStart(2, '0')} 退出后立刷哨兵保留`, `want=${sentinel} got=${got} | quit→标题=${tTitle}ms`);
}

console.log(rows.join('\n'));
console.log(`RESULT: ${failed === 0 ? 'PASS' : 'FAIL'} (${passed}/${passed + failed})`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
