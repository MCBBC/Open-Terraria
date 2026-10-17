// ★BJ631（2026-10-10）两件：件1 cHead 头甲染料通道收口（BJ625 登记债）+ 件2
//   AudioGate 文案 heal 后重绘（BJ628 登记债）。行为锁 + 源锚锁 + 逐槽对拍。
//
// 定谳锚（Terarria1457 亲读）：
//  · 件1：UpdateDyes（Player.cs:9679-9684）cHead/cBody/cLegs = GetEffectiveDye(0/1/2).dye
//    + wearsRobe→cLegs=cBody（wearsRobe 由 PlayerFrame :36054-36070 的 SetMatch
//    ArmorSlotRequested=1 somethingSpecial out 置位——SetMatch :37522-37525 case 166
//    flag=false =换裙发生但不置位）。消费面 = 头甲层 shader=drawinfo.cHead
//    （PlayerDrawLayers.cs:2173;:112/:115/:329/:377 同族）。本仓 BJ625 定谳：
//    compositePaperDoll dyeHead 形参在位但【零喂值+零消费】（缓存键 |dh 死键）——
//    body/legs 消费在（PaperDoll :498/:536/:541）而喂值同缺 = 三槽整缺面。
//    修：dollEquipFromInv 单源喂值（inv.getEffectiveDye = 1457 GetEffectiveDye
//    Player.cs:5736 同链,Loadout 收藏染料随行）+ PaperDoll 头甲消费 +
//    地图头带 strip 同域补齐 + 狼/人鱼覆写保染料（原版染料挂甲层与槽位无关,
//    Player.cs:36179-36205 覆写后 shader=cHead 照染）。
//  · 件2：AudioGate 渲染于 main.ts 门①（ensureReady 2500ms 短预算,:902）后、
//    门②（全预算,:1044）前——深失败窗 tip 一次性渲染,后台自愈成功（loaded→
//    emit）后不重绘。修：订阅 Lang.onChange 重绘 tip（TitleMenu.renderTexts
//    自愈消费面同习语）,放行即退订（监听器自捕环预防,BJ328 判例）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dollEquipFromInv } from '../src/render/Renderer';
import { Inventory } from '../src/items/Inventory';
import { ITEM_DEFS } from '../src/data/items';
import { statOfInternal } from '../src/data/vanillaItemStats';
import { languageManager, L10N_RETRY, CRITICAL_FALLBACK_ZH_EN } from '../src/i18n/LanguageManager';
import { showAudioGate } from '../src/ui/AudioGate';

const GAME_ROOT = join(import.meta.dirname, '..');

// ---- 夹具内 id（运行时自 ITEM_DEFS 解析,不钉死表序） ----
const firstItemBy = (pred: (vid: number | undefined, st: { s?: string; hs?: number; bs?: number; ls?: number } | null) => boolean): number => {
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
    if (!d) continue;
    if (pred(d.vid, statOfInternal(i) ?? null)) return i;
  }
  return -1;
};
const HEAD_ARMOR = 37;      // vid 37,hs=10（vi_ 头甲）
const BODY_ARMOR = 80;      // vid 80,bs=1（首件身甲——三槽对拍面）
const ROBE_BODY = 262;      // bs=15（长袍身甲——setMatchBodyToLegs 15→88）
const BODY_166 = 2278;      // bs=166（166 例外件——SetMatch flag=false）
const LEGS_ARMOR = 76;      // vid 76,ls=1
const DYE_RED = firstItemBy((vid) => vid === 1007);       // Red Dye（染料 vid 1007）
const DYE_ORANGE = firstItemBy((vid) => vid === 1008);    // Orange Dye
const DYE_THIRD = firstItemBy((vid) => vid === 1009);     // 第三染料（legs 槽异色对拍）

const item = (id: number): { id: number; stack: number } => ({ id, stack: 1 });

describe('BJ631 件1·喂值链行为锁（dollEquipFromInv 单源——UpdateDyes Player.cs:9679-9684 等价面）', () => {
  it('三槽各随其染料槽：dye[0]→dyeHead / dye[1]→dyeBody / dye[2]→dyeLegs（逐槽异色对拍）', () => {
    expect(DYE_RED).toBeGreaterThan(0);
    expect(DYE_ORANGE).toBeGreaterThan(0);
    expect(DYE_THIRD).toBeGreaterThan(0);
    const inv = new Inventory();
    inv.armor[0] = item(HEAD_ARMOR);
    inv.armor[1] = item(BODY_ARMOR);
    inv.armor[2] = item(LEGS_ARMOR);
    inv.dye[0] = item(DYE_RED);
    inv.dye[1] = item(DYE_ORANGE);
    inv.dye[2] = item(DYE_THIRD);
    const eq = dollEquipFromInv(inv);
    expect(eq.dyeHead).toBe(1007);
    expect(eq.dyeBody).toBe(1008);
    expect(eq.dyeLegs).toBe(1009);
  });

  it('甲槽缺位→该槽染料不出（原版 shader 挂甲层,无甲层无消费面;dyeBakeArmorSprite 空图兜底为防御位）', () => {
    const inv = new Inventory();
    inv.dye[0] = item(DYE_RED);
    inv.dye[1] = item(DYE_ORANGE);
    inv.dye[2] = item(DYE_THIRD);
    const eq = dollEquipFromInv(inv);
    expect(eq.head).toBeNull();
    expect(eq.body).toBeNull();
    expect(eq.legs).toBeNull();
    expect(eq.dyeHead).toBeNull();
    expect(eq.dyeBody).toBeNull();
    expect(eq.dyeLegs).toBeNull();
  });

  it('染料槽空→null（vid>0 才出=与消费面真值门同口径,无染料玩家 composite 键零漂移）', () => {
    const inv = new Inventory();
    inv.armor[0] = item(HEAD_ARMOR);
    inv.armor[1] = item(BODY_ARMOR);
    inv.armor[2] = item(LEGS_ARMOR);
    const eq = dollEquipFromInv(inv);
    expect(eq.head).not.toBeNull();
    expect(eq.dyeHead).toBeNull();
    expect(eq.dyeBody).toBeNull();
    expect(eq.dyeLegs).toBeNull();
  });

  it('长袍（bs=15）：腿贴图换裙 88 且 dyeLegs = dye[1]（wearsRobe→cLegs=cBody,:9682-9684）', () => {
    const inv = new Inventory();
    inv.armor[1] = item(ROBE_BODY);
    inv.dye[1] = item(DYE_ORANGE);
    inv.dye[2] = item(DYE_THIRD);
    const eq = dollEquipFromInv(inv, { skinVariant: 0 } as never);
    expect(eq.legs).toBe(88);      // setMatchBodyToLegs 15→88
    expect(eq.dyeLegs).toBe(1008); // 身染料及腿（非 dye[2]=1009）
  });

  it('166 例外（bs=166）：换裙发生但 wearsRobe 不置位 → dyeLegs 仍走 dye[2]（SetMatch flag=false,:37522-37525）', () => {
    const inv = new Inventory();
    inv.armor[1] = item(BODY_166);
    inv.dye[1] = item(DYE_ORANGE);
    inv.dye[2] = item(DYE_THIRD);
    const eq = dollEquipFromInv(inv, { skinVariant: 0 } as never);
    expect(eq.legs).toBe(119);     // 166→男 119（换裙发生）
    expect(eq.dyeLegs).toBe(1009); // 仍腿染料槽（非 cBody）
  });

  it('Loadout 收藏染料共享随行（getEffectiveDye=1457 GetEffectiveDye Player.cs:5736 同链）', () => {
    const inv = new Inventory();
    inv.armor[0] = item(HEAD_ARMOR);
    inv.loadouts[1]!.dye[0] = { id: DYE_RED, stack: 1, favorited: true };
    const eq = dollEquipFromInv(inv);
    expect(eq.dyeHead).toBe(1007);
  });
});

describe('BJ631 件1·渲染消费源锚（PaperDoll 头甲消费+body/legs 逐槽对拍+Renderer 面）', () => {
  const read = (p: string) => readFileSync(join(GAME_ROOT, p), 'utf8');
  const PD = read('src/player/PaperDoll.ts');
  const RDR = read('src/render/Renderer.ts');

  it('头甲染料消费在位（dyeHead→dyeBakeArmorSprite——BJ625 定谳的零消费面收口）', () => {
    expect(PD).toContain('const headArmorImg = equip?.dyeHead ? dyeBakeArmorSprite(headArmor.img, equip.dyeHead) : headArmor.img;');
  });

  it('逐槽对拍：body/legs 消费面在位（既有线锁现状）+ 三槽烘焙同函数', () => {
    expect(PD).toContain('const dyedBodyImg = equip?.dyeBody ? dyeBakeArmorSprite(bodyArmorImg, equip.dyeBody) : bodyArmorImg;');
    expect(PD).toContain('const legsArmorImg = equip?.dyeLegs ? dyeBakeArmorSprite(legsArmor.img, equip.dyeLegs) : legsArmor.img;');
    expect(PD.match(/dyeBakeArmorSprite\(img: any/g)).toHaveLength(1);   // 三槽同烘焙单源
  });

  it('legs 染烘提出帧/切片循环（喂值链上线后逐切片逐帧重烘=病理性,单次整表烘）', () => {
    expect(PD).toContain('const legsArmorImg = equip?.dyeLegs');
    expect(PD).not.toContain('dyeBakeArmorSprite(legsArmor.img, equip.dyeLegs) : legsArmor.img, s.sx');
  });

  it('composite 缓存键含三槽染料段（|dh/|db/|dl——染色的合成本体进键）', () => {
    expect(PD).toContain("(equip?.dyeHead ? `|dh${equip.dyeHead}` : '') + (equip?.dyeBody ? `|db${equip.dyeBody}` : '') + (equip?.dyeLegs ? `|dl${equip.dyeLegs}` : '')");
  });

  it('烘焙守卫：img 空早退 + uTime=GTW 单源钟（动画族不再恒冻 t0;合成缓存冻结窗登记偏差）', () => {
    expect(PD).toContain('if (!img) return img;');
    expect(PD).toContain('emu.uniforms.uTime = globalTimeWrappedHourly();');
  });

  it('喂值单源：dyeVidOf 走 getEffectiveDye（Loadout 共享随行）+ vid>0 门 + 甲槽在位门', () => {
    expect(RDR).toContain('const it = inv.getEffectiveDye(slot);');
    expect(RDR).toContain('dyeHead: head != null ? dyeVidOf(0) : null,');
    expect(RDR).toContain('dyeBody: body != null ? dyeVidOf(1) : null,');
    expect(RDR).toContain('dyeLegs: legs != null ? (wearsRobe ? dyeVidOf(1) : dyeVidOf(2)) : null,');
  });

  it('wearsRobe 166 例外（换裙发生但 flag=false——染料槽归属锁）', () => {
    expect(RDR).toContain('if (robe >= 0) { wearsRobe = (body ?? 0) !== 166; legs = robe; }');
  });

  it('狼/人鱼强改保染料（三站 spread——原版覆写后 shader=cHead 照染,Player.cs:36179-36205）', () => {
    expect(RDR).toContain('if (p.buffs.has(BuffType.Werewolf)) dollEquip = { ...dollEquip, head: 38, body: 21, legs: 20 };');
    expect(RDR).toContain('if (p.merman) dollEquip = { ...dollEquip, head: 39, body: 22, legs: 21 };');
    expect(RDR).toContain('if (p.buffs.has(BuffType.Werewolf)) accDollEquip = { ...accDollEquip, head: 38, body: 21, legs: 20 };');
    expect(RDR).toContain('if (p.merman) accDollEquip = { ...accDollEquip, head: 39, body: 22, legs: 21 };');
    expect(RDR).toContain('if (p.buffs.has(BuffType.Werewolf)) vh = { ...vh, head: 38, body: 21, legs: 20 };');
    expect(RDR).toContain('if (p.merman) vh = { ...vh, head: 39, body: 22, legs: 21 };');
  });

  it('地图头带 strip 同域补齐：headDyeVid 参+键+armorDyeBake+两调用位喂 equip.dyeHead', () => {
    expect(RDR).toContain('headDyeVid = 0): HTMLCanvasElement | null {');
    expect(RDR).toContain("const key = `${headIdx}|${headDyeVid}|${dyeColor.r},${dyeColor.g},${dyeColor.b}`;");
    expect(RDR).toContain('const dyed = emu ? this.armorDyeBake(head, emu, headDyeVid, 0, `hstrip:${headIdx}`) : null;');
    expect(RDR).toContain('this.playerHeadStrip(doll, player.appearance, equip?.head ?? 0, dyeColor, equip?.dyeHead ?? 0)');
    expect(RDR).toContain('this.playerHeadStrip(doll, rp.appearance, equip?.head ?? 0, dyeColor, equip?.dyeHead ?? 0)');
  });

  it('发色剂拆层路径既有头染料面锁现状（drawDollHairOverlays——与主合成路径互补不双画）', () => {
    expect(RDR).toContain('const headDye = p.inv?.dye?.[0];');
    expect(RDR).toContain("const dyed = this.armorDyeBake(head, emu, dyeVid, 0, `hd:${equip?.head ?? 0}`);");
  });

  it('主合成消费位不变（sw-bj21 源锚兼容：skipHair 门=拆层时头甲归 overlay 路径）', () => {
    // ★Maples 退役刀0(2026-10-17):p.appearance → app(渲染层缺省=默认纸娃娃,锚随迁)
    expect(RDR).toContain('const doll = compositePaperDoll(app, dollEquip, dollOpts);');
  });
});

// ===================== 件2：AudioGate heal 后重绘 =====================

/** 手卷 DOM 桩（node 环境无 jsdom;AudioGate 只用 createElement/innerHTML/
 *  querySelector('.tip')/body.appendChild/root.remove + window 两监听） */
function stubDom() {
  const makeTip = () => ({
    _html: '',
    set innerHTML(v: string) { this._html = v; },
    get innerHTML() { return this._html; },
  });
  const makeEl = () => {
    const el: Record<string, unknown> = {
      tag: 'div', id: '', children: [], _tip: null as null | ReturnType<typeof makeTip>, _removed: false,
      set innerHTML(v: string) {
        el._html = v;
        if (String(v).includes('class="tip"') && !el._tip) {
          const tip = makeTip();
          tip.innerHTML = v;                       // 初始模板渲染（门①失败窗文案）
          el._tip = tip;
        }
      },
      get innerHTML() { return el._html as string; },
      appendChild(c: unknown) { (el.children as unknown[]).push(c); },
      remove() { el._removed = true; },
      querySelector(sel: string) { return sel === '.tip' ? el._tip : null; },
      addEventListener() {}, removeEventListener() {},
    };
    return el;
  };
  const created: Array<Record<string, unknown>> = [];
  let lastRoot: Record<string, unknown> | null = null;
  (globalThis as Record<string, unknown>).document = {
    createElement: () => { const e = makeEl(); created.push(e); return e; },
    body: { appendChild(c: Record<string, unknown>) { lastRoot = c; } },
  };
  const added = new Map<string, EventListener>();
  const removed = new Map<string, EventListener>();
  (globalThis as Record<string, unknown>).window = {
    addEventListener(type: string, fn: EventListener) { added.set(type, fn); },
    removeEventListener(type: string, fn: EventListener) { removed.set(type, fn); },
    dispatchEvent() {},
  };
  return {
    created,
    get root() { return lastRoot; },
    get tip() { return (lastRoot as { _tip?: { innerHTML: string } } | null)?._tip ?? null; },
    added, removed,
  };
}

/** l10n fetch 桩（BJ628 同式）：PACK 带 Mods 类目 AudioGate 两键（zh/en 异值供重绘断言） */
function stubL10nFetch(mode: 'fail' | 'ok') {
  const PACKS: Record<string, string> = {
    'zh-Hans': JSON.stringify({ Mods: { 'SandboxWorld.AudioGate.Line1': '重绘锁文案甲', 'SandboxWorld.AudioGate.Line2': '重绘锁文案乙' } }),
    'en-US': JSON.stringify({ Mods: { 'SandboxWorld.AudioGate.Line1': 'redraw-lock copy A', 'SandboxWorld.AudioGate.Line2': 'redraw-lock copy B' } }),
  };
  return vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input instanceof Request ? input.url : input);
    if (u.includes('l10n/')) {
      if (u.endsWith('index.json')) return new Response(JSON.stringify([{ name: 'zh-Hans', legacyId: 7 }, { name: 'en-US', legacyId: 1 }]), { status: 200 });
      if (mode === 'fail') throw new TypeError('BJ631 simulated flaky network');
      const name = u.split('/').pop()!.replace('.json', '');
      return new Response(PACKS[name] ?? '{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new TypeError(`BJ631 mock: unexpected fetch ${u}`);
  });
}

const listenersOf = (lm: typeof languageManager): Array<() => void> =>
  (lm as unknown as { listeners: Array<() => void> }).listeners;

let savedRetry: typeof L10N_RETRY;
beforeEach(() => {
  languageManager.resetForTest();
  vi.unstubAllGlobals();
  savedRetry = { delaysMs: [...L10N_RETRY.delaysMs], healIntervalMs: L10N_RETRY.healIntervalMs, healMaxMs: L10N_RETRY.healMaxMs };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).document;
  delete (globalThis as Record<string, unknown>).window;
  L10N_RETRY.delaysMs = savedRetry.delaysMs;
  L10N_RETRY.healIntervalMs = savedRetry.healIntervalMs;
  L10N_RETRY.healMaxMs = savedRetry.healMaxMs;
});

describe('BJ631 件2·AudioGate 文案 heal 后重绘（BJ628 登记债）', () => {
  it('行为锁：门①深失败窗出兜底文案 → 自愈成功 emit → tip 重绘为包内文案（免刷新免点击）', async () => {
    L10N_RETRY.delaysMs = [5, 5, 5, 5, 5];
    L10N_RETRY.healIntervalMs = 20;
    L10N_RETRY.healMaxMs = 5000;
    const h = stubL10nFetch('fail');
    vi.stubGlobal('fetch', h);
    const dom = stubDom();
    expect(await languageManager.ensureReady('zh-Hans', 30)).toBe(false);   // 门①预算耗尽
    expect(languageManager.loaded).toBe(false);
    const baseListeners = listenersOf(languageManager).length;
    const resume = vi.fn(async () => true);
    const gate = showAudioGate(resume);
    expect(dom.tip).toBeTruthy();
    const before = dom.tip!.innerHTML;
    expect(before).toContain(CRITICAL_FALLBACK_ZH_EN.get('Mods.SandboxWorld.AudioGate.Line1')![0]); // 兜底文案窗
    expect(before).not.toContain('重绘锁文案甲');
    expect(listenersOf(languageManager).length).toBe(baseListeners + 1);     // onChange 订阅在位
    h.mockImplementation(async (input: RequestInfo | URL) => {
      const u = String(input instanceof Request ? input.url : input);
      if (u.includes('l10n/')) {
        if (u.endsWith('index.json')) return new Response(JSON.stringify([{ name: 'zh-Hans', legacyId: 7 }, { name: 'en-US', legacyId: 1 }]), { status: 200 });
        return new Response(JSON.stringify({ Mods: { 'SandboxWorld.AudioGate.Line1': '重绘锁文案甲', 'SandboxWorld.AudioGate.Line2': '重绘锁文案乙' } }), { status: 200 });
      }
      throw new TypeError(`unexpected ${u}`);
    });
    // 自愈路径（heal 循环续试）直达 loaded → emit → tip 重绘
    for (let i = 0; i < 200 && !languageManager.loaded; i++) await new Promise((r) => setTimeout(r, 20));
    expect(languageManager.loaded).toBe(true);
    const after = dom.tip!.innerHTML;
    expect(after).toContain('重绘锁文案甲');
    expect(after).toContain('<br>');
    expect(after).not.toBe(before);
    void gate;                                        // 门仍挂起待玩家放行（heal 不误放行）
    expect(resume).not.toHaveBeenCalled();
  }, 15000);

  it('放行退订：done 后 emit 不再重绘（监听器与门同生命周期——BJ328 自捕环预防）+ 手势锁/移除面不变', async () => {
    const h = stubL10nFetch('ok');
    vi.stubGlobal('fetch', h);
    const dom = stubDom();
    const baseListeners = listenersOf(languageManager).length;
    const resume = vi.fn(async () => true);
    void showAudioGate(resume);
    expect(listenersOf(languageManager).length).toBe(baseListeners + 1);
    expect(dom.added.get('pointerdown')).toBeTruthy();   // 手势监听不变（捕获态两路）
    expect(dom.added.get('keydown')).toBeTruthy();
    // loaded → emit → 重绘在位
    await languageManager.setLanguage('zh-Hans');
    expect(dom.tip!.innerHTML).toContain('重绘锁文案甲');
    const redrawn = dom.tip!.innerHTML;
    // 放行（真实手势等价物）
    (dom.added.get('pointerdown') as (e: Event) => void)({ isTrusted: true } as Event);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(listenersOf(languageManager).length).toBe(baseListeners);   // 退订在位
    expect(dom.removed.get('pointerdown')).toBeTruthy();               // 手势监听同帧摘除
    expect((dom.root as { _removed?: boolean })._removed).toBe(true);  // 黑幕移除
    // 二次语言广播（en-US）→ 无重绘（门已撤,订阅已拆）
    await languageManager.setLanguage('en-US');
    expect(dom.tip!.innerHTML).toBe(redrawn);
    expect(dom.tip!.innerHTML).not.toContain('redraw-lock copy A');
  });

  it('源锚：onChange 订阅+放行退订在位（TitleMenu 自愈消费面同习语）', () => {
    const s = readFileSync(join(GAME_ROOT, 'src/ui/AudioGate.ts'), 'utf8');
    expect(s).toContain('const offLangChange = Lang.onChange(renderTip);');
    expect(s).toContain('offLangChange();');
    expect(s).toContain("tip.innerHTML = `${Lang.text('Mods.SandboxWorld.AudioGate.Line1')}<br>${Lang.text('Mods.SandboxWorld.AudioGate.Line2')}`;");
  });
});
