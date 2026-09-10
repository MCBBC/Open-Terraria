/**
 * IIII236 统一探针框架 —— 建世界三模式 + 派生随机钉死 + 装载收尾纪律。
 *
 * 坑史锚:
 *  - _iii215b 采样纪律:创建流【不 await】(await=等到生成完才采样,首跑 0 样本);
 *  - _iii219:直桥 __swFlow.newWorld(seed, w, h) + waitForFunction __swGame.player;
 *  - memory: slime-water-pocket…「probe 陷阱三连」——loadJson 后 player 在世界出生点
 *    (非存档位)→ despawn 秒杀伪影;
 *  - memory: chain-playthrough-probe-40x40「难度域决定掉落」——探针自建世界默认
 *    difficulty=0(经典),大师档断言掉落物先核对难度域;
 *  - memory: slime…「敌怪 AI=Math.random 非种子流」——A/B 必须 6× 统计;
 *    pinRandom 把页内 Math.random 换成固定种子 PRNG 只压"环境方差",
 *    不改引擎语义的调用点(改引擎面=把 bug 修没)。
 */
import { front } from './browser.mjs';
import { gotoApp, waitForBridge } from './boot.mjs';
import { sizeDims, sizeCode } from './env.mjs';

export const GAME_WAIT_DEFAULT = 600_000;   // large 世界生成 ~分钟级,默认给足

/**
 * 页内建世界。三种模式:
 *  - 'url'    : /?play=small —— bypassBoot 旁路(main.ts:929),随机种子,最快;
 *  - 'direct' : / + __swFlow.newWorld(seed, w, h) —— 种子/尺寸全控(探针主流);
 *  - 'ui'     : / + __swFlow.createWorldProbe(cfg) —— 走真实创建流(UIWorldLoad
 *               双进度条+worker 预览链路;采样生成中态时【不要 await】)。
 * opts: { mode, seed, size('small'|'medium'|'large'|0|1|2'), flags(种子别名),
 *         pinRandom(seed数字), timeout, settleMs, onProgress }
 * 返回 { ok, w, h, seed, why? }。
 */
export async function createGame(page, {
  mode = 'direct', seed = '', size = 'small', timeout = GAME_WAIT_DEFAULT, settleMs = 1500,
  pinRandom = null, log = () => {},
} = {}) {
  const [w, h] = sizeDims(size);
  if (pinRandom != null) installPinnedRandom(page, pinRandom);

  if (mode === 'url') {
    const szKey = typeof size === 'number' ? (size === 0 ? 'small' : size === 2 ? 'large' : 'medium') : size;
    const origin = page.__probeOrigin || safeOrigin(page);
    const ok = await gotoApp(page, origin, { extraQuery: `?play=${szKey}`, tries: 30 });
    if (!ok) return { ok: false, why: 'goto' };
  } else {
    if (!(await waitForBridge(page))) return { ok: false, why: 'bridge' };
    if (mode === 'direct') {
      await front(page);
      await page.evaluate(({ seed, w, h }) => {
        // 不 await:生成完成由 __swGame 出现为准(桥自身无进度面;与 ?play 同纪律)
        void window.__swFlow.newWorld(seed, w, h);
      }, { seed, w, h });
    } else if (mode === 'ui') {
      await front(page);
      await page.evaluate(({ seed, size, w, h }) => {
        void window.__swFlow.createWorldProbe({
          name: 'probe', seed, size: sizeCode(size), difficulty: 0, evil: -1, w, h,
        })?.catch?.((e) => { globalThis.__swProbeGenErr = String(e?.message ?? e).slice(0, 300); });
      }, { seed, size, w, h });
    } else {
      return { ok: false, why: `unknown mode ${mode}` };
    }
  }

  const ok = await waitForGame(page, { timeout, log });
  if (!ok) return { ok: false, why: 'game-timeout' };
  await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), settleMs);   // afterWorldLoad 尾段(minimap/装备刷新)
  return { ok: true, w, h, seed };
}

/** 等 __swGame.player/world 就绪(1s 轮询,30s 心跳日志)。 */
export async function waitForGame(page, { timeout = GAME_WAIT_DEFAULT, polling = 1000, log = () => {} } = {}) {
  const t0 = Date.now();
  let nextBeat = 30_000;
  while (Date.now() - t0 < timeout) {
    const st = await page.evaluate(() => {
      const g = window.__swGame;
      if (!g) return 'no-game';
      if (!g.world) return 'game-no-world';
      if (!g.player) return 'game-no-player';
      return 'INGAME';
    }).catch((e) => 'eval-err:' + String(e).slice(0, 120));
    if (st === 'INGAME') return true;
    if (Date.now() - t0 > nextBeat) { nextBeat += 30_000; log(`waitGame ${Math.round((Date.now() - t0) / 1000)}s: ${st}`); }
    await new Promise((r) => setTimeout(r, polling));
  }
  return false;
}

/**
 * 派生随机钉死:页内 Math.random → 固定种子 mulberry32。
 * ★必须在导航前装(evaluateOnNewDocument);只压"环境方差",Math.random 消费点
 * 语义不变。改回:reload 页面即失效。
 */
export function installPinnedRandom(page, seed = 20260903) {
  page.evaluateOnNewDocument((s) => {
    let a = s >>> 0;
    globalThis.Math.random = () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed >>> 0);
}

/**
 * 玩家/相机快速置位(世界像素;相机 follow 是 0.15/frame 缓动——传送后要么等
 * ≥2.5s 要么直接写 camera.x/y,本函数后者)。
 */
export async function teleport(page, wx, wy, { snapCamera = true, zeroVel = true } = {}) {
  return page.evaluate(({ wx, wy, snapCamera, zeroVel }) => {
    const g = window.__swGame;
    if (!g?.player) return false;
    g.player.x = wx; g.player.y = wy;
    if (zeroVel) { g.player.vx = 0; g.player.vy = 0; }
    if (snapCamera && g.camera) { g.camera.x = g.player.cx; g.camera.y = g.player.cy; }
    return true;
  }, { wx, wy, snapCamera, zeroVel });
}

/** 上帝模式(探针玩家被打死 → 死亡窗冻结射击族 AI = "AI 冻结"假象,先开这个)。 */
export async function godMode(page, on = true) {
  return page.evaluate((on) => { const g = window.__swGame; if (g?.player) { g.player.debugGod = on; return true; } return false; }, on);
}

/**
 * TS private 方法运行时可直调(坑表 §G11;IIIII238 收编 IIII237 实战摩擦 #2)。
 * `private` 只是编译期:JS 运行时方法都在实例上,直调 = 最快取证路
 * (interactAt/isAlchemyPlantHarvestable 类仪器,比绕 UI 摆玩家/朝向快一个量级)。
 * 页内实现(__callGameInPage)独立导出=框架自测对假 g 直跑。
 * 返回 { ok, value?, why? } —— 方法缺失/抛错不炸探针,证据链留 why;
 * ★value 须可序列化(void 方法 value===undefined,以 ok 判定;含循环引用的
 * 返回值会在协议层炸,证据链惯例只返回标量/平面对象)。
 */
export function __callGameInPage({ method, args }) {
  const g = window.__swGame;
  const fn = g?.[method];
  if (typeof fn !== 'function') return { ok: false, why: `no-method:${method}` };
  try { return { ok: true, value: fn.apply(g, args) }; }
  catch (e) { return { ok: false, why: String(e?.message ?? e).slice(0, 200) }; }
}

export async function callGame(page, method, ...args) {
  return page.evaluate(__callGameInPage, { method, args });
}

/** 从当前页 URL 推 origin(场景脚本没写 __probeOrigin 时的兜底)。 */
function safeOrigin(page) {
  try { return new URL(page.url()).origin; } catch { return process.env.SW_ORIGIN ?? 'http://localhost:5199'; }
}
