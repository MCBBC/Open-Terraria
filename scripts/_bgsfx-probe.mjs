// ★后台 SFX 通道验收探针（2026-09-29 用户报:后台泵模式（世界照跑+BGM 在）下雨声/
// 怪物声等音效消失）。机制级仿真同 _bgpump-probe（rAF 闭闸+document.hidden 覆写），
// ★增补:覆写后 dispatch 真 visibilitychange 事件——Sfx 失焦闸（setAudioSuspension）
// 与 Game.onVisibilityChange/applyFocusPause 均事件驱动,不派发则失焦挂起分支不可达
// （真实切 tab 两监听都会跑）。
// 量面（定谳三因 → 三刀对应）:
//   A 前台基线    干净面读数（ctx/BGM/cue 静默态）
//   B 后台雨声起轨 hide+rAF 闭闸 → 后台内起暴雨 → 雨 cue playing+fade 0→起坡+gain>0
//                 （K3 泵 pass 驱动斜坡的直接证据）;sfx ctx running（K1）;
//                 ambientQuiet()=1（K2）;bgPumpTicks 推进;BGM 曲目不变
//   C 后台怪物声  族②（住 fixedUpdate,泵已覆盖）:鸭群（denom 200,day 门）环境声
//                 wav 触发计数推进;直发 playSfxWav 出声（ok 即时 / q+out 补播）
//   D 后台停雨    族①门关 → cue 渐熄拆轨（playing=false,gain→0）
//   E 回前台对照  复闸+可见 → 前台内再起暴雨同面（A/B 对照）;BGM 全程未变;零异常
//   F 总闸关=现状 playWhenUnfocused=off → 失焦 sfx ctx 挂起+泵停（旧行为,后台静音）
// 运行：
//   SW_ORIGIN=http://localhost:5262 node tools/run-diag.mjs --timeout=600000 \
//     scripts/_bgsfx-probe.mjs [--out /tmp/bgsfx/xxx] [--seed 05162020]
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { bootstrap, gotoApp, waitForBridge } from '../tools/probe/lib/boot.mjs';
import { sizeDims } from '../tools/probe/lib/env.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const argOf = (k, dflt) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const OUT = argOf('--out', `/tmp/bgsfx/run-${Date.now()}`);
const SEED = argOf('--seed', '05162020');
const SOAK_MS = Number(argOf('--soak-ms', '8000'));

// ---- 页内仪器（一次性安装）----
const INSTALL = () => {
  window.__bg = { errs: [] };

  // ①document.hidden 仿真 + 真 visibilitychange 派发（失焦闸/失焦暂停两监听都吃）
  let origHiddenDesc = null;
  window.__setHidden = (h) => {
    if (h && !origHiddenDesc) {
      origHiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    } else if (!h && origHiddenDesc) {
      delete document.hidden;
      origHiddenDesc = null;
    }
    document.dispatchEvent(new Event('visibilitychange'));
    return document.hidden;
  };

  // ②rAF 链闸（闭闸=回调入队不执行≈真实后台 rAF 停发;复闸=放行队列重建链）
  let origRaf = null; let rafQ = [];
  window.__rafGate = (close) => {
    if (close && !origRaf) {
      origRaf = window.requestAnimationFrame.bind(window);
      rafQ = [];
      window.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
    } else if (!close && origRaf) {
      const q = rafQ; const orig = origRaf;
      window.requestAnimationFrame = orig;
      origRaf = null; rafQ = [];
      q.forEach((cb) => { try { orig(cb); } catch (e) { window.__bg.errs.push(String(e)); } });
    }
    return !!origRaf;
  };

  // ③音频面读数（AudioSystem/Sfx 面全量快照——"节点状态在场"判据）
  window.__aface = async () => {
    const g = window.__swGame;
    const m = await import('/src/core/Sfx.ts');
    const ctxs = { sfx: [], music: [] };
    for (const [c, kind] of m.Sfx.ctxRegistry) ctxs[kind]?.push(c.state);
    const cue = g.sfx.cueLayers.rain;
    const wind = g.sfx.cueLayers.wind;
    return {
      tick: g.tickCount, bgTicks: g.bgPumpTicks, audioAcc: Math.round(g.audioAcc * 1e4) / 1e4,
      paused: g.paused, hidden: document.hidden,
      ctxs,
      rain: {
        playing: cue.cue.playing, fade: Math.round(cue.cue.fade * 1000) / 1000,
        gain: cue.gain ? Math.round(cue.gain.gain.value * 1e4) / 1e4 : -1,
        hasSrc: !!cue.src,
      },
      wind: {
        playing: wind.cue.playing, fade: Math.round(wind.cue.fade * 1000) / 1000,
        gate: !!g.cueDrive?.wind?.gate,   // 世界侧门位（天气机后台照跑=风会自然重掷）
      },
      ambientQuiet: g.sfx.ambientQuiet(),
      bgm: {
        curMusic: window.__swAudio?.curMusic ?? -1,
        muted: window.__swAudio?.muted ?? null,
      },
      now: performance.now(),
    };
  };

  // ④sfx 触发环读数（audioRec 恒开环;按 k/f 过滤计数）+ bgm 环
  window.__sfxTail = (n) => {
    const r = window.__swAudioRec?.sfx?.snapshotTail?.(n) ?? [];
    return r.map((e) => ({ t: e.t, k: e.k, f: e.d?.f ?? e.d?.n ?? '', o: e.d?.o ?? '' }));
  };
  window.__countSfx = (pred) => window.__sfxTail(400).filter(pred).length;
  window.__bgmTail = (n) => {
    const r = window.__swAudioRec?.bgm?.snapshotTail?.(n) ?? [];
    return r.map((e) => ({ t: e.t, k: e.k, id: e.d?.id ?? '' }));
  };

  // ⑤实体投喂（ducks=362 鸭族 critter,denom 200+day 门 → 高频环境声源）
  window.__spawnDucks = async (n, dx, dy) => {
    const g = window.__swGame;
    const m = await import('/src/entities/Enemy.ts');
    const out = [];
    for (let i = 0; i < n; i++) {
      const e = m.Enemy.fromVanilla(362, g.player.cx + dx + (i % 4) * 40, g.player.cy + dy);
      if (!e) continue;
      e.id = g.entities.nextId++;
      g.entities.add(e, 'enemies');
      out.push(e.id);
    }
    return out.length;
  };

  window.__opt = async (k, v) => {
    const m = await import('/src/core/Options.ts');
    await m.options.set(k, v);
  };
  window.__preset = (name) => window.__swGame.applyWeatherPreset(name);
  window.__err = () => {
    const ring = (window).__swErrors;
    return Array.isArray(ring) ? ring.length : -1;
  };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const fs = await import('node:fs');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchBrowser({});
  const page = await openPage(browser, {});
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const R = { phases: {}, pageErrors: null };

  await bootstrap(page, ORIGIN);
  if (!(await gotoApp(page, ORIGIN, { tries: 30 }))) {
    console.error('goto failed');
    await browser.close();
    process.exit(1);
  }
  await waitForBridge(page);
  await page.evaluate(INSTALL);
  const [W, H] = sizeDims('small');
  await page.evaluate(({ seed, w, h }) => { void window.__swFlow.newWorld(seed, w, h); }, { seed: SEED, w: W, h: H });

  // 两开关置位（泵门与 bgAudioProbe 同口径）
  await page.evaluate(() => window.__opt('backgroundRun', true));
  await page.evaluate(() => window.__opt('playWhenUnfocused', true));

  await page.waitForFunction(() => {
    const g = window.__swGame;
    return g && g.world && g.player && !g.entryFreezeActive && g.tickCount > 60 && !g.paused;
  }, { timeout: 120000 });
  const err0 = await page.evaluate(() => window.__err());

  // ---- A 前台基线（干净面:cue 静默/ctx/BGM）----
  R.phases.A = await page.evaluate(async () => {
    const f = await window.__aface();
    return f;
  });

  // ---- B 后台雨声起轨（hide+闭闸 → 后台内起暴雨;K1/K2/K3 全链）----
  R.phases.B = await page.evaluate(async (soakMs) => {
    const f0 = await window.__aface();
    window.__rafGate(true);
    window.__setHidden(true);
    window.__preset('storm');          // 后台内起雨——斜坡全程在泵 pass 驱动下走出
    await new Promise((r) => setTimeout(r, soakMs));
    const f1 = await window.__aface();
    const bgm = window.__bgmTail(60);
    const g = window.__swGame;
    return {
      f0, f1,
      bgTicksAdvanced: f1.bgTicks > f0.bgTicks,
      cueStarted: !f0.rain.playing && f1.rain.playing,
      fadeRamped: f0.rain.fade === 0 && f1.rain.fade >= 0.25,
      gainAudible: f1.rain.gain > 0.001,
      // 风 cue=同一台状态机;后台世界天气机照跑会自然重掷风（run2 实证:自然风衰减
      // → cue 渐熄拆轨=世界态驱动正确行为）。一致性判据:cue 停 ⇒ 世界门位当前关
      // （门开则下一泵步 Reuse+Play 立即复播,泵节拍 250ms≪读数间隔）
      windConsistent: f1.wind.playing ? true : g.cueDrive?.wind?.gate === false,
      accRealtime: Math.abs(f1.audioAcc) < 0.1,   // 泵 pass 消费后=实时(<1 tick)
      sfxCtxRunning: f1.ctxs.sfx.length > 0 && f1.ctxs.sfx.every((s) => s === 'running'),
      musicCtxRunning: f1.ctxs.music.length > 0 && f1.ctxs.music.every((s) => s === 'running'),
      ambientQuietOne: f1.ambientQuiet === 1,
      // BGM 健康=ctx 在跑+曲目在场+零取曲失败;曲目【变化】是环境选曲链对世界态
      // （暴雨→Music 62 OtherworldRain）的正确响应=世界后台真在演化的旁证,非缺陷
      bgmHealthy: f1.ctxs.music.every((s) => s === 'running') && f1.bgm.curMusic > 0
        && !bgm.some((e) => e.k === 'fail')
        && (f1.bgm.curMusic === f0.bgm.curMusic || bgm.some((e) => e.k === 'sel')),
      bgmEvents: bgm.map((e) => `${e.k}:${e.id}`).join(','),
    };
  }, SOAK_MS);

  // ---- C 后台怪物声（族②:critter 环境声计数推进+直发出声）----
  R.phases.C = await page.evaluate(async (soakMs) => {
    const ducks = await window.__spawnDucks(8, -180, -60);
    const nZombieBefore = window.__countSfx((e) => e.k === 'wav' && String(e.f).startsWith('Zombie_'));
    // 直发一次（同机制面:playSfxWav→atten(监听器)→playWavFile——验证 ctx 放行端到端;
    // Zombie_24 不在预热清单,首播走 q+deferPlay 补播=同样出声）
    const g = window.__swGame;
    g.playSfxWav('Zombie_24', 1, g.player.cx + 40, g.player.cy);
    await new Promise((r) => setTimeout(r, soakMs));
    const tail = window.__sfxTail(400);
    const nZombieAfter = tail.filter((e) => e.k === 'wav' && String(e.f).startsWith('Zombie_')).length;
    const direct = tail.filter((e) => e.f === 'Zombie_24');
    const directOut = direct.filter((e) => e.k === 'out');   // 补播实际出声事件
    const f = await window.__aface();
    return {
      ducks, nZombieBefore, nZombieAfter,
      duckAmbientAdvanced: nZombieAfter - nZombieBefore >= 3,   // 期望≈8×8s×60/200≈19,门 3=3σ 下界
      directFired: direct.length >= 1
        && (direct.some((e) => e.k === 'wav' && e.o === 'ok') || directOut.length >= 1),
      directDetail: direct.map((e) => `${e.k}:${e.o}`).join(','),
      sfxCtxRunning: f.ctxs.sfx.every((s) => s === 'running'),
      ambientQuietOne: f.ambientQuiet === 1,
    };
  }, SOAK_MS);

  // ---- D 后台停雨（族①门关 → 渐熄拆轨 200t≈3.3s）----
  R.phases.D = await page.evaluate(async () => {
    window.__preset('clear');
    await new Promise((r) => setTimeout(r, 6000));
    const f = await window.__aface();
    return {
      rainStopped: f.rain.playing === false && f.rain.fade === 0 && f.rain.gain === 0,
      face: f.rain,
    };
  });

  // ---- E 回前台对照（复闸+可见;前台内再起暴雨同面;零爆发）----
  R.phases.E = await page.evaluate(async () => {
    window.__setHidden(false);
    window.__rafGate(false);
    await new Promise((r) => setTimeout(r, 800));
    const rate = await new Promise((res) => {
      const g = window.__swGame; const t0 = performance.now(); const k0 = g.tickCount;
      setTimeout(() => res(Math.round((g.tickCount - k0) * 1000 / (performance.now() - t0))), 1500);
    });
    window.__preset('storm');
    await new Promise((r) => setTimeout(r, 4000));
    const f = await window.__aface();
    const bgm = window.__bgmTail(60);
    return { rate, rainPlaying: f.rain.playing, fade: f.rain.fade, gain: f.rain.gain, bgm: f.bgm, ctxs: f.ctxs, acc: f.audioAcc,
      bgmHealthy: f.ctxs.music.every((s) => s === 'running') && f.bgm.curMusic > 0 && !bgm.some((e) => e.k === 'fail') };
  });

  // ---- F 总闸关=现状（playWhenUnfocused=off → 失焦 sfx 挂起+泵停）----
  R.phases.F = await page.evaluate(async () => {
    await window.__opt('playWhenUnfocused', false);
    await new Promise((r) => setTimeout(r, 200));
    const f0 = await window.__aface();
    window.__rafGate(true);
    window.__setHidden(true);
    await new Promise((r) => setTimeout(r, 1500));
    const f1 = await window.__aface();
    window.__setHidden(false);
    window.__rafGate(false);
    await new Promise((r) => setTimeout(r, 400));
    await window.__opt('playWhenUnfocused', true);
    return {
      sfxCtxSuspended: f1.ctxs.sfx.length > 0 && f1.ctxs.sfx.every((s) => s === 'suspended'),
      bgTicksFrozen: f1.bgTicks === f0.bgTicks,
      pausedByFocus: f1.paused === true,
    };
  });

  R.pageErrors = pageErrors.slice(0, 5);
  R.errRingDelta = (await page.evaluate(() => window.__err())) - err0;
  fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(R, null, 1));
  await browser.close();

  // ---- 判语 ----
  const A = R.phases.A, B = R.phases.B, C = R.phases.C, D = R.phases.D, E = R.phases.E, F = R.phases.F;
  const checks = [];
  let ok = true;
  const add = (name, cond, extra = '') => { checks.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  [' + extra + ']' : ''}`); if (!cond) ok = false; };
  add('A 基线 ctx/BGM 在场', A.ctxs.sfx.length > 0 && A.bgm.curMusic > 0, `ctx=${JSON.stringify(A.ctxs)} cur=${A.bgm.curMusic}`);
  add('A 基线雨 cue 静默(未起雨)', A.rain.playing === false && A.rain.fade === 0, JSON.stringify(A.rain));
  add('B 后台泵推进', B.bgTicksAdvanced, `${B.f0.bgTicks}→${B.f1.bgTicks}`);
  add('B 后台雨 cue 起轨(playing)', B.cueStarted, `${JSON.stringify(B.f0.rain)}→${JSON.stringify(B.f1.rain)}`);
  add('B 后台 fade 斜坡起坡(泵 pass K3 驱动)', B.fadeRamped, `${B.f0.rain.fade}→${B.f1.rain.fade}`);
  add('B 后台 gain 可闻', B.gainAudible, `gain=${B.f1.rain.gain}`);
  add('B 风 cue 与世界门位一致(后台天气机照跑)', B.windConsistent, JSON.stringify(B.f1.wind));
  add('B audioAcc 实时(泵 pass 消费)', B.accRealtime, `acc=${B.f1.audioAcc}`);
  add('B 后台 sfx ctx running(K1)', B.sfxCtxRunning, JSON.stringify(B.f1.ctxs.sfx));
  add('B music ctx running(BGM 不受影响)', B.musicCtxRunning, JSON.stringify(B.f1.ctxs.music));
  add('B ambientQuiet=1(K2)', B.ambientQuietOne, `q=${B.f1.ambientQuiet}`);
  add('B BGM 健康(ctx 跑+曲在场+零 fail;选曲变化=环境链正确响应暴雨)', B.bgmHealthy, `${B.f0.bgm.curMusic}→${B.f1.bgm.curMusic} [${B.bgmEvents}]`);
  add('C 鸭群环境声计数推进(族②泵已覆盖)', C.duckAmbientAdvanced, `${C.nZombieBefore}→${C.nZombieAfter} (ducks=${C.ducks})`);
  add('C 直发 playSfxWav 出声(ok 或 q+out 补播)', C.directFired, `[${C.directDetail}]`);
  add('C 后台 sfx ctx running', C.sfxCtxRunning);
  add('D 后台停雨渐熄拆轨(门关→fade 0+gain 0)', D.rainStopped, JSON.stringify(D.face));
  add('E 回前台 tick 恢复(零爆发)', E.rate >= 45 && E.rate <= 75, `rate=${E.rate}`);
  add('E 前台雨声同面(A/B 对照)', E.rainPlaying && E.fade > 0, `fade=${E.fade} gain=${E.gain}`);
  add('E BGM 健康(ctx 跑+曲在场+零 fail)', E.bgmHealthy, `cur=${E.bgm.curMusic}`);
  add('F 总闸关:失焦 sfx ctx 挂起(现状=后台静音)', F.sfxCtxSuspended);
  add('F 总闸关:泵停(世界冻结)', F.bgTicksFrozen);
  add('零页面异常', R.pageErrors.length === 0 && R.errRingDelta === 0, `pe=${R.pageErrors.length} ringΔ=${R.errRingDelta}`);

  fs.writeFileSync(`${OUT}/verdict.txt`, ok ? 'PASS' : 'FAIL');
  console.log(`\n==== 后台 SFX 通道验收 ${ok ? '★ 全绿' : '✗ 有红'} → ${OUT}`);
  console.log(checks.join('\n'));
  console.log(`A=${JSON.stringify(A)}\nB0=${JSON.stringify(B.f0)}\nB1=${JSON.stringify(B.f1)}\nC=${JSON.stringify(C)}\nD=${JSON.stringify(D.face)}\nE=${JSON.stringify(E)}\nF=${JSON.stringify(F)}`);
  if (R.pageErrors.length) console.log(`pageErrors: ${R.pageErrors.join(' | ')}`);
  process.exit(ok ? 0 : 1);
}

// ★top-level await（_bgpump-probe 同款）:run-diag 子进程按「import 完成=主体完成」判定
await main();
