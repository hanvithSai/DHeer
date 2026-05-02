/**
 * client/src/components/import-bookmarks-dialog.tsx
 *
 * Dialog for bulk-importing bookmarks from:
 *  - A browser HTML export file (NETSCAPE bookmark format)
 *  - A plain-text list of URLs (one per line)
 *
 * The file or text content is read on the client and sent to
 * POST /api/bookmarks/import as JSON.  The server parses, deduplicates,
 * and batch-inserts; then returns { imported, duplicates }.
 *
 * data-testid attributes:
 *  btn-import-open       — trigger button
 *  tab-import-file       — "HTML File" tab
 *  tab-import-urls       — "URL List" tab
 *  input-import-file     — file input for .html upload
 *  textarea-import-urls  — textarea for URL list
 *  btn-import-cancel     — cancel / close button
 *  btn-import-submit     — submit button
 */

import React, { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, Link2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiRequest } from '@/lib/queryClient';

interface ImportResult {
  imported: number;
  duplicates: number;
}

interface ImportBookmarksDialogProps {
  trigger?: React.ReactNode;
}

export function ImportBookmarksDialog({ trigger }: ImportBookmarksDialogProps) {
  const [open, setOpen]             = useState(false);
  const [tab, setTab]               = useState<'file' | 'urls'>('file');
  const [urlText, setUrlText]       = useState('');
  const [fileName, setFileName]     = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [result, setResult]         = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const fileRef                     = useRef<HTMLInputElement>(null);
  const queryClient                 = useQueryClient();

  const importMutation = useMutation({
    mutationFn: async (payload: { type: 'html' | 'urls'; content: string }) => {
      const res = await apiRequest('POST', '/api/bookmarks/import', payload);
      return res.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ['/api/bookmarks'] });
    },
    onError: (err: any) => {
      let msg = 'Import failed. Please try again.';
      try {
        // apiRequest throws Error("STATUS: body text") — extract the body text
        const raw = err?.message ?? '';
        const colonIdx = raw.indexOf(': ');
        if (colonIdx !== -1) {
          const body = JSON.parse(raw.slice(colonIdx + 2));
          if (body?.message) msg = body.message;
        }
      } catch { /* ignore parse errors */ }
      setErrorMsg(msg);
      setResult(null);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFileContent(ev.target?.result as string);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleSubmit = () => {
    setResult(null);
    setErrorMsg(null);

    if (tab === 'file') {
      if (!fileContent) {
        setErrorMsg('Please select a bookmark HTML file.');
        return;
      }
      importMutation.mutate({ type: 'html', content: fileContent });
    } else {
      const trimmed = urlText.trim();
      if (!trimmed) {
        setErrorMsg('Please enter at least one URL.');
        return;
      }
      importMutation.mutate({ type: 'urls', content: trimmed });
    }
  };

  const handleOpenChange = (val: boolean) => {
    setOpen(val);
    if (!val) {
      // Reset state on close
      setTab('file');
      setUrlText('');
      setFileName(null);
      setFileContent(null);
      setResult(null);
      setErrorMsg(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const isPending = importMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && (
        <DialogTrigger asChild data-testid="btn-import-open">
          {trigger}
        </DialogTrigger>
      )}

      <DialogContent className="w-[95vw] sm:max-w-[520px] border-white/10 bg-[#161616] text-white shadow-2xl p-0">
        <div className="p-6 space-y-5">
          <DialogHeader>
            <DialogTitle className="text-xl font-display flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Import Bookmarks
            </DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">
              Import from a browser bookmark export (.html) or a plain list of URLs.
            </p>
          </DialogHeader>

          {result ? (
            /* ── Success summary ── */
            <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4 flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
              <p className="text-lg font-semibold text-white">
                Import complete!
              </p>
              <p className="text-sm text-muted-foreground" data-testid="text-import-summary">
                <span className="text-green-400 font-bold">{result.imported}</span> bookmark{result.imported !== 1 ? 's' : ''} imported
                {result.duplicates > 0 && (
                  <>, <span className="text-yellow-400 font-bold">{result.duplicates}</span> duplicate{result.duplicates !== 1 ? 's' : ''} skipped</>
                )}.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                className="mt-2 border-white/10 hover:text-white"
              >
                Done
              </Button>
            </div>
          ) : (
            <Tabs value={tab} onValueChange={(v) => { setTab(v as 'file' | 'urls'); setResult(null); setErrorMsg(null); }}>
              <TabsList className="w-full bg-white/5 border border-white/10">
                <TabsTrigger
                  value="file"
                  className="flex-1 data-[state=active]:bg-primary/20"
                  data-testid="tab-import-file"
                >
                  <FileText className="w-4 h-4 mr-1.5" />
                  HTML File
                </TabsTrigger>
                <TabsTrigger
                  value="urls"
                  className="flex-1 data-[state=active]:bg-primary/20"
                  data-testid="tab-import-urls"
                >
                  <Link2 className="w-4 h-4 mr-1.5" />
                  URL List
                </TabsTrigger>
              </TabsList>

              {/* ── HTML File tab ── */}
              <TabsContent value="file" className="mt-4 space-y-3">
                <Label className="text-sm text-muted-foreground">
                  Export your bookmarks from Chrome, Firefox, or Safari as an HTML file,
                  then upload it here.
                </Label>
                <div
                  className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-white/10 bg-white/5 py-8 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  {fileName ? (
                    <p className="text-sm font-medium text-white">{fileName}</p>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">Click to select a .html bookmark file</p>
                      <p className="text-xs text-muted-foreground/60">Supports Chrome, Firefox, Safari exports</p>
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".html,.htm"
                    className="hidden"
                    onChange={handleFileChange}
                    data-testid="input-import-file"
                  />
                </div>
              </TabsContent>

              {/* ── URL list tab ── */}
              <TabsContent value="urls" className="mt-4 space-y-3">
                <Label htmlFor="import-urls-textarea" className="text-sm text-muted-foreground">
                  Paste one URL per line. Invalid lines are silently skipped.
                </Label>
                <Textarea
                  id="import-urls-textarea"
                  placeholder={"https://example.com\nhttps://github.com\nhttps://news.ycombinator.com"}
                  value={urlText}
                  onChange={(e) => setUrlText(e.target.value)}
                  className="bg-black/20 border-white/10 focus:border-primary/50 font-mono text-sm min-h-[160px] resize-none"
                  data-testid="textarea-import-urls"
                />
              </TabsContent>
            </Tabs>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {errorMsg}
            </div>
          )}

          {!result && (
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                className="w-full sm:w-auto"
                data-testid="btn-import-cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground"
                data-testid="btn-import-submit"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Import
                  </>
                )}
              </Button>
            </DialogFooter>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
