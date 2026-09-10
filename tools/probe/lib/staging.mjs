/**
 * IIII240 统一探针框架 —— 受控布景(staging)+光照保证+昼夜预设。
 *
 * 三坑收编(用户实报三高频坑,坑史锚):
 *  - 坑①昼夜可见性:探针在「只有白天可见/只有黑夜可见」的场景截到全黑/错误时段图。
 *    钟面按真实时间推进(dayLengthMs=24min,src/world/World.ts:46 Clock),headless
 *    实验一跑几分钟=跨过晨昏线;老探针裸赋 `c.timeOfDay=0.4` 后又泵=钉了也漂。
 *    → `TOD/resolveTod` 预设('day'|'night'|'dusk'|'dawn'|0..1)+shot.screenshot 钉钟链。
 *  - 坑②角色位置不对:截到的图不是动作发生区——相机 follow 0.15/frame 缓动
 *    (memory: lavaslope 五坑#2)+光照区随玩家重扫(Game.ts:10145 ensureRegion(player));
 *    布景手工摆位在 50+ 支探针里各写各的(_iii220-visual 火把花园/_iii233-golf-hole
 *    相机直写/_iii234-probe 清场铺地)→ `stage()` 一键库化。
 *  - 夜间光照保证:夜间截图黑=没截到不是"功能缺失"(probe-guide §E3),但内容断言
 *    需要"看得见"→ 火把注入(_iii220-visual 照明花园模式:地板行火把+手持火把)
 *    或换昼拍,由 shot.screenshot 的 onDark 分派。
 *
 * 页内实现函数(`__*InPage`)独立导出:框架自测(tests/probe-framework.test.ts)
 * 在 Node 里对假 window/假 store 直跑,零浏览器零网络。
 */

/** 昼夜预设(0..1 线性 24h;0=午夜 0.5=正午)。dawn/dusk 与 src/world/World.ts
 *  Clock.DAWN/DUSK 字面同步(守卫测试钉死;夜中段取 22:00 避开 ±0.04 过渡带)。 */
export const TOD = {
  dawn: 4.5 / 24,    // 0.1875 = 04:30 昼夜边界(Clock.DAWN)
  day: 0.5,          // 12:00 正午(dayFactor=1,光照染色链全开)
  dusk: 19.5 / 24,   // 0.8125 = 19:30 昼夜边界(Clock.DUSK)
  night: 22 / 24,    // 22:00 夜中段(isDay=false,dayFactor=0.32 月光档)
};

/**
 * 纯函数:解析 `time` 参数 → tod(0..1)。
 *   null/undefined → { ok:true, tod:null }(不动钟,尊重探针自己的时钟夹具);
 *   number         → 折回 0..1(负数/超 1 容错);
 *   'day'|'night'|'dusk'|'dawn'(大小写不敏感) → TOD 预设;
 *   其余           → { ok:false, why }。
 */
export function resolveTod(time) {
  if (time == null) return { ok: true, tod: null };
  if (typeof time === 'number' && Number.isFinite(time)) return { ok: true, tod: ((time % 1) + 1) % 1 };
  const key = String(time).trim().toLowerCase();
  if (key in TOD) return { ok: true, tod: TOD[key] };
  return { ok: false, why: `unknown-time:${time}` };
}

/**
 * 页内:动态点光注入(原版 Lighting.AddLight 语义;0-1 RGB,每光照周期消费)。
 * grid>1 时以 (wx,wy) 为中心铺 grid×grid 间距 spacing(tile) 的光阵——夜间
 * 整屏补光用;单体补光用 grid=1。★瞬态:引擎每周期清 perFrame,只保「注入→
 * 同周期落图→立刻截」的窗口;持久光源请用火把(见 __torchInjectInPage)。
 */
export function __relightInPage({ wx = null, wy = null, rgb = [1, 1, 0.9], grid = 1, spacing = 10 } = {}) {
  const g = window.__swGame;
  const L = g?.lighting;
  if (!L || typeof L.addLight !== 'function') return { ok: false, why: 'no-lighting' };
  const cx = wx ?? g.camera?.x ?? 0, cy = wy ?? g.camera?.y ?? 0;
  const ctx = Math.floor(cx / 16), cty = Math.floor(cy / 16);
  const span = (grid - 1) / 2;
  let n = 0;
  for (let iy = 0; iy < grid; iy++) {
    for (let ix = 0; ix < grid; ix++) {
      const tx = ctx + Math.round((ix - span) * spacing);
      const ty = cty + Math.round((iy - span) * spacing);
      if (g.world?.store?.inBounds && !g.world.store.inBounds(tx, ty)) continue;
      L.addLight(tx, ty, rgb[0], rgb[1], rgb[2]);
      n++;
    }
  }
  L.dirty = true;   // 同 tick 快进整个光照周期(LightingEngine.runFullCycle)
  return { ok: n > 0, lights: n, at: [ctx, cty] };
}

/** 动态点光注入(页面包装)。 */
export async function relight(page, opts) {
  return page.evaluate(__relightInPage, opts ?? {});
}

/**
 * 页内:持久火把注入(IIII220 照明花园模式的最小单元)。
 * 在 (tx,ty) 就近找可锚位:本格空且下格实心 → 直接放;否则向下扫 ≤depth 格找
 * 实心地面,火把落地面上一格。火把是真实 tile 光源(TileLightScanner 每周期扫),
 * 不像 AddLight 会被下周期清掉——夜间截图补光的**持久**手段。
 * torchTile 缺省页内反查 TILE_BY_KEY['torch'](Node 自测显式传 id)。
 * 返回 { ok, at:[tx,ty] } 或 { ok:false, why }。★会改世界——返回值带落点供探针记账/复原。
 */
export async function __torchInjectInPage({ tx = null, ty = null, wx = null, wy = null, torchTile = null, depth = 6 } = {}) {
  const g = window.__swGame, st = g?.world?.store;
  if (!st) return { ok: false, why: 'no-game' };
  if (tx == null) tx = Math.floor((wx ?? g.camera?.x ?? 0) / 16);
  if (ty == null) ty = Math.floor((wy ?? g.camera?.y ?? 0) / 16);
  if (torchTile == null) {
    try {
      const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
      torchTile = TILE_BY_KEY['torch'] ?? TILE_BY_KEY['v_4_torches'];
    } catch { torchTile = null; }
    if (torchTile == null) return { ok: false, why: 'no-torch-tile' };
  }
  const inB = (x, y) => x >= 0 && y >= 0 && x < st.w && y < st.h;
  const place = (x, y) => {
    st.setTile(x, y, torchTile, 0, 0);
    const i = st.idx(x, y);
    // 同 evaluate 读回:证明写面真实落进 SoA 通道(跨 evaluate 后引擎可能因
    // 弹幕 cutTiles/失锚等合法链把火把打掉——后续存活不属本 API 的保证域)
    return { ok: true, at: [x, y], active: !!st.flags[i], type: st.type[i] };
  };
  // ① 本格即锚(空格+下格实心)
  if (inB(tx, ty) && !st.flags[st.idx(tx, ty)] && inB(tx, ty + 1) && st.isSolid(tx, ty + 1)) {
    return place(tx, ty);
  }
  // ② 向下找地面(空格带底),火把贴地面
  for (let d = 0; d <= depth; d++) {
    const y = ty + d;
    if (!inB(tx, y)) break;
    if (st.isSolid(tx, y)) {
      const ay = y - 1;
      if (ay >= 0 && !st.flags[st.idx(tx, ay)]) return place(tx, ay);
      return { ok: false, why: 'anchor-occupied' };
    }
  }
  return { ok: false, why: 'no-ground-below' };
}

/** 持久火把注入(页面包装)。 */
export async function injectTorch(page, opts) {
  return page.evaluate(__torchInjectInPage, opts ?? {});
}

/**
 * 页内:一键受控布景。步骤(与 50+ 支探针的手工摆位同构,库化):
 *   ① 场景中心 = at{tx,ty} 或玩家当前位置;② 自动寻地面(auto:从中心向下第一块实心);
 *   ③ 清整带(G9 场景污染首因:全位归零含 liquid/wire/half/slope/paint);
 *   ④ platform 铺地板(缺省=保留自然地面);⑤ light 火把行+可选手持火把/动态光阵;
 *   ⑥ tiles 目标物(相对中心 dx/dy;key 或内部 id);⑦ npc(vid=原版敌怪/key=镇民);
 *   ⑧ player 传送布景中心+清速度;⑨ camera 直写对框(0.15 缓动旁路,lavaslope 五坑#2)。
 * 返回 { ok, cx, cy(=地面行), wx, wy(=中心世界像素), tx0..ty1(清整带), torches, npc?, why? }。
 * ★光照收敛不在此做(布景是空间域;shot.screenshot 的时间域泵负责)——布景后直接
 *   读光照读数的探针须自泵 ≥4t(4 态光照周期)。
 */
export async function __stageInPage({
  at = null, w = 40, h = 24, clear = true,
  platform = null,          // { tile|key, rows=1 } | null=保留自然地面 | false=不碰地面
  light = null,             // 'torch' | { torchTile?, step=8, dy? , hold=true, addLight? }
  tiles = [],               // [{ dx, dy, tile|key, frameX=0, frameY=0 }]
  npc = null,               // { vid, dx=0, dy=-2 } | { key, dx=0, dy=-2 }
  player = true, camera = true,
} = {}) {
  const g = window.__swGame, st = g?.world?.store;
  if (!g || !st) return { ok: false, why: 'no-game' };
  const ptx = at ? at.tx : Math.floor(g.player.cx / 16);
  const pty = at ? at.ty : Math.floor(g.player.cy / 16);
  const out = { cx: ptx, wx: ptx * 16 + 8 };

  // ② 自动寻地面(平台行=向下第一块实心;golf/torchgod 探针同款扫描)
  let gy = pty;
  const scanMax = Math.max(h, 40);
  while (gy < st.h - 2 && gy - pty <= scanMax && !st.isSolid(ptx, gy)) gy++;
  if (!st.isSolid(ptx, gy)) return { ok: false, why: 'no-ground-below', cx: ptx, cy: pty };
  out.cy = gy; out.groundY = gy;
  out.wy = gy * 16 - 20;   // 场景中心世界像素(地表上方 1 tile 附近;哨兵窗/相机锚点用)

  const x0 = ptx - (w >> 1), x1 = x0 + w - 1;
  const top = platform === false ? 0 : h - 1;
  const y0 = gy - top, y1 = gy - 1;
  out.tx0 = x0; out.tx1 = x1; out.ty0 = y0; out.ty1 = y1;

  // ③ 清整带(地面以上全位归零;clearArea 同款全通道,含 G3 half/slope 位)
  if (clear) {
    for (let y = Math.max(1, y0); y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 1 || y < 1 || x >= st.w - 1 || y >= st.h - 1) continue;
        const i = st.idx(x, y);
        st.setTile(x, y, 0, 0, 0);
        st.liquid[i] = 0; st.wire[i] = 0; st.half[i] = 0; st.slope[i] = 0; st.paint[i] = 0;
      }
    }
  }

  // ④ 地板
  if (platform && platform !== false) {
    const rows = platform.rows ?? 1;
    let tid = platform.tile;
    if (tid == null && platform.key) {
      try { const { TILE_BY_KEY } = await import('/src/data/tiles.ts'); tid = TILE_BY_KEY[platform.key]; } catch { /* Node 自测走 tile 直填 */ }
    }
    if (tid == null) return { ok: false, why: 'platform-no-tile', ...out };
    for (let r = 0; r < rows; r++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 1 || x >= st.w - 1) continue;
        st.setTile(x, gy + r, tid, 0, 0);
      }
    }
  }

  // ⑤ 照明(IIII220 火把花园:地板行火把 + 玩家手持火把双保险;可选动态光阵)
  let torchN = 0;
  if (light) {
    const L = light === 'torch' ? {} : light;
    let torchTile = L.torchTile ?? null;
    if (torchTile == null) {
      try { const { TILE_BY_KEY } = await import('/src/data/tiles.ts'); torchTile = TILE_BY_KEY['torch'] ?? TILE_BY_KEY['v_4_torches']; } catch { torchTile = null; }
      if (torchTile == null) return { ok: false, why: 'no-torch-tile', ...out };
    }
    const step = L.step ?? 8;
    for (let x = x0 + 2; x <= x1 - 2; x += step) {
      const ty = gy - 1 + (L.dy ?? 0);
      if (ty >= 1 && !st.flags[st.idx(x, ty)] && st.isSolid(x, ty + 1)) { st.setTile(x, ty, torchTile, 0, 0); torchN++; }
    }
    if (L.hold !== false && window.__swFlow?.itemByVid) {
      const iid = window.__swFlow.itemByVid(8);   // 原版火把 item vid=8
      if (iid != null && iid >= 0) { g.player.inv.slots[0] = { id: iid, stack: 1 }; g.player.inv.selected = 0; }
    }
    if (L.addLight) {
      const [r, gg, b] = L.addLight;
      g.lighting?.addLight?.(ptx, gy - 2, r, gg, b);
      if (g.lighting) g.lighting.dirty = true;
    }
  }
  out.torches = torchN;

  // ⑥ 目标物(相对场景中心;先清目标格防悬空连坐)
  let placed = 0;
  for (const t of tiles ?? []) {
    const x = ptx + (t.dx ?? 0), y = gy + (t.dy ?? -1);
    if (x < 1 || y < 1 || x >= st.w - 1 || y >= st.h - 1) continue;
    let tid = t.tile;
    if (tid == null && t.key) {
      try { const { TILE_BY_KEY } = await import('/src/data/tiles.ts'); tid = TILE_BY_KEY[t.key]; } catch { tid = null; }
    }
    if (tid == null) continue;
    st.setTile(x, y, tid, t.frameX ?? 0, t.frameY ?? 0);
    placed++;
  }
  out.placed = placed;

  // ⑦ NPC(vid=原版敌怪 via __swFlow.spawnVanillaEnemy;key=镇民 via TownNPC 类)
  if (npc) {
    const nx = (ptx + (npc.dx ?? 0)) * 16 + 8, ny = (gy + (npc.dy ?? -2)) * 16;
    if (npc.vid != null && window.__swFlow?.spawnVanillaEnemy) {
      out.npc = await window.__swFlow.spawnVanillaEnemy(npc.vid, nx, ny);
    } else if (npc.key != null) {
      try {
        const { TownNPC } = await import('/src/entities/TownNPC.ts');
        const n = new TownNPC(npc.key, nx, ny);
        n.x = nx - n.w / 2; n.y = ny;
        if (npc.home) n.home = { ...npc.home };
        g.entities.add(n, 'npcs');
        out.npc = { key: npc.key, x: n.x, y: n.y };
      } catch (e) { out.npc = { why: String(e?.message ?? e).slice(0, 120) }; }
    }
  }

  // ⑧ 玩家传送布景中心(站上地板顶面)+清速度
  if (player && g.player) {
    g.player.x = ptx * 16 + 8 - g.player.w / 2;
    g.player.y = gy * 16 - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
    out.playerAt = [g.player.x, g.player.y];
  }
  // ⑨ 相机直写对框(玩家在布景中心 → 相机=玩家中心,略上抬看全地板行)
  if (camera && g.camera) {
    g.camera.x = ptx * 16 + 8;
    g.camera.y = (gy - 3) * 16;
    out.camAt = [g.camera.x, g.camera.y];
  }
  return { ok: true, ...out };
}

/** 一键布景(页面包装)。opts 同 __stageInPage。 */
export async function stage(page, opts = {}) {
  return page.evaluate(__stageInPage, opts);
}
