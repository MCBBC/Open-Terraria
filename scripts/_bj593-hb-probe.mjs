// ★BJ593 探针 1（v3,标定版）：苔藓黄蜂 176/黄蜂 42 血条镜像偏转行为级判别。
//   标定（scripts/_bj593-hb-cal.mjs + /tmp/bj593-cal2.mjs）：血条纹理像素 b 通道≈6-7,
//   填充段亮 (r+g>180,b<40),空段/边暗 —— fillLeft/fillRight 判据见 isFill。
//   v3 窗=血条本体 36×12 精确（by=条顶）,条内行 1..10（跳 AA 圆角行）。
//   三判据（原版语义:填充恒左锚 fillLeft≈0-2/fillRight≈fill/各行齐平/条顶恒定）:
//   mirror = fillLeft 中位 > 4z+2（镜像时 fillLeft≈36-fill）
//   tilt   = 行间 fillRight 极差 > 2z+1（倾斜条逐行斜移）
//   bjump  = fillRight 中位帧间跳变 > 2z+1（hp 恒定 → 边界冻结）
// A/B：tag ON（Snapthorn 4910 在手+minionTargetId 指向靶）× tag OFF 对照。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=590000 scripts/_bj593-hb-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode, clearEnemies, freezeClock } from '../tools/probe/lib/index.mjs';

const browser = await launchBrowser({});
try {
  for (const variant of [
    { name: 'tag-on', q: '', tag: true },
    { name: 'tag-off', q: '', tag: false },
  ]) {
    const page = await openPage(browser, {});
    await bootstrap(page, process.env.SW_ORIGIN + variant.q);
    await createGame(page, { mode: 'direct', seed: 'bj593', size: 'small' });
    await godMode(page, true);
    await clearEnemies(page);
    await freezeClock(page, { tod: 0.45 });

    const result = await page.evaluate(async (TAG_ON) => {
      const g = window.__swGame;
      const mod = await import('/src/entities/Enemy.ts');
      const p = g.player;
      const ptx = Math.floor(p.cx / 16);
      let surf = 0;
      for (let y = 1; y < g.world.store.h; y++) { if (g.world.store.isSolid(ptx, y)) { surf = y; break; } }
      let cv = null;
      document.querySelectorAll('canvas').forEach((c) => { if (c.width >= 1000 && c.getContext('2d')) cv = c; });
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      const dpr = window.devicePixelRatio || 1;
      const nextFrame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(true))));
      const isFill = (r, gg, b) => b < 40 && r + gg > 180;
      if (TAG_ON) {
        p.inv.slots[0] = { id: 4910, stack: 1 };
        p.inv.selected = 0;
      }
      const out = { path: g.renderer.bglPathUsed, acc: g.renderer._accMode, dpr, per: {} };
      for (const vid of [176, 42]) {
        const e = mod.Enemy.fromVanilla(vid, p.cx + 70, surf * 16 - 90);
        if (!e) { out.per[vid] = { err: 'spawn fail' }; continue; }
        g.entities.add(e, 'enemies');
        e.hurt(Math.floor(e.maxHp / 3), 0, 0, g);
        if (TAG_ON) p.minionTargetId = e.id;
        await nextFrame();
        const expFill = Math.max(3, Math.min(36, Math.floor((36 * e.hp) / e.maxHp)));
        const rows = [];
        const anomalyDumps = [];
        for (let f = 0; f < 600; f++) {
          if (f % 24 === 0) e.vx = (Math.floor(f / 24) % 2 === 0) ? 2.6 : -2.6;
          await nextFrame();
          const cam = g.camera;
          const z = cam.zoom * dpr;
          const barWorldX = e.cx - 18, barWorldY = e.y + e.h + 10;
          const bx = Math.round((640 * dpr) + (barWorldX - cam.x) * z);
          const by = Math.round((400 * dpr) + (barWorldY - cam.y) * z);
          const img = ctx.getImageData(bx, by, Math.max(1, Math.round(36 * z)), Math.max(1, Math.round(12 * z)));
          const d = img.data;
          const W = img.width, H = img.height;
          const rowLR = [];
          for (let ry = 1; ry < H - 1; ry++) {
            let l = -1, rr = -1, cnt = 0;
            for (let px = 0; px < W; px++) {
              const i = (ry * W + px) * 4;
              if (isFill(d[i], d[i + 1], d[i + 2])) { cnt++; if (l < 0) l = px; rr = px; }
            }
            if (cnt >= 6) rowLR.push([l, rr]);
          }
          const med = (arr, k) => arr.length ? arr.map((v) => v[k]).sort((a, b) => a - b)[Math.floor(arr.length / 2)] : -1;
          const fillL = med(rowLR, 0), fillR = med(rowLR, 1);
          const spread = rowLR.length ? Math.max(...rowLR.map((v) => v[1])) - Math.min(...rowLR.map((v) => v[1])) : -1;
          const rec = { f, facing: e.facing, vx: Math.round(e.vx * 100) / 100, fillL, fillR, spread };
          rows.push(rec);
          // 异常帧现场 dump：48×24 分类网格 + 弹幕覆盖记录（原版血条=接口层顶,本仓
          //  实体循环内画 → 弹/尘可覆盖=候选差异面）
          const badFrame = (fillL > 4 * dpr + 2) || (spread > 2 * dpr + 1) || (fillR >= 0 && Math.abs(fillR - expFill) > 2 * dpr + 1);
          if (badFrame && anomalyDumps.length < 4) {
            const wide = ctx.getImageData(bx - 6 * z, by - 6 * z, Math.round(48 * z), Math.round(24 * z));
            const wd = wide.data, WW = wide.width, WH = wide.height;
            const grid = [];
            for (let ry = 0; ry < WH; ry++) {
              let row = '';
              for (let px = 0; px < WW; px++) {
                const i = (ry * WW + px) * 4;
                const r = wd[i], gg = wd[i + 1], b = wd[i + 2], a = wd[i + 3];
                const inBar = px >= 6 * z && px < 42 * z && ry >= 6 * z && ry < 18 * z;
                let cls;
                if (a < 40) cls = '.';
                else if (isFill(r, gg, b)) cls = '#';
                else if (b < 40 && r + gg < 100) cls = ':';   // 暗(b<40)
                else if (b > gg + 20 && b > r + 20) cls = 'B';
                else cls = '?';
                row += inBar ? cls : cls.toLowerCase();
              }
              grid.push(row);
            }
            const projs = [];
            for (const arr of [g.entities.projectiles, g.entities.enemies, g.entities.drops]) {
              for (const o of (arr ?? [])) {
                if (!o || o.dead || o === e) continue;
                if (o.x + (o.w ?? 0) > barWorldX - 6 && o.x < barWorldX + 42
                  && o.y + (o.h ?? 0) > barWorldY - 6 && o.y < barWorldY + 18) {
                  projs.push({ kind: o.constructor?.name, id: o.projId ?? o.vanillaId ?? o.id, x: Math.round(o.x), y: Math.round(o.y), w: o.w, h: o.h });
                }
              }
            }
            anomalyDumps.push({ ...rec, expFill, grid, projs });
          }
        }
        if (TAG_ON) p.minionTargetId = -1;
        let mirror = 0, tilt = 0, bjump = 0, prevR = null;
        const bad = [];
        for (const r of rows) {
          if (r.fillL > 4 * dpr + 2) { mirror++; if (bad.length < 10) bad.push({ ...r, kind: 'mirror' }); }
          if (r.spread > 2 * dpr + 1) { tilt++; if (bad.length < 10) bad.push({ ...r, kind: 'tilt' }); }
          if (prevR !== null && r.fillR >= 0 && Math.abs(r.fillR - prevR) > 2 * dpr + 1) {
            bjump++; if (bad.length < 10) bad.push({ ...r, kind: 'bjump', prevR });
          }
          if (r.fillR >= 0) prevR = r.fillR;
        }
        out.per[vid] = { frames: rows.length, expFill, mirror, tilt, bjump, bad,
          anomalyDumps,
          hpTail: rows.slice(-3).map((r) => [r.f, r.fillL, r.fillR, r.spread]) };
        g.entities.remove?.(e) || (e.dead = true);
      }
      return out;
    }, variant.tag);
    console.log(`=== variant ${variant.name} ===`);
    console.log(JSON.stringify(result));
    page.close?.();
  }
} finally {
  await browser.close();
}
