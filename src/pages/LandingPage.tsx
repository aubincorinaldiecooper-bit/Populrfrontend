import { Link } from 'react-router';
import { Instagram, ArrowRight } from 'lucide-react';
import FlowArt, { FlowSection } from '../components/ui/story-scroll.tsx';

const LIME = '#C5FF3D';
const CREAM = '#F3F0EC';
const BLACK = '#111111';
const CORAL = '#FF7247';

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
        <hr className="my-[2vw] border-none border-t border-white/20" />
        <div>
          <h1 className="text-[clamp(3.5rem,12vw,14rem)] font-bold leading-[0.85] uppercase tracking-tight">
            Comments
            <br />
            Into
            <br />
            Customers
          </h1>
        </div>
        <hr className="my-[2vw] border-none border-t border-white/20" />
        <p className="mt-auto max-w-[50ch] text-[clamp(1rem,2.5vw,2rem)] font-normal leading-relaxed">
          Populr turns your Instagram comments, DMs, and followers into a real, sellable audience.
          No spreadsheets, no guesswork — just your next customer, found automatically.
        </p>
      </FlowSection>

      <FlowSection aria-label="The mission" style={{ backgroundColor: LIME, color: BLACK }}>
        <p className="text-xs font-bold uppercase tracking-[0.2em]">02 — The mission</p>
        <hr className="my-[2vw] border-none border-t border-black/20" />
        <div>
          <h2 className="text-[clamp(3.5rem,12vw,14rem)] font-bold leading-[0.85] uppercase tracking-tight">
            Built
            <br />
            For
            <br />
            Creators
          </h2>
        </div>
        <hr className="my-[2vw] border-none border-t border-black/20" />
        <p className="max-w-[50ch] text-[clamp(1rem,2.5vw,2rem)] font-normal leading-relaxed">
          We built Populr because creators sit on gold every day — thousands of comments and DMs —
          with no way to turn them into a business. Populr reads the signals so you don&apos;t have to.
        </p>
        <hr className="my-[2vw] border-none border-t border-black/20" />
        <div className="flex flex-wrap gap-[3vw]">
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider">Import</p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Instagram, TikTok, YouTube, and X — every follower and fan in one place, automatically.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider">Detect</p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Populr reads every comment and DM to spot who&apos;s ready to buy, book, or collaborate.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider">Convert</p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Turn interest into income with segments, campaigns, and automations built for creators.
            </p>
          </div>
        </div>
        <hr className="my-[2vw] border-none border-t border-black/20" />
        <div className="flex flex-wrap gap-[3vw]">
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider">Pipeline</p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Every contact moves from discovered to engaged to interested to converted — visible at
              a glance.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider">Automations</p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Auto-reply to DMs and comments the moment intent is detected — day or night.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider">Analytics</p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Track reach, engagement, and follower growth without leaving your inbox.
            </p>
          </div>
        </div>
        <hr className="my-[2vw] border-none border-t border-black/20" />
        <p className="mt-auto ml-auto max-w-[50ch] text-right text-[clamp(1rem,2.5vw,2rem)] font-normal leading-relaxed">
          Every feature we ship starts with one question — does this turn a follower into a customer?
        </p>
      </FlowSection>

      <FlowSection aria-label="How it works" style={{ backgroundColor: CREAM, color: BLACK }}>
        <p className="text-xs font-bold uppercase tracking-[0.2em]">03 — How it works</p>
        <hr className="my-[2vw] border-none border-t border-black/20" />
        <div>
          <h2 className="text-[clamp(3.5rem,12vw,14rem)] font-bold leading-[0.85] uppercase tracking-tight">
            Connect.
            <br />
            Detect.
            <br />
            Convert.
          </h2>
        </div>
        <hr className="my-[2vw] border-none border-t border-black/20" />
        <p className="max-w-[50ch] text-[clamp(1rem,2.5vw,2rem)] font-normal leading-relaxed">
          Three steps. Populr does the heavy lifting from your first Instagram comment to your next
          sale.
        </p>
        <hr className="my-[2vw] border-none border-t border-black/20" />
        <div className="flex flex-wrap gap-[3vw]">
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider">01 — Connect</p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Link Instagram in one tap. Add TikTok, YouTube, and X whenever you&apos;re ready.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider">02 — Detect</p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Populr scans every comment and DM, flagging pricing questions, bookings, and
              collab requests instantly.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider">03 — Segment</p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Contacts are grouped automatically — warm, ready, high-value, at-risk — no manual
              tagging.
            </p>
          </div>
        </div>
        <hr className="my-[2vw] border-none border-t border-black/20" />
        <div className="flex flex-wrap gap-[3vw]">
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider">04 — Campaign</p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Send targeted broadcasts to the segments most likely to convert.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider">05 — Automate</p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Set the rules once. Populr replies, books, and follows up while you create.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider">06 — Grow</p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Watch opportunities move from discovered to converted in one pipeline view.
            </p>
          </div>
        </div>
      </FlowSection>

      <FlowSection aria-label="The vision" style={{ backgroundColor: BLACK, color: '#fff' }}>
        <p className="text-xs font-bold uppercase tracking-[0.2em]">04 — The vision</p>
        <hr className="my-[2vw] border-none border-t border-white/20" />
        <div>
          <h2 className="text-[clamp(3.5rem,12vw,14rem)] font-bold leading-[0.85] uppercase tracking-tight">
            Own
            <br />
            Your
            <br />
            Audience
          </h2>
        </div>
        <hr className="my-[2vw] border-none border-t border-white/20" />
        <p className="max-w-[50ch] text-[clamp(1rem,2.5vw,2rem)] font-normal leading-relaxed">
          Your followers already trust you. Populr makes sure that trust turns into a business you
          actually own — not just an algorithm&apos;s attention.
        </p>
        <hr className="my-[2vw] border-none border-t border-white/20" />
        <div className="flex flex-wrap gap-[3vw]">
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider" style={{ color: LIME }}>
              4 platforms
            </p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Instagram, TikTok, YouTube, and X — connect them all, manage them from one inbox.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider" style={{ color: CORAL }}>
              10 intent signals
            </p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              From casual engagement to conversion-ready, every message gets classified automatically.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider" style={{ color: LIME }}>
              4-stage pipeline
            </p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Discovered, engaged, interested, converted — know exactly where every contact stands.
            </p>
          </div>
        </div>
        <hr className="my-[2vw] border-none border-t border-white/20" />
        <p className="max-w-[50ch] text-[clamp(1rem,2.5vw,2rem)] font-normal leading-relaxed">
          No algorithm gatekeeping. No black box. Just clear signal about who&apos;s ready to become a
          customer — and the tools to reach them.
        </p>
        <hr className="my-[2vw] border-none border-t border-white/20" />
        <div className="flex flex-wrap gap-[3vw]">
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider">One home base</p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Comments, DMs, and reviews — every channel, one inbox.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider">You keep control</p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              Your audience data stays yours. Export, segment, and own every contact.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider">Built to convert</p>
            <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
              From first comment to booked call to closed sale, Populr tracks the whole journey.
            </p>
          </div>
        </div>
      </FlowSection>

      <FlowSection aria-label="Get started" style={{ backgroundColor: LIME, color: BLACK }}>
        <p className="text-xs font-bold uppercase tracking-[0.2em]">05 — Get started</p>
        <hr className="my-[2vw] border-none border-t border-black/20" />
        <div>
          <h2 className="text-[clamp(3.5rem,12vw,14rem)] font-bold leading-[0.85] uppercase tracking-tight">
            Ready
            <br />
            To
            <br />
            Connect?
          </h2>
        </div>
        <hr className="my-[2vw] border-none border-t border-black/20" />
        <div className="mt-auto flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-[45ch] text-[clamp(1rem,2.5vw,2rem)] font-normal leading-relaxed">
            Link your Instagram and Populr gets to work immediately — scanning comments, flagging
            opportunities, building your pipeline. Takes less than a minute.
          </p>
          <Link
            to="/connect?platform=instagram"
            className="group inline-flex shrink-0 items-center justify-center gap-3 rounded-2xl bg-black px-8 py-5 text-base font-semibold text-white shadow-xl shadow-black/20 transition-transform hover:scale-[1.02]"
          >
            <Instagram className="h-5 w-5" />
            Connect with Instagram
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </FlowSection>
    </FlowArt>
  );
}
