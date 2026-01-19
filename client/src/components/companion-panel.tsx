import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Settings, Play, Trash2, Plus, Monitor, Bell, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Workspace, CompanionSettings } from '@shared/schema';

export function CompanionPanel() {
  const { toast } = useToast();

  const { data: settings } = useQuery<CompanionSettings>({
    queryKey: ['/api/companion/settings']
  });

  const { data: workspaces } = useQuery<Workspace[]>({
    queryKey: ['/api/workspaces']
  });

  const updateSettings = useMutation({
    mutationFn: (updates: Partial<CompanionSettings>) => 
      apiRequest('PATCH', '/api/companion/settings', updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/companion/settings'] })
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
    // In extension context, we send message to background
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'LAUNCH_WORKSPACE', urls });
    } else {
      urls.forEach(url => window.open(url, '_blank'));
    }
    toast({ title: "Launching workspace..." });
  };

  return (
    <div className="flex flex-col gap-6 p-4 overflow-y-auto h-full pb-20">
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-primary font-bold">
          <Activity className="w-5 h-5" />
          <h2>Companion Insights</h2>
        </div>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">--</p>
                <p className="text-xs text-muted-foreground uppercase">Tabs Open</p>
              </div>
              <div>
                <p className="text-2xl font-bold">--</p>
                <p className="text-xs text-muted-foreground uppercase">Switches</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-primary font-bold">
          <Monitor className="w-5 h-5" />
          <h2>Workspaces</h2>
        </div>
        <div className="flex flex-col gap-2">
          {workspaces?.map(ws => (
            <Card key={ws.id} className="group hover-elevate overflow-hidden border-white/5">
              <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-sm font-bold">{ws.name}</CardTitle>
                  <CardDescription className="text-[10px]">{ws.urls.length} resources</CardDescription>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => launchWorkspace(ws.urls)} className="h-8 w-8 text-accent">
                    <Play className="w-4 h-4 fill-current" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteWorkspace.mutate(ws.id)} className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
          <Button variant="outline" className="w-full border-dashed border-white/10 h-10 text-xs" onClick={() => {
            const name = prompt("Workspace Name?");
            const urls = prompt("URLs (comma separated)?")?.split(',').map(u => u.trim()).filter(Boolean);
            if (name && urls) createWorkspace.mutate({ name, urls });
          }}>
            <Plus className="w-4 h-4 mr-2" /> New Workspace
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-primary font-bold">
          <Bell className="w-5 h-5" />
          <h2>Nudge Settings</h2>
        </div>
        <Card className="border-white/5 bg-white/5">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Enable Nudges</span>
              <Switch 
                checked={settings?.nudgesEnabled ?? true} 
                onCheckedChange={(checked) => updateSettings.mutate({ nudgesEnabled: checked })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Tab Threshold ({settings?.tabCountThreshold ?? 10})</label>
              <Input 
                type="range" min="2" max="50" 
                value={settings?.tabCountThreshold ?? 10}
                onChange={(e) => updateSettings.mutate({ tabCountThreshold: parseInt(e.target.value) })}
                className="h-4 accent-primary"
              />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
