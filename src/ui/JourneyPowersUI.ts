// Journey 力量菜单（UICreativePowersMenu 的 DOM 版）。
// 标杆 Terraria.GameContent.UI.States.UICreativePowersMenu.cs + CreativePowers.cs：
//   菜单结构 = 主条（复制/研究/时间/天气/个人 + 感染蔓延 toggle + 敌人难度滑杆）
//   + 时间条（冻结 + 黎明/正午/黄昏/午夜 + 时间速度滑杆）
//   + 天气条（风滑杆 + 冻结风 + 雨滑杆 + 冻结雨）+ 个人条（上帝/放置范围/刷怪率滑杆）。
// 数值语义 1:1（滑杆映射/档位/持久化全走 JourneyPowers.ts 纯函数）；
// 视觉为本仓面板风格（横滑杆代原版竖滑杆，偏差登记）。
// 文案直接用原版 CreativePowers.* l10n 键（zh-Hans/en-US 均在 vanilla 包内）。
import type { Game } from '../core/Game';
import { Lang } from '../i18n/Lang';
import { ITEM_DEFS } from '../data/items';
import researchNeed from '../data/vanilla-research.json';
import {
  JourneyPowersState, targetTimeRate, timeRateSliderOf, strengthOfDifficultySlider,
  spawnRateMultiplier, shouldDisableSpawns, windOfSlider, sliderOfWind,
  TIME_RATE_PRESETS, DIFFICULTY_PRESETS, SPAWN_RATE_PRESETS, WIND_PRESETS, RAIN_PRESETS,
} from '../world/JourneyPowers';
import { Clock } from '../world/World';

/** 背包内物品点击给 1 / shift 给整堆（原版 UIItemSlot 抓取语义的 UI 近似） */
function giveItem(game: Game, internalId: number, stack: number): void {
  const inv = game.player.inv;
  // 与 ResearchUI.consumeOne 对称：找同类堆叠加，否则找空槽
  for (let i = 0; i < inv.slots.length; i++) {
    const s = inv.slots[i];
    if (s && s.id === internalId) {
      s.stack += stack;
      game.cb.onInventoryChanged?.();
      return;
    }
  }
  for (let i = 0; i < inv.slots.length; i++) {
    if (!inv.slots[i]) {
      inv.slots[i] = { id: internalId, stack };
      game.cb.onInventoryChanged?.();
      return;
    }
  }
}

/** 原版 id → 内部 item id（懒建反向表；vanilla id 空间经 vi_ 前缀/vid 字段桥接） */
let vidReverse: Map<number, number> | null = null;
function internalIdOfVid(vid: number): number {
  if (!vidReverse) {
    vidReverse = new Map();
    for (const [idStr, def] of Object.entries(ITEM_DEFS)) {
      const d = def as { vid?: number; key?: string };
      if (d.vid != null) {
        if (!vidReverse.has(d.vid)) vidReverse.set(d.vid, +idStr);
      } else if (d.key) {
        const m = /^vi_(\d+)_/.exec(d.key);
        if (m && !vidReverse.has(+m[1])) vidReverse.set(+m[1], +idStr);
      }
    }
  }
  return vidReverse.get(vid) ?? 0;
}

const CSS = `
.sw-jp-panel { pointer-events:auto; position:fixed; left:50%; top:50%;
  transform:translate(-50%,-50%); width:min(480px, 92vw); max-height:82vh;
  background:rgba(33,43,79,0.93); border:2px solid #7d92d6; border-radius:6px;
  color:#e8ecf8; padding:12px; display:flex; flex-direction:column;
  box-shadow:0 0 0 2px rgba(10,14,30,0.8), 0 6px 28px rgba(0,0,0,0.65);
  font-size:13px; z-index:130; }
.sw-jp-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.sw-jp-head .sw-title { flex:1; margin-bottom:0; font-size:15px; }
.sw-jp-strip { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px; }
.sw-jp-strip button { margin:0; padding:4px 8px; font-size:12px; flex:none; }
.sw-jp-strip button.sel { background:linear-gradient(#5a6ad0,#3a4aa0); border-color:#8d9cf0; }
.sw-jp-strip button.ton { background:linear-gradient(#3a7a4a,#2a5a38); border-color:#6dcf82; }
.sw-jp-body { overflow-y:auto; display:flex; flex-direction:column; gap:10px; }
.sw-jp-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.sw-jp-row .lbl { min-width:64px; color:#9fb0dd; flex:none; }
.sw-jp-row input[type=range] { flex:1; min-width:120px; margin:0; }
.sw-jp-val { min-width:76px; text-align:right; font-variant-numeric:tabular-nums; flex:none; }
.sw-jp-presets { display:flex; gap:3px; flex:none; }
.sw-jp-presets button { margin:0; padding:2px 6px; font-size:11px; }
.sw-jp-note { font-size:11px; color:#8a97c4; }
.sw-jp-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(108px, 1fr));
  gap:3px; max-height:220px; overflow-y:auto; }
.sw-jp-grid button { margin:0; padding:3px 4px; font-size:11px; text-align:left;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
`;

let cssInjected = false;
function ensureCss(): void {
  if (cssInjected) return;
  cssInjected = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

let panel: HTMLElement | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;
/** 主条当前类别（OpenMainSubCategory 枚举序：1 复制/2 研究/3 时间/4 天气/5 难度/6 个人） */
let category = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const t = (key: string, fallback: string, ...args: (string | number)[]): string => {
  const v = Lang.text(key, ...args);
  return v === key ? fallback : v;
};

/** 当前倍率/读数行（原版滑杆悬停文本 1:1：xN / 风 mph / 雨 P0） */
function timeRateText(rate: number): string { return `x${rate}`; }
function difficultyText(v: number): string { return `x${v.toFixed(2)}`; }
function spawnRateText(slider: number): string {
  return shouldDisableSpawns(slider)
    ? t('CreativePowers.NPCSpawnRateSliderEnemySpawnsDisabled', '禁用')
    : `x${spawnRateMultiplier(slider).toFixed(2)}`;
}
function windText(wind: number): string {
  const num = Math.trunc(wind * 50);
  if (num < 0) return t('GameUI.EastWind', `（东风 ${Math.abs(num)} mph）`, Math.abs(num));
  if (num > 0) return t('GameUI.WestWind', `（西风 ${num} mph）`, num);
  return t('CreativePowers.WindNone', '无风');
}
function rainText(maxRaining: number): string { return `${Math.round(maxRaining * 100)}%`; }

export function openJourneyPowersPanel(game: Game): void {
  ensureCss();
  if (panel) { closeJourneyPowersPanel(); return; }
  game.input.uiBlocking = true;
  if (category === 0) category = 3;   // 默认开时间页（原版主条无默认选中，UI 取常用页）
  panel = el('div', 'sw-jp-panel');
  const head = el('div', 'sw-jp-head');
  head.appendChild(el('div', 'sw-title', t('Mods.SandboxWorld.JourneyPowers.Title', '力量菜单')));
  const closeBtn = el('button', 'sw-btn', '✕');
  closeBtn.style.cssText = 'margin:0; padding:4px 10px; width:auto; font-size:12px; flex:none;';
  closeBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); closeJourneyPowersPanel(); });
  head.appendChild(closeBtn);
  panel.appendChild(head);
  const strip = el('div', 'sw-jp-strip');
  panel.appendChild(strip);
  const body = el('div', 'sw-jp-body');
  panel.appendChild(body);

  const render = () => {
    const w = game.world;
    if (!w) return;
    const jp: JourneyPowersState = w.journeyPowers;
    const wx = w.weather;
    strip.textContent = '';
    // ---- 主条（CreateMainPowerStrip :167-213 语义）----
    const cats: Array<[number, string, string]> = [
      [1, t('Mods.SandboxWorld.JourneyPowers.CatDuplicate', '复制'), 'CreativePowers.InfiniteItemsCategory'],
      [2, t('Mods.SandboxWorld.JourneyPowers.CatResearch', '研究'), 'CreativePowers.ResearchItemsCategory'],
      [3, t('Mods.SandboxWorld.JourneyPowers.CatTime', '时间'), 'CreativePowers.TimeCategory'],
      [4, t('Mods.SandboxWorld.JourneyPowers.CatWeather', '天气'), 'CreativePowers.WeatherCategory'],
      [5, t('Mods.SandboxWorld.JourneyPowers.CatDifficulty', '敌人难度'), 'CreativePowers.DifficultySlider_Closed'],
      [6, t('Mods.SandboxWorld.JourneyPowers.CatPersonal', '个人'), 'CreativePowers.PersonalCategory'],
    ];
    for (const [v, label, hoverKey] of cats) {
      const b = el('button', 'sw-btn' + (category === v ? ' sel' : ''), label);
      b.title = t(hoverKey, label);
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        category = category === v ? 0 : v;   // ToggleCategory：同键再点收起
        game.sfx.play('menuTick', 1);        // SoundID 12（原版按钮通用音）
        render();
      });
      strip.appendChild(b);
    }
    // 感染蔓延 toggle（主条独立按钮，:208）
    const bSpread = el('button', 'sw-btn' + (jp.stopBiomeSpread ? ' ton' : ''),
      jp.stopBiomeSpread
        ? t('CreativePowers.StopBiomeSpread_Enabled', '感染蔓延已禁用')
        : t('CreativePowers.StopBiomeSpread_Disabled', '感染蔓延已启用'));
    bSpread.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      jp.stopBiomeSpread = !jp.stopBiomeSpread;
      game.sfx.play('menuTick', 1);
      render();
    });
    strip.appendChild(bSpread);

    body.textContent = '';
    // ---- 子页 ----
    if (category === 3) {
      // 时间条（CreateTimePowerStrip :319-337）
      const r1 = el('div', 'sw-jp-row');
      r1.appendChild(el('div', 'lbl', t('CreativePowers.FreezeTime_Description', '停止时间流逝')));
      const bFreeze = el('button', 'sw-btn' + (w.journeyFreezeTime ? ' ton' : ''),
        w.journeyFreezeTime
          ? t('CreativePowers.FreezeTime_Enabled', '时间已经定格')
          : t('CreativePowers.FreezeTime_Disabled', '时间恢复流逝'));
      bFreeze.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        w.journeyFreezeTime = !w.journeyFreezeTime;   // 复用 T 键同源状态（勿建第二套）
        game.sfx.play('menuTick', 1);
        render();
      });
      r1.appendChild(bFreeze);
      body.appendChild(r1);
      // 四时段按钮（StartDayImmediately 族 :774-864；Main.SkipToTime :64657）
      const r2 = el('div', 'sw-jp-row');
      const times: Array<[string, string, number, boolean]> = [
        ['StartDayImmediately', '黎明', Clock.DAWN, true],
        ['StartNoonImmediately', '正午', 0.5, true],
        ['StartNightImmediately', '黄昏', Clock.DUSK, false],
        ['StartMidnightImmediately', '午夜', 0, false],
      ];
      for (const [key, fb, tod, isDay] of times) {
        const b = el('button', 'sw-btn', t(`CreativePowers.${key}`, fb));
        b.title = t(`CreativePowers.${key}_Description`, fb);
        b.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          game.skipToTime(tod, isDay);   // Main.SkipToTime（:64657-64671）
          game.sfx.play('menuTick', 1);
          render();
        });
        r2.appendChild(b);
      }
      body.appendChild(r2);
      // 时间速度滑杆（ModifyTimeRate :866-1005；状态 = world.journeyTimeRate 整数档）
      const r3 = el('div', 'sw-jp-row');
      r3.appendChild(el('div', 'lbl', t('Mods.SandboxWorld.JourneyPowers.TimeSpeed', '时间速度')));
      const presets = el('div', 'sw-jp-presets');
      for (const [k, v] of [['x1', TIME_RATE_PRESETS.x1], ['x12', TIME_RATE_PRESETS.x12], ['x24', TIME_RATE_PRESETS.x24]] as const) {
        const b = el('button', 'sw-btn', k);
        b.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          w.journeyTimeRate = targetTimeRate(v);   // :931-946 点击档
          game.sfx.play('menuTick', 1);
          render();
        });
        presets.appendChild(b);
      }
      r3.appendChild(presets);
      const slider = el('input') as HTMLInputElement;
      slider.type = 'range';
      slider.min = '0'; slider.max = '1'; slider.step = '0.01';
      slider.value = String(timeRateSliderOf(w.journeyTimeRate));
      slider.addEventListener('input', () => {
        // 连续滑杆（UIVerticalSlider 语义）：值 = round(Remap(s,0,1,1,24))
        w.journeyTimeRate = targetTimeRate(+slider.value);
        val.textContent = timeRateText(w.journeyTimeRate);
      });
      slider.addEventListener('change', () => { game.sfx.play('menuTick', 1); render(); });
      r3.appendChild(slider);
      const val = el('div', 'sw-jp-val', timeRateText(w.journeyTimeRate));
      r3.appendChild(val);
      body.appendChild(r3);
    } else if (category === 4) {
      // 天气条（CreateWeatherPowerStrip :356-374）
      // 风滑杆（ModifyWindDirectionAndStrength :1186-1316）
      const r1 = el('div', 'sw-jp-row');
      r1.appendChild(el('div', 'lbl', t('Mods.SandboxWorld.JourneyPowers.Wind', '风力')));
      const windPresets = el('div', 'sw-jp-presets');
      for (const [k, v] of [
        [t('CreativePowers.WindWest', '西风'), WIND_PRESETS.west],
        [t('CreativePowers.WindNone', '无风'), WIND_PRESETS.none],
        [t('CreativePowers.WindEast', '东风'), WIND_PRESETS.east],
      ] as const) {
        const b = el('button', 'sw-btn', k);
        b.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          const wind = windOfSlider(v);
          wx.windSpeedTarget = wind;
          wx.windSpeedCurrent = wind;   // :1197 current=target 同置
          game.sfx.play('menuTick', 1);
          render();
        });
        windPresets.appendChild(b);
      }
      r1.appendChild(windPresets);
      const slider = el('input') as HTMLInputElement;
      slider.type = 'range';
      slider.min = '0'; slider.max = '1'; slider.step = '0.01';
      slider.value = String(sliderOfWind(wx.windSpeedTarget));   // :1202 GetLerpValue(-0.8,0.8,target)
      slider.addEventListener('input', () => {
        const wind = windOfSlider(+slider.value);
        wx.windSpeedTarget = wind;
        wx.windSpeedCurrent = wind;
        val.textContent = windText(wind);
      });
      slider.addEventListener('change', () => { game.sfx.play('menuTick', 1); render(); });
      r1.appendChild(slider);
      const val = el('div', 'sw-jp-val', windText(wx.windSpeedTarget));
      r1.appendChild(val);
      const bFreezeWind = el('button', 'sw-btn' + (jp.freezeWind ? ' ton' : ''),
        jp.freezeWind
          ? t('CreativePowers.FreezeWindDirectionAndStrength_Enabled', '风况变化已禁用')
          : t('CreativePowers.FreezeWindDirectionAndStrength_Disabled', '风况变化已启用'));
      bFreezeWind.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        jp.freezeWind = !jp.freezeWind;
        game.sfx.play('menuTick', 1);
        render();
      });
      r1.appendChild(bFreezeWind);
      body.appendChild(r1);
      // 雨滑杆（ModifyRainPower :1318-1446；GetSliderValueInner = cloudAlpha :1341）
      const r2 = el('div', 'sw-jp-row');
      r2.appendChild(el('div', 'lbl', t('Mods.SandboxWorld.JourneyPowers.Rain', '降雨')));
      const rainPresets = el('div', 'sw-jp-presets');
      for (const [k, v] of [
        [t('CreativePowers.WeatherMonsoon', '雨季'), RAIN_PRESETS.monsoon],
        [t('CreativePowers.WeatherDrizzle', '细雨'), RAIN_PRESETS.drizzle],
        [t('CreativePowers.WeatherClearSky', '晴天'), RAIN_PRESETS.clearSky],
      ] as const) {
        const b = el('button', 'sw-btn', k);
        b.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          applyRainSlider(game, v);
          game.sfx.play('menuTick', 1);
          render();
        });
        rainPresets.appendChild(b);
      }
      r2.appendChild(rainPresets);
      const slider2 = el('input') as HTMLInputElement;
      slider2.type = 'range';
      slider2.min = '0'; slider2.max = '1'; slider2.step = '0.01';
      slider2.value = String(wx.cloudAlpha);
      slider2.addEventListener('input', () => {
        applyRainSlider(game, +slider2.value);
        val2.textContent = rainText(wx.cloudAlpha);
      });
      slider2.addEventListener('change', () => { game.sfx.play('menuTick', 1); render(); });
      r2.appendChild(slider2);
      const val2 = el('div', 'sw-jp-val', rainText(wx.cloudAlpha));
      r2.appendChild(val2);
      const bFreezeRain = el('button', 'sw-btn' + (jp.freezeRain ? ' ton' : ''),
        jp.freezeRain
          ? t('CreativePowers.FreezeRainPower_Enabled', '雨情变化已禁用')
          : t('CreativePowers.FreezeRainPower_Disabled', '雨情变化已启用'));
      bFreezeRain.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        jp.freezeRain = !jp.freezeRain;
        game.sfx.play('menuTick', 1);
        render();
      });
      r2.appendChild(bFreezeRain);
      body.appendChild(r2);
    } else if (category === 5) {
      // 敌人难度滑杆（DifficultySliderPower :1007-1184）
      const r1 = el('div', 'sw-jp-row');
      r1.appendChild(el('div', 'lbl', t('Mods.SandboxWorld.JourneyPowers.Difficulty', '敌人强度')));
      const presets = el('div', 'sw-jp-presets');
      const diffPresets: Array<[string, number]> = [
        [t('UI.Master', '大师'), DIFFICULTY_PRESETS.master],
        [t('UI.Expert', '专家'), DIFFICULTY_PRESETS.expert],
        [t('UI.Normal', '经典'), DIFFICULTY_PRESETS.normal],
        [t('UI.Creative', '旅行'), DIFFICULTY_PRESETS.journey],
      ];
      for (const [label, v] of diffPresets) {
        const b = el('button', 'sw-btn', label);
        b.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          jp.difficultySlider = v;   // :1055-1077 四档点击
          game.sfx.play('menuTick', 1);
          render();
        });
        presets.appendChild(b);
      }
      r1.appendChild(presets);
      const slider = el('input') as HTMLInputElement;
      slider.type = 'range';
      slider.min = '0'; slider.max = '1'; slider.step = '0.01';
      slider.value = String(jp.difficultySlider);
      slider.addEventListener('input', () => {
        jp.difficultySlider = +slider.value;
        val.textContent = difficultyText(strengthOfDifficultySlider(jp.difficultySlider));
      });
      slider.addEventListener('change', () => { game.sfx.play('menuTick', 1); render(); });
      r1.appendChild(slider);
      const val = el('div', 'sw-jp-val', difficultyText(strengthOfDifficultySlider(jp.difficultySlider)));
      r1.appendChild(val);
      body.appendChild(r1);
      body.appendChild(el('div', 'sw-jp-note',
        t('CreativePowers.DifficultySlider_Description', '调整敌人的强度')));
    } else if (category === 6) {
      // 个人条（CreatePersonalPowerStrip :339-354）
      const r1 = el('div', 'sw-jp-row');
      r1.appendChild(el('div', 'lbl', t('CreativePowers.Godmode_Description', '获得无敌效果！')));
      const bGod = el('button', 'sw-btn' + (jp.godmode ? ' ton' : ''),
        jp.godmode
          ? t('CreativePowers.Godmode_Enabled', '无敌模式已启用')
          : t('CreativePowers.Godmode_Disabled', '无敌模式已禁用'));
      bGod.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        jp.godmode = !jp.godmode;
        game.sfx.play('menuTick', 1);
        render();
      });
      r1.appendChild(bGod);
      body.appendChild(r1);
      const r2 = el('div', 'sw-jp-row');
      r2.appendChild(el('div', 'lbl', t('Mods.SandboxWorld.JourneyPowers.Placement', '放置范围')));
      const bFar = el('button', 'sw-btn' + (jp.farPlacementRange ? ' ton' : ''),
        jp.farPlacementRange
          ? t('CreativePowers.InfinitePlacementRange_Enabled', '扩大放置范围')
          : t('CreativePowers.InfinitePlacementRange_Disabled', '正常放置范围'));
      bFar.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        jp.farPlacementRange = !jp.farPlacementRange;
        game.sfx.play('menuTick', 1);
        render();
      });
      r2.appendChild(bFar);
      body.appendChild(r2);
      // 刷怪率滑杆（SpawnRateSliderPerPlayerPower :1584-1749）
      const r3 = el('div', 'sw-jp-row');
      r3.appendChild(el('div', 'lbl', t('Mods.SandboxWorld.JourneyPowers.SpawnRate', '刷怪率')));
      const presets = el('div', 'sw-jp-presets');
      for (const [k, v] of [['x10', SPAWN_RATE_PRESETS.x10], ['x1', SPAWN_RATE_PRESETS.x1], ['x0', SPAWN_RATE_PRESETS.x0]] as const) {
        const b = el('button', 'sw-btn', k);
        b.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          jp.spawnRateSlider = v;   // :1683-1698 三档点击
          game.sfx.play('menuTick', 1);
          render();
        });
        presets.appendChild(b);
      }
      r3.appendChild(presets);
      const slider = el('input') as HTMLInputElement;
      slider.type = 'range';
      slider.min = '0'; slider.max = '1'; slider.step = '0.01';
      slider.value = String(jp.spawnRateSlider);
      slider.addEventListener('input', () => {
        jp.spawnRateSlider = +slider.value;
        val.textContent = spawnRateText(jp.spawnRateSlider);
      });
      slider.addEventListener('change', () => { game.sfx.play('menuTick', 1); render(); });
      r3.appendChild(slider);
      const val = el('div', 'sw-jp-val', spawnRateText(jp.spawnRateSlider));
      r3.appendChild(val);
      body.appendChild(r3);
    } else if (category === 1) {
      // 复制菜单（InfiniteItems——已研究物品自由取用）
      const grid = el('div', 'sw-jp-grid');
      const need = (researchNeed as unknown as { need: Record<string, number> }).need;
      const vids = Object.keys(need).map(Number).filter((v) => game.research.isResearched(v));
      body.appendChild(el('div', 'sw-jp-note',
        t('Mods.SandboxWorld.JourneyPowers.DuplicateCount', `可复制物品 ${vids.length} 件`, vids.length)));
      if (!vids.length) {
        body.appendChild(el('div', 'sw-jp-note',
          t('Mods.SandboxWorld.JourneyPowers.DuplicateEmpty', '尚未研究任何物品')));
      }
      for (const vid of vids) {
        const internalId = internalIdOfVid(vid);
        if (!internalId) continue;
        const def = ITEM_DEFS[internalId] as { maxStack?: number } | undefined;
        const b = el('button', 'sw-btn', Lang.itemName(vid) ?? `#${vid}`);
        b.title = t('CreativePowers.ResearchButtonTooltip', '可以自由创造已经过充分研究的物品');
        b.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          giveItem(game, internalId, e.shiftKey ? (def?.maxStack ?? 999) : 1);
          game.sfx.play('menuTick', 1);
        });
        grid.appendChild(b);
      }
      body.appendChild(grid);
    } else if (category === 2) {
      // 研究入口（复用 ResearchUI）
      const r1 = el('div', 'sw-jp-row');
      const bRes = el('button', 'sw-btn', t('CreativePowers.ResearchItemsCategoryClosed', '打开研究菜单'));
      bRes.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        closeJourneyPowersPanel();
        import('./ResearchUI').then((m) => m.openResearchPanel(game));
      });
      r1.appendChild(bRes);
      body.appendChild(r1);
    }
  };
  render();

  panel.addEventListener('mousedown', (e) => e.stopPropagation());
  (document.querySelector('.sw-root') ?? document.body).appendChild(panel);
  escHandler = (e) => { if (e.code === 'Escape') closeJourneyPowersPanel(); };
  window.addEventListener('keydown', escHandler);
  game.sfx.play('menuTick', 1);
}

/** ModifyRainPower.UpdateInfoFromSliderValueCache（:1327-1337）：
 *  0 → StopRain(instant)；否则 StartRain(instant, slider)（strengthOverride） */
function applyRainSlider(game: Game, v: number): void {
  const wx = game.world?.weather;
  if (!wx) return;
  if (v === 0) wx.stopRain(true);
  else wx.startRain(true, v);
}

export function closeJourneyPowersPanel(): void {
  (window as unknown as { __swGame?: { input: { uiBlocking: boolean } } }).__swGame
    ?.input && ((window as unknown as { __swGame?: { input: { uiBlocking: boolean } } }).__swGame!.input.uiBlocking = false);
  panel?.remove();
  panel = null;
  if (escHandler) { window.removeEventListener('keydown', escHandler); escHandler = null; }
}

/** 背包打开时入口按钮可用性（CreativeUI.Draw :98-117：LocalPlayer.difficulty==3 门） */
export function journeyPowersEntryVisible(game: Game): boolean {
  return game.player.appearance?.difficulty === 3;
}
