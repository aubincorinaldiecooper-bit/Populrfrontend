import { AlertCircle } from 'lucide-react';
import ReviewSummaryStrip from './ReviewSummaryStrip';
import ActivationPanel from './ActivationPanel';
import type { AutomationWizardApi } from './useAutomationWizard';

export default function ReviewStep({ wizard }: { wizard: AutomationWizardApi }) {
  const { state, saveError } = wizard;
  return (
    <div className="max-w-[720px] mx-auto p-6 space-y-4">
      <div>
        <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Review</h2>
        <p className="text-[12px] text-[#6B6B6B]">Confirm your setup and activate when you&apos;re ready.</p>
      </div>
      <ReviewSummaryStrip state={state} />
      <ActivationPanel state={state} />
      {saveError && (
        <div className="bg-[#FEE2E2] text-[#DC2626] px-3.5 py-2.5 rounded-xl text-[12px] flex items-start gap-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />{saveError}
        </div>
      )}
    </div>
  );
}
