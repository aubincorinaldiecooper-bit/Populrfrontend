"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronLeft, Instagram, Music, Youtube, Twitter } from "lucide-react";
import { useSearchParams } from "react-router";
import { useApp } from "../context/AppContext";

const PLATFORMS = [
  { id: "instagram", name: "Instagram", icon: Instagram, color: "#E4405F" },
  { id: "tiktok", name: "TikTok", icon: Music, color: "#000000" },
  { id: "youtube", name: "YouTube", icon: Youtube, color: "#FF0000" },
  { id: "twitter", name: "Twitter", icon: Twitter, color: "#000000" },
];

const GOALS = [
  { id: "audience", label: "Build audience" },
  { id: "products", label: "Sell digital products" },
  { id: "coaching", label: "Book coaching calls" },
  { id: "ads", label: "Run ad campaigns" },
];

const ANALYSIS_ITEMS = [
  { id: "followers", label: "Import followers & fans" },
  { id: "interactions", label: "Scanning comments & DMs" },
  { id: "intent", label: "Detecting purchase intent" },
  { id: "segments", label: "Building audience segments" },
  { id: "profile", label: "Enriching contact profiles" },
];

type Step = 1 | 2 | 3;

// Exact SVG icons from reference
function CompletedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="drop-shadow-sm">
      <circle cx="8" cy="8" r="8" fill="#22c55e" />
      <path d="M5 8l2.5 2.5 3.5-4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UpdatesFoundIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <path d="M8 1.5L14.5 13H1.5L8 1.5Z" fill="#eab308" stroke="#eab308" strokeWidth="1" strokeLinejoin="round" />
      <path d="M8 6v3M8 11h0" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SyncingIcon({ activeDashIndex }: { activeDashIndex: number }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
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

function EmptyCircle() {
  return <div className="w-[16px] h-[16px] rounded-full border-2 border-[#d4d4d8]" />;
}

function GradientOverlay({ status }: { status: string }) {
  if (status === "completed" || status === "idle") return null;
  const cls = status === "updates-found" ? "from-red-500/20" : "from-green-500/20";
  return (
    <div className={`absolute inset-0 bg-gradient-to-l ${cls} to-transparent pointer-events-none`}
      style={{ backgroundSize: "40% 100%", backgroundPosition: "right", backgroundRepeat: "no-repeat" }} />
  );
}

export default function Onboarding() {
  const { completeOnboarding, connectedPlatforms, beginPlatformConnect, refreshConnectedAccounts, setSelectedAudienceGoal } = useApp();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [selectedGoal, setSelectedGoal] = useState("");
  const [customGoal, setCustomGoal] = useState("");
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [activeDashIndex, setActiveDashIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  const connectedCount = connectedPlatforms.filter(p => p.status === "connected").length;

  useEffect(() => {
    if (shouldReduceMotion) return;
    const interval = setInterval(() => setActiveDashIndex(prev => (prev + 1) % 8), 100);
    return () => clearInterval(interval);
  }, [shouldReduceMotion]);

  useEffect(() => {
    const platformId = searchParams.get("platform");
    if (!platformId) return;
    const platform = connectedPlatforms.find(p => p.id === platformId);
    if (platform && platform.status === "idle") beginPlatformConnect(platformId);
    // Only run once on mount, driven by the CTA that landed the user here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Returning from the Zernio OAuth redirect (?connected=<platform>): pull the
  // real synced account from the backend instead of trusting the URL alone.
  useEffect(() => {
    const connectedPlatformId = searchParams.get("connected");
    if (!connectedPlatformId) return;
    refreshConnectedAccounts();
    const url = new URL(window.location.href);
    url.searchParams.delete("connected");
    window.history.replaceState(null, "", url.toString());
    // Only run once on mount, driven by the OAuth provider's return redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step !== 3) return;
    setAnalysisProgress(0);
    const interval = setInterval(() => {
      setAnalysisProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => completeOnboarding(), 600);
          return 100;
        }
        return prev + 3;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [step, completeOnboarding]);

  const handleBack = () => { if (step > 1) setStep((s) => (s - 1) as Step); };
  const handleContinue = useCallback(() => {
    if (step === 2 && selectedGoal) {
      const goalToSave = selectedGoal === "other" && customGoal.trim() ? customGoal.trim() : selectedGoal;
      setSelectedAudienceGoal(goalToSave);
    }
    if (step < 3) setStep((s) => (s + 1) as Step);
  }, [step, selectedGoal, customGoal, setSelectedAudienceGoal]);

  const completedAnalysisItems = Math.floor((analysisProgress / 100) * ANALYSIS_ITEMS.length);
  const stepTitle = step === 1 ? "Connect your platforms" : step === 2 ? "What's your goal?" : "Analyzing your audience";

  // Build cards
  const s1Cards = PLATFORMS.map(p => {
    const cp = connectedPlatforms.find(c => c.id === p.id);
    const st = cp?.status || "idle";
    return {
      id: p.id, title: p.name,
      status: st === "connected" ? "completed" as const : st === "connecting" ? "syncing" as const : "idle" as const,
      icon: p.icon, iconColor: p.color,
      onConnect: () => { if (st === "idle") beginPlatformConnect(p.id); },
    };
  });

  const s2Cards = [
    ...GOALS.map(g => ({ id: g.id, title: g.label, status: (selectedGoal === g.id ? "completed" : "idle") as "completed"|"idle", onSelect: () => setSelectedGoal(g.id) })),
    { id: "other", title: customGoal.trim() || "What's your goal?", status: (selectedGoal === "other" ? "completed" : "idle") as "completed"|"idle", isInput: true as const, onSelect: () => setSelectedGoal("other") },
  ];

  const s3Cards = ANALYSIS_ITEMS.map((item, i) => {
    const done = i < completedAnalysisItems;
    const curr = i === completedAnalysisItems && analysisProgress < 100;
    return { id: item.id, title: item.label, status: done ? "completed" as const : curr ? "syncing" as const : "updates-found" as const };
  });

  const cards: any[] = step === 1 ? s1Cards : step === 2 ? s2Cards : s3Cards;
  const sorted = [...cards].sort((a, b) => {
    if (a.status === "completed" && b.status !== "completed") return -1;
    if (a.status !== "completed" && b.status === "completed") return 1;
    return 0;
  });

  const statusText = (s: string) => { switch (s) { case "updates-found": return "PENDING"; case "syncing": return "SYNCING"; default: return null; } };

  const iconFor = (card: any) => {
    if (card.status === "completed") return <CompletedIcon />;
    if (card.status === "syncing") return <SyncingIcon activeDashIndex={activeDashIndex} />;
    if (step === 3) return <UpdatesFoundIcon />;
    if (step === 1 && card.icon) return <card.icon size={18} style={{ color: card.iconColor }} />;
    return <EmptyCircle />;
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-[520px]">
        {/* Card */}
        <div className="border border-neutral-200/60 rounded-2xl p-6 bg-white">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <motion.button onClick={handleBack} disabled={step === 1}
              className={`p-2 rounded-lg bg-white border border-neutral-200/60 transition-colors ${step === 1 ? "opacity-30 cursor-not-allowed" : "hover:bg-neutral-50 cursor-pointer"}`}
              whileHover={step !== 1 ? { scale: 1.05 } : {}} whileTap={step !== 1 ? { scale: 0.98 } : {}}>
              <ChevronLeft className="w-4 h-4 text-neutral-900" />
            </motion.button>

            <h1 className="text-xl font-medium text-neutral-900">{stepTitle}</h1>

            <div className="w-8" />
          </div>

          {/* Cards */}
          <motion.div className="space-y-3"
            variants={{ visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
            initial="hidden" animate="visible">
            <AnimatePresence mode="popLayout">
              {sorted.map(card => {
                const isInteractive = card.status === "idle" && !card.isInput;
                const activate = () => {
                  if (step === 1) card.onConnect?.();
                  else if (step === 2) card.onSelect?.();
                };
                return (
                <motion.div key={card.id} layout layoutId={card.id}
                  variants={{
                    hidden: { opacity: 0, y: 20, scale: 0.98 },
                    visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 30, duration: shouldReduceMotion ? 0.2 : undefined } }
                  }}
                  exit={{ opacity: 0, y: -20, scale: 0.98, transition: { duration: shouldReduceMotion ? 0.15 : 0.2 } }}
                  transition={{ layout: { type: "spring", stiffness: 400, damping: 30, duration: shouldReduceMotion ? 0.2 : 0.5 } }}
                  className={`relative rounded-xl ${isInteractive ? "outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/50 focus-visible:ring-offset-2" : ""}`}
                  onMouseEnter={() => setHoveredCard(card.id)} onMouseLeave={() => setHoveredCard(null)}
                  role={isInteractive ? "button" : undefined}
                  tabIndex={isInteractive ? 0 : undefined}
                  onClick={isInteractive ? activate : undefined}
                  onKeyDown={isInteractive ? (e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
                  } : undefined}>

                  <motion.div
                    className={`relative bg-neutral-100/60 border border-neutral-200/50 rounded-xl p-4 overflow-hidden ${isInteractive ? "cursor-pointer" : ""}`}
                    whileHover={{ y: -1, transition: { type: "spring", stiffness: 400, damping: 25 } }}
                    animate={card.status === "completed" ? { scale: [1, 1.02, 1], transition: { duration: shouldReduceMotion ? 0 : 0.6, ease: [0.04, 0.62, 0.23, 0.98], times: [0, 0.3, 1] } } : {}}>
                    <GradientOverlay status={card.status} />

                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 flex items-center justify-center overflow-hidden flex-shrink-0">
                          <AnimatePresence mode="wait">
                            <motion.div key={card.status + step}
                              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 400, damping: 25, duration: shouldReduceMotion ? 0.15 : undefined }}>
                              {iconFor(card)}
                            </motion.div>
                          </AnimatePresence>
                        </div>

                        {step === 2 && card.isInput ? (
                          <input type="text" value={customGoal}
                            onChange={e => { setCustomGoal(e.target.value); setSelectedGoal("other"); }}
                            onFocus={() => setSelectedGoal("other")} placeholder="What's your goal?"
                            className="bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 outline-none border-none p-0 w-48"
                            onClick={e => e.stopPropagation()} />
                        ) : (
                          <span className="text-sm text-neutral-900 truncate">{card.title}</span>
                        )}
                      </div>

                      <div className="flex items-center min-w-0 h-8">
                        <AnimatePresence mode="wait">
                          {step === 1 && card.status === "idle" && hoveredCard === card.id ? (
                            <motion.button key="c" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 400, damping: 25 }}
                              onClick={e => { e.stopPropagation(); card.onConnect?.(); }}
                              className="px-2.5 py-1 bg-white text-neutral-900 text-xs font-medium rounded-md border border-neutral-200/60 whitespace-nowrap cursor-pointer hover:bg-neutral-50">
                              Connect
                            </motion.button>
                          ) : step === 1 && card.status === "idle" ? null
                          : step === 2 && card.status === "idle" && hoveredCard === card.id && !card.isInput ? (
                            <motion.button key="s" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 400, damping: 25 }}
                              onClick={e => { e.stopPropagation(); card.onSelect?.(); }}
                              className="px-2.5 py-1 bg-white text-neutral-900 text-xs font-medium rounded-md border border-neutral-200/60 whitespace-nowrap cursor-pointer hover:bg-neutral-50">
                              Select
                            </motion.button>
                          ) : step === 2 && card.status === "idle" ? null
                          : statusText(card.status) ? (
                            <motion.span key="st" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                              className="text-xs font-mono font-medium text-neutral-400 tracking-wider whitespace-nowrap">
                              {statusText(card.status)}
                            </motion.span>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>

          {/* Progress bar */}
          {step === 3 && (
            <div className="mt-5">
              <div className="h-[3px] bg-neutral-200 rounded-full overflow-hidden">
                <motion.div className="h-full bg-green-500 rounded-full" style={{ width: `${analysisProgress}%` }} transition={{ duration: 0.1 }} />
              </div>
              <p className="text-center text-xs font-mono text-neutral-400 mt-2 tracking-wider">{analysisProgress}% COMPLETE</p>
            </div>
          )}

          {/* Continue */}
          {step < 3 && (
            <motion.button onClick={handleContinue}
              disabled={step === 1 ? connectedCount < 1 : selectedGoal === "" || (selectedGoal === "other" && customGoal.trim() === "")}
              className={`w-full mt-6 rounded-[14px] py-3.5 font-semibold text-sm transition-all ${
                (step === 1 && connectedCount >= 1) || (step === 2 && selectedGoal !== "" && (selectedGoal !== "other" || customGoal.trim() !== ""))
                  ? "bg-neutral-900 text-white hover:bg-neutral-800 cursor-pointer"
                  : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
              }`}
              whileHover={((step === 1 && connectedCount >= 1) || (step === 2 && selectedGoal)) ? { scale: 1.01 } : {}}
              whileTap={((step === 1 && connectedCount >= 1) || (step === 2 && selectedGoal)) ? { scale: 0.99 } : {}}>
              {step === 1 ? "Continue" : "Start analyzing"}
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
