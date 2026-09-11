/**
 * _bj60.mjs — 火焰花背包图标纯色 #8DC0BB 实机取证探针（SW-BJ60）
 *
 * 用户报告：火焰花世界掉落贴图正常，背包/物品栏图标=火焰花形状但整体纯色
 * （实测采样 #8DC0BB=(141,192,187)，恰为仓库表值 (123,167,163)=#7BA7A3 的
 * ×1.147 均匀显示色域偏移——三通道等比，见报告）。此前 2026-08-19 凝胶批
 * 在 VANILLA_ITEM_COLOR 表里给 316/317/318（腐化草/水叶草/火焰花）伪造了
 * "青色四件套"——1457 反编译 Item.cs case 313-318（:5146-5175）逐 case 均无
 * color 赋值，color 只在 case 319（鲨鱼鳍 :5176-5181）。此探针双相取证：
 *
 *   SW_BJ60_PHASE=pre  （修复前）：证明 bug 在场——火焰花图标纯色(123,167,163)、
 *                      掉落实体 d.color 被注入 (123,167,163,255)。
 *   SW_BJ60_PHASE=post （修复后）：证明修复生效——表 313-318 无项、火焰花图标
 *                      恢复原版多彩橙、掉落无 color；鲨鱼鳍(319)图标=乘法语义
 *                      （保留明暗多色，非纯色填充）；凝胶(23)仍为蓝系不回归。
 *
 * 取证面（三条路径）：
 *   ① 数据面：VANILLA_ITEM_COLOR 表活快照（src/data/vanillaItemColor.ts）
 *   ② 图标面：DOM 热栏槽 0 <img> 的 dataURL 解码逐像素（UI.iconUrl 烘焙链，
 *      即用户肉眼所见）
 *   ③ 掉落面：ItemDrop 构造注入 d.color（Renderer.drawDrop 两遍着色数据源）
 *      + 世界画布截图（肉眼证据，不硬断言——背景干涉）
 */
import {
  launchBrowser, openPage, bootstrap, createGame, pump, ledger, giveItems,
  saveCanvasShot, resolveShotPath,
} from '../tools/probe/lib/index.mjs';

const PHASE = process.env.SW_BJ60_PHASE === 'post' ? 'post' : 'pre';
const L = ledger();
const T = Date.now();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await pump(page, 30, { clearEnemies: true });

  // ── ① 数据面：VANILLA_ITEM_COLOR 活快照 ──
  const tableSnap = await page.evaluate(async (t) => {
    const m = await import(`/src/data/vanillaItemColor.ts?t=${t}`);
    const tbl = m.VANILLA_ITEM_COLOR;
    const herbFam = [313, 314, 315, 316, 317, 318, 2358, 307, 308, 309, 310, 311, 312, 2357];
    return {
      herbFamPresent: herbFam.filter((k) => tbl[k] !== undefined),
      keys: Object.keys(tbl).map(Number).sort((a, b) => a - b),
      full: JSON.parse(JSON.stringify(tbl)),
    };
  }, T);
  L.say(`表项 vid=${tableSnap.keys.join(',')}`);
  L.say(`草本家族(313-318/2358+种子)带项=${tableSnap.herbFamPresent.join(',') || '（无）'}`);

  // ── ② 图标面：热栏槽 0 逐 vid 取样（wipe+单件=槽0,读 DOM dataURL 解码） ──
  //    采样口径：32×32 图标解码后统计不透明像素——distinct 量化色数（步 8）与
  //    平均 RGB。纯色填充 ⇔ distinct=1 且 avg=填充色。
  const SAMPLE_VIDS = [
    { vid: 318, name: 'fireblossom 火焰花' },
    { vid: 313, name: 'daybloom 太阳花(同族对照)' },
    { vid: 319, name: 'sharkfin 鲨鱼鳍(真 color A=255)' },
    { vid: 23, name: 'gel 凝胶(真 color A=100)' },
    { vid: 22, name: 'ironbar 铁锭(真 color A=110)' },
  ];
  const icons = [];
  for (const sv of SAMPLE_VIDS) {
    const g = await giveItems(page, [{ vid: sv.vid, slot: 0 }], { wipe: true });
    if (!g.ok) { L.chk(`给物 vid=${sv.vid}`, false, JSON.stringify(g.failed)); continue; }
    // 直写 inv.slots 不走事件链 → 显式刷新热栏（UI.refreshAllAsync 探针契约）
    await page.evaluate(() => window.__swUI.refreshAllAsync());
    await pump(page, 6, { clearEnemies: false });
    const st = await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll('.sw-hotbar .sw-slot img'));
      const src = imgs.map((i) => i.getAttribute('src') ?? '').find((s) => s.startsWith('data:image/'));
      if (!src) return { ok: false, why: `no-dataurl(imgs=${imgs.length})` };
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('decode-fail')); img.src = src; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, c.width, c.height).data;
      const seen = new Map();
      let n = 0, r = 0, gg = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        n++;
        r += d[i]; gg += d[i + 1]; b += d[i + 2];
        const k = `${d[i] & ~7},${d[i + 1] & ~7},${d[i + 2] & ~7}`;
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
      n = n || 1;
      const top = [...seen.entries()].sort((a, b2) => b2[1] - a[1])[0];
      return {
        ok: true, w: c.width, h: c.height, opaque: n - (n ? 0 : 0), count: seen.size,
        avg: [Math.round(r / n), Math.round(gg / n), Math.round(b / n)],
        top: top ? [top[0], top[1]] : null,
        distinct: seen.size,
      };
    });
    if (!st.ok) { L.chk(`图标取样 ${sv.name}`, false, st.why ?? ''); continue; }
    L.say(`${sv.name}: distinct(量化色)=${st.distinct} avg=rgb(${st.avg.join(',')}) 众数=${st.top ? st.top[0] : '-'}×${st.top ? st.top[1] : 0}px`);
    icons.push({ ...sv, ...st });
  }

  const byVid = Object.fromEntries(icons.map((i) => [i.vid, i]));
  const fb = byVid[318];

  if (PHASE === 'pre') {
    // ── pre 相断言（bug 在场证明）──
    L.chk('pre: 草本家族 313-318/2358 被误染表项在场', tableSnap.herbFamPresent.length > 0,
      `present=${tableSnap.herbFamPresent.join(',')}`);
    L.chk('pre: 表=伪造四件套 316-319 全 (123,167,163,255)',
      [316, 317, 318, 319].every((k) => JSON.stringify(tableSnap.full[k]) === '[123,167,163,255]'),
      JSON.stringify(tableSnap.full));
    L.chk('pre: 火焰花图标=纯色填充(distinct=1)', fb && fb.distinct === 1,
      fb ? `distinct=${fb.distinct} avg=${fb.avg.join(',')}` : 'no-sample');
    L.chk('pre: 火焰花图标填充色=表青色(123,167,163)±8', fb && fb.distinct === 1
      && Math.abs(fb.avg[0] - 123) <= 8 && Math.abs(fb.avg[1] - 167) <= 8 && Math.abs(fb.avg[2] - 163) <= 8,
      fb ? `avg=${fb.avg.join(',')}` : 'no-sample');
  } else {
    // ── post 相断言（修复生效证明）──
    L.chk('post: 表 313-318/2358 全部无项（1457 Item.cs :5146-5175/:23750-23754 无 color 赋值）',
      tableSnap.herbFamPresent.length === 0, `present=${tableSnap.herbFamPresent.join(',')}`);
    L.chk('post: 鲨鱼鳍 319 仍带真表项 (123,167,163,255)（:5180 不回退）',
      JSON.stringify(tableSnap.full[319]) === '[123,167,163,255]', JSON.stringify(tableSnap.full[319]));
    L.chk('post: 铁锭 22 补真表项 (160,145,130,110)（:1640）',
      JSON.stringify(tableSnap.full[22]) === '[160,145,130,110]', JSON.stringify(tableSnap.full[22]));
    L.chk('post: A=0 组仅孤例 65/282/286/823/3002/3112/4776（无伪造扩组）',
      JSON.stringify(tableSnap.keys) === JSON.stringify([22, 23, 65, 282, 286, 319, 823, 3002, 3112, 4776]),
      tableSnap.keys.join(','));
    L.chk('post: 火焰花图标=原版多彩（distinct≥4，纯色填充消失）', fb && fb.distinct >= 4,
      fb ? `distinct=${fb.distinct} avg=${fb.avg.join(',')}` : 'no-sample');
    L.chk('post: 火焰花图标橙色主导（R>G>B，均值口径）', fb && fb.avg[0] > fb.avg[1] && fb.avg[1] > fb.avg[2],
      fb ? `avg=${fb.avg.join(',')}` : 'no-sample');
    L.chk('post: 同族太阳花 313 同样无染多彩', byVid[313] && byVid[313].distinct >= 4,
      byVid[313] ? `distinct=${byVid[313].distinct}` : 'no-sample');
    L.chk('post: 鲨鱼鳍 319 图标=乘法语义保留明暗（distinct≥4，非纯色填充）',
      byVid[319] && byVid[319].distinct >= 4,
      byVid[319] ? `distinct=${byVid[319].distinct} avg=${byVid[319].avg.join(',')}` : 'no-sample');
    L.chk('post: 鲨鱼鳍 319 图标青系主导（G>R）', byVid[319] && byVid[319].avg[1] > byVid[319].avg[0],
      byVid[319] ? `avg=${byVid[319].avg.join(',')}` : 'no-sample');
    L.chk('post: 凝胶 23 图标仍蓝系（B>R 不回归）', byVid[23] && byVid[23].avg[2] > byVid[23].avg[0],
      byVid[23] ? `avg=${byVid[23].avg.join(',')}` : 'no-sample');
  }

  // ── ③ 掉落面：ItemDrop 构造注入 d.color + 世界画布截图 ──
  await giveItems(page, [{ vid: 65, slot: 0 }], { wipe: true });   // 清掉火焰花手持（防磁吸干扰）
  const drop = await page.evaluate(async (t) => {
    const g = window.__swGame;
    const m = await import(`/src/entities/ItemDrop.ts?t=${t}`);
    const flow = window.__swFlow;
    const iid = flow.itemByVid(318);
    const d = new m.ItemDrop(g.player.x + 40, g.player.y, iid, 1);
    g.entities.drops.push(d);
    return { iid, color: d.color ?? null, x: d.x, y: d.y };
  }, T);
  L.say(`ItemDrop(318).color=${JSON.stringify(drop.color)}`);
  await pump(page, 20, { clearEnemies: false });
  const still = await page.evaluate(() => {
    const g = window.__swGame;
    const d = g.entities.drops.find((x) => !x.dead);
    return { alive: !!d, color: d?.color ?? null };
  });
  const shotPath = resolveShotPath(`bj60-drop-fireblossom-${PHASE}.png`);
  await saveCanvasShot(page, shotPath);
  L.say(`世界画布截图=${shotPath}`);
  if (PHASE === 'pre') {
    L.chk('pre: 掉落实体被注入青色 color（两路同错）', JSON.stringify(drop.color) === '[123,167,163,255]',
      JSON.stringify(drop.color));
    L.chk('pre: 掉落实体存活渲染中', still.alive, JSON.stringify(still));
  } else {
    L.chk('post: 掉落实体无 color（1457 草本无 item.color）', drop.color === null, JSON.stringify(drop.color));
    L.chk('post: 掉落实体存活渲染中', still.alive, JSON.stringify(still));
  }

  L.print();
  process.exit(L.exitCode());
} finally {
  await browser.close();   // J1 孤儿防线
}
