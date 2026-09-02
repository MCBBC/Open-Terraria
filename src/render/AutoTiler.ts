// RuleTile 自动贴合器：移植 Maples 的 CustomTile 规则语义。
// 邻居值语义（源项目 CustomTile.cs）：
//   0=Any(忽略) 1=This 2=NotThis 3=Any(specified∪this，按 This 处理)
//   4=Specified(按 This 处理) 5=NotSpecified(按 NotThis 处理) 6=Air(仅空气)
// m_RuleTransform: 0=Fixed 1=Rotated —— 边缘规则旋转匹配四方向（位置与精灵同转）
import { bitmapize, type Baked } from './bitmapize';
import type { SpriteAtlas, RuleTileDef } from '../assets/SpriteAtlas';
import type { DrawRect } from '../assets/SpriteAtlas';
import { hash2 } from '../core/rng';
import { T as TT } from '../data/tiles';
import type { TileStore } from '../world/TileStore';

const T_TREE = TT.TREE;

// Unity 坐标系（y 向上）下的 90° 旋转
const rotPos = (px: number, py: number): [number, number] => [-py, px];

export class AutoTiler {
  constructor(public atlas: SpriteAtlas) {}

  // 旋转后的精灵画布缓存：key "file|sprite|rot"
  private rotCache = new Map<string, Baked>();   // 写一次 → 异步升格 ImageBitmap

  private rotatedRect(sp: { file: string; sprite: string }, base: DrawRect, rot: number): DrawRect {
    if (rot === 0) return base;
    const key = `${sp.file}|${sp.sprite}|${rot}`;
    let c = this.rotCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = base.sw; c.height = base.sh;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = false;
      ctx.translate(base.sw / 2, base.sh / 2);
      // 位置旋转 (x,y)→(-y,x)（Unity y-up 的 90° 逆时针视觉方向）
      // 在 y-down 画布上等价的视觉旋转是顺时针 → rotate 负号
      ctx.rotate((-rot * Math.PI) / 2);
      ctx.drawImage(base.img, base.sx, base.sy, base.sw, base.sh, -base.sw / 2, -base.sh / 2, base.sw, base.sh);
      this.rotCache.set(key, c);
      bitmapize(this.rotCache, key);
    }
    return { img: this.rotCache.get(key) ?? c, sx: 0, sy: 0, sw: c.width, sh: c.height };
  }

  /** 对 (x,y) 求贴合贴图。layer='tile' 比较 tile 类型；'wall' 比较墙类型 */
  tile(
    ruleName: string, store: TileStore,
    x: number, y: number, tileType: number,
    layer: 'tile' | 'wall' = 'tile',
  ): DrawRect | null {
    // 人工标注驱动（annotator.html 导出），如 '@grass'
    if (ruleName.startsWith('@')) {
      return this.annotatedTile(ruleName.slice(1), store, x, y, tileType);
    }
    const def: RuleTileDef | undefined = this.atlas.resources.rules[ruleName];
    if (!def) return null;
    // 泥土/石头：四邻无空气暴露（全被实心或草皮包围）→ 无缝内格精灵，
    // 消除地形内部出现带缝隙的边缘变体；仅真正临空才用边缘件
    if (ruleName === 'Dirt' || ruleName === 'Stone') {
      let exposed = false;
      for (const [px, py] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        if (!store.inBounds(x + px, y + py)) continue;
        const ni = store.idx(x + px, y + py);
        // ★幽灵保域（2026-09-03）：flags bit0 首门——幽灵残型（flags=0,type≠0）视同空气暴露
        if (store.flags[ni] === 0 || store.type[ni] === 0) { exposed = true; break; }
      }
      if (!exposed) {
        const base = this.baseSprite(ruleName, x, y);
        if (base) return base;
      }
    }
    const isSame = (nx: number, ny: number): 0 | 1 | 2 => {
      // 0=air 1=this 2=other
      if (!store.inBounds(nx, ny)) return 0;
      const i = store.idx(nx, ny);
      // ★幽灵保域（2026-09-03）：tile 层幽灵残型（flags=0）视同空气（墙层不受幽灵影响）
      if (layer === 'tile' && store.flags[i] === 0) return 0;
      const v = layer === 'wall' ? store.wall[i] : store.type[i];
      if (v === 0) return 0;
      return v === tileType ? 1 : 2;
    };
    // 草皮禁用规则旋转：草面必须始终朝上（侧面暴露在原版是草皮垂落，
    // 旋转精灵会把草面转到侧面 —— Maples 规则集的角落规则会在错误旋转下命中）
    const noRotate = ruleName === 'Grass';
    for (const rule of def.tilingRules) {
      const rotations = !noRotate && rule.transform === 1 ? [0, 1, 2, 3] : [0];
      for (const rot of rotations) {
        let ok = true;
        for (let i = 0; i < rule.positions.length && i < rule.neighbors.length; i++) {
          let [px, py] = rule.positions[i];
          for (let r = 0; r < rot; r++) [px, py] = rotPos(px, py);
          const want = rule.neighbors[i];
          if (want === 0) continue; // Any
          // Unity 规则坐标 y 向上，本引擎 y 向下 → 取反
          const actual = isSame(x + px, y - py);
          const wantThis = want === 1 || want === 3 || want === 4;
          const wantNot = want === 2 || want === 5;
          const wantAir = want === 6;
          if (wantThis && actual !== 1) { ok = false; break; }
          if (wantNot && actual !== 2 && actual !== 0) { ok = false; break; }
          if (wantAir && actual !== 0) { ok = false; break; }
        }
        if (!ok || rule.sprites.length === 0) continue;
        // 树干误中枝干规则：枝干规则的邻居条件（一侧上中下皆树）对相邻的
        // 树干格同样成立 → 树干会随机画出整条枝干（浮空断干）。
        // 竖向连接树干的格子只从非 Branches 的树干变体池里选
        let pool = rule.sprites;
        if (ruleName === 'Tree') {
          const hasVert = isSame(x, y - 1) === 1 || isSame(x, y + 1) === 1;
          if (hasVert) {
            const noBranch = rule.sprites.filter((s) => !s.sprite.includes('Branches'));
            if (noBranch.length) pool = noBranch;
          }
        }
        // m_Output 1 = Random：按坐标 hash 选变体
        const idx = rule.output === 1 && pool.length > 1
          ? Math.floor(hash2(x, y, 71) * pool.length) % pool.length
          : 0;
        const sp = pool[Math.min(idx, pool.length - 1)];
        const base = this.atlas.rect(sp.file, sp.sprite);
        if (!base) continue;
        return this.rotatedRect(sp, base, rot);
      }
    }
    if (def.defaultSprite) {
      // 草皮兜底：默认精灵是"左侧垂落"侧向贴图，直接用会把侧面/底部暴露画成左旋。
      // 改为按暴露方向从绿边分类组里选。
      if (ruleName === 'Grass') {
        const fb = this.grassFallback(store, x, y, tileType);
        if (fb) return fb;
      }
      return this.atlas.rect(def.defaultSprite.file, def.defaultSprite.sprite);
    }
    return null;
  }

  /** 树苗精灵：Tree_Bodys 首个树干段（16×20 的树苗样子） */
  saplingSprite(x: number, y: number): DrawRect | null {
    const r = this.atlas.rect('地形/Tree_Bodys.png', 'Tree_Bodys_0');
    return r ?? this.weedSprite(x, y);
  }

  /** 杂草精灵（Tiles_3，16×20，按坐标 hash 选变体） */
  private weedCache: DrawRect[] | null = null;
  weedSprite(x: number, y: number): DrawRect | null {
    if (!this.weedCache) {
      const list: DrawRect[] = [];
      for (let k = 0; k <= 14; k++) {
        const r = this.atlas.rect('地形/Tiles_3.png', 'Tiles_3_' + k);
        if (r) list.push(r);
      }
      if (!list.length) return null; // 素材未就绪:空表不缓存(中毒防御),下帧重查
      this.weedCache = list;
    }
    return this.weedCache[Math.floor(hash2(x, y, 401) * this.weedCache.length) % this.weedCache.length];
  }

  /**
   * 原版架构：草皮 = 不透明泥土内格底 + 带透明缺口的草皮覆盖。
   * 返回指定规则集的"内格"精灵（全邻同类规则），供草皮垫底。
   */
  baseSprite(ruleName: string, x: number, y: number): DrawRect | null {
    const def = this.atlas.resources.rules[ruleName];
    if (!def) return null;
    // 找"全邻 This"的内格规则（neighbors 全为 1/3/4）
    for (const rule of def.tilingRules) {
      const allThis = rule.neighbors.length > 0 &&
        rule.neighbors.every((v) => v === 1 || v === 3 || v === 4);
      if (allThis && rule.sprites.length) {
        const sp = rule.sprites[Math.floor(hash2(x, y, 71) * rule.sprites.length) % rule.sprites.length];
        const r = this.atlas.rect(sp.file, sp.sprite);
        if (r) return r;
      }
    }
    if (def.defaultSprite) return this.atlas.rect(def.defaultSprite.file, def.defaultSprite.sprite);
    return null;
  }

  // ---- 草皮数据驱动兜底：按绿边方位分类精灵，按暴露方向选择 ----
  private grassGroups: Record<string, Array<{ key: string; rect: DrawRect }>> | null = null;

  private analyzeGrass() {
    const file = '地形/Tiles_2.png';
    const entry = this.atlas.data.files[file];
    const img = this.atlas.images.get(file);
    if (!entry || !img) return;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const groups: Record<string, Array<{ key: string; rect: DrawRect }>> = {};
    for (const s of entry.sprites) {
      if (s.w !== 16 || s.h !== 16) continue;
      const rect = this.atlas.rect(file, s.name);
      if (!rect) continue;
      const d = ctx.getImageData(rect.sx, rect.sy, 16, 16).data;
      const greenRatio = (x0: number, y0: number, bw: number, bh: number) => {
        let n = 0, t = 0;
        for (let y = y0; y < y0 + bh; y++) {
          for (let x = x0; x < x0 + bw; x++) {
            const i = (y * 16 + x) * 4;
            if (d[i + 3] < 40) continue;
            t++;
            if (d[i + 1] > d[i] + 30 && d[i + 1] > d[i + 2] + 30) n++;
          }
        }
        return t ? n / t : 0;
      };
      const top = greenRatio(0, 0, 16, 4);
      const bottom = greenRatio(0, 12, 16, 4);
      const left = greenRatio(0, 0, 4, 16);
      const right = greenRatio(12, 0, 4, 16);
      const max = Math.max(top, bottom, left, right);
      if (max < 0.55) continue; // 绿边不明显，非草皮边缘块
      // 只收完整方块（覆盖率高）：排除角落残片/装饰碎块
      let opaque = 0;
      for (let j = 3; j < d.length; j += 4) if (d[j] > 40) opaque++;
      if (opaque / 256 < 0.75) continue;
      // 取最强侧；不显著高于对侧（斜角/全绿件）一律归 T，避免杂件混入侧组
      let side: string;
      if (max === bottom && bottom > top * 1.5) side = 'B';
      else if (max === left && left > right * 1.5) side = 'L';
      else if (max === right && right > left * 1.5) side = 'R';
      else side = 'T';
      if (!groups[side]) groups[side] = [];
      groups[side].push({ key: s.name, rect });
    }
    this.grassGroups = groups;
  }

  private grassFallback(store: TileStore, x: number, y: number, tileType: number): DrawRect | null {
    if (!this.grassGroups) this.analyzeGrass();
    const g = this.grassGroups!;
    if (!g.T && !g.L && !g.R && !g.B) return null;
    const air = (nx: number, ny: number) => {
      if (!store.inBounds(nx, ny)) return true;
      const ni = store.idx(nx, ny);
      return store.flags[ni] === 0 || store.type[ni] === 0;   // ★幽灵残型视同空气
    };
    const sideAir = [air(x, y - 1), air(x + 1, y), air(x, y + 1), air(x - 1, y)]; // 上右下左
    // 优先：暴露侧的垂落变体；多侧暴露取上 > 侧 > 下；无暴露用顶绿
    let want = 'T';
    if (sideAir[3] && g.L?.length) want = 'L';
    else if (sideAir[1] && g.R?.length) want = 'R';
    else if (sideAir[0] && g.T?.length) want = 'T';
    else if (sideAir[2] && g.B?.length) want = 'B';
    const list = g[want] ?? g.T;
    if (!list?.length) return null;
    const pick = list[Math.floor(hash2(x, y, 977) * list.length) % list.length];
    return pick.rect;
  }

  // ---- 人工标注驱动（annotator.html 导出的方位标签）----
  private annGroups: Record<string, Record<string, DrawRect[]>> = {};
  // 镂空补齐缓存：sprite 名 → 合成画布（透明像素用件自身泥土色填补，
  // 相邻草块连续无缝，边缘又是覆盖件自身质感，不露程序化泥土底）
  private filledCache = new Map<string, Baked>();

  private filledRect(r: DrawRect, key: string): DrawRect {
    let c = this.filledCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = r.sw; c.height = r.sh;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
      const img = ctx.getImageData(0, 0, r.sw, r.sh);
      const d = img.data;
      const w = r.sw, h = r.sh;
      // 多源 BFS：每个透明/半透明像素取最近不透明邻像素的颜色（图像修复式填补），
      // 草边延伸草色、土边延伸土色 —— 避免"平均色"造成的灰绿污染
      const dist = new Int16Array(w * h).fill(-1);
      const queue: number[] = [];
      // 源阈值 128：PNG 提取管线的 alpha 常停在 254，用 255 会找不到源 → 全黑
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (d[i + 3] >= 128) {
            dist[y * w + x] = 0;
            queue.push(y * w + x);
          }
        }
      }
      // 兜底：完全没有源像素时（极端情况），整块用中心色填充避免黑块
      if (queue.length === 0) {
        const ci = ((h >> 1) * w + (w >> 1)) * 4;
        for (let i = 0; i < d.length; i += 4) {
          d[i] = d[ci]; d[i + 1] = d[ci + 1]; d[i + 2] = d[ci + 2]; d[i + 3] = 255;
        }
      }
      let qh = 0;
      while (qh < queue.length) {
        const p = queue[qh++];
        const px = p % w, py = (p / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if (dist[np] !== -1) continue;
          dist[np] = dist[p] + 1;
          queue.push(np);
          // 继承传播源颜色（首层即原始不透明像素色），硬 alpha 255
          const si = p * 4, ni = np * 4;
          d[ni] = d[si]; d[ni + 1] = d[si + 1]; d[ni + 2] = d[si + 2]; d[ni + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      this.filledCache.set(key, c);
      bitmapize(this.filledCache, key);
    }
    return { img: this.filledCache.get(key) ?? c, sx: 0, sy: 0, sw: c.width, sh: c.height };
  }

  private annotatedTile(annKey: string, store: TileStore, x: number, y: number, tileType: number): DrawRect | null {
    // annKey: 'grass' → 表 '地形/Tiles_2.png'；其它表可在此扩展
    const sheetByAnn: Record<string, string> = { grass: '地形/Tiles_2.png' };
    const file = sheetByAnn[annKey];
    const tags = file ? this.atlas.annotations[file] : null;
    if (!tags) return null;
    // 惰性建组
    let groups = this.annGroups[annKey];
    if (!groups) {
      groups = {};
      for (const [name, tag] of Object.entries(tags)) {
        const rect = this.atlas.rect(file!, name);
        if (!rect) continue;
        (groups[tag] ??= []).push(rect);
      }
      this.annGroups[annKey] = groups;
    }
    if (!Object.keys(groups).length) return null;
    const sideState = (nx: number, ny: number): 'grass' | 'air' | 'other' => {
      if (!store.inBounds(nx, ny)) return 'air';
      const si = store.idx(nx, ny);
      const t = store.type[si];
      if (store.flags[si] === 0) return 'air';   // ★幽灵保域:幽灵残型视同空气
      if (t === tileType) return 'grass';
      if (t === T_TREE) return 'air'; // 树干不是实心连接：草皮可贴着树干生长
      return t === 0 ? 'air' : 'other';
    };
    const T2 = sideState(x, y - 1), R2 = sideState(x + 1, y);
    const B2 = sideState(x, y + 1), L2 = sideState(x - 1, y);
    // 转角优先：一角两侧皆空气、且对角两侧有实心衔接 → 用角件过渡（地表线下降/上升的拐角）
    // tl: 上左皆空；tr: 上右皆空；bl: 下左皆空；br: 下右皆空
    const isAir = (s: string) => s === 'air';
    const hasSupport = (s1: string, s2: string) => s1 === 'other' || s2 === 'other' || s1 === 'grass' || s2 === 'grass';
    let cornerTag: string | null = null;
    if (isAir(T2) && isAir(L2) && hasSupport(B2, R2)) cornerTag = 'tl';
    else if (isAir(T2) && isAir(R2) && hasSupport(B2, L2)) cornerTag = 'tr';
    else if (isAir(B2) && isAir(L2) && hasSupport(T2, R2)) cornerTag = 'bl';
    else if (isAir(B2) && isAir(R2) && hasSupport(T2, L2)) cornerTag = 'br';
    // 兼容性评分选件（修"顶部长出底部/左下/右下件"的错位）：
    // 每件定义裸土侧（接泥土最佳）与草侧（朝空气最佳），按四邻状态打分取最低。
    // 索引：0上 1右 2下 3左
    const PIECES: Record<string, { bare: number[]; green: number[] }> = {
      top:    { bare: [2], green: [0, 1, 3] },
      bottom: { bare: [0], green: [2, 1, 3] },
      left:   { bare: [1], green: [3, 0, 2] },
      right:  { bare: [3], green: [1, 0, 2] },
      tl:     { bare: [1, 2], green: [0, 3] },
      tr:     { bare: [3, 2], green: [0, 1] },
      bl:     { bare: [1, 0], green: [2, 3] },
      br:     { bare: [3, 0], green: [2, 1] },
    };
    const sides = [T2, R2, B2, L2];
    const score = (tag: string): number => {
      if (tag === 'full') {
        return sides.reduce((acc, s) => acc + (s === 'grass' ? 0 : s === 'air' ? 1 : 2), 0);
      }
      const p = PIECES[tag];
      let sc = 0;
      for (const bi of p.bare) {
        const s = sides[bi];
        sc += s === 'other' ? 0 : s === 'grass' ? 1 : 2;
      }
      for (const gi of p.green) {
        const s = sides[gi];
        sc += s === 'air' ? 0 : s === 'grass' ? 1 : 3;
      }
      return sc;
    };
    let want: string, bestScore = Infinity;
    if (cornerTag && groups[cornerTag]?.length) {
      want = cornerTag; // 转角件优先
    } else {
      want = 'full';
      for (const tag of ['top', 'tl', 'tr', 'left', 'right', 'bl', 'br', 'bottom', 'full']) {
        if (!groups[tag]?.length) continue;
        const sc = score(tag);
        if (sc < bestScore) { bestScore = sc; want = tag; }
      }
    }
    const pickFrom = (tag: string): DrawRect | null => {
      const list = groups[tag];
      if (!list?.length) return null;
      return list[Math.floor(hash2(x, y, 551) * list.length) % list.length];
    };
    return pickFrom(want) ?? pickFrom('full') ?? (want !== 'top' ? pickFrom('top') : null);
  }
}
