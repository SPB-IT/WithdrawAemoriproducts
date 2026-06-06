'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import ExcelJS from 'exceljs';
import { PDFDownloadLink, Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

interface ReportItemSummary {
  name: string;
  unit: string;
  totalQuantity: number;
  totalCost: number;
}

interface BranchSummary {
  branchName: string;
  totalOrders: number;
  totalBudget: number;
  itemDetails: ReportItemSummary[];
}

// 1. ลงทะเบียนฟอนต์
Font.register({
  family: 'THSarabunNew',
  src: '/fonts/THSarabunNew.ttf',
});

// 2. กำหนดสไตล์ชุดเดียวที่สมบูรณ์
const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'THSarabunNew' },
  header: { fontSize: 22, textAlign: 'center', marginBottom: 5, fontWeight: 'bold' },
  subHeader: { fontSize: 16, textAlign: 'center', marginBottom: 20 },
  infoSection: { marginBottom: 20, fontSize: 14 },
  table: { display: 'flex', flexDirection: 'column', width: '100%', borderTop: '1px solid #000', borderLeft: '1px solid #000' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#e4e4e4' },
  row: { flexDirection: 'row' },
  cell: { padding: 5, fontSize: 14, borderRight: '1px solid #000', borderBottom: '1px solid #000' },
  col1: { width: '10%', textAlign: 'center' },
  col2: { width: '50%' },
  col3: { width: '20%', textAlign: 'center' },
  col4: { width: '20%', textAlign: 'center' },
  signatureZone: { marginTop: 40, flexDirection: 'row', justifyContent: 'space-between' },
  sigBox: { width: '40%', textAlign: 'center', fontSize: 12 }
});

const ReportPDF = ({ data, title, type }: { data: any, title: string, type: string }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.header}>ใบเบิก - จ่ายพัสดุ</Text>
      <Text style={styles.subHeader}>{title}</Text>
      <Text style={{ fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
        วันที่รายงาน: {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
      </Text>
      
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          {type === 'items' ? (
            <>
              <Text style={[styles.cell, { width: '10%' }]}>ลำดับ</Text>
              <Text style={[styles.cell, { width: '30%' }]}>รายการ</Text>
              <Text style={[styles.cell, { width: '15%' }]}>จำนวน</Text>
              <Text style={[styles.cell, { width: '20%' }]}>ราคา/หน่วย</Text>
              <Text style={[styles.cell, { width: '25%' }]}>รวม(บาท)</Text>
            </>
          ) : (
            <>
              <Text style={[styles.cell, { width: '40%' }]}>ชื่อสาขา</Text>
              <Text style={[styles.cell, { width: '30%' }]}>จำนวนใบเบิก</Text>
              <Text style={[styles.cell, { width: '30%' }]}>งบประมาณรวม</Text>
            </>
          )}
        </View>

        {type === 'items' 
          ? data.itemsList.map((item: any, index: number) => {
              // คำนวณราคาต่อหน่วยจากข้อมูลที่ส่งมา
              const unitPrice = item.totalQuantity > 0 ? (item.totalCost / item.totalQuantity) : 0;
              return (
                <View key={index} style={styles.row}>
                  <Text style={[styles.cell, { width: '10%' }]}>{index + 1}</Text>
                  <Text style={[styles.cell, { width: '30%' }]}>{item.name}</Text>
                  <Text style={[styles.cell, { width: '15%' }]}>{item.totalQuantity} {item.unit}</Text>
                  <Text style={[styles.cell, { width: '20%' }]}>{unitPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</Text>
                  <Text style={[styles.cell, { width: '25%' }]}>{item.totalCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</Text>
                </View>
              );
            })
          : data.branchSummaries.map((b: any, index: number) => (
              <View key={index} style={styles.row}>
                <Text style={[styles.cell, { width: '40%' }]}>{b.branchName}</Text>
                <Text style={[styles.cell, { width: '30%' }]}>{b.totalOrders}</Text>
                <Text style={[styles.cell, { width: '30%' }]}>{b.totalBudget.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</Text>
              </View>
            ))
        }

        {/* บรรทัดสรุปยอดสุทธิ */}
        <View style={[styles.row, { backgroundColor: '#e4e4e4' }]}>
          <Text style={[styles.cell, { width: type === 'items' ? '75%' : '70%', textAlign: 'right', paddingRight: 10, fontWeight: 'bold' }]}>
            รวมยอดสุทธิทั้งสิ้น
          </Text>
          <Text style={[styles.cell, { width: type === 'items' ? '25%' : '30%', fontWeight: 'bold' }]}>
            {data.totalBudget.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
          </Text>
        </View>
      </View>

      <View style={styles.signatureZone}>
        <View style={styles.sigBox}>
          <Text>ลงชื่อ..................................</Text>
          <Text>ผู้เบิก/รับ</Text>
        </View>
        <View style={styles.sigBox}>
          <Text>ลงชื่อ..................................</Text>
          <Text>ผู้อนุมัติ</Text>
        </View>
      </View>
    </Page>
  </Document>
);

export default function AdminReportsPage() {
  const [loading, setLoading] = useState(true);
  
  const [selectedReportType, setSelectedReportType] = useState('all'); 
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [allBranches, setAllBranches] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(''); 

  const [rawRequisitions, setRawRequisitions] = useState<any[]>([]);
  const [rawDetails, setRawDetails] = useState<any[]>([]);

  useEffect(() => {
    async function generateReportData() {
      setLoading(true);
      const { data: reqs, error: reqError } = await supabase
        .from('requisitions')
        .select('id, branch_name, status, created_at')
        .eq('status', 'approved');

      if (reqError || !reqs) {
        setLoading(false);
        return;
      }

      setRawRequisitions(reqs);
      const uniqueBranches = Array.from(new Set(reqs.map(r => r.branch_name)));
      setAllBranches(uniqueBranches);

      const reqIds = reqs.map(r => r.id);
      if (reqIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: details, error: detailError } = await supabase
        .from('requisition_details')
        .select(`
          requisition_id,
          quantity,
          price_at_time,
          items (name, unit)
        `)
        .in('requisition_id', reqIds);

      if (detailError || !details) {
        setLoading(false);
        return;
      }

      setRawDetails(details);
      setLoading(false);
    }
    generateReportData();
  }, []);

  const getFilteredData = () => {
    // ... (ส่วนการกรองข้อมูลเดิมของพี่ชาย ผมคงไว้เหมือนเดิมครับ)
    const filteredReqs = rawRequisitions.filter(r => {
      if (!r.created_at) return false;
      if (!selectedDate) return true; 
      const rDateStr = new Date(r.created_at).toISOString().split('T')[0];
      return rDateStr === selectedDate;
    });

    const filteredReqIds = filteredReqs.map(r => r.id);
    let totalBudgetCounter = 0;
    const globalItemsMap: { [key: string]: ReportItemSummary } = {};
    
    const branchMap: { [key: string]: { totalOrders: number; totalBudget: number; items: { [key: string]: ReportItemSummary } } } = {};
    allBranches.forEach(bName => {
      branchMap[bName] = { totalOrders: 0, totalBudget: 0, items: {} };
    });

    filteredReqs.forEach(r => {
      if (branchMap[r.branch_name]) {
        branchMap[r.branch_name].totalOrders += 1;
      }
    });

    rawDetails.forEach((det: any) => {
      if (!filteredReqIds.includes(det.requisition_id)) return;
      const parentReq = filteredReqs.find(r => r.id === det.requisition_id);
      if (!parentReq) return;

      const branchName = parentReq.branch_name;
      const itemName = det.items?.name || 'ไม่ทราบชื่อสินค้า';
      const itemUnit = det.items?.unit || 'ชิ้น';
      const qty = det.quantity || 0;
      const price = det.price_at_time || 0;
      const cost = qty * price;

      totalBudgetCounter += cost;
      const matchesBranchFilter = selectedReportType !== 'items' || selectedBranch === 'all' || branchName === selectedBranch;

      if (matchesBranchFilter) {
        if (!globalItemsMap[itemName]) {
          globalItemsMap[itemName] = { name: itemName, unit: itemUnit, totalQuantity: 0, totalCost: 0 };
        }
        globalItemsMap[itemName].totalQuantity += qty;
        globalItemsMap[itemName].totalCost += cost;
      }

      if (branchMap[branchName]) {
        branchMap[branchName].totalBudget += cost;
        if (!branchMap[branchName].items[itemName]) {
          branchMap[branchName].items[itemName] = { name: itemName, unit: itemUnit, totalQuantity: 0, totalCost: 0 };
        }
        branchMap[branchName].items[itemName].totalQuantity += qty;
        branchMap[branchName].items[itemName].totalCost += cost;
      }
    });

    const branchReportArray: BranchSummary[] = Object.keys(branchMap).map(bName => ({
      branchName: bName,
      totalOrders: branchMap[bName].totalOrders,
      totalBudget: branchMap[bName].totalBudget,
      itemDetails: Object.values(branchMap[bName].items)
    }));

    const finalBranchSummaries = selectedBranch === 'all' 
      ? branchReportArray 
      : branchReportArray.filter(b => b.branchName === selectedBranch);

    return {
      totalOrders: selectedBranch === 'all' ? filteredReqs.length : (branchMap[selectedBranch]?.totalOrders || 0),
      totalBudget: selectedBranch === 'all' ? totalBudgetCounter : (branchMap[selectedBranch]?.totalBudget || 0),
      itemsList: Object.values(globalItemsMap),
      branchSummaries: finalBranchSummaries
    };
  };

  const currentData = getFilteredData();
  const itemsTotalQty = currentData.itemsList.reduce((sum, item) => sum + item.totalQuantity, 0);
  const itemsTotalCost = currentData.itemsList.reduce((sum, item) => sum + item.totalCost, 0);

  // ... (ฟังก์ชัน Export Excel เดิมของพี่ชาย)
  const handleExportToExcel = async () => {
    // ... (โค้ดเดิมคงเดิมครับ)
    const workbook = new ExcelJS.Workbook();
    const sheetName = selectedBranch === 'all' ? 'Report' : selectedBranch;
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.mergeCells('A1:E1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = getReportHeaderTitle();
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };

    if (selectedReportType === 'items') {
      const headerRow = worksheet.addRow(["ลำดับ", "รายการสิ่งของ", "จำนวน", "หน่วย", "งบประมาณ (บาท)"]);
      styleHeader(headerRow);
      currentData.itemsList.forEach((item, idx) => {
        const row = worksheet.addRow([idx + 1, item.name, item.totalQuantity, item.unit, item.totalCost]);
        styleDataRow(row);
      });
      worksheet.columns = [{ width: 8 }, { width: 45 }, { width: 12 }, { width: 12 }, { width: 20 }];
    } else {
      const headerRow = worksheet.addRow(["ชื่อสาขา", "จำนวนใบเบิก", "งบประมาณรวม (บาท)"]);
      styleHeader(headerRow);
      currentData.branchSummaries.forEach((b) => {
        const row = worksheet.addRow([b.branchName, b.totalOrders, b.totalBudget]);
        styleDataRow(row);
      });
      worksheet.columns = [{ width: 40 }, { width: 20 }, { width: 25 }];
    }
    worksheet.addRow([]);
    const summaryRow = worksheet.addRow(["", "รวมสุทธิ", currentData.totalBudget]);
    summaryRow.font = { bold: true };
    summaryRow.getCell(3).border = { top: {style:'thin'}, bottom: {style:'double'} };
    const fileName = `Report_${selectedReportType}_${selectedBranch}_${new Date().toISOString().slice(0,10)}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
  };

  // ฟังก์ชันช่วยจัดสไตล์ (คงเดิม)
  const styleHeader = (row: ExcelJS.Row) => {
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE066' } };
      cell.font = { bold: true };
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      cell.alignment = { horizontal: 'center' };
    });
  };

  const styleDataRow = (row: ExcelJS.Row) => {
    row.eachCell((cell) => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });
    // จัดตัวเลขให้ชิดขวา
    row.getCell(3).alignment = { horizontal: 'right' };
    row.getCell(4).alignment = { horizontal: 'right' };
    row.getCell(5).alignment = { horizontal: 'right' };
  };

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'THSarabunNew' },
  header: { fontSize: 22, textAlign: 'center', marginBottom: 5, fontWeight: 'bold' },
  subHeader: { fontSize: 16, textAlign: 'center', marginBottom: 5 },
  dateText: { fontSize: 14, textAlign: 'center', marginBottom: 20 },
  table: { display: 'flex', flexDirection: 'column', width: '100%', borderTop: '1px solid #000', borderLeft: '1px solid #000', marginBottom: 20 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#e4e4e4' },
  row: { flexDirection: 'row' },
  cell: { padding: 5, fontSize: 13, borderRight: '1px solid #000', borderBottom: '1px solid #000' },
  signatureZone: { marginTop: 30, flexDirection: 'row', justifyContent: 'space-between' },
  sigBox: { width: '40%', textAlign: 'center', fontSize: 12 }
});

const ReportPDF = ({ data, title, type }: { data: any, title: string, type: string }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.header}>ใบเบิก - จ่ายพัสดุ</Text>
      <Text style={styles.subHeader}>{title}</Text>
      <Text style={styles.dateText}>
        วันที่รายงาน: {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
      </Text>

      <View style={styles.table}>
        {/* Header ตาราง */}
        <View style={styles.tableHeader}>
          {type === 'items' ? (
            <>
              <Text style={[styles.cell, { width: '10%' }]}>ลำดับ</Text>
              <Text style={[styles.cell, { width: '30%' }]}>รายการ</Text>
              <Text style={[styles.cell, { width: '15%' }]}>จำนวน</Text>
              <Text style={[styles.cell, { width: '20%' }]}>ราคา/หน่วย</Text>
              <Text style={[styles.cell, { width: '25%' }]}>ราคารวม</Text>
            </>
          ) : (
            <>
              <Text style={[styles.cell, { width: '40%' }]}>ชื่อสาขา</Text>
              <Text style={[styles.cell, { width: '30%' }]}>จำนวนใบเบิก</Text>
              <Text style={[styles.cell, { width: '30%' }]}>งบประมาณรวม</Text>
            </>
          )}
        </View>

        {/* ข้อมูลตาราง */}
        {type === 'items' 
          ? data.itemsList.map((item: any, index: number) => {
              const unitPrice = item.totalQuantity > 0 ? (item.totalCost / item.totalQuantity) : 0;
              return (
                <View key={index} style={styles.row}>
                  <Text style={[styles.cell, { width: '10%' }]}>{index + 1}</Text>
                  <Text style={[styles.cell, { width: '30%' }]}>{item.name}</Text>
                  <Text style={[styles.cell, { width: '15%' }]}>{item.totalQuantity} {item.unit}</Text>
                  <Text style={[styles.cell, { width: '20%' }]}>{unitPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</Text>
                  <Text style={[styles.cell, { width: '25%' }]}>{item.totalCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</Text>
                </View>
              );
            })
          : data.branchSummaries.map((b: any, index: number) => (
              <View key={index} style={styles.row}>
                <Text style={[styles.cell, { width: '40%' }]}>{b.branchName}</Text>
                <Text style={[styles.cell, { width: '30%' }]}>{b.totalOrders}</Text>
                <Text style={[styles.cell, { width: '30%' }]}>{b.totalBudget.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</Text>
              </View>
            ))
        }

        {/* รวมยอดสุทธิ */}
        <View style={[styles.row, { backgroundColor: '#f9f9f9' }]}>
          <Text style={[styles.cell, { width: type === 'items' ? '75%' : '70%', textAlign: 'right', paddingRight: 10, fontWeight: 'bold' }]}>
            รวมยอดสุทธิทั้งสิ้น
          </Text>
          <Text style={[styles.cell, { width: type === 'items' ? '25%' : '30%', fontWeight: 'bold' }]}>
            {data.totalBudget.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
          </Text>
        </View>
      </View>

      <View style={styles.signatureZone}>
        <View style={styles.sigBox}>
          <Text>ลงชื่อ..................................</Text>
          <Text>ผู้เบิก/รับ</Text>
        </View>
        <View style={styles.sigBox}>
          <Text>ลงชื่อ..................................</Text>
          <Text>ผู้อนุมัติ</Text>
        </View>
      </View>
    </Page>
  </Document>
);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-pink-50/40">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-pink-200 border-t-pink-400 animate-spin" />
        <p className="text-pink-400 font-bold text-sm">กำลังคำนวณข้อมูลสรุปยอด...</p>
      </div>
    </div>
  );

  const getReportHeaderTitle = () => {
    if (selectedReportType === 'compare') return 'สรุปรายงานเปรียบเทียบงบประมาณรายสาขา';
    return selectedBranch === 'all' ? 'สรุปรายละเอียดของในการเบิกสะสมรวมทั้งหมด' : `สรุปรายละเอียดของในการเบิก: ${selectedBranch}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50/30 py-8 px-4 sm:px-6 lg:px-8 text-slate-800 print:bg-white print:py-0 print:px-0">
      
      {/* CSS ควบคุมขอบและการตั้งค่าหน้ากระดาษ A4 ในโหมดพิมพ์ */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 20mm 20mm 20mm 20mm; 
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
            background-color: #fff !important;
          }
          html {
            font-size: 12px !important;
          }
        }
      `}</style>

      <div className="max-w-4xl mx-auto space-y-5 print:space-y-0 print:max-w-full">
        
        {/* ================= Navbar ================= */}
        <div className="bg-white px-5 py-4 rounded-2xl shadow-sm shadow-pink-100/50 border border-pink-100 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
          <div className="absolute -bottom-4 left-16 w-20 h-20 bg-rose-200/20 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-xl text-white shadow-md shadow-pink-400/30 shrink-0">
              🎀
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-800 leading-tight">Aemori</h1>
              <p className="text-[10px] font-bold text-pink-400 mt-0.5 uppercase tracking-widest">ระบบจัดการเบิกของ Aemori</p>
            </div>
          </div>
          </div>
          <nav className="flex items-center gap-1 text-[11px] font-bold bg-pink-50 p-1 rounded-xl border border-pink-100/80">
            <Link href="/admin/dashboard" className="px-3.5 py-2 rounded-lg text-slate-400 hover:text-pink-500 hover:bg-white/70 transition-all">📊 แดชบอร์ดรวม</Link>
            <Link href="/admin/requisitions" className="px-3.5 py-2 rounded-lg text-slate-400 hover:text-pink-500 hover:bg-white/70 transition-all">📝 จัดการใบเบิก</Link>
            <Link href="/admin/reports" className="bg-white text-pink-600 shadow-sm shadow-pink-100 px-3.5 py-2 rounded-lg transition-all">📈 รายงานสรุปยอด</Link>
            <Link href="/admin/inventory" className="px-3.5 py-2 rounded-lg text-slate-400 hover:text-pink-500 hover:bg-white/70 transition-all">📦 คลัง</Link>
          </nav>
        </div>

        {/* ================= Filter Panel ================= */}
        <div className="bg-white p-5 rounded-2xl shadow-sm shadow-pink-100/50 border border-pink-100 space-y-4 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-pink-50 pb-4">
            <div>
              <h1 className="text-base font-black text-slate-800 tracking-tight">📈 สรุปยอดรายงาน</h1>
              <p className="text-[10px] text-slate-400 mt-0.5">เลือกประเภทรายงาน วันที่ และสาขา เพื่อประมวลผลข้อมูล</p>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <PDFDownloadLink 
                document={
                  <ReportPDF 
                    data={currentData} 
                    title={getReportHeaderTitle()} 
                    type={selectedReportType} 
                  />
                } 
                fileName={`Report_${selectedReportType}_${selectedBranch}.pdf`}
                className="w-full sm:w-auto"
              >
                {({ loading }) => (
                  <div className={`
                    flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition-all cursor-pointer
                    ${loading 
                      ? 'bg-pink-100 text-pink-400 border border-pink-200' 
                      : 'bg-white text-slate-700 border border-pink-100 hover:border-pink-300 hover:bg-pink-50/50 shadow-sm shadow-pink-100/50 active:scale-95'
                    }
                  `}>
                    {loading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-pink-300 border-t-transparent rounded-full animate-spin" />
                        <span>กำลังเตรียมเอกสาร...</span>
                      </>
                    ) : (
                      <>
                        <span className="text-base">📄</span>
                        <span>ดาวน์โหลดรายงาน (PDF)</span>
                      </>
                    )}
                  </div>
                )}
              </PDFDownloadLink>
              <button
                type="button"
                onClick={handleExportToExcel}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all bg-white text-emerald-600 border border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50/50 shadow-sm shadow-emerald-100/50 active:scale-95"
              >
                <span className="text-base">📗</span>
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-black text-[10px] text-pink-400 uppercase tracking-widest">📋 รูปแบบรายงาน</label>
              <select
                value={selectedReportType}
                onChange={(e) => {
                  setSelectedReportType(e.target.value);
                  if (e.target.value !== 'items') setSelectedBranch('all');
                }}
                className="w-full h-9 px-3 bg-pink-50/50 border border-pink-100 rounded-xl font-bold text-slate-600 outline-none cursor-pointer focus:ring-2 focus:ring-pink-200 focus:border-pink-300 transition-all"
              >
                <option value="compare">💵 1. สรุปยอดเงิน</option>
                <option value="items">📦 2. รายการของในการเบิก</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-black text-[10px] text-pink-400 uppercase tracking-widest">🏬 สาขา</label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full h-9 px-3 bg-pink-50/50 border border-pink-100 rounded-xl font-bold text-slate-600 outline-none cursor-pointer focus:ring-2 focus:ring-pink-200 focus:border-pink-300 transition-all"
              >
                <option value="all">ทุกสาขา</option>
                {allBranches.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="font-black text-[10px] text-pink-400 uppercase tracking-widest">📅 วันที่</label>
                {selectedDate && (
                  <button 
                    onClick={() => setSelectedDate('')} 
                    className="text-[10px] text-rose-400 font-bold hover:underline"
                  >
                    ✕ ดูทั้งหมด
                  </button>
                )}
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full h-9 px-3 bg-pink-50/50 border border-pink-100 rounded-xl font-bold text-slate-600 outline-none cursor-pointer focus:ring-2 focus:ring-pink-200 focus:border-pink-300 transition-all"
              />
            </div>
          </div>
        </div>

        {/* ================= Report Document ================= */}
        <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-sm shadow-pink-100/50 border border-pink-100 print:shadow-none print:border-none print:p-0 print:w-full">
          
          {/* Report Title */}
          <div className="text-center border-b-2 border-pink-200 pb-5 space-y-1 print:border-slate-900">
            <div className="inline-flex items-center gap-2 text-[10px] font-black text-pink-400 uppercase tracking-widest mb-2 print:hidden">
              <span className="w-8 h-px bg-pink-200" />Aemori SPB Report<span className="w-8 h-px bg-pink-200" />
            </div>
            <h2 className="text-xl font-black text-slate-800">{getReportHeaderTitle()}</h2>
            <p className="text-xs font-bold text-slate-400">
              {selectedDate 
                ? `ประจำวันที่: ${new Date(selectedDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`
                : 'แสดงรายงานข้อมูลสะสมทั้งหมดในระบบ'
              }
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4 my-6">
            <div className="bg-pink-50/60 p-4 rounded-xl border border-pink-100 text-center print:bg-slate-50">
              <span className="block text-[10px] font-black text-pink-400 uppercase tracking-widest">ใบเบิกที่อนุมัติ</span>
              <div className="mt-2 flex items-baseline justify-center gap-1">
                <span className="text-2xl font-black text-slate-800">{currentData.totalOrders}</span>
                <span className="text-xs font-bold text-slate-400">ฉบับ</span>
              </div>
            </div>
            <div className="bg-gradient-to-br from-pink-50 to-rose-50/60 p-4 rounded-xl border border-pink-100 text-center print:bg-slate-50">
              <span className="block text-[10px] font-black text-pink-400 uppercase tracking-widest">รวมงบที่ใช้เบิก</span>
              <div className="mt-2 flex items-baseline justify-center gap-1">
                <span className="text-2xl font-black text-pink-600 print:text-slate-900">{currentData.totalBudget.toLocaleString('th-TH')}</span>
                <span className="text-xs font-bold text-slate-400">บาท</span>
              </div>
            </div>
          </div>

          {/* Branch Summary Table */}
          {(selectedReportType === 'all' || selectedReportType === 'compare') && (
            <div className="space-y-2 mt-6">
              <h3 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
                ตารางสรุปงบประมาณการเบิกของแต่ละสาขา
              </h3>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-pink-50 text-pink-500 font-black uppercase tracking-wide print:bg-slate-50 print:text-slate-700">
                    <th className="p-2.5 border border-pink-100 print:border-slate-200">ชื่อสาขาต้นทาง</th>
                    <th className="p-2.5 border border-pink-100 text-center w-32 print:border-slate-200">จำนวนใบเบิก</th>
                    <th className="p-2.5 border border-pink-100 text-right w-48 print:border-slate-200">งบประมาณที่ใช้ไป</th>
                  </tr>
                </thead>
                <tbody className="font-medium text-slate-700">
                  {currentData.branchSummaries.map((b, idx) => (
                    <tr key={b.branchName} className={`hover:bg-pink-50/40 transition-colors ${idx % 2 === 1 ? 'bg-pink-50/20' : ''}`}>
                      <td className="p-2.5 border border-pink-100/60 font-bold print:border-slate-200">
                        <div className="flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-pink-300" />{b.branchName}
                        </div>
                      </td>
                      <td className="p-2.5 border border-pink-100/60 text-center print:border-slate-200">{b.totalOrders}</td>
                      <td className="p-2.5 border border-pink-100/60 text-right font-bold print:border-slate-200">{b.totalBudget.toLocaleString('th-TH')} ฿</td>
                    </tr>
                  ))}
                  <tr className="bg-pink-600 text-white font-black print:bg-slate-100 print:text-slate-900">
                    <td className="p-2.5 border border-pink-500 print:border-slate-300">รวมงบสุทธิรวมทุกสาขา (Grand Total)</td>
                    <td className="p-2.5 border border-pink-500 text-center print:border-slate-300">{currentData.totalOrders}</td>
                    <td className="p-2.5 border border-pink-500 text-right print:border-slate-300">
                      {currentData.totalBudget.toLocaleString('th-TH')} ฿
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Items Table */}
          {selectedReportType === 'items' && (
            <div className="space-y-2 mt-8">
              <h3 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
                รายการสิ่งของวัสดุในการเบิกสะสมรวม
              </h3>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-pink-50 text-pink-500 font-black uppercase tracking-wide print:bg-slate-50 print:text-slate-700">
                    <th className="p-2.5 border border-pink-100 w-10 text-center print:border-slate-200">ลำดับ</th>
                    <th className="p-2.5 border border-pink-100 print:border-slate-200">รายการสิ่งของวัสดุ</th>
                    <th className="p-2.5 border border-pink-100 text-center w-36 print:border-slate-200">จำนวนรวมที่สาขาเบิก</th>
                    <th className="p-2.5 border border-pink-100 text-right w-44 print:border-slate-200">คิดเป็นงบประมาณรวม</th>
                  </tr>
                </thead>
                <tbody className="font-medium text-slate-700">
                  {currentData.itemsList.map((item, idx) => (
                    <tr key={item.name} className={`hover:bg-pink-50/40 transition-colors ${idx % 2 === 1 ? 'bg-pink-50/20' : ''}`}>
                      <td className="p-2.5 border border-pink-100/60 text-center text-pink-300 font-bold print:border-slate-200">{idx + 1}</td>
                      <td className="p-2.5 border border-pink-100/60 font-bold print:border-slate-200">{item.name}</td>
                      <td className="p-2.5 border border-pink-100/60 text-center font-bold print:border-slate-200 print:bg-slate-50">
                        <span className="bg-pink-50 text-pink-600 px-2 py-0.5 rounded-lg border border-pink-100 print:bg-transparent print:border-transparent print:text-slate-900">
                          {item.totalQuantity} {item.unit}
                        </span>
                      </td>
                      <td className="p-2.5 border border-pink-100/60 text-right print:border-slate-200">
                        {item.totalCost.toLocaleString('th-TH')} ฿
                      </td>
                    </tr>
                  ))}
                  
                  {currentData.itemsList.length > 0 && (
                    <tr className="bg-pink-600 text-white font-black print:bg-slate-100 print:text-slate-900">
                      <td colSpan={2} className="p-2.5 border border-pink-500 print:border-slate-300">รวมยอดสุทธิ (Total)</td>
                      <td className="p-2.5 border border-pink-500 text-center print:border-slate-300">
                        {itemsTotalQty.toLocaleString('th-TH')} รายการ
                      </td>
                      <td className="p-2.5 border border-pink-500 text-right print:border-slate-300">
                        {itemsTotalCost.toLocaleString('th-TH')} ฿
                      </td>
                    </tr>
                  )}

                  {currentData.itemsList.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-pink-300 font-bold">
                        ไม่มีรายการสิ่งของที่อนุมัติเบิกจ่ายในเงื่อนไขนี้
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Signature Zone */}
          <div className="mt-14 grid grid-cols-2 gap-8 text-center text-[11px] font-bold text-slate-400 print:mt-12">
            <div className="space-y-10">
              <p>ผู้จัดทำรายงาน: ............................................................</p>
              <p>( ______________________________________ )</p>
            </div>
            <div className="space-y-10">
              <p>ผู้อนุมัติรายงาน: ............................................................</p>
              <p>( ______________________________________ )</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}