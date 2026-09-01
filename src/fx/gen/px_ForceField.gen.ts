/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=265, 实指令=50,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ForceField(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#8 op:0x02 */
let tmp8_0 = T[0] + (-C[0]);
let tmp8_1 = T[1] + (-C[1]);
R[0] = tmp8_0;
R[1] = tmp8_1;
/* inst#9 op:0x01 */
let tmp9_3 = C[20];
R[7] = tmp9_3;
/* inst#10 op:0x04 */
let tmp10_0 = R[0] * C[4] + R[7];
let tmp10_1 = R[1] * C[5] + R[7];
R[0] = tmp10_0;
R[1] = tmp10_1;
/* inst#11 op:0x01 */
let tmp11_3 = C[27];
R[3] = tmp11_3;
/* inst#12 op:0x04 */
let tmp12_2 = R[1] * R[3] + C[12];
R[2] = tmp12_2;
/* inst#13 op:0x05 */
let tmp13_0 = R[0] * C[21];
let tmp13_1 = R[1] * C[22];
R[0] = tmp13_0;
R[1] = tmp13_1;
/* inst#14 op:0x5a */
R[0] = R[0] * R[0] + R[1] * R[1] + C[23];
/* inst#15 op:0x07 */
let tmp15_0 = 1 / Math.sqrt(R[0]);
R[0] = tmp15_0;
/* inst#16 op:0x06 */
let tmp16_0 = 1 / R[0];
R[0] = tmp16_0;
/* inst#17 op:0x05 */
let tmp17_1 = R[2] * C[38];
R[1] = tmp17_1;
/* inst#18 op:0x23 */
let tmp18_1 = Math.abs(R[1]);
R[1] = tmp18_1;
/* inst#19 op:0x13 */
let tmp19_1 = R[1] - Math.floor(R[1]);
R[1] = tmp19_1;
/* inst#20 op:0x58 */
let tmp20_1 = R[2] >= 0 ? R[1] : (-R[1]);
R[1] = tmp20_1;
/* inst#21 op:0x04 */
let tmp21_2 = R[1] * C[34] + C[35];
R[2] = tmp21_2;
/* inst#22 op:0x04 */
let tmp22_1 = R[1] * C[32] + C[33];
R[1] = tmp22_1;
/* inst#23 op:0x13 */
let tmp23_2 = R[2] - Math.floor(R[2]);
R[2] = tmp23_2;
/* inst#24 op:0x04 */
let tmp24_2 = R[2] * C[40] + C[41];
R[2] = tmp24_2;
/* inst#25 op:0x58 */
let tmp25_1 = R[1] >= 0 ? C[39] : R[2];
R[1] = tmp25_1;
/* inst#26 op:0x25 */
R[4] = Math.cos(R[1]);
/* inst#27 op:0x04 */
let tmp27_1 = R[4] * C[42] + C[43];
R[1] = tmp27_1;
/* inst#28 op:0x05 */
let tmp28_2 = R[0] * C[24];
R[2] = tmp28_2;
/* inst#29 op:0x04 */
let tmp29_0 = R[0] * C[24] + C[25];
R[0] = tmp29_0;
/* inst#30 op:0x05 */
let tmp30_0 = R[0] * C[26];
R[0] = sat(tmp30_0);
/* inst#31 op:0x07 */
let tmp31_3 = 1 / Math.sqrt(R[2]);
R[3] = tmp31_3;
/* inst#32 op:0x06 */
let tmp32_3 = 1 / R[3];
R[3] = tmp32_3;
/* inst#33 op:0x02 */
let tmp33_0 = T[0] + (-C[8]);
let tmp33_1 = T[1] + (-C[9]);
R[4] = tmp33_0;
R[5] = tmp33_1;
/* inst#34 op:0x04 */
let tmp34_0 = R[4] * R[3] + (-C[20]);
let tmp34_1 = R[5] * R[3] + (-C[20]);
R[4] = tmp34_0;
R[5] = tmp34_1;
/* inst#35 op:0x42 */
SAM[0](R[4], R[5], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#36 op:0x04 */
let tmp36_3 = R[4] * R[1] + C[28];
R[3] = tmp36_3;
/* inst#37 op:0x05 */
let tmp37_3 = R[3] * C[26];
R[3] = sat(tmp37_3);
/* inst#38 op:0x04 */
let tmp38_1 = R[3] * C[36] + C[37];
R[5] = tmp38_1;
/* inst#39 op:0x05 */
let tmp39_3 = R[3] * R[3];
R[3] = tmp39_3;
/* inst#40 op:0x05 */
let tmp40_3 = R[5] * R[3];
R[3] = tmp40_3;
/* inst#41 op:0x06 */
let tmp41_1 = 1 / R[4];
R[5] = tmp41_1;
/* inst#42 op:0x05 */
let tmp42_0 = R[4] * R[4];
R[4] = tmp42_0;
/* inst#43 op:0x12 */
let tmp43_3 = R[3] * R[5] + (1 - R[3]) * C[22];
R[11] = tmp43_3;
/* inst#44 op:0x05 */
let tmp44_3 = R[4] * R[11];
R[3] = tmp44_3;
/* inst#45 op:0x04 */
let tmp45_0 = R[0] * C[36] + C[37];
R[4] = tmp45_0;
/* inst#46 op:0x05 */
let tmp46_0 = R[0] * R[0];
R[0] = tmp46_0;
/* inst#47 op:0x04 */
let tmp47_0 = R[4] * (-R[0]) + C[22];
R[0] = tmp47_0;
/* inst#48 op:0x05 */
let tmp48_1 = R[1] * R[0];
R[1] = tmp48_1;
/* inst#49 op:0x05 */
let tmp49_3 = R[3] * R[1];
R[7] = tmp49_3;
/* inst#50 op:0x05 */
let tmp50_0 = R[7] * C[16];
let tmp50_1 = R[7] * C[17];
let tmp50_2 = R[7] * C[18];
R[4] = tmp50_0;
R[5] = tmp50_1;
R[6] = tmp50_2;
/* inst#51 op:0x05 */
let tmp51_1 = R[2] * R[2];
R[1] = tmp51_1;
/* inst#52 op:0x05 */
let tmp52_0 = R[0] * R[1];
R[0] = tmp52_0;
/* inst#53 op:0x05 */
let tmp53_3 = R[2] * R[0];
R[3] = tmp53_3;
/* inst#54 op:0x05 */
let tmp54_0 = R[3] * C[16];
let tmp54_1 = R[3] * C[17];
let tmp54_2 = R[3] * C[18];
R[0] = tmp54_0;
R[1] = tmp54_1;
R[2] = tmp54_2;
/* inst#55 op:0x04 */
let tmp55_0 = R[0] * C[29] + R[4];
let tmp55_1 = R[1] * C[29] + R[5];
let tmp55_2 = R[2] * C[29] + R[6];
let tmp55_3 = R[3] * C[29] + R[7];
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

