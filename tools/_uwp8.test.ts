// 一次性诊断:#28 HF T#1 尾部掷流偏移定标——用真样流(平行 UnifiedRandom 推进到
// HF 入口)枚举 T#1 推进掷的偏移 k,找出 VAN T#2=1208 对应的样流位差。
import { it, expect } from 'vitest';
import { UnifiedRandom } from '../src/core/rng';
const RUN = !!process.env.SW_PARITY;

(RUN ? it : it.skip)('advance roll offset enumeration', () => {
  const ur = new UnifiedRandom(9293480);
  // 推进到 HF 入口(UW 段精确 14266081 掷;T#0 首掷=tileType)
  for (let n = 0; n < 14266081; n++) ur.nextInt(2);
  // 抓 T#0 起共 300 个原始样本(raw[0]=T#0 tileType 掷)
  // T#1→T#2 推进掷 = T#0 起 3 方法口径第 250 掷(_uwp7 D14256201,真位=+250)
  const raw: number[] = [];
  for (let n = 0; n < 420; n++) raw.push(ur.nextInt(2147483647));
  // 我们的推进掷位置:T#0 起第 250/251/252 掷
  // C# Next(min,max) = min + floor(Sample()*(max-min)),Sample()=s/2147483647
  const nv = (s: number, min: number, max: number): number => min + Math.floor((s / 2147483647) * (max - min));
  console.log('D6201 sample =', raw[250], '→ r1 =', nv(raw[250]!, 30, 130), ' (我方实测 42)');
  console.log('D6202 →', nv(raw[251]!, 0, 10), ' (我方实测 0)');
  console.log('D6203 →', nv(raw[252]!, 0, 200), ' (我方实测 192)');
  // 枚举 k:推进掷在 (250+k) 样位
  for (let k = -80; k <= 80; k++) {
    const p = 250 + k;
    if (p < 0 || p + 2 >= raw.length) continue;
    const r1 = nv(raw[p]!, 30, 130);
    const gate = nv(raw[p + 1]!, 0, 10);
    if (gate === 0) {
      const r2 = nv(raw[p + 2]!, 0, 200);
      const t2 = 1107 + r1 + r2 + 1;
      if (t2 === 1208) console.log(`k=${k}: r1=${r1} gate0 r2=${r2} → T#2@${t2} ★VAN命中`);
    } else {
      const t2 = 1107 + r1 + 1;
      if (t2 === 1208) console.log(`k=${k}: r1=${r1} gate≠0 → T#2@${t2} ★VAN命中`);
    }
  }
  // 反向定标:VAN T#2 几何约束(墙列 1180/1190/1201/1213/1231,colL[2]=1201=i-7,
  // colR[2]=1213=i+5,colR[3]=1231(+18),colL[1]=1190(+11),colL[0]=1180(+10))
  // T#2 首掷=tileType Next(75,77)。在全窗口搜满足约束的样位 p。
  console.log('--- T#2 几何约束搜索 ---');
  for (let p = 150; p < 410; p++) {
    if (nv(raw[p + 2]!, 4, 10) !== 7) continue;
    if (nv(raw[p + 3]!, 4, 10) !== 5) continue;
    if (nv(raw[p + 4]!, 8, 20) !== 18) continue;
    if (nv(raw[p + 6]!, 8, 20) !== 11) continue;
    if (nv(raw[p + 7]!, 8, 20) !== 10) continue;
    const t = nv(raw[p]!, 75, 77), g = nv(raw[p + 1]!, 0, 5);
    const k = p - 253;   // 我方 T#2 首掷样位=253(推进 250-252)
    console.log(`p=${p} (k=${k}): tile=${t} gate=${g} ★T#2几何全命中 i=${1201 + 7}`);
  }
  // VAN T#1 尾部模拟:leftDoor 后样位 224(我方 leftDoor 1掷+3门掷=224-227)。
  // 候选:右外门 rows={} (0掷)/{4,5}(1掷+3门)/{1,2,3}(8掷+3门);之后 topPlat
  // (Next(5) miss×n + x1/x2(1105,1111) 收 (1106,1110));VAN 推进位=237。
  console.log('--- VAN T#1 尾部假设模拟 ---');
  const platAt = (start: number): Array<[number, number, number]> => {
    // 返回 [末样位(含), x1, x2] 列表:逐假设起点模拟到接受
    const out: Array<[number, number, number]> = [];
    let p2 = start;
    while (true) {
      while (nv(raw[p2]!, 0, 5) !== 2) p2++;   // Next(5) 直到命中列 2
      let x1 = nv(raw[p2 + 1]!, 1105, 1112), x2 = nv(raw[p2 + 2]!, 1105, 1112), q = p2 + 3;
      while (x2 - x1 < 2 || x2 - x1 > 5) { x1 = nv(raw[q]!, 1105, 1112); x2 = nv(raw[q + 1]!, 1105, 1112); q += 2; if (q > 410) break; }
      out.push([q - 1, x1, x2]);
      return out;
    }
  };
  for (const [name, rdDraws] of [['rows空=0掷', 0], ['rows{4,5}=1+3掷', 4], ['rows{1,2,3}=8+3掷', 11]] as Array<[string, number]>) {
    const start = 228 + rdDraws;
    const [end, x1, x2] = platAt(start)!;
    console.log(`${name}: topPlat 起点${start} → 收(${x1},${x2}) 末位${end} → 推进位${end + 1}${end + 1 === 237 && x1 === 1106 && x2 === 1110 ? ' ★全对上' : ''}`);
  }
  console.log('raw[228..240] as Next(5):', Array.from({ length: 13 }, (_, i2) => nv(raw[228 + i2]!, 0, 5)).join(','));
  console.log('raw[228..240] as Next(3):', Array.from({ length: 13 }, (_, i2) => nv(raw[228 + i2]!, 0, 3)).join(','));
}, 480000);

