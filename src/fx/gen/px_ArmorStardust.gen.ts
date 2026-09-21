/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=168, 实指令=34,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorStardust(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#3 op:0x05 */
let tmp3_0 = T[0] * C[0];
let tmp3_1 = T[1] * C[1];
R[0] = tmp3_0;
R[1] = tmp3_1;
/* inst#4 op:0x13 */
let tmp4_2 = R[1] - Math.floor(R[1]);
let tmp4_3 = R[0] - Math.floor(R[0]);
R[2] = tmp4_2;
R[3] = tmp4_3;
/* inst#5 op:0x02 */
let tmp5_0 = R[0] + (-R[3]);
let tmp5_1 = R[1] + (-R[2]);
R[0] = tmp5_0;
R[1] = tmp5_1;
/* inst#6 op:0x05 */
let tmp6_0 = R[0] * C[4];
let tmp6_1 = R[1] * C[5];
R[0] = tmp6_0;
R[1] = tmp6_1;
/* inst#7 op:0x01 */
let tmp7_0 = C[24];
let tmp7_1 = C[25];
R[4] = tmp7_0;
R[5] = tmp7_1;
/* inst#8 op:0x04 */
let tmp8_0 = R[0] * R[4] + (-C[20]);
let tmp8_1 = R[1] * R[5] + (-C[21]);
R[0] = tmp8_0;
R[1] = tmp8_1;
/* inst#9 op:0x01 */
let tmp9_0 = C[28];
R[4] = tmp9_0;
/* inst#10 op:0x04 */
let tmp10_2 = R[0] * R[4] + C[8];
R[2] = tmp10_2;
/* inst#11 op:0x04 */
let tmp11_2 = R[1] * C[28] + R[2];
R[2] = tmp11_2;
/* inst#12 op:0x05 */
let tmp12_0 = R[0] * C[28];
let tmp12_1 = R[1] * C[28];
R[0] = tmp12_0;
R[1] = tmp12_1;
/* inst#13 op:0x42 */
SAM[1]!(R[0], R[1], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#14 op:0x42 */
SAM[0]!(T[0], T[1], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#15 op:0x02 */
let tmp15_0 = R[2] + C[31];
let tmp15_1 = R[2] + C[30];
let tmp15_2 = R[2] + C[29];
R[0] = tmp15_0;
R[1] = tmp15_1;
R[2] = tmp15_2;
/* inst#16 op:0x23 */
let tmp16_0 = Math.abs(R[0]);
let tmp16_1 = Math.abs(R[1]);
let tmp16_2 = Math.abs(R[2]);
R[12] = tmp16_0;
R[13] = tmp16_1;
R[14] = tmp16_2;
/* inst#17 op:0x13 */
let tmp17_0 = R[12] - Math.floor(R[12]);
let tmp17_1 = R[13] - Math.floor(R[13]);
let tmp17_2 = R[14] - Math.floor(R[14]);
R[12] = tmp17_0;
R[13] = tmp17_1;
R[14] = tmp17_2;
/* inst#18 op:0x58 */
let tmp18_0 = R[0] >= 0 ? R[12] : (-R[12]);
let tmp18_1 = R[1] >= 0 ? R[13] : (-R[13]);
let tmp18_2 = R[2] >= 0 ? R[14] : (-R[14]);
R[0] = tmp18_0;
R[1] = tmp18_1;
R[2] = tmp18_2;
/* inst#19 op:0x04 */
let tmp19_0 = R[0] * C[32] + C[33];
let tmp19_1 = R[1] * C[32] + C[33];
let tmp19_2 = R[2] * C[32] + C[33];
R[0] = tmp19_0;
R[1] = tmp19_1;
R[2] = tmp19_2;
/* inst#20 op:0x23 */
let tmp20_0 = Math.abs(R[0]);
let tmp20_1 = Math.abs(R[1]);
let tmp20_2 = Math.abs(R[2]);
R[0] = tmp20_0;
R[1] = tmp20_1;
R[2] = tmp20_2;
/* inst#21 op:0x02 */
let tmp21_0 = (-R[0]) + C[34];
let tmp21_1 = (-R[1]) + C[34];
let tmp21_2 = (-R[2]) + C[34];
R[0] = tmp21_0;
R[1] = tmp21_1;
R[2] = tmp21_2;
/* inst#22 op:0x05 */
let tmp22_0 = R[4] * R[0];
let tmp22_1 = R[5] * R[1];
let tmp22_2 = R[6] * R[2];
R[0] = tmp22_0;
R[1] = tmp22_1;
R[2] = tmp22_2;
/* inst#23 op:0x05 */
let tmp23_0 = R[0] * R[0];
let tmp23_1 = R[1] * R[1];
R[0] = tmp23_0;
R[1] = tmp23_1;
/* inst#24 op:0x02 */
let tmp24_0 = R[1] + R[0];
R[0] = tmp24_0;
/* inst#25 op:0x04 */
let tmp25_0 = R[2] * R[2] + R[0];
R[0] = tmp25_0;
/* inst#26 op:0x04 */
let tmp26_0 = R[0] * C[36] + C[37];
R[0] = sat(tmp26_0);
/* inst#27 op:0x05 */
let tmp27_0 = R[0] * C[16];
let tmp27_1 = R[0] * C[17];
let tmp27_2 = R[0] * C[18];
R[0] = tmp27_0;
R[1] = tmp27_1;
R[2] = tmp27_2;
/* inst#28 op:0x05 */
let tmp28_0 = R[11] * R[0];
let tmp28_1 = R[11] * R[1];
let tmp28_2 = R[11] * R[2];
R[0] = tmp28_0;
R[1] = tmp28_1;
R[2] = tmp28_2;
/* inst#29 op:0x05 */
let tmp29_0 = R[0] * C[38];
let tmp29_1 = R[1] * C[38];
let tmp29_2 = R[2] * C[38];
R[0] = tmp29_0;
R[1] = tmp29_1;
R[2] = tmp29_2;
/* inst#30 op:0x02 */
let tmp30_3 = R[9] + R[8];
R[3] = tmp30_3;
/* inst#31 op:0x02 */
let tmp31_3 = R[10] + R[3];
R[3] = tmp31_3;
/* inst#32 op:0x05 */
let tmp32_3 = R[3] * C[35];
R[3] = tmp32_3;
/* inst#33 op:0x05 */
let tmp33_0 = R[3] * C[12];
let tmp33_1 = R[3] * C[13];
let tmp33_2 = R[3] * C[14];
R[4] = tmp33_0;
R[5] = tmp33_1;
R[6] = tmp33_2;
/* inst#34 op:0x04 */
let tmp34_0 = R[4] * R[11] + R[0];
let tmp34_1 = R[5] * R[11] + R[1];
let tmp34_2 = R[6] * R[11] + R[2];
R[8] = tmp34_0;
R[9] = tmp34_1;
R[10] = tmp34_2;
/* inst#35 op:0x05 */
let tmp35_0 = R[8] * V[0];
let tmp35_1 = R[9] * V[1];
let tmp35_2 = R[10] * V[2];
let tmp35_3 = R[11] * V[3];
R[0] = tmp35_0;
R[1] = tmp35_1;
R[2] = tmp35_2;
R[3] = tmp35_3;
/* inst#36 op:0x01 */
let tmp36_0 = R[0];
let tmp36_1 = R[1];
let tmp36_2 = R[2];
let tmp36_3 = R[3];
O[0] = tmp36_0;
O[1] = tmp36_1;
O[2] = tmp36_2;
O[3] = tmp36_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

