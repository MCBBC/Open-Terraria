// 成就菜单 + 背包提示牌（原版 UIAchievementsMenu / UIAchievementListItem /
// AchievementAdvisor 的 DOM 移植）。
// 语义对照：
//  - 面板半透 Color(33,43,79)*0.8（UIAchievementsMenu BackgroundColor）
//  - 图标：Achievements.png 64px 帧 / 66px 步长 / 每行 8 帧；锁定态 X+528
//    灰阶列块（UIAchievementListItem.cs:57-60）
//  - 边框：Achievement_Borders.png 72×72
//  - 分类过滤行：Achievement_Categories.png 32×32 帧 / 34px 步长 / 上下两行
//    = 选中/未选中（UIToggleImage frame/off Point(34j,0)/(34j,34)，cs:92-95）
//  - 列表序 = 注册序（CreateAchievementsList 同注册表原序）
import type { Game } from '../core/Game';
import { Lang } from '../i18n/Lang';
import { ACH_CATEGORY } from '../data/vanillaAchievements';

const CATEGORY_NAMES: Record<number, string> = {
  [ACH_CATEGORY.Slayer]: 'Achievements.SlayerCategory',
  [ACH_CATEGORY.Collector]: 'Achievements.CollectorCategory',
  [ACH_CATEGORY.Explorer]: 'Achievements.ExplorerCategory',
  [ACH_CATEGORY.Challenger]: 'Achievements.ChallengerCategory',
  [ACH_CATEGORY.NoCategory]: 'Achievements.NoCategory',
};

const CSS = `
.sw-ach-panel { pointer-events:auto; position:fixed; left:50%; top:50%;
  transform:translate(-50%,-50%); width:min(680px, 92vw); max-height:88vh;
  /* 原版 UIAchievementsMenu BackgroundColor = Color(33,43,79)*0.8 */
  background:rgba(33,43,79,0.8); border:2px solid #7d92d6; border-radius:6px;
  color:#e8ecf8; padding:12px; display:flex; flex-direction:column;
  box-shadow:0 0 0 2px rgba(10,14,30,0.8), 0 6px 28px rgba(0,0,0,0.65);
  font-size:14px; z-index:120; }
.sw-ach-head { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
.sw-ach-head .sw-title { margin-bottom:0; flex:1; }
.sw-ach-cat { pointer-events:auto; width:32px; height:32px; border:none; padding:0;
  background:url(sprites/vanilla/Achievement_Categories.png);
  background-size:auto; image-rendering:pixelated; cursor:pointer; flex:none; }
.sw-ach-list { overflow-y:auto; display:flex; flex-direction:column; gap:6px; padding-right:4px; }
.sw-ach-row { pointer-events:auto; display:flex; gap:10px; align-items:center;
  background:rgba(20,26,52,0.55); border-radius:6px; padding:6px; cursor:pointer; }
.sw-ach-row:hover { background:rgba(40,52,100,0.65); }
.sw-ach-icon { position:relative; width:72px; height:72px; flex:none; }
.sw-ach-icon .glyph { position:absolute; left:4px; top:4px; width:64px; height:64px;
  background-image:url(sprites/vanilla/Achievements.png);
  background-repeat:no-repeat; image-rendering:pixelated; }
.sw-ach-icon img.border { position:absolute; left:0; top:0; width:72px; height:72px;
  image-rendering:pixelated; pointer-events:none; }
.sw-ach-info { flex:1; min-width:0; }
.sw-ach-info .nm { font-weight:bold; color:#ffe8a0; }
.sw-ach-row.done .sw-ach-info .nm { color:#8de08d; }
.sw-ach-info .ds { color:#aeb8d8; font-size:12px; margin-top:2px; }
.sw-ach-bar { height:8px; background:#1a1f3a; border-radius:4px; margin-top:5px;
  border:1px solid #444c7a; overflow:hidden; }
.sw-ach-bar .fill { height:100%; background:linear-gradient(90deg,#6a8ae0,#8ad0e0); }
/* ---- 背包提示牌（AchievementAdvisor.DrawOneAchievement 小卡 0.35 缩放近似） ---- */
.sw-ach-advisor { pointer-events:auto; display:flex; align-items:center; gap:8px;
  background:rgba(33,43,79,0.75); border:1px solid #7d92d6; border-radius:6px;
  padding:4px 8px; cursor:pointer; margin-top:4px; }
.sw-ach-advisor:hover { filter:brightness(1.2); }
.sw-ach-advisor .glyph { width:32px; height:32px; flex:none;
  background-image:url(sprites/vanilla/Achievements.png);
  background-repeat:no-repeat; image-rendering:pixelated; }
.sw-ach-advisor .tx { font-size:12px; color:#e8ecf8; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; max-width:150px; }
`;

let cssInjected = false;
function ensureCss(): void {
  if (cssInjected) return;
  cssInjected = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 图标帧 → CSS background-position（引擎 iconFrameOf：66 步长/8 列/锁定 +528） */
function glyphStyle(div: HTMLElement, a: Game['achievements'], name: string): void {
  const f = a.iconFrameOf(name);
  if (!f) return;
  const x = f.locked ? f.x + f.lockedDx : f.x;
  div.style.backgroundPosition = `${-x}px ${-f.y}px`;
}

// ---- 成就菜单（开关式：再次调用关闭） ----
let openPanel: HTMLElement | null = null;
let openEscHandler: ((e: KeyboardEvent) => void) | null = null;
/** 当前过滤类别（原版 4 个 UIToggleImage；全关 = 只看未完成? 原版至少留一个开） */
const catOn = [true, true, true, true];

export function openAchievementsPanel(game: Game): void {
  ensureCss();
  if (openPanel) { closeAchievementsPanel(); return; }
  const a = game.achievements;

  const panel = el('div', 'sw-ach-panel');
  // 头部：标题 + 完成计数 + 关闭
  const head = el('div', 'sw-ach-head');
  head.appendChild(el('div', 'sw-title', Lang.text('UI.Achievements')));
  const count = el('div');
  count.style.cssText = 'font-size:13px; color:#9fb0dd; flex:none;';
  head.appendChild(count);
  const closeBtn = el('button', 'sw-btn');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'margin:0; padding:4px 10px; width:auto; font-size:12px; flex:none;';
  closeBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); closeAchievementsPanel(); });
  head.appendChild(closeBtn);
  panel.appendChild(head);

  // 分类过滤行（Achievement_Categories.png：选中帧上排/未选中下排）
  const catRow = el('div');
  catRow.style.cssText = 'display:flex; gap:4px; margin-bottom:8px;';
  const catBtns: HTMLButtonElement[] = [];
  for (let j = 0; j < 4; j++) {
    const b = el('button', 'sw-ach-cat');
    const frame = (on: boolean) => {
      b.style.backgroundPosition = `${-(j * 34)}px ${-(on ? 0 : 34)}px`;
      b.style.opacity = on ? '1' : '0.55';
    };
    frame(catOn[j]);
    b.title = Lang.text(CATEGORY_NAMES[j]);
    b.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      // 原版 UIToggleImage 群：允许全关（显示空列表）
      catOn[j] = !catOn[j];
      frame(catOn[j]);
      renderList();
    });
    catBtns.push(b);
    catRow.appendChild(b);
  }
  panel.appendChild(catRow);

  const list = el('div', 'sw-ach-list');
  panel.appendChild(list);

  const renderList = () => {
    list.textContent = '';
    let doneN = 0;
    for (const def of a.defList()) {
      if (a.isCompleted(def.name)) doneN++;
      // 未归类成就（-1，如 GAIN_TORCH_GODS_FAVOR）不受过滤行影响恒显示
      if (def.category >= 0 && !catOn[def.category]) continue;
      const done = a.isCompleted(def.name);
      const row = el('div', 'sw-ach-row' + (done ? ' done' : ''));
      const icon = el('div', 'sw-ach-icon');
      const glyph = el('div', 'glyph');
      glyphStyle(glyph, a, def.name);
      icon.appendChild(glyph);
      const border = el('img') as HTMLImageElement;
      border.className = 'border';
      border.src = 'sprites/vanilla/Achievement_Borders.png';
      border.draggable = false;
      icon.appendChild(border);
      row.appendChild(icon);
      const info = el('div', 'sw-ach-info');
      info.appendChild(el('div', 'nm', Lang.text(`Achievements.${def.name}_Name`)));
      info.appendChild(el('div', 'ds', Lang.text(`Achievements.${def.name}_Description`)));
      const p = a.progressOf(def.name);
      if (!done && (p.ratio != null || p.totalConds > 1)) {
        const bar = el('div', 'sw-ach-bar');
        const fill = el('div', 'fill');
        const r = p.ratio ?? p.doneConds / p.totalConds;
        fill.style.width = `${Math.round(r * 100)}%`;
        bar.appendChild(fill);
        info.appendChild(bar);
      }
      row.appendChild(info);
      list.appendChild(row);
    }
    count.textContent = `${doneN} / ${a.count}`;
  };
  renderList();
  panel.addEventListener('mousedown', (e) => e.stopPropagation());
  (document.querySelector('.sw-root') ?? document.body).appendChild(panel);
  openPanel = panel;
  openEscHandler = (e) => { if (e.code === 'Escape') closeAchievementsPanel(); };
  window.addEventListener('keydown', openEscHandler);
  game.sfx.play('menuTick', 1);
}

export function closeAchievementsPanel(): void {
  openPanel?.remove();
  openPanel = null;
  if (openEscHandler) { window.removeEventListener('keydown', openEscHandler); openEscHandler = null; }
}

export function achievementsPanelOpen(): boolean { return !!openPanel; }

// ---- 背包提示牌（AchievementAdvisor：未完成成就小卡，点击开菜单） ----
/** 构建提示牌并返回带 update() 的元素（背包每次 refresh 时刷新显示内容） */
/** 原版 AchievementAdvisor.Initialize 精选序列（1458 与 1456 同序同集，36 项；
 *  序 ≠ AchievementInitializer 注册序——OBTAIN_HAMMER 在 NO_HOBO 前） */
const ADVISOR_ORDER = [
  'TIMBER', 'BENCHED', 'OBTAIN_HAMMER', 'NO_HOBO', 'YOU_CAN_DO_IT', 'OOO_SHINY',
  'HEAVY_METAL', 'MATCHING_ATTIRE', 'HEART_BREAKER', 'I_AM_LOOT', 'HOLD_ON_TIGHT',
  'STAR_POWER', 'EYE_ON_YOU', 'SMASHING_POPPET', 'WHERES_MY_HONEY', 'STING_OPERATION',
  'BONED', 'DUNGEON_HEIST', 'ITS_GETTING_HOT_IN_HERE', 'MINER_FOR_FIRE', 'STILL_HUNGRY',
  'ITS_HARD', 'BEGONE_EVIL', 'EXTRA_SHINY', 'HEAD_IN_THE_CLOUDS', 'BUCKETS_OF_BOLTS',
  'DRAX_ATTAX', 'PHOTOSYNTHESIS', 'GET_A_LIFE', 'THE_GREAT_SOUTHERN_PLANTKILL',
  'TEMPLE_RAIDER', 'LIHZAHRDIAN_IDOL', 'ROBBING_THE_GRAVE', 'OBSESSIVE_DEVOTION',
  'STAR_DESTROYER', 'CHAMPION_OF_TERRARIA',
];

export function createAchievementAdvisor(game: Game): HTMLElement & { update(): void } {
  ensureCss();
  const card = el('div', 'sw-ach-advisor') as unknown as HTMLElement & { update(): void };
  const glyph = el('div', 'glyph');
  const tx = el('div', 'tx');
  card.appendChild(glyph);
  card.appendChild(tx);
  card.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    openAchievementsPanel(game);
  });
  card.update = () => {
    // Advisor 选择 = 原版 AchievementAdvisor.GetBestCards(1)（1458 同 1456）：
    // 精选序列（AchievementAdvisor.Initialize 36 项，序≠注册序）中首个未完成。
    // IsAchievableInWorld 未建模（原版检查世界进度门槛，本仓成就无条件可达）略。
    const a = game.achievements;
    let best: string | null = null;
    for (const name of ADVISOR_ORDER) {
      if (a.defOf(name) && !a.isCompleted(name)) { best = name; break; }
    }
    if (!best) { card.style.display = 'none'; return; }
    card.style.display = 'flex';
    glyphStyle(glyph, a, best);
    tx.textContent = Lang.text(`Achievements.${best}_Name`);
  };
  card.update();
  return card;
}
