/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=106, 实指令=21,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorBrightnessRainbow(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#2 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#3 op:0x01 */
let tmp3_3 = C[4];
R[7] = tmp3_3;
/* inst#4 op:0x04 */
let tmp4_0 = T[0] * R[7] + (-C[0]);
R[4] = tmp4_0;
/* inst#5 op:0x05 */
let tmp5_0 = R[4] * C[8];
R[4] = sat(tmp5_0);
/* inst#6 op:0x04 */
let tmp6_1 = R[4] * C[13] + C[14];
R[5] = tmp6_1;
/* inst#7 op:0x05 */
let tmp7_0 = R[4] * R[4];
R[4] = tmp7_0;
/* inst#8 op:0x05 */
let tmp8_0 = R[5] * R[4];
R[4] = tmp8_0;
/* inst#9 op:0x04 */
let tmp9_0 = R[4] * C[19] + C[16];
let tmp9_1 = R[4] * C[19] + C[17];
let tmp9_2 = R[4] * C[19] + C[18];
R[4] = tmp9_0;
R[5] = tmp9_1;
R[6] = tmp9_2;
/* inst#10 op:0x23 */
let tmp10_0 = Math.abs(R[4]);
let tmp10_1 = Math.abs(R[5]);
let tmp10_2 = Math.abs(R[6]);
R[8] = tmp10_0;
R[9] = tmp10_1;
R[10] = tmp10_2;
/* inst#11 op:0x13 */
let tmp11_0 = R[8] - Math.floor(R[8]);
let tmp11_1 = R[9] - Math.floor(R[9]);
let tmp11_2 = R[10] - Math.floor(R[10]);
R[8] = tmp11_0;
R[9] = tmp11_1;
R[10] = tmp11_2;
/* inst#12 op:0x58 */
let tmp12_0 = R[4] >= 0 ? R[8] : (-R[8]);
let tmp12_1 = R[5] >= 0 ? R[9] : (-R[9]);
let tmp12_2 = R[6] >= 0 ? R[10] : (-R[10]);
R[4] = tmp12_0;
R[5] = tmp12_1;
R[6] = tmp12_2;
/* inst#13 op:0x04 */
let tmp13_0 = R[4] * C[14] + C[15];
let tmp13_1 = R[5] * C[14] + C[15];
let tmp13_2 = R[6] * C[14] + C[15];
R[4] = tmp13_0;
R[5] = tmp13_1;
R[6] = tmp13_2;
/* inst#14 op:0x23 */
let tmp14_0 = Math.abs(R[4]);
let tmp14_1 = Math.abs(R[5]);
let tmp14_2 = Math.abs(R[6]);
R[4] = tmp14_0;
R[5] = tmp14_1;
R[6] = tmp14_2;
/* inst#15 op:0x02 */
let tmp15_0 = (-R[4]) + (-C[15]);
let tmp15_1 = (-R[5]) + (-C[15]);
let tmp15_2 = (-R[6]) + (-C[15]);
R[4] = tmp15_0;
R[5] = tmp15_1;
R[6] = tmp15_2;
/* inst#16 op:0x02 */
let tmp16_3 = R[1] + R[0];
R[7] = tmp16_3;
/* inst#17 op:0x02 */
let tmp17_3 = R[2] + R[7];
R[7] = tmp17_3;
/* inst#18 op:0x05 */
let tmp18_3 = R[7] * C[12];
R[7] = tmp18_3;
/* inst#19 op:0x05 */
let tmp19_0 = R[4] * R[7];
let tmp19_1 = R[5] * R[7];
let tmp19_2 = R[6] * R[7];
R[4] = tmp19_0;
R[5] = tmp19_1;
R[6] = tmp19_2;
/* inst#20 op:0x05 */
let tmp20_0 = R[3] * R[4];
let tmp20_1 = R[3] * R[5];
let tmp20_2 = R[3] * R[6];
R[0] = tmp20_0;
R[1] = tmp20_1;
R[2] = tmp20_2;
/* inst#21 op:0x05 */
let tmp21_0 = R[0] * V[0];
let tmp21_1 = R[1] * V[1];
let tmp21_2 = R[2] * V[2];
let tmp21_3 = R[3] * V[3];
R[0] = tmp21_0;
R[1] = tmp21_1;
R[2] = tmp21_2;
R[3] = tmp21_3;
/* inst#22 op:0x01 */
let tmp22_0 = R[0];
let tmp22_1 = R[1];
let tmp22_2 = R[2];
let tmp22_3 = R[3];
O[0] = tmp22_0;
O[1] = tmp22_1;
O[2] = tmp22_2;
O[3] = tmp22_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

