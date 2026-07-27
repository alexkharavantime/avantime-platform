import { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
};

export default function Section({ title, children }: Props) {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-6">

        <h2 className="mb-12 text-4xl font-bold">
          {title}
        </h2>

        {children}

      </div>
    </section>
  );
}