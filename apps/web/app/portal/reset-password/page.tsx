import { PageShell } from '../../../components/page-shell';
import { ResetPasswordForm } from '../../../components/portal/reset-password-form';

export default function Page() {
  return (
    <PageShell>
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-md px-6">
          <div className="rounded-[2rem] bg-white p-8 shadow-xl">
            <p className="eyebrow">Безопасность</p>
            <h1 className="mt-4 text-4xl font-black">Новый пароль</h1>
            <ResetPasswordForm />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
