import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronUp, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Todo, TodoStatus, InsertTodo, InsertTodoStatus } from '@shared/schema';

// ── Priority config ────────────────────────────────────────────────────────────
const PRIORITIES = [
  { value: 'high',   label: 'High',   color: 'text-red-400',   bg: 'bg-red-400/10',   border: 'border-red-400/30'   },
  { value: 'medium', label: 'Medium', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30' },
  { value: 'low',    label: 'Low',    color: 'text-blue-400',  bg: 'bg-blue-400/10',  border: 'border-blue-400/30'  },
] as const;

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

const PRESET_COLORS = [
  '#c08552','#895737','#5e3023','#dab49d',
  '#4ade80','#f87171','#fb923c','#facc15',
  '#60a5fa','#c084fc','#94a3b8','#f472b6',
];

type PriorityValue = 'high' | 'medium' | 'low';

// ── Blank form states ──────────────────────────────────────────────────────────
const blankTodo = (): Partial<InsertTodo> => ({ title: '', note: '', priority: 'medium', statusId: undefined });
const blankStatus = (): Partial<InsertTodoStatus> => ({ name: '', color: '#c08552' });

// ── Main component ─────────────────────────────────────────────────────────────
export function TodoPanel() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'tasks' | 'statuses'>('tasks');

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: todos = [], isLoading: loadingTodos } = useQuery<Todo[]>({ queryKey: ['/api/todos'] });
  const { data: statuses = [], isLoading: loadingStatuses } = useQuery<TodoStatus[]>({ queryKey: ['/api/todo-statuses'] });

  // ── Task form state ──────────────────────────────────────────────────────────
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [newTodo, setNewTodo] = useState<Partial<InsertTodo>>(blankTodo());
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // ── Status form state ────────────────────────────────────────────────────────
  const [showAddStatus, setShowAddStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<Partial<InsertTodoStatus>>(blankStatus());
  const [editingStatus, setEditingStatus] = useState<TodoStatus | null>(null);

  // ── Priority filter ──────────────────────────────────────────────────────────
  const [filterPriority, setFilterPriority] = useState<PriorityValue | 'all'>('all');

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createTodo = useMutation({
    mutationFn: (data: InsertTodo) => apiRequest('POST', '/api/todos', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/todos'] }); setNewTodo(blankTodo()); setShowAddTodo(false); },
    onError: () => toast({ title: 'Failed to create task', variant: 'destructive' }),
  });

  const updateTodo = useMutation({
    mutationFn: ({ id, ...data }: Partial<Todo> & { id: number }) => apiRequest('PATCH', `/api/todos/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/todos'] }); setEditingTodo(null); },
    onError: () => toast({ title: 'Failed to update task', variant: 'destructive' }),
  });

  const deleteTodo = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/todos/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/todos'] }),
    onError: () => toast({ title: 'Failed to delete task', variant: 'destructive' }),
  });

  const createStatus = useMutation({
    mutationFn: (data: InsertTodoStatus) => apiRequest('POST', '/api/todo-statuses', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/todo-statuses'] }); setNewStatus(blankStatus()); setShowAddStatus(false); },
    onError: () => toast({ title: 'Failed to create status', variant: 'destructive' }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, ...data }: Partial<TodoStatus> & { id: number }) => apiRequest('PATCH', `/api/todo-statuses/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/todo-statuses'] }); queryClient.invalidateQueries({ queryKey: ['/api/todos'] }); setEditingStatus(null); },
    onError: () => toast({ title: 'Failed to update status', variant: 'destructive' }),
  });

  const deleteStatus = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/todo-statuses/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/todo-statuses'] }); queryClient.invalidateQueries({ queryKey: ['/api/todos'] }); },
    onError: () => toast({ title: 'Failed to delete status', variant: 'destructive' }),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getStatus = (statusId: number | null) => statuses.find(s => s.id === statusId);
  const getPriority = (p: string | null) => PRIORITIES.find(x => x.value === p) ?? PRIORITIES[1];

  const sortedTodos = [...todos]
    .filter(t => filterPriority === 'all' || t.priority === filterPriority)
    .sort((a, b) => PRIORITY_ORDER[a.priority ?? 'medium'] - PRIORITY_ORDER[b.priority ?? 'medium']);

  // ── Sub-components ────────────────────────────────────────────────────────────
  function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={cn('w-6 h-6 rounded-full border-2 transition-transform hover:scale-110', value === c ? 'border-white scale-110' : 'border-transparent')}
              style={{ backgroundColor: c }}
              onClick={() => onChange(c)}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
          />
          <span className="text-xs text-muted-foreground font-mono">{value}</span>
        </div>
      </div>
    );
  }

  function TodoForm({ data, onChange, onSave, onCancel, saving }: {
    data: Partial<InsertTodo>;
    onChange: (d: Partial<InsertTodo>) => void;
    onSave: () => void;
    onCancel: () => void;
    saving: boolean;
  }) {
    return (
      <div className="space-y-3 p-3 bg-white/5 rounded-xl border border-white/10">
        <Input
          placeholder="Task title…"
          value={data.title ?? ''}
          onChange={e => onChange({ ...data, title: e.target.value })}
          className="bg-white/5 border-white/10 text-sm"
          autoFocus
          data-testid="input-todo-title"
        />
        <Textarea
          placeholder="Notes (optional)…"
          value={data.note ?? ''}
          onChange={e => onChange({ ...data, note: e.target.value })}
          className="bg-white/5 border-white/10 text-sm resize-none"
          rows={2}
          data-testid="input-todo-note"
        />
        <div className="flex gap-2">
          {/* Priority selector */}
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1.5 tracking-wider">Priority</p>
            <div className="flex gap-1">
              {PRIORITIES.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onChange({ ...data, priority: p.value })}
                  className={cn(
                    'flex-1 py-1 rounded-lg text-[11px] font-bold border transition-all',
                    data.priority === p.value ? `${p.color} ${p.bg} ${p.border}` : 'text-muted-foreground bg-white/5 border-transparent hover:border-white/20'
                  )}
                  data-testid={`btn-priority-${p.value}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* Status selector */}
        <div>
          <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1.5 tracking-wider">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {statuses.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange({ ...data, statusId: s.id })}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all',
                  data.statusId === s.id ? 'border-white/30 text-white' : 'border-transparent text-muted-foreground hover:border-white/20'
                )}
                style={data.statusId === s.id ? { backgroundColor: s.color + '33', borderColor: s.color + '66' } : {}}
                data-testid={`btn-status-${s.id}`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 bg-primary/80 hover:bg-primary text-white h-8" onClick={onSave} disabled={saving || !data.title?.trim()} data-testid="btn-save-todo">
            {saving ? 'Saving…' : <><Check className="w-3 h-3 mr-1" /> Save</>}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 px-3 text-muted-foreground" onClick={onCancel} data-testid="btn-cancel-todo">
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  }

  // ── Tasks tab ─────────────────────────────────────────────────────────────────
  function TasksTab() {
    return (
      <div className="space-y-3">
        {/* Filter row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'high', 'medium', 'low'] as const).map(f => {
            const p = f === 'all' ? null : getPriority(f);
            return (
              <button
                key={f}
                onClick={() => setFilterPriority(f)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all capitalize',
                  filterPriority === f
                    ? p ? `${p.color} ${p.bg} ${p.border}` : 'text-white bg-white/10 border-white/20'
                    : 'text-muted-foreground border-transparent hover:border-white/20'
                )}
                data-testid={`filter-priority-${f}`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            );
          })}
          <div className="ml-auto">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2.5 text-[11px] font-bold text-primary hover:bg-primary/10"
              onClick={() => { setShowAddTodo(v => !v); setNewTodo(blankTodo()); }}
              data-testid="btn-add-todo"
            >
              <Plus className="w-3 h-3 mr-1" /> New Task
            </Button>
          </div>
        </div>

        {/* Add form */}
        {showAddTodo && (
          <TodoForm
            data={newTodo}
            onChange={setNewTodo}
            onSave={() => { if (newTodo.title?.trim()) createTodo.mutate(newTodo as InsertTodo); }}
            onCancel={() => setShowAddTodo(false)}
            saving={createTodo.isPending}
          />
        )}

        {/* Todo list */}
        {loadingTodos ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading tasks…</div>
        ) : sortedTodos.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-sm font-medium">No tasks yet</p>
            <p className="text-xs opacity-60">Click "New Task" to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedTodos.map(todo => {
              const priority = getPriority(todo.priority);
              const status = getStatus(todo.statusId);
              const isExpanded = expandedId === todo.id;
              const isEditing = editingTodo?.id === todo.id;

              return (
                <div key={todo.id} className={cn('rounded-xl border transition-all', priority.border, 'bg-white/[0.03]')} data-testid={`card-todo-${todo.id}`}>
                  {isEditing ? (
                    <div className="p-2">
                      <TodoForm
                        data={editingTodo}
                        onChange={d => setEditingTodo({ ...editingTodo, ...d })}
                        onSave={() => updateTodo.mutate({ ...editingTodo })}
                        onCancel={() => setEditingTodo(null)}
                        saving={updateTodo.isPending}
                      />
                    </div>
                  ) : (
                    <>
                      {/* Card header row */}
                      <div className="flex items-center gap-2 p-3">
                        {/* Status dot / toggle done */}
                        <button
                          className="shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110"
                          style={{
                            borderColor: status?.color ?? '#555',
                            backgroundColor: status?.name === 'Done' ? (status?.color ?? '#4ade80') + '33' : 'transparent'
                          }}
                          title={status?.name ?? 'No status'}
                          onClick={() => {
                            const doneStatus = statuses.find(s => s.name === 'Done');
                            const todoStatus = statuses.find(s => s.name === 'To Do');
                            if (status?.name === 'Done') {
                              updateTodo.mutate({ id: todo.id, statusId: todoStatus?.id ?? null });
                            } else if (doneStatus) {
                              updateTodo.mutate({ id: todo.id, statusId: doneStatus.id });
                            }
                          }}
                          data-testid={`btn-toggle-done-${todo.id}`}
                        >
                          {status?.name === 'Done' && <Check className="w-2.5 h-2.5" style={{ color: status.color }} />}
                        </button>

                        {/* Title */}
                        <span className={cn('flex-1 text-sm font-medium truncate', status?.name === 'Done' && 'line-through text-muted-foreground')} data-testid={`text-todo-title-${todo.id}`}>
                          {todo.title}
                        </span>

                        {/* Priority badge */}
                        <span className={cn('shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full', priority.color, priority.bg)} data-testid={`badge-priority-${todo.id}`}>
                          {priority.label}
                        </span>

                        {/* Action buttons */}
                        <div className="shrink-0 flex items-center gap-0.5">
                          <button className="w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all" onClick={() => setEditingTodo(todo)} data-testid={`btn-edit-todo-${todo.id}`}>
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button className="w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all" onClick={() => deleteTodo.mutate(todo.id)} data-testid={`btn-delete-todo-${todo.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </button>
                          {todo.note && (
                            <button className="w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all" onClick={() => setExpandedId(isExpanded ? null : todo.id)} data-testid={`btn-expand-todo-${todo.id}`}>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Status label row */}
                      {status && (
                        <div className="px-3 pb-2 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: status.color }} />
                          <span className="text-[11px] text-muted-foreground">{status.name}</span>
                        </div>
                      )}

                      {/* Expanded note */}
                      {isExpanded && todo.note && (
                        <div className="px-3 pb-3">
                          <p className="text-xs text-muted-foreground bg-white/5 rounded-lg p-2.5 leading-relaxed whitespace-pre-wrap">{todo.note}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Statuses tab ──────────────────────────────────────────────────────────────
  function StatusesTab() {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Configure custom statuses and their colors</p>
          <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[11px] font-bold text-primary hover:bg-primary/10" onClick={() => setShowAddStatus(v => !v)} data-testid="btn-add-status">
            <Plus className="w-3 h-3 mr-1" /> New
          </Button>
        </div>

        {/* Add status form */}
        {showAddStatus && (
          <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-3">
            <Input
              placeholder="Status name…"
              value={newStatus.name ?? ''}
              onChange={e => setNewStatus(s => ({ ...s, name: e.target.value }))}
              className="bg-white/5 border-white/10 text-sm"
              autoFocus
              data-testid="input-status-name"
            />
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2 tracking-wider">Color</p>
              <ColorPicker value={newStatus.color ?? '#c08552'} onChange={c => setNewStatus(s => ({ ...s, color: c }))} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 bg-primary/80 hover:bg-primary text-white h-8" onClick={() => { if (newStatus.name?.trim()) createStatus.mutate(newStatus as InsertTodoStatus); }} disabled={createStatus.isPending || !newStatus.name?.trim()} data-testid="btn-save-status">
                {createStatus.isPending ? 'Saving…' : <><Check className="w-3 h-3 mr-1" /> Save</>}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-3 text-muted-foreground" onClick={() => setShowAddStatus(false)} data-testid="btn-cancel-status">
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Status list */}
        {loadingStatuses ? (
          <div className="text-sm text-muted-foreground text-center py-6">Loading…</div>
        ) : statuses.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6 italic">No statuses yet</div>
        ) : (
          <div className="space-y-2">
            {statuses.map(s => {
              const isEditing = editingStatus?.id === s.id;
              return (
                <div key={s.id} className="rounded-xl border border-white/10 bg-white/[0.03]" data-testid={`card-status-${s.id}`}>
                  {isEditing ? (
                    <div className="p-3 space-y-3">
                      <Input
                        value={editingStatus.name}
                        onChange={e => setEditingStatus(st => st ? { ...st, name: e.target.value } : st)}
                        className="bg-white/5 border-white/10 text-sm"
                        autoFocus
                        data-testid={`input-edit-status-name-${s.id}`}
                      />
                      <ColorPicker value={editingStatus.color ?? '#c08552'} onChange={c => setEditingStatus(st => st ? { ...st, color: c } : st)} />
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 bg-primary/80 hover:bg-primary text-white h-8" onClick={() => updateStatus.mutate({ id: editingStatus.id, name: editingStatus.name, color: editingStatus.color })} disabled={updateStatus.isPending} data-testid={`btn-save-status-${s.id}`}>
                          {updateStatus.isPending ? 'Saving…' : <><Check className="w-3 h-3 mr-1" /> Save</>}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 px-3 text-muted-foreground" onClick={() => setEditingStatus(null)} data-testid={`btn-cancel-status-${s.id}`}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3">
                      <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="flex-1 text-sm font-medium" data-testid={`text-status-name-${s.id}`}>{s.name}</span>
                      <button className="w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all" onClick={() => setEditingStatus(s)} data-testid={`btn-edit-status-${s.id}`}>
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button className="w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all" onClick={() => deleteStatus.mutate(s.id)} data-testid={`btn-delete-status-${s.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-white/5 px-4 pt-2 shrink-0">
        {(['tasks', 'statuses'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all capitalize',
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
            data-testid={`tab-todo-${t}`}
          >
            {t === 'tasks' ? `Tasks${todos.length ? ` (${todos.length})` : ''}` : 'Statuses'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-primary/50">
        {tab === 'tasks' ? <TasksTab /> : <StatusesTab />}
      </div>
    </div>
  );
}
