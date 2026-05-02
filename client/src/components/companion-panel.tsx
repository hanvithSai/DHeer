/**
 * client/src/components/companion-panel.tsx
 *
 * DHeer Companion Panel — slides in from the left when the mascot icon is clicked.
 *
 * Sections:
 *  1. Companion Insights  — 2×2 grid: Tabs, Switches, Session Duration, Top Domain
 *  2. Workspaces          — create (inline form), launch, delete
 *  3. Nudge Settings      — trackingEnabled, nudgesEnabled, tabCountThreshold,
 *                           idleThreshold, nudgeFrequency
 *
 * All settings are persisted to the DB via PATCH /api/companion/settings and
 * simultaneously forwarded to the browser extension via chrome.runtime.sendMessage
 * so background.js's in-memory config stays in sync.
 */

import React, { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Play, Trash2, Plus, Monitor, Bell, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Workspace, CompanionSettings } from "@shared/schema";

export function CompanionPanel() {
  const { toast } = useToast();

  // ── Extension session state ──────────────────────────────────────────────────
  const [sessionData, setSessionData] = useState({
    tabCount: 0,
    tabSwitches: 0,
    sessionStartTime: 0,
    domainFrequency: {} as Record<string, number>,
  });

  // ── Workspace inline form state ──────────────────────────────────────────────
  const [showWorkspaceForm, setShowWorkspaceForm] = useState(false);
  const [wsName, setWsName] = useState("");
  const [wsUrls, setWsUrls] = useState("");

  // ── Computed session stats ───────────────────────────────────────────────────
  const topDomain =
    Object.entries(sessionData.domainFrequency)
      .sort(([, a], [, b]) => b - a)[0]?.[0]
      ?.replace("www.", "") ?? null;

  const sessionMins = sessionData.sessionStartTime
    ? Math.floor((Date.now() - sessionData.sessionStartTime) / 60000)
    : 0;
  const sessionDuration = sessionData.sessionStartTime
    ? sessionMins >= 60
      ? `${Math.floor(sessionMins / 60)}h ${sessionMins % 60}m`
      : `${sessionMins}m`
    : null;

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: settings } = useQuery<CompanionSettings>({
    queryKey: ["/api/companion/settings"],
  });

  const { data: workspaces } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces"],
  });

  // ── Extension metadata polling (every 5 s) ───────────────────────────────────
  useEffect(() => {
    const chromeObj = (window as any).chrome;
    if (!chromeObj?.runtime) return;

    const fetchMetadata = () => {
      chromeObj.runtime.sendMessage(
        { type: "GET_SESSION_METADATA" },
        (response: any) => {
          if (response) {
            setSessionData({
              tabCount:        response.tabCount        || 0,
              tabSwitches:     response.tabSwitches     || 0,
              sessionStartTime: response.sessionStartTime || 0,
              domainFrequency: response.domainFrequency || {},
            });
          }
        },
      );
    };

    fetchMetadata();
    const interval = setInterval(fetchMetadata, 5000);
    return () => clearInterval(interval);
  }, []);

  // ── Mutations ────────────────────────────────────────────────────────────────
  const updateSettings = useMutation({
    mutationFn: (updates: Partial<CompanionSettings>) =>
      apiRequest("PATCH", "/api/companion/settings", updates),
    onSuccess: async (response) => {
      const newSettings = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/companion/settings"] });
      const chromeObj = (window as any).chrome;
      if (chromeObj?.runtime) {
        chromeObj.runtime.sendMessage({ type: "UPDATE_CONFIG", config: newSettings });
      }
    },
  });

  const createWorkspace = useMutation({
    mutationFn: (newWorkspace: { name: string; urls: string[] }) =>
      apiRequest("POST", "/api/workspaces", newWorkspace),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      toast({ title: "Workspace created" });
      setShowWorkspaceForm(false);
      setWsName("");
      setWsUrls("");
    },
    onError: () =>
      toast({ title: "Failed to create workspace", variant: "destructive" }),
  });

  const deleteWorkspace = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/workspaces/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] }),
  });

  const launchWorkspace = (urls: string[]) => {
    const chromeObj = (window as any).chrome;
    if (chromeObj?.runtime) {
      chromeObj.runtime.sendMessage({ type: "LAUNCH_WORKSPACE", urls });
    } else {
      urls.forEach((url) => window.open(url, "_blank"));
    }
    toast({ title: "Launching workspace..." });
  };

  const handleCreateWorkspace = () => {
    const name = wsName.trim();
    const urls = wsUrls
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (!name || urls.length === 0) return;
    createWorkspace.mutate({ name, urls });
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-8 p-6 overflow-y-auto h-full pb-24 bg-[#1a1412] text-[#f3e9dc]">

      {/* ── Companion Insights ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 text-[#c08552] font-bold tracking-wide">
          <Activity className="w-5 h-5 stroke-[2.5px]" />
          <h2 className="text-lg uppercase">Companion Insights</h2>
        </div>

        {/* 2×2 stats grid */}
        <div className="grid grid-cols-2 gap-px bg-[#3d2b26] rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-[#2a1f1b] p-5 text-center" data-testid="cell-tab-count">
            <p className="text-4xl font-display font-bold text-[#f3e9dc]" data-testid="text-tab-count">
              {sessionData.tabCount || "--"}
            </p>
            <p className="text-[10px] text-[#895737] font-black uppercase tracking-[0.2em] mt-1">Tabs Open</p>
          </div>
          <div className="bg-[#2a1f1b] p-5 text-center" data-testid="cell-tab-switches">
            <p className="text-4xl font-display font-bold text-[#f3e9dc]" data-testid="text-tab-switches">
              {sessionData.tabSwitches || "--"}
            </p>
            <p className="text-[10px] text-[#895737] font-black uppercase tracking-[0.2em] mt-1">Switches</p>
          </div>
          <div className="bg-[#2a1f1b] p-5 text-center" data-testid="cell-session-duration">
            <p className="text-2xl font-display font-bold text-[#f3e9dc]" data-testid="text-session-duration">
              {sessionDuration ?? "--"}
            </p>
            <p className="text-[10px] text-[#895737] font-black uppercase tracking-[0.2em] mt-1">Session</p>
          </div>
          <div className="bg-[#2a1f1b] p-5 text-center overflow-hidden" data-testid="cell-top-domain">
            <p
              className="text-sm font-display font-bold text-[#f3e9dc] truncate leading-tight"
              data-testid="text-top-domain"
              title={topDomain ?? ""}
            >
              {topDomain ?? "--"}
            </p>
            <p className="text-[10px] text-[#895737] font-black uppercase tracking-[0.2em] mt-1">Top Domain</p>
          </div>
        </div>
      </section>

      {/* ── Workspaces ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 text-[#c08552] font-bold tracking-wide">
          <Monitor className="w-5 h-5 stroke-[2.5px]" />
          <h2 className="text-lg uppercase">Workspaces</h2>
        </div>

        <div className="grid gap-3">
          {workspaces?.map((ws) => (
            <div
              key={ws.id}
              className="group relative flex items-center justify-between p-4 rounded-xl bg-[#2a1f1b] border border-transparent hover:border-[#5e3023] transition-all duration-300"
              data-testid={`card-workspace-${ws.id}`}
            >
              <div className="flex-1 cursor-pointer" onClick={() => launchWorkspace(ws.urls)}>
                <h3 className="text-sm font-bold text-[#f3e9dc]" data-testid={`text-workspace-name-${ws.id}`}>
                  {ws.name}
                </h3>
                <p className="text-[10px] text-[#895737] uppercase tracking-wider">
                  {ws.urls.length} Resource{ws.urls.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => launchWorkspace(ws.urls)}
                  className="h-8 w-8 text-[#c08552] hover:bg-[#5e3023]/20"
                  data-testid={`btn-launch-workspace-${ws.id}`}
                >
                  <Play className="w-4 h-4 fill-current" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteWorkspace.mutate(ws.id)}
                  className="h-8 w-8 text-[#895737] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-300"
                  data-testid={`btn-delete-workspace-${ws.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}

          {workspaces?.length === 0 && !showWorkspaceForm && (
            <p className="text-xs text-[#895737] italic text-center py-2">
              No workspaces yet. Create one to launch a set of URLs at once.
            </p>
          )}

          {/* Inline workspace creation form */}
          {showWorkspaceForm ? (
            <div
              className="space-y-3 p-4 bg-[#2a1f1b] rounded-xl border border-[#3d2b26]"
              data-testid="form-new-workspace"
            >
              <Input
                placeholder="Workspace name..."
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                className="bg-black/20 border-[#3d2b26] text-[#f3e9dc] focus:border-[#c08552] placeholder:text-[#895737]"
                autoFocus
                data-testid="input-workspace-name"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowWorkspaceForm(false);
                    setWsName("");
                    setWsUrls("");
                  }
                  if (e.key === "Enter" && e.metaKey) handleCreateWorkspace();
                }}
              />
              <Textarea
                placeholder={"URLs — one per line or comma-separated:\nhttps://github.com\nhttps://figma.com"}
                value={wsUrls}
                onChange={(e) => setWsUrls(e.target.value)}
                rows={4}
                className="bg-black/20 border-[#3d2b26] text-[#f3e9dc] text-xs resize-none font-mono focus:border-[#c08552] placeholder:text-[#895737]/60"
                data-testid="input-workspace-urls"
              />
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-[#c08552] hover:bg-[#895737] text-white h-9 text-sm"
                  disabled={!wsName.trim() || !wsUrls.trim() || createWorkspace.isPending}
                  onClick={handleCreateWorkspace}
                  data-testid="btn-create-workspace"
                >
                  {createWorkspace.isPending ? "Creating..." : "Create Workspace"}
                </Button>
                <Button
                  variant="ghost"
                  className="h-9 text-[#895737] hover:text-[#f3e9dc] border border-[#3d2b26] hover:border-[#895737]"
                  onClick={() => {
                    setShowWorkspaceForm(false);
                    setWsName("");
                    setWsUrls("");
                  }}
                  data-testid="btn-cancel-workspace"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full border-dashed border-[#3d2b26] bg-transparent h-14 rounded-xl text-sm font-bold text-[#895737] hover:bg-[#2a1f1b] hover:text-[#c08552] hover:border-[#c08552]/50 transition-all duration-300"
              data-testid="btn-new-workspace"
              onClick={() => setShowWorkspaceForm(true)}
            >
              <Plus className="w-5 h-5 mr-3" /> New Workspace
            </Button>
          )}
        </div>
      </section>

      {/* ── Nudge Settings ─────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 text-[#c08552] font-bold tracking-wide">
          <Bell className="w-5 h-5 stroke-[2.5px]" />
          <h2 className="text-lg uppercase">Nudge Settings</h2>
        </div>

        <Card className="bg-[#2a1f1b] border-none shadow-xl">
          <CardContent className="pt-6 space-y-6">

            {/* Tracking master toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-[#f3e9dc]">Enable Tracking</span>
                <p className="text-[10px] text-[#895737] uppercase tracking-wider italic">Companion is active</p>
              </div>
              <Switch
                className="data-[state=checked]:bg-[#c08552] data-[state=unchecked]:bg-[#3d2b26]"
                checked={settings?.trackingEnabled ?? true}
                onCheckedChange={(checked) => updateSettings.mutate({ trackingEnabled: checked })}
                data-testid="switch-tracking-enabled"
              />
            </div>

            {/* Nudges master toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-[#f3e9dc]">Enable Nudges</span>
                <p className="text-[10px] text-[#895737] uppercase tracking-wider italic">Mascot feedback</p>
              </div>
              <Switch
                className="data-[state=checked]:bg-[#c08552] data-[state=unchecked]:bg-[#3d2b26]"
                checked={settings?.nudgesEnabled ?? true}
                onCheckedChange={(checked) => updateSettings.mutate({ nudgesEnabled: checked })}
                data-testid="switch-nudges-enabled"
              />
            </div>

            {/* Tab threshold */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <label className="text-sm font-bold text-[#f3e9dc]">Tab Threshold</label>
                <span
                  className="text-xl font-display font-bold text-[#c08552]"
                  data-testid="text-tab-threshold"
                >
                  {settings?.tabCountThreshold ?? 10}
                </span>
              </div>
              <Slider
                min={2}
                max={50}
                step={1}
                value={[settings?.tabCountThreshold ?? 10]}
                onValueChange={([val]) => updateSettings.mutate({ tabCountThreshold: val })}
                className="[&_[role=slider]]:bg-[#c08552] [&_[role=slider]]:border-none"
                data-testid="slider-tab-threshold"
              />
              <div className="flex justify-between text-[10px] text-[#895737]">
                <span>2 tabs</span>
                <span>50 tabs</span>
              </div>
            </div>

            {/* Idle threshold */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <label className="text-sm font-bold text-[#f3e9dc]">Idle Detection</label>
                <span
                  className="text-xl font-display font-bold text-[#c08552]"
                  data-testid="text-idle-threshold"
                >
                  {settings?.idleThreshold ?? 300}s
                </span>
              </div>
              <Slider
                min={60}
                max={900}
                step={30}
                value={[settings?.idleThreshold ?? 300]}
                onValueChange={([val]) => updateSettings.mutate({ idleThreshold: val })}
                className="[&_[role=slider]]:bg-[#c08552] [&_[role=slider]]:border-none"
                data-testid="slider-idle-threshold"
              />
              <div className="flex justify-between text-[10px] text-[#895737]">
                <span>1 min</span>
                <span>15 min</span>
              </div>
            </div>

            {/* Nudge frequency */}
            <div className="space-y-3">
              <label className="text-sm font-bold text-[#f3e9dc]">Nudge Frequency</label>
              <div className="flex gap-2" data-testid="nudge-frequency-selector">
                {(["low", "medium", "high"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => updateSettings.mutate({ nudgeFrequency: f })}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-bold border capitalize transition-all",
                      (settings?.nudgeFrequency ?? "medium") === f
                        ? "bg-[#c08552]/20 text-[#c08552] border-[#c08552]/50"
                        : "bg-transparent text-[#895737] border-[#3d2b26] hover:border-[#895737] hover:text-[#f3e9dc]",
                    )}
                    data-testid={`btn-frequency-${f}`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

          </CardContent>
        </Card>
      </section>
    </div>
  );
}
