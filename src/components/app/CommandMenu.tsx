import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ArrowRight, Plus, Search, Users, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useApp } from '../../context/AppContext';
import { useCreateAutomation } from '../../context/CreateAutomationContext';
import {
  canCreateAutomation,
} from '../../lib/access';
import {
  fetchContacts,
  fetchFlows,
  isBackendConfigured,
} from '../../lib/api';
import type { Contact } from '../../lib/api';
import { navItems } from '../../lib/nav';
import { queryKeys } from '../../lib/queryKeys';

const CONTACT_DEBOUNCE_MS = 200;

interface CommandResult {
  id: string;
  label: string;
  detail?: string;
  icon: LucideIcon;
  select: () => void;
}

function matches(label: string, query: string): boolean {
  return !query || label.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

function personLabel(contact: Contact): string {
  return contact.name ?? contact.handle ?? 'Someone';
}

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function CommandMenu() {
  const navigate = useNavigate();
  const { workspaceAccess } = useApp();
  const { beginCreateAutomation } = useCreateAutomation();
  const canvasInvitee = workspaceAccess?.role === 'canvas';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const debouncedQuery = useDebouncedValue(query.trim(), CONTACT_DEBOUNCE_MS);
  const backendConfigured = isBackendConfigured();

  const flowsQuery = useQuery({
    queryKey: queryKeys.flows,
    queryFn: fetchFlows,
    enabled: open && backendConfigured,
    staleTime: 60_000,
  });
  const contactsQuery = useQuery({
    queryKey: ['commandSearchContacts', debouncedQuery],
    queryFn: () => fetchContacts({ search: debouncedQuery, limit: 5 }),
    enabled: open && backendConfigured && debouncedQuery.length >= 2,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (canvasInvitee) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(current => !current);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [canvasInvitee]);

  const normalizedQuery = query.trim();
  const goToResults = useMemo<CommandResult[]>(() => {
    const items: CommandResult[] = [];
    if (canCreateAutomation(workspaceAccess) && matches('New automation', normalizedQuery)) {
      items.push({
        id: 'new-automation',
        label: 'New automation',
        detail: 'Create a new automation',
        icon: Plus,
        select: beginCreateAutomation,
      });
    }
    items.push(
      ...navItems
        .filter(item => matches(item.label, normalizedQuery))
        .map(item => ({
          id: item.path,
          label: item.label,
          icon: item.icon,
          select: () => navigate(item.path),
        })),
    );
    return items.slice(0, 5);
  }, [beginCreateAutomation, navigate, normalizedQuery, workspaceAccess]);

  const automationResults = useMemo<CommandResult[]>(() => {
    const flows = flowsQuery.data ?? [];
    return flows
      .filter(flow => matches(flow.name, normalizedQuery))
      .slice(0, 5)
      .map(flow => ({
        id: flow.id,
        label: flow.name,
        detail: flow.status === 'live' ? 'Live automation' : `${flow.status} automation`,
        icon: Zap,
        select: () => navigate(`/automations/${flow.id}`),
      }));
  }, [flowsQuery.data, navigate, normalizedQuery]);

  const peopleResults = useMemo<CommandResult[]>(() => {
    const contacts = contactsQuery.data?.contacts ?? [];
    return contacts
      .filter(contact => matches(personLabel(contact), normalizedQuery))
      .slice(0, 5)
      .map(contact => ({
        id: contact.id,
        label: personLabel(contact),
        detail: contact.handle ? `@${contact.handle.replace(/^@/, '')}` : undefined,
        icon: Users,
        select: () => navigate(`/contacts?contact=${encodeURIComponent(contact.id)}`),
      }));
  }, [contactsQuery.data, navigate, normalizedQuery]);

  const groups = [
    { label: 'Go to', results: goToResults },
    { label: 'Automations', results: automationResults },
    { label: 'People', results: peopleResults },
  ].filter(group => group.results.length > 0);
  const results = groups.flatMap(group => group.results);
  const activeIndex = Math.min(highlighted, Math.max(results.length - 1, 0));
  const peopleLoading =
    normalizedQuery.length >= 2 &&
    debouncedQuery.toLocaleLowerCase() !== normalizedQuery.toLocaleLowerCase();
  const searching =
    (flowsQuery.isFetching && backendConfigured) ||
    peopleLoading ||
    (contactsQuery.isFetching && debouncedQuery.length >= 2);
  const shortcut =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
      ? '⌘K'
      : 'Ctrl K';

  if (canvasInvitee) return null;

  const close = () => {
    setOpen(false);
    setQuery('');
    setHighlighted(0);
  };
  const selectResult = (result: CommandResult) => {
    close();
    result.select();
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted(current => results.length ? (current + 1) % results.length : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted(current => results.length ? (current - 1 + results.length) % results.length : 0);
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      selectResult(results[activeIndex]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search people, automations, and pages"
        className="hidden h-9 w-[260px] items-center gap-2 rounded-lg bg-card px-3 text-left
          text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted lg:w-[320px] md:flex"
      >
        <Search size={15} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[13px]">
          Search people, automations, pages…
        </span>
        <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {shortcut}
        </kbd>
      </button>

      <Dialog
        open={open}
        onOpenChange={next => {
          if (next) setOpen(true);
          else close();
        }}
      >
        <DialogContent
          className="top-[12vh] max-w-[560px] p-0 -translate-y-0"
        >
          <DialogTitle className="sr-only">Search Populr</DialogTitle>
          <DialogDescription className="sr-only">
            Search pages, automations, and people in your workspace.
          </DialogDescription>
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <Search size={18} className="shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setHighlighted(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search people, automations, pages…"
              aria-label="Search"
              aria-activedescendant={results[activeIndex] ? `command-${results[activeIndex].id}` : undefined}
              role="combobox"
              aria-expanded="true"
              aria-controls="command-results"
              className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Esc
            </kbd>
          </div>
          <div id="command-results" className="max-h-[420px] overflow-y-auto p-2" role="listbox">
            {groups.map(group => (
              <div key={group.label} role="group" aria-label={group.label} className="py-1">
                <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                {group.results.map(result => {
                  const index = results.indexOf(result);
                  const selected = index === activeIndex;
                  const Icon = result.icon;
                  return (
                    <button
                      key={`${group.label}-${result.id}`}
                      id={`command-${result.id}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setHighlighted(index)}
                      onClick={() => selectResult(result)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left
                        transition-colors ${selected ? 'bg-muted' : 'hover:bg-muted/70'}`}
                    >
                      <Icon size={16} className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                        {result.label}
                        {result.detail && (
                          <span className="ml-2 font-normal text-muted-foreground">
                            {result.detail}
                          </span>
                        )}
                      </span>
                      {selected && <ArrowRight size={14} className="shrink-0 text-muted-foreground" />}
                    </button>
                  );
                })}
              </div>
            ))}
            {results.length === 0 && (
              <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
                {searching ? 'Searching…' : 'No results'}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
