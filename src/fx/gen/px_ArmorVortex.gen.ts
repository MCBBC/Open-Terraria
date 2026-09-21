/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=260, 实指令=54,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorVortex(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#4 op:0x05 */
let tmp4_0 = T[0] * C[0];
let tmp4_1 = T[1] * C[1];
R[0] = tmp4_0;
R[1] = tmp4_1;
/* inst#5 op:0x13 */
let tmp5_2 = R[1] - Math.floor(R[1]);
let tmp5_3 = R[0] - Math.floor(R[0]);
R[2] = tmp5_2;
R[3] = tmp5_3;
/* inst#6 op:0x02 */
let tmp6_0 = R[0] + (-R[3]);
let tmp6_1 = R[1] + (-R[2]);
R[0] = tmp6_0;
R[1] = tmp6_1;
/* inst#7 op:0x01 */
let tmp7_0 = C[4];
let tmp7_1 = C[5];
R[4] = tmp7_0;
R[5] = tmp7_1;
/* inst#8 op:0x04 */
let tmp8_0 = R[0] * R[4] + (-C[8]);
let tmp8_1 = R[1] * R[5] + (-C[9]);
R[0] = tmp8_0;
R[1] = tmp8_1;
/* inst#9 op:0x01 */
let tmp9_0 = C[28];
R[4] = tmp9_0;
/* inst#10 op:0x04 */
let tmp10_0 = R[0] * C[12] + R[4];
let tmp10_1 = R[1] * C[13] + R[4];
R[0] = tmp10_0;
R[1] = tmp10_1;
/* inst#11 op:0x23 */
let tmp11_2 = Math.abs(R[0]);
R[2] = tmp11_2;
/* inst#12 op:0x23 */
let tmp12_3 = Math.abs(R[1]);
R[3] = tmp12_3;
/* inst#13 op:0x0b */
let tmp13_0 = Math.max(R[2], R[3]);
R[4] = tmp13_0;
/* inst#14 op:0x06 */
let tmp14_0 = 1 / R[4];
R[4] = tmp14_0;
/* inst#15 op:0x0a */
let tmp15_1 = Math.min(R[3], R[2]);
R[5] = tmp15_1;
/* inst#16 op:0x02 */
let tmp16_2 = (-R[2]) + R[3];
R[2] = tmp16_2;
/* inst#17 op:0x58 */
let tmp17_2 = R[2] >= 0 ? C[34] : C[35];
R[2] = tmp17_2;
/* inst#18 op:0x05 */
let tmp18_3 = R[4] * R[5];
R[3] = tmp18_3;
/* inst#19 op:0x05 */
let tmp19_0 = R[3] * R[3];
R[4] = tmp19_0;
/* inst#20 op:0x04 */
let tmp20_1 = R[4] * C[29] + C[30];
R[5] = tmp20_1;
/* inst#21 op:0x04 */
let tmp21_1 = R[4] * R[5] + C[31];
R[5] = tmp21_1;
/* inst#22 op:0x04 */
let tmp22_1 = R[4] * R[5] + C[32];
R[5] = tmp22_1;
/* inst#23 op:0x04 */
let tmp23_0 = R[4] * R[5] + C[33];
R[4] = tmp23_0;
/* inst#24 op:0x05 */
let tmp24_3 = R[3] * R[4];
R[3] = tmp24_3;
/* inst#25 op:0x04 */
let tmp25_0 = R[3] * C[36] + C[37];
R[4] = tmp25_0;
/* inst#26 op:0x04 */
let tmp26_2 = R[4] * R[2] + R[3];
R[2] = tmp26_2;
/* inst#27 op:0x58 */
let tmp27_3 = R[1] >= 0 ? C[38] : C[39];
R[3] = tmp27_3;
/* inst#28 op:0x02 */
let tmp28_2 = R[2] + R[3];
R[2] = tmp28_2;
/* inst#29 op:0x02 */
let tmp29_3 = R[2] + R[2];
R[3] = tmp29_3;
/* inst#30 op:0x0b */
let tmp30_0 = Math.max(R[0], R[1]);
R[4] = tmp30_0;
/* inst#31 op:0x58 */
let tmp31_0 = R[4] >= 0 ? C[35] : C[34];
R[4] = tmp31_0;
/* inst#32 op:0x0a */
let tmp32_1 = Math.min(R[1], R[0]);
R[5] = tmp32_1;
/* inst#33 op:0x58 */
let tmp33_0 = R[5] >= 0 ? C[34] : R[4];
R[4] = tmp33_0;
/* inst#34 op:0x04 */
let tmp34_0 = R[4] * (-R[3]) + R[2];
R[4] = tmp34_0;
/* inst#35 op:0x05 */
let tmp35_1 = R[1] * R[1];
R[1] = tmp35_1;
/* inst#36 op:0x04 */
let tmp36_0 = R[0] * R[0] + R[1];
R[0] = tmp36_0;
/* inst#37 op:0x07 */
let tmp37_0 = 1 / Math.sqrt(R[0]);
R[0] = tmp37_0;
/* inst#38 op:0x06 */
let tmp38_0 = 1 / R[0];
R[0] = tmp38_0;
/* inst#39 op:0x02 */
let tmp39_1 = R[0] + C[24];
R[5] = tmp39_1;
/* inst#40 op:0x02 */
let tmp40_0 = R[0] + C[40];
R[0] = tmp40_0;
/* inst#41 op:0x0a */
let tmp41_2 = Math.min(R[0], C[35]);
R[6] = tmp41_2;
/* inst#42 op:0x05 */
let tmp42_0 = R[4] * C[40];
let tmp42_1 = R[5] * C[40];
R[0] = tmp42_0;
R[1] = tmp42_1;
/* inst#43 op:0x42 */
SAM[1]!(R[0], R[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#44 op:0x42 */
SAM[0]!(T[0], T[1], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#45 op:0x04 */
let tmp45_0 = R[0] * R[6] + C[41];
R[0] = tmp45_0;
/* inst#46 op:0x02 */
let tmp46_1 = R[9] + R[8];
R[1] = tmp46_1;
/* inst#47 op:0x02 */
let tmp47_1 = R[10] + R[1];
R[1] = tmp47_1;
/* inst#48 op:0x05 */
let tmp48_1 = R[1] * C[42];
R[1] = tmp48_1;
/* inst#49 op:0x05 */
let tmp49_2 = R[0] * R[1];
R[2] = tmp49_2;
/* inst#50 op:0x05 */
let tmp50_2 = R[2] * C[43];
R[2] = tmp50_2;
/* inst#51 op:0x05 */
let tmp51_0 = R[2] * C[20];
let tmp51_1 = R[2] * C[21];
let tmp51_2 = R[2] * C[22];
R[4] = tmp51_0;
R[5] = tmp51_1;
R[6] = tmp51_2;
/* inst#52 op:0x58 */
let tmp52_0 = R[0] >= 0 ? R[4] : C[34];
let tmp52_1 = R[0] >= 0 ? R[5] : C[34];
let tmp52_2 = R[0] >= 0 ? R[6] : C[34];
R[4] = tmp52_0;
R[5] = tmp52_1;
R[6] = tmp52_2;
/* inst#53 op:0x04 */
let tmp53_0 = C[16] * R[1] + R[4];
let tmp53_1 = C[17] * R[1] + R[5];
let tmp53_2 = C[18] * R[1] + R[6];
R[0] = tmp53_0;
R[1] = tmp53_1;
R[2] = tmp53_2;
/* inst#54 op:0x01 */
let tmp54_3 = C[35];
R[3] = tmp54_3;
/* inst#55 op:0x05 */
let tmp55_0 = R[11] * R[0];
let tmp55_1 = R[11] * R[1];
let tmp55_2 = R[11] * R[2];
let tmp55_3 = R[11] * R[3];
R[0] = tmp55_0;
R[1] = tmp55_1;
R[2] = tmp55_2;
R[3] = tmp55_3;
/* inst#56 op:0x05 */
let tmp56_0 = R[0] * V[0];
let tmp56_1 = R[1] * V[1];
let tmp56_2 = R[2] * V[2];
let tmp56_3 = R[3] * V[3];
R[0] = tmp56_0;
R[1] = tmp56_1;
R[2] = tmp56_2;
R[3] = tmp56_3;
/* inst#57 op:0x01 */
let tmp57_0 = R[0];
let tmp57_1 = R[1];
let tmp57_2 = R[2];
let tmp57_3 = R[3];
O[0] = tmp57_0;
O[1] = tmp57_1;
O[2] = tmp57_2;
O[3] = tmp57_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

