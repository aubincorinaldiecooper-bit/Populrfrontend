"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Instagram, Music, Linkedin, Twitter, MessageCircle, AlertCircle, LogOut } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";

// Populr's supported connection surface: Instagram, TikTok, LinkedIn,
// Twitter/X, and Reddit. lucide-react has no dedicated TikTok or Reddit
// logo, so those two use a generic stand-in icon paired with the
// platform's real brand color (same convention already used for TikTok).
const PLATFORMS = [
  { id: "instagram", name: "Instagram", icon: Instagram, color: "#E4405F" },
  { id: "tiktok", name: "TikTok", icon: Music, color: "#000000" },
  { id: "linkedin", name: "LinkedIn", icon: Linkedin, color: "#0A66C2" },
  { id: "twitter", name: "Twitter", icon: Twitter, color: "#1DA1F2" },
  { id: "reddit", name: "Reddit", icon: MessageCircle, color: "#FF4500" },
];

/**
 * Onboarding is one real step: connect an account.
 *
 * It used to run three. Step 2 asked for an audience goal and wrote it to
 * `setSelectedAudienceGoal`, which nothing in the app has ever read — the
 * answer was collected and discarded. Step 3 was a ~3.4-second `setInterval`
 * incrementing a progress bar past five labels ("Scanning comments & DMs",
 * "Detecting purchase intent", …) that issued no network request of any
 * kind; it asserted five features had run over the user's account when none
 * had. Both are gone rather than restyled: the connect step is the only part
 * that ever did anything, and it's also the only thing the product actually
 * needs before Home is useful.
 *
 * The screen is also no longer a trap. Every route redirects here until
 * onboarding completes, and the only way forward was a Continue button
 * gated on a successful connection — so a creator hitting a subscription
 * wall, a provider outage, or an unreachable backend was stuck with no way
 * to leave and no way to sign out. Signing out is now always available.
 */
function CompletedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="drop-shadow-sm" aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill="#22c55e" />
      <path d="M5 8l2.5 2.5 3.5-4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SyncingIcon({ activeDashIndex }: { activeDashIndex: number }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, index) => {
        const angle = (index * 45) - 90;
        const radian = (angle * Math.PI) / 180;
        const radius = 6;
        const dashLength = 1.8;
        const startX = 8 + (radius - dashLength / 2) * Math.cos(radian);
        const startY = 8 + (radius - dashLength / 2) * Math.sin(radian);
        const endX = 8 + (radius + dashLength / 2) * Math.cos(radian);
        const endY = 8 + (radius + dashLength / 2) * Math.sin(radian);
        const isActive = index === activeDashIndex;
        return (
          <line key={index} x1={startX} y1={startY} x2={endX} y2={endY}
            stroke={isActive ? "#ffffff" : "#6b7280"} strokeWidth="2" strokeLinecap="round" />
        );
      })}
    </svg>
  );
}

function GradientOverlay({ status }: { status: string }) {
  if (status === "completed" || status === "idle") return null;
  const cls = status === "failed" ? "from-red-500/20" : "from-green-500/20";
  return (
    <div className={`absolute inset-0 bg-gradient-to-l ${cls} to-transparent pointer-events-none`}
      style={{ backgroundSize: "40% 100%", backgroundPosition: "right", backgroundRepeat: "no-repeat" }} />
  );
}

export default function Onboarding() {
  const {
    completeOnboarding, connectedPlatforms, beginPlatformConnect, completeOAuthReturn,
    failOAuthReturn, openSubscriptionModal, showToast,
  } = useApp();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [activeDashIndex, setActiveDashIndex] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const continueButtonRef = useRef<HTMLButtonElement | null>(null);

  const connectedCount = connectedPlatforms.filter(p => p.status === "connected").length;

  // Once the first platform connects (including the OAuth-return case below),
  // the product lets a user optionally connect more before continuing rather
  // than auto-advancing — so instead of jumping ahead, just make sure
  // Continue is impossible to miss.
  const prevConnectedCountRef = useRef(connectedCount);
  useEffect(() => {
    if (prevConnectedCountRef.current === 0 && connectedCount >= 1) {
      continueButtonRef.current?.focus();
    }
    prevConnectedCountRef.current = connectedCount;
  }, [connectedCount]);

  useEffect(() => {
    if (shouldReduceMotion) return;
    const interval = setInterval(() => setActiveDashIndex(prev => (prev + 1) % 8), 100);
    return () => clearInterval(interval);
  }, [shouldReduceMotion]);

  useEffect(() => {
    // `platform` is reused by the OAuth-result redirect below as a
    // diagnostic field (?connect_error=account_sync_failed&platform=
    // instagram), not a "please connect" request — without this guard, a
    // failed callback's platform= would be read here first, on the same
    // mount, and immediately relaunch OAuth for the platform that just
    // failed, turning a real error into a silent retry loop.
    if (searchParams.has("connected") || searchParams.has("connect_error")) return;
    const platformId = searchParams.get("platform");
    if (!platformId) return;
    const platform = connectedPlatforms.find(p => p.id === platformId);
    if (platform && platform.status === "idle") beginPlatformConnect(platformId);
    // Only run once on mount, driven by the CTA that landed the user here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Returning from the $12/month checkout (see SubscriptionModal — it now
  // returns here when it was opened while not yet onboarded, instead of
  // always going to /connections). Never marks anything subscribed locally
  // — that's not this frontend's to claim — just clears the way for the
  // user to manually retry the platform they were trying to connect.
  useEffect(() => {
    if (searchParams.get("subscription") !== "success") return;
    const retryId = searchParams.get("retry");
    const label = retryId ? PLATFORMS.find(p => p.id === retryId)?.name ?? retryId : null;
    showToast(
      label ? `Subscription confirmed. Try connecting ${label} again.` : "Subscription confirmed.",
      "success"
    );
    const url = new URL(window.location.href);
    url.searchParams.delete("subscription");
    url.searchParams.delete("retry");
    window.history.replaceState(null, "", url.toString());
    // Only run once on mount, driven by the checkout provider's return redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Returning from Zernio's hosted OAuth. Neither `connected=<platform>` nor
  // `connect_error=account_sync_failed` is trusted at face value:
  // - connect_error means the backend's own callback already confirmed sync
  //   failed, so failOAuthReturn just reflects that known outcome.
  // - connected means the callback *believes* it worked, but Zernio can be
  //   eventually consistent, so completeOAuthReturn re-verifies against the
  //   real account list (with bounded polling) before ever showing
  //   "Connected".
  // Query params are read and acted on before being stripped — stripping
  // first (the previous bug) meant a real async outcome had nowhere left to
  // go once its own marker was already gone from the URL. For the polling
  // path specifically, the URL isn't cleaned until that verification (success
  // or timeout) has actually finished, so a page reload mid-poll re-reads the
  // same marker instead of silently losing it.
  useEffect(() => {
    const connectError = searchParams.get("connect_error");
    const errorPlatform = connectError ? searchParams.get("platform") : null;
    const connectedPlatformId = searchParams.get("connected");
    if (!connectError && !connectedPlatformId) return;

    const cleanUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("connected");
      url.searchParams.delete("sync");
      url.searchParams.delete("connect_error");
      url.searchParams.delete("platform");
      window.history.replaceState(null, "", url.toString());
    };

    if (connectError === "subscription_required") {
      openSubscriptionModal(errorPlatform ?? undefined);
      cleanUrl();
    } else if (connectError === "account_sync_failed") {
      failOAuthReturn(errorPlatform ?? undefined);
      cleanUrl();
    } else if (connectedPlatformId) {
      completeOAuthReturn(connectedPlatformId).finally(cleanUrl);
    }
    // Only run once on mount, driven by the OAuth provider's return redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sign out failed.", "error");
      setSigningOut(false);
    }
  };

  const cards = PLATFORMS.map(p => {
    const cp = connectedPlatforms.find(c => c.id === p.id);
    const st = cp?.status || "idle";
    return {
      id: p.id, title: p.name,
      status: st === "connected" ? "completed" as const
        : st === "syncing" ? "syncing" as const
        : st === "connecting" ? "connecting" as const
        : st === "error" ? "failed" as const
        : "idle" as const,
      icon: p.icon, iconColor: p.color,
      errorMessage: cp?.errorMessage,
      onConnect: () => { if (st === "idle" || st === "error") beginPlatformConnect(p.id); },
    };
  });

  const sorted = [...cards].sort((a, b) => {
    if (a.status === "completed" && b.status !== "completed") return -1;
    if (a.status !== "completed" && b.status === "completed") return 1;
    return 0;
  });

  // "connecting" is the brief moment before the browser leaves for Zernio;
  // "syncing" is the return trip — verifying a real connected account exists
  // before the card is allowed to say "Connected" — which is why it gets its
  // own, longer-running "Finishing connection…" label.
  const statusText = (s: string) => {
    switch (s) {
      case "connecting": return "CONNECTING";
      case "syncing": return "FINISHING CONNECTION…";
      case "failed": return "FAILED";
      default: return null;
    }
  };

  const iconFor = (card: typeof cards[number]) => {
    if (card.status === "failed") return <AlertCircle size={16} className="text-red-500" />;
    if (card.status === "completed") return <CompletedIcon />;
    if (card.status === "syncing" || card.status === "connecting") return <SyncingIcon activeDashIndex={activeDashIndex} />;
    const Icon = card.icon;
    return <Icon size={18} style={{ color: card.iconColor }} aria-hidden="true" />;
  };

  return (
    <div className="min-h-screen bg-neutral-50 lg:grid lg:grid-cols-2">
      {/* Photo panel — desktop only. Mobile stays a lean, single-column flow
          so onboarding never competes with marketing imagery for space. */}
      <div className="relative hidden lg:block">
        <img
          src="/images/landing/friends-reacting.webp"
          alt="Three friends reacting to something on a phone together"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/10" />
        <div className="absolute bottom-10 left-10 right-10 text-white">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full bg-[#C5FF3D]" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Populr</span>
          </div>
          <p className="text-2xl font-semibold leading-snug">
            Engagement shouldn&rsquo;t end with a notification.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 min-h-screen lg:min-h-0">
        <div className="w-full max-w-[520px]">
          <div className="border border-neutral-200/60 rounded-2xl p-6 bg-white">
            <div className="mb-6">
              <h1 className="text-xl font-medium text-neutral-900">Connect your first account</h1>
              <p className="text-sm text-neutral-500 mt-1">
                Populr watches the accounts you connect for comments and DMs worth replying to.
                You can add more later from Channels.
              </p>
            </div>

            <motion.div className="space-y-3"
              variants={{ visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
              initial="hidden" animate="visible">
              <AnimatePresence mode="popLayout">
                {sorted.map(card => {
                  const isInteractive = card.status === "idle" || card.status === "failed";
                  return (
                    <motion.div key={card.id} layout layoutId={card.id}
                      variants={{
                        hidden: { opacity: 0, y: 20, scale: 0.98 },
                        visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 30, duration: shouldReduceMotion ? 0.2 : undefined } }
                      }}
                      exit={{ opacity: 0, y: -20, scale: 0.98, transition: { duration: shouldReduceMotion ? 0.15 : 0.2 } }}
                      transition={{ layout: { type: "spring", stiffness: 400, damping: 30, duration: shouldReduceMotion ? 0.2 : 0.5 } }}
                      className="relative rounded-xl"
                      onMouseEnter={() => setHoveredCard(card.id)}
                      onMouseLeave={() => setHoveredCard(null)}>

                      <motion.div
                        className="relative bg-neutral-100/60 border border-neutral-200/50 rounded-xl p-4 overflow-hidden"
                        whileHover={{ y: -1, transition: { type: "spring", stiffness: 400, damping: 25 } }}
                        animate={card.status === "completed" ? { scale: [1, 1.02, 1], transition: { duration: shouldReduceMotion ? 0 : 0.6, ease: [0.04, 0.62, 0.23, 0.98], times: [0, 0.3, 1] } } : {}}>
                        <GradientOverlay status={card.status} />

                        <div className="relative flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-5 h-5 flex items-center justify-center overflow-hidden flex-shrink-0">
                              <AnimatePresence mode="wait">
                                <motion.div key={card.status}
                                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                                  transition={{ type: "spring", stiffness: 400, damping: 25, duration: shouldReduceMotion ? 0.15 : undefined }}>
                                  {iconFor(card)}
                                </motion.div>
                              </AnimatePresence>
                            </div>
                            <span className="text-sm text-neutral-900 truncate">{card.title}</span>
                          </div>

                          <div className="flex items-center min-w-0 h-8 flex-shrink-0">
                            {/* The connect action is a real button rather than
                                a hover-only affordance on the card: hover
                                doesn't exist on touch, so the button stays
                                rendered and merely de-emphasized until hover
                                on pointer devices. */}
                            {isInteractive ? (
                              <button
                                onClick={card.onConnect}
                                className={`px-2.5 py-1.5 bg-white text-xs font-medium rounded-md border whitespace-nowrap cursor-pointer transition-colors ${
                                  card.status === "failed"
                                    ? "text-red-600 border-red-200 hover:bg-red-50"
                                    : "text-neutral-900 border-neutral-200/60 hover:bg-neutral-50"
                                } ${hoveredCard === card.id ? "opacity-100" : "opacity-90"}`}
                              >
                                {card.status === "failed" ? "Retry" : "Connect"}
                              </button>
                            ) : statusText(card.status) ? (
                              <motion.span key="st" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="text-xs font-mono font-medium tracking-wider whitespace-nowrap text-neutral-400">
                                {statusText(card.status)}
                              </motion.span>
                            ) : null}
                          </div>
                        </div>
                        {card.status === "failed" && card.errorMessage && (
                          <p className="relative text-xs text-red-500 mt-2 leading-relaxed">{card.errorMessage}</p>
                        )}
                      </motion.div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>

            <motion.button
              ref={continueButtonRef}
              onClick={completeOnboarding}
              disabled={connectedCount < 1}
              className={`w-full mt-6 rounded-[14px] py-3.5 font-semibold text-sm transition-all ${
                connectedCount >= 1
                  ? "bg-neutral-900 text-white hover:bg-neutral-800 cursor-pointer"
                  : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
              }`}
              whileHover={connectedCount >= 1 ? { scale: 1.01 } : {}}
              whileTap={connectedCount >= 1 ? { scale: 0.99 } : {}}>
              {connectedCount >= 1 ? "Continue to Populr" : "Connect an account to continue"}
            </motion.button>
          </div>

          {/* Escape hatch. Onboarding is the only reachable route until it
              completes, so without this a failed connection — a provider
              outage, a subscription wall, an unreachable backend — left the
              user with no way out of the app at all, not even to sign out. */}
          <div className="mt-4 text-center">
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 transition-colors disabled:opacity-50"
            >
              <LogOut size={13} />{signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
