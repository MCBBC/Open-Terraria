/**
 * IIII236 统一探针框架 —— 录制通道(音频/尘/UI 文本)。
 *
 * 坑史锚(memory: audio-recorder-f5-falling-sand-dig-conviction、
 * ambient-cue-audio-alignment、_iii215b-sfx):
 *  - F5 录制双通道 = game.audioRec.sfx/bgm(BehaviorRecorder 环,恒开);
 *    事件类:sfx {wav(out 结局码 o/syn/loop/cue)} bgm {sel/start/stop/fail/mute};
 *    ★无坐标 sfx = 调用点漏位置(距离衰减失效=满响)——断言先看 d.x/d.y 有无;
 *    ★syn 键 = 素材缺失/负缓存回退("音色不对"直接证据);
 *  - 音频门:headless 无手势 → Sfx 播放全部 defer,fetch 层零记录——
 *    navigator.webdriver 直通(main.ts:812);cookie-cutter 手势兜底留给 ui 预设;
 *  - 失焦闸:Sfx.ensure()/Audio.audio() 自动 resume 带 !document.hidden 守卫,
 *    探针直调引擎(不模拟 hidden)即可;真要模拟失焦用 setAudioSuspension。
 */

/**
 * sfx 资产 fetch 间谍(必须导航【前】装:evaluateOnNewDocument)。
 * 记录 /sounds/*.opus|mp3|wav 命中 → globalThis.__swSfxFetch。
 */
export function installSfxSpy(page, pattern = String.raw `/\/sounds\/[^"')]+?\.(?:opus|mp3|wav|ogg)/`) {
  page.evaluateOnNewDocument((src) => {
    const hits = [];
    globalThis.__swSfxFetch = hits;
    const re = new RegExp(src);
    const of = globalThis.fetch;
    globalThis.fetch = function (u, ...rest) {
      try {
        const s = String(u);
        if (re.test(s)) hits.push({ url: s.slice(-48), at: Math.round(performance.now()) });
      } catch { /* 间谍不参与 */ }
      return of.call(this, u, ...rest);
    };
  }, pattern);
}

/** 抽走已积累的 fetch 间谍记录。 */
export async function drainSfxSpy(page) {
  return page.evaluate(() => (globalThis.__swSfxFetch ?? []).splice(0));
}

/**
 * 音频环摘要(短按 F5 的 audioTail 等价:sfx 800/bgm 200 各取最近 n 条)。
 * 返回 { sfx: [{k,d,t}...], bgm: [...] }。
 */
export async function audioTail(page, { sfx = 800, bgm = 200 } = {}) {
  return page.evaluate(({ sfx, bgm }) => {
    const rec = window.__swAudio;
    if (!rec) return null;
    return rec.tail(sfx, bgm);
  }, { sfx, bgm });
}

/** 开录制窗(等价长按 F5 开窗)。 */
export async function audioRecordStart(page) {
  return page.evaluate(() => {
    const rec = window.__swAudio;
    if (!rec) return false;
    return rec.recording ? true : rec.toggle();
  });
}

/** 关录制窗并导出两通道全量(等价长按 F5 关窗 export)。 */
export async function audioRecordStopExport(page) {
  return page.evaluate(() => {
    const rec = window.__swAudio;
    if (!rec) return null;
    if (rec.recording) rec.toggle();
    return rec.export();
  });
}

/**
 * 尘粒子计数:包 g.spawnDust 计调用(类型分桶)。返回卸载函数语义——
 * 装一次,之后 dustSummary 抽走增量。★防重复包装(二次安装会把计数翻倍)。
 */
export async function installDustCounter(page) {
  return page.evaluate(() => {
    const g = window.__swGame;
    if (!g || g.__probeDustCounter) return false;
    const bucket = { total: 0, byType: {}, spawnNull: 0 };
    const orig = g.spawnDust.bind(g);
    g.spawnDust = (...args) => {
      const type = args[4];
      bucket.total++;
      bucket.byType[type] = (bucket.byType[type] ?? 0) + 1;
      const d = orig(...args);
      if (!d) bucket.spawnNull++;
      return d;
    };
    g.__probeDustCounter = bucket;
    return true;
  });
}

/** 抽走尘计数增量(清零复位)。 */
export async function dustSummary(page) {
  return page.evaluate(() => {
    const g = window.__swGame;
    const b = g?.__probeDustCounter;
    if (!b) return null;
    const snap = { total: b.total, byType: { ...b.byType }, spawnNull: b.spawnNull };
    b.total = 0; b.byType = {}; b.spawnNull = 0;
    return snap;
  });
}

/**
 * UI 文本快照:DOM 面(innerTitle/按钮/面板)。
 * ★VUI 画布 UI 的文字不在 DOM——画布面用 shot.litStats(非零像素),文本面
 * 用 Lang 键断言或游戏态直读,别指望 document.body.innerText。
 */
export async function uiTextSnapshot(page) {
  return page.evaluate(() => {
    const grab = (sel) => [...document.querySelectorAll(sel)].map((el) => el.textContent?.trim()).filter(Boolean).slice(0, 40);
    return {
      title: document.title,
      buttons: grab('button'),
      headings: grab('h1,h2,h3'),
      panels: grab('[class*="panel"] , [id*="panel"]'),
      overlays: [...document.querySelectorAll('[id^="sw-"]')].map((el) => el.id),
      bodyChars: document.body.innerText.length,
      bodyHead: document.body.innerText.slice(0, 600),
    };
  });
}
