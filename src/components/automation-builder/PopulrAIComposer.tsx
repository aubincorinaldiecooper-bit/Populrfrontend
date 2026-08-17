import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, Mic, Sparkles } from 'lucide-react';
import PairedRevolution from '../PairedRevolution';

interface PopulrAIComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  working: boolean;
  contextLabel?: string;
  aiConfigured: boolean;
  /** Bumped to pull focus into the input (Change something). */
  focusSignal?: number;
}

/* ─── Models ───
 * The picker offers Populr plus the three household names. Choosing one is
 * remembered, but routing is not wired up yet — every build still runs
 * through Populr's composer — and the menu's footer says so out loud. */

type ModelKey = 'populr' | 'claude' | 'chatgpt' | 'gemini';

interface ModelChoice {
  key: ModelKey;
  name: string;
  /** Who makes it — the grey tag on the row. */
  maker: string;
}

const MODELS: ModelChoice[] = [
  { key: 'populr', name: 'Populr', maker: 'Default' },
  { key: 'claude', name: 'Claude', maker: 'Anthropic' },
  { key: 'chatgpt', name: 'ChatGPT', maker: 'OpenAI' },
  { key: 'gemini', name: 'Gemini', maker: 'Google' },
];

const MODEL_STORE_KEY = 'populr:ai:model';

function storedModel(): ModelChoice {
  try {
    const key = window.localStorage.getItem(MODEL_STORE_KEY);
    return MODELS.find(m => m.key === key) ?? MODELS[0];
  } catch {
    return MODELS[0];
  }
}

/* Brand marks, inline so the file stays self-contained. The Claude, OpenAI
 * and Gemini paths are the official simple-icons geometry; Populr's mark is
 * the same sparkles-on-lime chip that heads the Ask Populr panel. */
function ModelMark({ model, size = 14 }: { model: ModelKey; size?: number }) {
  const gradientId = useId();
  if (model === 'populr') {
    return (
      <span
        data-testid="model-mark-populr"
        className="flex shrink-0 items-center justify-center rounded-[5px] bg-[#EDFFC1] text-[#111111]"
        style={{ width: size + 2, height: size + 2 }}
        aria-hidden="true"
      >
        <Sparkles size={size - 4} />
      </span>
    );
  }
  const path =
    model === 'claude'
      ? 'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z'
      : model === 'chatgpt'
        ? 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z'
        : 'M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81';
  return (
    <svg
      data-testid={`model-mark-${model}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="shrink-0"
      aria-hidden="true"
    >
      {model === 'gemini' && (
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4285F4" />
            <stop offset="52%" stopColor="#9B72CB" />
            <stop offset="100%" stopColor="#D96570" />
          </linearGradient>
        </defs>
      )}
      <path
        d={path}
        fill={model === 'claude' ? '#D97757' : model === 'gemini' ? `url(#${gradientId})` : '#0D0D0D'}
      />
    </svg>
  );
}

/* ─── Dictation ───
 * Real speech-to-text through the browser's own recognizer. The mic only
 * renders where the API exists (Chrome, Edge, Safari); elsewhere the bar
 * simply doesn't offer it, which beats a button that shrugs. */

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Populr's intentionally small, responsive prompt bar. */
export default function PopulrAIComposer({
  value, onChange, onSubmit, working, contextLabel, aiConfigured, focusSignal,
}: PopulrAIComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [model, setModel] = useState<ModelChoice>(storedModel);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [listening, setListening] = useState(false);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // The recognizer's callbacks outlive renders; refs keep them off stale
  // props. Synced in an effect (not during render, which React forbids) —
  // speech results arrive long after the commit, so the timing is equivalent.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  });
  const listId = useId();
  const canDictate = speechRecognitionCtor() !== null;

  const placeholder = working
    ? 'Populr is building…'
    : listening
      ? 'Listening…'
      : contextLabel
        ? 'Ask Populr to change this step…'
        : 'Ask Populr to build or change anything…';

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [value]);

  useEffect(() => { if (!working) ref.current?.focus(); }, [working]);
  // "Change something" on a draft puts the creator straight back in the
  // conversation — the input is where the revising happens.
  useEffect(() => { if (focusSignal) ref.current?.focus(); }, [focusSignal]);

  // An open model menu closes on any click that lands outside it.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  // A mid-dictation unmount must not leave the recognizer holding the mic.
  useEffect(() => () => recognitionRef.current?.stop(), []);

  const commitModel = (index: number) => {
    const choice = MODELS[index];
    if (!choice) return;
    setModel(choice);
    try { window.localStorage.setItem(MODEL_STORE_KEY, choice.key); } catch { /* private mode */ }
    setMenuOpen(false);
    ref.current?.focus();
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (!menuOpen) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex(MODELS.findIndex(m => m.key === model.key));
        setMenuOpen(true);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'Tab') { setMenuOpen(false); return; }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(i => Math.min(i + 1, MODELS.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      commitModel(activeIndex);
    }
  };

  const toggleDictation = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = speechRecognitionCtor();
    if (!Recognition) return;
    const recognizer = new Recognition();
    recognizer.continuous = false;
    recognizer.interimResults = false;
    recognizer.onresult = event => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      transcript = transcript.trim();
      if (!transcript) return;
      const current = valueRef.current;
      onChangeRef.current(current ? `${current.trimEnd()} ${transcript}` : transcript);
    };
    // Browsers fire end after an error too, but running the cleanup from both
    // costs nothing and covers any engine that doesn't. It's idempotent.
    const settle = () => {
      recognitionRef.current = null;
      setListening(false);
      ref.current?.focus();
    };
    recognizer.onend = settle;
    recognizer.onerror = settle;
    recognitionRef.current = recognizer;
    setListening(true);
    recognizer.start();
  };

  return (
    <div className="border-t border-[#F0EDE8] bg-white p-3">
      {contextLabel && (
        <p className="mb-2 px-1 text-[11px] font-medium text-[#111111]">{`Editing: ${contextLabel}`}</p>
      )}
      <div className="rounded-2xl border border-[#DEDAD4] bg-white p-2 shadow-[0_3px_14px_rgba(17,17,17,0.05)] transition focus-within:border-[#B8EF35] focus-within:shadow-[0_4px_18px_rgba(17,17,17,0.08)]">
        <textarea
          ref={ref}
          value={value}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          disabled={working}
          aria-label={placeholder}
          className="block w-full resize-none bg-transparent px-1.5 pt-1 pb-2 text-[13.5px] leading-relaxed text-[#111111] placeholder:text-[#A39E97] focus:outline-none focus:ring-0 disabled:opacity-60"
        />
        {/* Controls under the text, prompt-bar style: model on the left,
            voice and send on the right. The attachments "+" returns here
            once there is something real to attach. */}
        <div className="flex items-center gap-1">
          <div ref={menuRootRef} className="relative">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => {
                if (menuOpen) { setMenuOpen(false); return; }
                setActiveIndex(MODELS.findIndex(m => m.key === model.key));
                setMenuOpen(true);
              }}
              onKeyDown={onTriggerKeyDown}
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? listId : undefined}
              aria-label="Choose model"
              className={`flex h-7 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium text-[#57524C] transition-colors hover:bg-[#F7F5F2] hover:text-[#111111] ${menuOpen ? 'bg-[#F7F5F2] text-[#111111]' : ''}`}
            >
              <ModelMark model={model.key} />
              {model.name}
              <ChevronDown
                size={12}
                className={`text-[#8A857E] transition-transform ${menuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {menuOpen && (
              <div
                id={listId}
                role="listbox"
                aria-label="Choose model"
                tabIndex={-1}
                onKeyDown={onTriggerKeyDown}
                className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-56 rounded-xl border border-[#E8E4DF] bg-white p-1 shadow-[0_8px_28px_rgba(17,17,17,0.12)]"
                style={{ animation: 'pop-fade-up 180ms cubic-bezier(0.23,1,0.32,1) both' }}
              >
                {MODELS.map((choice, i) => {
                  const isSelected = choice.key === model.key;
                  return (
                    <div
                      key={choice.key}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => commitModel(i)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 ${i === activeIndex ? 'bg-[#F4F7EC]' : ''}`}
                    >
                      <ModelMark model={choice.key} size={15} />
                      <span className="flex-1 truncate text-[12.5px] font-medium text-[#111111]">{choice.name}</span>
                      <span className="shrink-0 text-[10.5px] text-[#8A857E]">{choice.maker}</span>
                      <Check size={13} className={`shrink-0 ${isSelected ? 'text-[#4D7C0F]' : 'text-transparent'}`} />
                    </div>
                  );
                })}
                <p className="mt-1 border-t border-[#F0EDE8] px-2 pt-1.5 pb-0.5 text-[10.5px] leading-snug text-[#8A857E]">
                  Whichever you pick, Populr does the building for now.
                </p>
              </div>
            )}
          </div>

          <div className="flex-1" />

          {canDictate && (
            <button
              type="button"
              onClick={toggleDictation}
              disabled={working}
              aria-label={listening ? 'Stop dictation' : 'Start dictation'}
              aria-pressed={listening}
              className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
                listening ? 'bg-[#EDFFC1] text-[#3F5212]' : 'text-[#8A857E] hover:bg-[#F7F5F2] hover:text-[#111111]'
              }`}
            >
              {listening ? (
                <span className="flex h-3.5 items-center gap-[2.5px]" aria-hidden="true">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="h-full w-[2.5px] origin-center rounded-full bg-current"
                      style={{ animation: `pop-eq-bounce 900ms ease-in-out ${i * 150}ms infinite` }}
                    />
                  ))}
                </span>
              ) : (
                <Mic size={14} />
              )}
            </button>
          )}

          <button type="button" onClick={onSubmit} disabled={!value.trim() || working} aria-label="Send"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#111111] text-white transition hover:bg-[#292929] disabled:opacity-25 focus-visible:ring-[#C5FF3D]">
            {working ? <PairedRevolution size="sm" /> : <ArrowUp size={15} />}
          </button>
        </div>
      </div>
      {!aiConfigured && <p className="mt-1.5 px-1 text-[11px] text-[#8A857E]">Populr understands common requests. Full AI composing isn't turned on here yet.</p>}
    </div>
  );
}
