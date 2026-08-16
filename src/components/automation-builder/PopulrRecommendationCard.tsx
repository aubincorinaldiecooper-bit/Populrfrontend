interface Props { title: string; description: string; actionLabel: string; onAccept: () => void; onDismiss: () => void }

export default function PopulrRecommendationCard({ title, description, actionLabel, onAccept, onDismiss }: Props) {
  return <section className="rounded-2xl border border-[#DEDAD4] bg-[#F7F5F1] p-3.5">
    <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#687A36]">Recommended next step</p>
    <h3 className="mt-1.5 text-[13px] font-medium text-[#111111]">{title}</h3>
    <p className="mt-1 text-[12px] leading-relaxed text-[#68635D]">{description}</p>
    <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={onDismiss} className="rounded-xl px-3 py-2 text-[11.5px] text-[#68635D] hover:bg-white">Not now</button><button type="button" onClick={onAccept} className="rounded-xl bg-[#111111] px-3 py-2 text-[11.5px] font-medium text-white">{actionLabel}</button></div>
  </section>;
}
