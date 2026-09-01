/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=200, 实指令=40,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorAcid(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#5 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#6 op:0x01 */
let tmp6_0 = C[16];
let tmp6_1 = C[17];
R[4] = tmp6_0;
R[5] = tmp6_1;
/* inst#7 op:0x04 */
let tmp7_0 = T[0] * R[4] + (-C[12]);
let tmp7_1 = T[1] * R[5] + (-C[13]);
R[4] = tmp7_0;
R[5] = tmp7_1;
/* inst#8 op:0x01 */
let tmp8_1 = C[21];
let tmp8_2 = C[22];
R[9] = tmp8_1;
R[10] = tmp8_2;
/* inst#9 op:0x04 */
let tmp9_0 = R[4] * C[0] + R[9];
let tmp9_1 = R[5] * C[1] + R[10];
R[4] = tmp9_0;
R[5] = tmp9_1;
/* inst#10 op:0x02 */
let tmp10_0 = R[4] + C[22];
R[8] = tmp10_0;
/* inst#11 op:0x02 */
let tmp11_0 = R[1] + R[0];
R[0] = tmp11_0;
/* inst#12 op:0x02 */
let tmp12_0 = R[2] + R[0];
R[0] = tmp12_0;
/* inst#13 op:0x05 */
let tmp13_0 = R[0] * C[20];
R[0] = tmp13_0;
/* inst#14 op:0x07 */
let tmp14_0 = 1 / Math.sqrt(R[0]);
R[0] = tmp14_0;
/* inst#15 op:0x06 */
let tmp15_0 = 1 / R[0];
R[0] = tmp15_0;
/* inst#16 op:0x04 */
let tmp16_1 = R[0] * C[23] + R[5];
R[9] = tmp16_1;
/* inst#17 op:0x5a */
R[1] = R[8] * R[8] + R[9] * R[9] + C[21];
/* inst#18 op:0x07 */
let tmp18_1 = 1 / Math.sqrt(R[1]);
R[1] = tmp18_1;
/* inst#19 op:0x06 */
let tmp19_1 = 1 / R[1];
R[1] = tmp19_1;
/* inst#20 op:0x05 */
let tmp20_2 = R[0] * C[24];
R[2] = tmp20_2;
/* inst#21 op:0x04 */
let tmp21_1 = R[1] * C[25] + (-R[2]);
R[1] = tmp21_1;
/* inst#22 op:0x02 */
let tmp22_1 = R[1] + (-C[4]);
R[1] = tmp22_1;
/* inst#23 op:0x05 */
let tmp23_2 = R[1] * C[26];
R[2] = tmp23_2;
/* inst#24 op:0x23 */
let tmp24_2 = Math.abs(R[2]);
R[2] = tmp24_2;
/* inst#25 op:0x13 */
let tmp25_2 = R[2] - Math.floor(R[2]);
R[2] = tmp25_2;
/* inst#26 op:0x58 */
let tmp26_1 = R[1] >= 0 ? R[2] : (-R[2]);
R[1] = tmp26_1;
/* inst#27 op:0x05 */
let tmp27_1 = R[1] * C[27];
R[1] = tmp27_1;
/* inst#28 op:0x25 */
R[5] = Math.sin(R[1]);
/* inst#29 op:0x02 */
let tmp29_1 = R[5] + C[28];
R[1] = tmp29_1;
/* inst#30 op:0x05 */
let tmp30_2 = R[0] * R[0];
R[2] = tmp30_2;
/* inst#31 op:0x04 */
let tmp31_2 = R[2] * (-R[0]) + C[29];
R[2] = tmp31_2;
/* inst#32 op:0x05 */
let tmp32_0 = R[0] * C[8];
let tmp32_1 = R[0] * C[9];
let tmp32_2 = R[0] * C[10];
R[4] = tmp32_0;
R[5] = tmp32_1;
R[6] = tmp32_2;
/* inst#33 op:0x04 */
let tmp33_3 = R[1] * (-R[2]) + C[29];
R[7] = tmp33_3;
/* inst#34 op:0x05 */
let tmp34_0 = R[4] * R[7];
let tmp34_1 = R[5] * R[7];
let tmp34_2 = R[6] * R[7];
R[4] = tmp34_0;
R[5] = tmp34_1;
R[6] = tmp34_2;
/* inst#35 op:0x01 */
let tmp35_3 = C[29];
R[7] = tmp35_3;
/* inst#36 op:0x05 */
let tmp36_0 = R[3] * R[4];
let tmp36_1 = R[3] * R[5];
let tmp36_2 = R[3] * R[6];
let tmp36_3 = R[3] * R[7];
R[0] = tmp36_0;
R[1] = tmp36_1;
R[2] = tmp36_2;
R[3] = tmp36_3;
/* inst#37 op:0x04 */
let tmp37_0 = V[3] * C[30] + C[31];
R[4] = tmp37_0;
/* inst#38 op:0x0a */
let tmp38_0 = Math.min(R[4], R[0]);
let tmp38_1 = Math.min(R[4], R[1]);
let tmp38_2 = Math.min(R[4], R[2]);
let tmp38_3 = Math.min(R[4], R[3]);
R[8] = tmp38_0;
R[9] = tmp38_1;
R[10] = tmp38_2;
R[11] = tmp38_3;
/* inst#39 op:0x0a */
let tmp39_0 = Math.min(R[8], C[29]);
let tmp39_1 = Math.min(R[9], C[29]);
let tmp39_2 = Math.min(R[10], C[29]);
let tmp39_3 = Math.min(R[11], C[29]);
R[0] = tmp39_0;
R[1] = tmp39_1;
R[2] = tmp39_2;
R[3] = tmp39_3;
/* inst#40 op:0x0b */
let tmp40_0 = Math.max(V[0], V[3]);
let tmp40_1 = Math.max(V[1], V[3]);
let tmp40_2 = Math.max(V[2], V[3]);
R[4] = tmp40_0;
R[5] = tmp40_1;
R[6] = tmp40_2;
/* inst#41 op:0x12 */
let tmp41_0 = (-C[22]) * R[4] + (1 - (-C[22])) * V[0];
let tmp41_1 = (-C[22]) * R[5] + (1 - (-C[22])) * V[1];
let tmp41_2 = (-C[22]) * R[6] + (1 - (-C[22])) * V[2];
R[8] = tmp41_0;
R[9] = tmp41_1;
R[10] = tmp41_2;
/* inst#42 op:0x01 */
let tmp42_3 = V[3];
R[11] = tmp42_3;
/* inst#43 op:0x05 */
let tmp43_0 = R[0] * R[8];
let tmp43_1 = R[1] * R[9];
let tmp43_2 = R[2] * R[10];
let tmp43_3 = R[3] * R[11];
R[0] = tmp43_0;
R[1] = tmp43_1;
R[2] = tmp43_2;
R[3] = tmp43_3;
/* inst#44 op:0x01 */
let tmp44_0 = R[0];
let tmp44_1 = R[1];
let tmp44_2 = R[2];
let tmp44_3 = R[3];
O[0] = tmp44_0;
O[1] = tmp44_1;
O[2] = tmp44_2;
O[3] = tmp44_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

