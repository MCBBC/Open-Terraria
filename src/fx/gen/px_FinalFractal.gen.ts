/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=223, 实指令=46,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_FinalFractal(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#4 op:0x02 */
let tmp4_0 = T[0] + C[8];
let tmp4_1 = T[1] + C[8];
R[0] = tmp4_0;
R[1] = tmp4_1;
/* inst#5 op:0x23 */
let tmp5_2 = Math.abs(R[1]);
R[2] = tmp5_2;
/* inst#6 op:0x23 */
let tmp6_3 = Math.abs(R[0]);
R[3] = tmp6_3;
/* inst#7 op:0x0b */
let tmp7_3 = Math.max(R[2], R[3]);
R[7] = tmp7_3;
/* inst#8 op:0x06 */
let tmp8_0 = 1 / R[7];
R[4] = tmp8_0;
/* inst#9 op:0x0a */
let tmp9_1 = Math.min(R[3], R[2]);
R[5] = tmp9_1;
/* inst#10 op:0x02 */
let tmp10_2 = (-R[2]) + R[3];
R[2] = tmp10_2;
/* inst#11 op:0x58 */
let tmp11_2 = R[2] >= 0 ? C[16] : C[17];
R[2] = tmp11_2;
/* inst#12 op:0x05 */
let tmp12_3 = R[4] * R[5];
R[3] = tmp12_3;
/* inst#13 op:0x05 */
let tmp13_0 = R[3] * R[3];
R[4] = tmp13_0;
/* inst#14 op:0x04 */
let tmp14_1 = R[4] * C[10] + C[11];
R[5] = tmp14_1;
/* inst#15 op:0x04 */
let tmp15_1 = R[4] * R[5] + C[12];
R[5] = tmp15_1;
/* inst#16 op:0x04 */
let tmp16_1 = R[4] * R[5] + C[13];
R[5] = tmp16_1;
/* inst#17 op:0x04 */
let tmp17_0 = R[4] * R[5] + C[14];
R[4] = tmp17_0;
/* inst#18 op:0x05 */
let tmp18_3 = R[3] * R[4];
R[3] = tmp18_3;
/* inst#19 op:0x04 */
let tmp19_0 = R[3] * C[18] + C[19];
R[4] = tmp19_0;
/* inst#20 op:0x04 */
let tmp20_2 = R[4] * R[2] + R[3];
R[2] = tmp20_2;
/* inst#21 op:0x58 */
let tmp21_3 = R[0] >= 0 ? C[20] : C[21];
R[3] = tmp21_3;
/* inst#22 op:0x02 */
let tmp22_2 = R[2] + R[3];
R[2] = tmp22_2;
/* inst#23 op:0x02 */
let tmp23_3 = R[2] + R[2];
R[3] = tmp23_3;
/* inst#24 op:0x0b */
let tmp24_0 = Math.max(R[1], R[0]);
R[4] = tmp24_0;
/* inst#25 op:0x58 */
let tmp25_0 = R[4] >= 0 ? C[17] : C[16];
R[4] = tmp25_0;
/* inst#26 op:0x0a */
let tmp26_1 = Math.min(R[0], R[1]);
R[5] = tmp26_1;
/* inst#27 op:0x5a */
R[0] = R[0] * R[0] + R[1] * R[1] + C[9];
/* inst#28 op:0x07 */
let tmp28_0 = 1 / Math.sqrt(R[0]);
R[0] = tmp28_0;
/* inst#29 op:0x06 */
let tmp29_0 = 1 / R[0];
R[0] = tmp29_0;
/* inst#30 op:0x02 */
let tmp30_0 = R[0] + (-C[1]);
R[0] = tmp30_0;
/* inst#31 op:0x01 */
let tmp31_3 = C[15];
R[7] = tmp31_3;
/* inst#32 op:0x04 */
let tmp32_0 = R[0] * (-C[4]) + R[7];
R[0] = tmp32_0;
/* inst#33 op:0x58 */
let tmp33_1 = R[5] >= 0 ? C[9] : R[4];
R[1] = tmp33_1;
/* inst#34 op:0x04 */
let tmp34_1 = R[1] * (-R[3]) + R[2];
R[1] = tmp34_1;
/* inst#35 op:0x04 */
let tmp35_1 = R[1] * C[22] + C[23];
R[1] = tmp35_1;
/* inst#36 op:0x05 */
let tmp36_1 = R[1] * C[0];
R[1] = tmp36_1;
/* inst#37 op:0x01 */
let tmp37_0 = C[8];
R[4] = tmp37_0;
/* inst#38 op:0x04 */
let tmp38_1 = R[1] * (-R[4]) + C[2];
R[1] = tmp38_1;
/* inst#39 op:0x23 */
let tmp39_2 = Math.abs(R[1]);
R[2] = tmp39_2;
/* inst#40 op:0x13 */
let tmp40_2 = R[2] - Math.floor(R[2]);
R[2] = tmp40_2;
/* inst#41 op:0x58 */
let tmp41_0 = R[1] >= 0 ? R[2] : (-R[2]);
R[4] = tmp41_0;
/* inst#42 op:0x01 */
let tmp42_1 = R[0];
R[5] = tmp42_1;
/* inst#43 op:0x42 */
SAM[0](R[4], R[5], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#44 op:0x02 */
let tmp44_0 = (-R[0]) + C[15];
R[0] = tmp44_0;
/* inst#45 op:0x58 */
let tmp45_1 = R[5] >= 0 ? C[16] : C[17];
R[1] = tmp45_1;
/* inst#46 op:0x58 */
let tmp46_0 = R[0] >= 0 ? C[16] : C[17];
R[0] = tmp46_0;
/* inst#47 op:0x02 */
let tmp47_0 = R[1] + R[0];
R[0] = tmp47_0;
/* inst#48 op:0x58 */
let tmp48_0 = (-R[0]) >= 0 ? R[8] : C[9];
let tmp48_1 = (-R[0]) >= 0 ? R[9] : C[9];
let tmp48_2 = (-R[0]) >= 0 ? R[10] : C[9];
let tmp48_3 = (-R[0]) >= 0 ? R[11] : C[9];
R[0] = tmp48_0;
R[1] = tmp48_1;
R[2] = tmp48_2;
R[3] = tmp48_3;
/* inst#49 op:0x01 */
let tmp49_0 = R[0];
let tmp49_1 = R[1];
let tmp49_2 = R[2];
let tmp49_3 = R[3];
O[0] = tmp49_0;
O[1] = tmp49_1;
O[2] = tmp49_2;
O[3] = tmp49_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

