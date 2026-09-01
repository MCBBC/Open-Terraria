/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=135, 实指令=24,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_WaterDistortionObject(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#5 op:0x02 */
let tmp5_0 = V[0] + C[0];
let tmp5_1 = V[1] + C[0];
R[0] = tmp5_0;
R[1] = tmp5_1;
/* inst#6 op:0x5a */
R[2] = R[0] * R[0] + R[1] * R[1] + C[1];
/* inst#7 op:0x07 */
let tmp7_2 = 1 / Math.sqrt(R[2]);
R[2] = tmp7_2;
/* inst#8 op:0x05 */
let tmp8_0 = R[0] * R[2];
let tmp8_1 = R[1] * R[2];
R[0] = tmp8_0;
R[1] = tmp8_1;
/* inst#9 op:0x02 */
let tmp9_0 = T[0] + C[0];
let tmp9_1 = T[1] + C[0];
R[4] = tmp9_0;
R[5] = tmp9_1;
/* inst#10 op:0x5a */
R[2] = R[4] * R[4] + R[5] * R[5] + C[1];
/* inst#11 op:0x07 */
let tmp11_2 = 1 / Math.sqrt(R[2]);
R[2] = tmp11_2;
/* inst#12 op:0x05 */
let tmp12_0 = R[4] * R[2];
let tmp12_1 = R[5] * R[2];
R[4] = tmp12_0;
R[5] = tmp12_1;
/* inst#13 op:0x06 */
let tmp13_2 = 1 / R[2];
R[2] = tmp13_2;
/* inst#14 op:0x05 */
let tmp14_2 = R[2] * C[3];
R[2] = tmp14_2;
/* inst#15 op:0x0b */
let tmp15_2 = Math.max(R[2], C[4]);
R[6] = tmp15_2;
/* inst#16 op:0x5a */
R[0] = (-R[0]) * R[4] + (-R[1]) * R[5] + C[2];
/* inst#17 op:0x0b */
let tmp17_0 = Math.max(R[0], C[1]);
R[4] = tmp17_0;
/* inst#18 op:0x04 */
let tmp18_0 = R[6] * C[6] + C[7];
R[0] = tmp18_0;
/* inst#19 op:0x02 */
let tmp19_1 = R[6] + C[5];
R[1] = tmp19_1;
/* inst#20 op:0x13 */
let tmp20_0 = R[0] - Math.floor(R[0]);
R[0] = tmp20_0;
/* inst#21 op:0x04 */
let tmp21_0 = R[0] * C[8] + C[9];
R[0] = tmp21_0;
/* inst#22 op:0x58 */
let tmp22_0 = R[1] >= 0 ? C[10] : R[0];
R[0] = tmp22_0;
/* inst#23 op:0x25 */
R[8] = Math.cos(R[0]);
/* inst#24 op:0x58 */
let tmp24_0 = R[8] >= 0 ? C[1] : (-R[8]);
R[0] = tmp24_0;
/* inst#25 op:0x05 */
let tmp25_0 = R[4] * R[0];
R[0] = tmp25_0;
/* inst#26 op:0x05 */
let tmp26_0 = R[0] * V[2];
let tmp26_3 = R[0] * V[2];
R[0] = tmp26_0;
R[3] = tmp26_3;
/* inst#27 op:0x01 */
let tmp27_1 = C[1];
let tmp27_2 = C[1];
R[1] = tmp27_1;
R[2] = tmp27_2;
/* inst#28 op:0x01 */
let tmp28_0 = R[0];
let tmp28_1 = R[1];
let tmp28_2 = R[2];
let tmp28_3 = R[3];
O[0] = tmp28_0;
O[1] = tmp28_1;
O[2] = tmp28_2;
O[3] = tmp28_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

