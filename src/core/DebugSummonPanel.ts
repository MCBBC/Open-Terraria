// F6 召唤面板（调试工具，原版无）：无条件召唤任意 NPC——怪物/Boss/小动物/城镇
// NPC，便于功能验收。DOM 浮层（不进 vui 管线——纯开发工具，关掉即卸）。
// 列表源 = vanilla-npcs.json 全量（SetDefaults 提取）；生成动作回调进 Game
// （Enemy.fromVanilla 全覆盖 + 底锚约定 + Boss 槽接管 + 世吞体节链，见
// Game.debugSpawnNpc）。
import { VANILLA_NPCS, TOWN_NPC_IDS, type VanillaNpc } from '../data/vanillaNpcs';
import { VANILLA_BOSS_IDS } from '../entities/Enemy';

/** 列表条目（面板渲染 + 纯过滤函数共用） */
export interface SummonEntry {
  id: number;
  name: string;      // 显示名（Lang 侧本地化在渲染时做，这里放数据英文名兜底）
  boss: boolean;
  critter: boolean;
  town: boolean;
  lifeMax: number;
}

/** 全量列表（模块级一次构建） */
export const SUMMON_ENTRIES: SummonEntry[] = (() => {
  const townIds = new Map<number, string>();
  for (const [key, v] of Object.entries(TOWN_NPC_IDS)) townIds.set(v.id, key);
  const out: SummonEntry[] = [];
  for (const v of Object.values(VANILLA_NPCS) as VanillaNpc[]) {
    out.push({
      id: v.id,
      name: v.name,
      boss: VANILLA_BOSS_IDS.has(v.id),
      critter: !!v.critter,
      town: townIds.has(v.id),
      lifeMax: v.lifeMax,
    });
  }
  return out.sort((a, b) => a.id - b.id);
})();

/** 纯过滤（单测对象）：数字/英文名/本地化名（nameOf 可空——面板传 Lang.npcName，
 *  单测省略）三路匹配；命中 id 优先排前。★Boss 行恒置顶（2026-08-19 修复：
 *  693 条按 id 排序默认截 240——石巨人(排位 245)/世纪之花(262)/猪鲨/拜月教主/
 *  光女/史莱姆皇后/鹿角怪全在截断线外，"面板里看不到 boss"根因；曾只匹配英文
 *  数据名——中文搜索零命中第二根因） */
export function filterSummonEntries(
  q: string, limit = 240, nameOf?: (id: number) => string | null,
): SummonEntry[] {
  const s = q.trim().toLowerCase();
  const bossesFirst = (list: SummonEntry[]): SummonEntry[] =>
    [...list.filter((e) => e.boss), ...list.filter((e) => !e.boss)];
  if (!s) return bossesFirst(SUMMON_ENTRIES).slice(0, limit);
  const hit: SummonEntry[] = [];
  for (const e of SUMMON_ENTRIES) {
    const local = nameOf ? (nameOf(e.id) ?? '') : '';
    if (String(e.id) === s || e.name.toLowerCase().includes(s)
      || local.toLowerCase().includes(s)) hit.push(e);
    if (hit.length >= limit * 2) break;
  }
  // 完全等于 id 的排最前；同级 Boss 置顶
  hit.sort((a, b) => ((String(a.id) === s ? -1 : 0) - (String(b.id) === s ? -1 : 0))
    || ((a.boss ? -1 : 0) - (b.boss ? -1 : 0)));
  return hit.slice(0, limit);
}

/** 显示名重名集（面板消歧用）：本地化名在【全量表】上被 >1 个 id 共享的集合。
 *  原版本地化真实重名（zh：22 种僵尸变体全叫"僵尸"、10 稻草人/9 蝾螈…共 80 组）
 *  ——面板每 id 一行,重名行视觉上即"重复项";命中行渲染时追加英文变体名消歧。 */
export function summonCollidingNames(nameOf: (id: number) => string): Set<string> {
  const counts = new Map<string, number>();
  for (const e of SUMMON_ENTRIES) {
    const n = nameOf(e.id) || e.name;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const out = new Set<string>();
  for (const [n, c] of counts) if (c > 1) out.add(n);
  return out;
}

export interface DebugSummonPanelHooks {
  /** 生成动作（Game.debugSpawnNpc）；返回错误文案或 null=成功 */
  spawn: (id: number, count: number, atMouse: boolean) => string | null;
  /** 清除场上敌怪（不含城镇 NPC/小动物），返回清除数 */
  clearEnemies: () => number;
  /** 显示名本地化（Lang.npcName） */
  nameOf: (id: number) => string;
  /** 事件触发面板（F6 扩展）：按 key 触发特定世界事件。
   *  返回错误文案（红字）或 null=成功——实现须走自然事件入口
   *  （与自然 roll 命中同路径/同公告/同清旗点），不得绕过昼夜消费时序 */
  events?: Array<{ key: string; label: string }>;
  triggerEvent?: (key: string) => string | null;
  /** 面板关闭回调（×按钮/任意 close 调用点）：Game 侧解冻 input.uiBlocking——
   *  ★close() 拆 DOM 不经 Game.toggleSummonPanel，缺此钩子则 uiBlocking 恒 true
   *  = 全部按键冻结（2026-08-21 修复；此前只有 F6 键 toggle 路径与 main.ts 的
   *  ESC 路径显式解冻，点 × 关闭后键全冻、F6 再按又把面板开回来） */
  onClose?: () => void;
}

const STYLE = `
  position: fixed; top: 12px; right: 12px; width: 350px; max-height: 78vh;
  display: flex; flex-direction: column; z-index: 99999;
  background: rgba(12,12,20,.94); color: #E8E8F0; border: 1px solid #445;
  border-radius: 6px; font: 12px/1.45 ui-monospace, Menlo, Consolas, monospace;
  box-shadow: 0 4px 24px rgba(0,0,0,.6);
`;
const ROW_HOVER = 'background:#23233A;';

export class DebugSummonPanel {
  private el: HTMLDivElement | null = null;
  private listEl: HTMLDivElement | null = null;
  private count = 1;
  private atMouse = true;
  private query = '';

  constructor(private hooks: DebugSummonPanelHooks) {}

  get open(): boolean { return this.el !== null; }

  toggle(): void { this.open ? this.close() : this.show(); }

  show(): void {
    if (typeof document === 'undefined' || this.el) return;
    const el = document.createElement('div');
    // ★SW-BJ32 2026-09-08：根节点登记 DOM-UI 类——此前裸 div 不在
    // core/input/domTargets.ts 名单，isDomUiTarget(e.target) 判 false ⇒ 面板上每次
    // mousedown 都漏进 Input 窗口监听置 mouseDown/mouseHeld（=对面板位置对应的世界
    // 点挥击/挖掘，2026-08-28 商店案同族），且 Game.inpOverDomUi 同名单盲区。
    // 不挂 .sw-panel（全局 CSS 带底框/内边距会改观感），走专用类+名单登记。
    el.className = 'sw-summon-panel';
    el.style.cssText = STYLE;
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid #445;">
        <b>召唤面板</b><span style="color:#889;">F6/Esc 关闭</span>
        <span style="flex:1"></span>
        <button data-act="close" style="background:none;color:#AAB;border:1px solid #556;border-radius:4px;cursor:pointer;">×</button>
      </div>
      <div style="display:flex;gap:6px;padding:6px 8px;border-bottom:1px solid #334;">
        <input data-role="q" placeholder="搜索 id / 名字(中英)…"
          style="flex:1;background:#181826;color:#FFF;border:1px solid #445;border-radius:4px;padding:3px 6px;font:inherit;outline:none;">
        <select data-role="count" style="background:#181826;color:#FFF;border:1px solid #445;border-radius:4px;font:inherit;">
          <option>1</option><option>5</option><option>10</option>
        </select>
        <label style="display:flex;align-items:center;gap:2px;color:#BBC;cursor:pointer;">
          <input type="checkbox" data-role="atMouse" checked>鼠标处
        </label>
      </div>
      <div style="display:flex;gap:6px;padding:6px 8px;border-bottom:1px solid #334;">
        <button data-act="clear" style="flex:1;background:#301818;color:#F99;border:1px solid #644;border-radius:4px;cursor:pointer;padding:2px 0;">清除敌怪</button>
        <span data-role="msg" style="flex:2;color:#8C8;"></span>
      </div>
      <div data-role="events" style="display:none;flex-wrap:wrap;gap:4px;padding:6px 8px;border-bottom:1px solid #334;"></div>
      <div data-role="list" style="overflow:auto;padding:4px;"></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.listEl = el.querySelector('[data-role=list]');

    el.querySelector('[data-act=close]')!.addEventListener('click', () => this.close());
    el.querySelector('[data-act=clear]')!.addEventListener('click', () => {
      const n = this.hooks.clearEnemies();
      this.msg(`已清除 ${n} 只敌怪`, '#FC8');
    });
    const q = el.querySelector<HTMLInputElement>('[data-role=q]')!;
    q.addEventListener('input', () => { this.query = q.value; this.render(); });
    const cnt = el.querySelector<HTMLSelectElement>('[data-role=count]')!;
    cnt.addEventListener('change', () => { this.count = Number(cnt.value) || 1; });
    const am = el.querySelector<HTMLInputElement>('[data-role=atMouse]')!;
    am.addEventListener('change', () => { this.atMouse = am.checked; });
    this.renderEvents();
    this.render();
    q.focus();
  }

  /** 事件触发行（hooks.events 有条目才显示） */
  private renderEvents(): void {
    const box = this.el?.querySelector<HTMLElement>('[data-role=events]');
    if (!box) return;
    const events = this.hooks.events ?? [];
    if (!events.length || !this.hooks.triggerEvent) return;
    box.style.display = 'flex';
    for (const ev of events) {
      const btn = document.createElement('button');
      btn.textContent = ev.label;
      btn.style.cssText = 'background:#182838;color:#9CD;border:1px solid #356;border-radius:4px;cursor:pointer;padding:2px 8px;font:inherit;';
      btn.addEventListener('click', () => {
        const err = this.hooks.triggerEvent!(ev.key);
        if (err) this.msg(err, '#F88');
        else this.msg(`已触发:${ev.label}`);
      });
      box.appendChild(btn);
    }
  }

  close(): void {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    this.listEl = null;
    this.hooks.onClose?.();   // 解冻 uiBlocking（见 hooks.onClose 注释）
  }

  private msg(text: string, color = '#8C8'): void {
    const m = this.el?.querySelector<HTMLElement>('[data-role=msg]');
    if (m) { m.textContent = text; m.style.color = color; }
  }

  private render(): void {
    if (!this.listEl) return;
    const rows = filterSummonEntries(this.query, 240, (id) => this.hooks.nameOf(id));
    // 重名消歧集（全量表口径,与过滤无关——同一名字不管搜不搜都带后缀,行身份稳定）
    const colliding = summonCollidingNames((id) => this.hooks.nameOf(id));
    this.listEl.innerHTML = '';
    for (const e of rows) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;padding:2px 6px;cursor:pointer;border-radius:3px;';
      row.addEventListener('mouseenter', () => { row.style.cssText += ROW_HOVER; });
      row.addEventListener('mouseleave', () => { row.style.cssText = row.style.cssText.replace(ROW_HOVER, ''); });
      const disp = this.hooks.nameOf(e.id) || e.name;
      // 原版本地化重名族（22 僵尸/10 稻草人/9 蝾螈…共 80 组）：追加英文变体名消歧
      const ambig = colliding.has(disp) && e.name !== disp
        ? `<span style="color:#667;flex:none;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.name}</span>` : '';
      row.innerHTML =
        `<span style="color:#789;min-width:34px;text-align:right;">${e.id}</span>` +
        `<span style="flex:1;color:${e.town ? '#8CF' : e.critter ? '#8D8' : '#EEE'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${disp}</span>` + ambig +
        (e.boss ? '<span style="color:#F66;">BOSS</span>' : '') +
        (e.town ? '<span style="color:#8CF;">镇</span>' : '') +
        (e.critter ? '<span style="color:#8D8;">宠</span>' : '');
      row.addEventListener('click', () => {
        const err = this.hooks.spawn(e.id, this.count, this.atMouse);
        if (err) this.msg(err, '#F88');
        else this.msg(`已召唤 ${disp}${this.count > 1 ? ` ×${this.count}` : ''}`);
      });
      this.listEl.appendChild(row);
    }
    if (!rows.length) this.listEl.innerHTML = '<div style="color:#889;padding:6px;">无匹配</div>';
  }
}
