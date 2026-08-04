import { Check } from 'lucide-react';
import type { WizardStepKey } from './useAutomationWizard';

const STEP_LABELS: Record<WizardStepKey, string> = {
  create: 'Create',
  post: 'Post',
  replies: 'Replies',
  review: 'Review',
};

export default function WizardStepper({ steps, currentStep }: { steps: WizardStepKey[]; currentStep: WizardStepKey }) {
  const currentIndex = steps.indexOf(currentStep);
  return (
    <div className="bg-white border-b border-[#E8E4DF] px-6 py-4 flex-shrink-0">
      <div className="flex items-center max-w-[720px] mx-auto">
        {steps.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-all ${
                  done ? 'bg-chartreuse text-[#111111]' : active ? 'bg-[#111111] text-white' : 'bg-[#E8E4DF] text-[#9B9B8F]'
                }`}>
                  {done ? <Check size={13} /> : i + 1}
                </div>
                <span className={`text-[13px] whitespace-nowrap ${active ? 'font-semibold text-[#111111]' : done ? 'text-[#111111]' : 'text-[#9B9B8F]'}`}>
                  {STEP_LABELS[step]}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-[2px] flex-1 mx-3 rounded-full ${i < currentIndex ? 'bg-chartreuse' : 'bg-[#E8E4DF]'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
