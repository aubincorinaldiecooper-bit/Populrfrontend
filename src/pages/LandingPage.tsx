import { Link } from 'react-router';
import { Link2, ArrowRight } from 'lucide-react';
import FlowArt, { FlowSection } from '../components/ui/story-scroll.tsx';

const LIME = '#C5FF3D';
const CREAM = '#F3F0EC';
const BLACK = '#111111';
const CORAL = '#FF7247';

const HEADLINE = 'text-[clamp(2.5rem,9vw,8rem)] font-bold leading-[0.9] uppercase tracking-tight';
const BODY = 'max-w-[50ch] text-[clamp(0.95rem,1.8vw,1.375rem)] font-normal leading-relaxed';
const GRID_LABEL = 'mb-1.5 text-sm font-bold uppercase tracking-wider';
const GRID_BODY = 'text-[clamp(0.8rem,1.1vw,0.95rem)] leading-relaxed opacity-75';

export default function LandingPage() {
  return (
    <FlowArt aria-label="Populr">
      <FlowSection aria-label="What is Populr" style={{ backgroundColor: BLACK, color: '#fff' }}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.2em]">01 — What is Populr</p>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: LIME }} />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Populr</span>
          </div>
        </div>
        <hr className="my-[1.5vw] border-none border-t border-white/20" />
        <div>
          <h1 className={HEADLINE}>
            Comments
            <br />
            Into
            <br />
            Customers
          </h1>
        </div>
        <hr className="my-[1.5vw] border-none border-t border-white/20" />
        <p className={`mt-auto ${BODY}`}>
          Populr turns your social comments, DMs, and followers into a real, sellable audience. No
          spreadsheets, no guesswork — just your next customer, found automatically.
        </p>
      </FlowSection>

      <FlowSection aria-label="The mission" style={{ backgroundColor: LIME, color: BLACK }}>
        <p className="text-xs font-bold uppercase tracking-[0.2em]">02 — The mission</p>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <div>
          <h2 className={HEADLINE}>
            Built
            <br />
            For
            <br />
            Creators
          </h2>
        </div>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <p className={BODY}>
          We built Populr because creators sit on gold every day — thousands of comments and DMs —
          with no way to turn them into a business. Populr reads the signals so you don&apos;t have to.
        </p>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <div className="flex flex-wrap gap-[3vw]">
          <div className="min-w-[180px] flex-1">
            <p className={GRID_LABEL}>Import</p>
            <p className={GRID_BODY}>
              Instagram, TikTok, YouTube, and X — every follower and fan in one place, automatically.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className={GRID_LABEL}>Detect</p>
            <p className={GRID_BODY}>
              Populr reads every comment and DM to spot who&apos;s ready to buy, book, or collaborate.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className={GRID_LABEL}>Convert</p>
            <p className={GRID_BODY}>
              Turn interest into income with segments, campaigns, and automations built for creators.
            </p>
          </div>
        </div>
      </FlowSection>

      <FlowSection aria-label="How it works" style={{ backgroundColor: CREAM, color: BLACK }}>
        <p className="text-xs font-bold uppercase tracking-[0.2em]">03 — How it works</p>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <div>
          <h2 className={HEADLINE}>
            Connect.
            <br />
            Detect.
            <br />
            Convert.
          </h2>
        </div>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <p className={BODY}>
          Three steps. Populr does the heavy lifting from your first comment to your next sale.
        </p>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <div className="mt-auto flex flex-wrap gap-[3vw]">
          <div className="min-w-[180px] flex-1">
            <p className={GRID_LABEL}>01 — Connect</p>
            <p className={GRID_BODY}>
              Link your socials in one tap. Instagram, TikTok, YouTube, and X — whenever you&apos;re
              ready.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className={GRID_LABEL}>02 — Detect</p>
            <p className={GRID_BODY}>
              Populr scans every comment and DM, flagging pricing questions, bookings, and collab
              requests instantly.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className={GRID_LABEL}>03 — Convert</p>
            <p className={GRID_BODY}>
              Contacts move from discovered to converted automatically — no manual tagging, no
              spreadsheets.
            </p>
          </div>
        </div>
      </FlowSection>

      <FlowSection aria-label="The vision" style={{ backgroundColor: BLACK, color: '#fff' }}>
        <p className="text-xs font-bold uppercase tracking-[0.2em]">04 — The vision</p>
        <hr className="my-[1.5vw] border-none border-t border-white/20" />
        <div>
          <h2 className={HEADLINE}>
            Own
            <br />
            Your
            <br />
            Audience
          </h2>
        </div>
        <hr className="my-[1.5vw] border-none border-t border-white/20" />
        <p className={BODY}>
          Your followers already trust you. Populr makes sure that trust turns into a business you
          actually own — not just an algorithm&apos;s attention.
        </p>
        <hr className="my-[1.5vw] border-none border-t border-white/20" />
        <div className="mt-auto flex flex-wrap gap-[3vw]">
          <div className="min-w-[180px] flex-1">
            <p className={GRID_LABEL} style={{ color: LIME }}>
              4 platforms
            </p>
            <p className={GRID_BODY}>
              Instagram, TikTok, YouTube, and X — connect them all, manage them from one inbox.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className={GRID_LABEL} style={{ color: CORAL }}>
              10 intent signals
            </p>
            <p className={GRID_BODY}>
              From casual engagement to conversion-ready, every message gets classified
              automatically.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className={GRID_LABEL} style={{ color: LIME }}>
              4-stage pipeline
            </p>
            <p className={GRID_BODY}>
              Discovered, engaged, interested, converted — know exactly where every contact stands.
            </p>
          </div>
        </div>
      </FlowSection>

      <FlowSection aria-label="Get started" style={{ backgroundColor: LIME, color: BLACK }}>
        <p className="text-xs font-bold uppercase tracking-[0.2em]">05 — Get started</p>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <div>
          <h2 className={HEADLINE}>
            Ready
            <br />
            To
            <br />
            Connect?
          </h2>
        </div>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <div className="mt-auto flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-[45ch] text-[clamp(0.95rem,1.8vw,1.375rem)] font-normal leading-relaxed">
            Connect your socials and Populr gets to work immediately — scanning comments, flagging
            opportunities, building your pipeline. Takes less than a minute.
          </p>
          <Link
            to="/connect"
            className="group inline-flex shrink-0 items-center justify-center gap-3 rounded-2xl bg-black px-8 py-5 text-base font-semibold text-white shadow-xl shadow-black/20 transition-transform hover:scale-[1.02]"
          >
            <Link2 className="h-5 w-5" />
            Connect Your Socials
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </FlowSection>
    </FlowArt>
  );
}
