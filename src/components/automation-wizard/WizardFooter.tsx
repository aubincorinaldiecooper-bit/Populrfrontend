import { ChevronLeft, Loader2, Save, Zap } from 'lucide-react';

interface WizardFooterProps {
  isFirstStep: boolean;
  isReview: boolean;
  canProceed: boolean;
  saving: boolean;
  onBack: () => void;
  onContinue: () => void;
  onSaveDraft: () => void;
  onActivate: () => void;
}

export default function WizardFooter({
  isFirstStep, isReview, canProceed, saving, onBack, onContinue, onSaveDraft, onActivate,
}: WizardFooterProps) {
  return (
    <div className="sticky bottom-0 bg-white border-t border-[#E8E4DF] px-6 py-4 flex-shrink-0 z-10">
      <div className="flex items-center justify-between max-w-[720px] mx-auto gap-3">
        <button onClick={onBack} className="pop-btn-ghost">
          <ChevronLeft size={16} />{isFirstStep ? 'Cancel' : 'Back'}
        </button>
        {isReview ? (
          <div className="flex items-center gap-2">
            <button onClick={onSaveDraft} disabled={saving} className="pop-btn-tertiary disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save draft
            </button>
            <button onClick={onActivate} disabled={saving} className="pop-btn-primary disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}Activate automation
            </button>
          </div>
        ) : (
          <button onClick={onContinue} disabled={!canProceed} className="pop-btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
