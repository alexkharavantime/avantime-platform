type Props = {
  title: string;
  text: string;
};

export default function FeatureCard({ title, text }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">

      <h3 className="text-xl font-semibold">
        {title}
      </h3>

      <p className="mt-4 text-slate-600">
        {text}
      </p>

    </div>
  );
}