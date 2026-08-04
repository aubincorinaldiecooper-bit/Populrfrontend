import KeywordInput from './KeywordInput';
import AIInstructionField from './AIInstructionField';
import AutomationTestChat from './AutomationTestChat';
import type { AutomationWizardApi } from './useAutomationWizard';

export default function RepliesStep({ wizard }: { wizard: AutomationWizardApi }) {
  const { state, update } = wizard;

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[520px] mx-auto space-y-6">
          <div>
            <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Trigger keywords</h2>
            <p className="text-[12px] text-[#6B6B6B] mb-2">What should someone say to trigger this automation?</p>
            <KeywordInput keywords={state.triggerKeywords} onChange={keywords => update('triggerKeywords', keywords)} />
          </div>

          <AIInstructionField
            value={state.aiInstructions}
            onChange={value => update('aiInstructions', value)}
            aiEnabled={state.aiEnabled}
            onToggleAi={enabled => update('aiEnabled', enabled)}
          />
        </div>
      </div>
      <div className="hidden lg:block w-[320px] flex-shrink-0">
        <AutomationTestChat wizard={wizard} />
      </div>
    </div>
  );
}
