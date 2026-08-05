import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useAutomationWizard } from './useAutomationWizard';
import WizardStepper from './WizardStepper';
import WizardFooter from './WizardFooter';
import CreateStep from './CreateStep';
import PostStep from './PostStep';
import RepliesStep from './RepliesStep';
import ReviewStep from './ReviewStep';

export default function AutomationWizard() {
  const wizard = useAutomationWizard();
  const { state, isEditing, currentStep, steps, stepIndex, canProceed, saving, draftSaved, goNext, goBack, cancel, save } = wizard;

  useEffect(() => {
    // Only edit mode has anything to lose on unload: new automations
    // autosave to the Drafts section as the user types.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isEditing || !state.dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isEditing, state.dirty]);

  return (
    <div className="h-screen flex flex-col bg-cream">
      <div className="bg-white border-b border-[#E8E4DF] px-6 py-3 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={cancel} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all" aria-label="Close">
            <X size={18} className="text-[#6B6B6B]" />
          </button>
          <div>
            <h1 className="font-geist font-bold text-base text-[#111111]">{isEditing ? 'Edit automation' : 'Create automation'}</h1>
            <p className="text-[11px] text-[#6B6B6B]">This is where you set up your Instagram automation.</p>
          </div>
        </div>
        {!isEditing && draftSaved && (
          <span className="text-[11px] text-[#9B9B8F] flex-shrink-0">Saved to drafts</span>
        )}
      </div>

      <WizardStepper steps={steps} currentStep={currentStep} />

      <div className="flex-1 overflow-hidden flex flex-col">
        {currentStep === 'create' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-[520px] mx-auto"><CreateStep wizard={wizard} /></div>
          </div>
        )}
        {currentStep === 'post' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-[520px] mx-auto"><PostStep wizard={wizard} /></div>
          </div>
        )}
        {currentStep === 'replies' && <RepliesStep wizard={wizard} />}
        {currentStep === 'review' && (
          <div className="flex-1 overflow-y-auto">
            <ReviewStep wizard={wizard} />
          </div>
        )}
      </div>

      <WizardFooter
        isFirstStep={stepIndex === 0}
        isReview={currentStep === 'review'}
        canProceed={canProceed}
        saving={saving}
        onBack={stepIndex === 0 ? cancel : goBack}
        onContinue={goNext}
        onSavePaused={() => save(false)}
        onActivate={() => save(true)}
      />
    </div>
  );
}
