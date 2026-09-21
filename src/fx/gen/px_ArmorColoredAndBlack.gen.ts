/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=123, 实指令=24,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorColoredAndBlack(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#2 op:0x42 */
SAM[0]!(T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#3 op:0x0b */
let tmp3_3 = Math.max(R[1], R[2]);
R[7] = tmp3_3;
/* inst#4 op:0x0b */
let tmp4_3 = Math.max(R[0], R[7]);
R[11] = tmp4_3;
/* inst#5 op:0x0a */
let tmp5_0 = Math.min(R[2], R[1]);
R[4] = tmp5_0;
/* inst#6 op:0x0a */
let tmp6_0 = Math.min(R[4], R[0]);
R[8] = tmp6_0;
/* inst#7 op:0x02 */
let tmp7_0 = R[11] + R[8];
R[4] = tmp7_0;
/* inst#8 op:0x02 */
let tmp8_1 = R[11] + (-R[8]);
R[5] = tmp8_1;
/* inst#9 op:0x04 */
let tmp9_2 = R[4] * (-C[20]) + C[21];
R[6] = tmp9_2;
/* inst#10 op:0x01 */
let tmp10_3 = C[22];
R[7] = tmp10_3;
/* inst#11 op:0x04 */
let tmp11_0 = R[6] * (-C[0]) + R[7];
let tmp11_1 = R[6] * (-C[1]) + R[7];
let tmp11_2 = R[6] * (-C[2]) + R[7];
R[8] = tmp11_0;
R[9] = tmp11_1;
R[10] = tmp11_2;
/* inst#12 op:0x04 */
let tmp12_3 = R[4] * (-C[20]) + C[20];
R[11] = tmp12_3;
/* inst#13 op:0x05 */
let tmp13_0 = R[4] * C[12];
let tmp13_1 = R[4] * C[13];
let tmp13_2 = R[4] * C[14];
R[12] = tmp13_0;
R[13] = tmp13_1;
R[14] = tmp13_2;
/* inst#14 op:0x58 */
let tmp14_0 = R[11] >= 0 ? R[12] : R[8];
let tmp14_1 = R[11] >= 0 ? R[13] : R[9];
let tmp14_2 = R[11] >= 0 ? R[14] : R[10];
R[8] = tmp14_0;
R[9] = tmp14_1;
R[10] = tmp14_2;
/* inst#15 op:0x04 */
let tmp15_0 = R[4] * (-C[20]) + R[8];
let tmp15_1 = R[4] * (-C[20]) + R[9];
let tmp15_2 = R[4] * (-C[20]) + R[10];
R[8] = tmp15_0;
R[9] = tmp15_1;
R[10] = tmp15_2;
/* inst#16 op:0x05 */
let tmp16_3 = R[4] * C[20];
R[11] = tmp16_3;
/* inst#17 op:0x05 */
let tmp17_0 = R[5] * C[16];
R[4] = tmp17_0;
/* inst#18 op:0x04 */
let tmp18_1 = R[5] * C[24] + C[25];
R[5] = tmp18_1;
/* inst#19 op:0x01 */
let tmp19_0 = C[4];
R[12] = tmp19_0;
/* inst#20 op:0x04 */
let tmp20_0 = R[4] * R[12] + C[8];
R[4] = tmp20_0;
/* inst#21 op:0x04 */
let tmp21_0 = R[4] * R[8] + R[11];
let tmp21_1 = R[4] * R[9] + R[11];
let tmp21_2 = R[4] * R[10] + R[11];
R[8] = tmp21_0;
R[9] = tmp21_1;
R[10] = tmp21_2;
/* inst#22 op:0x05 */
let tmp22_0 = R[3] * R[8];
let tmp22_1 = R[3] * R[9];
let tmp22_2 = R[3] * R[10];
R[8] = tmp22_0;
R[9] = tmp22_1;
R[10] = tmp22_2;
/* inst#23 op:0x05 */
let tmp23_0 = R[5] * R[8];
let tmp23_1 = R[5] * R[9];
let tmp23_2 = R[5] * R[10];
R[0] = tmp23_0;
R[1] = tmp23_1;
R[2] = tmp23_2;
/* inst#24 op:0x05 */
let tmp24_0 = R[0] * V[0];
let tmp24_1 = R[1] * V[1];
let tmp24_2 = R[2] * V[2];
let tmp24_3 = R[3] * V[3];
R[0] = tmp24_0;
R[1] = tmp24_1;
R[2] = tmp24_2;
R[3] = tmp24_3;
/* inst#25 op:0x01 */
let tmp25_0 = R[0];
let tmp25_1 = R[1];
let tmp25_2 = R[2];
let tmp25_3 = R[3];
O[0] = tmp25_0;
O[1] = tmp25_1;
O[2] = tmp25_2;
O[3] = tmp25_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

