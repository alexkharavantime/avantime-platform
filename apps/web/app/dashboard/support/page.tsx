import Link from 'next/link';

export default function SupportPage(){return <main className="p-8"><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">Клиентский портал</p><h2 className="mt-2 text-3xl font-black">Поддержка</h2><p className="mt-3 text-slate-500">Работа с обращениями уже доступна в клиентском портале.</p><Link href="/portal" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Открыть портал поддержки</Link></main>}
