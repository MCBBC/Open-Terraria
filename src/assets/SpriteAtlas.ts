// Unity 素材图集运行时加载器
// 数据由 scripts/build-atlas.mjs 生成（public/sprites/atlas.json + resources.json）
// 原版素材由 scripts/vanilla-atlas.mjs 生成（public/sprites/vanilla.json，独立命名空间、无 Unity y 翻转）
// 注意：Unity 精灵 rect 的 y 轴原点在【左下】，Canvas 在【左上】，取用时要翻转。
import atlasJson from '../../public/sprites/atlas.json';
import resourcesJson from '../../public/sprites/resources.json';
import vanillaJson from '../../public/sprites/vanilla.json';
import vanillaNpcsJson from '../../public/sprites/vanilla-npcs.json';
import vanillaUiJson from '../../public/sprites/vanilla-ui.json';

/** npc id → 动画帧数（SetDefaults 提取数据派生；懒加载 NPC 表用） */
const vanillaNpcFrames: Record<string, number> = Object.fromEntries(
  Object.entries(vanillaNpcsJson as Record<string, { frames?: number }>).map(([k, v]) => [k, v.frames ?? 1]),
);

export interface SpriteRect { name: string; x: number; y: number; w: number; h: number; }
export interface SpriteRef { file: string; sprite: string; }
export interface RuleDef {
  id: number;
  sprites: SpriteRef[];
  neighbors: number[];
  positions: Array<[number, number]>;
  transform: number;
  output: number;
}
export interface RuleTileDef { defaultSprite: SpriteRef | null; tilingRules: RuleDef[]; }

export interface AtlasFile { guid: string; sprites: SpriteRect[]; idToName: Record<string, string>; }
export interface AtlasData {
  files: Record<string, AtlasFile>;
  guidToFile: Record<string, string>;
}
export interface ResourcesData {
  items: Array<{ name: string; type: string; iconGuid: string | null; placeTile: string | null; funcList: string }>;
  tiles: Array<{ name: string; tileGuid: string; layer: string; digList: string; digTime: string; dropItemGuid: string }>;
  potions: Array<{ name: string; type: string; iconGuid: string | null; buffType: number | null; duration: number | null; isHealType: string }>;
  accessories: Array<{ name: string; type: string; iconGuid: string | null }>;
  buffs: Array<{ name: string; iconGuid: string | null }>;
  anims: Record<string, SpriteRef[]>;
  rules: Record<string, RuleTileDef>;
}

export interface DrawRect { img: HTMLImageElement | HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number; }

// ---- 原版素材命名空间（vanilla.json，TEdit 数据驱动） ----

// 进图必预载的杂项单图(2026-08-13 大瘦身 304→88):
// 保留两类——①chunk 静态烘焙消费(树冠/树枝/树干/仙人掌/蘑菇顶):晚到要等
// invalidateAll 重烘焙,fallback 会烤进 chunk,必须预载;②液体渲染首帧可见
// (水/岩浆/蜂蜜/微光的基础四张+瀑布三张):首帧闪素色不可接受。
// 其余全部移除转懒加载:NPC_Head 旗帜头像(vmisc)/链条与 Boss 部件叠画(vmisc)/
// Glow 叠画(ensureVImage)/机关弹幕(弹幕渲染懒加载)/导线图集(ensureVImage)/
// 月总手与光之女皇部件(vmisc)/Misc_Perlin——消费方全部每帧活画,ensureVImage
// 未就绪跳帧、下帧自愈。注意 NPC_Head 此前 121 张盲扫 id 0-120,其中 81-120
// 磁盘上不存在(真文件 0-80 + 独立命名的 NPC_Head_Boss_N)= 每次进图 40 个 404。
export const VANILLA_MISC = [
  // ① chunk 烘焙族
  // 开关换 tile 对(全部跨表,开门/开栅态世界生成极罕见→表常未载→重烘跳格=消失~1s;
  // 2026-08-13 用户报地牢门,全族排查:门 10↔11/高门 388↔389/活板门 387↔386/格栅 557↔558)
  'vanilla/Tiles_10.png', 'vanilla/Tiles_11.png',
  'vanilla/Tiles_386.png', 'vanilla/Tiles_387.png', 'vanilla/Tiles_388.png', 'vanilla/Tiles_389.png',
  'vanilla/Tiles_557.png', 'vanilla/Tiles_558.png',
  ...Array.from({ length: 32 }, (_, i) => `vanilla/Tree_Tops_${i}.png`),
  ...Array.from({ length: 32 }, (_, i) => `vanilla/Tree_Branches_${i}.png`),
  ...Array.from({ length: 7 }, (_, i) => `vanilla/Tiles_5_${i}.png`),
  'vanilla/Tiles_323.png', 'vanilla/Tiles_72.png',  // 棕榈/发光蘑菇树干(群系专属但极小,常驻防传送闪失)
  'vanilla/Evil_Cactus.png', 'vanilla/Good_Cactus.png', 'vanilla/Crimson_Cactus.png',
  'vanilla/Shroom_Tops.png',
  // ② 液体首帧必需(其余 waterStyle 变体由 VanillaLiquidRenderer/WaterfallRenderer
  //    的 ensureVImage 活画路径按当前样式自取)
  'vanilla/Liquid_0.png', 'vanilla/Liquid_1.png', 'vanilla/Liquid_11.png', 'vanilla/Liquid_14.png',
  'vanilla/Misc_water_0.png', 'vanilla/Misc_water_1.png', 'vanilla/Misc_water_11.png', 'vanilla/Misc_water_14.png',
  'vanilla/Waterfall_0.png', 'vanilla/Waterfall_1.png', 'vanilla/Waterfall_14.png',
];
export interface VanillaTileMeta {
  name: string; key: string; sheet: string;
  solid: boolean; blend: boolean; framed: boolean; light: boolean;
  color: string; placement: string | null;
  grid: [number, number];      // 帧像素尺寸（蜡烛类 [16,20]）
  stride: [number, number];    // 表内帧步长（grid+gap，如 [18,18]）
  frameSize: Array<[number, number]>; // 每个 style 的占格数
  cols: number; rows: number;
  isStone?: boolean; isGrass?: boolean; mergeWith?: number | null;
}
export interface VanillaItemMeta {
  name: string; key: string; icon: string; createTile: number | null;
  /** 图集子矩形(vanilla-atlas.mjs shelf-pack 后携带;旧单体条目无此组) */
  ix?: number; iy?: number; iw?: number; ih?: number;
}
export interface VanillaWallMeta {
  name: string; key: string; sheet: string; color: string;
  grid: [number, number]; stride: [number, number]; cols: number; rows: number;
  largeFrame?: number;
}
// NPC 贴图表（纵向帧条：小动物等）
export interface VanillaNpcMeta { sheet: string; frameW: number; frameH: number; count: number; }
export interface VanillaData {
  tiles: Record<string, VanillaTileMeta>;
  items: Record<string, VanillaItemMeta>;
  walls: Record<string, VanillaWallMeta>;
  npcs?: Record<string, VanillaNpcMeta>;
  tileNames?: Record<string, string>;  // 全量原版 tile id → 英文名（兼容报告用）
  itemNames?: Record<string, string>;
  /** 盔甲贴图槽位序号（Armor_Head/Armor_Armor/Armor_Legs 的索引，非物品 id） */
  armorIndex?: Record<string, { head: number; body: number; legs: number }>;
}

/** vui 键失配登记(运行期防线,2026-08-13):每键 warn 一次进 F5 报告 warn 环,
 *  miss 键集合供 DebugReport assetHealth 段展示 */
const _vuiKeyMisses = new Set<string>();
function vuiKeyMiss(name: string): void {
  if (_vuiKeyMisses.has(name)) return;
  _vuiKeyMisses.add(name);
  console.warn(`[SpriteAtlas] vui 键不存在: '${name}'(uiFiles 键须带 .png 后缀,裸键恒 null)`);
}

/** 整图硬 alpha：alpha ≥128 → 255，<128 → 0（并清零 RGB），消除提取 PNG 的半透明镶边 */
function hardAlpha(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] >= 128) px[i + 3] = 255;
    else {
      px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0;
    }
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

export class SpriteAtlas {
  data = atlasJson as unknown as AtlasData;
  resources = resourcesJson as unknown as ResourcesData;
  vanilla = vanillaJson as unknown as VanillaData;
  images = new Map<string, ImageBitmap | HTMLImageElement | HTMLCanvasElement>();
  /** ★ImageBitmap 化(2026-08-14 根治):drawImage(HTMLImageElement) 走浏览器
   *  懒解码缓存,GPU 压力下被驱逐→静默重解码(三份 trace 14-21 万次解码风暴)。
   *  createImageBitmap = 自持已解码像素(原版 Texture2D 语义):绘制永不重解码,
   *  close() = Dispose。?bitmap=0 走旧 Image 路径(逃生门) */
  static readonly USE_BITMAP = typeof createImageBitmap === 'function'
    && !(typeof location !== 'undefined' && new URLSearchParams(location.search).has('bitmap') && location.search.includes('bitmap=0'));
  vimages = new Map<string, ImageBitmap | HTMLImageElement>(); // 原版 PNG（干净像素，不做 hardAlpha）
  /** UI 贴图（vanilla-ui/，干净像素不 hardAlpha——UI 有抗锯齿边缘） */
  uiimages = new Map<string, ImageBitmap | HTMLImageElement>();
  private uiFiles = (vanillaUiJson as { files: Record<string, string> }).files;
  /** 人工标注（annotator.html 导出）：sheet → spriteName → 方位标签 */
  annotations: Record<string, Record<string, string>> = {};

  async load(onProgress?: (p: number) => void): Promise<void> {
    // 封面/Splash_*:Maples 源包的 1920×1080 启动插画(每张 ~17MB 解码 + hardAlpha
    // canvas 拷贝),全仓无消费方(菜单用 vanilla-ui/Logo)——启动即死重,跳过
    const files = Object.keys(this.data.files).filter((f) => !/封面\/Splash_/.test(f));
    // 原版 vanilla 素材与 vanilla-ui 贴图全部不在启动预载(8550 请求/主菜单 2GB 根因):
    // 图块/墙/NPC 表 → Game.newWorld/loadWorld 里 preloadVanillaWorld() 预载
    // (onWorldReady 之前完成,首帧 chunk 烘焙无回退);物品图标 → vicon 按需
    // 懒加载 + 进世界后 prefetchIcons() 后台补齐;UI 贴图 → vui() 按需
    // 懒加载(全部 11 处消费方每帧重查,首帧 null 自兜底)
    const vfiles: string[] = [];
    const uifiles: string[] = [];
    let done = 0;
    const total = files.length + vfiles.length + uifiles.length;
    await Promise.all([
      ...files.map((f) => new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          // 根源处理：整图硬 alpha —— 抗锯齿半透明像素（提取 PNG 的灰/黑镶边来源）
          // 二值化为 0/255，所有消费方（tile/墙/图标/角色）统一获得干净像素
          this.images.set(f, hardAlpha(img));
          done++;
          onProgress?.(done / total);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = `sprites/${encodeURI(f)}`;
      })),
    ]);
    // 人工标注（可选，缺失时回退）
    try {
      const r = await fetch('sprites/annotations.json');
      if (r.ok) this.annotations = await r.json();
    } catch { /* 无标注 */ }
  }

  // ---- 原版素材 API（无 Unity y 翻转，按 TEdit 网格寻址） ----

  /** 原版图块元数据 */
  vmeta(sheetId: number): VanillaTileMeta | null {
    return this.vanilla.tiles[String(sheetId)] ?? null;
  }

  /** 原版图块表取帧（col,row 从 0 起）。越界/缺失返回 null */
  vframe(sheetId: number, col: number, row: number): DrawRect | null {
    const m = this.vmeta(sheetId);
    if (!m) return null;
    const img = this.ensureVImage(m.sheet);  // 懒加载兜底(正常路径 preloadVanillaWorld 已就绪)
    if (!img) return null;
    if (col < 0 || row < 0 || col >= m.cols || row >= m.rows) return null;
    return { img, sx: col * m.stride[0], sy: row * m.stride[1], sw: m.grid[0], sh: m.grid[1] };
  }

  /** 原版表内任意像素偏移取帧（style/显式帧：18px 步长的 frameX/frameY 直用） */
  vframeAt(sheetId: number, fx: number, fy: number): DrawRect | null {
    const m = this.vmeta(sheetId);
    if (!m) return null;
    // 与 vframe/vrect 同语义懒加载（ensureVImage）：place_v_* 物品图标走本方法,
    // 此前直接 vimages.get——表未载时不发加载请求,宝箱内家具类物品图标永久回退
    const img = this.ensureVImage(m.sheet);
    if (!img) return null;
    if (fx < 0 || fy < 0 || fx + m.grid[0] > img.width || fy + m.grid[1] > img.height) return null;
    return { img, sx: fx, sy: fy, sw: m.grid[0], sh: m.grid[1] };
  }

  /** 原版表内任意矩形（多格物体整体取图，如墓碑 2×2 = 34×34px） */
  vrect(sheetId: number, fx: number, fy: number, w: number, h: number): DrawRect | null {
    const m = this.vmeta(sheetId);
    if (!m) return null;
    const img = this.ensureVImage(m.sheet);
    if (!img) return null;
    if (fx < 0 || fy < 0 || fx + w > img.width || fy + h > img.height) return null;
    return { img, sx: fx, sy: fy, sw: w, sh: h };
  }

  /** 原版 NPC 贴图表取帧（纵向帧条，frameIdx 0-based）。
   *  未登记的 id 懒加载 vanilla/NPC_{id}.png（帧数来自 vanilla-npcs.json），首帧返回 null 下一帧生效 */
  private lazyNpcMeta = new Map<string, VanillaNpcMeta>();
  /** ⚠仅适用【纵向帧条】NPC 表。横向变体横条 NPC（如 594 风气球 = 8 列×32px 变体,
   *  Main.cs:23383 Frame(8,1,ai[2])）走此路径会把整条横排画出来——此类 NPC 必须
   *  在 Renderer.drawEnemy 加专属分支按列切片（见 drawWindyBalloon）。 */
  vnpc(npcId: number, frameIdx: number): DrawRect | null {
    let m: VanillaNpcMeta | undefined = this.vanilla.npcs?.[String(npcId)];
    if (!m) {
      const key = String(npcId);
      m = this.lazyNpcMeta.get(key);
      if (!m) {
        const sheet = `vanilla/NPC_${npcId}.png`;
        const img = this.ensureVImage(sheet); // 懒加载+去重+失败负缓存(2026-08-13 前手动 new Image 无 onerror:404 时每次调用重发请求)
        if (!img) return null;
        const frames = (vanillaNpcFrames as Record<string, number>)[key] ?? 1;
        const fh = Math.max(1, Math.floor(img.height / frames));
        const meta: VanillaNpcMeta = { sheet, frameW: img.width, frameH: fh, count: frames };
        this.lazyNpcMeta.set(key, meta);
        m = meta;
      }
    }
    // 已注册路径同样走 ensureVImage(2026-08-13 前直取):预载失败(onerror 静默)时
    // NPC 永不显示——现在 miss 会触发重载,每帧活画自愈
    const img = this.ensureVImage(m.sheet);
    if (!img) return null;
    const idx = Math.max(0, Math.min(m.count - 1, frameIdx));
    return { img, sx: 0, sy: idx * m.frameH, sw: m.frameW, sh: m.frameH };
  }

  /** 原版 tile/item 英文名（全量表，未白名单的也有） */
  vTileName(id: number): string | null { return this.vanilla.tileNames?.[String(id)] ?? null; }
  vItemName(id: number): string | null { return this.vanilla.itemNames?.[String(id)] ?? null; }

  vnpcMeta(npcId: number): VanillaNpcMeta | null {
    return this.vanilla.npcs?.[String(npcId)] ?? null;
  }

  /** 原版杂项单图（呼吸气泡等） */
  /** 杂项单图(旗帜头像/链条/Boss 部件/Glow 叠画等,全为每帧活画)——
   *  miss 走 ensureVImage 触发懒加载:未就绪返回 null,消费方下帧自愈
   *  (2026-08-13 前 vimages.get 直取——脱离 VANILLA_MISC 预载即永不出现) */
  vmisc(path: string): DrawRect | null {
    const hit = this.vimages.get(path); // 命中直接返回(node 测试环境的已注入项同样有效)
    if (hit) return { img: hit, sx: 0, sy: 0, sw: hit.width, sh: hit.height };
    if (typeof Image === 'undefined') return null; // node 测试环境:无 Image,不触发加载
    const img = this.ensureVImage(path);
    if (!img) return null;
    return { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
  }

  /** UI 贴图（vanilla-ui/ 命名空间）。name 为白名单键，如 'UI_PanelBackground'。
   *  按需懒加载(消费方每帧重查,未就绪返回 null 自兜底)。
   *  ★键必须带 .png 后缀(uiFiles 键全部带)——裸键恒 null 且连请求都不发;
   *  每键 warn 一次(F5 报告 warn 环自动留痕;全屏地图 MapBG/Map 键失配由此类
   *  bug 实锤,2026-08-13) */
  vui(name: string): DrawRect | null {
    const path = this.uiFiles[name];
    if (!path) {
      vuiKeyMiss(name);
      return null;
    }
    const img = this.ensureUiImage(path);
    if (!img) return null;
    return { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
  }

  private _uiPending = new Set<string>();
  /** UI 贴图失败负缓存(与 ensureVImage._vImageFailed 对称,2026-08-13 补):
   *  清单内但 404 的键若不加终态标记,每帧重查的消费方会每帧重发请求 */
  private _uiFailed = new Set<string>();
  private ensureUiImage(file: string): ImageBitmap | HTMLImageElement | null {
    const hit = this.uiimages.get(file);
    if (hit) return hit;
    if (this._uiPending.has(file) || this._uiFailed.has(file)) return null;
    this._uiPending.add(file);
    const im = new Image();
    im.onload = () => {
      // ImageBitmap 桥:入表即自持已解码像素(懒解码缓存驱逐免疫)
      const land = (store: ImageBitmap | HTMLImageElement) => {
        this.uiimages.set(file, store);
        this._uiPending.delete(file);
        this._uiFailed.delete(file);
      };
      if (SpriteAtlas.USE_BITMAP) createImageBitmap(im).then(land, () => land(im));
      else land(im);
    };
    im.onerror = () => { this._uiPending.delete(file); this._uiFailed.add(file); };
    im.src = `sprites/${encodeURI(file)}`;
    return null;
  }

  /** 原版物品图标。构建期已 shelf-pack 进少数 Item_Atlas_k.png 图集(ix/iy/iw/ih
   *  子矩形,见 scripts/vanilla-atlas.mjs);旧单体条目(无矩形字段)回退整图语义。
   *  未加载时触发后台懒加载并返回 null(下帧生效) */
  vicon(itemId: number): DrawRect | null {
    const m = this.vanilla.items[String(itemId)];
    if (!m) return null;
    const img = this.ensureVImage(m.icon);
    if (!img) return null;
    if (m.ix !== undefined && m.iw !== undefined && m.ih !== undefined) {
      return { img, sx: m.ix, sy: m.iy ?? 0, sw: m.iw, sh: m.ih };
    }
    return { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
  }

  private _iconPending = new Set<string>();
  private _worldPreloaded = false;
  /** 懒加载完成回调(Game 注册 → ChunkCache 全量标脏:晚到的表重新烘焙
   *  已缓存的 chunk,否则 fallback 会永久烤进 canvas) */
  onVImageLoaded: ((file: string) => void) | null = null;

  /** 预载文件清单(去重+decode)。tile/wall/NPC/misc 表与图标的统一底层 */
  async preloadFiles(files: Iterable<string>, onProgress?: (p: number) => void): Promise<void> {
    const list = [...new Set(files)];
    let done = 0;
    await Promise.all(list.map((f) => new Promise<void>((resolve) => {
      if (this.vimages.has(f)) { done++; onProgress?.(done / list.length); return resolve(); }
      const img = new Image();
      img.onload = () => {
        // ImageBitmap 桥(字节+解码双就绪的原生语义,替代 img.decode());
        // 晚到钩子须在 bitmap 落地后触发(消费方读的是表内对象)
        const land = (store: ImageBitmap | HTMLImageElement) => {
          this.vimages.set(f, store);
          done++; onProgress?.(done / list.length); resolve();
          this.onVImageLoaded?.(f);
        };
        if (SpriteAtlas.USE_BITMAP) createImageBitmap(img).then(land, () => land(img));
        else land(img);
      };
      img.onerror = () => resolve();
      img.src = `sprites/${encodeURI(f)}`;
    })));
  }

  /** 按图块 sheet id + 墙 id 预载对应贴图表。
   *  Game 用出生点区域类型扫描调用——只载画面涉及的表(出生点半径内实测仅
   *  22/378 张图块表),而不是全量 ~750 张(~250MB 解码) */
  preloadTileSheetsFor(tileSheets: Iterable<number>, wallIds: Iterable<number>): Promise<void> {
    const files = new Set<string>();
    for (const id of tileSheets) {
      const m = this.vanilla.tiles[String(id)];
      if (m) files.add(m.sheet);
    }
    for (const id of wallIds) {
      const m = this.vanilla.walls[String(id)];
      if (m) files.add(m.sheet);
    }
    return this.preloadFiles(files);
  }

  /** 预载常驻杂项(树冠/液体/瀑布/电路)+ NPC 表(小动物)——出生点必有,量小全载 */
  preloadMiscAndNpcs(): Promise<void> {
    return this.preloadFiles([
      ...VANILLA_MISC,
      ...Object.values(this.vanilla.npcs ?? {}).map((n) => n.sheet),
    ]);
  }

  /** 预载世界渲染所需原版表(全量,~750 张)。仅调试/兜底用;正常路径走
   *  preloadTileSheetsFor + preloadMiscAndNpcs 的出生点子集 */
  async preloadVanillaWorld(): Promise<void> {
    if (this._worldPreloaded) return;
    this._worldPreloaded = true;
    await Promise.all([
      this.preloadTileSheetsFor(
        Object.keys(this.vanilla.tiles).map(Number),
        Object.keys(this.vanilla.walls).map(Number),
      ),
      this.preloadMiscAndNpcs(),
    ]);
  }
  /** 按需加载 vanilla 单图(去重;失败静默)。命中返回元素,否则 null。
   *  渲染路径一律用此入口(经 vimg 别名)——直接 vimages.get 会绕过懒加载与
   *  onVImageLoaded 重烘焙钩子(棕榈树干传送消失的根因)。
   *  烘焙追踪(bakeTracker,2026-08-13):ChunkCache 烘焙期间置 _baking,此处
   *  miss 发起加载时 note、onload 到达时 onLoaded——烘焙消费的任何懒取贴图
   *  晚到自动触发重烘焙,不再依赖 Game.ts 的前缀白名单(白名单保留作纵深) */
  bakeTracker: { _baking?: boolean; note(file: string): void; onLoaded(file: string): void } | null = null;
  ensureVImage(file: string): ImageBitmap | HTMLImageElement | null {
    const hit = this.vimages.get(file);
    if (hit) return hit;
    if (this._iconPending.has(file) || this._vImageFailed.has(file)) return null;
    if (this.bakeTracker?._baking) this.bakeTracker.note(file);
    this._iconPending.add(file);
    const im = new Image();
    im.onload = () => {
      // ImageBitmap 桥(2026-08-14 根治):入表即自持已解码像素;晚到/烘焙
      // 钩子在 bitmap 落地后触发(消费方读表内对象)
      const land = (store: ImageBitmap | HTMLImageElement) => {
        this.vimages.set(file, store);
        this._iconPending.delete(file);
        this._vImageFailed.delete(file);
        if (this.bakeTracker) this.bakeTracker.onLoaded(file);
        this.onVImageLoaded?.(file);  // 晚到的表 → ChunkCache 重烘焙
      };
      if (SpriteAtlas.USE_BITMAP) createImageBitmap(im).then(land, () => land(im));
      else land(im);
    };
    im.onerror = () => {
      this._iconPending.delete(file);
      this._vImageFailed.add(file);   // 永久失败:不再重复请求,供消费方分级告警
    };
    im.src = `sprites/${encodeURI(file)}`;
    return null;
  }
  /** 表是否已确认加载失败(404 等)——与"加载中瞬态"区分 */
  vImageFailed(file: string): boolean { return this._vImageFailed.has(file); }
  private _vImageFailed = new Set<string>();

  // ---- 资产健康只读视图(F5 调试报告 assetHealth 段;运行期防线,2026-08-13) ----
  failedVImages(): string[] { return [...this._vImageFailed]; }
  failedUiImages(): string[] { return [...this._uiFailed]; }
  vuiMissKeys(): string[] { return [..._vuiKeyMisses]; }
  /** 后台预取全部物品图标(保留兼容入口;预载流程请用 awaited 的 preloadIcons) */
  prefetchIcons(): void {
    void this.preloadIcons();
  }

  private _iconsPromise: Promise<void> | null = null;
  /** 预载全部物品图标素材。图集化后清单 = 去重后的 ~3 张 Item_Atlas_k.png
   *  (此前 6059 张单体逐张请求);缓存 Promise——并发 await 的调用者
   *  都会等到同一批加载完成(此前旗标早退会让第二个调用者拿到假完成) */
  preloadIcons(onProgress?: (p: number) => void): Promise<void> {
    if (this._iconsPromise) return this._iconsPromise;
    const icons = [...new Set(Object.values(this.vanilla.items).map((m) => m.icon))];
    let done = 0;
    this._iconsPromise = Promise.all(icons.map((f) => new Promise<void>((resolve) => {
      if (this.vimages.has(f)) { done++; onProgress?.(done / icons.length); return resolve(); }
      const im = new Image();
      im.onload = () => { this.vimages.set(f, im); done++; onProgress?.(done / icons.length); resolve(); };
      im.onerror = () => resolve();
      im.src = `sprites/${encodeURI(f)}`;
    }))).then(() => undefined);
    return this._iconsPromise;
  }

  /** 预载 UI 贴图按 key 前缀(如 ['Player_'] = 纸娃娃身体/发型,545 张)。
   *  exclude:子族前缀排除表(如 'UI_Bestiary')——面板专属子族只在面板打开时
   *  由 vui 懒加载自愈,不进启动/进图预载(2026-08-13 UI_ 397 键收窄用)。 */
  async preloadUiPrefix(prefixes: string[], onProgress?: (p: number) => void, exclude?: string[]): Promise<void> {
    const files = Object.entries(this.uiFiles)
      .filter(([k]) => prefixes.some((p) => k.startsWith(p))
        && !(exclude ?? []).some((e) => k.startsWith(e)))
      .map(([, f]) => f);
    return this.preloadUiFiles(files, onProgress);
  }

  /** 按 UI 文件路径预载(装备中的具体 Armor 表;decode 保证首帧无解码卡顿) */
  async preloadUiFiles(files: Iterable<string>, onProgress?: (p: number) => void): Promise<void> {
    const list = [...new Set(files)];
    let done = 0;
    await Promise.all(list.map((f) => new Promise<void>((resolve) => {
      if (this.uiimages.has(f)) { done++; onProgress?.(done / list.length); return resolve(); }
      const im = new Image();
      im.onload = () => {
        this.uiimages.set(f, im);
        im.decode().then(() => { done++; onProgress?.(done / list.length); resolve(); }, () => resolve());
      };
      im.onerror = () => resolve();
      im.src = `sprites/${encodeURI(f)}`;
    })));
  }

  has(file: string): boolean {
    return this.images.has(file);
  }

  /** 取精灵绘制矩形（Unity y 翻转已处理）。找不到返回 null。 */
  rect(file: string, sprite: string): DrawRect | null {
    const img = this.images.get(file);
    const entry = this.data.files[file];
    if (!img || !entry) return null;
    const s = entry.sprites.find((x) => x.name === sprite);
    if (!s) return null;
    return { img, sx: s.x, sy: img.height - s.y - s.h, sw: s.w, sh: s.h };
  }

  animFrames(anim: string): DrawRect[] {
    const frames = this.resources.anims[anim] ?? [];
    return frames.map((f) => this.rect(f.file, f.sprite)).filter(Boolean) as DrawRect[];
  }
}

// ---- 物品图标：一律原版 Item_N（旧 Maples UI/ 图标层已整体移除） ----
import { TILE_BY_KEY, TILE_DEFS } from '../data/tiles';

/** DrawAnimationVertical(int.MaxValue, 3) 的静态等价(IsFood 全表) */
const FOOD = { dur: Number.MAX_SAFE_INTEGER, n: 3, static: true };
const FOOD_IDS: number[] = [
  353, 357, 967, 969, 1787, 1911, 1912, 1919, 1920, 2266, 2267, 2268, 
  2425, 2426, 2427, 3195, 3532, 4009, 4010, 4011, 4012, 4013, 4014, 4015, 
  4016, 4017, 4018, 4019, 4020, 4021, 4022, 4023, 4024, 4025, 4026, 4027, 
  4028, 4029, 4030, 4031, 4032, 4033, 4034, 4035, 4036, 4037, 4282, 4283, 
  4284, 4285, 4286, 4287, 4288, 4289, 4290, 4291, 4292, 4293, 4294, 4295, 
  4296, 4297, 4403, 4411, 4614, 4615, 4616, 4617, 4618, 4619, 4620, 4621, 
  4622, 4623, 4624, 4625, 5009, 5041, 5042, 5092, 5093, 5275, 5277, 5278, 
  5537, 5645, 
];

/**
 * 物品贴图动画注册表(Main.InitializeItemAnimations :3685-3722 1:1)。
 * 食物族:ItemID.Sets.IsFood(:258,86 项)全部为竖 3 帧条,原版注册
 * DrawAnimationVertical(int.MaxValue,3) = 恒帧 0(顶部一帧);本表以 FOOD
 * 静态条目等价表达(切片帧高 = 总高/3)。
 * 物品源图是竖排多帧条(如坠星 Item_75=22×208),不切片会整条入画。
 * dur=tick/帧;pingPong=往返;static=true=恒帧 0(IsFood 的 int.MaxValue
 * 静态三帧与 NotActuallyAnimating 族)。
 */
export const ITEM_ANIMATION: Record<number, { dur: number; n: number; pingPong?: boolean; static?: boolean }> = {
  3581: { dur: 4, n: 4 },
  3580: { dur: 6, n: 4 },
  75: { dur: 5, n: 8, pingPong: true },    // 坠星 8 帧 PingPong 旋转
  575: { dur: 6, n: 4 }, 547: { dur: 6, n: 4 }, 520: { dur: 6, n: 4 },
  548: { dur: 6, n: 4 }, 521: { dur: 6, n: 4 }, 549: { dur: 6, n: 4 },
  3453: { dur: 6, n: 4 }, 3454: { dur: 6, n: 4 }, 3455: { dur: 6, n: 4 },
  4068: { dur: 6, n: 4, static: true },   // NotActuallyAnimating(:3701-3709)
  4069: { dur: 6, n: 4, static: true },
  4070: { dur: 6, n: 4, static: true },
  5644: { dur: 7, n: 9 },                 // ScryingOrb(专属着色器,垂直循环近似)
  // ---- 食物族(IsFood :258):竖 3 帧条,原版 int.MaxValue 恒帧 0 ----
  ...Object.fromEntries(FOOD_IDS.map((v) => [v, FOOD])),
};


/** 物品动画当前帧(DrawAnimationVertical.GetFrame 语义;tick=游戏 tick 或等价毫秒换算) */
export function itemAnimFrame(vid: number, tick: number): number {
  const a = ITEM_ANIMATION[vid];
  if (!a || a.static) return 0;
  const span = a.pingPong ? a.n * 2 - 2 : a.n;
  const idx = Math.floor(tick / a.dur) % span;
  return a.pingPong && idx >= a.n ? span - idx : idx;
}

/** 把整条 DrawRect 按帧切片(vid 无动画原样返回) */
export function sliceItemAnimFrame(vid: number, ar: DrawRect, tick: number): DrawRect {
  const a = ITEM_ANIMATION[vid];
  if (!a || a.n <= 1) return ar;
  const fh = ar.sh / a.n;
  const f = Math.min(a.n - 1, itemAnimFrame(vid, tick));
  return { img: ar.img, sx: ar.sx, sy: ar.sy + Math.round(fh * f), sw: ar.sw, sh: Math.round(fh) };
}

export function atlasIconForKey(atlas: SpriteAtlas, key: string): DrawRect | null {
  const vid = VANILLA_ITEM_ICON_MAP[key];
  if (vid !== undefined) return atlas.vicon(vid);
  // 阶段 5:vi_<id>_* 全量物品回退原版图标
  if (key.startsWith('vi_')) {
    const id = parseInt(key.slice(3), 10);
    if (Number.isFinite(id)) return atlas.vicon(id);
  }
  // 阶段 5:place_v_* 放置物品回退用图块贴图首帧作图标
  if (key.startsWith('place_v_')) {
    const tk = key.slice('place_'.length);
    const tid = TILE_BY_KEY[tk];
    if (tid !== undefined) {
      const td = TILE_DEFS[tid];
      // vframeAt 而非 vframe:窄条表(如压板 135 的 16×200 竖条)cols=0 会让 vframe 判越界
      if (td?.vanilla) return atlas.vframeAt(td.vanilla.sheet, 0, 0) ?? atlas.vframe(td.vanilla.sheet, 0, 0);
    }
  }
  return null;
}

// 我们的 item key → 原版物品图标 id（TEdit items.json 核实；Maples 缺图标的用这层）
export const VANILLA_ITEM_ICON_MAP: Record<string, number> = {
  cs: 1547,
  // 电路工具(id-maps items.json 核实:530 电线/509,850,851,3612 四色扳手/510 钢丝钳/
  // 849 致动器/3620 致动魔杖/3625 五彩扳手/3611 宏伟蓝图)
  // 盔甲三件套（原版 id：胫甲 76-79 / 胸甲 80-83 / 头盔 89-92）
  // ---- 原版批次新材料 / 方块 / 家具 ----
  // wld 导入补全物品图标
  vi_2350_recall_potion: 2350,
  vi_188_healing_potion: 188,
  vi_282_glowstick: 282,
  vi_41_flaming_arrow: 41,
  vi_167_dynamite: 167,
  vi_279_throwing_knife: 279,
  vi_51_jester_s_arrow: 51,
  vi_19_gold_bar: 19,
  vi_302_water_walking_potion: 302,
  vi_305_gravitation_potion: 305,
  vi_43_suspicious_looking_eye: 43,
  vi_296_spelunker_potion: 296,
  vi_299_night_owl_potion: 299,
  vi_965_rope: 965,
  vi_303_archery_potion: 303,
  vi_304_hunter_potion: 304,
  vi_50_magic_mirror: 50,
  vi_42_shuriken: 42,
  vi_295_featherfall_potion: 295,
  vi_53_cloud_in_a_bottle: 53,
  vi_2329_dangersense_potion: 2329,
  vi_40_wooden_arrow: 40,
  vi_975_shoe_spikes: 975,
  vi_54_hermes_boots: 54,
  vi_301_thorns_potion: 301,
  vi_49_band_of_regeneration: 49,
  vi_2326_titan_potion: 2326,
  vi_297_invisibility_potion: 297,
  vi_166_bomb: 166,
  vi_5011_mace: 5011,
  vi_4425_shark_bait: 4425,
  vi_2351_teleportation_potion: 2351,
  vi_4460_sandcastle_bucket: 4460,
  vi_168_grenade: 168,
  vi_227_restoration_potion: 227,
  vi_930_flare_gun: 930,
  vi_931_flare: 931,
  vi_997_extractinator: 997,
  vi_52_angel_statue: 52,
  vi_265_hellfire_arrow: 265,
  vi_298_shine_potion: 298,
  vi_5007_dead_man_s_sweater: 5007,
  vi_117_meteorite_bar: 117,
  vi_186_breathing_reed: 186,
  vi_329_shadow_key: 329,
  vi_974_ice_torch: 974,
  vi_2322_mining_potion: 2322,
  vi_4915_tungsten_bullet: 4915,
  vi_946_umbrella: 946,
  vi_939_web_slinger: 939,
  vi_4870_potion_of_return: 4870,
  vi_288_obsidian_skin_potion: 288,
  vi_31_bottle: 31,
  vi_211_feral_claws: 211,
  vi_4404_inner_tube: 4404,
  vi_187_flipper: 187,
  vi_2198_ice_machine: 2198,
  vi_274_dark_lance: 274,
  vi_285_aglet: 285,
  vi_213_staff_of_regrowth: 213,
  vi_964_boomstick: 964,
  vi_1293_lihzahrd_power_cell: 1293,
  vi_2195_lihzahrd_furnace: 2195,
  vi_2766_solar_tablet_fragment: 2766,
  vi_300_battle_potion: 300,
  vi_2348_inferno_potion: 2348,
  vi_218_flamelash: 218,
  vi_3019_hellwing_bow: 3019,
  vi_112_flower_of_fire: 112,
  vi_220_sunfury: 220,
  vi_4345_can_of_worms: 4345,
  vi_953_climbing_claws: 953,
  vi_3069_wand_of_sparking: 3069,
  vi_212_anklet_of_the_wind: 212,
  vi_2204_honey_dispenser: 2204,
  vi_277_trident: 277,
  vi_863_water_walking_boots: 863,
  vi_751_cloud: 751,
  vi_155_muramasa: 155,
  vi_289_regeneration_potion: 289,
  vi_906_lava_charm: 906,
  vi_4055_dunerider_boots: 4055,
  vi_724_ice_blade: 724,
  vi_670_ice_boomerang: 670,
  vi_4061_storm_spear: 4061,
  vi_987_blizzard_in_a_bottle: 987,
  vi_4551_slice_of_hell_cake: 4551,
  vi_5010_treasure_magnet: 5010,
  vi_2323_heartreach_potion: 2323,
  vi_2345_lifeforce_potion: 2345,
  vi_290_swiftness_potion: 290,
  vi_291_gills_potion: 291,
  vi_280_spear: 280,
  vi_2325_builder_potion: 2325,
  vi_284_wooden_boomerang: 284,
  vi_2192_bone_welder: 2192,
  vi_5234_remnants_of_devotion: 5234,
  vi_156_cobalt_shield: 156,
  vi_157_aqua_scepter: 157,
  vi_163_blue_moon: 163,
  vi_113_magic_missile: 113,
  vi_3317_valor: 3317,
  vi_327_golden_key: 327,
  vi_164_handgun: 164,
  vi_294_magic_power_potion: 294,
  vi_4263_magic_conch: 4263,
  vi_4062_thunder_zapper: 4062,
  vi_1579_flurry_boots: 1579,
  vi_4056_ancient_chisel: 4056,
  vi_4346_encumbering_stone: 4346,
  vi_1319_snowball_cannon: 1319,
  vi_3199_ice_mirror: 3199,
  vi_950_ice_skates: 950,
  vi_4443_demonic_hellcart: 4443,
  vi_4737_ornate_shadow_key: 4737,
  vi_4276_bast_statue: 4276,
  vi_4262_snake_charmer_s_flute: 4262,
  vi_3093_herb_bag: 3093,
  vi_292_ironskin_potion: 292,
  vi_3084_radar: 3084,
  vi_4341_step_stool: 4341,
  vi_4978_fledgling_wings: 4978,
  vi_2197_sky_mill: 2197,
  vi_158_lucky_horseshoe: 158,
  vi_5254_blessing_from_the_heavens: 5254,
  vi_1156_piranha_gun: 1156,
  vi_1571_scourge_of_the_corruptor: 1571,
  vi_1260_rainbow_gun: 1260,
  vi_1572_staff_of_the_frost_hydra: 1572,
  vi_4607_desert_tiger_staff: 4607,
  vi_933_leaf_wand: 933,
  vi_832_living_wood_wand: 832,
  vi_4066_desert_minecart: 4066,
  vi_4450_shroom_minecart: 4450,
  vi_4423_scarab_bomb: 4423,
  vi_159_shiny_red_balloon: 159,
  vi_5258_see_the_world_for_what_it_is: 5258,
  vi_65_starfury: 65,
  vi_5388_eye_of_the_sun: 5388,
  vi_2219_celestial_magnet: 2219,
  vi_5255_love_is_in_the_trash_slot: 5255,
  vi_4426_bee_minecart: 4426,
  vi_3017_flower_boots: 3017,
  vi_3360_living_mahogany_wand: 3360,
  vi_3361_rich_mahogany_leaf_wand: 3361,
  vi_1309_slime_staff: 1309,
  vi_1845_necromantic_scroll: 1845,
  vi_1864_papyrus_scarab: 1864,
  vi_1158_pygmy_necklace: 1158,
  vi_3034_coin_ring: 3034,
  vi_308_moonglow_seeds: 308,
  vi_312_fireblossom_seeds: 312,
  vi_310_deathweed_seeds: 310,
  vi_307_daybloom_seeds: 307,
  vi_309_blinkroot_seeds: 309,
  vi_2357_shiverthorn_seeds: 2357,
  vi_311_waterleaf_seeds: 311,
  vi_1828_pumpkin_seed: 1828,
  vi_126_bottled_water: 126,
  vi_1134_bottled_honey: 1134,
  vi_3068_guide_to_plant_fiber_cordage: 3068,
  vi_4779_mushroom_hat: 4779,
  vi_4780_mushroom_vest: 4780,
  vi_4781_mushroom_pants: 4781,
vi_678_red_potion: 678,
  vi_281_blowpipe: 281,
  vi_293_mana_regeneration_potion: 293,
  vi_2767_solar_tablet: 2767,
  vi_3_stone_block: 3,
  vi_3213_money_trough: 3213,
  vi_94_wood_platform: 94,
  vi_2757_vortex_helmet: 2757,
  vi_4989_soaring_insignia: 4989,
  vi_75_fallen_star: 75,
  vi_3383_stardust_leggings: 3383,
  vi_4914_kaleidoscope: 4914,
  vi_26_stone_wall: 26,
  vi_1991_bug_net: 1991,
  vi_4828_superheated_blood: 4828,
  vi_3509_copper_pickaxe: 3509,
  vi_3507_copper_shortsword: 3507,
  vi_4755_grox_the_great_s_horned_cowl: 4755,
  vi_4756_grox_the_great_s_chestplate: 4756,
  vi_4757_grox_the_great_s_greaves: 4757,
  vi_214_hellstone_brick: 214,
  vi_5000_terraspark_boots: 5000,
  vi_5339_arcane_crystal: 5339,
  vi_5391_uncumbering_stone: 5391,
  vi_2585_slime_hook: 2585,
  vi_313_daybloom: 313,
  vi_267_guide_voodoo_doll: 267,
  vi_2649_steampunk_candle: 2649,
  vi_286_sticky_glowstick: 286,
  vi_3002_spelunker_glowstick: 3002,
  vi_4819_demon_conch: 4819,
  vi_1802_raven_staff: 1802,
  vi_3382_stardust_plate: 3382,
  vi_3270_item_frame: 3270,
  vi_3771_ancient_horn: 3771,
  vi_93_wood_wall: 93,
  vi_4281_finch_staff: 4281,
  vi_5407_star_royale_brick: 5407,
  vi_5401_lunar_rust_brick: 5401,
  vi_4716_mollusk_whistle: 4716,
  vi_3540_phantasm: 3540,
  vi_2176_shroomite_digging_claw: 2176,
  vi_2349_wrath_potion: 2349,
  vi_4679_morning_star: 4679,
  vi_1169_bone_key: 1169,
  vi_3863_betsy_mask: 3863,
  vi_3124_cell_phone: 3124,
  vi_3506_copper_axe: 3506,
  vi_4680_dark_harvest: 4680,
  vi_543_brown_pressure_plate: 543,
  vi_172_ash_block: 172,
  vi_171_sign: 171,
  vi_1723_living_wood_wall: 1723,
  vi_4754_grox_the_great_s_wings: 4754,
  vi_3353_mechanical_cart: 3353,
  vi_2287_winter_cape: 2287,
  vi_1179_chlorophyte_bullet: 1179,
  vi_4766_world_globe: 4766,
  vi_4954_celestial_starboard: 4954,
  vi_4730_ghostar_s_infinity_eight: 4730,
  vi_4758_blade_staff: 4758,
  vi_4765_tree_globe: 4765,
  vi_5342_ambrosia: 5342,
  vi_5328_chest_lock: 5328,
  vi_5343_peddler_s_satchel: 5343,
  vi_5285_moon_globe: 5285,
  vi_5289_minecart_upgrade_kit: 5289,
  vi_5336_advanced_combat_techniques_volume_two: 5336,
  vi_5451_kwad_racer_drone: 5451,
  vi_5359_shellphone_spawn: 5359,
  vi_3032_super_absorbant_sponge: 3032,
  vi_3031_bottomless_water_bucket: 3031,
  vi_509_red_wrench: 509,
  vi_4741_butcher_s_bloodstained_apron: 4741,
  vi_3065_star_wrath: 3065,
  vi_3063_meowmere: 3063,
  vi_3372_lunatic_cultist_mask: 3372,
  vi_1504_spectre_robe: 1504,
  vi_2769_cosmic_car_key: 2769,
  vi_216_shackle: 216,
  vi_4415_stone_door: 4415,
  vi_118_hook: 118,
  vi_1681_skeleton_banner: 1681,
  vi_283_seed: 283,
  vi_1173_grave_marker: 1173,
  vi_4379_wyvern_kite: 4379,
  vi_4378_xenon_moss: 4378,
  vi_4377_krypton_moss: 4377,
  vi_4376_rat_cage: 4376,
  vi_4375_rat: 4375,
  vi_4484_1_2_second_timer: 4484,
  vi_4824_wet_bomb: 4824,
  vi_4485_1_4_second_timer: 4485,
  vi_5378_cursed_flare: 5378,
  vi_5354_reflective_shades: 5354,
  vi_5387_raynbro_s_pants: 5387,
  vi_5386_raynbro_s_hoodie: 5386,
  vi_5390_raynbro_s_hood: 5390,
  vi_5338_aegis_fruit: 5338,
  vi_5404_cosmic_ember_brick: 5404,
  vi_5405_cryocore_brick: 5405,
  vi_5403_astra_brick: 5403,
  vi_346_safe: 346,
  vi_4829_cat_license: 4829,
  vi_3335_demon_heart: 3335,
  vi_4750_foodbarbarian_s_tattered_dragon_wings: 4750,
  vi_3042_phase_dye: 3042,
  vi_3024_skiphs_blood: 3024,
  vi_3054_shadowflame_knife: 3054,
  vi_5275_joja_cola: 5275,
  vi_5278_pomegranate: 5278,
  vi_5277_spicy_pepper: 5277,
  vi_5437_shellphone: 5437,
  vi_1507_spectre_hamaxe: 1507,
  vi_2250_steampunk_chest: 2250,
  vi_392_glass_wall: 392,
  vi_2699_weapon_rack: 2699,
  vi_3552_blue_flame_and_silver_dye: 3552,
  vi_5005_terraprisma: 5005,
  vi_4604_exotic_chew_toy: 4604,
  vi_4611_world_feeder_kite: 4611,
  vi_4649_blue_jellyfish_kite: 4649,
  vi_4796_dark_mage_s_tome: 4796,
  vi_4553_plasma_lamp: 4553,
  vi_4365_celestial_wand: 4365,
  vi_331_jungle_spores: 331,
  vi_2430_slimy_saddle: 2430,
  vi_4956_zenith: 4956,
  vi_2798_laser_drill: 2798,
  vi_2814_martian_chest: 2814,
  vi_210_vine: 210,
  vi_4371_yellow_kite: 4371,
  vi_4291_lemon: 4291,
  vi_2493_king_slime_mask: 2493,
  vi_1919_sugar_cookie: 1919,
  vi_1912_eggnog: 1912,
  vi_4023_grapes: 4023,
  vi_4792_the_black_spot: 4792,
  vi_529_red_pressure_plate: 529,
  vi_3066_smooth_marble_block: 3066,
  vi_183_glowing_mushroom: 183,
  vi_1103_slush_block: 1103,
  vi_2119_stone_slab: 2119,
  vi_593_snow_block: 593,
  vi_3081_marble_block: 3081,
  vi_1111_blue_berries: 1111,
  vi_1115_red_husk: 1115,
  vi_217_molten_hamaxe: 217,
  vi_122_molten_pickaxe: 122,
  vi_1827_bladed_glove: 1827,
  vi_2263_white_dynasty_wall: 2263,
  vi_330_obsidian_brick_wall: 330,
  vi_130_gray_brick_wall: 130,
  vi_2433_stone_slab_wall: 2433,
  vi_452_hornet_statue: 452,
  vi_453_bomb_statue: 453,
  vi_360_armor_statue: 360,
  vi_3711_wraith_statue: 3711,
  vi_438_star_statue: 438,
  vi_446_skeleton_statue: 446,
  vi_458_cross_statue: 458,
  vi_3655_scorpion_statue: 3655,
  vi_328_shadow_chest: 328,
  vi_2196_living_loom: 2196,
  vi_916_shadewood_work_bench: 916,
  vi_35_iron_anvil: 35,
  vi_36_work_bench: 36,
  vi_3240_tall_gate: 3240,
  vi_337_red_banner: 337,
  vi_3381_stardust_helmet: 3381,
  vi_1765_vampire_pants: 1765,
  vi_2859_lunar_cultist_robe: 2859,
  vi_2857_lunar_cultist_hood: 2857,
  vi_2998_summoner_emblem: 2998,
  vi_1175_headstone: 1175,
  vi_25_wooden_door: 25,
  vi_46_light_s_bane: 46,
  vi_352_keg: 352,
  vi_2340_minecart_track: 2340,
  vi_498_mannequin: 498,
  vi_4721_mushroom_beam: 4721,
  vi_819_living_wood_door: 819,
  vi_1458_obsidian_door: 1458,
  vi_3763_0x33_s_aviators: 3763,
  vi_176_mud_block: 176,
  vi_1569_vampire_knives: 1569,
  vi_857_sandstorm_in_a_bottle: 857,
  vi_2292_fiberglass_fishing_pole: 2292,
  vi_5238_constellation: 5238,
  vi_753_seaweed: 753,
  vi_5120_deer_thing: 5120,
  vi_5508_grim_old_barb: 5508,
  vi_5465_ram_rune: 5465,
  vi_5500_goat_s_tuft: 5500,
  vi_5499_froggy_neckband: 5499,
  vi_5507_balloony_beads: 5507,
  vi_5485_chicken_charm: 5485,
  vi_5502_cat_chime: 5502,
  vi_5504_turkey_wattle_necklace: 5504,
  vi_5506_crow_s_beak: 5506,
  vi_5503_dog_collar: 5503,
  vi_5534_fairy_choker: 5534,
  vi_5484_cow_bell: 5484,
  vi_5501_old_companion_locket: 5501,
  vi_5509_vampire_pendant: 5509,
  vi_5505_mean_goblin_s_spikes: 5505,
  vi_5525_cursed_piper_flute: 5525,
  // ---- 旧 UI 移除迁移补全（2026-08-09，全部 id 经 TEdit items.json 核实；
  //      木镐/木斧原版不存在，用铜镐 3509/铜斧 3506 代位） ----
};
