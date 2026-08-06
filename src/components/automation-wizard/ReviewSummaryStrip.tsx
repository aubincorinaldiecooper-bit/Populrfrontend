import { AUTOMATION_TYPES, type WizardState } from './useAutomationWizard';

export default function ReviewSummaryStrip({ state, accountLabel }: { state: WizardState; accountLabel?: string | null }) {
  return (
    <div className="bg-white border border-[#E8E4DF] rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap text-[12px]">
      <div>
        <span className="text-[#9B9B8F]">Name </span>
        <span className="text-[#111111] font-semibold">{state.name || '—'}</span>
      </div>
      {/* Which channel this runs on — with accounts across platforms, the
          review must say so, not leave it implied. */}
      {accountLabel && (
        <>
          <div className="w-px h-4 bg-[#E8E4DF]" />
          <div>
            <span className="text-[#9B9B8F]">Account </span>
            <span className="text-[#111111] font-semibold">{accountLabel}</span>
          </div>
        </>
      )}
      <div className="w-px h-4 bg-[#E8E4DF]" />
      <div>
        <span className="text-[#9B9B8F]">Type </span>
        <span className="text-[#111111] font-semibold">{state.type ? AUTOMATION_TYPES[state.type].title : '—'}</span>
      </div>
      <div className="w-px h-4 bg-[#E8E4DF]" />
      <div>
        <span className="text-[#9B9B8F]">Keywords </span>
        <span className="text-[#111111] font-semibold">{state.triggerKeywords.join(', ') || '—'}</span>
      </div>
    </div>
  );
}
