/**
 * IIII236 统一探针框架 —— 导航/启动幕/存储清理。
 *
 * 坑史锚:
 *  - memory: desert-style4-torn-dither-vanilla-verdict —— 干净状态要清
 *    IndexedDB(非仅 localStorage);欢迎弹窗进世界后才弹;时间是 world.timeOfDay
 *    不是 world.clock(两口径,见 docs/methodology/probe-guide.md §C)。
 *  - memory: sw-off-failopen-vanilla-total-miss —— SW 资产管线整个 off 的指纹是
 *    "vanilla 全缺、角色贴图完好";doctor 的资产检查就是这道闸的静态版。
 *  - src/main.ts:815 —— ?play/?quickload/?vuidemo 是 bypassBoot 旁路(不陪跑
 *    10.3s splash 时序);navigator.webdriver 直通音频门。
 */
import { front } from './browser.mjs';
import { httpUp } from './env.mjs';

export const IDB_NAME = 'sandboxworld';           // src/save/KvStore.ts DB_NAME
export const WELCOME_ACK_KEY = 'sw.welcome.announce.acked'; // src/ui/WelcomeAnnounce.ts

/**
 * 导航到应用(带重试——vite 冷启动/编译期 navigation 可能反复失败)。
 * 每次带 ?t= 击穿(HTTP 缓存层;vite 模块转换缓存另由 importFresh 处理)。
 * 返回 true/false。
 */
export async function gotoApp(page, origin, { tries = 60, delayMs = 2500, extraQuery = '', timeout = 60000 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      await front(page);
      await page.goto(`${origin}/${extraQuery}${extraQuery ? '&' : '?'}t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout });
      return true;
    } catch { /* vite 未就绪/编译中——退避重试 */ }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/** 等待调试桥(__swFlow)就绪 = boot 链跑完 assetsP/UIFont/VUI。 */
export async function waitForBridge(page, { timeout = 180_000, polling = 500 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ok = await page.evaluate(() =>
      typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld,
    ).catch(() => false);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, polling));
  }
  return false;
}

/**
 * 清干净存储(IDB + localStorage + sessionStorage)。
 * ★必须在应用 origin 上做(about:blank 有自己的 origin,清了也白清);
 * ★IDB 删除与活连接竞态:boot 早期 kvHas 已开连接 → 删除请求被 'blocked' 挂起,
 *   统一先 resolve 再由调用方 reload 一次让连接关闭、删除落地。
 */
export async function cleanStorage(page, { idb = true, welcomeAck = true, extraKeep = {} } = {}) {
  return page.evaluate(async ({ IDB_NAME, WELCOME_ACK_KEY, idb, welcomeAck, extraKeep }) => {
    const out = { idbDeleted: false, idbBlocked: false, lsKeys: 0 };
    try {
      if (idb && indexedDB.deleteDatabase) {
        await new Promise((res) => {
          let settled = false;
          const fin = (v) => { if (!settled) { settled = true; res(v); } };
          const rq = indexedDB.deleteDatabase(IDB_NAME);
          rq.onsuccess = () => fin(true);
          rq.onerror = () => fin(false);
          rq.onblocked = () => { out.idbBlocked = true; fin(false); };   // 连接占用:reload 后自然落地
          setTimeout(() => fin(false), 4000);
        }).then((v) => { out.idbDeleted = v; });
      }
    } catch { /* 无 IDB/隐私模式 */ }
    try {
      const keep = welcomeAck ? { [WELCOME_ACK_KEY]: '1', ...extraKeep } : { ...extraKeep };
      out.lsKeys = localStorage.length;
      localStorage.clear();
      sessionStorage.clear();
      for (const [k, v] of Object.entries(keep)) { try { localStorage.setItem(k, v); } catch { /* 满 */ } }
    } catch { /* 隐私模式 */ }
    return out;
  }, { IDB_NAME, WELCOME_ACK_KEY, idb, welcomeAck, extraKeep });
}

/** 预置欢迎弹窗 ack(弹窗进世界后才弹,DOM 覆盖会挡后续截图/点击——预置免交互)。 */
export async function ackWelcome(page, ack = true) {
  return page.evaluate((key, acked) => {
    try {
      if (acked) localStorage.setItem(key, '1');
      else localStorage.removeItem(key);
      // 兜底:已挂载的弹窗直接摘(有些路径先于本函数挂载)
      document.getElementById('sw-welcome-announce')?.remove();
      return true;
    } catch { return false; }
  }, WELCOME_ACK_KEY, ack);
}

/**
 * 引导全程:导航 → 清存储 → reload → 等桥 → 预置 ack。
 * 返回 { ok, cleaned, errors }。失败方调用方自行 exit(1)。
 */
export async function bootstrap(page, origin, { clean = true, welcomeAck = true, timeout = 180_000 } = {}) {
  if (!(await gotoApp(page, origin))) return { ok: false, why: 'goto' };
  let cleaned = null;
  if (clean) {
    cleaned = await cleanStorage(page, { welcomeAck }).catch(() => null);
    if (!(await gotoApp(page, origin, { tries: 40 }))) return { ok: false, why: 'reload' };
  }
  if (!(await waitForBridge(page, { timeout }))) return { ok: false, why: 'bridge-timeout' };
  if (welcomeAck) await ackWelcome(page, true);
  return { ok: true, cleaned };
}

/** 便捷:origin 可达性检查(实例起没起的快速判据)。 */
export const originUp = httpUp;
