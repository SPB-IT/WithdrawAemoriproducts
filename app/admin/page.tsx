import Image from 'next/image';
import Link from 'next/link';

const systems = [
  {
    href: '/admin/dashboard',
    icon: '📝',
    title: 'ระบบเบิกสินค้า Aemori',
    description: 'จัดการใบเบิก รายงาน และคลังสินค้า',
    accent: 'from-pink-500 to-rose-500',
  },
  {
    href: '/admin/stock-request',
    icon: '📸',
    title: 'ระบบแจ้งสินค้าใกล้หมด',
    description: 'ตรวจรายการจากสาขา ตัดบิล จัดส่ง และติดตามสถานะ',
    accent: 'from-rose-500 to-pink-400',
  },
];

// หน้าเลือกระบบหลังเข้าสู่โหมดผู้ดูแล (/admin/access)
export default function AdminChooserPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-50 via-white to-rose-50/40 px-4 py-10 text-slate-800">
      <div className="w-full max-w-3xl">
        <header className="mb-8 flex flex-col items-center text-center">
          <div className="relative mb-4 h-16 w-16 overflow-hidden rounded-2xl border-2 border-white bg-white shadow-lg shadow-pink-200/60">
            <Image src="/logo.png" alt="Aemori" fill sizes="64px" className="object-cover" priority />
          </div>
          <h1 className="text-2xl font-black">Aemori Admin</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">เลือกระบบที่ต้องการจัดการ</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {systems.map((system) => (
            <Link key={system.href} href={system.href} className="group overflow-hidden rounded-3xl border border-white bg-white shadow-xl shadow-slate-200/60 transition hover:-translate-y-0.5 hover:shadow-2xl">
              <div className={`bg-gradient-to-r ${system.accent} px-6 py-5 text-white`}>
                <span className="text-3xl">{system.icon}</span>
                <h2 className="mt-2 text-lg font-black">{system.title}</h2>
              </div>
              <div className="flex items-center justify-between gap-3 px-6 py-4">
                <p className="text-sm text-slate-600">{system.description}</p>
                <span className="text-xl text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-500">→</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-center gap-4 text-xs font-bold text-slate-500">
          <Link href="/" className="hover:text-pink-600">
            ← หน้าหลัก
          </Link>
          <form action="/api/admin/logout" method="post">
            <button type="submit" className="hover:text-rose-600">
              ออกจากโหมดผู้ดูแล
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
