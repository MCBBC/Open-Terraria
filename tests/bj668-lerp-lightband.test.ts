// ★BJ668 Lerp 族光感算子（通道级一刀,批 3）判别测试。定谳（亲读 1457 反编译）：
//  原版 GetAlpha lerp 族（lerp/lerpkeep/lerpalphain 全 kind）返回
//  `Color.Lerp(newColor, White, k)`（Color.Lerp 含 A 通道,light.A=255 → A 侧不变;
//  各支结构锚=:80617 920/921/926 k0.4×Opacity / :80734 180/345 k0.75 / :80777
//  833-835/912 k0.25 / :80790 346/347/325/755 k0.75 / :80688 75 k0.66×Opacity /
//  :80880 585 k0.5 A 保留 / :80738 586 k0.75 / :80822 342 k0.75×Opacity /
//  :80937 518/595/735 k0.85 A=128×(1−α/255) / :81038 664/666/668 k0.5→(·,200)×Opacity /
//  :81075 691-693 k0.4×(1−α/255) / :81079 646-649 k0.8×(1−α/255) / :81256 712
//  k0.4×Opacity / :81127 352 k0.5 A×(α/255) / :81133 435/732/731 k0.8→(·,25) /
//  :81138 682 k0.8→(·,127) / :81143 436 k0.8→(·,25))——像素 = tex×ga×C,
//  C = Lerp(light,White,k) = light×(1−k) + White×k（逐通道）。
//  【白抬升项 ×k 不乘光】——旧 lerpFilter（brightness 中灰归一+saturate）=静态亮度
//  滤镜 → 抬升项被 compositeLight 乘光:暗场抬升归零（BJ529 病根同族）+亮场中灰归一
//  过亮（f=1+0.992k）双偏离。修=两遍制代数分解恒等:实体层基底 ×(1−k)
//  （filter brightness(1−k)=W3C 纯线性乘,乘光同相）+ projFullbrightQueue 'lighter'
//  光照后 ×k 复绘（replayLerpLift,251/465 capture 判例通用化,kind 驱动零 id 专支）:
//    base×light + lift ≡ tex×ga×[(1−k)·light + k]（恒等式数学面=W3C 算子式:
//    brightness(f)=feComponentTransfer linear slope=f;plus-lighter=预乘加算 Co=Cs+Cb）。
//  活跃面普查（三源 join,表头注 BJ668 块）:活跃 11=342/435/595/664/666/668/712/735/
//  920/921/926;休眠 21=无出生面 10+载体专类 6（586/646-649/691-693/833）+GA 截走
//  1（732）+k0 直通 1（1090 off）;charm 分流=:80605-80611 White×Opacity 先截走。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Arrow, setProjSpriteOverride, replayLerpLift } from '../src/entities/Arrow';
import { PROJ_ALPHA_MOD, projLerpLiftK, PROJ_LERP_LIFT_KINDS } from '../src/data/vanillaProjAlpha';
import { withMutation } from './mutation-guard';

const GAME_ROOT = join(__dirname, '..');

type Rec = { op: string; args?: unknown[] };
type Recs = Rec[];

/** 记录式 ctx（无 DOM;Proxy 记录器——方法调用与状态写面【全部】按序入 recs,格式
 *  与 createRecBodyCtx 流同构（set:prop 记法）→ 基底 commit 重放落本 ctx 时状态
 *  写面亦被捕获=实体层流可逐 op 断言。状态读面从记录态取（xeno baseGa 读回同相）。 */
function recordingCtx() {
  const recs: Recs = [];
  const state: Record<string, unknown> = {
    globalAlpha: 1, globalCompositeOperation: 'source-over', filter: 'none', imageSmoothingEnabled: false,
  };
  const target: Record<string, unknown> = {
    canvas: { width: 800, height: 600 },
    save() { recs.push({ op: 'save' }); },
    restore() { recs.push({ op: 'restore' }); },
    translate(...a: unknown[]) { recs.push({ op: 'translate', args: a }); },
    rotate(...a: unknown[]) { recs.push({ op: 'rotate', args: a }); },
    scale(...a: unknown[]) { recs.push({ op: 'scale', args: a }); },
    drawImage(...a: unknown[]) { recs.push({ op: 'drawImage', args: a }); },
    beginPath() { recs.push({ op: 'beginPath' }); },
    arc(...a: unknown[]) { recs.push({ op: 'arc', args: a }); },
    fill() { recs.push({ op: 'fill' }); },
    fillRect(...a: unknown[]) { recs.push({ op: 'fillRect', args: a }); },
  };
  const ctx = new Proxy(target, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop in state) return state[prop];
      const v = target[prop];
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
    set(_t, prop, v) {
      if (typeof prop === 'string' && prop in state) {
        state[prop] = v;
        recs.push({ op: `set:${prop}`, args: [v] });
        return true;
      }
      (target as Record<string | symbol, unknown>)[prop] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, recs, state };
}

const setOps = (recs: Recs, prop: string): unknown[] =>
  recs.filter((r) => r.op === `set:${prop}`).map((r) => r.args![0]);

/** node 无 DOM:多帧 id（435=4/920=3/595·735=28/712=8 帧 projFrameImg）与 charm
 *  白帧烘焙（whiteSpriteOf）打桩（arrow-fx-audit 同款习语） */
beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ imageSmoothingEnabled: false, drawImage: () => {}, fillRect: () => {}, fillStyle: '#fff' }),
    }),
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** 基底流权重提取：逐 drawImage 的 (ga, brightness 乘子)——software 像素模型输入。
 *  brightness(f)=W3C feComponentTransfer linear slope=f（纯线性乘,sRGB 不透明 texel
 *  域预乘≡直通——本仓既有 drawXenoFilter/lerpFilter 同一算子语义） */
function baseWeights(recs: Recs): Array<{ ga: number; mult: number }> {
  let ga = 1;
  let mult = 1;
  const out: Array<{ ga: number; mult: number }> = [];
  for (const r of recs) {
    if (r.op === 'set:globalAlpha') ga = Number(r.args![0]);
    else if (r.op === 'set:filter') {
      const m = /^brightness\(([\d.]+)\)$/.exec(String(r.args![0]));
      mult = m ? Number(m[1]) : 1;
    } else if (r.op === 'drawImage') out.push({ ga, mult });
  }
  return out;
}

function drawWithQueue(a: Arrow): { entityRecs: Recs; queued: Array<(c: CanvasRenderingContext2D) => void> } {
  const rc = recordingCtx();
  const queued: Array<(c: CanvasRenderingContext2D) => void> = [];
  a.draw({
    ctx: rc.ctx,
    queueProjFullbright: (fn: (c: CanvasRenderingContext2D) => void) => { queued.push(fn); },
  } as never, undefined as never);
  return { entityRecs: rc.recs, queued };
}

function mkArrow(pid: number, alpha = 0): Arrow {
  const a = new Arrow(80 * 16, 100 * 16, 14, 0, 35, 0, pid, { grav: 0, life: 300, pierce: 1 });
  (a as unknown as { alpha: number }).alpha = alpha;
  return a;
}

function tableAlpha(a: Arrow): { ga: number; filter: string | null } | null {
  return (a as unknown as { drawTableAlpha(): { ga: number; filter: string | null } | null }).drawTableAlpha();
}

// ============ ① 代数恒等式锁（暗场/亮场双档像素对拍:Lerp 真值 vs 两遍制） ============
describe('BJ668 ① 两遍制代数恒等（base×light+lift ≡ tex×ga×Lerp(light,White,k)）', () => {
  const GA0 = 0.7843;                       // 664 档 A=200/255（:81041）
  it('全参数域恒等:v∈{0..255}×L∈{0,0.325,0.6,1}×k∈表档全集——误差 ≤1e-9·255', () => {
    for (const k of [0.25, 0.4, 0.5, 0.66, 0.75, 0.8, 0.85]) {
      for (const L of [0, 0.325, 0.6, 1]) {
        for (const v of [0, 64, 128, 192, 255]) {
          const truth = v * GA0 * ((1 - k) * L + k);       // 原版:tex×ga×Lerp(light,White,k)
          const twoPass = v * GA0 * (1 - k) * L + v * GA0 * k;   // 两遍制:基底(乘光)+lift(不乘光)
          expect(Math.abs(twoPass - truth), `k=${k} L=${L} v=${v}`)
            .toBeLessThanOrEqual(1e-9 * 255);
        }
      }
    }
  });

  it('W3C 算子式锁:brightness(1−k) 串→线性乘子逐档精确（基底流 filter→mult 映射）', () => {
    for (const k of [0.25, 0.4, 0.5, 0.66, 0.75, 0.8, 0.85]) {
      const fk = `brightness(${Math.max(0, 1 - k).toFixed(3)})`;
      const parsed = /^brightness\(([\d.]+)\)$/.exec(fk)!;
      expect(Number(parsed[1])).toBeCloseTo(1 - k, 9);   // slope=1−k 纯线性乘（无截距）
    }
  });

  it('判别面:旧近似双偏离量化——暗场抬升被乘光归零（L=0:old=0 vs truth=ga·k·v>0）+ 亮场中灰归一过亮（L=1:old/truth=1+0.992k>1）', () => {
    for (const k of [0.5, 0.8]) {
      const fOld = 1 - k + (k * 255) / 128;               // 旧 lerpFilter 亮度因子
      // 暗带 L=0.325（BJ529 暗腔实测乘光系数）:旧值显著低于真值
      const L = 0.325;
      const v = 255;
      const oldDark = v * GA0 * fOld * L;
      const truth = v * GA0 * ((1 - k) * L + k);
      expect(truth - oldDark, `k=${k} 暗场欠亮须 >15% 真值`).toBeGreaterThan(truth * 0.15);
      // 全暗极限:旧式→0（发光整缺失）,两遍制→v·ga·k（抬升保留=可见度翻正）
      expect(v * GA0 * fOld * 0).toBe(0);
      expect(v * GA0 * ((1 - k) * 0 + k)).toBeGreaterThan(0);
      // 亮带 L=1:旧式过亮（中灰归一）,两遍制=真值
      const oldBright = v * GA0 * fOld * 1;
      expect(oldBright).toBeGreaterThan(v * GA0 * ((1 - k) * 1 + k) * 1.2);  // f=1.992k+1−k=1+0.992k ≥1.25
    }
  });
});

// ============ ② 活跃面逐型锁（真机 draw 路径:664/435/920/342 + lerpalphain 352 + charm） ============
const FAKE = { width: 8, height: 8 } as unknown as HTMLImageElement;

describe('BJ668 ② 活跃面逐型锁（664 DD2 烈焰塔弹:capture 双通道）', () => {
  beforeEach(() => { setProjSpriteOverride(664, FAKE); });
  afterEach(() => { setProjSpriteOverride(664, { width: 0, height: 0 } as unknown as HTMLImageElement); });

  it('表身份+门:664 kind=lerp k=0.5 非 off;lerpLiftGate=0.5;projLerpLiftK 单源', () => {
    const m = PROJ_ALPHA_MOD[664];
    expect(m.kind).toBe('lerp');
    expect(m.k).toBe(0.5);
    expect(m.off).toBeUndefined();
    expect(projLerpLiftK(664)).toBe(0.5);
  });

  it('基底流:实体层恰 1 笔 drawImage,filter=brightness(0.500)（×(1−k) 在流内=乘光同相）,ga=0.7843（α=0 fade 档）', () => {
    const { entityRecs, queued } = drawWithQueue(mkArrow(664));
    expect(entityRecs.filter((r) => r.op === 'drawImage')).toHaveLength(1);
    expect(setOps(entityRecs, 'filter')).toEqual(['brightness(0.500)']);
    expect(setOps(entityRecs, 'globalAlpha')[0]).toBeCloseTo(0.7843, 9);
    expect(queued).toHaveLength(1);
  });

  it('lift 闭包:comp 恰 1 写=lighter、filter 恰 1 写=none、ga=0.7843×0.5、drawImage 1:1（几何零改）', () => {
    const { queued } = drawWithQueue(mkArrow(664));
    const rc = recordingCtx();
    queued[0](rc.ctx);
    expect(setOps(rc.recs, 'globalCompositeOperation')).toEqual(['lighter']);  // 整面预乘加算,无回切
    expect(setOps(rc.recs, 'filter')).toEqual(['none']);                       // 基底滤镜不压 lift 面
    expect(setOps(rc.recs, 'globalAlpha')).toEqual([0.7843 * 0.5]);            // 白抬升权重 ×k
    expect(rc.recs.filter((r) => r.op === 'drawImage')).toHaveLength(1);
  });

  it('端到端像素对拍（software 模型）:基底流实测权重×L + lift 实测权重 ≡ Σga·[(1−k)L+k] 双档', () => {
    const { entityRecs, queued } = drawWithQueue(mkArrow(664));
    const base = baseWeights(entityRecs);
    expect(base).toHaveLength(1);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    const lift = baseWeights(rc.recs);                        // lift 实测（recorder 流）
    expect(lift).toHaveLength(1);
    for (const L of [0, 0.325, 1]) {
      const k = 0.5;
      const ga0 = base[0].ga;
      const twoPass = base[0].ga * base[0].mult * L + lift[0].ga;      // 基底(乘光)+lift(加算)
      const truth = ga0 * ((1 - k) * L + k);                            // Lerp 真值权重
      expect(Math.abs(twoPass - truth), `L=${L}`).toBeLessThanOrEqual(1e-9);
    }
  });

  it('α 动态面:α=130 → 基底 ga=(125/255)·0.7843、lift ga=×0.5 同曲线（fade 折面零改）', () => {
    const { entityRecs, queued } = drawWithQueue(mkArrow(664, 130));
    const base = baseWeights(entityRecs);
    expect(base[0].ga).toBeCloseTo((125 / 255) * 0.7843, 9);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    const lift = baseWeights(rc.recs);
    expect(lift[0].ga).toBeCloseTo((125 / 255) * 0.7843 * 0.5, 9);
  });
});

describe('BJ668 ② 435 火星炮塔弹（k=0.8 mul=0.098 + XENO_GLOW 叠画 comp 舞蹈归一）', () => {
  beforeEach(() => { setProjSpriteOverride(435, FAKE); });
  afterEach(() => { setProjSpriteOverride(435, { width: 0, height: 0 } as unknown as HTMLImageElement); });

  it('基底流:2 笔 drawImage(本体+xeno 叠画)、filter=brightness(0.200)、叠画 ga=本体×0.45', () => {
    const { entityRecs } = drawWithQueue(mkArrow(435));
    const base = baseWeights(entityRecs);
    expect(base).toHaveLength(2);
    expect(base[0].mult).toBeCloseTo(0.2, 9);            // brightness(1−0.8)
    expect(base[1].ga).toBeCloseTo(base[0].ga * 0.45, 9); // xeno 叠画 baseGa 舞蹈
  });

  it('lift 闭包:流内 comp 舞蹈（lighter↔source-over）归一——comp 写面恰 [lighter],双笔 ga 同倍 ×k', () => {
    const { entityRecs, queued } = drawWithQueue(mkArrow(435));
    // 流内确有 comp 舞蹈（叠画 lighter→回 source-over）
    const compOps = setOps(entityRecs, 'globalCompositeOperation');
    expect(compOps.length).toBeGreaterThanOrEqual(2);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    expect(setOps(rc.recs, 'globalCompositeOperation')).toEqual(['lighter']);  // 舞蹈剔除,整面单写加算
    const lift = baseWeights(rc.recs);
    expect(lift).toHaveLength(2);
    expect(lift[0].ga).toBeCloseTo(0.098 * 0.8, 9);        // main:ga×k
    expect(lift[1].ga).toBeCloseTo(0.098 * 0.45 * 0.8, 9); // overlay:同倍缩放零漂
  });

  it('端到端像素对拍（叠画权重 Σw=[1,0.45] 同倍缩放）:base×L+lift ≡ Σga_i·[(1−k)L+k]', () => {
    const { entityRecs, queued } = drawWithQueue(mkArrow(435));
    const base = baseWeights(entityRecs);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    const lift = baseWeights(rc.recs);
    const k = 0.8;
    const sumBase = base.reduce((s, b) => s + b.ga * b.mult, 0);
    const sumLift = lift.reduce((s, b) => s + b.ga * b.mult, 0);
    const gaSum = base.reduce((s, b) => s + b.ga, 0);
    for (const L of [0, 0.325, 1]) {
      expect(Math.abs(sumBase * L + sumLift - gaSum * ((1 - k) * L + k))).toBeLessThanOrEqual(1e-9);
    }
  });
});

describe('BJ668 ② 920/342 普档 + 352 lerpalphain alpha 面反相 + charm 分流', () => {
  beforeEach(() => {
    setProjSpriteOverride(920, FAKE);
    setProjSpriteOverride(342, FAKE);
    setProjSpriteOverride(352, FAKE);
  });
  afterEach(() => {
    for (const id of [920, 342, 352]) setProjSpriteOverride(id, { width: 0, height: 0 } as unknown as HTMLImageElement);
  });

  it('920（k=0.4）:基底 brightness(0.600)+lift ×0.4;342（k=0.75）:基底 brightness(0.250)+lift ×0.75', () => {
    for (const [pid, k] of [[920, 0.4], [342, 0.75]] as const) {
      const { entityRecs, queued } = drawWithQueue(mkArrow(pid));
      const base = baseWeights(entityRecs);
      expect(base[0].mult, `${pid} 基底乘子`).toBeCloseTo(1 - k, 9);
      const rc = recordingCtx();
      queued[0](rc.ctx);
      const lift = baseWeights(rc.recs);
      expect(lift[0].ga, `${pid} lift 权重`).toBeCloseTo(base[0].ga * k, 9);
    }
  });

  it('352 lerpalphain alpha 面差异定谳:A=α/255 随 α 递增（:81127-81131,与 lerp fade 反相）;两遍制分解同算子', () => {
    const m = PROJ_ALPHA_MOD[352];
    expect(m.kind).toBe('lerpalphain');
    expect(m.k).toBe(0.5);
    const aLow = tableAlpha(mkArrow(352, 50))!;
    const aHigh = tableAlpha(mkArrow(352, 200))!;
    expect(aLow.ga).toBeCloseTo(50 / 255, 9);
    expect(aHigh.ga).toBeCloseTo(200 / 255, 9);
    expect(aHigh.ga).toBeGreaterThan(aLow.ga);           // 递增（lerp 族=fade 递减,反相）
    const { entityRecs, queued } = drawWithQueue(mkArrow(352, 128));
    const base = baseWeights(entityRecs);
    expect(base[0].mult).toBeCloseTo(0.5, 9);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    const lift = baseWeights(rc.recs);
    expect(lift[0].ga).toBeCloseTo((128 / 255) * 0.5, 9);
    expect(queued).toHaveLength(1);
  });

  it('charm 分流（:80605 White×Opacity 先截走）:drawTableAlpha={ga:fade,filter:null}、基底流零 filter 写、零入队', () => {
    const a = mkArrow(920);
    (a as unknown as { phoenixQuivered: boolean }).phoenixQuivered = true;
    const got = tableAlpha(a);
    expect(got).toEqual({ ga: 1, filter: null });        // α=0 → fade=1,White 恒等无滤镜
    const { entityRecs, queued } = drawWithQueue(a);
    expect(setOps(entityRecs, 'filter')).toEqual([]);    // 基底流零滤镜写
    expect(queued).toHaveLength(0);                      // 无 k 语义=不进通道
    // 白帧路径仍在（charm→whiteSpriteOf 本体段承接,非本批改动面——结构存在性锁）
    const src = readFileSync(join(GAME_ROOT, 'src/entities/Arrow.ts'), 'utf8');
    expect(src).toContain('whiteSpriteOf(this.projId');
  });
});

// ============ ③ 休眠面登记锁（普查机制化+登记注在位） ============
describe('BJ668 ③ 普查机制锁:42 项/活跃 11/休眠登记/732 GA 截走/表数据零改动', () => {
  it('census:lerp 族 42 项（非 off 32+off 10）;300 全表锁维持;表 k/mul/kind 数据面零改动', () => {
    const entries = Object.entries(PROJ_ALPHA_MOD)
      .filter(([, m]) => PROJ_LERP_LIFT_KINDS.has(m.kind));
    expect(entries.length).toBe(42);
    expect(entries.filter(([, m]) => !m.off).length).toBe(32);
    expect(entries.filter(([, m]) => m.off).length).toBe(10);
    expect(Object.keys(PROJ_ALPHA_MOD).length).toBe(300);
    // 活跃 11 站 k 钉值（表驱动单源,通用算子零专支）
    const K_ACTIVE: Record<number, number> = {
      342: 0.75, 435: 0.8, 595: 0.85, 664: 0.5, 666: 0.5, 668: 0.5,
      712: 0.4, 735: 0.85, 920: 0.4, 921: 0.4, 926: 0.4,
    };
    for (const [id, k] of Object.entries(K_ACTIVE)) {
      expect(projLerpLiftK(Number(id)), `id=${id}`).toBe(k);
    }
  });

  it('休眠面:off 10 项全 null;载体专类/GA 截走/k0 直通各档 null 或门闭', () => {
    for (const id of [350, 351, 446, 503, 714, 755, 834, 835, 912, 1090]) {
      expect(projLerpLiftK(id), `off id=${id}`).toBeNull();
    }
    // 732:表档 k=0.8 非 off（:81133 同支）,但 GA case 131/732 截走 → 门闭（防双消费）
    expect(projLerpLiftK(732)).toBe(0.8);
    const a732 = mkArrow(732);
    const gate = (a732 as unknown as { lerpLiftGate(): number | null }).lerpLiftGate();
    expect(gate).toBeNull();
    // 载体专类（586/646-649/691-693/833）表档 k 在位（通用算子自动覆盖,出生面接入即点亮）
    for (const [id, k] of [[586, 0.75], [646, 0.8], [691, 0.4], [833, 0.25]] as const) {
      expect(projLerpLiftK(id), `dormant id=${id}`).toBe(k);
    }
  });

  it('登记注在位:BJ668 头注块（代数恒等/活跃 11/休眠 21/新发现债 731·730·Dart.whiteLerp）', () => {
    const src = readFileSync(join(GAME_ROOT, 'src/data/vanillaProjAlpha.ts'), 'utf8');
    expect(src).toContain('★BJ668 Lerp 族光感算子');
    expect(src).toContain('活跃 11');
    expect(src).toContain('休眠 21');
    expect(src).toContain('★新发现债');
    expect(src).toContain('ThunderBoltShot');
    expect(src).toContain('Dart.whiteLerp');
    expect(src).toContain('GA 截走 1=732');
  });
});

// ============ ④ 通用算子结构锁（replayLerpLift 变换规则+kind 驱动零专支） ============
describe('BJ668 ④ 通用算子结构锁', () => {
  it('replayLerpLift 变换规则（合成流）:comp/filter 写剔除+强制单写、ga 逐值 ×k、其余逐位重放', () => {
    const rec: Recs = [
      { op: 'save', args: [] },
      { op: 'set:globalAlpha', args: [0.8] },
      { op: 'set:filter', args: ['brightness(0.500)'] },
      { op: 'set:globalCompositeOperation', args: ['source-over'] },
      { op: 'drawImage', args: [FAKE, 0, 0] },
      { op: 'set:globalAlpha', args: [0.36] },
      { op: 'set:globalCompositeOperation', args: ['lighter'] },
      { op: 'drawImage', args: [FAKE, 1, 1] },
      { op: 'restore', args: [] },
    ];
    const rc = recordingCtx();
    replayLerpLift(rec as never, rc.ctx, 0.5);
    expect(setOps(rc.recs, 'globalCompositeOperation')).toEqual(['lighter']);
    expect(setOps(rc.recs, 'filter')).toEqual(['none']);
    expect(setOps(rc.recs, 'globalAlpha')).toEqual([0.4, 0.18]);      // 逐值 ×k
    expect(rc.recs.filter((r) => r.op === 'drawImage').map((r) => r.args!.slice(1)))
      .toEqual([[0, 0], [1, 1]]);                                     // 几何逐位重放
    expect(rc.recs.filter((r) => r.op === 'save').length).toBeGreaterThanOrEqual(1);
    expect(rc.recs.filter((r) => r.op === 'restore').length).toBeGreaterThanOrEqual(1);
  });

  it('lerpLiftGate 零 id 专支（kind 驱动结构锁:门体无数字 id 字面量）', () => {
    const src = readFileSync(join(GAME_ROOT, 'src/entities/Arrow.ts'), 'utf8');
    const i = src.indexOf('private lerpLiftGate');
    expect(i).toBeGreaterThan(0);
    const body = src.slice(i, src.indexOf('\n  }', i));
    expect(body).toContain('projLerpLiftK');
    expect(body).toContain('phoenixQuivered');
    expect(/\bcase\s+\d+/.test(body)).toBe(false);                    // 无 switch id 专支
    expect(/===\s*\d{2,4}/.test(body)).toBe(false);                   // 无 === id 比较
  });
});

// ============================ 变异自证（≥3 发,恰红 + 逐字节还原 + sha256 对拍） ============================

describe.skipIf(process.env.SW_BJ668_MUT)('BJ668 变异自证（恰红）', () => {
  const ARROW = join(GAME_ROOT, 'src/entities/Arrow.ts');
  const TABLE = join(GAME_ROOT, 'src/data/vanillaProjAlpha.ts');
  const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

  const mutate = (file: string, trigger: string, replacement: string, filter: string, target: string) => {
    const pristineSha = sha(file);
    withMutation(file, trigger, replacement, () => {
      const r = spawnSync('npx',
        ['vitest', 'run', 'tests/bj668-lerp-lightband.test.ts', '--no-file-parallelism', '-t', filter],
        { cwd: process.cwd(), encoding: 'utf8', timeout: 600_000, env: { ...process.env, SW_BJ668_MUT: '1' } });
      expect(r.status, `变异须证红（${target}）: ${replacement}\n${r.stdout.slice(-3000)}`).not.toBe(0);
      expect(r.stdout).toContain(filter);
    }, { label: `BJ668 ${filter}` });
    expect(sha(file), `还原后 sha256 对拍不一致: ${file}`).toBe(pristineSha);
  };

  it('M1 件④:lift 复绘 lighter→source-over（加算面缺失=恒等式右半边塌）→ ④ 锁红', () => {
    mutate(ARROW,
      "c.globalCompositeOperation = 'lighter';\n  c.filter = 'none';",
      "c.globalCompositeOperation = 'source-over';\n  c.filter = 'none'; /* ★BJ668 M1 变异 */",
      'BJ668 ④',
      'lift 加算复绘');
  });

  it('M2 件①/②:基底滤镜退役（brightness(1−k)→none,过亮病复发）→ ② 锁红', () => {
    mutate(ARROW,
      'const lerpFilter = (k: number): string => `brightness(${Math.max(0, 1 - k).toFixed(3)})`;',
      "const lerpFilter = (_k: number): string => 'none'; /* ★BJ668 M2 变异 */",
      'BJ668 ②',
      '基底 ×(1−k) 滤镜');
  });

  it('M3 件①/②/③:lift 门全闭（projLerpLiftK 恒 null,暗场抬升归零复发）→ ③ 锁红', () => {
    mutate(TABLE,
      'return k > 0.001 ? k : null;',
      'return null; /* ★BJ668 M3 变异 */',
      'BJ668 ③',
      'lift 门单源');
  });

  it('M4 件②:charm 分流摘除（White×Opacity 面被 lerp 滤镜污染）→ ② 锁红', () => {
    mutate(ARROW,
      'return this.phoenixQuivered || this.seraphNecklaced\n          ? { ga: fade, filter: null }\n          : { ga: fade * (m.mul ?? 1), filter: lerpFilter(m.k ?? 1) };',
      'return { ga: fade * (m.mul ?? 1), filter: lerpFilter(m.k ?? 1) }; /* ★BJ668 M4 变异 */',
      'BJ668 ②',
      'charm 分流');
  });
});
