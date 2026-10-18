// BJ637:刃杖 864 朝向复报定谳探针(一次性)——闲置悬停 rot=π(竖刃尖朝下)真机截图+数值证据。
// 旧病灶:AI_169 闲置档 tAng 转写漏加后项(UnitY.ToRotation()=π/2 被当终值,原式=π/2+π/2=π)
//  → 竖刃贴图(帧 0 尖朝上)横置 90° = 用户截图 107.png「多把飞刃横向一排」。
// 步骤:随从上限提到 4(直注绕过召唤门=容量外同拍直杀,探针伪影防) + buff 271 + 4×864 编队
//  → 泵 120 拍(rot 收敛) → 采样 rot/a169St → 整画布截图(docs/evidence/bj637-864-orientation/)。
// 判据:每刃 |rot−π|<0.05(竖直);对照 A=冻结态强设 rot=π/2 复现旧横置(仅绘态)供比对。
// 用法:SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj637-rot-shot.mjs
import { REPO_ROOT, join } from './_pathlib.mjs';
import { launchBrowser, openPage, bootstrap, createGame, pump, godMode } from '../tools/probe/lib/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const OUT = join(REPO_ROOT, 'docs/evidence/bj637-864-orientation');
fs.mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260909 });
await godMode(page, true);

// ---- 上限 4 + 注入 4×864 编队 + buff 271 续命 ----
const sum = await page.evaluate(async () => {
  const g = window.__swGame;
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const { buffTypeByVanilla } = await import('/src/stats/Buffs.ts').catch(() => ({}));
  const p = g.player;
  // 容量 4：equipStats 每帧自装备重建（直写被洗）→ 实例属性遮蔽 getter（可配置,探针脚手架）
  Object.defineProperty(p, 'maxMinions', { value: 4, configurable: true });
  if (buffTypeByVanilla) {
    const bt = buffTypeByVanilla(271);
    if (bt !== undefined) p.buffs.apply(bt, 6000);
  }
  const ids = [];
  for (let i = 0; i < 4; i++) {
    const m = new MinionProj(p.cx - 20 + i * 14, p.y - 30, 864, 6, i, false, 0, false, () => p);
    g.entities.add(m, 'projectiles');
    ids.push(m.id);
  }
  return { ids, maxMinions: (Object.getOwnPropertyDescriptor(p, 'maxMinions')?.value ?? p.maxMinions) };
});
console.log('[summon4]', JSON.stringify(sum));
await pump(page, 2);

// ---- 泵 120 拍(悬停收敛)后采样 rot/a169St/存活 ----
const sample = await page.evaluate(async () => {
  const g = window.__swGame;
  const { buffTypeByVanilla } = await import('/src/stats/Buffs.ts');
  const bt = buffTypeByVanilla(271);
  const ms = g.entities.projectiles.filter((e) => e.projId === 864 && !e.dead);
  for (let t = 0; t < 120; t++) {
    g.fixedUpdate(1 / 60);
    if (t % 40 === 39 && bt !== undefined) g.player.buffs.apply(bt, 6000);
  }
  return ms.map((m) => ({
    id: m.id,
    rotDeg: +(m.rot * 180 / Math.PI).toFixed(1),
    st: m.a169St,
    dead: !!m.dead,
    anchorDist: +Math.hypot(g.player.cx - m.cx, (g.player.y - 30) - m.cy).toFixed(1),
  }));
});
console.log('[rot-sample]', JSON.stringify(sample));
const alive = sample.filter((s) => !s.dead);
const ok = alive.length > 0 && alive.every((s) => Math.abs(Math.abs(s.rotDeg - 180) < 5 || Math.abs(s.rotDeg + 180) < 5));
console.log('[verdict]', ok ? 'VERTICAL(rot=+-180deg) PASS' : 'FAIL', `alive=${alive.length}/${sample.length}`);

// ---- 主画布 = 面积最大 canvas ----
const cvInfo = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')];
  let best = null, bestA = 0;
  for (const c of cs) {
    const r = c.getBoundingClientRect();
    if (r.width * r.height > bestA) { bestA = r.width * r.height; best = r; }
  }
  return { x: best.x, y: best.y, width: best.width, height: best.height };
});
console.log('[canvas]', JSON.stringify(cvInfo));

// ---- 截图 B:修后真机(竖刃) ----
await page.screenshot({ path: path.join(OUT, 'after-fix-vertical.png'), clip: cvInfo });

// ---- 截图 A:旧值对照(冻结泵后强设 rot=π/2 绘态,复现旧横置) ----
await page.evaluate(() => {
  const g = window.__swGame;
  for (const m of g.entities.projectiles.filter((e) => e.projId === 864 && !e.dead)) {
    m.rot = Math.PI / 2;   // 旧病灶值(仅绘态,不再泵=AI 不覆写)
  }
});
await page.screenshot({ path: path.join(OUT, 'before-fix-horizontal-replay.png'), clip: cvInfo });

console.log('[shots]', OUT);
await browser.close();
