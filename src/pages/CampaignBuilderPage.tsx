import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { resolveIdentity } from '../lib/identity';
import { campaignTemplates, contentItems, intentGroups } from '../data';
import { Iphone15Pro } from '../components/Iphone15Pro';
import type { CampaignTemplate, Campaign } from '../data';
import {
  Users, Newspaper, Eye, ShoppingBag, CalendarDays, FileDown, PhoneCall, Receipt,
  Zap, FileText, Target, Hash, LayoutTemplate, ChevronLeft, Check, X, Sparkles,
  AlertTriangle, Save, RotateCcw, Send, Clock, Shield, Image, Video,
  File, PanelsTopLeft, Plus,
} from 'lucide-react';

// ─── Goal options ──────────────────────────────────────────
const GOALS = [
  { id: 'community', label: 'Grow a community', desc: 'Drive signups to your community', icon: Users },
  { id: 'ads', label: 'Run ad campaigns', desc: 'Drive paid traffic and conversions', icon: Newspaper },
  { id: 'awareness', label: 'Build product awareness', desc: 'Get more eyes on your product', icon: Eye },
  { id: 'product', label: 'Promote a product', desc: 'Drive sales of a specific product', icon: ShoppingBag },
  { id: 'event', label: 'Promote an event', desc: 'Increase event attendance', icon: CalendarDays },
  { id: 'resource', label: 'Distribute a resource', desc: 'Share a guide, ebook, or tool', icon: FileDown },
  { id: 'calls', label: 'Book calls', desc: 'Get more discovery call bookings', icon: PhoneCall },
  { id: 'subscription', label: 'Grow a subscription audience', desc: 'Build your paid subscriber base', icon: Receipt },
  { id: 'scratch', label: 'Start from scratch', desc: 'Build a completely custom campaign', icon: Zap },
];

// ─── Starting points ───────────────────────────────────────
const STARTING_POINTS = [
  { id: 'post', label: 'Start from a post', desc: 'Trigger from an existing social post', icon: FileText, prominent: true },
  { id: 'segment', label: 'Start from an intent segment', desc: 'Target an AI-detected intent group', icon: Target, prominent: true },
  { id: 'audience', label: 'Start from an audience', desc: 'Target a specific contact segment', icon: Users },
  { id: 'keyword', label: 'Start from a keyword', desc: 'Trigger when someone uses a keyword', icon: Hash },
  { id: 'template', label: 'Start from a template', desc: 'Start from a pre-built campaign', icon: LayoutTemplate },
  { id: 'scratch', label: 'Start from scratch', desc: 'Build without a starting point', icon: Zap },
];

// ─── Trigger types ─────────────────────────────────────────
const TRIGGERS = [
  'Comments on content',
  'Replies to a story',
  'Sends a DM',
  'Replies to a broadcast',
  'Clicks a destination',
  'Enters a segment',
  'Intent changes',
  'Engagement level changes',
];

// ─── Intent conditions ─────────────────────────────────────
const INTENT_CONDITIONS = [
  'Any intent',
  'Product interest',
  'Pricing interest',
  'Booking intent',
  'Subscription interest',
  'Event interest',
  'High intent',
  'Custom intent condition',
];

// ─── Contact collection fields ─────────────────────────────
const COLLECTION_FIELDS = [
  { id: 'email', label: 'Email', placeholder: 'What is your email address?' },
  { id: 'phone', label: 'Phone number', placeholder: 'What is your phone number?' },
  { id: 'firstName', label: 'First name', placeholder: 'What is your first name?' },
  { id: 'location', label: 'Location', placeholder: 'Where are you based?' },
  { id: 'productInterest', label: 'Product interest', placeholder: 'What product are you interested in?' },
  { id: 'bookingPreference', label: 'Booking preference', placeholder: 'When would you like to book?' },
  { id: 'custom', label: 'Custom response', placeholder: 'Ask your custom question...' },
];

// ─── Human review rules ────────────────────────────────────
const REVIEW_RULES = [
  { id: 'pricing', label: 'Pricing objections' },
  { id: 'support', label: 'Support questions' },
  { id: 'sensitive', label: 'Sensitive messages' },
  { id: 'collaboration', label: 'Collaboration inquiries' },
  { id: 'highValue', label: 'High-value contacts' },
  { id: 'lowConfidence', label: 'Low-confidence intent' },
  { id: 'inappropriate', label: 'Aggressive or inappropriate messages' },
];

// ─── Follow-up delay options ───────────────────────────────
const DELAY_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '6 hours', hours: 6 },
  { label: '24 hours', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
];

// ─── Rich media types ──────────────────────────────────────
const RICH_MEDIA_TYPES = [
  { id: 'image', label: 'Image', icon: Image },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'file', label: 'File', icon: File },
  { id: 'carousel', label: 'Content card', icon: PanelsTopLeft },
];

export default function CampaignBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { saveCampaignAsDraft, addCampaign, showToast, accounts } = useApp();
  const { user } = useAuth();
  const identity = resolveIdentity(user, accounts);
  const templateFromNav = (location.state as { template?: CampaignTemplate } | null)?.template;
  const fromContent = (location.state as { fromContent?: boolean; contentId?: string; contentTitle?: string; contentThumbnail?: string; contentPlatform?: string; contentCaption?: string } | null);
  const editCampaign = (location.state as { editCampaign?: Campaign } | null)?.editCampaign;
  const isEditMode = !!editCampaign;

  // ─── Builder State ───────────────────────────────────────
  const [step, setStep] = useState(fromContent?.fromContent ? 2 : 1);
  const [selectedGoal, setSelectedGoal] = useState(editCampaign?.goal || templateFromNav?.goal || '');
  const [selectedStart, setSelectedStart] = useState(fromContent?.fromContent ? 'post' : '');
  const [selectedTrigger, setSelectedTrigger] = useState(editCampaign?.trigger || 'Comments on content');
  const [selectedIntentCondition, setSelectedIntentCondition] = useState('Any intent');
  const [selectedContent, setSelectedContent] = useState(fromContent?.contentId || '');
  const [selectedSegment, setSelectedSegment] = useState('');
  const [keywordValue, setKeywordValue] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<CampaignTemplate | null>(templateFromNav || null);
  const [messageText, setMessageText] = useState(editCampaign?.message || templateFromNav?.messageTemplate || '');
  const [destinationType, setDestinationType] = useState<'link' | 'rich-media'>('link');
  const [destinationUrl, setDestinationUrl] = useState(editCampaign?.destination || '');
  const [buttonLabel, setButtonLabel] = useState('Learn more');
  const [richMediaType, setRichMediaType] = useState('');
  const [campaignName, setCampaignName] = useState(editCampaign?.name || '');

  // Contact collection
  const [collectInfo, setCollectInfo] = useState(false);
  const [collectField, setCollectField] = useState('email');
  const [collectQuestion, setCollectQuestion] = useState('What is your email address?');

  // Follow-ups
  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [followUpDelay, setFollowUpDelay] = useState('24 hours');
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [stopAfterConversion, setStopAfterConversion] = useState(true);
  const [moveToInterested, setMoveToInterested] = useState(true);
  const [markConversion, setMarkConversion] = useState(true);

  // Human review
  const [reviewRules, setReviewRules] = useState<string[]>(['pricing', 'support']);

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);

  // Final states
  const [activated, setActivated] = useState(false);

  // ─── Preview State ───────────────────────────────────────
  const [previewInputMode, setPreviewInputMode] = useState<'dm' | 'comment' | 'story'>('dm');
  const [previewMessages, setPreviewMessages] = useState<{from: 'user' | 'bot' | 'system'; text: string; type?: 'button' | 'form' | 'image'}[]>([]);
  const [previewUserInput, setPreviewUserInput] = useState('');
  const [intentDetected, setIntentDetected] = useState(false);
  const [humanReviewTriggered, setHumanReviewTriggered] = useState(false);
  const [contactConverted, setContactConverted] = useState(false);
  const [infoCollected, setInfoCollected] = useState(false);
  const previewEndRef = useRef<HTMLDivElement>(null);

  const TOTAL_STEPS = 5;

  useEffect(() => {
    previewEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [previewMessages]);

  // ─── Validation ──────────────────────────────────────────
  const validateCurrentStep = () => {
    const newErrors: Record<string, string> = {};
    if (step === 1) {
      if (!selectedGoal) newErrors.goal = 'Select a campaign goal';
      if (!selectedStart) newErrors.start = 'Select a starting point';
    }
    if (step === 2) {
      if (selectedStart === 'post' && !selectedContent) newErrors.content = 'Select a post';
      if (selectedStart === 'segment' && !selectedSegment) newErrors.segment = 'Select a segment';
      if (selectedStart === 'keyword' && !keywordValue.trim()) newErrors.keyword = 'Enter a keyword';
      if (selectedStart === 'template' && !selectedTemplate) newErrors.template = 'Select a template';
    }
    if (step === 3) {
      if (!messageText.trim()) newErrors.message = 'Enter a message';
      if (destinationType === 'link' && !destinationUrl.trim()) newErrors.destination = 'Enter a destination URL';
    }
    if (step === 5) {
      if (!campaignName.trim()) newErrors.name = 'Enter a campaign name';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getValidationWarnings = () => {
    const w: string[] = [];
    if (!selectedTrigger) w.push('No trigger configured');
    if (!messageText.trim()) w.push('Message is empty');
    if (destinationType === 'link' && !destinationUrl.trim()) w.push('No destination URL set');
    if (!markConversion && !moveToInterested) w.push('No conversion action defined');
    if (followUpEnabled && !followUpMessage.trim()) w.push('Follow-up enabled but no message set');
    if (!selectedGoal) w.push('No goal selected');
    setWarnings(w);
    return w;
  };

  // ─── Navigation ──────────────────────────────────────────
  const handleNext = () => {
    if (validateCurrentStep() && step < TOTAL_STEPS) {
      setStep(step + 1);
      if (step + 1 === 5) getValidationWarnings();
    }
  };

  const handleBack = () => {
    if (step > 1) { setStep(step - 1); setErrors({}); }
    else navigate('/campaigns');
  };

  // ─── Preview Actions ─────────────────────────────────────
  const handlePreviewSend = () => {
    if (!previewUserInput.trim()) return;
    const userMsg = previewUserInput.trim();
    setPreviewMessages(prev => [...prev, { from: 'user', text: userMsg }]);
    setPreviewUserInput('');

    // Simulate bot response after configured message
    setTimeout(() => {
      if (messageText) {
        setPreviewMessages(prev => [...prev, { from: 'bot', text: messageText }]);

        // Show destination button if configured
        if (destinationUrl) {
          setTimeout(() => {
            setPreviewMessages(prev => [...prev, {
              from: 'bot',
              text: `${buttonLabel} → ${destinationUrl}`,
              type: 'button',
            }]);

            // Simulate intent detection
            setTimeout(() => {
              setIntentDetected(true);
              setPreviewMessages(prev => [...prev, {
                from: 'system',
                text: `Populr detected: ${selectedIntentCondition}`,
              }]);

              // Check human review
              if (reviewRules.length > 0) {
                setTimeout(() => {
                  setHumanReviewTriggered(true);
                  setPreviewMessages(prev => [...prev, {
                    from: 'system',
                    text: `Flagged for human review: ${reviewRules.map(r => REVIEW_RULES.find(rr => rr.id === r)?.label).join(', ')}`,
                  }]);
                }, 800);
              }
            }, 600);
          }, 400);
        }

        // Contact collection
        if (collectInfo) {
          setTimeout(() => {
            const field = COLLECTION_FIELDS.find(f => f.id === collectField);
            setPreviewMessages(prev => [...prev, {
              from: 'bot',
              text: collectQuestion || field?.placeholder || 'Can you provide this info?',
              type: 'form',
            }]);
          }, 1200);
        }
      }
    }, 400);
  };

  const handlePreviewButtonClick = () => {
    setContactConverted(true);
    setPreviewMessages(prev => [...prev, { from: 'system', text: 'Contact clicked the destination link' }]);
    if (markConversion) {
      setPreviewMessages(prev => [...prev, { from: 'system', text: 'Contact marked as Converted' }]);
    }
    if (moveToInterested) {
      setPreviewMessages(prev => [...prev, { from: 'system', text: 'Contact moved to Interested stage' }]);
    }
    if (stopAfterConversion) {
      setPreviewMessages(prev => [...prev, { from: 'system', text: 'Campaign sequence stopped (conversion reached)' }]);
    }
  };

  const handlePreviewFormSubmit = () => {
    setInfoCollected(true);
    setPreviewMessages(prev => [...prev, { from: 'system', text: `Information collected and saved to contact profile` }]);
  };

  const handleRunFollowUp = () => {
    if (followUpMessage) {
      setPreviewMessages(prev => [...prev, { from: 'bot', text: followUpMessage }]);
    }
  };

  const handleResetPreview = () => {
    setPreviewMessages([]);
    setPreviewUserInput('');
    setIntentDetected(false);
    setHumanReviewTriggered(false);
    setContactConverted(false);
    setInfoCollected(false);
  };

  // ─── Save / Activate ─────────────────────────────────────
  const handleSaveDraft = () => {
    saveCampaignAsDraft({
      name: campaignName || 'Untitled draft',
      goal: selectedGoal,
      trigger: selectedTrigger,
      message: messageText,
      destination: destinationUrl,
      platform: 'instagram',
    });
    showToast('Draft saved!', 'success');
    setTimeout(() => navigate('/campaigns'), 600);
  };

  const handleActivate = () => {
    const w = getValidationWarnings();
    if (w.length > 0 && !campaignName.trim()) return;

    const newCampaign = {
      id: `c-${Date.now()}`,
      name: campaignName || 'Untitled campaign',
      goal: selectedGoal,
      trigger: selectedTrigger,
      message: messageText,
      destination: destinationUrl,
      status: 'active' as const,
      platform: 'instagram',
      discovered: 0, engaged: 0, interested: 0, converted: 0,
      clicks: 0, conversions: 0, rate: '0%',
      automationStatus: 'active' as const,
      humanHandoffs: 0,
    };
    addCampaign(newCampaign);
    setActivated(true);
    showToast('Campaign activated!', 'success');
    setTimeout(() => navigate('/campaigns'), 2000);
  };

  const canProceed = () => {
    if (step === 1) return selectedGoal !== '' && selectedStart !== '';
    if (step === 2) {
      if (selectedStart === 'post') return selectedContent !== '';
      if (selectedStart === 'segment') return selectedSegment !== '';
      if (selectedStart === 'keyword') return keywordValue.trim() !== '';
      if (selectedStart === 'template') return selectedTemplate !== null;
      return true;
    }
    if (step === 3) return messageText.trim() !== '' && (destinationType !== 'link' || destinationUrl.trim() !== '');
    return true;
  };

  // ─── Step Titles ─────────────────────────────────────────
  const stepTitles = [
    'Goal and starting point',
    'Content, audience, and trigger',
    'Message and destination',
    'Follow-ups and human review',
    'Review and activation',
  ];

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  if (activated) {
    return (
      <div className="h-screen flex items-center justify-center bg-cream">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-[#E0F5E9] flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-[#059669]" />
          </div>
          <h2 className="font-geist font-bold text-xl text-[#111111]">{campaignName || 'Campaign'} {isEditMode ? 'updated!' : 'is live!'}</h2>
          <p className="text-sm text-[#6B6B6B] mt-2">Your campaign is now active and monitoring for triggers.</p>
          <p className="text-xs text-[#9B9B8F] mt-4">Redirecting to campaigns...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-cream">
      {/* ─── HEADER ─── */}
      <div className="bg-white border-b border-[#E8E4DF] px-6 py-2 flex-shrink-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={handleBack} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all">
              {step === 1 ? <X size={18} className="text-[#6B6B6B]" /> : <ChevronLeft size={18} className="text-[#6B6B6B]" />}
            </button>
            <div>
              <h1 className="font-geist font-bold text-base text-[#111111]">{isEditMode ? 'Edit campaign' : 'Create campaign'}</h1>
              <p className="text-[11px] text-[#6B6B6B]">Step {step} of {TOTAL_STEPS}: {stepTitles[step - 1]}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSaveDraft}
              className="text-[12px] font-medium text-[#6B6B6B] hover:text-[#111111] transition-all flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-[#FAFAF8]">
              <Save size={14} />Save draft
            </button>
          </div>
        </div>
        {/* Step indicators */}
        <div className="flex gap-1">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div key={i} className="flex-1 h-[3px] rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${i + 1 <= step ? 'bg-chartreuse' : 'bg-[#E8E4DF]'}`} />
            </div>
          ))}
        </div>
      </div>

      {/* ─── SPLIT WORKSPACE ─── */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Configuration */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="max-w-[560px] mx-auto">

            {/* ═══ STEP 1: Goal + Starting Point ═══ */}
            {step === 1 && (
              <div className="space-y-4 animate-fade-in">
                {/* Goal */}
                <div>
                  <h2 className="font-geist font-bold text-lg text-[#111111] mb-1">What is your goal?</h2>
                  <p className="text-[13px] text-[#6B6B6B]">What do you want this campaign to achieve?</p>
                  {errors.goal && <p className="text-[11px] text-coral mt-2 flex items-center gap-1"><AlertTriangle size={10} />{errors.goal}</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                    {GOALS.map(g => {
                      const Icon = g.icon;
                      const sel = selectedGoal === g.label;
                      return (
                        <button key={g.id} onClick={() => { setSelectedGoal(g.label); setErrors(prev => { const n = { ...prev }; delete n.goal; return n; }); }}
                          className={`flex items-start gap-2.5 border rounded-xl p-2.5 text-left transition-all ${sel ? 'border-[#111111] bg-[#FAFAF8]' : 'border-[#E8E4DF] hover:border-[#D4CFC8]'}`}>
                          <Icon size={18} className="text-[#6B6B6B] flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[13px] font-semibold text-[#111111]">{g.label}</p>
                            <p className="text-[11px] text-[#6B6B6B]">{g.desc}</p>
                          </div>
                          {sel && <Check size={16} className="text-[#111111] ml-auto flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Starting Point */}
                <div>
                  <h2 className="font-geist font-bold text-lg text-[#111111] mb-1">Where do you want to start?</h2>
                  <p className="text-[13px] text-[#6B6B6B]">Choose what triggers this campaign</p>
                  {errors.start && <p className="text-[11px] text-coral mt-2 flex items-center gap-1"><AlertTriangle size={10} />{errors.start}</p>}
                  <div className="space-y-2 mt-4">
                    {STARTING_POINTS.map(sp => {
                      const Icon = sp.icon;
                      const sel = selectedStart === sp.id;
                      return (
                        <button key={sp.id} onClick={() => { setSelectedStart(sp.id); setErrors(prev => { const n = { ...prev }; delete n.start; return n; }); }}
                          className={`w-full flex items-start gap-3 border rounded-xl p-3 text-left transition-all ${sel ? 'border-[#111111] bg-[#FAFAF8]' : sp.prominent ? 'border-chartreuse/50 hover:border-chartreuse' : 'border-[#E8E4DF] hover:border-[#D4CFC8]'}`}>
                          <Icon size={18} className={`flex-shrink-0 mt-0.5 ${sp.prominent ? 'text-chartreuse' : 'text-[#6B6B6B]'}`} />
                          <div className="flex-1">
                            <p className="text-[13px] font-semibold text-[#111111]">{sp.label}</p>
                            <p className="text-[11px] text-[#6B6B6B]">{sp.desc}</p>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${sel ? 'border-[#111111] bg-[#111111]' : 'border-[#E8E4DF]'}`}>
                            {sel && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ STEP 2: Content, Trigger, Intent ═══ */}
            {step === 2 && (
              <div className="space-y-4 animate-fade-in">
                {/* Trigger */}
                <div>
                  <h2 className="font-geist font-bold text-lg text-[#111111] mb-1">When does this campaign start?</h2>
                  <p className="text-[13px] text-[#6B6B6B]">Choose the trigger event</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {TRIGGERS.map(t => (
                      <button key={t} onClick={() => setSelectedTrigger(t)}
                        className={`border rounded-lg px-3 py-2 text-[11px] font-medium text-left transition-all ${selectedTrigger === t ? 'border-[#111111] bg-[#FAFAF8] text-[#111111]' : 'border-[#E8E4DF] text-[#6B6B6B] hover:border-[#D4CFC8]'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Intent condition */}
                <div>
                  <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Only continue when</h2>
                  <p className="text-[12px] text-[#6B6B6B] mb-3">Populr detects this intent before entering the contact into the campaign</p>
                  <div className="space-y-1.5">
                    {INTENT_CONDITIONS.map(ic => (
                      <button key={ic} onClick={() => setSelectedIntentCondition(ic)}
                        className={`w-full flex items-center gap-3 border rounded-lg px-3 py-2.5 text-left transition-all ${selectedIntentCondition === ic ? 'border-[#111111] bg-[#FAFAF8]' : 'border-[#E8E4DF] hover:border-[#D4CFC8]'}`}>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedIntentCondition === ic ? 'border-[#111111] bg-[#111111]' : 'border-[#E8E4DF]'}`}>
                          {selectedIntentCondition === ic && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span className="text-[12px] text-[#111111]">{ic}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content/segment/keyword/template selection based on starting point */}
                {selectedStart === 'post' && (
                  <div>
                    <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Select a post</h2>
                    {errors.content && <p className="text-[11px] text-coral mb-2">{errors.content}</p>}
                    <div className="grid grid-cols-3 gap-3">
                      {contentItems.map(item => {
                        const sel = selectedContent === item.id;
                        return (
                          <button key={item.id} onClick={() => setSelectedContent(item.id)}
                            className={`relative rounded-xl overflow-hidden border-2 transition-all ${sel ? 'border-chartreuse' : 'border-transparent hover:border-[#E8E4DF]'}`}>
                            <img src={item.thumbnail} alt="" className="w-full aspect-[3/4] object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                            <p className="absolute bottom-2 left-2 right-2 text-white text-[10px] font-semibold">{item.title}</p>
                            {sel && <div className="absolute top-2 left-2 w-5 h-5 bg-chartreuse rounded-full flex items-center justify-center"><Check size={12} className="text-[#111111]" /></div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedStart === 'segment' && (
                  <div>
                    <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Select an intent segment</h2>
                    {errors.segment && <p className="text-[11px] text-coral mb-2">{errors.segment}</p>}
                    <div className="space-y-2">
                      {intentGroups.map(ig => (
                        <button key={ig.id} onClick={() => setSelectedSegment(ig.id)}
                          className={`w-full flex items-center gap-3 border rounded-xl p-3 text-left transition-all ${selectedSegment === ig.id ? 'border-[#111111] bg-[#FAFAF8]' : 'border-[#E8E4DF] hover:border-[#D4CFC8]'}`}>
                          <div className={`w-8 h-8 rounded-lg ${ig.bg} flex items-center justify-center flex-shrink-0`}>
                            <span className="text-[11px] font-bold">{ig.percentage}%</span>
                          </div>
                          <div className="flex-1">
                            <p className="text-[13px] font-semibold text-[#111111]">{ig.name}</p>
                            <p className="text-[11px] text-[#6B6B6B]">{ig.count} contacts · avg score {ig.avgScore}</p>
                          </div>
                          {selectedSegment === ig.id && <Check size={16} className="text-[#111111]" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedStart === 'keyword' && (
                  <div>
                    <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Enter a keyword</h2>
                    {errors.keyword && <p className="text-[11px] text-coral mb-2">{errors.keyword}</p>}
                    <input type="text" value={keywordValue} onChange={e => setKeywordValue(e.target.value)}
                      placeholder="e.g., guide, pricing, collab"
                      className="w-full border border-[#E8E4DF] rounded-xl px-4 py-3 text-[13px] placeholder:text-[#9B9B8F] focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all" />
                  </div>
                )}

                {selectedStart === 'template' && (
                  <div>
                    <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Select a template</h2>
                    {errors.template && <p className="text-[11px] text-coral mb-2">{errors.template}</p>}
                    <div className="space-y-2">
                      {campaignTemplates.map(t => (
                        <button key={t.id} onClick={() => { setSelectedTemplate(t); setMessageText(t.messageTemplate); }}
                          className={`w-full flex items-start gap-3 border rounded-xl p-3 text-left transition-all ${selectedTemplate?.id === t.id ? 'border-chartreuse bg-[#FAFAF8]' : 'border-[#E8E4DF] hover:border-[#D4CFC8]'}`}>
                          <div className="flex-1">
                            <p className="text-[13px] font-semibold text-[#111111]">{t.name}</p>
                            <p className="text-[11px] text-[#6B6B6B]">{t.description}</p>
                          </div>
                          {selectedTemplate?.id === t.id && <Check size={16} className="text-chartreuse" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ STEP 3: Message + Destination + Collection ═══ */}
            {step === 3 && (
              <div className="space-y-6 animate-fade-in">
                {/* Message */}
                <div>
                  <h2 className="font-geist font-bold text-lg text-[#111111] mb-1">Write your message</h2>
                  <p className="text-[13px] text-[#6B6B6B]">What should contacts receive?</p>
                  {errors.message && <p className="text-[11px] text-coral mt-2 flex items-center gap-1"><AlertTriangle size={10} />{errors.message}</p>}
                  <textarea value={messageText} onChange={e => setMessageText(e.target.value)}
                    placeholder="Hey! Thanks for your interest. Here's what I promised..."
                    className={`w-full h-20 border rounded-xl p-3 text-[12px] placeholder:text-[#9B9B8F] resize-none focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all mt-2 ${errors.message ? 'border-coral' : 'border-[#E8E4DF]'}`} />
                </div>

                {/* Destination */}
                <div>
                  <h2 className="font-geist font-bold text-base text-[#111111] mb-3">Destination</h2>
                  <div className="flex gap-2 mb-3">
                    {(['link', 'rich-media'] as const).map(dt => (
                      <button key={dt} onClick={() => setDestinationType(dt)}
                        className={`flex items-center gap-2 border rounded-lg px-4 py-2.5 text-[12px] font-medium transition-all ${destinationType === dt ? 'border-[#111111] bg-[#FAFAF8] text-[#111111]' : 'border-[#E8E4DF] text-[#6B6B6B]'}`}>
                        {dt === 'link' ? <><Plus size={14} />Link</> : <><Image size={14} />Rich media</>}
                      </button>
                    ))}
                  </div>

                  {destinationType === 'link' && (
                    <div className="space-y-2">
                      <div>
                        <label className="text-[11px] font-medium text-[#111111] mb-1 block">Destination URL</label>
                        <input type="text" value={destinationUrl} onChange={e => setDestinationUrl(e.target.value)}
                          placeholder="https://..."
                          className={`w-full border rounded-xl px-3 py-2 text-[12px] placeholder:text-[#9B9B8F] focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all ${errors.destination ? 'border-coral' : 'border-[#E8E4DF]'}`} />
                        {errors.destination && <p className="text-[11px] text-coral mt-1">{errors.destination}</p>}
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-[#111111] mb-1 block">Button label</label>
                        <input type="text" value={buttonLabel} onChange={e => setButtonLabel(e.target.value)}
                          placeholder="Learn more"
                          className="w-full border border-[#E8E4DF] rounded-xl px-3 py-2 text-[12px] placeholder:text-[#9B9B8F] focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all" />
                      </div>
                    </div>
                  )}

                  {destinationType === 'rich-media' && (
                    <div className="grid grid-cols-4 gap-2">
                      {RICH_MEDIA_TYPES.map(rm => {
                        const Icon = rm.icon;
                        const sel = richMediaType === rm.id;
                        return (
                          <button key={rm.id} onClick={() => setRichMediaType(rm.id)}
                            className={`flex flex-col items-center gap-2 border rounded-xl p-4 transition-all ${sel ? 'border-[#111111] bg-[#FAFAF8]' : 'border-[#E8E4DF] hover:border-[#D4CFC8]'}`}>
                            <Icon size={20} className="text-[#6B6B6B]" />
                            <span className="text-[11px] font-medium text-[#111111]">{rm.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Contact Collection */}
                <div className="border border-[#E8E4DF] rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-[12px] font-semibold text-[#111111]">Collect information before continuing</h3>
                      <p className="text-[10px] text-[#6B6B6B]">Ask contacts for details before they receive the destination</p>
                    </div>
                    <button onClick={() => setCollectInfo(!collectInfo)}
                      className={`w-10 h-6 rounded-full relative transition-all ${collectInfo ? 'bg-chartreuse' : 'bg-[#E8E4DF]'}`}>
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${collectInfo ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                  {collectInfo && (
                    <div className="space-y-2 animate-fade-in">
                      <div>
                        <label className="text-[11px] font-medium text-[#111111] mb-1 block">Field to collect</label>
                        <select value={collectField} onChange={e => setCollectField(e.target.value)}
                          className="w-full border border-[#E8E4DF] rounded-xl px-3 py-2 text-[12px] text-[#111111] focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all">
                          {COLLECTION_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-[#111111] mb-1 block">Your question</label>
                        <input type="text" value={collectQuestion} onChange={e => setCollectQuestion(e.target.value)}
                          placeholder={COLLECTION_FIELDS.find(f => f.id === collectField)?.placeholder}
                          className="w-full border border-[#E8E4DF] rounded-xl px-3 py-2 text-[12px] placeholder:text-[#9B9B8F] focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ STEP 4: Follow-ups + Human Review ═══ */}
            {step === 4 && (
              <div className="space-y-4 animate-fade-in">
                {/* Follow-ups */}
                <div className="border border-[#E8E4DF] rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h2 className="font-geist font-bold text-base text-[#111111]">Follow-up message</h2>
                      <p className="text-[10px] text-[#6B6B6B]">Send a follow-up if the contact does not take action</p>
                    </div>
                    <button onClick={() => setFollowUpEnabled(!followUpEnabled)}
                      className={`w-10 h-6 rounded-full relative transition-all ${followUpEnabled ? 'bg-chartreuse' : 'bg-[#E8E4DF]'}`}>
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${followUpEnabled ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                  {followUpEnabled && (
                    <div className="space-y-2 animate-fade-in">
                      <div>
                        <label className="text-[11px] font-medium text-[#111111] mb-1 block">Delay</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {DELAY_OPTIONS.map(d => (
                            <button key={d.label} onClick={() => setFollowUpDelay(d.label)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${followUpDelay === d.label ? 'bg-[#111111] text-white' : 'bg-[#FAFAF8] text-[#6B6B6B] hover:bg-[#E8E4DF]'}`}>
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-[#111111] mb-1 block">Follow-up message</label>
                        <textarea value={followUpMessage} onChange={e => setFollowUpMessage(e.target.value)}
                          placeholder="Just following up — did you get a chance to check it out?"
                          className="w-full h-16 border border-[#E8E4DF] rounded-xl p-2.5 text-[11px] placeholder:text-[#9B9B8F] resize-none focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Conversion behavior */}
                <div>
                  <h2 className="font-geist font-bold text-base text-[#111111] mb-3">After conversion</h2>
                  <div className="space-y-2">
                    {[
                      { label: 'Stop campaign after conversion', state: stopAfterConversion, set: setStopAfterConversion },
                      { label: 'Move contact to Interested after meaningful reply', state: moveToInterested, set: setMoveToInterested },
                      { label: 'Mark conversion after destination action', state: markConversion, set: setMarkConversion },
                    ].map(item => (
                      <div key={item.label} className="flex items-center justify-between py-1.5">
                        <span className="text-[12px] text-[#111111]">{item.label}</span>
                        <button onClick={() => item.set(!item.state)}
                          className={`w-10 h-6 rounded-full relative transition-all ${item.state ? 'bg-chartreuse' : 'bg-[#E8E4DF]'}`}>
                          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${item.state ? 'right-1' : 'left-1'}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Human Review */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Shield size={16} className="text-[#6B6B6B]" />
                    <h2 className="font-geist font-bold text-base text-[#111111]">Human review rules</h2>
                  </div>
                  <p className="text-[12px] text-[#6B6B6B] mb-3">Pause automation and alert the team when:</p>
                  <div className="space-y-1.5">
                    {REVIEW_RULES.map(rule => (
                      <button key={rule.id} onClick={() => {
                        setReviewRules(prev => prev.includes(rule.id) ? prev.filter(r => r !== rule.id) : [...prev, rule.id]);
                      }}
                        className={`w-full flex items-center gap-3 border rounded-lg px-3 py-2.5 text-left transition-all ${reviewRules.includes(rule.id) ? 'border-chartreuse bg-[#FAFAF8]' : 'border-[#E8E4DF] hover:border-[#D4CFC8]'}`}>
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${reviewRules.includes(rule.id) ? 'border-chartreuse bg-chartreuse' : 'border-[#E8E4DF]'}`}>
                          {reviewRules.includes(rule.id) && <Check size={10} className="text-[#111111]" />}
                        </div>
                        <span className="text-[12px] text-[#111111]">{rule.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ STEP 5: Review + Activate ═══ */}
            {step === 5 && (
              <div className="space-y-3 animate-fade-in">
                <div>
                  <h2 className="font-geist font-bold text-lg text-[#111111] mb-1">Review your campaign</h2>
                  <p className="text-[13px] text-[#6B6B6B]">Verify everything before activating</p>
                </div>

                {/* Warnings */}
                {warnings.length > 0 && (
                  <div className="bg-[#FFF3E0] border border-[#FDE68A] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle size={16} className="text-[#D97706]" />
                      <p className="text-[13px] font-semibold text-[#D97706]">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</p>
                    </div>
                    <ul className="space-y-1">
                      {warnings.map((w, i) => (
                        <li key={i} className="text-[12px] text-[#6B6B6B] flex items-start gap-2">
                          <span className="w-1 h-1 rounded-full bg-[#D97706] mt-1.5 flex-shrink-0" />{w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Campaign name */}
                <div>
                  <label className="text-[12px] font-medium text-[#111111] mb-1 block">Campaign name</label>
                  <input type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)}
                    placeholder="Summer Style Guide Launch"
                    className={`w-full border rounded-xl px-3 py-2 text-[12px] placeholder:text-[#9B9B8F] focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all ${errors.name ? 'border-coral' : 'border-[#E8E4DF]'}`} />
                  {errors.name && <p className="text-[11px] text-coral mt-1">{errors.name}</p>}
                </div>

                {/* Summary */}
                <div className="bg-white border border-[#E8E4DF] rounded-xl p-3 space-y-2">
                  {[
                    { label: 'Goal', value: selectedGoal || '—' },
                    { label: 'Starting point', value: STARTING_POINTS.find(s => s.id === selectedStart)?.label || '—' },
                    { label: 'Trigger', value: selectedTrigger },
                    { label: 'Intent condition', value: selectedIntentCondition },
                    { label: 'Message', value: messageText || '—' },
                    { label: 'Destination', value: destinationType === 'link' ? `${buttonLabel} → ${destinationUrl || '—'}` : 'Rich media' },
                    { label: 'Follow-up', value: followUpEnabled ? `${followUpDelay}: ${followUpMessage || 'No message'}` : 'Disabled' },
                    { label: 'Human review', value: reviewRules.length > 0 ? `${reviewRules.length} rules` : 'None' },
                    { label: 'Contact collection', value: collectInfo ? `Collect ${COLLECTION_FIELDS.find(f => f.id === collectField)?.label}` : 'Disabled' },
                  ].map(row => (
                    <div key={row.label} className="flex items-start gap-3 py-1.5 border-b border-[#E8E4DF] last:border-0">
                      <span className="text-[11px] text-[#9B9B8F] w-28 flex-shrink-0">{row.label}</span>
                      <span className="text-[12px] text-[#111111] break-words">{row.value}</span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button onClick={handleSaveDraft}
                    className="flex-1 border border-[#E8E4DF] text-[#111111] rounded-[10px] py-2 text-[12px] font-semibold hover:bg-[#FAFAF8] transition-all flex items-center justify-center gap-2">
                    <Save size={13} />Save draft
                  </button>
                  <button onClick={handleActivate}
                    className="flex-1 bg-chartreuse text-[#111111] rounded-[10px] py-2 text-[12px] font-semibold hover:bg-chartreuse-hover transition-all flex items-center justify-center gap-2">
                    <Sparkles size={13} />{isEditMode ? 'Update campaign' : 'Activate campaign'}
                  </button>
                </div>
              </div>
            )}

            {/* ─── Footer Navigation ─── */}
            <div className="flex items-center justify-between mt-4 mb-2">
              <button onClick={handleBack}
                className="text-[13px] font-medium text-[#6B6B6B] hover:text-[#111111] transition-all flex items-center gap-1">
                {step > 1 ? <><ChevronLeft size={16} />Back</> : 'Cancel'}
              </button>
              {step < TOTAL_STEPS && (
                <button onClick={handleNext} disabled={!canProceed()}
                  className={`px-6 py-2.5 rounded-[10px] text-[13px] font-semibold transition-all ${canProceed() ? 'bg-chartreuse text-[#111111] hover:bg-chartreuse-hover' : 'bg-[#E8E4DF] text-[#9B9B8F] cursor-not-allowed'}`}>
                  Continue
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Interactive Phone Preview */}
        <div className="hidden lg:flex w-[300px] flex-shrink-0 border-l border-[#E8E4DF] bg-[#FAFAF8] flex-col">
          {/* Preview Header */}
          <div className="px-3 py-2 border-b border-[#E8E4DF] bg-white flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-[#111111] uppercase tracking-wider">Preview</p>
              <div className="flex items-center gap-1">
                <button onClick={handleResetPreview} className="p-1.5 hover:bg-[#FAFAF8] rounded-lg transition-all" title="Reset">
                  <RotateCcw size={14} className="text-[#6B6B6B]" />
                </button>
                {followUpEnabled && followUpMessage && (
                  <button onClick={handleRunFollowUp} className="p-1.5 hover:bg-[#FAFAF8] rounded-lg transition-all" title="Run follow-up now">
                    <Clock size={14} className="text-[#D97706]" />
                  </button>
                )}
              </div>
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

          {/* Phone Frame */}
          <div className="flex-1 overflow-y-auto p-2 flex justify-center">
            <Iphone15Pro width={240} height={489}>
              {/* Chat Header — creator identity */}
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

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-white">
                {previewMessages.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-[11px] text-[#9B9B8F]">Type a {previewInputMode} to start the preview</p>
                    <p className="text-[10px] text-[#9B9B8F] mt-1">The bot will respond with your configured message</p>
                  </div>
                )}
                {previewMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : msg.from === 'system' ? 'justify-center' : 'justify-start'}`}>
                    {msg.from === 'system' ? (
                      <span className="text-[9px] text-[#9B9B8F] bg-[#FAFAF8] px-2 py-1 rounded-full">{msg.text}</span>
                    ) : msg.type === 'button' ? (
                      <button onClick={handlePreviewButtonClick}
                        className="bg-chartreuse text-[#111111] rounded-2xl rounded-tl-sm px-4 py-2.5 text-[12px] font-semibold hover:bg-chartreuse-hover transition-all max-w-[85%]">
                        {msg.text}
                      </button>
                    ) : msg.type === 'form' ? (
                      <div className="bg-[#FAFAF8] border border-[#E8E4DF] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] space-y-2">
                        <p className="text-[11px] text-[#111111]">{msg.text}</p>
                        <input type="text" placeholder="Type your answer..."
                          className="w-full border border-[#E8E4DF] rounded-lg px-2 py-1.5 text-[11px] placeholder:text-[#9B9B8F]" />
                        <button onClick={handlePreviewFormSubmit}
                          className="w-full bg-[#111111] text-white rounded-lg py-1.5 text-[10px] font-semibold">Submit</button>
                      </div>
                    ) : (
                      <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[12px] leading-relaxed ${msg.from === 'user' ? 'bg-[#111111] text-white rounded-br-sm' : 'bg-[#F5F0EB] text-[#111111] rounded-tl-sm'}`}>
                        {msg.text}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={previewEndRef} />
              </div>

              {/* Chat Input */}
              <div className="px-3 py-2.5 border-t border-[#E8E4DF] bg-white flex-shrink-0">
                <div className="flex items-center gap-2">
                  <input type="text" value={previewUserInput}
                    onChange={e => setPreviewUserInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handlePreviewSend(); }}
                    placeholder={`Type a ${previewInputMode}...`}
                    className="flex-1 bg-[#F5F0EB] rounded-full px-3.5 py-2 text-[11px] placeholder:text-[#9B9B8F] border-0 focus:ring-1 focus:ring-chartreuse/30" />
                  <button onClick={handlePreviewSend} disabled={!previewUserInput.trim()}
                    className={`p-2 rounded-full transition-all ${previewUserInput.trim() ? 'bg-chartreuse' : 'bg-[#E8E4DF]'}`}>
                    <Send size={12} className={previewUserInput.trim() ? 'text-[#111111]' : 'text-[#9B9B8F]'} />
                  </button>
                </div>
              </div>

              {/* Home Bar */}
              <div className="bg-white px-8 py-2 flex-shrink-0 flex justify-center pb-4">
                <div className="w-20 h-1 bg-[#111111] rounded-full" />
              </div>
            </Iphone15Pro>
          </div>

          {/* Preview Legend */}
          <div className="px-3 py-2 border-t border-[#E8E4DF] bg-white flex-shrink-0">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {intentDetected && <span className="text-[9px] text-[#059669] bg-[#E0F5E9] px-1.5 py-0.5 rounded-full">Intent detected</span>}
              {humanReviewTriggered && <span className="text-[9px] text-[#D97706] bg-[#FFF3E0] px-1.5 py-0.5 rounded-full">Human review</span>}
              {contactConverted && <span className="text-[9px] text-white bg-[#10B981] px-1.5 py-0.5 rounded-full">Converted</span>}
              {infoCollected && <span className="text-[9px] text-[#3B82F6] bg-[#EFF6FF] px-1.5 py-0.5 rounded-full">Info collected</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
