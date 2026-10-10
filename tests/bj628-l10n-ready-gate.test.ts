// ★BJ628（2026-10-10,用户实报图 99）主菜单 l10n 键名直出竞态——三面锁：
//   ①复现锁：包 fetch 失败 → loaded=false → 非关键键裸显键名（截图机制本身,
//     LanguageManager.cs:446 原版缺失回退语义在 loaded 后保持不变）
//   ②修复锁：ensureReady 有界重试吸收瞬断（两次失败第三次成功 → loaded=true）+
//     预算耗尽放行不挂死 + 后台自愈循环（网络恢复 → emit → onChange 订阅面
//     免刷新自愈）+ 就绪前关键面内联兜底（用户令：不裸显键名）+ 兜底表对包
//     现值逐键漂移锁
//   ③装载链路锁（源锚）：main.ts 两处 init 已替换为 ensureReady 门,门②在
//     showTitle 之前；TitleMenu 保留 onChange→renderTexts 自愈消费面
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { languageManager, L10N_RETRY, CRITICAL_FALLBACK_ZH_EN } from '../src/i18n/LanguageManager';

const GAME_ROOT = join(import.meta.dirname, '..');

/** l10n fetch 注入：packFailLeft 次 l10n 请求 reject 后放行;index.json 恒成功。
 *  返回句柄可读调用数/翻面放行。Response 造 pack = { LegacyMenu: { '12': '单人模式' }, UI: { Play: '开始游戏' } } */
function stubL10nFetch(packFailLeft: number | null) {
  let l10nCalls = 0;
  let failLeft = packFailLeft;
  const PACK = JSON.stringify({ LegacyMenu: { '12': '单人模式', '131': '成就' }, UI: { Play: '开始游戏' } });
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input instanceof Request ? input.url : input);
    if (u.includes('l10n/')) {
      l10nCalls++;
      if (u.endsWith('index.json')) return new Response(JSON.stringify([{ name: 'zh-Hans', legacyId: 7 }]), { status: 200, headers: { 'content-type': 'application/json' } });
      if (failLeft === null || failLeft > 0) {
        if (failLeft !== null) failLeft--;
        throw new TypeError('BJ628 simulated flaky network');
      }
      return new Response(PACK, { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new TypeError(`BJ628 mock: unexpected fetch ${u}`);
  });
  vi.stubGlobal('fetch', mock);
  return {
    get calls() { return l10nCalls; },
    get failing() { return failLeft === null; },
    allowAll() { failLeft = 0; },
    failAll() { failLeft = null; },
    mock,
  };
}

let savedRetry: typeof L10N_RETRY;
beforeEach(() => {
  languageManager.resetForTest();
  vi.unstubAllGlobals();
  savedRetry = { delaysMs: [...L10N_RETRY.delaysMs], healIntervalMs: L10N_RETRY.healIntervalMs, healMaxMs: L10N_RETRY.healMaxMs };
});
afterEach(() => {
  vi.unstubAllGlobals();
  L10N_RETRY.delaysMs = savedRetry.delaysMs;
  L10N_RETRY.healIntervalMs = savedRetry.healIntervalMs;
  L10N_RETRY.healMaxMs = savedRetry.healMaxMs;
});

describe('BJ628 ①复现锁:包 fetch 失败窗口的键名回退机制', () => {
  it('两次顺序 init 全失败（旧启动链形态）→ loaded=false → 非关键键裸显键名', async () => {
    const h = stubL10nFetch(null);   // 永久失败
    await languageManager.init('zh-Hans');           // main.ts:900 旧形态
    await languageManager.init('zh-Hans');           // main.ts:1039 旧形态
    expect(h.calls).toBe(3);                         // 首轮 index+pack;次轮 loadIndex 短路(cultures 已缓存)仅 pack
    expect(languageManager.loaded).toBe(false);
    // 机制本体：缺失键回退键名（截图「LegacyMenu.12」直出的根;LanguageManager.cs:446）
    expect(languageManager.getTextValue('UI.Play')).toBe('UI.Play');
  });
});

describe('BJ628 ②修复锁:ensureReady 就绪门', () => {
  it('两次瞬断第三次成功（用户实报窗）→ 预算内重试到 loaded=true', async () => {
    L10N_RETRY.delaysMs = [5, 5, 5, 5, 5];
    stubL10nFetch(2);                                // 前 2 次 pack fetch 失败
    const ok = await languageManager.ensureReady('zh-Hans', 4000);
    expect(ok).toBe(true);
    expect(languageManager.loaded).toBe(true);
    expect(languageManager.getTextValue('LegacyMenu.12')).toBe('单人模式');
  });

  it('健康启动幂等零开销：loaded 已真 → 即时 true 不再 fetch', async () => {
    const h = stubL10nFetch(0);
    expect(await languageManager.ensureReady('zh-Hans')).toBe(true);
    const n = h.calls;
    expect(await languageManager.ensureReady('zh-Hans')).toBe(true);
    expect(h.calls).toBe(n);
  });

  it('永久失败 → 预算耗尽放行 false（不挂死启动）,非关键键仍裸键名', async () => {
    L10N_RETRY.delaysMs = [5, 5, 5, 5, 5];
    const h = stubL10nFetch(null);
    const t0 = Date.now();
    const ok = await languageManager.ensureReady('zh-Hans', 80);
    expect(Date.now() - t0).toBeLessThan(3000);      // 放行,不永久卡
    expect(ok).toBe(false);
    expect(languageManager.loaded).toBe(false);
    expect(languageManager.getTextValue('UI.Play')).toBe('UI.Play');
    void h;
  });

  it('后台自愈:放行后网络恢复 → 低频续试成功 → loaded+onChange 广播+自愈停', async () => {
    L10N_RETRY.delaysMs = [5, 5, 5, 5, 5];
    L10N_RETRY.healIntervalMs = 20;
    L10N_RETRY.healMaxMs = 5000;
    const h = stubL10nFetch(null);
    expect(await languageManager.ensureReady('zh-Hans', 40)).toBe(false);
    let onChangeFired = 0;
    languageManager.onChange(() => { onChangeFired++; });
    h.allowAll();                                    // 网络恢复（探针放行等价物）
    for (let i = 0; i < 100 && !languageManager.loaded; i++) await new Promise((r) => setTimeout(r, 20));
    expect(languageManager.loaded).toBe(true);       // 自愈成功,免刷新
    expect(onChangeFired).toBeGreaterThanOrEqual(1); // 订阅面重渲染信号
    const n = h.calls;
    await new Promise((r) => setTimeout(r, 80));     // 一个以上自愈周期
    expect(h.calls).toBe(n);                         // 成功即停,无定时器泄漏
  });

  it('自愈封顶:healMaxMs 到时停手（死网不永久空转）', async () => {
    L10N_RETRY.delaysMs = [5, 5, 5, 5, 5];
    L10N_RETRY.healIntervalMs = 10;
    L10N_RETRY.healMaxMs = 60;
    const h = stubL10nFetch(null);
    expect(await languageManager.ensureReady('zh-Hans', 30)).toBe(false);
    await new Promise((r) => setTimeout(r, 250));    // > healMaxMs
    expect(languageManager.loaded).toBe(false);
    const n = h.calls;
    await new Promise((r) => setTimeout(r, 120));    // 数个自愈周期
    expect(h.calls).toBe(n);                          // 已停手,无定时器泄漏
  });
});

describe('BJ628 ②b 就绪前关键面内联兜底（用户令:不裸显键名）', () => {
  it('!loaded → 截图键族出本地文案（zh 系按 pendingLang 取 zh）', async () => {
    stubL10nFetch(null);
    await languageManager.setLanguage('zh-Hans');    // 失败,但 pendingLang 已记
    expect(languageManager.loaded).toBe(false);
    expect(languageManager.getText('LegacyMenu.12')).toBe('单人模式');
    expect(languageManager.getText('Mods.SandboxWorld.Menu.Mods')).toBe('模组');
    expect(languageManager.getText('Mods.SandboxWorld.Menu.BuyTerraria')).toBe('购买原版');
    expect(languageManager.getText('Mods.SandboxWorld.Title.RemakeBaseline')).toBe('复刻版本基准 1.4.5.8');
  });

  it('!loaded 非 zh 目标 → 桥接英文;{0} 位置参数链不受影响', async () => {
    stubL10nFetch(null);
    await languageManager.setLanguage('en-US');
    expect(languageManager.getText('LegacyMenu.12')).toBe('Single Player');
    expect(languageManager.getTextValue('Mods.SandboxWorld.Credits.Line1', 'A', 'B')).toBe('Co-created by A and B');
    expect(languageManager.getTextValue('Mods.SandboxWorld.AssetDl.Loading', '42%')).toBe('Loading resources · 42%');
  });

  it('loaded 后缺键回退键名不变（原版 LanguageManager.cs:446 语义,兜底不掩盖真缺译）', async () => {
    stubL10nFetch(0);
    await languageManager.ensureReady('zh-Hans');
    expect(languageManager.loaded).toBe(true);
    expect(languageManager.getText('UI.NotExist')).toBe('UI.NotExist');
  });

  it('漂移锁:兜底表 15 键与 public/l10n 包现值逐键全等（zh+en）', () => {
    const zh = JSON.parse(readFileSync(join(GAME_ROOT, 'public/l10n/zh-Hans.json'), 'utf8')) as Record<string, Record<string, string>>;
    const en = JSON.parse(readFileSync(join(GAME_ROOT, 'public/l10n/en-US.json'), 'utf8')) as Record<string, Record<string, string>>;
    expect(CRITICAL_FALLBACK_ZH_EN.size).toBeGreaterThanOrEqual(15);
    for (const [key, [fbZh, fbEn]] of CRITICAL_FALLBACK_ZH_EN) {
      const [cat, k] = [key.slice(0, key.indexOf('.')), key.slice(key.indexOf('.') + 1)];
      expect(zh[cat]?.[k], `zh ${key}`).toBe(fbZh);
      expect(en[cat]?.[k], `en ${key}`).toBe(fbEn);
    }
  });
});

describe('BJ628 ③装载链路锁（源锚）', () => {
  const read = (p: string) => readFileSync(join(GAME_ROOT, p), 'utf8');

  it('main.ts：两处 init 已替换为 ensureReady 门,门②在 showTitle 之前', () => {
    const s = read('src/main.ts');
    expect(s).not.toMatch(/await Lang\.init\(/);                 // 旧裸 init 全数收编
    const gates = [...s.matchAll(/Lang\.ensureReady\(options\.data\.lang/g)];
    expect(gates.length).toBe(2);                                // 门①短预算 + 门②全预算
    const gate2 = s.indexOf('await Promise.all([UIFont.load(), Lang.ensureReady(options.data.lang)]');
    const showTitle = s.indexOf('flow.showTitle(true)');
    expect(gate2).toBeGreaterThan(-1);
    expect(showTitle).toBeGreaterThan(gate2);                    // 菜单装配在就绪门之后
  });

  it('自愈消费面在位:TitleMenu onChange→renderTexts;管理器收口 stopSelfHeal', () => {
    expect(read('src/ui/TitleMenu.ts')).toContain('Lang.onChange(() => this.renderTexts())');
    const lm = read('src/i18n/LanguageManager.ts');
    expect(lm).toMatch(/this\.loaded = true;\s*\n\s*this\.warned\.clear\(\);\s*\n\s*this\.stopSelfHeal\(\)/);  // 成功即收
    expect(lm).toMatch(/resetForTest\(\)[\s\S]*?this\.stopSelfHeal\(\)/);                                       // 测试复位拆定时器
    // ensureReady 与 init 同形装载 cultures 面(Settings 语言清单)——首发版漏此行
    // 被探针 fetches=1 实抓(index.json 永不被 ensureReady 路径请求)
    const er = lm.slice(lm.indexOf('async ensureReady'), lm.indexOf('startSelfHeal(lang'));
    expect(er).toContain('await this.loadIndex()');
    expect(er.indexOf('await this.loadIndex()')).toBeLessThan(er.indexOf('setLanguage'));
  });
});
