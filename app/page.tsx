import Image from 'next/image';
import Link from 'next/link';
import { STOCK_REQUEST_TESTING } from '@/lib/stock-request/testing';

// หน้าแรกสำหรับพนักงานสาขาเท่านั้น — ผู้ดูแล/สำนักงานใหญ่เข้าผ่าน /admin โดยตรง
const systems = [
  {
    key: 'requisition',
    icon: '📝',
    title: 'ระบบเบิกสินค้า Aemori',
    description: 'เบิกวัสดุ-อุปกรณ์จากรายการสินค้าของสำนักงานใหญ่ เลือกสินค้าและจำนวนแล้วส่งใบเบิก',
    accent: 'from-pink-500 to-rose-500',
    href: '/requisition',
    label: 'เบิกสินค้า',
    testing: false,
  },
  {
    key: 'stock-request',
    icon: '📸',
    title: 'ระบบแจ้งสินค้าใกล้หมด',
    description: 'ถ่ายรูปสินค้าที่ใกล้หมดแจ้งเข้าบิล แล้วติดตามสถานะจนได้รับสินค้าจากสำนักงานใหญ่',
    accent: 'from-rose-500 to-pink-400',
    href: '/stock-request',
    label: 'แจ้งสินค้าใกล้หมด',
    // เปิดใช้งานจริงแล้ว · ถ้าตั้งโหมดทดสอบ: การ์ดสีเทาและต้องใส่รหัสผู้ดูแลก่อนเข้า (ดู lib/stock-request/testing.ts)
    testing: STOCK_REQUEST_TESTING,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50/40 px-4 py-10 text-slate-800 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10 flex flex-col items-center text-center">
          <div className="relative mb-4 h-20 w-20 overflow-hidden rounded-3xl border-2 border-white bg-white shadow-xl shadow-pink-200/60">
            <Image src="/logo.png" alt="Aemori" fill sizes="80px" className="object-cover" priority />
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Aemori</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">เลือกระบบที่ต้องการใช้งาน</p>
        </header>

        <div className="grid gap-5 md:grid-cols-2">
          {systems.map((system) => {
            const accent = system.testing ? 'from-slate-400 to-slate-500' : system.accent;
            return (
              <section key={system.key} className={`flex flex-col overflow-hidden rounded-3xl border border-white bg-white shadow-xl shadow-slate-200/60 ${system.testing ? 'opacity-90 grayscale' : ''}`}>
                <div className={`bg-gradient-to-r ${accent} px-6 py-6 text-white`}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-4xl">{system.icon}</span>
                    {system.testing && <span className="rounded-full bg-white/25 px-3 py-1 text-xs font-black">🧪 อยู่ระหว่างทดสอบ</span>}
                  </div>
                  <h2 className="mt-3 text-xl font-black">{system.title}</h2>
                </div>
                <div className="flex flex-1 flex-col gap-5 p-6">
                  <p className="flex-1 text-sm leading-relaxed text-slate-600">{system.description}</p>
                  {system.testing && <p className="-mt-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500">🔒 ช่วงทดสอบ ต้องใส่รหัสผู้ดูแลก่อนเข้าใช้งาน</p>}
                  <Link
                    href={system.href}
                    className={`rounded-xl bg-gradient-to-r ${accent} px-4 py-3 text-center text-sm font-black text-white shadow-md transition hover:opacity-90`}
                  >
                    {system.testing ? `🔒 ${system.label} (ผู้ดูแล)` : system.label}
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
