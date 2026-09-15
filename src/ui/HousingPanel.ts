// 住房面板（原版 DrawNPCHousesInUI Main.cs:41433-41607 + DrawInterface_38 鼠标携带
// 头像 :44622-44688 1:1,2026-08-15 B 方案全量对齐版）:
//   - 右侧竖列:屏幕右缘 -64-28 起、背包顶行之下,每行 56px(inventoryScale 缩放);
//     列满(>screenH-80)换列左移 48px,至多 4 列(448px 高度上限同原版);
//   - 行序 = NPCHeadID.Sets.HeadListOrder(0=查询器置顶,其后按原版 81 项序);
//     只有在场城镇 NPC 占位(头索引持有者;CannotBeDrawnInHousingUI={21,80} 不画);
//   - 槽底 Inventory_Back11(焦点 Back14)+ 头像 NpcHead 以 36px 上限缩放居中;
//   - 左键 = 选中(查询器 → SetMouseNPC_ToHousingQuery 语义;NPC → 光标携带其头像);
//     右键 = 取消(Sound12);携带态点世界 = PerformHousingCheck/TryMovingNPC(Game
//     侧 housingMode 拦截);NPC 死亡/离场 → 光标自动降级为查询器(:44649-44651)。
//   - 原版列表只在背包打开时显示(playerInventory 分支内)——本面板同款:由调用方
//     在背包开时挂载、关时销毁。
import type { Game } from '../core/Game';
import { TOWN_NPC_HEAD_INDEX } from '../data/vanillaNpcs';
import { Lang } from '../i18n/Lang';
import { UISfx } from '../vui/UISfx';

/** NPCHeadID.Sets.HeadListOrder(Terraria.ID/NPCHeadID.cs:11-22)——住房 UI 显示序 */
export const HEAD_LIST_ORDER: readonly number[] = [
  0, 1, 72, 2, 63, 4, 59, 3, 64, 6,
  74, 20, 69, 5, 73, 22, 55, 14, 60, 17,
  65, 25, 61, 26, 56, 18, 78, 15, 77, 24,
  79, 7, 57, 8, 62, 9, 75, 23, 70, 10,
  71, 12, 76, 19, 66, 13, 68, 16, 58, 11,
  67, 21, 80, 45, 54, 39, 40, 41, 42, 43,
  44, 27, 28, 29, 30, 31, 32, 33, 34, 35,
  36, 37, 38, 46, 49, 51, 48, 53, 52, 47,
  50,
];

export type HousingCursor = { kind: 'query' } | { kind: 'assign'; npcKey: string; headIndex: number } | null;

interface HeadRow { headIndex: number; npcKey: string; vanillaId: number; name: string }

export class HousingPanel {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private rows: HeadRow[] = [];
  private cursor: HousingCursor = null;
  private hoverIdx = -1;
  private raf = 0;
  private disposed = false;
  private readonly closeBtn: HTMLButtonElement;
  private readonly scale: number;   // inventoryScale 近似(1.0;UIScale 影响下的 DOM canvas 走 1:1 像素)
  /** 列布局（layout() 每刷回写）：列数、画布宽——★右缘锚定+列向左生长
   *  （2026-08-28 用户报"侧栏溢出到外面了"：曾 left=屏宽-92 定宽 448 锚定,
   *  窄屏/多列时整块探出屏幕右缘） */
  private colsN = 1;
  private colsW = 56;

  constructor(
    private game: Game,
    private onCursor: (m: HousingCursor) => void,
    private onClosed: () => void,
  ) {
    this.scale = 1;
    const h = Math.min(448, window.innerHeight - 160);
    this.canvas = document.createElement('canvas');
    this.canvas.width = 56;
    this.canvas.height = h;
    // ★右缘锚定（right:36 = 原版首列槽右缘 W-36）——窄屏不探出屏幕外；
    //  列数增长时宽度向左扩展（layout()），✕ 钮随动挂左外侧
    this.canvas.style.cssText =
      'position:fixed;right:36px;top:160px;'
      + 'z-index:60;image-rendering:pixelated;pointer-events:auto;cursor:pointer;';
    this.canvas.className = 'sw-panel';   // Input mousedown UI 过滤器
    document.body.appendChild(this.canvas);
    // ✕ 关闭钮（2026-08-27 用户要求：探查/分配后面板不自动收——关闭收口到此钮；
    //  挂条左外侧,不遮 0 号查询器槽；位置随列宽在 layout() 回写)
    this.closeBtn = document.createElement('button');
    this.closeBtn.className = 'sw-btn sw-housing-x';
    this.closeBtn.textContent = '✕';
    this.closeBtn.title = '✕';
    this.closeBtn.style.cssText =
      'position:fixed; right:64px; top:160px; width:22px; height:22px;'
      + 'margin:0; padding:0; font-size:11px; line-height:1; z-index:61; cursor:pointer;';
    this.closeBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.destroy();
    });
    document.body.appendChild(this.closeBtn);
    this.ctx = this.canvas.getContext('2d')!;
    this.bind();
    this.refresh();
    this.loop();
  }

  /** 头像持有表(Main.cs:41452-41461):按 HeadListOrder 首个持有该头索引的在世 NPC。
   *  ★2026-09-07 刀 3:抽取共享——vanilla 布局住房页(EquipPage=1,UI.ts
   *  vinvRefreshHousing)与本面板同源消费 */
  refresh(): void {
    this.rows = housingHeadRows(this.game);
    // 光标携带的 NPC 若已离场 → 降级查询器(:44649-44651)
    if (this.cursor?.kind === 'assign') {
      const held = this.cursor.npcKey;
      if (!this.rows.some((r) => r.npcKey === held)) this.setCursor({ kind: 'query' });
    }
    this.layout();
    this.draw();
  }

  /** 画布几何（refresh 每刷回写）：列数=⌈(行数+1)/perCol⌉ 钳 4,宽=56+3×48 随列数
   *  收展；★右缘锚定不动（style.right 恒 36px）——尺寸变化只向左生长 ✕ 钮随动 */
  private layout(): void {
    const h = Math.min(448, window.innerHeight - 160);
    const per = Math.max(1, Math.floor(h / (56 * this.scale)));
    const total = this.rows.length + 1;
    this.colsN = Math.min(4, Math.max(1, Math.ceil(total / per)));
    this.colsW = this.colsN > 1 ? 3 * 48 + 56 : 56;
    if (this.canvas.width !== this.colsW) this.canvas.width = this.colsW;   // 变更即清位图,draw() 全量重画
    if (this.canvas.height !== h) { this.canvas.height = h; }
    this.canvas.style.width = `${this.colsW}px`;
    this.canvas.style.height = `${h}px`;
    this.closeBtn.style.right = `${36 + this.colsW + 6}px`;
  }

  /** 第 c 列的槽左缘画布 x（列向左生长：0 号列贴画布右缘,原版换列左移语义） */
  private colXFor(col: number): number {
    return this.colsW - 56 - col * 48;
  }

  private bind(): void {
    this.canvas.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const idx = this.hitTest(e.offsetX, e.offsetY);
      if (e.button === 2) {
        // 右键 = 仅落光标(Sound12,SetMouseNPC(-1,-1) :44666-44669)——★面板保持
        // （2026-08-27 用户要求：查询/指定后不切回背包,收口 = ✕ 钮/E）
        UISfx.sfx.play('menuTick', 1);
        this.setCursor(null);
        return;
      }
      if (e.button !== 0 || idx < 0) return;
      UISfx.sfx.play('menuTick', 1);   // SoundID 12(:41506)
      if (idx === 0) this.setCursor({ kind: 'query' });                       // 0 号槽=查询器
      else {
        const r = this.rows[idx - 1];
        this.setCursor({ kind: 'assign', npcKey: r.npcKey, headIndex: r.headIndex });
      }
    });
    this.canvas.addEventListener('mousemove', (e) => {
      this.hoverIdx = this.hitTest(e.offsetX, e.offsetY);
      // tooltip(:41498):NPC 槽=FullName,查询槽=inter[8]"房屋询问"
      const title = this.hoverIdx === 0 ? Lang.inter(8)
        : this.hoverIdx > 0 && this.rows[this.hoverIdx - 1] ? this.rows[this.hoverIdx - 1].name : null;
      this.canvas.title = title ?? '';
    });
    this.canvas.addEventListener('mouseleave', () => { this.hoverIdx = -1; this.canvas.title = ''; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private hitTest(mx: number, my: number): number {
    // 行高 56×scale;列向左生长（镜像 drawSlot 几何）——从右往左逐列查命中,
    // 槽宽 56 与列距 48 有 8px 原生叠带,右列后画=重叠带归右列
    const w = this.canvas.width;
    const dFromRight = w - mx;
    if (dFromRight < 0 || my < 0 || my >= this.canvas.height) return -1;
    const rowH = 56 * this.scale;
    const per = this.perCol();
    for (let c2 = 0; c2 < this.colsN; c2++) {
      const colX = this.colsW - 56 - c2 * 48;
      if (mx >= colX && mx <= colX + 56) {
        const row = Math.floor(my / rowH);
        if (row >= per) return -1;
        return row + c2 * per;
      }
    }
    return -1;
  }

  private perCol(): number {
    return Math.floor(this.canvas.height / (56 * this.scale));
  }

  private setCursor(m: HousingCursor): void {
    this.cursor = m;
    this.onCursor(m ? (m.kind === 'query'
      ? { kind: 'query' }
      : { kind: 'assign', npcKey: m.npcKey }) as never : null);
    this.draw();
  }

  /** Game 侧单发/取消 → 面板同步(null=自毁,BJ32 关条通道;★keepPanel=true=仅摘
   *  选中——分配成功 TryMovingNPC Main.cs:45931 / 右键取消 :45943 原版只清携带,
   *  住房列表随背包保持) */
  cursorChanged(m: HousingCursor, keepPanel = false): void {
    if (!m) {
      if (keepPanel) { this.cursor = null; this.draw(); return; }
      this.destroy();
      return;
    }
    this.cursor = m;
    this.draw();
  }

  private loop(): void {
    if (this.disposed) return;
    this.draw();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  private draw(): void {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.imageSmoothingEnabled = false;
    const slot = img('sprites/vanilla/Inventory_Back11.png');
    const slotFocus = img('sprites/vanilla/Inventory_Back14.png');
    const queryHead = img('sprites/vanilla/NPC_Head_0.png');   // 0 号=查询器(Santa 头? 原版 NpcHead[0])
    const rowH = 56 * this.scale;
    const per = this.perCol();
    const total = this.rows.length + 1;
    const drawSlot = (i: number, headImg: HTMLImageElement | null, gray: boolean) => {
      const col = Math.floor(i / per);
      const row = i % per;
      // ★列向左生长（原版换列左移）：0 号列贴画布右缘——曾向右生长=溢出屏幕外
      const x = this.colXFor(col);
      const y = row * rowH;
      if (y + rowH > this.canvas.height) return;
      const back = (i === this.hoverIdx ? slotFocus : slot) ?? null;
      if (back) c.drawImage(back, x, y, 56 * this.scale, 56 * this.scale);
      if (headImg) {
        const cap = 36 / Math.max(headImg.width, headImg.height);
        const s = Math.min(cap, 1) * this.scale;
        const w = headImg.width * s, h = headImg.height * s;
        if (gray) c.globalAlpha = 0.4;
        c.drawImage(headImg, x + (28 - w / 2), y + (28 - h / 2), w, h);
        c.globalAlpha = 1;
      }
    };
    // 0 号 = 查询器;其后的在场 NPC 按 HeadListOrder
    drawSlot(0, queryHead, this.cursor?.kind === 'query');
    for (let k = 0; k < this.rows.length; k++) {
      const r = this.rows[k];
      drawSlot(k + 1, img(`sprites/vanilla/NPC_Head_${r.headIndex}.png`),
        this.cursor?.kind === 'assign' && (this.cursor as { npcKey: string }).npcKey === r.npcKey);
    }
    // 超出画布(>4 列)按原版截断(不再显示)
    if (total > per * 4) {
      c.fillStyle = 'rgba(255,220,80,0.9)';
      c.font = '12px monospace';
      c.fillText(Lang.text('Mods.SandboxWorld.Housing.More', total - per * 4), 4, 12);
    }
  }

  destroy(): void {
    // ★幂等门 + canvas 先摘（2026-08-27）：onClosed → UI.closeHousingPanel 会在
    // canvas 尚在 DOM 时重入 querySelector→destroy——曾无门 = 右键关面板即爆栈
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.onCursor(null);
    this.canvas.remove();
    this.closeBtn.remove();
    this.onClosed();
  }
}

const imgCache = new Map<string, HTMLImageElement | null>();
const imgFailAt = new Map<string, number>();
const IMG_FAIL_TTL = 10_000;   // 失败负缓存 TTL(2026-08-25 同类扫描):过期重试自愈,期内有界不刷屏
function img(src: string): HTMLImageElement | null {
  if (imgCache.has(src)) return imgCache.get(src) ?? null;
  const fail = imgFailAt.get(src);
  if (fail !== undefined) {
    if (Date.now() - fail < IMG_FAIL_TTL) return null;
    imgFailAt.delete(src);
  }
  if (typeof Image === 'undefined') return null;
  const i = new Image();
  i.onerror = () => { imgCache.delete(src); imgFailAt.set(src, Date.now()); };
  i.src = src;
  imgCache.set(src, i);
  return i;
}

/** 在场 NPC 头像行(Main.cs:41452-41461):按 HeadListOrder 首个持有该头索引的
 *  在世 NPC;排除 21/80(CannotBeDrawnInHousingUI);查询器 0 号位不入行。
 *  ★2026-09-07 刀 3:抽取共享——vanilla 布局住房页(EquipPage=1,UI.ts
 *  vinvRefreshHousing)与本面板 refresh 同源消费 */
export function housingHeadRows(game: Game): HeadRow[] {
  const heads = new Map<number, HeadRow>();
  for (const n of game.entities.npcs) {
    const t = n as unknown as { dead?: boolean; npcKey?: string; vanillaId?: number };
    if (t.dead || t.npcKey === undefined) continue;
    const vid = t.vanillaId;
    if (vid == null) continue;
    const head = TOWN_NPC_HEAD_INDEX[vid];
    if (head === undefined || head === 21 || head === 80) continue;   // CannotBeDrawnInHousingUI
    if (!heads.has(head)) {
      heads.set(head, { headIndex: head, npcKey: t.npcKey, vanillaId: vid, name: Lang.npcName(vid) ?? '' });
    }
  }
  return HEAD_LIST_ORDER.filter((h) => h !== 0 && heads.has(h)).map((h) => heads.get(h)!);
}
