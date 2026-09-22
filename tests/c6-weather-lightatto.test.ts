// ★C6 雨雪守卫：lightAtTo ≡ lightAt 逐位等价（零分配变体）+ 三消费点接线锁
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LightingEngine } from '../src/lighting/LightingEngine';

const src = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

function makeEngine(rx: number, ry: number, rw: number, rh: number) {
  const e = Object.create(LightingEngine.prototype) as LightingEngine & {
    rx: number; ry: number; rw: number; rh: number; r: Uint8Array; g: Uint8Array; b: Uint8Array;
  };
  e.rx = rx; e.ry = ry; e.rw = rw; e.rh = rh;
  e.r = new Uint8Array(rw * rh); e.g = new Uint8Array(rw * rh); e.b = new Uint8Array(rw * rh);
  for (let i = 0; i < rw * rh; i++) { e.r[i] = (i * 7) % 256; e.g[i] = (i * 13) % 256; e.b[i] = (i * 29) % 256; }
  return e;
}

describe('C6 lightAtTo 零分配变体', () => {
  it('全域采样 ≡ lightAt（含界外 0 语义）', () => {
    const e = makeEngine(10, 10, 20, 15);
    const out: number[] = [0, 0, 0];
    for (let ty = 5; ty < 30; ty++) for (let tx = 5; tx < 35; tx++) {
      const a = e.lightAt(tx, ty);
      e.lightAtTo(tx, ty, out);
      expect(out[0]).toBe(a[0]);
      expect(out[1]).toBe(a[1]);
      expect(out[2]).toBe(a[2]);
    }
  });

  it('缓冲复用不串值（写前覆盖）', () => {
    const e = makeEngine(0, 0, 4, 4);
    const out: number[] = [99, 99, 99];
    e.lightAtTo(1, 1, out);
    out[0] = 5; out[1] = 5; out[2] = 5;        // 消费面改写不影响引擎
    e.lightAtTo(2, 2, out);                     // 再采样=覆写
    const a = e.lightAt(2, 2);
    expect(out).toEqual([a[0], a[1], a[2]]);
  });

  it('三消费点接线锁（rain/snow/sand 全走零分配面;Game 钩子在位）', () => {
    const w = src('../src/render/WeatherRenderer.ts');
    expect((w.match(/hooks\.lightAtTo\(/g) || []).length).toBe(3);
    expect(w).toContain('const _lt3 = [0, 0, 0];');
    expect(src('../src/core/Game.ts')).toContain('lightAtTo: (tx, ty, out) =>');
  });
});
