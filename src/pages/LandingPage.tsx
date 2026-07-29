import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import FlowArt, { FlowSection } from '../components/ui/story-scroll.tsx';

const LIME = '#C5FF3D';
const CREAM = '#F3F0EC';
const BLACK = '#111111';

const HEADLINE = 'text-[clamp(2.5rem,9vw,8rem)] font-bold leading-[0.9] uppercase tracking-tight';
const BODY = 'max-w-[50ch] text-[clamp(0.95rem,1.8vw,1.375rem)] font-normal leading-relaxed';
const GRID_LABEL = 'mb-1.5 text-sm font-bold uppercase tracking-wider';
const GRID_BODY = 'text-[clamp(0.8rem,1.1vw,0.95rem)] leading-relaxed opacity-75';

// Every photo is absolutely positioned so it never adds to a section's flow
// height — sections are min-h-screen and GSAP-pinned per section, so any
// layout-flow content would grow a section past 100vh and force extra
// scroll. Desktop gets a full-height side panel; mobile gets a large framed
// banner filling the open space between the headline and the bottom content.
function SectionPhoto({
  src,
  alt,
  bg,
  mobileClassName,
}: {
  src: string;
  alt: string;
  bg: string;
  mobileClassName: string;
}) {
  return (
    <>
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[38%] overflow-hidden lg:block">
        <img src={src} alt={alt} className="h-full w-full object-cover" />
        <div
          className="absolute inset-y-0 left-0 w-1/3"
          style={{ background: `linear-gradient(to right, ${bg}, transparent)` }}
        />
      </div>
      <img
        src={src}
        alt={alt}
        className={`pointer-events-none absolute inset-x-[6vw] rounded-2xl object-cover shadow-2xl lg:hidden ${mobileClassName}`}
      />
    </>
  );
}

// Two CTAs styled for a dark section: "Creator" is the primary action (fills
// the site's existing chartreuse-as-primary convention), "Brand" is
// secondary. Both currently point at the same real connect flow — there's
// no separate brand-signup path yet, only a different label.
function JoinButtons() {
  return (
    <div className="flex flex-col gap-3 xs:flex-row">
      <Link
        to="/connect"
        className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold text-[#111111] shadow-xl shadow-black/20 transition-transform hover:scale-[1.02]"
        style={{ backgroundColor: LIME }}
      >
        Join as a Creator
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Link>
      <Link
        to="/connect"
        className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/30 px-6 py-4 text-sm font-semibold text-white transition-all hover:border-white/70 hover:bg-white/5"
      >
        Join as a Brand
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Link>
    </div>
  );
}

export default function LandingPage() {
  return (
    <FlowArt aria-label="Populr">
      {/* 01 — Hero */}
      <FlowSection aria-label="Engagement shouldn't end with a notification" style={{ backgroundColor: BLACK, color: '#fff' }}>
        <SectionPhoto
          src="/images/landing/friends-reacting.webp"
          alt="Three friends reacting to something on a phone together"
          bg={BLACK}
          mobileClassName="top-[36vh] h-[23vh]"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.2em]">01 — Why Populr</p>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: LIME }} />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Populr</span>
          </div>
        </div>
        <hr className="my-[1.5vw] border-none border-t border-white/20" />
        <div className="lg:max-w-[62%]">
          <h1 className={HEADLINE}>
            Engagement
            <br />
            Shouldn&apos;t End With
            <br />A Notification.
          </h1>
        </div>
        <hr className="my-[1.5vw] border-none border-t border-white/20" />
        <div className="mt-auto flex flex-col gap-8 lg:max-w-[62%]">
          <div className="space-y-3">
            <p className={BODY}>
              Comments and messages are easy to miss — and even harder to follow up on across
              different platforms.
            </p>
            <p className={BODY}>
              Populr helps you respond automatically, organize the people engaging with your
              content, and keep important conversations moving.
            </p>
          </div>
          <JoinButtons />
        </div>
      </FlowSection>

      {/* 02 — Automated follow-up */}
      <FlowSection aria-label="Respond while their interest is still there" style={{ backgroundColor: LIME, color: BLACK }}>
        <SectionPhoto
          src="/images/landing/connect-selfie.webp"
          alt="A creator holding up her phone, framing a selfie"
          bg={LIME}
          mobileClassName="top-[32vh] h-[44vh]"
        />
        <p className="text-xs font-bold uppercase tracking-[0.2em]">02 — Automated follow-up</p>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <div className="lg:max-w-[62%]">
          <h2 className={HEADLINE}>
            Respond While
            <br />
            Their Interest
            <br />
            Is Still There.
          </h2>
        </div>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <div className="mt-auto space-y-3 lg:max-w-[62%]">
          <p className={BODY}>
            Automatically send a message when someone comments on your content or reaches out
            directly.
          </p>
          <p className={BODY}>
            Answer common questions, share useful information, and give interested followers a
            clear next step without manually replying to every interaction.
          </p>
        </div>
      </FlowSection>

      {/* 03 — Connected inbox */}
      <FlowSection aria-label="Your social conversations, together" style={{ backgroundColor: CREAM, color: BLACK }}>
        <SectionPhoto
          src="/images/landing/creator-glam.webp"
          alt="A creator applying makeup while filming content"
          bg={CREAM}
          mobileClassName="top-[32vh] h-[44vh]"
        />
        <p className="text-xs font-bold uppercase tracking-[0.2em]">03 — Connected inbox</p>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <div className="lg:max-w-[62%]">
          <h2 className="text-[clamp(2.5rem,9vw,6rem)] font-bold uppercase leading-[0.9] tracking-tight">
            Your Social
            <br />
            Conversations,
            <br />
            Together.
          </h2>
        </div>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <div className="mt-auto space-y-3 lg:max-w-[62%]">
          <p className={BODY}>
            Stop switching between platforms to find messages, remember conversations, or figure
            out who still needs a response.
          </p>
          <p className={BODY}>
            Populr brings your audience conversations into one place so you can see what is
            happening and focus on what needs your attention.
          </p>
        </div>
      </FlowSection>

      {/* 04 — Audience context */}
      <FlowSection aria-label="Know who you're talking to" style={{ backgroundColor: BLACK, color: '#fff' }}>
        <SectionPhoto
          src="/images/landing/audience-crowd.webp"
          alt="A performer on stage in front of a crowd holding up their phones"
          bg={BLACK}
          mobileClassName="top-[32vh] h-[47vh]"
        />
        <p className="text-xs font-bold uppercase tracking-[0.2em]">04 — Audience context</p>
        <hr className="my-[1.5vw] border-none border-t border-white/20" />
        <div className="lg:max-w-[62%]">
          <h2 className={HEADLINE}>
            Know Who You&apos;re
            <br />
            Talking To.
          </h2>
        </div>
        <hr className="my-[1.5vw] border-none border-t border-white/20" />
        <div className="mt-auto space-y-3 lg:max-w-[62%]">
          <p className={BODY}>
            See where each contact came from, what they engaged with, and how the conversation
            started.
          </p>
          <p className={BODY}>
            Instead of searching through old notifications and message threads, you have the
            context you need before responding.
          </p>
        </div>
      </FlowSection>

      {/* 05 — Turn interest into a next step */}
      <FlowSection aria-label="Do more with the attention you already have" style={{ backgroundColor: LIME, color: BLACK }}>
        <SectionPhoto
          src="/images/landing/creator-fitness.webp"
          alt="Two creators posing together in a gym"
          bg={LIME}
          mobileClassName="top-[36vh] h-[43vh]"
        />
        <p className="text-xs font-bold uppercase tracking-[0.2em]">05 — Turn interest into a next step</p>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <div className="lg:max-w-[62%]">
          <h2 className={HEADLINE}>
            Do More With
            <br />
            The Attention
            <br />
            You Already Have.
          </h2>
        </div>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <div className="mt-auto space-y-3 lg:max-w-[62%]">
          <p className={BODY}>
            Send a resource, share product details, answer a question, support a booking, or
            direct someone to the right destination.
          </p>
          <p className={BODY}>
            Populr helps you move people forward while their interest is still active.
          </p>
        </div>
      </FlowSection>

      {/* 06 — How Populr works */}
      <FlowSection aria-label="How Populr works" style={{ backgroundColor: CREAM, color: BLACK }}>
        <p className="text-xs font-bold uppercase tracking-[0.2em]">06 — How Populr works</p>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <div>
          <h2 className={HEADLINE}>
            How
            <br />
            Populr
            <br />
            Works
          </h2>
        </div>
        <hr className="my-[1.5vw] border-none border-t border-black/20" />
        <div className="mt-auto flex flex-wrap gap-[3vw]">
          <div className="min-w-[180px] flex-1">
            <p className={GRID_LABEL}>01 — Connect your accounts</p>
            <p className={GRID_BODY}>
              Bring your supported social accounts and audience conversations into Populr.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className={GRID_LABEL}>02 — Set your response</p>
            <p className={GRID_BODY}>
              Choose what Populr should send when someone comments on your content or sends you a
              message.
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <p className={GRID_LABEL}>03 — Keep track of the conversation</p>
            <p className={GRID_BODY}>
              See who engaged, understand where they came from, and continue the conversation from
              one organized workspace.
            </p>
          </div>
        </div>
      </FlowSection>

      {/* 07 — Closing CTA */}
      <FlowSection aria-label="Make more of the audience you already have" style={{ backgroundColor: BLACK, color: '#fff' }}>
        <p className="text-xs font-bold uppercase tracking-[0.2em]">07 — Get started</p>
        <hr className="my-[1.5vw] border-none border-t border-white/20" />
        <div>
          <h2 className={HEADLINE}>
            Make More Of
            <br />
            The Audience
            <br />
            You Already Have.
          </h2>
        </div>
        <hr className="my-[1.5vw] border-none border-t border-white/20" />
        <div className="mt-auto flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-[45ch] text-[clamp(0.95rem,1.8vw,1.375rem)] font-normal leading-relaxed">
            You are already creating the content and earning the attention. Populr helps you
            respond, stay organized, and turn that engagement into something you can continue
            building on.
          </p>
          <JoinButtons />
        </div>
      </FlowSection>
    </FlowArt>
  );
}
