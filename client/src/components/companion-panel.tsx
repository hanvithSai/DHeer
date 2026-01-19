import React, { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Settings, Play, Trash2, Plus, Monitor, Bell, Activity, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Workspace, CompanionSettings } from '@shared/schema';

export function CompanionPanel() {
  const { toast } = useToast();
  const [sessionData, setSessionData] = useState({ tabCount: 0, tabSwitches: 0 });

  const { data: settings } = useQuery<CompanionSettings>({
    queryKey: ['/api/companion/settings']
  });

  const { data: workspaces } = useQuery<Workspace[]>({
    queryKey: ['/api/workspaces']
  });

  useEffect(() => {
    const chromeObj = (window as any).chrome;
    if (chromeObj && chromeObj.runtime) {
      const fetchMetadata = () => {
        chromeObj.runtime.sendMessage({ type: 'GET_SESSION_METADATA' }, (response: any) => {
          if (response) {
            setSessionData({
              tabCount: response.tabCount || 0,
              tabSwitches: response.tabSwitches || 0
            });
          }
        });
      };
      fetchMetadata();
      const interval = setInterval(fetchMetadata, 5000);
      return () => clearInterval(interval);
    }
  }, []);

  const updateSettings = useMutation({
    mutationFn: (updates: Partial<CompanionSettings>) => 
      apiRequest('PATCH', '/api/companion/settings', updates),
    onSuccess: (newSettings) => {
      queryClient.invalidateQueries({ queryKey: ['/api/companion/settings'] });
      const chromeObj = (window as any).chrome;
      if (chromeObj && chromeObj.runtime) {
        chromeObj.runtime.sendMessage({ type: 'UPDATE_CONFIG', config: newSettings });
      }
    }
  });

  const createWorkspace = useMutation({
    mutationFn: (newWorkspace: { name: string, urls: string[] }) =>
      apiRequest('POST', '/api/workspaces', newWorkspace),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
      toast({ title: "Workspace created" });
    }
  });

  const deleteWorkspace = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/workspaces/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] })
  });

  const launchWorkspace = (urls: string[]) => {
    const chromeObj = (window as any).chrome;
    if (chromeObj && chromeObj.runtime) {
      chromeObj.runtime.sendMessage({ type: 'LAUNCH_WORKSPACE', urls });
    } else {
      urls.forEach(url => window.open(url, '_blank'));
    }
    toast({ title: "Launching workspace..." });
  };

  return (
    <div className="flex flex-col gap-8 p-6 overflow-y-auto h-full pb-24 bg-[#1a1412] text-[#f3e9dc]">
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[#c08552] font-bold tracking-wide">
            <Activity className="w-5 h-5 stroke-[2.5px]" />
            <h2 className="text-lg uppercase">Companion Insights</h2>
          </div>
          <SheetTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-[#895737] hover:text-[#f3e9dc] md:hidden">
              <X className="w-5 h-5" />
            </Button>
          </SheetTrigger>
        </div>
        <Card className="bg-[#2a1f1b] border-none shadow-2xl">
          <CardContent className="pt-8 pb-8">
            <div className="grid grid-cols-2 gap-8 text-center relative">
              <div className="space-y-1">
                <p className="text-4xl font-display font-bold text-[#f3e9dc]">{sessionData.tabCount || '--'}</p>
                <p className="text-[10px] text-[#895737] font-black uppercase tracking-[0.2em]">Tabs Open</p>
              </div>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[1px] h-12 bg-[#3d2b26]" />
              <div className="space-y-1">
                <p className="text-4xl font-display font-bold text-[#f3e9dc]">{sessionData.tabSwitches || '--'}</p>
                <p className="text-[10px] text-[#895737] font-black uppercase tracking-[0.2em]">Switches</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3 text-[#c08552] font-bold tracking-wide">
          <Monitor className="w-5 h-5 stroke-[2.5px]" />
          <h2 className="text-lg uppercase">Workspaces</h2>
        </div>
        <div className="grid gap-3">
          {workspaces?.map(ws => (
            <div key={ws.id} className="group relative flex items-center justify-between p-4 rounded-xl bg-[#2a1f1b] border border-transparent hover:border-[#5e3023] transition-all duration-300">
              <div className="flex-1 cursor-pointer" onClick={() => launchWorkspace(ws.urls)}>
                <h3 className="text-sm font-bold text-[#f3e9dc]">{ws.name}</h3>
                <p className="text-[10px] text-[#895737] uppercase tracking-wider">{ws.urls.length} Resources</p>
              </div>
              <div className="flex gap-2">
                <Button size="icon" variant="ghost" onClick={() => launchWorkspace(ws.urls)} className="h-8 w-8 text-[#c08552] hover:bg-[#5e3023]/20">
                  <Play className="w-4 h-4 fill-current" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => deleteWorkspace.mutate(ws.id)} className="h-8 w-8 text-[#895737] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button 
            variant="outline" 
            className="w-full border-dashed border-[#3d2b26] bg-transparent h-14 rounded-xl text-sm font-bold text-[#895737] hover:bg-[#2a1f1b] hover:text-[#c08552] hover:border-[#c08552]/50 transition-all duration-300" 
            onClick={() => {
              const name = prompt("Workspace Name?");
              const urlsInput = prompt("URLs (comma separated)?");
              if (name && urlsInput) {
                const urls = urlsInput.split(',').map(u => u.trim()).filter(Boolean);
                createWorkspace.mutate({ name, urls });
              }
            }}
          >
            <Plus className="w-5 h-5 mr-3" /> New Workspace
          </Button>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3 text-[#c08552] font-bold tracking-wide">
          <Bell className="w-5 h-5 stroke-[2.5px]" />
          <h2 className="text-lg uppercase">Nudge Settings</h2>
        </div>
        <Card className="bg-[#2a1f1b] border-none shadow-xl">
          <CardContent className="pt-8 space-y-8">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-[#f3e9dc]">Enable Nudges</span>
                <p className="text-[10px] text-[#895737] uppercase tracking-wider italic">Mascot feedback</p>
              </div>
              <Switch 
                className="data-[state=checked]:bg-[#c08552] data-[state=unchecked]:bg-[#3d2b26]"
                checked={settings?.nudgesEnabled ?? true} 
                onCheckedChange={(checked) => updateSettings.mutate({ nudgesEnabled: checked })}
              />
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="text-sm font-bold text-[#f3e9dc]">Tab Threshold</label>
                <span className="text-xl font-display font-bold text-[#c08552]">({settings?.tabCountThreshold ?? 10})</span>
              </div>
              <Slider 
                min={2} 
                max={50} 
                step={1}
                value={[settings?.tabCountThreshold ?? 10]}
                onValueChange={([val]) => updateSettings.mutate({ tabCountThreshold: val })}
                className="[&_[role=slider]]:bg-[#c08552] [&_[role=slider]]:border-none"
              />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
