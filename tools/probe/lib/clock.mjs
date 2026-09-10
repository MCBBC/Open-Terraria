/**
 * IIII238 统一探针框架 —— 时钟夹具(freezeClock)。
 *
 * 坑史锚:
 *  - IIII237 实战摩擦 #4(/tmp/iii237-out/notes.md):时辰门类断言要手工钉
 *    g.world.clock.timeOfDay,pump 期间钟面仍缓走(dayLengthMs=全周期 24min,
 *    headless 后台 rAF ~27fps → 案间真实时间也在推钟面)——框架补冻结夹具,
 *    时辰窗类断言不再自己漂过窗沿;
 *  - src/core/Game.ts:7643 —— 时钟唯一推进点 `w.clock.tick(dt*1000*w.dayRate())`
 *    是实例方法动态分派 → 把实例 tick 换成 no-op 即全链冻结(**零 src 触碰**);
 *  - memory: desert-style4 §D9 —— 双时间口径:时辰门断言一律用
 *    g.world.clock.timeOfDay(0=午夜线性 24h)换算 + Clock.vanillaMainTime(tod)
 *    (分段 Main.time ticks,src/world/World.ts:82),勿 timeOfDay×86400 直比
 *    (IIIII237 病灶:style5 窗口曾裸比钟面 → 夜间误开)。
 *
 * 页内实现函数(`__*InPage`)独立导出:框架自测(tests/probe-framework.test.ts)
 * 在 Node 里对假 window 直跑,零浏览器零网络。
 */

/**
 * 页内:冻结时钟。实例 tick → no-op(掩蔽原型方法;恢复用 delete 回落原型)。
 * opts.tod != null 时同拍钉钟面(0..1,0=午夜 0.5=正午,如 20/24=夜 20:00)。
 * 重复 freeze = 只改钉钟面、保持冻结。返回 { ok, tod0?, tod, isDay, already? }。
 */
export function __clockFreezeInPage({ tod = null } = {}) {
  const c = window.__swGame?.world?.clock;
  if (!c || typeof c.tick !== 'function') return { ok: false, why: 'no-clock' };
  if (globalThis.__swClockFrozen) {
    if (tod != null) c.timeOfDay = tod;   // 已冻结:改钉钟面即可
    return { ok: true, already: true, tod: c.timeOfDay, isDay: c.isDay };
  }
  const tod0 = c.timeOfDay;               // 冻结前钟面(unfreeze 回滚基准)
  globalThis.__swClockFrozen = {
    tod0,
    restore: () => { delete c.tick; c.timeOfDay = tod0; },   // 回落原型方法+钟面还原
  };
  c.tick = () => {};                      // 动态分派点(Game.ts:7643)→ 全链冻结
  if (tod != null) c.timeOfDay = tod;
  return { ok: true, tod0, tod: c.timeOfDay, isDay: c.isDay };
}

/**
 * 页内:解冻。tick 回落原型方法(恢复推进),钟面回滚到冻结前 tod0——
 * 「冻结窗像没发生过」的夹具语义;要保留钉住的时辰用 clockSet 再钉。
 */
export function __clockUnfreezeInPage() {
  const rt = globalThis.__swClockFrozen;
  if (!rt) return { ok: false, why: 'not-frozen' };
  delete globalThis.__swClockFrozen;
  rt.restore();
  return { ok: true, tod: rt.tod0 };
}

/** 页内:钉钟面(不冻结;单独改时辰用)。 */
export function __clockSetInPage({ tod }) {
  const c = window.__swGame?.world?.clock;
  if (!c) return { ok: false, why: 'no-clock' };
  c.timeOfDay = tod;
  return { ok: true, tod: c.timeOfDay, isDay: c.isDay };
}

/** 页内:读钟面全貌(frozen 旗=断言「确实冻着」的取证位)。 */
export function __clockInfoInPage() {
  const c = window.__swGame?.world?.clock;
  if (!c) return { ok: false, why: 'no-clock' };
  const C = c.constructor;
  return {
    ok: true,
    tod: c.timeOfDay,            // 0..1 线性 24h(0=午夜 0.5=正午)
    isDay: !!c.isDay,            // 昼 4:30-19:30(World.ts DAWN/DUSK)
    dayCount: c.dayCount,
    moonPhase: c.moonPhase,      // 0-7(0=满月 4=新月)
    bloodMoon: !!c.bloodMoon,
    hourFloat: c.hourFloat,
    vanillaMainTime: typeof C?.vanillaMainTime === 'function' ? C.vanillaMainTime(c.timeOfDay) : null,  // 分段 Main.time ticks
    frozen: !!globalThis.__swClockFrozen,
  };
}

/** 冻结时钟(+可选钉 tod)。冻结窗内 pump/真实帧都推不动钟面。 */
export async function freezeClock(page, { tod = null } = {}) {
  return page.evaluate(__clockFreezeInPage, { tod });
}

/** 解冻(钟面回滚到冻结前值,恢复推进)。未冻结时 { ok:false, why:'not-frozen' }。 */
export async function unfreezeClock(page) {
  return page.evaluate(__clockUnfreezeInPage);
}

/** 钉钟面(不冻结;0..1,如 20/24=夜 20:00、4.5/24=黎明边界)。 */
export async function clockSet(page, tod) {
  return page.evaluate(__clockSetInPage, { tod });
}

/** 读钟面全貌(tod/isDay/vanillaMainTime/moonPhase/frozen)。 */
export async function clockInfo(page) {
  return page.evaluate(__clockInfoInPage);
}
