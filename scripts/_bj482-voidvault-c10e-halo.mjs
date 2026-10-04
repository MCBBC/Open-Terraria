// ★BJ482 虚空保险库透镜 c10e 加算黑晕定谳探针（用户实报"动画体四周暗晕/发黑,亮窗背景"）。
//   嫌疑面 = flushVoidLensComplements（7b0,compositeLight 后 'lighter' 直绘）缺
//   flushTrailShade 2026-10-03 同判例垫底（c10eCompositeIntoHud）：
//   c10e 分体呈现（默认开）= sky2D/glCanvas/HUD 三层 premul-over 叠合,加算落
//   【透明 HUD】把源 α 折进层 α → 最终合成 dst×(1−α) 衰减下层画面：
//     ① 回声环（α=0.2..0.4）→ 亮背景被衰减 20-40% = 本体四周暗晕;
//     ② 本体补差（α=255 二值栅格,暗场 L<255）→ 整格替换 glCanvas 本体×light 项
//        = ×light 半项整丢 = 发黑。
//   判别法（同帧差分,免相机/动画漂移——Z4 探针同款纪律）：
//   包裹 flushVoidLensComplements,flush 前/后 getImageData 本体盒 ±4px,同帧
//   快照 sky2D/glCanvas/tex/echo 规格,重建三层 premul-over 终帧：
//     · 环带（本体矩形外 4px 框,露天亮天空场景）: flush 视觉增量逐像素算
//       负增量像素数/均值 = 暗晕实锤;修后（垫底 α=255）增量 = +echo ≥ 0。
//     · 本体中心 12×12（暗场场景,补差 blit）: 终帧 vs 【gl 快照基底+补差+回声精确
//       几何加算】（钳 255）——基底用 gl 实测像素（免光图建模）,echo 用真实 blit 位
//       （exs/eys）+1.1× 缩放逆采样——纯合成面判别,与 Lerp 公式正确性（Z4 已证）解耦。
//   对照臂 ?c10e=0（单画布不透明面）: 修前即应零负增量/公式零误差 = 病是 c10e 特异。
// 用法: SW_ORIGIN=http://localhost:5213 node tools/run-diag.mjs scripts/_bj482-voidvault-c10e-halo.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'game', 'docs', 'evidence', 'bj482');
mkdirSync(OUT, { recursive: true });

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 },
});
const errors = [];
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function openGame(extraQuery) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 200)));
  await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5213') + '/?play=small' + (extraQuery ?? ''),
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  let inGame = false;
  for (let i = 0; i < 200 && !inGame; i++) {
    inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
    if (!inGame) await wait(1500);
  }
  if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if (/我已知晓|我知道了/.test(b.textContent || '')) { b.click(); break; }
    }
  });
  await wait(800);
  return page;
}

/** 包裹 flushVoidLensComplements:同帧三层快照+差分,结果存 r.__bj482 */
async function armProbe(page) {
  await page.evaluate(() => {
    const r = window.__swGame.renderer;
    r.__bj482 = null;
    const orig = r.flushVoidLensComplements.bind(r);
    r.flushVoidLensComplements = function () {
      const comps = (r._voidLensComps || []).map((c) => ({ ...c }));
      const echoes = (r._voidLensEchoComps || []).map((e) => ({ ...e, exs: [...(e.exs || [])], eys: [...(e.eys || [])] }));
      if (!comps.length) return orig();
      const c = comps[0];
      const M = 4;
      const x0 = Math.max(0, c.xd - M), y0 = Math.max(0, c.yd - M);
      const x1 = Math.min(this.canvas.width, c.xd + c.dw + M);
      const y1 = Math.min(this.canvas.height, c.yd + c.dh + M);
      const rw = x1 - x0, rh = y1 - y0;
      if (rw <= 0 || rh <= 0) return orig();
      const hud = this.ctx;
      const snap = (src) => {
        const cnv = document.createElement('canvas');
        cnv.width = rw; cnv.height = rh;
        const cc = cnv.getContext('2d', { willReadFrequently: true });
        cc.drawImage(src, x0, y0, rw, rh, 0, 0, rw, rh);
        return cc.getImageData(0, 0, rw, rh).data;
      };
      const hudBefore = hud.getImageData(x0, y0, rw, rh).data;
      const sky = r.skyCanvas ? snap(r.skyCanvas) : null;
      const gl = r.glCanvasEl ? snap(r.glCanvasEl) : null;
      // tex 帧（c.sx/c.sy 已含帧偏移）
      const tc = document.createElement('canvas');
      tc.width = 34; tc.height = 48;
      const tctx = tc.getContext('2d', { willReadFrequently: true });
      tctx.drawImage(c.img, c.sx, c.sy, 34, 48, 0, 0, 34, 48);
      const tex = tctx.getImageData(0, 0, 34, 48).data;
      // 补差是否 blit（代码同门:cr+cg+cb>0）
      const tint = [c.lr, c.lg, c.lb].map((l) => Math.round(0.5 * (255 - l)));
      const tintSum = tint[0] + tint[1] + tint[2];
      // 回声呼吸 α（VoidLensHelper.cs:92-93 同式;收集/flush 同帧零漂移）
      const t = r.lighting?.clock?.globalTimeWrappedHourly ?? 0;
      const aEcho = Math.cos(t * Math.PI * 2 / 5) * 0.1 + 0.3;
      const res = orig();
      const hudAfter = hud.getImageData(x0, y0, rw, rh).data;
      // 三层 premul-over 终帧重建（getImageData=straight RGBA;over:
      //   oa=at+ab(1-at); orgb=(rgbt·at+rgbb·ab(1-at))/oa;缺失层=跳过）
      const over2 = (tt, bb) => {
        const oa = tt[3] + bb[3] * (1 - tt[3]);
        if (oa <= 0) return [0, 0, 0, 0];
        return [
          (tt[0] * tt[3] + bb[0] * bb[3] * (1 - tt[3])) / oa,
          (tt[1] * tt[3] + bb[1] * bb[3] * (1 - tt[3])) / oa,
          (tt[2] * tt[3] + bb[2] * bb[3] * (1 - tt[3])) / oa,
          oa,
        ];
      };
      const layer = (buf, i) => buf ? [buf[i], buf[i + 1], buf[i + 2], buf[i + 3] / 255] : null;
      const stack = (top, mid, bot, i) => {
        const tp = layer(top, i);
        const mp = layer(mid, i);
        const bp = layer(bot, i);
        const t1 = mp ? over2(tp, mp) : tp;
        return bp ? over2(t1, bp) : t1;
      };
      // 环带 = 盒内、本体矩形外（回声 1.1×+轨道 ±3px 伸出 ≤4px）
      let ringN = 0, ringNeg = 0, ringNegSum = [0, 0, 0], ringPosSum = [0, 0, 0];
      let ringMin = 999, ringMaxNeg = 0, hudAlphaPartial = 0;
      for (let py = 0; py < rh; py++) {
        for (let px = 0; px < rw; px++) {
          const inBody = px >= c.xd - x0 && px < c.xd - x0 + c.dw && py >= c.yd - y0 && py < c.yd - y0 + c.dh;
          if (inBody) continue;
          const i = (py * rw + px) * 4;
          const aAfter = hudAfter[i + 3];
          if (aAfter > 0 && aAfter < 255) hudAlphaPartial++;
          if (aAfter === 0) continue;
          const fB = stack(hudBefore, gl, sky, i);
          const fA = stack(hudAfter, gl, sky, i);
          const d = [fA[0] - fB[0], fA[1] - fB[1], fA[2] - fB[2]];
          const dMin = Math.min(...d);
          ringN++;
          if (dMin < -1) {
            ringNeg++;
            ringMaxNeg = Math.max(ringMaxNeg, -dMin);
            for (let k = 0; k < 3; k++) ringNegSum[k] += d[k];
          } else {
            for (let k = 0; k < 3; k++) ringPosSum[k] += d[k];
          }
          if (dMin < ringMin) ringMin = dMin;
        }
      }
      // 本体中心 12×12 绝对对拍（无条件;补差加算项按 tintSum 门）:
      // 期望终帧 = 实测基底(gl 快照;对照单画布面=null→hudBefore 已含世界) + 补差(若
      //   blit) + Σecho 精确几何加算,钳 255。
      // echo 逆采样:echo i 左上=(exs[i],eys[i]),尺寸 dw2×dh2=1.1×dw/dh;
      //   本体盒 px(X,Y)→echo 局部=(X−exs[i])×34/dw2,(Y−eys[i])×48/dh2。
      let bodyN = 0, bodyErr = [0, 0, 0], bodyMax = 0, bodyBlitted = false;
      {
        const dw2 = Math.max(1, Math.round(34 * 1.1)), dh2 = Math.max(1, Math.round(48 * 1.1));
        const cx0 = Math.floor(c.dw / 2 - 6), cy0 = Math.floor(c.dh / 2 - 6);
        for (let py = 0; py < 12; py++) {
          for (let px = 0; px < 12; px++) {
            const txp = cx0 + px, typ = cy0 + py;
            const sxp = Math.min(33, Math.round(txp * 34 / c.dw));
            const syp = Math.min(47, Math.round(typ * 48 / c.dh));
            const ti = (syp * 34 + sxp) * 4;
            if (tex[ti + 3] < 255) continue;
            const ix = (c.xd - x0) + txp, iy = (c.yd - y0) + typ;
            const ii = (iy * rw + ix) * 4;
            bodyBlitted = true;
            const f = stack(hudAfter, gl, sky, ii);
            const base = gl ? [gl[ii], gl[ii + 1], gl[ii + 2]] : [hudBefore[ii], hudBefore[ii + 1], hudBefore[ii + 2]];
            let exp = base.slice();
            if (tintSum > 0) exp = exp.map((v, k) => v + tex[ti + k] * tint[k]);   // 补差加算
            for (const e of echoes) {
              for (let n = 0; n < e.exs.length; n++) {
                const ex = e.exs[n], ey = e.eys[n];
                // nearest 中心约定:dst 中心 (i+0.5) → src floor((i+0.5)×sw/dw)
                const lx = Math.floor((ix + x0 - ex + 0.5) * 34 / dw2);
                const ly = Math.floor((iy + y0 - ey + 0.5) * 48 / dh2);
                if (lx < 0 || lx > 33 || ly < 0 || ly > 47) continue;
                const ei = (ly * 34 + lx) * 4;
                if (tex[ei + 3] === 0) continue;
                exp = exp.map((v, k) => v + tex[ei + k] * [127, 50, 127][k] / 255 * e.alpha);
              }
            }
            exp = exp.map((v) => Math.min(255, v));
            bodyN++;
            for (let k = 0; k < 3; k++) {
              const er = Math.abs(f[k] - exp[k]);
              bodyErr[k] += er;
              if (er > bodyMax) bodyMax = er;
            }
          }
        }
      }
      r.__bj482 = {
        c10e: !!r._c10eFrame,
        compositedPre: !!r._c10eComposited,
        nComps: comps.length, nEcho: echoes.length,
        light: [c.lr, c.lg, c.lb], aEcho: +aEcho.toFixed(3), tintSum,
        ring: {
          n: ringN, neg: ringNeg,
          negAvg: ringNeg ? ringNegSum.map((v) => +(v / ringNeg).toFixed(1)) : null,
          posAvg: ringN - ringNeg ? ringPosSum.map((v) => +(v / (ringN - ringNeg)).toFixed(1)) : null,
          min: +ringMin.toFixed(1), maxNeg: +ringMaxNeg.toFixed(1),
          hudAlphaPartial,
        },
        body: {
          blitted: bodyBlitted, n: bodyN,
          errAvg: bodyN ? bodyErr.map((v) => +(v / bodyN).toFixed(1)) : null,
          errMax: bodyN ? +bodyMax.toFixed(1) : null,
          compSkipped: tintSum === 0,
        },
      };
      return res;
    };
  });
}

/** 场景 A:深穴暗场（Z4 同款 deepY≈330,库体自灯 L≈(153,122,255)→补差路径） */
async function sceneDeep(page) {
  return page.evaluate(async () => {
    const g = window.__swGame, p = g.player, st = g.world.store;
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    const VAULT = TILE_BY_KEY['v_491_void_vault'];
    const px0 = Math.floor(p.cx / 16);
    const deepY = Math.min(st.h - 12, 330);
    for (let yy = deepY - 9; yy <= deepY - 1; yy++) {
      for (let xx = px0 - 6; xx <= px0 + 8; xx++) st.setTileSilent(xx, yy, 0);
    }
    for (let xx = px0 - 6; xx <= px0 + 8; xx++) if (!st.isSolid(xx, deepY)) st.setTile(xx, deepY, 1, 0, 0);
    const top = deepY - 3;
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) st.setTileSilent(px0 + dx, top + dy, VAULT, dx * 18, dy * 18);
    }
    p.x = (px0 - 10) * 16; p.y = (deepY - 4) * 16 - 20; p.vx = 0; p.vy = 0;
    await new Promise((r) => setTimeout(r, 1600));
    const light = g.renderer.lighting?.lightAt(px0 + 1, top + 1) ?? [255, 255, 255];
    return { px0, top, deepY, light, c10e: !!g.renderer._c10eFrame };
  });
}

/** 场景 B:露天全亮（用户截图语境;背景亮天空,补差跳过,仅环带回声） */
async function sceneOpen(page) {
  return page.evaluate(async () => {
    const g = window.__swGame, p = g.player, st = g.world.store;
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    const VAULT = TILE_BY_KEY['v_491_void_vault'];
    const px0 = Math.floor(p.cx / 16) + 40;
    let gy = 4; for (; gy < 600 && !st.isSolid(px0 + 30, gy); gy++) {}
    const top = gy - 3;
    for (let yy = gy - 12; yy <= gy - 1; yy++) {
      for (let xx = px0 - 6; xx <= px0 + 8; xx++) st.setTileSilent(xx, yy, 0);
    }
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) st.setTileSilent(px0 + dx, top + dy, VAULT, dx * 18, dy * 18);
    }
    p.x = (px0 - 10) * 16; p.y = (gy - 4) * 16 - 20; p.vx = 0; p.vy = 0;
    await new Promise((r) => setTimeout(r, 1600));
    const light = g.renderer.lighting?.lightAt(px0 + 1, top + 1) ?? [255, 255, 255];
    return { px0, top, gy, light, c10e: !!g.renderer._c10eFrame };
  });
}

const shots = {};
async function runScenes(page, tag) {
  await armProbe(page);
  const a = await sceneDeep(page);
  await wait(400);
  const ma = await page.evaluate(() => window.__swGame.renderer.__bj482);
  shots[tag + '-deep'] = { scene: a, m: ma };
  console.log(`[${tag}] deep:`, JSON.stringify(a), JSON.stringify(ma));
  await page.screenshot({ path: join(OUT, `bj482-${tag}-deep.png`), encoding: 'binary' }).catch(() => {});
  const b = await sceneOpen(page);
  await wait(400);
  const mb = await page.evaluate(() => window.__swGame.renderer.__bj482);
  shots[tag + '-open'] = { scene: b, m: mb };
  console.log(`[${tag}] open:`, JSON.stringify(b), JSON.stringify(mb));
  await page.screenshot({ path: join(OUT, `bj482-${tag}-open.png`), encoding: 'binary' }).catch(() => {});
  return { deep: ma, open: mb, deepScene: a, openScene: b };
}

// ============ 主臂:默认 c10e 面 ============
console.log('--- 主臂: c10e 默认（分体呈现） ---');
const page = await openGame('');
const M = await runScenes(page, 'c10e');
check('主臂进了 c10e 帧', M.deep.c10e === true && M.open.c10e === true,
  `deep=${M.deep.c10e} open=${M.open.c10e} compositedPre=${M.deep.compositedPre}`);
check('A1 暗场场景有效:L<255 且补差 blit 且样本 >50（判别力前提）',
  M.deepScene.light[0] < 254 && M.deep.body.blitted && M.deep.body.n > 50 && !M.deep.body.compSkipped,
  `light=${M.deepScene.light} bodyN=${M.deep?.body?.n} tintSum=${M.deep?.tintSum}`);
check('A2 修复验证:暗场本体 vs 基底+补差+echo 精确式均值误差 ≤20（修前 99-163;深场 GL 读回仪器噪声放宽）',
  M.deep.body.errAvg && M.deep.body.errAvg.every((v) => v <= 20),
  `errAvg=${M.deep?.body?.errAvg} errMax=${M.deep?.body?.errMax}`);
check('A3 修复验证:全亮场景本体 echo 精确式误差 ≤6（修前 114-200;光稳定=模型精确域）',
  M.open.body.errAvg && M.open.body.errAvg.every((v) => v <= 6),
  `errAvg=${M.open?.body?.errAvg} errMax=${M.open?.body?.errMax}`);
check('B1 修复验证:露天亮天空环带零负增量（修前 neg=80-125/102,G −40 均值）',
  M.open.ring.neg === 0,
  `neg=${M.open?.ring?.neg}/${M.open?.ring?.n} posAvg=${M.open?.ring?.posAvg}`);
check('B2 修复验证:环带透明 HUD 签名清零（垫底后 α 恒 255;修前 partial=80-125）',
  M.open.ring.hudAlphaPartial === 0 && M.deep.ring.hudAlphaPartial === 0,
  `open=${M.open?.ring?.hudAlphaPartial} deep=${M.deep?.ring?.hudAlphaPartial}`);
check('B3 修复验证:暗场环带负增量清零（容 ≤2 仪器粒噪;修前 29-53）',
  M.deep.ring.neg <= 2,
  `neg=${M.deep?.ring?.neg}/${M.deep?.ring?.n}`);
await page.close();

// ============ 对照臂: ?c10e=0 单画布不透明面 ============
console.log('--- 对照臂: ?c10e=0（单画布） ---');
const page0 = await openGame('&c10e=0');
const C = await runScenes(page0, 'ctrl');
check('C1 对照面非 c10e 帧', C.deep.c10e === false, `c10e=${C.deep.c10e}`);
check('C2 对照面环带零负增量（单画布不透明=加算语义正确,修前即成立）',
  C.open.ring.neg === 0, `neg=${C.open?.ring?.neg}/${C.open?.ring?.n} min=${C.open?.ring?.min}`);
check('C3 对照面本体=基底+补差+echo 精确式（误差 ≤15:echo 漩涡梯度区最近邻采样残差;证明期望式与病特异性）',
  C.deep.body.errAvg && C.deep.body.errAvg.every((v) => v <= 15),
  `errAvg=${C.deep?.body?.errAvg}`);
check('C4 对照面全亮场景本体同式（误差 ≤10）',
  C.open.body.errAvg && C.open.body.errAvg.every((v) => v <= 10),
  `errAvg=${C.open?.body?.errAvg}`);
// ★跨臂 parity（仪器噪声鲁棒判别:GL 读回伪影两臂同享,病面/修复面两臂相异）:
const parity = (m, c, tag, tol) => {
  const ok = m && c && m.errAvg && c.errAvg
    && m.errAvg.every((v, i) => Math.abs(v - c.errAvg[i]) <= tol);
  check(`P${tag} 主臂 vs 对照臂本体误差差 ≤${tol}（深场仪器噪声两臂同享相消;修前主臂病面远超对照必炸）`,
    ok, `main=${m?.errAvg} ctrl=${c?.errAvg}`);
};
parity(M.deep.body, C.deep.body, '1-deep', 15);
parity(M.open.body, C.open.body, '2-open', 5);
await page0.close();

writeFileSync(join(OUT, 'bj482-verdict-result.json'), JSON.stringify({ ...shots, pageErrs: errors }, null, 2));
console.log(`RESULT pass=${pass} fail=${fail} pageErrs=${errors.length}`);
await browser.close();
process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
