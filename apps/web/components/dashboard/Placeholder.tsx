interface Props {
  title: string;
  body: string;
}

export default function Placeholder({ title, body }: Props) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#0F172A]">{title}</h1>
      </header>
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-medium text-[#0F172A]">Coming in a later phase.</p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[#64748B]">
          {body}
        </p>
      </div>
    </div>
  );
}
