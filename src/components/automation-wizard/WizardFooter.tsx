import { ChevronLeft, Loader2, Save, Zap } from 'lucide-react';

interface WizardFooterProps {
  isFirstStep: boolean;
  isReview: boolean;
  isEditing: boolean;
  canProceed: boolean;
  // Whether the automation is valid to save/activate — re-asserted on Review
  // so an invalid draft (e.g. resumed straight onto Review) can't be saved
  // with its problems silently dropped.
  canActivate: boolean;
  saving: boolean;
  onBack: () => void;
  onContinue: () => void;
  onSavePaused: () => void;
  onActivate: () => void;
  onSaveChanges: () => void;
}

export default function WizardFooter({
  isFirstStep, isReview, isEditing, canProceed, canActivate, saving,
  onBack, onContinue, onSavePaused, onActivate, onSaveChanges,
}: WizardFooterProps) {
  return (
    <div className="sticky bottom-0 bg-white border-t border-[#E8E4DF] px-6 py-4 flex-shrink-0 z-10">
      <div className="flex items-center justify-between max-w-[720px] mx-auto gap-3">
        <button onClick={onBack} className="pop-btn-ghost">
          <ChevronLeft size={16} />{isFirstStep ? 'Cancel' : 'Back'}
        </button>
        {isReview ? (
          isEditing ? (
            // Editing: a single neutral "Save changes" that preserves the
            // automation's current active state. The old footer only offered
            // "Save as paused"/"Activate", so editing a live automation and
            // clicking the paused button silently deactivated it. Pause/
            // activate is a one-tap toggle on the Automations list.
            <button onClick={onSaveChanges} disabled={saving || !canActivate} className="pop-btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save changes
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {/* "Save as paused" creates the real (validated) automation with
                  active=false — distinct from the local, unfinished drafts in
                  the Automations page's Drafts section. */}
              <button onClick={onSavePaused} disabled={saving || !canActivate} className="pop-btn-tertiary disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save as paused
              </button>
              <button onClick={onActivate} disabled={saving || !canActivate} className="pop-btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}Activate automation
              </button>
            </div>
          )
        ) : (
          <button onClick={onContinue} disabled={!canProceed} className="pop-btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
