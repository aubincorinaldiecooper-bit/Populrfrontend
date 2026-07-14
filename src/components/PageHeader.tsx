export default function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
      <div className="min-w-0">
        <h1 className="font-geist font-bold text-2xl lg:text-[30px] text-[#111111] tracking-tight leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-[#6B6B6B] mt-1.5">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">{action}</div>}
    </div>
  );
}
