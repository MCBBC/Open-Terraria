// ★wbake 转正批验收探针（2026-09-28;转正+渲染期待保护令）。
// 量面（两臂：缺省=转正开 / ?wbake=0=逃生门）：
//   · 旗面      __swBakeFlags.enabled / chunks.bakeClient 装配
//   · 冻结窗    t_freezeBegin/t_freezeEnd/t_entryGate/t_covered;entryFreezeActive 曲线
//   · 世界静止  冻结期逐帧采样 player.x/y·tickCount·hp·敌怪坐标——零漂移断言;
//              注入悬空(玩家上提 3 tile)冻结期不被重力回落=世界 sim 整段停
//   · 怪物注入  冻结期 spawnNpcByVanilla(3=zombie)×2 于玩家 10 tile 外——冻结期坐标
//              恒定(伤害全停,hp 恒定);解冻后僵尸逼近=世界无缝继续
//   · 解冻恢复  解冻 1s 内 hp 恒定(无爆发伤害)+玩家落回原地面(重力恢复)+tick≈60/s
//              (acc 丢弃=零补步爆发)+光照已收敛(截图非黑)
//   · 加载步骤  冻结期 .sw-progress 文案=「正在渲染世界…」(wbake=0 臂不切)
//   · 截图      幕布期(带步骤文案)/解冻瞬间/解冻+1s 三段
// 运行：
//   SW_ORIGIN=http://localhost:5253 node tools/run-diag.mjs --timeout=600000 \
//     scripts/_wbake-promotion.mjs [--out /tmp/wbake-promo/xxx] [--seed 05162020]
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { bootstrap, gotoApp, waitForBridge } from '../tools/probe/lib/boot.mjs';
import { sizeDims } from '../tools/probe/lib/env.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5253';
const argOf = (k, dflt) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const OUT = argOf('--out', `/tmp/wbake-promo/run-${Date.now()}`);
const SEED = argOf('--seed', '05162020');
const WSIZE = argOf('--size', 'small');

// ---- 页内仪器 ----
const INSTALL = () => {
  const fresh = () => ({
    t0: performance.now(),
    timeline: {}, freezeOpen: false,
    frames: [],                    // 逐帧采样（冻结窗+解冻后 2.5s）
    labels: new Set(),             // 冻结期加载页文案
    injected: null,
    done: false, doneAt: 0,
  });
  window.__wbPromo = fresh();

  const mark = (k) => {
    const S = window.__wbPromo;
    if (S.timeline[k] === undefined) S.timeline[k] = Math.round(performance.now() - S.t0);
  };

  // Game.prototype 补丁：冻结窗开/关沿 + 幕布门
  import('/src/core/Game.ts').then((m) => {
    const proto = m.Game.prototype;
    if (proto.__wbPromoPatched) return;
    proto.__wbPromoPatched = true;
    const origBegin = proto.beginEntryFreeze;
    proto.beginEntryFreeze = function (timeoutMs = 3000) {
      const r = origBegin.apply(this, [timeoutMs]);
      if (r) { window.__wbPromo.freezeOpen = true; mark('t_freezeBegin'); }
      return r;
    };
    const origEnd = proto.endEntryFreeze;
    proto.endEntryFreeze = function () {
      const was = this.entryFreezeActive;
      origEnd.apply(this);
      if (was) mark('t_freezeEnd');
    };
    if (proto.whenViewportBaked) {
      const origGate = proto.whenViewportBaked;
      proto.whenViewportBaked = function (timeoutMs = 3000) {
        const p = origGate.apply(this, [timeoutMs]);
        p.then(() => mark('t_entryGate'));
        return p;
      };
    }
  });

  // rAF 采样器：世界可见起逐帧（冻结窗全量+解冻后 2.5s 收）
  window.__wbStartSampler = () => {
    const raf = () => {
      const S = window.__wbPromo;
      const g = window.__swGame;
      if (g && g.world && g.player) {
        if (S.timeline.t_gameVisible === undefined) mark('t_gameVisible');
        const freeze = !!g.entryFreezeActive;
        const en = (g.entities?.enemies ?? []).slice(0, 2).map((e) => [Math.round(e.x), Math.round(e.y)]);
        S.frames.push({
          t: Math.round(performance.now() - S.t0), freeze,
          px: Math.round(g.player.x * 10) / 10, py: Math.round(g.player.y * 10) / 10,
          hp: g.player.hp, tick: g.tickCount, covered: g.chunks ? g.chunks.viewportCovered() : null,
          en,
        });
        if (freeze) {
          const el = document.querySelector('.sw-progress');
          if (el && el.children[0]) S.labels.add(el.children[0].textContent);
        }
        if (!freeze && S.timeline.t_freezeEnd !== undefined && performance.now() - S.t0 > S.timeline.t_freezeEnd + 2500) {
          S.done = true; S.doneAt = performance.now();
          return;
        }
        if (!freeze && S.timeline.t_freezeBegin === undefined && S.frames.length > 400) { S.done = true; return; }
      }
      if (performance.now() - S.t0 < 120000 && !S.done) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  };
  window.__wbStartSampler();

  // 冻结窗注入（fast poll：世界就绪即查,冻结活跃才注一次）：
  //  ①悬空:玩家上提 3 tile + vy=0（冻结期重力停=位置保持;解冻后落回）
  //  ②怪物:zombie ×2 于玩家 10 tile 右（冻结期坐标恒定+hp 零伤;解冻后逼近）
  window.__wbInject = () => {
    const S = window.__wbPromo;
    const g = window.__swGame;
    if (!g || !g.world || !g.player || !g.entryFreezeActive || S.injected) return false;
    const p = g.player;
    S.injected = {
      entryX: p.x, entryY: p.y, entryHp: p.hp, entryTick: g.tickCount,
      liftY: p.y - 48, zombies: [],
    };
    p.y = p.y - 48; p.vy = 0;
    for (let i = 0; i < 2; i++) {
      const z = g.spawnNpcByVanilla ? g.spawnNpcByVanilla(3, p.x + 240 + i * 24, p.y) : null;
      if (z) S.injected.zombies.push(z.id ?? -1);
    }
    mark('t_inject');
    return true;
  };
  const injectPoll = () => {
    if (window.__wbInject() || (window.__wbPromo.timeline.t_freezeEnd !== undefined)) return;
    setTimeout(injectPoll, 8);
  };
  setTimeout(injectPoll, 0);
};

// ---- Node 侧：幕布期截图（freeze 活跃即拍;解冻后 +1s 再拍两张）----
async function shotLoop(page, dir) {
  const fs = await import('node:fs');
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  let n = 0, unfrozeAt = null;
  while (Date.now() - t0 < 90000) {
    const st = await page.evaluate(() => ({
      game: !!window.__swGame?.world,
      freeze: !!window.__swGame?.entryFreezeActive,
      done: window.__wbPromo?.done,
    })).catch(() => ({ game: false }));
    if (st.game) {
      const f = String(n).padStart(3, '0');
      const tag = st.freeze ? 'curtain' : (unfrozeAt === null ? 'unfroze' : 'world');
      try { await page.screenshot({ path: `${dir}/${f}_${Date.now() - t0}ms_${tag}.png` }); } catch { /* 竞态 */ }
      if (!st.freeze && unfrozeAt === null) unfrozeAt = Date.now() - t0;
      n++;
      if (unfrozeAt !== null && Date.now() - t0 > unfrozeAt + 1100) break;
      if (st.done) break;
    }
    await new Promise((r) => setTimeout(r, 90));
  }
  return n;
}

async function waitDone(page) {
  return page.evaluate(() => new Promise((res) => {
    const t0 = Date.now();
    const poll = () => {
      const S = window.__wbPromo;
      if (S?.done) res(S);
      else if (Date.now() - t0 > 120000) res({ timeout: true });
      else setTimeout(poll, 200);
    };
    poll();
  }));
}

async function runArm(query, name) {
  const fs = await import('node:fs');
  const browser = await launchBrowser({});
  const page = await openPage(browser, {});
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await bootstrap(page, ORIGIN);
  if (!(await gotoApp(page, ORIGIN, { extraQuery: query || '', tries: 30 }))) {
    await browser.close();
    return { name, error: 'goto failed' };
  }
  await waitForBridge(page);
  await page.evaluate(INSTALL);
  const dir = `${OUT}/${name}`;
  const shots = shotLoop(page, dir);
  const [W, H] = sizeDims(WSIZE);
  await page.evaluate(({ seed, w, h }) => { void window.__swFlow.newWorld(seed, w, h); }, { seed: SEED, w: W, h: H });
  const S = await waitDone(page);
  const shotCount = await shots;
  const verdict = await page.evaluate(() => {
    const g = window.__swGame, S = window.__wbPromo;
    if (!g || !S || S.timeout) return { ok: false, why: 'no game/timeout' };
    const F = S.frames;
    const fz = F.filter((f) => f.freeze);
    const fe = S.timeline.t_freezeEnd;
    const after = F.filter((f) => !f.freeze && fe !== undefined && f.t >= fe);
    const after1s = F.filter((f) => !f.freeze && fe !== undefined && f.t >= fe && f.t <= fe + 1000);
    const out = { ok: true, why: [] };
    out.lastCovered = F.length ? F[F.length - 1].covered : null;
    out.flags = { enabled: window.__swBakeFlags?.enabled ?? null, client: !!g.chunks?.bakeClient };
    out.freezeOpen = S.freezeOpen;
    out.labelSeen = [...S.labels];
    // ①冻结期零漂移（位置/hp/tick/敌怪）——按注入时刻分段:注入前/后各自恒定
    //  （注入本身=唯一一次位置阶跃;「世界静止」指 sim 不动,不含带外注入写）
    if (fz.length > 2 && S.injected) {
      const tInj = S.timeline.t_inject ?? Infinity;
      const segA = fz.filter((f) => f.t < tInj), segB = fz.filter((f) => f.t >= tInj);
      const stat = (seg) => {
        const px = new Set(seg.map((f) => f.px)), py = new Set(seg.map((f) => f.py));
        const hp = new Set(seg.map((f) => f.hp)), tk = new Set(seg.map((f) => f.tick));
        return px.size === 1 && py.size === 1 && hp.size === 1 && tk.size === 1;
      };
      out.frozen = { n: fz.length, nA: segA.length, nB: segB.length,
        firstY: fz[0].py, lastY: fz[fz.length - 1].py,
        segAStatic: segA.length ? stat(segA) : true, segBStatic: segB.length ? stat(segB) : true };
      out.staticWorld = out.frozen.segAStatic && out.frozen.segBStatic;
      // 悬空注入保持（冻结期不被重力回落）
      out.liftHeld = out.frozen.lastY < S.injected.entryY - 40;
      // 敌怪冻结（生成当帧可能差一帧,从宽 ≤2 值）
      const enFlat = fz.flatMap((f) => f.en).map((e) => e.join(','));
      out.enemyFrozen = new Set(enFlat).size <= 2;
    } else { out.staticWorld = null; out.liftHeld = null; out.enemyFrozen = null; }
    // ②解冻恢复:重力恢复（从悬空位下落）+落定静止+hp 恒定（解冻后 1s 窗）+tick≈60/s
    //  注:冻结起点=出生下落未完成,entryY 非静止位——落定判据=尾段 py 恒定（rest）
    if (after.length > 10 && S.injected) {
      const last = after[after.length - 1];
      const tail = after.slice(-20);
      out.recovered = {
        gravityResumed: Math.max(...after.map((f) => f.py)) > S.injected.liftY + 8,
        settled: new Set(tail.map((f) => f.py)).size === 1,
        hpKept: after1s.length > 0 && after1s.every((f) => f.hp === S.injected.entryHp) && last.hp === S.injected.entryHp,
        covered: last.covered === true,
      };
      const span = last.t - after[0].t;
      const dt = last.tick - after[0].tick;
      out.tickRate = span > 0 ? Math.round(dt * 1000 / span) : null;   // ≈60=零爆发
      out.zombieMoved = (() => {
        const e0 = after[0].en[0]?.join(','), e1 = last.en[0]?.join(',');
        return e0 !== undefined && e1 !== undefined && e0 !== e1;
      })();
    }
    out.timeline = S.timeline;
    out.injected = { entryY: S.injected?.entryY, zombies: S.injected?.zombies?.length ?? 0 };
    out.hpFinal = g.player.hp;
    return out;
  });
  const flags = await page.evaluate(() => ({ wbake: window.__swBakeFlags?.flag, enabled: window.__swBakeFlags?.enabled }));
  await browser.close();
  return { name, query, verdict, flags, shotCount, pageErrors: pageErrors.slice(0, 3), dir };
}

const results = [];
results.push(await runArm('', 'promo-default'));
results.push(await runArm('?wbake=0', 'wbake0-escape'));

const fs = await import('node:fs');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(results, null, 1));

// ---- 判语 ----
let ok = true;
for (const r of results) {
  const v = r.verdict ?? {};
  const isPromo = r.name === 'promo-default';
  const checks = [];
  const add = (name, cond) => { checks.push(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) ok = false; };
  if (isPromo) {
    add('旗面=开', v.flags?.enabled === true && v.flags?.client === true);
    add('冻结窗开启', v.freezeOpen === true);
    add('幕布步骤=正在渲染世界…', (v.labelSeen ?? []).some((l) => (l ?? '').includes('正在渲染世界')));
    add('冻结期世界静止(注入前后分段零漂移)', v.staticWorld === true);
    add('悬空注入保持(冻结期无重力)', v.liftHeld === true);
    add('冻结期敌怪静止', v.enemyFrozen === true);
    add('解冻重力恢复(下落)', v.recovered?.gravityResumed === true);
    add('解冻后落定静止', v.recovered?.settled === true);
    add('解冻+1s hp 恒定(伤害全停)', v.recovered?.hpKept === true);
    add('解冻后 covered', v.recovered?.covered === true);
    add('解冻 tick≈60/s(零补步爆发)', v.tickRate !== null && v.tickRate >= 45 && v.tickRate <= 130);
    add('解冻后僵尸逼近(世界无缝继续)', v.zombieMoved === true);
  } else {
    add('旗面=关(逃生门)', v.flags?.enabled === false && v.flags?.client === false);
    add('无冻结窗', v.freezeOpen === false);
    add('步骤不切换(零变化)', (v.labelSeen ?? []).length === 0);
    add('入场 covered', v.lastCovered === true);
  }
  add('零页面异常', r.pageErrors.length === 0);
  console.log(`\n==== ${r.name} (${r.query || '无参数'}) ==== shots=${r.shotCount} → ${r.dir}`);
  console.log(checks.join('\n'));
  console.log(`timeline=${JSON.stringify(v.timeline)}  flags=${JSON.stringify(v.flags)}  tickRate=${v.tickRate ?? '—'}`);
  console.log(`frozen=${JSON.stringify(v.frozen)}  frozenStatics=${JSON.stringify({ staticWorld: v.staticWorld, liftHeld: v.liftHeld, enemyFrozen: v.enemyFrozen })}`);
  console.log(`recovered=${JSON.stringify(v.recovered)}  hpFinal=${v.hpFinal}  labelSeen=${JSON.stringify(v.labelSeen)}  pageErrors=${r.pageErrors.length}`);
}
fs.writeFileSync(`${OUT}/verdict.txt`, ok ? 'PASS' : 'FAIL');
console.log(`\n${ok ? '★ 转正验收全绿' : '✗ 验收有红'} → ${OUT}/verdict.txt`);
process.exit(ok ? 0 : 1);
