const MAX_LENGTH = 1000;

/** The primary field of AI-generated reply mode. Rendered only when that
 *  mode is on — the Exact/AI choice itself lives in the Replies step's
 *  Reply content section, not here. */
export default function AIInstructionField({
  value, onChange,
}: { value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor="ai-instructions" className="font-geist font-bold text-base text-[#111111] block mb-1">
        Instructions for Populr
      </label>
      <p className="text-[12px] text-[#6B6B6B] mb-2">
        Whatever you write here is what the AI says — state the facts you want shared, e.g.
        &ldquo;if asked about price, say prices are coming soon.&rdquo; Questions you haven&apos;t
        covered get a friendly holding reply and land in your queue for a personal follow-up.
      </p>
      <textarea
        id="ai-instructions"
        value={value}
        onChange={e => onChange(e.target.value.slice(0, MAX_LENGTH))}
        placeholder='Be friendly and concise. If someone asks about camera settings, reply publicly with a quick answer and invite them to check their DMs. Then send the free DSLR guide link in the DM.'
        className="w-full h-28 border border-[#E8E4DF] rounded-xl p-3 text-[13px] placeholder:text-[#9B9B8F] resize-none focus:outline-none focus-visible:border-chartreuse focus-visible:ring-2 focus-visible:ring-chartreuse/20 transition-all"
      />
      <div className="flex items-center justify-between mt-1">
        <p className="text-[11px] text-[#9B9B8F]">
          Sensitive messages (refunds, complaints) always come to you — the AI never handles those alone.
        </p>
        <p className="text-[11px] text-[#9B9B8F] flex-shrink-0">{value.length}/{MAX_LENGTH}</p>
      </div>
    </div>
  );
}
