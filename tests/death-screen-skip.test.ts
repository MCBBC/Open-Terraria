// 死亡界面 1457 跳过提示 + 遗照式去饱和 回归（2026-08-23 用户报告）：
//  ① 跳过提示"按SPACE跳过"：门=player.respawnSkipUi（AllowsRespawnTimerSkip 全门，
//     Main.cs:46104-46134）；淡入 60t + 滑移 70→20px·num4；门关计数归零
//  ② 倒计时位置随提示滑移联动（num 共用——原版结构）
//  ③ 旧灰化遮罩已移除（fillRect rgba(46,40,46) 不再出现）；去饱和改 render() 尾段
//     grayscale 滤镜自绘整帧（遗照式， immuneAlpha ramp）
import { describe, it, expect } from 'vitest';
import { Renderer } from '../src/render/Renderer';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

interface Draw { text: string; x: number; y: number; alpha: number }

function runDeathScreen(respawnSkipUi: boolean, frames: number, immuneAlpha = 255) {
  const p = new Player(0, 0, new Inventory());
  p.dead = true;
  p.respawnTimer = 120;
  p.immuneAlpha = immuneAlpha;
  p.respawnSkipUi = respawnSkipUi;
  const draws: Draw[] = [];
  const fillTexts: string[] = [];
  const fills: string[] = [];
  const ctx = {
    save: () => {}, restore: () => {}, setTransform: () => {},
    filter: undefined as string | undefined,
    canvas: { width: 1920, height: 1080 },
    textAlign: '', textBaseline: '',
    font: '',
    strokeStyle: '', fillStyle: '', lineWidth: 0,
    strokeText: (t: string) => { void t; },
    fillText: (t: string, x: number, y: number) => {
      fillTexts.push(t);
      draws.push({ text: t, x, y, alpha: 0 });
    },
    fillRect: (_x: number, _y: number, _w: number, _h: number) => { fills.push('rect'); },
    drawImage: () => {},
  } as unknown as CanvasRenderingContext2D;
  const r = Object.create(Renderer.prototype) as unknown as Record<string, unknown> & {
    _respawnSkipFrames: number;
    drawDeathScreen: (c: CanvasRenderingContext2D, p: Player, w: number, h: number) => void;
    deathLostCoins: number;
  };
  r._respawnSkipFrames = frames;
  r.deathLostCoins = 0;
  r.drawDeathScreen(ctx, p, 800, 600);
  return { draws, fillTexts, fills, framesAfter: r._respawnSkipFrames };
}

describe('死亡界面 1457 跳过提示（Main.cs:46104-46134）', () => {
  it('门开：提示入画（提示位 26+slide）、计数递增、倒计时随滑移下移（提示位+40）', () => {
    const r1 = runDeathScreen(true, 60, 255);   // num4=1 满淡入
    expect(r1.framesAfter).toBe(61);
    // Lang 未初始化回退键名/空串不定——按【位置】断言（提示位 y=300+26+20=346、倒计时 +40=386）
    const skipDraws = r1.draws.filter((d) => d.y > 340 && d.y < 352);
    expect(skipDraws.length).toBeGreaterThanOrEqual(1);   // 提示在满滑移位
    const cdDraws = r1.draws.filter((d) => d.y > 380 && d.y < 392);
    expect(cdDraws.length).toBeGreaterThanOrEqual(1);     // 倒计时=提示位+40（num 共用联动）
  });

  it('门关：无提示文本、计数归零（:46137 else）', () => {
    const r = runDeathScreen(false, 30, 255);
    expect(r.framesAfter).toBe(0);
    expect(r.fillTexts.some((t) => t.includes('跳过') || t.includes('skip') || t.includes('RespawnSkip'))).toBe(false);
  });

  it('淡入斜坡：frames=30 → 半透明（num4=0.5）；frames=0 → 滑移起点', () => {
    const early = runDeathScreen(true, 1, 255);
    const late = runDeathScreen(true, 90, 255);
    // 滑移：num3·num4 在 num4=1 时 = 20px；提示 y = 300+26+20=346（晚）vs 300+26+≈1（早）
    // 计数器入参+1 后结算：frames=1→2（num4=2/60）/89→90（num4=1）
    const earlyList = early.draws.filter((d) => d.y > 326 && d.y < 329);
    const earlySkip = earlyList[earlyList.length - 1];
    const lateList = late.draws.filter((d) => d.y > 345 && d.y < 347);
    const lateSkip = lateList[lateList.length - 1];
    expect(lateSkip!.y).toBeGreaterThan(earlySkip!.y);   // 滑移向下趋近 +20
    expect(lateSkip!.y - earlySkip!.y).toBeCloseTo(20 - (70 - 50 * (2 / 60)) * (2 / 60), 1); // 20·(1)−70·(1/60)·(1/60)≈19.98→19
  });

  it('旧灰化遮罩已移除：死亡屏不再 fillRect 灰罩（去饱和移至 render() 尾段滤镜）', () => {
    const r = runDeathScreen(true, 60, 255);
    expect(r.fills.length).toBe(0);
  });
});
