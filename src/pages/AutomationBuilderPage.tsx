import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { resolveIdentity } from '../lib/identity';
import { campaigns } from '../data';
import { Iphone15Pro } from '../components/Iphone15Pro';
import type { Automation } from '../data';
import {
  ChevronLeft, Check, X, Sparkles,
  AlertTriangle, Save, Send, RotateCcw,
} from 'lucide-react';

const TRIGGERS = [
  'Comments on content',
  'Replies to a story',
  'Sends a DM',
  'Replies to a broadcast',
  'Keyword detected',
  'First engagement',
  'Intent score changes',
  'Enters a segment',
];

const ACTIONS = [
  'Send DM with link',
  'Send follow-up message',
  'Add to segment',
  'Notify creator',
  'Start campaign',
  'Send broadcast',
];

export default function AutomationBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast, accounts } = useApp();
  const { user } = useAuth();
  const identity = resolveIdentity(user, accounts);
  const editAuto = (location.state as { automation?: Automation } | null)?.automation;

  const [step, setStep] = useState(1);
  const [name, setName] = useState(editAuto?.name || '');
  const [selectedTrigger, setSelectedTrigger] = useState(editAuto?.trigger || 'Comments on content');
  const [selectedAction, setSelectedAction] = useState(editAuto?.action || 'Send DM with link');
  const [message, setMessage] = useState('');
  const [connectedCampaign, setConnectedCampaign] = useState(editAuto?.connectedCampaign || '');
  const [humanReview, setHumanReview] = useState(editAuto?.humanReview || false);
  const [stopAfterConversion, setStopAfterConversion] = useState(editAuto?.stopAfterConversion ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  // Preview
  const [previewMessages, setPreviewMessages] = useState<{from: 'user' | 'bot' | 'system'; text: string; type?: 'button'}[]>([]);
  const [previewUserInput, setPreviewUserInput] = useState('');
  const [previewInputMode, setPreviewInputMode] = useState<'dm' | 'comment' | 'story'>('dm');
  const previewEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    previewEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [previewMessages]);

  const TOTAL_STEPS = 3;

  const validate = () => {
    const e: Record<string, string> = {};
    if (step === 1) {
      if (!name.trim()) e.name = 'Enter an automation name';
      if (!selectedTrigger) e.trigger = 'Select a trigger';
      if (!selectedAction) e.action = 'Select an action';
    }
    if (step === 2) {
      if (!message.trim()) e.message = 'Enter a message';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => { if (validate() && step < TOTAL_STEPS) setStep(step + 1); };
  const handleBack = () => { if (step > 1) { setStep(step - 1); setErrors({}); } else navigate('/automations'); };

  const handleSave = () => {
    if (!name.trim()) { setErrors({ name: 'Enter a name' }); return; }
    showToast(editAuto ? 'Automation updated' : 'Automation saved', 'success');
    setSaved(true);
    setTimeout(() => navigate('/automations'), 800);
  };

  const handlePreviewSend = () => {
    if (!previewUserInput.trim()) return;
    setPreviewMessages(prev => [...prev, { from: 'user', text: previewUserInput.trim() }]);
    setPreviewUserInput('');
    setTimeout(() => {
      if (message) {
        setPreviewMessages(prev => [...prev, { from: 'bot', text: message }]);
        setTimeout(() => {
          setPreviewMessages(prev => [...prev, { from: 'system', text: 'Automation completed' }]);
        }, 600);
      }
    }, 400);
  };

  const handleResetPreview = () => setPreviewMessages([]);

  const stepTitles = ['Trigger & action', 'Message', 'Settings & review'];

  if (saved) {
    return (
      <div className="h-screen flex items-center justify-center bg-cream">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-[#E0F5E9] flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-[#059669]" />
          </div>
          <h2 className="font-geist font-bold text-xl text-[#111111]">{name || 'Automation'} saved!</h2>
          <p className="text-sm text-[#6B6B6B] mt-2">Redirecting to automations...</p>
        </div>
      </div>
    );
  }

  const canProceed = () => {
    if (step === 1) return name.trim() !== '' && selectedTrigger !== '' && selectedAction !== '';
    if (step === 2) return message.trim() !== '';
    return true;
  };

  return (
    <div className="h-screen flex flex-col bg-cream">
      {/* Header */}
      <div className="bg-white border-b border-[#E8E4DF] px-6 py-2 flex-shrink-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={handleBack} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all">
              {step === 1 ? <X size={18} className="text-[#6B6B6B]" /> : <ChevronLeft size={18} className="text-[#6B6B6B]" />}
            </button>
            <div>
              <h1 className="font-geist font-bold text-base text-[#111111]">{editAuto ? 'Edit automation' : 'Create automation'}</h1>
              <p className="text-[11px] text-[#6B6B6B]">Step {step} of {TOTAL_STEPS}: {stepTitles[step - 1]}</p>
            </div>
          </div>
          <button onClick={handleSave}
            className="text-[12px] font-medium text-[#6B6B6B] hover:text-[#111111] transition-all flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-[#FAFAF8]">
            <Save size={14} />Save
          </button>
        </div>
        <div className="flex gap-1 mt-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div key={i} className="flex-1 h-[3px] rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${i + 1 <= step ? 'bg-chartreuse' : 'bg-[#E8E4DF]'}`} />
            </div>
          ))}
        </div>
      </div>

      {/* Split workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Config */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="max-w-[560px] mx-auto">
            {/* Step 1: Trigger & Action */}
            {step === 1 && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Name your automation</h2>
                  {errors.name && <p className="text-[11px] text-coral mb-1 flex items-center gap-1"><AlertTriangle size={10} />{errors.name}</p>}
                  <input type="text" value={name} onChange={e => { setName(e.target.value); setErrors(p => { const n = { ...p }; delete n.name; return n; }); }}
                    placeholder="e.g., Style Guide Auto-DM"
                    className={`w-full border rounded-xl px-3 py-2 text-[12px] placeholder:text-[#9B9B8F] focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all ${errors.name ? 'border-coral' : 'border-[#E8E4DF]'}`} />
                </div>

                <div>
                  <h2 className="font-geist font-bold text-base text-[#111111] mb-1">When this happens (trigger)</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {TRIGGERS.map(t => (
                      <button key={t} onClick={() => setSelectedTrigger(t)}
                        className={`border rounded-lg px-3 py-2 text-[11px] font-medium text-left transition-all ${selectedTrigger === t ? 'border-[#111111] bg-[#FAFAF8] text-[#111111]' : 'border-[#E8E4DF] text-[#6B6B6B] hover:border-[#D4CFC8]'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Then do this (action)</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {ACTIONS.map(a => (
                      <button key={a} onClick={() => setSelectedAction(a)}
                        className={`border rounded-lg px-3 py-2 text-[11px] font-medium text-left transition-all ${selectedAction === a ? 'border-[#111111] bg-[#FAFAF8] text-[#111111]' : 'border-[#E8E4DF] text-[#6B6B6B] hover:border-[#D4CFC8]'}`}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Connected campaign (optional)</h2>
                  <div className="space-y-1.5">
                    <button onClick={() => setConnectedCampaign('')} className={`w-full flex items-center gap-3 border rounded-lg px-3 py-2 text-left transition-all ${connectedCampaign === '' ? 'border-[#111111] bg-[#FAFAF8]' : 'border-[#E8E4DF] hover:border-[#D4CFC8]'}`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${connectedCampaign === '' ? 'border-[#111111] bg-[#111111]' : 'border-[#E8E4DF]'}`}>
                        {connectedCampaign === '' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span className="text-[12px] text-[#111111]">None</span>
                    </button>
                    {campaigns.map(c => (
                      <button key={c.id} onClick={() => setConnectedCampaign(c.name)}
                        className={`w-full flex items-center gap-3 border rounded-lg px-3 py-2 text-left transition-all ${connectedCampaign === c.name ? 'border-[#111111] bg-[#FAFAF8]' : 'border-[#E8E4DF] hover:border-[#D4CFC8]'}`}>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${connectedCampaign === c.name ? 'border-[#111111] bg-[#111111]' : 'border-[#E8E4DF]'}`}>
                          {connectedCampaign === c.name && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span className="text-[12px] text-[#111111]">{c.name}</span>
                        <span className="text-[10px] text-[#9B9B8F] ml-auto">{c.status}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Message */}
            {step === 2 && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Automation message</h2>
                  <p className="text-[12px] text-[#6B6B6B]">What should be sent when the trigger fires?</p>
                  {errors.message && <p className="text-[11px] text-coral mt-1 flex items-center gap-1"><AlertTriangle size={10} />{errors.message}</p>}
                  <textarea value={message} onChange={e => { setMessage(e.target.value); setErrors(p => { const n = { ...p }; delete n.message; return n; }); }}
                    placeholder="Hey! Thanks for your interest. Here's what I promised..."
                    className={`w-full h-20 border rounded-xl p-3 text-[12px] placeholder:text-[#9B9B8F] resize-none focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all mt-2 ${errors.message ? 'border-coral' : 'border-[#E8E4DF]'}`} />
                </div>

                <div className="bg-[#FAFAF8] rounded-xl p-3 border border-[#E8E4DF]">
                  <p className="text-[11px] font-medium text-[#9B9B8F] mb-2">Variables</p>
                  <div className="flex gap-2 flex-wrap">
                    {['{first_name}', '{last_active}', '{destination_url}'].map(v => (
                      <button key={v} onClick={() => setMessage(prev => prev + ' ' + v)}
                        className="bg-white border border-[#E8E4DF] rounded-lg px-2.5 py-1 text-[10px] font-medium text-[#6B6B6B] hover:border-[#D4CFC8] transition-all">{v}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Settings & Review */}
            {step === 3 && (
              <div className="space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h2 className="font-geist font-bold text-base text-[#111111]">Review</h2>
                </div>

                <div className="bg-white border border-[#E8E4DF] rounded-xl p-3 space-y-2">
                  {[
                    { label: 'Name', value: name || '—' },
                    { label: 'Trigger', value: selectedTrigger },
                    { label: 'Action', value: selectedAction },
                    { label: 'Message', value: message || '—' },
                    { label: 'Campaign', value: connectedCampaign || 'None' },
                    { label: 'Human review', value: humanReview ? 'Enabled' : 'Disabled' },
                    { label: 'Stop after conversion', value: stopAfterConversion ? 'Yes' : 'No' },
                  ].map(row => (
                    <div key={row.label} className="flex items-start gap-3 py-1.5 border-b border-[#E8E4DF] last:border-0">
                      <span className="text-[11px] text-[#9B9B8F] w-28 flex-shrink-0">{row.label}</span>
                      <span className="text-[12px] text-[#111111] break-words">{row.value}</span>
                    </div>
                  ))}
                </div>

                {/* Settings toggles */}
                <div className="space-y-2">
                  {[
                    { label: 'Human review', desc: 'Pause and alert me for manual review', state: humanReview, set: setHumanReview },
                    { label: 'Stop after conversion', desc: 'Prevent further messages after conversion', state: stopAfterConversion, set: setStopAfterConversion },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between py-2 border-b border-[#E8E4DF] last:border-0">
                      <div>
                        <span className="text-[12px] text-[#111111]">{item.label}</span>
                        <p className="text-[10px] text-[#6B6B6B]">{item.desc}</p>
                      </div>
                      <button onClick={() => item.set(!item.state)}
                        className={`w-10 h-6 rounded-full relative transition-all ${item.state ? 'bg-chartreuse' : 'bg-[#E8E4DF]'}`}>
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${item.state ? 'right-1' : 'left-1'}`} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={handleSave}
                    className="flex-1 bg-chartreuse text-[#111111] rounded-[10px] py-2 text-[12px] font-semibold hover:bg-chartreuse-hover transition-all flex items-center justify-center gap-2">
                    <Sparkles size={13} />{editAuto ? 'Update automation' : 'Save automation'}
                  </button>
                </div>
              </div>
            )}

            {/* Footer nav */}
            <div className="flex items-center justify-between mt-4 mb-2">
              <button onClick={handleBack}
                className="text-[13px] font-medium text-[#6B6B6B] hover:text-[#111111] transition-all flex items-center gap-1">
                {step > 1 ? <><ChevronLeft size={16} />Back</> : 'Cancel'}
              </button>
              {step < TOTAL_STEPS && (
                <button onClick={handleNext} disabled={!canProceed()}
                  className={`px-6 py-2 rounded-[10px] text-[13px] font-semibold transition-all ${canProceed() ? 'bg-chartreuse text-[#111111] hover:bg-chartreuse-hover' : 'bg-[#E8E4DF] text-[#9B9B8F] cursor-not-allowed'}`}>
                  Continue
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Phone Preview */}
        <div className="hidden lg:flex w-[300px] flex-shrink-0 border-l border-[#E8E4DF] bg-[#FAFAF8] flex-col">
          <div className="px-3 py-2 border-b border-[#E8E4DF] bg-white flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-[#111111] uppercase tracking-wider">Preview</p>
              <button onClick={handleResetPreview} className="p-1.5 hover:bg-[#FAFAF8] rounded-lg transition-all" title="Reset">
                <RotateCcw size={14} className="text-[#6B6B6B]" />
              </button>
            </div>
            <div className="flex gap-1.5">
              {(['dm', 'comment', 'story'] as const).map(m => (
                <button key={m} onClick={() => setPreviewInputMode(m)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-medium uppercase transition-all ${previewInputMode === m ? 'bg-[#111111] text-white' : 'bg-[#FAFAF8] text-[#6B6B6B]'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex justify-center">
            <Iphone15Pro width={240} height={489}>
              <div className="bg-[#FAFAF8] px-4 py-3 border-b border-[#E8E4DF] flex items-center gap-2 flex-shrink-0 mt-10">
                {identity.avatarUrl ? (
                  <img src={identity.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#E8E4DF] flex items-center justify-center text-[9px] font-semibold text-[#6B6B6B]">
                    {identity.initials}
                  </div>
                )}
                <div>
                  <p className="text-[11px] font-semibold text-[#111111]">{identity.name}</p>
                  <p className="text-[8px] text-[#9B9B8F]">Automated by Populr</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-white">
                {previewMessages.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-[11px] text-[#9B9B8F]">Type a {previewInputMode} to trigger the automation</p>
                    <p className="text-[10px] text-[#9B9B8F] mt-1">The bot will respond with your configured message</p>
                  </div>
                )}
                {previewMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : msg.from === 'system' ? 'justify-center' : 'justify-start'}`}>
                    {msg.from === 'system' ? (
                      <span className="text-[9px] text-[#9B9B8F] bg-[#FAFAF8] px-2 py-1 rounded-full">{msg.text}</span>
                    ) : (
                      <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[12px] leading-relaxed ${msg.from === 'user' ? 'bg-[#111111] text-white rounded-br-sm' : 'bg-[#F5F0EB] text-[#111111] rounded-tl-sm'}`}>
                        {msg.text}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={previewEndRef} />
              </div>
              <div className="px-3 py-2.5 border-t border-[#E8E4DF] bg-white flex-shrink-0">
                <div className="flex items-center gap-2">
                  <input type="text" value={previewUserInput} onChange={e => setPreviewUserInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handlePreviewSend(); }}
                    placeholder={`Type a ${previewInputMode} to trigger...`}
                    className="flex-1 bg-[#F5F0EB] rounded-full px-3.5 py-2 text-[11px] placeholder:text-[#9B9B8F] border-0 focus:ring-1 focus:ring-chartreuse/30" />
                  <button onClick={handlePreviewSend} disabled={!previewUserInput.trim()}
                    className={`p-2 rounded-full transition-all ${previewUserInput.trim() ? 'bg-chartreuse' : 'bg-[#E8E4DF]'}`}>
                    <Send size={12} className={previewUserInput.trim() ? 'text-[#111111]' : 'text-[#9B9B8F]'} />
                  </button>
                </div>
              </div>
              <div className="bg-white px-8 py-2 flex-shrink-0 flex justify-center pb-4">
                <div className="w-20 h-1 bg-[#111111] rounded-full" />
              </div>
            </Iphone15Pro>
          </div>
        </div>
      </div>
    </div>
  );
}
