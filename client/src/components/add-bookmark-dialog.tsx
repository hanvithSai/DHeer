/**
 * client/src/components/add-bookmark-dialog.tsx
 *
 * Modal dialog for creating a new bookmark or editing an existing one.
 *
 * Modes:
 *  - create: empty form, validates URL and title, posts to POST /api/bookmarks
 *  - edit:   pre-populated from `initialData`, patches via PUT /api/bookmarks/:id
 *
 * Tags are entered as a comma-separated string and split on submit.
 *
 * data-testid attributes:
 *  input-url      — URL text input
 *  input-title    — title text input
 *  input-tags     — tags text input
 *  textarea-note  — notes textarea
 *  switch-public  — public/private toggle
 *  btn-cancel     — cancel / close button
 *  btn-submit     — save / add button
 */

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ShinyButton } from '@/components/ui/shiny-button';
import { useCreateBookmark, useUpdateBookmark } from '@/hooks/use-bookmarks';
import { BookmarkResponse } from '@shared/schema';

const formSchema = z.object({
  url:      z.string().url("Please enter a valid URL"),
  title:    z.string().min(1, "Title is required"),
  note:     z.string().optional(),
  tags:     z.string().optional(),
  isPublic: z.boolean().default(false),
});

type FormData = z.infer<typeof formSchema>;

interface AddBookmarkDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  mode?: 'create' | 'edit';
  initialData?: BookmarkResponse;
}

export function AddBookmarkDialog({
  open,
  onOpenChange,
  trigger,
  mode = 'create',
  initialData,
}: AddBookmarkDialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = open !== undefined;
  const isOpen       = isControlled ? open : internalOpen;
  const setIsOpen    = isControlled ? onOpenChange! : setInternalOpen;

  const createMutation = useCreateBookmark();
  const updateMutation = useUpdateBookmark();

  const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { url: '', title: '', note: '', tags: '', isPublic: false },
  });

  // Pre-populate form when editing
  useEffect(() => {
    if (initialData && mode === 'edit' && isOpen) {
      setValue('url',      initialData.url);
      setValue('title',    initialData.title || '');
      setValue('note',     initialData.note  || '');
      setValue('isPublic', initialData.isPublic || false);
      setValue('tags',     initialData.tags.map(t => t.name).join(', '));
    } else if (mode === 'create' && isOpen) {
      reset({ url: '', title: '', note: '', tags: '', isPublic: false });
    }
  }, [initialData, mode, isOpen, setValue, reset]);

  const onSubmit = async (data: FormData) => {
    const tagList = data.tags
      ? data.tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    try {
      if (mode === 'create') {
        await createMutation.mutateAsync({ ...data, tags: tagList });
      } else if (mode === 'edit' && initialData) {
        await updateMutation.mutateAsync({ id: initialData.id, ...data, tags: tagList });
      }
      setIsOpen(false);
      reset();
    } catch {
      // Error handled by mutation hook (toast)
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[95vh] overflow-y-auto border-white/10 bg-[#161616] text-white shadow-2xl p-0">
        <div className="p-6 space-y-5">
          <DialogHeader>
            <DialogTitle className="text-xl font-display">
              {mode === 'create' ? 'Add New Bookmark' : 'Edit Bookmark'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

            {/* URL */}
            <div className="space-y-2">
              <Label htmlFor="dlg-url">URL</Label>
              <Input
                id="dlg-url"
                placeholder="https://example.com"
                className="bg-black/20 border-white/10 focus:border-primary/50"
                data-testid="input-url"
                {...register('url')}
              />
              {errors.url && <p className="text-xs text-destructive">{errors.url.message}</p>}
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="dlg-title">Title</Label>
              <Input
                id="dlg-title"
                placeholder="Page title"
                className="bg-black/20 border-white/10 focus:border-primary/50"
                data-testid="input-title"
                {...register('title')}
              />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="dlg-tags">Tags (comma separated)</Label>
              <Input
                id="dlg-tags"
                placeholder="design, tutorial, reference"
                className="bg-black/20 border-white/10 focus:border-primary/50 font-mono text-sm"
                data-testid="input-tags"
                {...register('tags')}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="dlg-note">Notes</Label>
              <Textarea
                id="dlg-note"
                placeholder="Why is this interesting?"
                className="bg-black/20 border-white/10 focus:border-primary/50 min-h-[100px] resize-none"
                data-testid="textarea-note"
                {...register('note')}
              />
            </div>

            {/* Public toggle */}
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/5 border border-white/5">
              <div className="space-y-0.5">
                <Label htmlFor="dlg-public" className="text-base">Public Bookmark</Label>
                <p className="text-xs text-muted-foreground">Everyone can see this bookmark</p>
              </div>
              <Switch
                id="dlg-public"
                onCheckedChange={(checked) => setValue('isPublic', checked)}
                defaultChecked={initialData?.isPublic || false}
                data-testid="switch-public"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                className="w-full sm:w-auto"
                data-testid="btn-cancel"
              >
                Cancel
              </Button>
              <ShinyButton
                type="submit"
                disabled={isPending}
                className="w-full sm:w-auto"
                data-testid="btn-submit"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    {mode === 'create' ? <Plus className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    {mode === 'create' ? 'Add Bookmark' : 'Save Changes'}
                  </>
                )}
              </ShinyButton>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
