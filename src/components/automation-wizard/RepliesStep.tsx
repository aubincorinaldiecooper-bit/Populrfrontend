import KeywordInput from './KeywordInput';
import AIInstructionField from './AIInstructionField';
import AutomationTestChat from './AutomationTestChat';
import { AUTOMATION_TYPES } from './useAutomationWizard';
import type { AutomationWizardApi } from './useAutomationWizard';

/**
 * The step that decides what the automation actually sends. It used to hold
 * only trigger keywords and AI instructions — no comment reply, no DM text,
 * no link — so every automation shipped with the backend's generic fallback
 * ("Just sent you a DM! 📩") and nothing to send. These fields map straight
 * onto the automation's comment_reply_body / message_body / link_url, which
 * the backend and API types supported all along.
 */
export default function RepliesStep({ wizard }: { wizard: AutomationWizardApi }) {
  const { state, update } = wizard;
  const cfg = state.type ? AUTOMATION_TYPES[state.type] : null;
  const wantsComment = cfg?.replyChannel === 'comment' || cfg?.replyChannel === 'both';
  const wantsDM = cfg?.replyChannel === 'dm' || cfg?.replyChannel === 'both';

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[520px] mx-auto space-y-6">
          <div>
            <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Trigger keywords</h2>
            <p className="text-[12px] text-[#6B6B6B] mb-2">What should someone say to trigger this automation?</p>
            <KeywordInput keywords={state.triggerKeywords} onChange={keywords => update('triggerKeywords', keywords)} />
          </div>

          <div>
            <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Replies</h2>
            <p className="text-[12px] text-[#6B6B6B] mb-3">
              What Populr sends when the trigger fires. Use the test chat to see it exactly as a fan would.
            </p>

            <div className="space-y-4">
              {wantsComment && (
                <div>
                  <label htmlFor="wizard-comment-reply" className="block text-[12px] font-semibold text-[#111111] mb-1">
                    Public comment reply
                  </label>
                  <textarea
                    id="wizard-comment-reply"
                    value={state.commentReplyBody}
                    onChange={e => update('commentReplyBody', e.target.value)}
                    placeholder="Just sent you a DM! 📩"
                    rows={2}
                    className="w-full bg-white border border-[#E8E4DF] rounded-xl px-3.5 py-2.5 text-[13px] placeholder:text-[#9B9B8F] outline-none focus-visible:ring-2 focus-visible:ring-chartreuse/40 resize-y"
                  />
                  <p className="text-[11px] text-[#9B9B8F] mt-1">
                    Posted publicly under the trigger comment. Left empty, Populr posts the placeholder above.
                  </p>
                </div>
              )}

              {wantsDM && (
                <div>
                  <label htmlFor="wizard-dm-body" className="block text-[12px] font-semibold text-[#111111] mb-1">
                    DM message
                  </label>
                  <textarea
                    id="wizard-dm-body"
                    value={state.dmBody}
                    onChange={e => update('dmBody', e.target.value)}
                    placeholder={'Hey {{name}}! Here’s what you asked for: {{link}}'}
                    rows={4}
                    className="w-full bg-white border border-[#E8E4DF] rounded-xl px-3.5 py-2.5 text-[13px] placeholder:text-[#9B9B8F] outline-none focus-visible:ring-2 focus-visible:ring-chartreuse/40 resize-y"
                  />
                  <p className="text-[11px] text-[#9B9B8F] mt-1">
                    Sent privately. <code className="font-geist-mono">{'{{name}}'}</code> becomes the person&apos;s name
                    and <code className="font-geist-mono">{'{{link}}'}</code> becomes your tracked link.
                  </p>
                </div>
              )}

              {wantsDM && (
                <div>
                  <label htmlFor="wizard-media-url" className="block text-[12px] font-semibold text-[#111111] mb-1">
                    Media in the DM <span className="font-normal text-[#9B9B8F]">(optional)</span>
                  </label>
                  <input
                    id="wizard-media-url"
                    type="url"
                    value={state.mediaUrl}
                    onChange={e => update('mediaUrl', e.target.value)}
                    placeholder="https://your-site.com/photo.jpg or …/clip.mp4"
                    className="w-full bg-white border border-[#E8E4DF] rounded-xl px-3.5 py-2.5 text-[13px] placeholder:text-[#9B9B8F] outline-none focus-visible:ring-2 focus-visible:ring-chartreuse/40"
                  />
                  <p className="text-[11px] text-[#9B9B8F] mt-1">
                    An image or video sent inside the DM (hosted URL). Platforms that don&apos;t
                    support it get the text on its own.
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="wizard-link-url" className="block text-[12px] font-semibold text-[#111111] mb-1">
                  Link to send <span className="font-normal text-[#9B9B8F]">(optional)</span>
                </label>
                <input
                  id="wizard-link-url"
                  type="url"
                  value={state.linkUrl}
                  onChange={e => update('linkUrl', e.target.value)}
                  placeholder="https://your-site.com/guide"
                  className="w-full bg-white border border-[#E8E4DF] rounded-xl px-3.5 py-2.5 text-[13px] placeholder:text-[#9B9B8F] outline-none focus-visible:ring-2 focus-visible:ring-chartreuse/40"
                />
                <p className="text-[11px] text-[#9B9B8F] mt-1">
                  Populr wraps this in a tracked link, so clicks show up in your stats and lead scoring.
                </p>

                {wantsDM && (
                  <div className="mt-3">
                    <label htmlFor="wizard-button-label" className="block text-[12px] font-semibold text-[#111111] mb-1">
                      Send it as a button <span className="font-normal text-[#9B9B8F]">(optional)</span>
                    </label>
                    <input
                      id="wizard-button-label"
                      type="text"
                      value={state.buttonLabel}
                      onChange={e => update('buttonLabel', e.target.value.slice(0, 40))}
                      disabled={!state.linkUrl.trim()}
                      placeholder="Get the guide"
                      className="w-full bg-white border border-[#E8E4DF] rounded-xl px-3.5 py-2.5 text-[13px] placeholder:text-[#9B9B8F] outline-none focus-visible:ring-2 focus-visible:ring-chartreuse/40 disabled:opacity-50 disabled:bg-[#FAFAF8]"
                    />
                    <p className="text-[11px] text-[#9B9B8F] mt-1">
                      {state.linkUrl.trim()
                        ? 'Adds a tappable button to the DM that opens your tracked link — usually outperforms a pasted URL.'
                        : 'Add a link above first — the button opens your tracked link.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
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
