"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProxyRequest {
  id: string;
  created_at: string;
  target_url: string;
  payer_address: string | null;
  amount_usdc: string;
  status: string;
  risk_score: number | null;
  action: string | null;
  reasoning: string | null;
  content: string | null;
  content_type: string | null;
  gateway_tx: string | null;
  network: string | null;
}

// ─── Pipeline Stages ─────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  {
    label: "FETCH",
    description: "The agent submits a target URL. Rheo fetches the raw page content on behalf of the agent — no direct exposure to the untrusted source.",
  },
  {
    label: "EVALUATE",
    description: "Llama-3.1-8b analyzes the first 15,000 characters for prompt injection attacks, XSS payloads, and adversarial language patterns. Real reasoning, not regex.",
  },
  {
    label: "PRICE",
    description: "A deterministic fee formula calculates cost based on content token count and risk score. The LLM never touches pricing — it is a pure TypeScript function.",
  },
  {
    label: "PAY",
    description: "The agent signs an EIP-3009 authorization off-chain. Circle Gateway verifies and settles testnet USDC in milliseconds — no gas cost per request.",
  },
  {
    label: "CLEAN",
    description: "Sanitized or quarantined content is returned to the agent. Every transaction is logged to Supabase with full audit trail.",
  },
];




// ─── Helper Components ───────────────────────────────────────────────────────

function RiskBadge({ action }: { action: string | null }) {
  const map: Record<string, string> = {
    allow: "text-[#4ADE80] border-[#4ADE80]/25 bg-[#4ADE80]/8",
    sanitize: "text-[#EAB308] border-[#EAB308]/25 bg-[#EAB308]/8",
    quarantine: "text-[#F87171] border-[#F87171]/25 bg-[#F87171]/8",
  };
  const cls = action ? map[action.toLowerCase()] ?? "text-zinc-400 border-zinc-700 bg-zinc-800/40" : "text-zinc-600 border-zinc-800 bg-zinc-900/40";
  return (
    <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-semibold tracking-wider inline-block font-mono ${cls}`}>
      {action ?? "—"}
    </span>
  );
}

function BracketButton({ children, onClick, disabled, className = "" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative group inline-flex items-center gap-2 px-6 py-3 font-mono text-xs uppercase tracking-widest text-[#D97B3F] border border-[#D97B3F]/60 bg-transparent hover:border-[#D97B3F] hover:bg-[#D97B3F]/5 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${className}`}
    >
      <span className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#D97B3F] -translate-x-px -translate-y-px group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-200" />
      <span className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#D97B3F] translate-x-px -translate-y-px group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-200" />
      <span className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#D97B3F] -translate-x-px translate-y-px group-hover:-translate-x-0.5 group-hover:translate-y-0.5 transition-transform duration-200" />
      <span className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#D97B3F] translate-x-px translate-y-px group-hover:translate-x-0.5 group-hover:translate-y-0.5 transition-transform duration-200" />
      {children}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {

  // Nav state
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Simulated Pipeline Engine State
  const [simStep, setSimStep] = useState(0);
  const [simLogs, setSimLogs] = useState<{ time: string; url: string; risk: number; fee: string; action: string }[]>([
    { time: "19:24:01", url: "https://clean-research.org/study-page", risk: 0.0, fee: "0.001030", action: "ALLOW" },
    { time: "19:25:12", url: "https://untrusted-blog.com/override", risk: 0.95, fee: "0.002930", action: "QUARANTINE" },
    { time: "19:25:40", url: "https://safe-api-docs.io/v1", risk: 0.0, fee: "0.001030", action: "ALLOW" }
  ]);


  // Viewport Slider State
  const [activeSlide, setActiveSlide] = useState(0);
  const [isLocked, setIsLocked] = useState(true);
  const lastScrollTime = useRef(0);
  const touchStartY = useRef(0);
  const lastScrollDirection = useRef<"down" | "up" | null>(null);

  // Dashboard state
  const [urlInput, setUrlInput] = useState("https://rheo-test-clean.com/home");
  const [customUrl, setCustomUrl] = useState("");
  const [activeTab, setActiveTab] = useState<"presets" | "custom">("presets");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [simResult, setSimResult] = useState<any>(null);
  const [requests, setRequests] = useState<ProxyRequest[]>([]);
  const [metrics, setMetrics] = useState({ totalRequests: 0, volumeUsdc: 0, blockedThreats: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Re-lock hero slider when user scrolls back to the very top
  useEffect(() => {
    const onScroll = () => { if (window.scrollY <= 0) { setIsLocked(true); setActiveSlide(0); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Viewport slider gesture/wheel/keyboard interception
  useEffect(() => {
    if (!mounted) return;

    const handleWheel = (e: WheelEvent) => {
      if (!isLocked) return;

      e.preventDefault();

      const now = Date.now();
      const delta = e.deltaY;
      if (Math.abs(delta) < 12) return;

      const direction = delta > 0 ? "down" : "up";
      const isDirectionChange = lastScrollDirection.current !== null && lastScrollDirection.current !== direction;

      if (!isDirectionChange && now - lastScrollTime.current < 650) {
        return;
      }

      lastScrollDirection.current = direction;

      if (direction === "down") {
        if (activeSlide < 2) {
          setActiveSlide(prev => prev + 1);
          lastScrollTime.current = now;
        } else {
          setIsLocked(false);
          lastScrollTime.current = now;
          window.scrollBy({ top: 120, behavior: "smooth" });
        }
      } else {
        if (activeSlide > 0) {
          setActiveSlide(prev => prev - 1);
          lastScrollTime.current = now;
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (!isLocked) return;
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isLocked) return;
      e.preventDefault();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isLocked) return;

      const now = Date.now();
      const touchEndY = e.changedTouches[0].clientY;
      const deltaY = touchStartY.current - touchEndY;

      if (Math.abs(deltaY) < 30) return;

      const direction = deltaY > 0 ? "down" : "up";
      const isDirectionChange = lastScrollDirection.current !== null && lastScrollDirection.current !== direction;

      if (!isDirectionChange && now - lastScrollTime.current < 650) {
        return;
      }

      lastScrollDirection.current = direction;

      if (direction === "down") {
        if (activeSlide < 2) {
          setActiveSlide(prev => prev + 1);
          lastScrollTime.current = now;
        } else {
          setIsLocked(false);
          lastScrollTime.current = now;
          window.scrollBy({ top: 120, behavior: "smooth" });
        }
      } else {
        if (activeSlide > 0) {
          setActiveSlide(prev => prev - 1);
          lastScrollTime.current = now;
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLocked) return;
      const blockedKeys = ["Space", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"];
      if (blockedKeys.includes(e.code) || e.keyCode === 32) {
        e.preventDefault();
        const now = Date.now();
        const direction = (e.code === "ArrowDown" || e.code === "PageDown" || e.code === "Space" || e.keyCode === 32) ? "down" : "up";
        const isDirectionChange = lastScrollDirection.current !== null && lastScrollDirection.current !== direction;

        if (!isDirectionChange && now - lastScrollTime.current < 650) {
          return;
        }

        lastScrollDirection.current = direction;

        if (direction === "down") {
          if (activeSlide < 2) {
            setActiveSlide(prev => prev + 1);
            lastScrollTime.current = now;
          } else {
            setIsLocked(false);
            lastScrollTime.current = now;
            window.scrollBy({ top: 120, behavior: "smooth" });
          }
        } else {
          if (activeSlide > 0) {
            setActiveSlide(prev => prev - 1);
            lastScrollTime.current = now;
          }
        }
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("keydown", handleKeyDown, { passive: false });

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLocked, activeSlide, mounted]);

  // Mount tracking to prevent hydration mismatch on locale dates
  useEffect(() => {
    setMounted(true);
  }, []);

  // Simulated request cycle loop
  useEffect(() => {
    if (!mounted) return;

    const mockTransactions = [
      { url: "https://safe-search.com/finance", risk: 0.0, fee: "0.001030", action: "ALLOW" },
      { url: "https://github.com/hacker-gist/malicious-inject", risk: 0.95, fee: "0.002930", action: "QUARANTINE" },
      { url: "https://docs.rheo.network/intro", risk: 0.0, fee: "0.001030", action: "ALLOW" },
      { url: "https://attacker-redirect.net/exploit-js", risk: 0.90, fee: "0.002830", action: "QUARANTINE" },
      { url: "https://wikipedia.org/wiki/USDC", risk: 0.0, fee: "0.001030", action: "ALLOW" },
      { url: "https://forum.safe-net/topic-5", risk: 0.0, fee: "0.001030", action: "ALLOW" },
      { url: "https://malicious-xss.io/inject", risk: 0.85, fee: "0.002730", action: "QUARANTINE" },
      { url: "https://safe-blogs.io/post-99", risk: 0.0, fee: "0.001030", action: "ALLOW" }
    ];

    let txIdx = 0;

    const iv = setInterval(() => {
      setSimStep((prev) => {
        const next = (prev + 1) % 5;
        // On step 4 (CLEAN), append a new simulated row to the log
        if (next === 4) {
          const item = mockTransactions[txIdx];
          txIdx = (txIdx + 1) % mockTransactions.length;
          const timestamp = new Date().toLocaleTimeString();
          setSimLogs((prevLogs) => [
            { time: timestamp, ...item },
            ...prevLogs.slice(0, 5) // limit to 6 rows
          ]);
        }
        return next;
      });
    }, 1500);

    return () => clearInterval(iv);
  }, [mounted]);

  // Data polling
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/requests");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.requests) {
        const list: ProxyRequest[] = data.requests;
        setRequests(list);
        const settled = list.filter((r) => r.status === "settled");
        setMetrics({
          totalRequests: list.length,
          volumeUsdc: settled.reduce((s, r) => s + parseFloat(r.amount_usdc), 0),
          blockedThreats: settled.filter((r) => r.action === "quarantine" || r.action === "sanitize").length,
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchHistory();
    const iv = setInterval(fetchHistory, 4000);
    return () => clearInterval(iv);
  }, [fetchHistory]);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUrl = activeTab === "presets" ? urlInput : customUrl;
    if (!targetUrl) return;

    setLoading(true);
    setSimResult(null);
    setLogs(["[0/6] Initiating sandbox request...", `  ↳ Target URL: ${targetUrl}`]);

    try {
      const res = await fetch("/api/v1/simulate-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });
      const result = await res.json();
      if (result.steps) setLogs(result.steps);
      if (res.ok && result.success) {
        setSimResult(result.data);
        setLogs((p) => [...p, "[Done] Pipeline execution complete."]);
      } else {
        setLogs((p) => [...p, `[Error] ${result.error || "Internal Error"}`]);
      }
    } catch (err: any) {
      setLogs((p) => [...p, `[Error] ${err.message}`]);
    } finally {
      setLoading(false);
      fetchHistory();
    }
  };
  const heroBgColor = "#fbfaf7";
  const heroOpacity = 1;

  return (
    <div className="min-h-screen" style={{ background: "#0A0A0B" }}>

      {/* ─── NAVIGATION (TWO-BAR MONOSPACE OVERLAY) ───────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-6 mix-blend-difference">
        <a
          href="/"
          className="text-xl font-bold tracking-tight text-[#F2F0EB] no-underline hover:opacity-80 transition-opacity"
          style={{ fontFamily: "Playfair Display, Georgia, serif" }}
        >
          Rheo
        </a>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="z-50 flex flex-col justify-between h-3.5 w-6 group focus:outline-none cursor-pointer"
        >
          <span
            className="w-full h-[1.5px] bg-[#F2F0EB] transition-all duration-300 origin-center"
            style={{ transform: menuOpen ? "rotate(45deg) translateY(6px)" : "none" }}
          />
          <span
            className="w-4/5 h-[1.5px] bg-[#F2F0EB] transition-all duration-300 origin-center self-end"
            style={{
              transform: menuOpen ? "rotate(-45deg) translateY(-6px) scaleX(1.25)" : "none",
              transformOrigin: "right",
            }}
          />
        </button>
      </nav>

      {/* Menu Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-[#0A0A0B]/98 backdrop-blur-md flex flex-col items-center justify-center gap-8 transition-all duration-500 ${menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      >
        <div className="flex flex-col items-center gap-6 text-center font-mono">
          <a
            href="#pipeline"
            onClick={() => setMenuOpen(false)}
            className="text-lg uppercase tracking-widest text-[#8C8A85] hover:text-[#F2F0EB] transition-colors py-2"
          >
            01. How it works
          </a>
          <a
            href="#dashboard"
            onClick={() => setMenuOpen(false)}
            className="text-lg uppercase tracking-widest text-[#8C8A85] hover:text-[#F2F0EB] transition-colors py-2"
          >
            02. Firewall Dashboard
          </a>
          <a
            href="https://github.com/circlefin/arc-nanopayments"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            className="text-lg uppercase tracking-widest text-[#8C8A85] hover:text-[#F2F0EB] transition-colors py-2"
          >
            03. x402 Architecture
          </a>
        </div>
      </div>

      {/* ─── HERO (viewport slider with 3 slides, Snapping Scroll Transitions) */}
      <section
        className="relative h-screen flex items-center justify-center overflow-hidden px-8 md:px-16"
        style={{ background: "#fbfaf7" }}
      >
        <div className="relative w-full h-full max-w-7xl mx-auto flex items-center justify-center z-10">
          
          {/* SLIDE 01 */}
          <div
            className="absolute inset-0 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center"
            style={{
              opacity: activeSlide === 0 ? heroOpacity : 0,
              pointerEvents: activeSlide === 0 ? "auto" : "none",
              transform: activeSlide === 0 
                ? "translateY(0)" 
                : activeSlide > 0 
                  ? "translateY(-40px)" 
                  : "translateY(40px)",
              transition: mounted ? "opacity 1000ms ease-out, transform 1000ms ease-out" : "none",
            }}
          >
            {/* Left Column: maritime astrolabe + gate vault */}
            <div className="lg:col-span-6 flex justify-center items-center relative select-none">
              {/* Watercolor wash background (Rose tint via hue-rotate) */}
              <img
                src="/watercolor-stroke.png"
                alt="Rose watercolor wash texture"
                className="absolute w-[115%] h-[115%] object-contain pointer-events-none z-0"
                style={{
                  filter: "hue-rotate(130deg) saturate(1.8) opacity(0.24) contrast(0.9)",
                  mixBlendMode: "multiply",
                  transform: "rotate(-5deg)",
                }}
              />

              {/* Scattered micro outline geometries (Rose accent) */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Square 1 */}
                <div className="absolute top-[15%] left-[20%] w-2 h-2 border border-[#E8A7A1]/60 rotate-[15deg]" />
                {/* Triangle 1 */}
                <svg viewBox="0 0 10 10" className="absolute top-[20%] right-[15%] w-2.5 h-2.5 fill-none stroke-[#E8A7A1]/60 stroke-[0.8] -rotate-[10deg]">
                  <polygon points="5,1 9,9 1,9" />
                </svg>
                {/* Square 2 */}
                <div className="absolute bottom-[25%] left-[12%] w-1.5 h-1.5 border border-[#E8A7A1]/40 -rotate-[45deg]" />
                {/* Triangle 2 */}
                <svg viewBox="0 0 10 10" className="absolute bottom-[18%] right-[22%] w-2 h-2 fill-none stroke-[#E8A7A1]/40 stroke-[0.8] rotate-[35deg]">
                  <polygon points="5,1 9,9 1,9" />
                </svg>
              </div>

              {/* Fine wireframe framing arc */}
              <svg
                viewBox="0 0 420 420"
                className="absolute w-full max-w-[480px] h-auto pointer-events-none"
                style={{ stroke: "#1a1410", strokeWidth: "0.6", fill: "none", opacity: 0.16 }}
              >
                <path d="M 55,330 A 160,160 0 1,1 365,330" strokeDasharray="4,7" />
                <circle cx="210" cy="200" r="135" strokeDasharray="2,6" opacity="0.5" />
              </svg>

              {/* Astrolabe Vault sketch image */}
              <img
                src="/astrolabe-vault.png"
                alt="Vintage maritime astrolabe merged with gate vault"
                className="relative w-full max-w-[370px] h-auto object-contain"
                style={{ 
                  opacity: 0.95, 
                  mixBlendMode: "multiply",
                  transform: activeSlide === 0 ? "scale(1) rotate(0deg)" : "scale(0.95) rotate(-8deg)",
                  transition: mounted ? "transform 1000ms ease-out" : "none",
                }}
                draggable={false}
              />
            </div>

            <div 
              className="lg:col-span-6 space-y-8 text-left lg:pl-10"
              style={{
                transform: activeSlide === 0 ? "translateY(0)" : "translateY(-15px)",
                transition: mounted ? "transform 1000ms ease-out" : "none",
              }}
            >
              <h1
                className="leading-[0.93] font-light max-w-xl"
                style={{
                  fontFamily: "Playfair Display, Georgia, serif",
                  fontSize: "clamp(3.3rem, 7vw, 6rem)",
                  color: "#1a1410",
                  letterSpacing: "0.01em",
                }}
              >
                security
                <br />
                <span className="font-normal italic text-[#D97B3F]">proxies.</span>
              </h1>
              
              <p 
                className="font-sans font-light text-[#7A6E64] max-w-sm tracking-wide leading-relaxed text-[11.5px]"
              >
                intercepting untrusted fetches at the edge. clean content, statefully delivered.
              </p>

              {/* Bilan Discover Button */}
              <div className="flex items-center gap-4 pt-4">
                <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-[#9C8A76] select-none">discover 01</span>
                <button 
                  onClick={() => setActiveSlide(1)}
                  className="relative group w-8 h-8 flex items-center justify-center text-[#9C8A76] hover:text-[#1a1410] transition-all duration-200 cursor-pointer focus:outline-none"
                >
                  <span className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-[#9C8A76]/60 group-hover:border-[#1a1410] group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
                  <span className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-[#9C8A76]/60 group-hover:border-[#1a1410] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
                  <span className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-[#9C8A76]/60 group-hover:border-[#1a1410] group-hover:-translate-x-0.5 group-hover:translate-y-0.5 transition-all duration-200" />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-[#9C8A76]/60 group-hover:border-[#1a1410] group-hover:translate-x-0.5 group-hover:translate-y-0.5 transition-all duration-200" />
                  <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                    <path d="M1 9 L5 5 L1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* SLIDE 02 */}
          <div
            className="absolute inset-0 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center"
            style={{
              opacity: activeSlide === 1 ? heroOpacity : 0,
              pointerEvents: activeSlide === 1 ? "auto" : "none",
              transform: activeSlide === 1 
                ? "translateY(0)" 
                : activeSlide > 1 
                  ? "translateY(-40px)" 
                  : "translateY(40px)",
              transition: mounted ? "opacity 1000ms ease-out, transform 1000ms ease-out" : "none",
            }}
          >
            {/* Left Column: multi layered optical prism core */}
            <div className="lg:col-span-6 flex justify-center items-center relative select-none">
              {/* Watercolor wash background (Teal tint via hue-rotate) */}
              <img
                src="/watercolor-stroke.png"
                alt="Teal watercolor wash texture"
                className="absolute w-[115%] h-[115%] object-contain pointer-events-none z-0"
                style={{
                  filter: "hue-rotate(320deg) saturate(1.8) opacity(0.22) contrast(0.9)",
                  mixBlendMode: "multiply",
                  transform: "rotate(10deg)",
                }}
              />

              {/* Scattered micro outline geometries (Teal accent) */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Square 1 */}
                <div className="absolute top-[18%] left-[25%] w-2 h-2 border border-[#7BB8B0]/60 -rotate-[10deg]" />
                {/* Triangle 1 */}
                <svg viewBox="0 0 10 10" className="absolute top-[22%] right-[18%] w-2 h-2 fill-none stroke-[#7BB8B0]/60 stroke-[0.8] rotate-[20deg]">
                  <polygon points="5,1 9,9 1,9" />
                </svg>
                {/* Square 2 */}
                <div className="absolute bottom-[22%] left-[15%] w-1.5 h-1.5 border border-[#7BB8B0]/40 rotate-[35deg]" />
                {/* Triangle 2 */}
                <svg viewBox="0 0 10 10" className="absolute bottom-[28%] right-[14%] w-2.5 h-2.5 fill-none stroke-[#7BB8B0]/40 stroke-[0.8] -rotate-[15deg]">
                  <polygon points="5,1 9,9 1,9" />
                </svg>
              </div>

              {/* Fine wireframe framing arc */}
              <svg
                viewBox="0 0 420 420"
                className="absolute w-full max-w-[480px] h-auto pointer-events-none"
                style={{ stroke: "#1a1410", strokeWidth: "0.6", fill: "none", opacity: 0.16 }}
              >
                <circle cx="210" cy="200" r="145" strokeDasharray="3,6" opacity="0.6" />
                <path d="M 70,300 A 150,150 0 0,1 350,300" opacity="0.4" />
              </svg>

              {/* Optical prism sketch image */}
              <img
                src="/optical-prism.png"
                alt="Detailed technical ink sketch of an optical prism aligning light rays"
                className="relative w-full max-w-[370px] h-auto object-contain"
                style={{ 
                  opacity: 0.95, 
                  mixBlendMode: "multiply",
                  transform: activeSlide === 1 ? "scale(1) rotate(0deg)" : "scale(0.95) rotate(8deg)",
                  transition: mounted ? "transform 1000ms ease-out" : "none",
                }}
                draggable={false}
              />
            </div>

            {/* Right Column: Text */}
            <div 
              className="lg:col-span-6 space-y-8 text-left lg:pl-10"
              style={{
                transform: activeSlide === 1 ? "translateY(0)" : "translateY(-15px)",
                transition: mounted ? "transform 1000ms ease-out" : "none",
              }}
            >
              <h1
                className="leading-[0.93] font-light max-w-xl"
                style={{
                  fontFamily: "Playfair Display, Georgia, serif",
                  fontSize: "clamp(3.3rem, 7vw, 6rem)",
                  color: "#1a1410",
                  letterSpacing: "0.01em",
                }}
              >
                the
                <br />
                <span className="font-normal italic text-[#D97B3F]">inspection core.</span>
              </h1>
              
              <p 
                className="font-sans font-light text-[#7A6E64] max-w-sm tracking-wide leading-relaxed text-[11.5px]"
              >
                prompt injection evaluation running at model capacity. threats neutralized instantly.
              </p>

              {/* Bilan Discover Button */}
              <div className="flex items-center gap-4 pt-4">
                <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-[#9C8A76] select-none">discover 02</span>
                <button 
                  onClick={() => setActiveSlide(2)}
                  className="relative group w-8 h-8 flex items-center justify-center text-[#9C8A76] hover:text-[#1a1410] transition-all duration-200 cursor-pointer focus:outline-none"
                >
                  <span className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-[#9C8A76]/60 group-hover:border-[#1a1410] group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
                  <span className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-[#9C8A76]/60 group-hover:border-[#1a1410] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
                  <span className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-[#9C8A76]/60 group-hover:border-[#1a1410] group-hover:-translate-x-0.5 group-hover:translate-y-0.5 transition-all duration-200" />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-[#9C8A76]/60 group-hover:border-[#1a1410] group-hover:translate-x-0.5 group-hover:translate-y-0.5 transition-all duration-200" />
                  <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                    <path d="M1 9 L5 5 L1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* SLIDE 03 */}
          <div
            className="absolute inset-0 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center"
            style={{
              opacity: activeSlide === 2 ? heroOpacity : 0,
              pointerEvents: activeSlide === 2 ? "auto" : "none",
              transform: activeSlide === 2 
                ? "translateY(0)" 
                : activeSlide > 2 
                  ? "translateY(-40px)" 
                  : "translateY(40px)",
              transition: mounted ? "opacity 1000ms ease-out, transform 1000ms ease-out" : "none",
            }}
          >
            {/* Left Column: clockwork gears and balances weighing micro coins */}
            <div className="lg:col-span-6 flex justify-center items-center relative select-none">
              {/* Watercolor wash background (Raw Slate Blue, match slide color) */}
              <img
                src="/watercolor-stroke.png"
                alt="Slate blue watercolor wash texture"
                className="absolute w-[115%] h-[115%] object-contain pointer-events-none z-0"
                style={{
                  filter: "opacity(0.26) saturate(1.2) contrast(0.9)",
                  mixBlendMode: "multiply",
                  transform: "rotate(-12deg)",
                }}
              />

              {/* Scattered micro outline geometries (Slate Blue accent) */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Square 1 */}
                <div className="absolute top-[20%] left-[22%] w-2 h-2 border border-[#8BA3C7]/60 rotate-[25deg]" />
                {/* Triangle 1 */}
                <svg viewBox="0 0 10 10" className="absolute top-[16%] right-[22%] w-2 h-2 fill-none stroke-[#8BA3C7]/60 stroke-[0.8] -rotate-[5deg]">
                  <polygon points="5,1 9,9 1,9" />
                </svg>
                {/* Square 2 */}
                <div className="absolute bottom-[20%] left-[20%] w-1.5 h-1.5 border border-[#8BA3C7]/40 -rotate-[15deg]" />
                {/* Triangle 2 */}
                <svg viewBox="0 0 10 10" className="absolute bottom-[24%] right-[16%] w-2.5 h-2.5 fill-none stroke-[#8BA3C7]/40 stroke-[0.8] rotate-[45deg]">
                  <polygon points="5,1 9,9 1,9" />
                </svg>
              </div>

              {/* Fine wireframe framing arc */}
              <svg
                viewBox="0 0 420 420"
                className="absolute w-full max-w-[480px] h-auto pointer-events-none"
                style={{ stroke: "#1a1410", strokeWidth: "0.6", fill: "none", opacity: 0.16 }}
              >
                <circle cx="210" cy="200" r="130" opacity="0.3" />
                <path d="M 50,260 A 160,160 0 0,1 370,260" strokeDasharray="2,5" opacity="0.4" />
              </svg>

              {/* Clockwork Balances sketch image */}
              <img
                src="/clockwork-balances.png"
                alt="Clockwork gears and balance scale weighing micro coins"
                className="relative w-full max-w-[370px] h-auto object-contain"
                style={{ 
                  opacity: 0.95, 
                  mixBlendMode: "multiply",
                  transform: activeSlide === 2 ? "scale(1) rotate(0deg)" : "scale(0.95) rotate(-6deg)",
                  transition: mounted ? "transform 1000ms ease-out" : "none",
                }}
                draggable={false}
              />
            </div>

            {/* Right Column: Text */}
            <div 
              className="lg:col-span-6 space-y-8 text-left lg:pl-10"
              style={{
                transform: activeSlide === 2 ? "translateY(0)" : "translateY(-15px)",
                transition: mounted ? "transform 1000ms ease-out" : "none",
              }}
            >
              <h1
                className="leading-[0.93] font-light max-w-xl"
                style={{
                  fontFamily: "Playfair Display, Georgia, serif",
                  fontSize: "clamp(3.3rem, 7vw, 6rem)",
                  color: "#1a1410",
                  letterSpacing: "0.01em",
                }}
              >
                under the
                <br />
                <span className="font-normal italic text-[#D97B3F]">ledger.</span>
              </h1>
              
              <p 
                className="font-sans font-light text-[#7A6E64] max-w-sm tracking-wide leading-relaxed text-[11.5px]"
              >
                x402 micro payments automating machine to machine security settlement.
              </p>

              {/* Bilan Discover Button */}
              <div className="flex items-center gap-4 pt-4">
                <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-[#9C8A76] select-none">discover 03</span>
                <button 
                  onClick={() => {
                    setIsLocked(false);
                    setTimeout(() => {
                      document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth" });
                    }, 50);
                  }}
                  className="relative group w-8 h-8 flex items-center justify-center text-[#9C8A76] hover:text-[#1a1410] transition-all duration-200 cursor-pointer focus:outline-none"
                >
                  <span className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-[#9C8A76]/60 group-hover:border-[#1a1410] group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
                  <span className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-[#9C8A76]/60 group-hover:border-[#1a1410] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
                  <span className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-[#9C8A76]/60 group-hover:border-[#1a1410] group-hover:-translate-x-0.5 group-hover:translate-y-0.5 transition-all duration-200" />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-[#9C8A76]/60 group-hover:border-[#1a1410] group-hover:translate-x-0.5 group-hover:translate-y-0.5 transition-all duration-200" />
                  <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                    <path d="M1 9 L5 5 L1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* ─── Bilan-style circular dial navigation arc ─────────── */}
        <div className="absolute bottom-0 left-0 right-0 h-[220px] pointer-events-none overflow-hidden flex items-end justify-center z-20">
          <svg viewBox="0 0 1000 240" className="w-full max-w-5xl h-auto">
            {/* The main rotating group */}
            <g
              style={{
                transformOrigin: "500px 500px",
                transform: `rotate(${activeSlide === 0 ? 22 : activeSlide === 1 ? 0 : -22}deg)`,
                transition: mounted ? "transform 1100ms cubic-bezier(0.25, 1, 0.33, 1)" : "none"
              }}
            >
              {/* Outer thin arc path */}
              <path
                id="arc-timeline-path"
                d="M 80,500 A 420,420 0 0,1 920,500"
                fill="none"
                stroke="#9C8A76"
                strokeWidth="0.75"
                strokeOpacity="0.35"
              />

              {/* Circle dividers between stages */}
              <circle cx="356" cy="105" r="3" fill="#fbfaf7" stroke="#9C8A76" strokeWidth="0.8" strokeOpacity="0.5" />
              <circle cx="644" cy="105" r="3" fill="#fbfaf7" stroke="#9C8A76" strokeWidth="0.8" strokeOpacity="0.5" />
              <circle cx="230" cy="178" r="3" fill="#fbfaf7" stroke="#9C8A76" strokeWidth="0.8" strokeOpacity="0.3" />
              <circle cx="770" cy="178" r="3" fill="#fbfaf7" stroke="#9C8A76" strokeWidth="0.8" strokeOpacity="0.3" />

              {/* Monospace lowercase labels positioned on the circumference but inverse-rotated to remain horizontal */}
              
              {/* Slide 01 Label */}
              <g
                transform="translate(342.7, 110.6)"
                style={{
                  transformOrigin: "0px 0px",
                  transform: `rotate(${activeSlide === 0 ? -22 : activeSlide === 1 ? 0 : 22}deg)`,
                  transition: mounted ? "transform 1100ms cubic-bezier(0.25, 1, 0.33, 1)" : "none"
                }}
              >
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-mono text-[9px] tracking-[0.25em] pointer-events-auto cursor-pointer"
                  fill={activeSlide === 0 ? "#1a1410" : "#9C8A76"}
                  style={{
                    fontWeight: activeSlide === 0 ? 500 : 300,
                    opacity: activeSlide === 0 ? 1 : 0.45,
                    transition: "fill 400ms, opacity 400ms"
                  }}
                  onClick={() => {
                    setActiveSlide(0);
                    setIsLocked(true);
                  }}
                >
                  01 - perspective
                </text>
              </g>

              {/* Slide 02 Label */}
              <g
                transform="translate(500, 80)"
                style={{
                  transformOrigin: "0px 0px",
                  transform: `rotate(${activeSlide === 0 ? -22 : activeSlide === 1 ? 0 : 22}deg)`,
                  transition: mounted ? "transform 1100ms cubic-bezier(0.25, 1, 0.33, 1)" : "none"
                }}
              >
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-mono text-[9px] tracking-[0.25em] pointer-events-auto cursor-pointer"
                  fill={activeSlide === 1 ? "#1a1410" : "#9C8A76"}
                  style={{
                    fontWeight: activeSlide === 1 ? 500 : 300,
                    opacity: activeSlide === 1 ? 1 : 0.45,
                    transition: "fill 400ms, opacity 400ms"
                  }}
                  onClick={() => {
                    setActiveSlide(1);
                    setIsLocked(true);
                  }}
                >
                  02 - inspection core
                </text>
              </g>

              {/* Slide 03 Label */}
              <g
                transform="translate(657.3, 110.6)"
                style={{
                  transformOrigin: "0px 0px",
                  transform: `rotate(${activeSlide === 0 ? -22 : activeSlide === 1 ? 0 : 22}deg)`,
                  transition: mounted ? "transform 1100ms cubic-bezier(0.25, 1, 0.33, 1)" : "none"
                }}
              >
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-mono text-[9px] tracking-[0.25em] pointer-events-auto cursor-pointer"
                  fill={activeSlide === 2 ? "#1a1410" : "#9C8A76"}
                  style={{
                    fontWeight: activeSlide === 2 ? 500 : 300,
                    opacity: activeSlide === 2 ? 1 : 0.45,
                    transition: "fill 400ms, opacity 400ms"
                  }}
                  onClick={() => {
                    setActiveSlide(2);
                    setIsLocked(true);
                  }}
                >
                  03 - ledger systems
                </text>
              </g>
            </g>
          </svg>
        </div>
      </section>

      {/* ─── HOW RHEO WORKS ─────────────────────────────────────────────────── */}
      <section
        id="pipeline"
        className="py-28 px-6 border-b border-[#9C8A76]/20"
        style={{ background: "#fbfaf7" }}
      >
        <div className="max-w-2xl mx-auto">

          {/* Eyebrow */}
          <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-[#9C8A76] mb-16 text-center">
            How Rheo Works
          </p>

          {/* Stage cards */}
          <div className="flex flex-col gap-6">
            {PIPELINE_STAGES.map((stage, i) => (
              <motion.div
                key={stage.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, amount: 0.3 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="relative border border-[#9C8A76]/25 p-8"
                style={{ background: "#fbfaf7" }}
              >
                {/* Bracket corners on every card */}
                <span className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#D97B3F]" />
                <span className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#D97B3F]" />
                <span className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#D97B3F]" />
                <span className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#D97B3F]" />

                {/* Step index */}
                <p className="text-[10px] font-mono text-[#9C8A76] mb-3 tracking-widest">
                  0{i + 1}
                </p>

                {/* Stage label */}
                <h3
                  className="uppercase mb-4"
                  style={{
                    fontFamily: '"Space Grotesk", "Archivo", sans-serif',
                    fontWeight: 800,
                    fontSize: "clamp(1.6rem, 3.5vw, 2.4rem)",
                    letterSpacing: "-0.01em",
                    color: "#1a1410",
                    lineHeight: 1,
                  }}
                >
                  {stage.label}
                </h3>

                {/* Description */}
                <p
                  className="font-mono leading-relaxed"
                  style={{ fontSize: "0.72rem", color: "#7A6E64", maxWidth: "38rem" }}
                >
                  {stage.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DARK SECTION WRAPPER ─────────────────────────────────────────── */}
      <div className="relative" style={{ background: "#0A0A0B" }}>

      {/* ─── INTERACTIVE ENGINE PREVIEW SECTION ───────────────────────────── */}
      <section className="relative z-10 py-16 px-6 border-b border-zinc-900/60" style={{ background: "#0A0A0B" }}>
        <div className="max-w-4xl mx-auto space-y-10">
          
          <div className="text-center space-y-3">
            <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-zinc-600">Engine Simulation</p>
            <h3 className="text-2xl font-serif text-[#F2F0EB]">Active Pipeline Walkthrough</h3>
            <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
              Visualizing a live request payload moving through Rheo's five processing steps in real time.
            </p>
          </div>

          {/* Horizontal Step Sequence */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 border border-zinc-800/60 bg-[#111113]/30 p-6 rounded-lg select-none">
            {["FETCH", "EVALUATE", "PRICE", "PAY", "CLEAN"].map((step, idx) => {
              const isActive = idx === simStep;
              return (
                <React.Fragment key={step}>
                  <div className="relative py-2 px-4 transition-all duration-300">
                    {isActive ? (
                      <span className="font-mono text-xs font-semibold tracking-widest text-[#F2F0EB]">
                        ⌐ {step} ⌐
                      </span>
                    ) : (
                      <span className="font-mono text-xs font-semibold tracking-widest text-[#8C8A85]">
                        {step}
                      </span>
                    )}
                  </div>
                  {idx < 4 && (
                    <span className="text-zinc-700 font-mono text-[10px] hidden sm:inline">→</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Simulated Fast Updating Data Log Feed */}
          <div className="border border-zinc-800/80 rounded-lg overflow-hidden" style={{ background: "#0C0C0E" }}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/60" style={{ background: "#111113" }}>
              <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Live Simulation Request Ticker</p>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-[9px] font-mono text-emerald-500">STREAMING</span>
              </div>
            </div>

            <div className="p-4 font-mono text-[11px] space-y-2.5 max-h-[220px] overflow-y-auto leading-relaxed">
              {simLogs.map((log, i) => {
                const isQuarantined = log.action === "QUARANTINE";
                return (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 border-b border-zinc-900 pb-2 last:border-0 last:pb-0">
                    <span className="md:col-span-2 text-zinc-600">[{log.time}]</span>
                    <span className="md:col-span-5 text-zinc-400 truncate" title={log.url}>{log.url}</span>
                    <span className="md:col-span-2 text-zinc-500">Risk: <span className={isQuarantined ? "text-[#F87171]" : "text-zinc-400"}>{log.risk.toFixed(2)}</span></span>
                    <span className="md:col-span-2 text-zinc-500">{log.fee} USDC</span>
                    <span className="md:col-span-1 text-right">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${isQuarantined ? "text-[#F87171] border-[#F87171]/25 bg-[#F87171]/5" : "text-[#4ADE80] border-[#4ADE80]/25 bg-[#4ADE80]/5"}`}>
                        {log.action}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </section>

      {/* ─── DASHBOARD ───────────────────────────────────────────────────── */}
      <section id="dashboard" className="relative py-24 px-6" style={{ background: "#0A0A0B" }}>
        <div className="max-w-7xl mx-auto space-y-16">

          {/* Section heading */}
          <div className="text-center space-y-4">
            <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-zinc-600">Live Firewall Dashboard</p>
            <h2
              className="text-4xl sm:text-5xl"
              style={{ fontFamily: "Playfair Display, Georgia, serif", fontWeight: 500, color: "#F2F0EB", letterSpacing: "-0.02em" }}
            >
              Real requests. Real USDC.
            </h2>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { label: "PROTECTION STATUS", value: "ACTIVE", color: "#4ADE80" },
              { label: "USDC SETTLED (FEES)", value: `${metrics.volumeUsdc.toFixed(6)} USDC`, color: "#F2F0EB" },
              { label: "REQUESTS PROCESSED", value: String(metrics.totalRequests), color: "#F2F0EB" },
            ].map((m) => (
              <div key={m.label} className="border border-zinc-800/80 p-6 rounded" style={{ background: "#111113" }}>
                <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">{m.label}</p>
                <p className="text-2xl font-mono font-medium" style={{ color: m.color }}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Playground + Console */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Playground */}
            <div className="lg:col-span-5 border border-zinc-800/80 rounded p-6 space-y-6" style={{ background: "#111113" }}>
              <div className="flex items-center justify-between border-b border-zinc-800/60 pb-4">
                <p className="text-[11px] font-mono uppercase tracking-widest text-[#D97B3F]">Agent Playground</p>
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97B3F] animate-pulse" />
              </div>

              {/* Tabs */}
              <div className="flex gap-px rounded overflow-hidden border border-zinc-800 text-[10px] font-mono">
                {(["presets", "custom"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`flex-1 py-2 uppercase tracking-wider transition-colors ${activeTab === t ? "bg-zinc-800 text-white" : "bg-zinc-900/40 text-zinc-500 hover:text-zinc-300"}`}
                  >
                    {t === "presets" ? "Preset Targets" : "Custom URL"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSimulate} className="space-y-4">
                {activeTab === "presets" ? (
                  <div className="space-y-2">
                    {[
                      { url: "https://rheo-test-clean.com/home", label: "Clean Target", sub: "Safe fluid dynamics article", color: "#4ADE80" },
                      { url: "https://rheo-test-injected.com/attacker-prompt", label: "Injected Target", sub: "Prompt injection attempt", color: "#F87171" },
                      { url: "https://rheo-test-script.com/embed-js", label: "Script Target", sub: "XSS payload page", color: "#EAB308" },
                    ].map((p) => (
                      <label
                        key={p.url}
                        className="flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors"
                        style={{ background: urlInput === p.url ? "rgba(217,123,63,0.06)" : "rgba(255,255,255,0.02)", borderColor: urlInput === p.url ? "rgba(217,123,63,0.3)" : "rgba(255,255,255,0.06)" }}
                      >
                        <input type="radio" name="preset-url" checked={urlInput === p.url} onChange={() => setUrlInput(p.url)} className="accent-[#D97B3F]" />
                        <div>
                          <span className="text-xs font-mono font-semibold" style={{ color: p.color }}>{p.label}</span>
                          <p className="text-[10px] font-mono text-zinc-500 mt-0.5">{p.sub}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <input
                    type="url"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full p-3 text-xs font-mono rounded border border-zinc-800 bg-zinc-900/60 text-[#F2F0EB] placeholder:text-zinc-600 focus:outline-none focus:border-[#D97B3F]/40"
                  />
                )}

                <BracketButton disabled={loading} className="w-full justify-center">
                  {loading ? (
                    <>
                      <span className="w-3 h-3 border border-t-transparent border-[#D97B3F] rounded-full animate-spin" />
                      Executing...
                    </>
                  ) : "Test Firewall"}
                </BracketButton>
              </form>

              <div className="border-t border-zinc-800/60 pt-4 space-y-1">
                <p className="text-[10px] font-mono text-zinc-600">· USDC funded from buyer wallet on Arc Testnet</p>
                <p className="text-[10px] font-mono text-zinc-600">· Settlement off-chain via Circle Gateway</p>
              </div>
            </div>

            {/* Console */}
            <div className="lg:col-span-7 flex flex-col border border-zinc-800/80 rounded overflow-hidden" style={{ minHeight: "420px", background: "#0C0C0E" }}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/60">
                <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">x402 Handshake Console</p>
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                </div>
              </div>

              <div className="flex-1 p-5 overflow-y-auto space-y-1.5 text-xs font-mono">
                {logs.length === 0 ? (
                  <p className="text-zinc-700 italic">Awaiting request submission...</p>
                ) : logs.map((log, i) => (
                  <p
                    key={i}
                    className={
                      log.startsWith("[Error]") ? "text-[#F87171]" :
                      log.startsWith("[Done]") || log.startsWith("[Success]") ? "text-[#4ADE80]" :
                      log.startsWith("  ↳") ? "text-zinc-500 pl-3" :
                      "text-zinc-300"
                    }
                  >
                    {log}
                  </p>
                ))}
              </div>

              {simResult && (
                <div className="border-t border-zinc-800/60 p-5 space-y-3">
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-zinc-500">Risk Score: <span className="text-[#F2F0EB]">{simResult.risk_score}</span></span>
                    <RiskBadge action={simResult.action} />
                  </div>
                  {simResult.reasoning && (
                    <p className="text-[11px] font-sans text-zinc-400 leading-relaxed">{simResult.reasoning}</p>
                  )}
                  {simResult.content && (
                    <pre className="p-3 rounded text-[10px] font-mono text-zinc-400 max-h-20 overflow-y-auto whitespace-pre-wrap leading-relaxed" style={{ background: "rgba(0,0,0,0.4)" }}>
                      {simResult.content.substring(0, 300)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Developer Integration Code Snippet */}
          <div className="border border-zinc-800/80 rounded overflow-hidden" style={{ background: "#0C0C0E" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Developer Integration</p>
              <span className="text-[10px] font-mono text-zinc-700">TypeScript</span>
            </div>
            <div className="p-6 overflow-x-auto">
              <pre className="text-xs font-mono leading-relaxed text-zinc-300">
{`import { GatewayClient } from "@circle-fin/x402-batching";

// 1. Init the payment client with your agent's wallet
const gateway = new GatewayClient({
  chain: "arcTestnet",
  privateKey: process.env.AGENT_WALLET_PRIVATE_KEY,
});

// 2. Route the fetch through Rheo instead of calling the URL directly
//    The SDK automatically handles the 402 challenge, signs the
//    EIP-3009 authorization, and settles USDC off-chain.
const response = await gateway.pay("https://api.rheo.network/v1/secure-proxy", {
  method: "POST",
  body: { url: "https://untrusted-website.com/article" },
});

// 3. Rheo returns sanitized or quarantined content — your agent is safe
const safeContent = response.data.content;
const riskScore   = response.data.risk_score;   // 0.0 – 1.0
const action      = response.data.action;        // "allow" | "sanitize" | "quarantine"`}
              </pre>
            </div>
          </div>

          {/* Threats Blocked metric strip */}
          <div className="flex items-center gap-8 px-6 py-4 rounded border border-zinc-800/60" style={{ background: "#111113" }}>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1">Threats Blocked</p>
              <p className="text-2xl font-mono font-medium text-[#F87171]">{metrics.blockedThreats}</p>
            </div>
            <div className="h-10 w-px bg-zinc-800" />
            <p className="text-[11px] font-sans text-zinc-500 leading-relaxed flex-1">
              Quarantine and sanitize actions combined. Each represents a prompt injection or script payload that was intercepted before reaching the agent's context window.
            </p>
          </div>

          {/* Live Log Table */}
          <div className="border border-zinc-800/80 rounded overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60" style={{ background: "#111113" }}>
              <div>
                <p className="text-[11px] font-mono uppercase tracking-widest text-[#F2F0EB] font-semibold">Live Firewall Log</p>
                <p className="text-[10px] font-sans text-zinc-600 mt-0.5">Real-time feed of proxy requests and USDC settlements on Arc.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-zinc-700">
                  {requests.length === 0 ? "0" : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, requests.length)}`} of {requests.length}
                </span>
                <button onClick={fetchHistory} className="text-[10px] font-mono uppercase tracking-wider border border-zinc-800 px-3 py-1.5 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors rounded">
                  Refresh
                </button>
              </div>
            </div>

            <div className="overflow-x-auto" style={{ background: "#0C0C0E" }}>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800/60">
                    {["Timestamp", "Target URL", "Risk Score", "Action", "Fee (USDC)", "Payer", "Tx"].map(h => (
                      <th key={h} className="px-5 py-3 text-[10px] font-mono uppercase tracking-wider text-zinc-600 font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-zinc-700 italic font-sans text-xs">
                        No logs yet. Run the playground to generate data.
                      </td>
                    </tr>
                  ) : requests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((req) => (
                    <tr key={req.id} className="log-row border-b border-zinc-900/60 transition-colors">
                      <td className="px-5 py-3 font-mono text-zinc-500 whitespace-nowrap">
                        {mounted ? new Date(req.created_at).toLocaleTimeString() : "—"}
                      </td>
                      <td className="px-5 py-3 font-sans text-zinc-300 max-w-[200px] truncate" title={req.target_url}>
                        {req.target_url}
                      </td>
                      <td className="px-5 py-3 font-mono text-center text-zinc-300">
                        {req.risk_score !== null ? req.risk_score : "—"}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <RiskBadge action={req.action} />
                      </td>
                      <td className="px-5 py-3 font-mono text-right text-zinc-300 whitespace-nowrap">
                        {req.amount_usdc}
                      </td>
                      <td className="px-5 py-3 font-mono text-zinc-600 whitespace-nowrap">
                        {req.payer_address ? `${req.payer_address.slice(0, 6)}…${req.payer_address.slice(-4)}` : "—"}
                      </td>
                      <td className="px-5 py-3 font-mono whitespace-nowrap">
                        {req.gateway_tx ? (
                          <a href={`https://explorer.testnet.arc.network/tx/${req.gateway_tx}`} target="_blank" rel="noopener noreferrer" className="text-[#D97B3F] hover:underline">
                            {req.gateway_tx.slice(0, 8)}…
                          </a>
                        ) : (
                          <span className="text-zinc-700 italic">pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {requests.length > PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4 px-1">
                <span className="text-[10px] font-mono text-zinc-700">
                  Page {currentPage} of {Math.ceil(requests.length / PAGE_SIZE)}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="text-[10px] font-mono uppercase tracking-wider border border-zinc-800 px-4 py-1.5 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(requests.length / PAGE_SIZE), p + 1))}
                    disabled={currentPage >= Math.ceil(requests.length / PAGE_SIZE)}
                    className="text-[10px] font-mono uppercase tracking-wider border border-zinc-800 px-4 py-1.5 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>



      {/* ─── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-900 px-8 py-8 relative z-10" style={{ background: "#0A0A0B" }}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <a
            href="/"
            className="text-lg font-semibold no-underline hover:opacity-70 transition-opacity"
            style={{ fontFamily: "Playfair Display, Georgia, serif", color: "#F2F0EB" }}
          >
            Rheo
          </a>
          <div className="flex gap-8 text-[10px] font-mono uppercase tracking-widest">
            <a href="https://x402.org" target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-400 transition-colors">x402 Protocol</a>
            <a href="https://developers.circle.com/" target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-400 transition-colors">Circle Gateway</a>
            <a href="https://testnet.arc.network" target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-400 transition-colors">Arc Testnet</a>
            <a href="https://groq.com" target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-400 transition-colors">Groq · Llama-3</a>
          </div>
          <p className="text-[10px] font-mono text-zinc-700">© 2026 Lepton Hackathon</p>
        </div>
      </footer>

      </div> {/* Close Dark Section Wrapper */}
    </div>
  );
}
