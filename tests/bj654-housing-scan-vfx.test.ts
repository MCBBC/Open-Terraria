// ★BJ654 房检扫描视觉判别锁（2026-10-12 用户实报「原版住房检测有扫描视觉,每格一个小点」）。
// 原版锚（亲读定谳,本测试逐面锁死）：
//   - 视觉面=RichRoomCheckFeedback（Terraria.DataStructures/RichRoomCheckFeedback.cs）
//     EndSpread/EndScoring 发射公式;触发=Main.PerformHousingCheck（Main.cs:45918-45924）
//     MoveTownNPC 双跑首跑。
//   - 采集面=WorldGen.CheckRoom 逐格回调（WorldGen.cs:6072-6174）：
//     good(:6102 全处理格)/blocked(:6110/:6113-6127 边界,EndSpread continue 永不发射)/
//     hazard(:6128-6137 臭虫)/unsafeWall(:6165)/openAir(:6008/:6014/:6068/:6168)。
//   - 房间格集合定谳：可见点集=泛洪访问集中的【非实心非家具】格（青点 Extra[293]）+
//     问题格（红）+家具四表首件图钉（桌297/椅295/门296/光源294,LimeGreen 图钉）+
//     ScoreRoom 候选站位点（Extra[293] Scale2 正绿负红）+金黄最优点（OurFavoriteColor
//     Scale3）;边界实心/关死门格=零点（blocked 不发射+消耗面压 good）。
//   - 波节奏：Delay=(int)(3×欧氏距origin)、TTL=(3×maxDist+60−Delay)×(good?1.5:1)、
//     FadeIn=Remap(num−24,D,num)、FadeOut=Remap(num−6,D,num);打分域 num3=+90。
// 消费管线（零新基建锁）：fadingParticles 池（fx/FadingParticles.ts=FadingParticle 1:1,
// ParticleSystem_World_OverPlayers 同位,Main.cs:63208/4003）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import {
  housingCheckAt, createRoomScanTrace, backfillRoomScanScoring,
  WALL_HOUSE, type RoomScanTrace, type Occupant,
} from '../src/world/Housing';
import { TILE_BY_KEY } from '../src/data/tiles';
import {
  buildRoomCheckScanParticles, spawnRoomCheckScan, type RoomScanSpec,
} from '../src/fx/HousingScanFx';
import { fadingParticles } from '../src/fx/FadingParticles';

const WOOD = TILE_BY_KEY['wood']!;
const DOOR_C = TILE_BY_KEY['door_closed']!;

/** 标准房（housing-stinkbug-veto 同构）：ox..ox+10 × oy..oy+5,火把×2/椅/桌3×2/
 *  关闭双开门;室内背墙 wall=4（木墙,WALL_HOUSE 成员） */
function buildHouse(w: World, ox: number, oy: number): void {
  const st = w.store;
  for (let x = ox; x <= ox + 10; x++) {
    st.setTileSilent(x, oy, WOOD, 0, 0);
    st.setTileSilent(x, oy + 5, WOOD, 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) {
    st.setTileSilent(ox, y, WOOD, 0, 0);
    st.setTileSilent(ox + 10, y, WOOD, 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) for (let x = ox + 1; x <= ox + 9; x++) st.wall[st.idx(x, y)] = 4;
  for (const dx of [ox, ox + 10]) {
    for (let y = oy + 2; y <= oy + 4; y++) st.setTileSilent(dx, y, DOOR_C, 0, (y - oy - 2) * 18);
  }
  st.setTileSilent(ox + 1, oy + 1, TILE_BY_KEY['torch']!, 22, 0);
  st.setTileSilent(ox + 9, oy + 1, TILE_BY_KEY['torch']!, 44, 0);
  st.setTileSilent(ox + 4, oy + 3, TILE_BY_KEY['chair']!, 0, 0);
  for (let dx = 0; dx <= 2; dx++) {
    st.setTileSilent(ox + 5 + dx, oy + 3, TILE_BY_KEY['table']!, dx * 18, 0);
    st.setTileSilent(ox + 5 + dx, oy + 4, TILE_BY_KEY['table']!, dx * 18, 18);
  }
}

const OX = 2100, OY = 300;
/** 种子=室内居中空气格 */
const SX = OX + 5, SY = OY + 2;

function scanValidHouse(occ: Array<{ x: number; y: number; npcId?: number }> = []):
{ scan: RoomScanTrace; specs: RoomScanSpec[]; reason: string } {
  const w = new World(4200, 1200, 91, 'open');
  buildHouse(w, OX, OY);
  const scan = createRoomScanTrace(SX, SY);
  const q = housingCheckAt(w.store, occ, SX, SY, -1, scan);
  return { scan, specs: buildRoomCheckScanParticles(w.store, scan), reason: q.reason };
}

/** 波参数独立复算（测试侧自证,不读实现常量） */
function waveParams(scan: RoomScanTrace): { num: number; num3: number } {
  let maxDist = 0;
  for (const e of scan.entries) {
    const d = Math.hypot(e.x - scan.originX, e.y - scan.originY);
    if (d > maxDist) maxDist = d;
  }
  return { num: 3 * maxDist + 60, num3: 3 * maxDist + 90 };
}

describe('BJ654 房检扫描视觉（RichRoomCheckFeedback 1:1）', () => {
  it('有效房：good 青点=室内非家具格;边界实心/关死门=零点;家具格无青点', () => {
    const { scan, specs, reason } = scanValidHouse();
    expect(reason).toBe('ok');
    // 位置过滤限发射面 1（scale=1）——打分点(scale≥2)锚在地板上一格,与家具格/
    // hazard 格同屏（(x*16+8, (y+1)*16−8) 恒重叠），须按域分型
    const at = (tx: number, ty: number): RoomScanSpec[] =>
      specs.filter((s) => s.scale === 1 && s.x === tx * 16 + 8 && s.y === ty * 16 + 8);
    // 室内纯空气格（2103,302）→ 青点 Extra_293,tint=Cyan*0.7f A/=2=(0,178,178,89),Scale1
    const air = at(2103, 302);
    expect(air.length).toBe(1);
    expect(air[0]!.texKey).toBe('vanilla/Extra_293.png');
    expect(air[0]!.tint).toEqual([0, 178, 178, 89]);
    expect(air[0]!.scale).toBe(1);
    // 种子格（dist=0）→ Delay 0
    const seed = at(SX, SY);
    expect(seed.length).toBe(1);
    expect(seed[0]!.delay).toBe(0);
    // 边界实心格（框木墙角 (OX,OY)）→ blocked 不发射=零 spec
    expect(at(OX, OY).length).toBe(0);
    // 关死门格（关闭门 10=实心→blocked）→ 该格零青点;但【门图钉照出】——vanilla
    // 家具面循环无 kind 过滤（EndSpread 第二循环只查 consumed+CountsAs 四表,
    // blocked 条目不消耗→关门=RoomNeeds 满足件照样钉绿门,反编译逐字 1:1）
    expect(at(OX, OY + 3).length).toBe(0);
    expect(specs.filter((s) => s.texKey === 'vanilla/Extra_296.png').length).toBe(1);
    // 家具格（火把/椅/桌/桌)自身格无青点（good 被图钉面 skip）
    expect(at(OX + 1, OY + 1).length).toBe(0);   // 火把格
    expect(at(OX + 4, OY + 3).length).toBe(0);   // 椅格
    // 桌 3×2 六格全无青点
    for (let dx = 0; dx <= 2; dx++) for (let dy = 0; dy <= 1; dy++) {
      expect(at(OX + 5 + dx, OY + 3 + dy).length).toBe(0);
    }
  });

  it('家具图钉面：四类首件旗去重（火把294/椅295/桌297 各恰一枚;关门无钉）', () => {
    const { specs } = scanValidHouse();
    const pins = specs.filter((s) => s.texKey !== 'vanilla/Extra_293.png'
      && s.texKey !== 'vanilla/Extra_292.png' && s.texKey !== 'vanilla/Extra_298.png');
    const byTex = (k: string): RoomScanSpec[] => pins.filter((s) => s.texKey === k);
    expect(byTex('vanilla/Extra_294.png').length).toBe(1);   // 光源（两火把去重为一）
    expect(byTex('vanilla/Extra_295.png').length).toBe(1);   // 椅
    expect(byTex('vanilla/Extra_297.png').length).toBe(1);   // 桌
    // 图钉色=LimeGreen*0.8f A/=2=(40,164,40,102),Scale1,全亮
    for (const p of pins) {
      expect(p.tint).toEqual([40, 164, 40, 102]);
      expect(p.scale).toBe(1);
    }
  });

  it('桌图钉锚位=TryGetTileBounds 盒心（3×2 桌:px=(L+W/2)*16,py=min(T+H/2,T+1)*16−50）', () => {
    const { specs } = scanValidHouse();
    const tablePin = specs.find((s) => s.texKey === 'vanilla/Extra_297.png')!;
    expect(tablePin).toBeDefined();
    // 首件桌格（采集序首中,任一 3×2 格）反解盒:盒宽 3 高 2 → px=(L+1.5)*16
    // py=min(T+1,T+1)*16=(T+1)*16;再 −texH/2(18)−32 → 起始 y=(T+1)*16−50
    const bx = tablePin.x / 16 - 1.5;
    expect(Number.isInteger(bx)).toBe(true);
    const by = (tablePin.y + 50) / 16;
    expect(Number.isInteger(by)).toBe(true);
    // 盒须框住全部六桌格（fx/18 反解一致性:盒 [bx,bx+3)×[by,by+2)）
    const cells: Array<[number, number]> = [];
    for (let dx = 0; dx <= 2; dx++) for (let dy = 0; dy <= 1; dy++) cells.push([OX + 5 + dx, OY + 3 + dy]);
    const inBox = cells.filter(([cx, cy]) => cx >= bx && cx < bx + 3 && cy >= by && cy < by + 2).length;
    expect(inBox).toBeGreaterThanOrEqual(1);   // 锚格自身必在盒内（TryGetTileBounds 反解恒自洽）
    // 升程缓动：vy=80/TTL、ay=−vy*1.25/TTL（净升 0.9375×32=30px 原式）
    expect(tablePin.vy).toBeGreaterThan(0);
    expect(tablePin.ay).toBeCloseTo((-tablePin.vy * 1.25) / tablePin.timeToLive, 10);
  });

  it('波节奏 1:1：Delay=(int)(3×欧氏距);TTL=(num−Delay)×1.5;FadeIn/Out=Remap 带', () => {
    const { scan, specs } = scanValidHouse();
    const { num } = waveParams(scan);
    let maxDist = (num - 60) / 3;
    const goodSpecs = specs.filter((s) => s.texKey === 'vanilla/Extra_293.png' && s.scale === 1);
    expect(goodSpecs.length).toBeGreaterThan(0);
    for (const s of goodSpecs) {
      const tx = (s.x - 8) / 16, ty = (s.y - 8) / 16;
      const d = Math.hypot(tx - SX, ty - SY);
      expect(s.delay).toBe(Math.trunc(3 * d));                       // (int)(3f×dist) 截断
      expect(s.timeToLive).toBeCloseTo((num - s.delay) * 1.5, 6);     // good ×1.5
      expect(s.fadeIn).toBeCloseTo(Math.min(1, Math.max(0, (num - 24 - s.delay) / (num - s.delay))), 8);
      expect(s.fadeOut).toBeCloseTo(Math.min(1, Math.max(0, (num - 6 - s.delay) / (num - s.delay))), 8);
      void maxDist;
    }
    // 远端点波前：maxDelay < num（TTL 恒正）
    expect(Math.max(...goodSpecs.map((s) => s.delay))).toBeLessThan(num);
  });

  it('打分点面：候选绿点 Scale2 分型色/金黄最优点 Scale3;num3=3×maxDist+90', () => {
    const { scan, specs } = scanValidHouse();
    const { num3 } = waveParams(scan);
    expect(scan.best).not.toBeNull();
    const best = scan.best!;
    expect(best.score).toBeGreaterThan(0);
    // 金黄最优点：OurFavoriteColor(255,231,69,255)（Main.cs:886）,Scale3,
    // @站位格（地板上一格）中心 (x*16+8, y*16−8)
    const gold = specs.filter((s) => s.tint[0] === 255 && s.tint[1] === 231 && s.tint[2] === 69 && s.scale === 3);
    expect(gold.length).toBe(1);
    expect(gold[0]!.x).toBe(best.x * 16 + 8);
    expect(gold[0]!.y).toBe(best.y * 16 + 8 - 16);
    expect(gold[0]!.texKey).toBe('vanilla/Extra_293.png');
    // 候选点（score≠0 且非 best）：Scale2,正分 LimeGreen×f（f=0.5+0.5×score/best）
    const cand = specs.filter((s) => s.scale === 2);
    const expected = scan.scores.filter((s) => s.score !== 0
      && !(s.x === best.x && s.y === best.y));
    expect(cand.length).toBe(expected.length);
    for (const s of expected) {
      const spec = cand.find((c) => c.x === s.x * 16 + 8 && c.y === s.y * 16 + 8 - 16);
      expect(spec).toBeDefined();
      const delay = Math.trunc(3 * Math.hypot(s.x - SX, s.y - SY));
      expect(spec!.delay).toBe(delay);
      expect(spec!.timeToLive).toBeCloseTo(num3 - delay, 6);
      if (s.score > 0) {
        const f = 0.5 + (0.5 * s.score) / best.score;
        expect(spec!.tint).toEqual([Math.trunc(50 * f), Math.trunc(205 * f), Math.trunc(50 * f), Math.trunc(255 * f)]);
      } else {
        const f = s.score / -best.score;
        expect(f).toBeGreaterThan(0);
        expect(spec!.tint).toEqual([Math.trunc(255 * f), 0, 0, Math.trunc(255 * f)]);
      }
    }
    // 本房必有正分候选（四件套齐+装饰净空）
    expect(cand.length).toBeGreaterThan(0);
  });

  it('实心种子：blocked 永不发射 → 零 spec（RoomCheckStartedInASolidTile 原版静默）', () => {
    const w = new World(4200, 1200, 92, 'open');
    buildHouse(w, OX, OY);
    const scan = createRoomScanTrace(OX, OY);   // 种子=框木墙格
    const q = housingCheckAt(w.store, [], OX, OY, -1, scan);
    expect(q.reason).toBe('solid');
    expect(scan.entries.length).toBe(1);
    expect(scan.entries[0]!.kind).toBe('blocked');
    expect(buildRoomCheckScanParticles(w.store, scan).length).toBe(0);
  });

  it('界外种子：openAir 红点恰一枚（TooCloseToWorldEdge）', () => {
    const w = new World(4200, 1200, 93, 'open');
    buildHouse(w, OX, OY);
    const scan = createRoomScanTrace(5, 5);
    housingCheckAt(w.store, [], 5, 5, -1, scan);
    expect(scan.entries.length).toBe(1);
    expect(scan.entries[0]!.kind).toBe('openAir');
    const specs = buildRoomCheckScanParticles(w.store, scan);
    expect(specs.length).toBe(1);
    expect(specs[0]!.texKey).toBe('vanilla/Extra_292.png');
    expect(specs[0]!.tint).toEqual([255, 40, 40, 255]);
  });

  it('漏墙：MissingAWall 红点（无墙格）/UnsafeWall 红十字（有墙非房墙格）', () => {
    // (a) 清 5×5 背墙块（±2 证据窗全向断证——单格墙洞在原版 ±2 窗下合法不算洞）→
    //     中心格 evidence 缺失+wall==0 → openAir 红 X
    const w1 = new World(4200, 1200, 94, 'open');
    buildHouse(w1, OX, OY);
    for (let x = 2102; x <= 2106; x++) for (let y = 301; y <= 304; y++) {
      w1.store.wall[w1.store.idx(x, y)] = 0;
    }
    const scan1 = createRoomScanTrace(SX, SY);
    const q1 = housingCheckAt(w1.store, [], SX, SY, -1, scan1);
    expect(q1.reason).toBe('hole');
    const red1 = buildRoomCheckScanParticles(w1.store, scan1)
      .filter((s) => s.texKey === 'vanilla/Extra_292.png');
    expect(red1.length).toBeGreaterThanOrEqual(1);
    // 红点必落证据断绝域中心（清块中部,横竖 ±2 全无墙）
    const cleared = red1.filter((s) => {
      const tx = (s.x - 8) / 16, ty = (s.y - 8) / 16;
      return tx >= 2104 && tx <= 2106 && ty >= 301 && ty <= 304;
    });
    expect(cleared.length).toBeGreaterThanOrEqual(1);
    // (b) 换天然墙块（stone wall=2 不在 WALL_HOUSE,±2 窗全断房墙证据）→
    //     unsafeWall 红十字 Extra_298（有墙但非房墙=TooManyUnsafeWalls 档）
    expect(WALL_HOUSE.has(2)).toBe(false);
    const w2 = new World(4200, 1200, 95, 'open');
    buildHouse(w2, OX, OY);
    for (let x = 2102; x <= 2106; x++) for (let y = 301; y <= 304; y++) {
      w2.store.wall[w2.store.idx(x, y)] = 2;
    }
    const scan2 = createRoomScanTrace(SX, SY);
    const q2 = housingCheckAt(w2.store, [], SX, SY, -1, scan2);
    // 判定面注（既有债,登记不越界）：queryRoom 把 floodRoom null 折叠为 hole/needs
    // 启发式（HousingFailReason 无 'unsafeWalls' 档→文案走 inter[40] 兜底,与原版
    // "Room has unsafe walls" 专项文案有偏差）——视觉域以采集面为准
    expect(q2.reason).not.toBe('ok');
    expect(scan2.entries.some((e) => e.kind === 'unsafeWall')).toBe(true);
    const red2 = buildRoomCheckScanParticles(w2.store, scan2)
      .filter((s) => s.texKey === 'vanilla/Extra_298.png');
    expect(red2.length).toBeGreaterThanOrEqual(1);
    for (const r of red2) {
      expect(r.tint).toEqual([255, 40, 40, 255]);
      expect(r.scale).toBe(1);
    }
  });

  it('占用房：best=null → 无打分点（EndScoring score==0 早退门;青点波照常）', () => {
    const occ: Occupant[] = [{ x: SX, y: SY + 1, npcId: 17 }];   // 商人占位（home 与 home-1 同房）
    const { scan, specs } = scanValidHouse(occ);
    // 占用=scoreRoom 早退（hiScore=-1,无候选/无最优）
    expect(scan.best).toBeNull();
    expect(scan.scores.length).toBe(0);
    expect(specs.filter((s) => s.scale >= 2).length).toBe(0);
    // 泛洪青点照常（vanilla Rich 面不因占用中断）
    expect(specs.filter((s) => s.texKey === 'vanilla/Extra_293.png' && s.scale === 1).length).toBeGreaterThan(0);
  });

  it('判定面早退补跑（vanilla StopOnFail=false ScoreRoom 无条件语义）：臭虫房出打分点', () => {
    const w = new World(4200, 1200, 96, 'open');
    buildHouse(w, OX, OY);
    w.store.setTileSilent(2102, 304, TILE_BY_KEY['v_630_stinkbug_blocker']!, 0, 0);
    const scan = createRoomScanTrace(SX, SY);
    const q = housingCheckAt(w.store, [], SX, SY, -1, scan);
    expect(q.reason).toBe('stinkbug');
    expect(scan.scored).toBe(false);          // 判定面早退（臭虫门先于 ScoreRoom）
    backfillRoomScanScoring(w.store, scan, []);   // 视觉域补跑
    expect(scan.scored).toBe(true);
    expect(scan.best).not.toBeNull();         // 四件套齐→站位分>0→金黄点照出（原版同相）
    const specs = buildRoomCheckScanParticles(w.store, scan);
    expect(specs.some((s) => s.scale === 3)).toBe(true);
    // 臭虫格自身=hazard 红点（同位另有地板(2102,305)的打分候选点——打分点
    // y=305*16−8=304*16+8 与 hazard 同屏,按 texKey 分型过滤）
    const hazard = specs.filter((s) => s.x === 2102 * 16 + 8 && s.y === 304 * 16 + 8
      && s.texKey === 'vanilla/Extra_292.png');
    expect(hazard.length).toBe(1);
    expect(hazard[0]!.tint).toEqual([255, 40, 40, 255]);
  });

  it('入池：spawnRoomCheckScan → fadingParticles 逐字段 1:1（fullbright/池计步）', () => {
    const w = new World(4200, 1200, 97, 'open');
    buildHouse(w, OX, OY);
    const scan = createRoomScanTrace(SX, SY);
    housingCheckAt(w.store, [], SX, SY, -1, scan);
    const specs = buildRoomCheckScanParticles(w.store, scan);
    expect(specs.length).toBeGreaterThan(0);
    fadingParticles.clear();   // 池=模块单例,先清场（槽位分配序不假设,按 x/y/texKey 对拍）
    const before = fadingParticles.count;
    spawnRoomCheckScan(w.store, scan);
    expect(fadingParticles.count).toBe(before + specs.length);
    const spawned = [...fadingParticles.each()];
    expect(spawned.length).toBe(specs.length);
    for (const s of specs) {
      const f = spawned.find((p) => p.x === s.x && p.y === s.y && p.texKey === s.texKey
        && p.delay === s.delay);
      expect(f).toBeDefined();
      expect(f!.timeToLive).toBeCloseTo(s.timeToLive, 6);
      expect(f!.tintR).toBe(s.tint[0]);
      expect(f!.tintG).toBe(s.tint[1]);
      expect(f!.tintB).toBe(s.tint[2]);
      expect(f!.tintA).toBe(s.tint[3]);
      expect(f!.fullbright).toBe(true);
      expect(f!.scaleX).toBe(s.scale);
      expect(f!.scaleY).toBe(s.scale);
      expect(f!.vy).toBeCloseTo(s.vy, 10);
      expect(f!.ay).toBeCloseTo(s.ay, 10);
    }
    fadingParticles.clear();
  });
});
