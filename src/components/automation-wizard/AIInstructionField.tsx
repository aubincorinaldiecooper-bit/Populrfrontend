const MAX_LENGTH = 1000;

export default function AIInstructionField({
  value, onChange, aiEnabled, onToggleAi,
}: { value: string; onChange: (value: string) => void; aiEnabled: boolean; onToggleAi: (enabled: boolean) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor="ai-instructions" className="font-geist font-bold text-base text-[#111111]">Instructions for Populr</label>
        <button
          type="button"
          onClick={() => onToggleAi(!aiEnabled)}
          className={`flex items-center gap-2 text-[11px] font-medium px-2.5 py-1 rounded-full transition-all ${aiEnabled ? 'bg-chartreuse text-[#111111]' : 'bg-[#FAFAF8] text-[#6B6B6B]'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${aiEnabled ? 'bg-[#111111]' : 'bg-[#9B9B8F]'}`} />
          AI replies {aiEnabled ? 'on' : 'off'}
        </button>
      </div>
      <p className="text-[12px] text-[#6B6B6B] mb-2">
        Whatever you write here is what the AI says — state the facts you want shared, e.g.
        &ldquo;if asked about price, say prices are coming soon.&rdquo; Questions you haven&apos;t
        covered get a friendly holding reply and land in your queue for a personal follow-up.
      </p>
      <textarea
        id="ai-instructions"
        value={value}
        onChange={e => onChange(e.target.value.slice(0, MAX_LENGTH))}
        disabled={!aiEnabled}
        placeholder='Be friendly and concise. If someone asks about camera settings, reply publicly with a quick answer and invite them to check their DMs. Then send the free DSLR guide link in the DM.'
        className="w-full h-28 border border-[#E8E4DF] rounded-xl p-3 text-[13px] placeholder:text-[#9B9B8F] resize-none focus:outline-none focus-visible:border-chartreuse focus-visible:ring-2 focus-visible:ring-chartreuse/20 transition-all disabled:opacity-50 disabled:bg-[#FAFAF8]"
      />
      <div className="flex items-center justify-between mt-1">
        <p className="text-[11px] text-[#9B9B8F]">{aiEnabled ? 'Sensitive messages (refunds, complaints) always come to you — the AI never handles those alone.' : 'Enable AI replies to use these instructions.'}</p>
        <p className="text-[11px] text-[#9B9B8F] flex-shrink-0">{value.length}/{MAX_LENGTH}</p>
      </div>
    </div>
  );
}
