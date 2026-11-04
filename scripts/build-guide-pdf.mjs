// สร้างอินโฟกราฟิกคู่มือใช้งาน (ฉบับพิมพ์) เป็น PDF 2 ไฟล์ ไฟล์ละ 1 หน้า A4: หน้าบ้าน (สาขา) / หลังบ้าน (สำนักงานใหญ่)
// ขาวดำ ใช้เส้นและกรอบแทนพื้นสี เพื่อประหยัดหมึก — รัน: node scripts/build-guide-pdf.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { Document, Font, Page, StyleSheet, Text, View, renderToFile } from '@react-pdf/renderer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const h = React.createElement;

Font.register({
  family: 'THSarabunNew',
  fonts: [
    { src: path.join(root, 'public/fonts/THSarabunNew.ttf') },
    { src: path.join(root, 'public/fonts/THSarabunNew-Bold.ttf'), fontWeight: 'bold' },
  ],
});
// ภาษาไทยไม่มีช่องว่างระหว่างคำ — แบ่งคำให้ตัดบรรทัดได้
const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
Font.registerHyphenationCallback((word) =>
  /[฀-๿]/.test(word) ? Array.from(segmenter.segment(word), (part) => part.segment).flatMap((part) => [part, '']) : [word],
);

const INK = '#111111';
const SOFT = '#555555';
const LINE = '#9a9a9a';

const s = StyleSheet.create({
  page: { fontFamily: 'THSarabunNew', fontSize: 14, color: INK, paddingTop: 24, paddingBottom: 30, paddingHorizontal: 34, lineHeight: 1.1 },
  eyebrow: { fontSize: 12, color: SOFT },
  title: { fontSize: 30, fontWeight: 'bold', lineHeight: 1.35, marginTop: 2 },
  sub: { fontSize: 14, color: SOFT },
  tags: { flexDirection: 'row', gap: 6, marginTop: 6 },
  tag: { borderWidth: 0.8, borderColor: INK, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 1, fontSize: 12 },
  rule: { borderBottomWidth: 1.5, borderBottomColor: INK, marginTop: 8, marginBottom: 10 },

  flowLabel: { fontSize: 13, fontWeight: 'bold', marginBottom: 5 },
  flow: { flexDirection: 'row', alignItems: 'center' },
  stage: { flex: 1, borderWidth: 0.8, borderColor: LINE, borderRadius: 8, paddingVertical: 5, alignItems: 'center' },
  stageMine: { borderWidth: 2.2, borderColor: INK },
  stageNo: { fontSize: 11, color: SOFT },
  stageName: { fontSize: 14, fontWeight: 'bold' },
  stageWho: { fontSize: 11, color: SOFT },
  stageWhoMine: { fontSize: 11, fontWeight: 'bold' },
  arrow: { width: 14, textAlign: 'center', fontSize: 14, color: SOFT },
  legend: { fontSize: 11, color: SOFT, marginTop: 4 },

  steps: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6 },
half: { width: '49.2%' },
full: { width: '100%' },
  step: { flexDirection: 'row', gap: 10, borderWidth: 0.8, borderColor: LINE, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  num: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.8, borderColor: INK, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 15, fontWeight: 'bold', lineHeight: 1 },
  body: { flex: 1 },
  stepTitle: { fontSize: 16.5, fontWeight: 'bold', lineHeight: 1.3 },
  bulletRow: { flexDirection: 'row' },
  bulletDot: { width: 10, fontSize: 14 },
  bulletText: { flex: 1, fontSize: 14 },
  bold: { fontWeight: 'bold' },
  press: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 3 },
  pressLabel: { fontSize: 12, color: SOFT },
  button: { borderWidth: 1.2, borderColor: INK, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, fontSize: 13, fontWeight: 'bold' },

  note: { marginTop: 8, borderWidth: 1.2, borderColor: INK, borderStyle: 'dashed', borderRadius: 10, padding: 9 },
  noteTitle: { fontSize: 15, fontWeight: 'bold' },
  tips: { flexDirection: 'row', gap: 10, marginTop: 8 },
  tip: { flex: 1, borderTopWidth: 1.5, borderTopColor: INK, paddingTop: 4 },
  tipTitle: { fontSize: 14, fontWeight: 'bold' },
  tipText: { fontSize: 13, color: SOFT },
  footer: { position: 'absolute', bottom: 16, left: 34, right: 34, fontSize: 11, color: SOFT, flexDirection: 'row', justifyContent: 'space-between' },
});

const STAGES = ['รอตัดบิล', 'ตัดบิลแล้ว', 'กำลังแพ็คของ', 'จัดส่งแล้ว', 'ได้รับสินค้าแล้ว'];

// ข้อความที่มี **ตัวหนา** ในบรรทัด
const rich = (text) =>
  text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part, i) => (part.startsWith('**') ? h(Text, { key: i, style: s.bold }, part.slice(2, -2)) : part));

function Flow({ who, mine }) {
  const items = [];
  STAGES.forEach((name, i) => {
    const isMine = mine.includes(i);
    items.push(
      h(View, { key: `s${i}`, style: [s.stage, isMine ? s.stageMine : null] }, [
        h(Text, { key: 'n', style: s.stageNo }, `ขั้น ${i + 1}`),
        h(Text, { key: 't', style: s.stageName }, name),
        h(Text, { key: 'w', style: isMine ? s.stageWhoMine : s.stageWho }, who[i]),
      ]),
    );
    if (i < STAGES.length - 1) items.push(h(Text, { key: `a${i}`, style: s.arrow }, '>'));
  });
  return h(View, null, [
    h(Text, { key: 'l', style: s.flowLabel }, 'บิลหนึ่งใบเดินแบบนี้'),
    h(View, { key: 'f', style: s.flow }, items),
    h(Text, { key: 'g', style: s.legend }, 'กรอบหนา = ขั้นที่คุณต้องทำ'),
  ]);
}

// ขั้นที่ 1–4 เรียง 2 คอลัมน์ ขั้นสุดท้ายเต็มแถว — ให้จบใน 1 หน้า A4
function Step({ n, title, bullets, buttons, full }) {
  return h(View, { style: [s.step, full ? s.full : s.half], wrap: false }, [
    h(View, { key: 'n', style: s.num }, h(Text, { style: s.numText }, String(n))),
    h(View, { key: 'b', style: s.body }, [
      h(Text, { key: 't', style: s.stepTitle }, title),
      ...bullets.map((line, i) => h(View, { key: `l${i}`, style: s.bulletRow }, [h(Text, { key: 'd', style: s.bulletDot }, '•'), h(Text, { key: 'x', style: s.bulletText }, rich(line))])),
      buttons?.length
        ? h(View, { key: 'p', style: s.press }, [h(Text, { key: 'l', style: s.pressLabel }, 'กดปุ่ม'), ...buttons.map((label, i) => h(Text, { key: i, style: s.button }, label))])
        : null,
    ]),
  ]);
}

function Sheet({ audience, title, sub, tags, flow, steps, note, tips }) {
  return h(Document, { title: `คู่มือ${title}`, author: 'Aemori' }, h(Page, { size: 'A4', style: s.page }, [
    h(Text, { key: 'e', style: s.eyebrow }, 'คู่มือใช้งาน · ระบบแจ้งสินค้าใกล้หมด Aemori'),
    h(Text, { key: 't', style: s.title }, title),
    h(Text, { key: 's', style: s.sub }, sub),
    h(View, { key: 'g', style: s.tags }, tags.map((tag, i) => h(Text, { key: i, style: s.tag }, tag))),
    h(View, { key: 'r', style: s.rule }),
    h(Flow, { key: 'f', ...flow }),
    h(View, { key: 'st', style: s.steps }, steps.map((step, i) => h(Step, { key: i, n: i + 1, full: i === steps.length - 1, ...step }))),
    h(View, { key: 'no', style: s.note, wrap: false }, [h(Text, { key: 't', style: s.noteTitle }, note.title), h(Text, { key: 'b' }, rich(note.body))]),
    h(View, { key: 'tp', style: s.tips }, tips.map(([head, text], i) => h(View, { key: i, style: s.tip }, [h(Text, { key: 'h', style: s.tipTitle }, head), h(Text, { key: 'x', style: s.tipText }, text)]))),
    h(View, { key: 'ft', style: s.footer, fixed: true }, [h(Text, { key: 'a' }, `Aemori · ${audience}`), h(Text, { key: 'b' }, 'ฉบับ 4 พ.ย. 2569')]),
  ]));
}

const branch = {
  audience: 'หน้าบ้าน (พนักงานสาขา)',
  title: 'หน้าบ้าน สำหรับพนักงานสาขา',
  sub: 'เห็นของใกล้หมดหน้าร้าน ถ่ายรูปแจ้งเข้าบิลได้ทันที แล้วเช็คของตอนสำนักงานใหญ่ส่งมาถึง',
  tags: ['ใช้บนมือถือ', 'ไม่ต้องใช้รหัส', 'ลงชื่อทุกครั้งที่ทำรายการ'],
  flow: { mine: [0, 4], who: ['สาขาแจ้งของ', 'สำนักงานใหญ่', 'สำนักงานใหญ่', 'สำนักงานใหญ่', 'สาขาเช็คของ'] },
  steps: [
    { title: 'เข้าระบบและเลือกสาขา', bullets: ['หน้าแรก เลือก **แจ้งสินค้าใกล้หมด**', 'เลือกสาขาที่ประจำอยู่ ครั้งต่อไประบบจำสาขาไว้ให้'], buttons: ['เลือกสาขา'] },
    {
      title: 'ถ่ายรูปแจ้งของใกล้หมด',
      bullets: ['ถ่ายรูปสินค้า **1 รูป** ให้เห็นชื่อหรือฉลากชัด', 'ใส่ชื่อสินค้า รหัส และ**จำนวนที่เหลือหน้าร้าน** หมดแล้วใส่ 0', 'ลงชื่อ หรือกดชื่อที่เคยใช้ในสาขานี้'],
      buttons: ['เพิ่มสินค้าใกล้หมด', 'บันทึก แล้วเพิ่มรายการต่อ', 'บันทึกแล้วปิด'],
    },
    { title: 'ลงผิด แก้ได้ก่อนตัดบิล', bullets: ['แตะรายการในหน้า **บิลปัจจุบัน** เพื่อแก้ไขหรือลบ ต้องลงชื่อทุกครั้ง', 'เมื่อสำนักงานใหญ่ตัดบิลแล้ว จะแก้ไม่ได้อีก'], buttons: ['บันทึกการแก้ไข'] },
    { title: 'ติดตามสถานะบิล', bullets: ['แท็บ **ติดตามสถานะ** ดูว่าบิลอยู่ขั้นไหน ใครทำ เมื่อไร', 'กระดิ่งแจ้งเตือนเมื่อตัดบิล จัดส่ง หรือมีการแก้รายการ'], buttons: ['ติดตามสถานะ'] },
    {
      title: 'ของมาถึง: เช็คของแล้วยืนยันรับ',
      bullets: [
        'บิลที่ **จัดส่งแล้ว** กดเช็คของ แล้วลงชื่อผู้เช็คของ',
        'ทีละรายการ กด **ได้รับ** หรือ **ไม่ได้รับ/ไม่ครบ** (ต้องเขียนหมายเหตุ เช่น ได้รับของผิดรายการ)',
        'กดยืนยันรับสินค้า แล้วส่งออก PDF เก็บเป็นหลักฐานได้',
      ],
      buttons: ['เช็คของ / ยืนยันรับสินค้า', 'ได้รับ', 'ไม่ได้รับ/ไม่ครบ', 'ส่งออก PDF'],
    },
  ],
  note: {
    title: 'ถ้าของมาไม่ครบ หรือสำนักงานใหญ่ไม่ได้ส่งบางรายการ',
    body: 'ดูเหตุผลได้ในกล่อง **สำนักงานใหญ่ไม่ได้จัดส่ง** ของบิลนั้น · ของที่ขาดอาจถูก**ยกยอดไปบิลถัดไป** จะเห็นรายการที่เขียนว่า “ยกยอดจากบิล AMR-…” อยู่ในบิลปัจจุบัน ไม่ต้องแจ้งซ้ำ',
  },
  tips: [
    ['รูปชัด งานเร็ว', 'ให้เห็นชื่อหรือบาร์โค้ด คนจัดของหยิบถูกตั้งแต่แรก'],
    ['นับของจริง', 'จำนวนที่เหลือ นับเฉพาะของที่วางขายหน้าร้าน'],
    ['ประวัติ 3 บิล', 'ระบบเก็บบิลล่าสุด 3 บิล บิลที่มีปัญหาจะไม่ถูกลบ'],
  ],
};

const hq = {
  audience: 'หลังบ้าน (สำนักงานใหญ่)',
  title: 'หลังบ้าน สำหรับสำนักงานใหญ่',
  sub: 'รวมรายการจากทุกสาขา ตัดบิลพร้อมกัน แพ็คของ จัดส่ง และตามแก้ปัญหาจนบิลจบ',
  tags: ['เข้าด้วยรหัสผู้ดูแล', 'ติ๊ก “จำเครื่องนี้” ได้', 'ทุกขั้นต้องใส่ชื่อคนทำ'],
  flow: { mine: [1, 2, 3], who: ['สาขาแจ้งของ', 'ตัดบิลทุกสาขา', 'ติ๊กครบทุกรายการ', 'กดจัดส่ง', 'สาขาเช็คของ'] },
  steps: [
    { title: 'ดูภาพรวมที่แดชบอร์ด', bullets: ['จำนวนบิลแต่ละสถานะ และ**บิลมีปัญหา**', 'สรุปสินค้า: ของที่สาขาแจ้งรอบนี้ ของหมดที่สาขา รอแพ็ค และของขาด'], buttons: ['แดชบอร์ด'] },
    {
      title: 'ตัดบิลทุกสาขาพร้อมกัน',
      bullets: ['หน้า **บิลทุกสาขา** กดปุ่มใหญ่ ใส่ชื่อผู้รับผิดชอบบิลครั้งเดียว', 'ตัดเฉพาะบิลที่มีรายการ แล้วเปิดบิลใหม่ให้อัตโนมัติ', 'อยากตรวจทีละบิล ให้เปิดบิลแล้วกดตรวจและตัดบิล'],
      buttons: ['ตัดบิลทุกสาขา', 'ตรวจและตัดบิล'],
    },
    {
      title: 'แพ็คของ',
      bullets: [
        'เมนู **แพ็คของ** เปิดบิล ลงชื่อผู้แพ็ค แล้วแตะติ๊กทีละรายการ',
        'ไม่มีของ หรือใช้ของแทน ต้องเขียนหมายเหตุ ระบบแจ้งสาขาให้',
        'ให้คนอื่นเดินหยิบ: ส่ง**ลิงก์หยิบของ**ทาง LINE เปิดได้ไม่ต้องใช้รหัส ใช้ได้ 24 ชม.',
      ],
      buttons: ['แพ็คของ', 'ลิงก์หยิบของ', 'ไม่มีของ / ปฏิเสธ', 'ใช้สินค้าทดแทน'],
    },
    { title: 'จัดส่ง', bullets: ['แพ็คครบทุกรายการก่อน ปุ่มจัดส่งถึงจะกดได้', 'ใส่**ชื่อผู้ส่ง** สาขาได้รับแจ้งให้เตรียมเช็คของ', 'พิมพ์ใบจัดสินค้า A4 หรือส่งออก Excel / PDF ได้จากหน้าบิล'], buttons: ['จัดส่ง', 'ใบจัดสินค้า A4'] },
    {
      title: 'สาขาแจ้งของไม่ครบ: แก้ไขปัญหาให้จบ',
      bullets: [
        'บิลขึ้นป้ายมีปัญหาในแดชบอร์ดและหน้าประวัติบิล จนกว่าจะกดแก้ไข',
        'เลือกทีละรายการที่ขาด: **ยกยอดตัวเดิม** / **ยกยอดเป็นของทดแทน** / **ไม่ยกยอด** (เขียนหมายเหตุ)',
        'ของที่ยกยอดจะเข้าบิลรอบถัดไปของสาขาทันที',
      ],
      buttons: ['แก้ไขปัญหา / ยกยอดไปบิลถัดไป'],
    },
  ],
  note: { title: 'ดูย้อนหลัง', body: 'หน้า **ประวัติบิล** เก็บบิลที่จบแล้ว สาขาละ 3 บิลล่าสุด กรองดูทีละสาขาได้ · หน้า **ประวัติการแก้ไข** บอกว่าใครแก้อะไร เมื่อไร พร้อมเหตุผล' },
  tips: [
    ['ตัดบิลพร้อมกัน', 'ตัดรอบเดียวทุกสาขา งานไม่ตกหล่น'],
    ['ชื่อคนทำงาน', 'ผู้รับผิดชอบ ผู้แพ็ค ผู้ส่ง บันทึกไว้ในบิล'],
    ['จัดการสาขา', 'ระบบเบิกสินค้า > คลังสินค้า (มีประวัติจะซ่อนแทนลบ)'],
  ],
};

const outDir = path.join(root, 'docs/guide');
await renderToFile(h(Sheet, branch), path.join(outDir, 'aemori-guide-branch.pdf'));
await renderToFile(h(Sheet, hq), path.join(outDir, 'aemori-guide-hq.pdf'));
console.log('ok', outDir);
