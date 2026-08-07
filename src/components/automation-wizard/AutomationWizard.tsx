/**
 * RETIRED — no route renders this any more.
 *
 * The node builder (src/pages/AutomationBuilderPage.tsx) replaced the
 * four-step wizard: it edits every automation, including the flat ones this
 * wizard created, which the backend reads as one-trigger-one-send graphs
 * (populrbackend src/flows/legacyImport.ts). /automations/new now redirects to
 * the builder, so nothing reaches this component.
 *
 * Kept rather than deleted in the same change that introduced the builder, so
 * the switch is reversible by restoring one route while the new runtime beds
 * in. KeywordInput and PostPicker in this directory are NOT dead — the
 * builder's inspector reuses both. Delete the rest once the builder has a
 * release behind it.
 */
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
  const {
    state, isEditing, currentStep, steps, stepIndex, canProceed,
    canProceedFromCreate, canProceedFromPost, canProceedFromReplies,
    saving, draftSaved, goNext, goBack, cancel, save,
  } = wizard;

  // Re-assert every step's validity before Save/Activate. A draft resumed
  // straight onto Review restores its stepIndex and bypasses the per-step
  // gates, so without this an invalid link/media or missing reply could be
  // saved with the problem silently dropped by buildInput.
  const canActivate = canProceedFromCreate && canProceedFromPost && canProceedFromReplies;

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
    <div className="h-[calc(100vh-4rem)] md:h-screen flex flex-col bg-cream">
      <div className="bg-white border-b border-[#E8E4DF] px-6 py-3 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={cancel} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all" aria-label="Close">
            <X size={18} className="text-[#6B6B6B]" />
          </button>
          <div>
            <h1 className="font-geist font-bold text-base text-[#111111]">{isEditing ? 'Edit automation' : 'Create automation'}</h1>
            <p className="text-[11px] text-[#6B6B6B]">Step {stepIndex + 1} of {steps.length}</p>
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
        isEditing={isEditing}
        canProceed={canProceed}
        canActivate={canActivate}
        saving={saving}
        onBack={stepIndex === 0 ? cancel : goBack}
        onContinue={goNext}
        onSavePaused={() => save(false)}
        onActivate={() => save(true)}
        onSaveChanges={() => save('keep')}
      />
    </div>
  );
}
