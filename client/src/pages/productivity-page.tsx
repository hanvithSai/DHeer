/**
 * client/src/pages/productivity-page.tsx
 *
 * Full-page productivity dashboard that pulls real-time analytics from the
 * DHeer Chrome extension via chrome.runtime.sendMessage.
 *
 * Sections:
 *  1. Hero stat cards  — Tabs Open, Tab Switches, Session Duration, Top Domain
 *  2. Domain Analytics — sorted by time-on-domain, with visit count and bar
 *  3. Live Tab Breakdown — per-tab title, domain, active time
 *
 * When the extension is not installed or the page is loaded outside Chrome,
 * a friendly install-prompt is shown instead of "--" values.
 *
 * Data flow:
 *  - Polls background.js GET_SESSION_METADATA every 3 seconds
 *  - Also listens for SESSION_METADATA_UPDATE pushes on tab switches
 *  - background.js now returns `tabTimings` (per-tab active ms) + `activeTabId`
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu, Activity, Monitor, Clock, Globe, Zap, TrendingUp, ExternalLink, Puzzle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TabTiming {
  domain: string;
  title: string;
  url: string;
  totalActiveMs: number;
  isActive?: boolean;
}

interface SessionData {
  tabCount: number;
  tabSwitches: number;
  sessionStartTime: number;
  domainFrequency: Record<string, number>;
  tabTimings: Record<string, TabTiming>;
  activeTabId: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  if (totalSecs < 60) return `${totalSecs}s`;
  const mins = Math.floor(totalSecs / 60);
  if (mins < 60) return `${mins}m ${totalSecs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtSessionDuration(startTime: number): string {
  if (!startTime) return '--';
  const ms = Date.now() - startTime;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function cleanDomain(domain: string): string {
  return domain.replace(/^www\./, '');
}

// ── Derived analytics from tabTimings ────────────────────────────────────────

interface DomainStat {
  domain: string;
  visits: number;
  totalActiveMs: number;
  tabCount: number;
}

function buildDomainStats(
  tabTimings: Record<string, TabTiming>,
  domainFrequency: Record<string, number>,
): DomainStat[] {
  const map: Record<string, DomainStat> = {};

  for (const entry of Object.values(tabTimings)) {
    const d = cleanDomain(entry.domain || 'unknown');
    if (!d || d === 'unknown') continue;
    if (!map[d]) map[d] = { domain: d, visits: 0, totalActiveMs: 0, tabCount: 0 };
    map[d].totalActiveMs += entry.totalActiveMs || 0;
    map[d].tabCount += 1;
  }

  // Merge page-load frequency from domainFrequency
  for (const [domain, visits] of Object.entries(domainFrequency)) {
    const d = cleanDomain(domain);
    if (!map[d]) map[d] = { domain: d, visits: 0, totalActiveMs: 0, tabCount: 0 };
    map[d].visits = visits;
  }

  return Object.values(map).sort((a, b) => b.totalActiveMs - a.totalActiveMs);
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  testId,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  testId?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-white/5 rounded-2xl p-5 flex flex-col gap-3"
      data-testid={testId}
    >
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', accent ?? 'bg-primary/10')}>
        <Icon className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
      </div>
      <div>
        <p className="text-2xl font-display font-bold text-white leading-none" data-testid={`${testId}-value`}>
          {value}
        </p>
        <p className="text-xs text-muted-foreground mt-1 font-semibold uppercase tracking-wider">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ── No-extension placeholder ──────────────────────────────────────────────────

function NoExtensionBanner() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-white/10 rounded-3xl bg-white/[0.02] max-w-lg mx-auto mt-12">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Puzzle className="w-8 h-8 text-primary/50" />
      </div>
      <h3 className="text-xl font-semibold mb-2">DHeer Extension not detected</h3>
      <p className="text-muted-foreground max-w-xs mb-6 text-sm leading-relaxed">
        Install the DHeer Chrome extension to see live tab analytics, per-domain time tracking,
        and session insights here.
      </p>
      <a
        href="https://github.com/hanvithSai/DHeer"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 text-primary text-sm font-semibold hover:bg-primary/30 transition-colors"
        data-testid="link-install-extension"
      >
        <ExternalLink className="w-4 h-4" />
        View on GitHub
      </a>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProductivityPage() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [extensionAvailable, setExtensionAvailable] = useState<boolean | null>(null);
  const [tick, setTick] = useState(0); // forces re-render for live duration

  // ── Poll extension ────────────────────────────────────────────────────────
  const fetchSession = useCallback(() => {
    const chrome = (window as any).chrome;
    if (!chrome?.runtime) {
      setExtensionAvailable(false);
      return;
    }
    chrome.runtime.sendMessage(
      { type: 'GET_SESSION_METADATA' },
      (response: SessionData | undefined) => {
        if (chrome.runtime.lastError) {
          setExtensionAvailable(false);
          return;
        }
        if (response) {
          setExtensionAvailable(true);
          setSession(response);
        }
      },
    );
  }, []);

  useEffect(() => {
    fetchSession();

    // Poll every 3 seconds for live updates
    const poll = setInterval(fetchSession, 3000);

    // Also listen for push broadcasts from background on tab switches
    const chrome = (window as any).chrome;
    let listener: ((msg: any) => void) | null = null;
    if (chrome?.runtime?.onMessage) {
      listener = (msg: any) => {
        if (msg.type === 'SESSION_METADATA_UPDATE' && msg.data) {
          setExtensionAvailable(true);
          setSession(msg.data);
        }
      };
      chrome.runtime.onMessage.addListener(listener);
    }

    // Tick every second so session duration label stays live
    const ticker = setInterval(() => setTick(t => t + 1), 1000);

    return () => {
      clearInterval(poll);
      clearInterval(ticker);
      if (listener && chrome?.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(listener);
      }
    };
  }, [fetchSession]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const domainStats = session
    ? buildDomainStats(session.tabTimings ?? {}, session.domainFrequency ?? {})
    : [];

  const totalActiveMs = domainStats.reduce((sum, d) => sum + d.totalActiveMs, 0);
  const maxDomainMs = domainStats[0]?.totalActiveMs ?? 1;

  const topDomain = domainStats[0]?.domain ?? null;

  // Per-tab list sorted by time descending
  const tabList = Object.entries(session?.tabTimings ?? {})
    .map(([id, t]) => ({ id, ...t }))
    .sort((a, b) => b.totalActiveMs - a.totalActiveMs);

  const sessionDuration = session?.sessionStartTime
    ? fmtSessionDuration(session.sessionStartTime)
    : '--';

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground">

      {/* Desktop sidebar */}
      <Sidebar className="w-64 hidden md:flex flex-shrink-0 z-20" />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <header className="h-16 border-b border-white/5 bg-background/80 backdrop-blur-md flex items-center gap-3 px-4 md:px-6 sticky top-0 z-10">

          {/* Mobile hamburger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden flex-shrink-0" data-testid="btn-mobile-menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 bg-background border-r border-white/5">
              <Sidebar className="flex w-full h-full" />
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-3 flex-1">
            <Activity className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-display font-bold">Productivity</h1>
          </div>

          {/* Extension status badge */}
          <div
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border',
              extensionAvailable
                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                : 'bg-white/5 text-muted-foreground border-white/10',
            )}
            data-testid="badge-extension-status"
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', extensionAvailable ? 'bg-green-400 animate-pulse' : 'bg-white/30')} />
            {extensionAvailable ? 'Live' : 'Extension offline'}
          </div>
        </header>

        {/* ── Content ──────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <div className="max-w-6xl mx-auto space-y-8">

            {extensionAvailable === false ? (
              <NoExtensionBanner />
            ) : (
              <>
                {/* ── Section title ──────────────────────────────────── */}
                <div>
                  <h2 className="text-3xl font-display font-bold text-white mb-1">Session Overview</h2>
                  <p className="text-muted-foreground text-sm">
                    {extensionAvailable ? 'Live data from your active Chrome session' : 'Waiting for extension data…'}
                  </p>
                </div>

                {/* ── Hero stat cards ─────────────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard
                    icon={Monitor}
                    label="Tabs Open"
                    value={session?.tabCount ?? '--'}
                    sub="currently open"
                    testId="stat-tab-count"
                  />
                  <StatCard
                    icon={Zap}
                    label="Tab Switches"
                    value={session?.tabSwitches ?? '--'}
                    sub="this session"
                    accent="bg-amber-500/10"
                    testId="stat-tab-switches"
                  />
                  <StatCard
                    icon={Clock}
                    label="Session Duration"
                    value={sessionDuration}
                    sub="since extension start"
                    accent="bg-blue-500/10"
                    testId="stat-session-duration"
                  />
                  <StatCard
                    icon={Globe}
                    label="Top Domain"
                    value={topDomain ? cleanDomain(topDomain) : '--'}
                    sub={topDomain ? `${domainStats[0]?.visits ?? 0} page loads` : 'no data yet'}
                    accent="bg-purple-500/10"
                    testId="stat-top-domain"
                  />
                </div>

                {/* ── Two-column layout ───────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* ── Domain Analytics ─────────────────────────────── */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      <h3 className="text-lg font-display font-bold text-white">Domain Analytics</h3>
                      <span className="ml-auto text-xs text-muted-foreground">
                        Total active: {fmtDuration(totalActiveMs)}
                      </span>
                    </div>

                    <div className="bg-card border border-white/5 rounded-2xl overflow-hidden">
                      {domainStats.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground text-sm">
                          <Globe className="w-8 h-8 mx-auto mb-3 opacity-30" />
                          No domain data yet — start browsing
                        </div>
                      ) : (
                        <div className="divide-y divide-white/5">
                          {/* Table header */}
                          <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                            <span>Domain</span>
                            <span className="text-right">Visits</span>
                            <span className="text-right w-20">Time</span>
                          </div>

                          <AnimatePresence>
                            {domainStats.slice(0, 15).map((stat, idx) => {
                              const pct = maxDomainMs > 0 ? (stat.totalActiveMs / maxDomainMs) * 100 : 0;
                              return (
                                <motion.div
                                  key={stat.domain}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ delay: idx * 0.04 }}
                                  className="px-4 py-3 hover:bg-white/[0.02] transition-colors"
                                  data-testid={`row-domain-${idx}`}
                                >
                                  <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-center mb-1.5">
                                    <span className="text-sm font-medium text-white truncate" data-testid={`text-domain-${idx}`}>
                                      {stat.domain}
                                    </span>
                                    <span className="text-xs text-muted-foreground text-right tabular-nums" data-testid={`text-visits-${idx}`}>
                                      {stat.visits} loads
                                    </span>
                                    <span className="text-xs font-mono text-primary text-right w-20 tabular-nums" data-testid={`text-time-${idx}`}>
                                      {stat.totalActiveMs > 0 ? fmtDuration(stat.totalActiveMs) : '--'}
                                    </span>
                                  </div>
                                  {/* Progress bar */}
                                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary/60 rounded-full transition-all duration-500"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </motion.div>
                              );
                            })}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* ── Live Tab Breakdown ───────────────────────────── */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-primary" />
                      <h3 className="text-lg font-display font-bold text-white">Tab Breakdown</h3>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {tabList.length} tab{tabList.length !== 1 ? 's' : ''} tracked
                      </span>
                    </div>

                    <div className="bg-card border border-white/5 rounded-2xl overflow-hidden">
                      {tabList.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground text-sm">
                          <Monitor className="w-8 h-8 mx-auto mb-3 opacity-30" />
                          No tab data yet — switch between tabs to start tracking
                        </div>
                      ) : (
                        <div className="divide-y divide-white/5 max-h-[480px] overflow-y-auto">
                          <AnimatePresence>
                            {tabList.map((tab, idx) => (
                              <motion.div
                                key={tab.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: idx * 0.04 }}
                                className={cn(
                                  'flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors',
                                  tab.isActive && 'bg-primary/5',
                                )}
                                data-testid={`row-tab-${tab.id}`}
                              >
                                {/* Active indicator dot */}
                                <div className={cn(
                                  'mt-1.5 w-2 h-2 rounded-full shrink-0',
                                  tab.isActive ? 'bg-green-400 animate-pulse' : 'bg-white/10',
                                )} />

                                <div className="flex-1 min-w-0">
                                  <p
                                    className="text-sm font-medium text-white truncate leading-snug"
                                    data-testid={`text-tab-title-${tab.id}`}
                                    title={tab.title}
                                  >
                                    {tab.title || 'Untitled'}
                                  </p>
                                  <p
                                    className="text-xs text-muted-foreground truncate mt-0.5"
                                    data-testid={`text-tab-domain-${tab.id}`}
                                  >
                                    {cleanDomain(tab.domain) || tab.url || '—'}
                                  </p>
                                </div>

                                <div className="text-right shrink-0">
                                  <p
                                    className={cn('text-sm font-mono font-bold tabular-nums', tab.isActive ? 'text-green-400' : 'text-primary')}
                                    data-testid={`text-tab-time-${tab.id}`}
                                  >
                                    {tab.totalActiveMs > 0 ? fmtDuration(tab.totalActiveMs) : '< 1s'}
                                  </p>
                                  {tab.isActive && (
                                    <p className="text-[10px] text-green-400/70 uppercase tracking-wider">active</p>
                                  )}
                                </div>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                {/* ── Most time vs most visits callout ───────────────── */}
                {domainStats.length > 1 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Highest time domain */}
                    <div className="bg-card border border-white/5 rounded-2xl p-5 flex items-center gap-4" data-testid="card-highest-time-domain">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Clock className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Most Time On</p>
                        <p className="text-lg font-display font-bold text-white truncate" data-testid="text-highest-time-domain">
                          {domainStats[0]?.domain ?? '--'}
                        </p>
                        <p className="text-xs text-primary font-mono" data-testid="text-highest-time-value">
                          {fmtDuration(domainStats[0]?.totalActiveMs ?? 0)}
                        </p>
                      </div>
                    </div>

                    {/* Most visited domain */}
                    {(() => {
                      const byVisits = [...domainStats].sort((a, b) => b.visits - a.visits)[0];
                      return (
                        <div className="bg-card border border-white/5 rounded-2xl p-5 flex items-center gap-4" data-testid="card-most-visited-domain">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                            <TrendingUp className="w-5 h-5 text-amber-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Most Visited</p>
                            <p className="text-lg font-display font-bold text-white truncate" data-testid="text-most-visited-domain">
                              {byVisits?.domain ?? '--'}
                            </p>
                            <p className="text-xs text-amber-400 font-mono" data-testid="text-most-visited-value">
                              {byVisits?.visits ?? 0} page loads
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
