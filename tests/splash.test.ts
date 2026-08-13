// 启动加载画面纯函数（Main.DrawSplash :51908-52075）：随机组选取 + 淡入淡出曲线
import { it, expect } from 'vitest';
import { pickSplashSet, splashAlphaAt } from '../src/ui/Splash';

it('pickSplashSet：rand∈[0,1) → 1..10 十组', () => {
  expect(pickSplashSet(() => 0)).toBe(1);
  expect(pickSplashSet(() => 0.999)).toBe(10);
  expect(pickSplashSet(() => 0.15)).toBe(2);
});

it('splashAlphaAt 默认档：90f 起 / 410f 满 / 620f 走完（帧×16.67ms）', () => {
  const f = (x: number) => splashAlphaAt(x * 16.67, false);
  expect(f(0)).toBe(0);
  expect(f(90)).toBe(0);
  expect(f(250)).toBeGreaterThan(80);      // 淡入中段
  expect(f(410)).toBe(255);
  expect(f(560)).toBe(255);                // 持满段
  expect(f(619)).toBeGreaterThan(0);       // 淡出末
  expect(f(621)).toBe(-1);                 // 走完
});

it('splashAlphaAt 16:9 档（Splash_1）：0/75/200/75 快淡入', () => {
  const f = (x: number) => splashAlphaAt(x * 16.67, true);
  expect(f(0)).toBe(0);
  expect(f(75)).toBe(255);
  expect(f(125)).toBe(255);
  expect(f(200)).toBe(0);
  expect(f(201)).toBe(-1);
});
