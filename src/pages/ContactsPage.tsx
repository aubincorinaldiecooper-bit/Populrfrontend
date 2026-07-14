import { useState, useMemo, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  Search, SlidersHorizontal, Columns3, ArrowUpDown,
  AlertTriangle, X, GitMerge, GripVertical,
} from 'lucide-react';

import PlatformDot from '../components/PlatformDot';
import StatusPill from '../components/StatusPill';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

type ViewMode = 'table' | 'pipeline';

interface ColumnDef {
  key: string;
  label: string;
  width: number;
  minWidth: number;
  sortable?: boolean;
  priority: 'primary' | 'secondary' | 'tertiary';
}

const COLUMNS: ColumnDef[] = [
  { key: 'contact', label: 'Contact', width: 280, minWidth: 200, sortable: true, priority: 'primary' },
  { key: 'intent', label: 'Intent', width: 150, minWidth: 120, sortable: true, priority: 'primary' },
  { key: 'stage', label: 'Stage', width: 120, minWidth: 100, sortable: true, priority: 'primary' },
  { key: 'relationship', label: 'Relationship', width: 130, minWidth: 110, sortable: true, priority: 'secondary' },
  { key: 'campaign', label: 'Active campaign', width: 160, minWidth: 130, sortable: false, priority: 'secondary' },
  { key: 'lastActive', label: 'Last activity', width: 110, minWidth: 90, sortable: true, priority: 'secondary' },
];

const QUICK_VIEWS = [
  { key: 'all', label: 'All' },
  { key: 'needs-attention', label: 'Needs attention' },
  { key: 'high-intent', label: 'High intent' },
  { key: 'at-risk', label: 'At risk' },
  { key: 'recently-active', label: 'Recently active' },
];

export default function ContactsPage() {
  const { contacts, openContactDrawer, mergeContacts, showToast } = useApp();
  const [search, setSearch] = useState('');
  const [quickView, setQuickView] = useState('all');
  const [view, setView] = useState<ViewMode>('table');
  const [sortField, setSortField] = useState<string>('contact');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [columns, setColumns] = useState<ColumnDef[]>(COLUMNS);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);

  // Column resizing
  const resizingCol = useRef<number | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleResizeStart = useCallback((index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingCol.current = index;
    startX.current = e.clientX;
    startWidth.current = columns[index].width;
    const handleMove = (moveEvent: MouseEvent) => {
      if (resizingCol.current === null) return;
      const delta = moveEvent.clientX - startX.current;
      const newWidth = Math.max(columns[resizingCol.current].minWidth, startWidth.current + delta);
      setColumns(prev => prev.map((col, i) => i === resizingCol.current ? { ...col, width: newWidth } : col));
    };
    const handleUp = () => { resizingCol.current = null; window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [columns]);

  // Filter state
  const [filterPlatform, setFilterPlatform] = useState<string[]>([]);
  const [filterRelationship, setFilterRelationship] = useState<string[]>([]);
  const [filterIntent, setFilterIntent] = useState<string[]>([]);
  const [filterStage, setFilterStage] = useState<string[]>([]);

  const filtered = useMemo(() => {
    let result = [...contacts];

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c => c.handle.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
    }

    // Quick views
    if (quickView === 'needs-attention') result = result.filter(c => c.intent === 'conversion' || c.intent === 'pricing' || c.intent === 'human-review');
    if (quickView === 'high-intent') result = result.filter(c => c.intent === 'conversion');
    if (quickView === 'at-risk') result = result.filter(c => c.relationship === 'at-risk');
    if (quickView === 'recently-active') result = result.filter(c => !c.recentActions[0]?.time.includes('w') && !c.recentActions[0]?.time.includes('mo'));

    // Detailed filters
    if (filterPlatform.length > 0) result = result.filter(c => filterPlatform.includes(c.platform));
    if (filterRelationship.length > 0) result = result.filter(c => filterRelationship.includes(c.relationship));
    if (filterIntent.length > 0) result = result.filter(c => filterIntent.includes(c.intent));
    if (filterStage.length > 0) result = result.filter(c => filterStage.includes(c.stage));

    // Sort
    result.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'contact') return a.handle.localeCompare(b.handle) * dir;
      if (sortField === 'stage') return a.stage.localeCompare(b.stage) * dir;
      return 0;
    });

    return result;
  }, [contacts, search, quickView, filterPlatform, filterRelationship, filterIntent, filterStage, sortField, sortDir]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  // Potential duplicates
  const potentialDuplicates = useMemo(() => {
    const dups: { id: string; handle1: string; handle2: string }[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const a = contacts[i], b = contacts[j];
        if (a.platform === b.platform && a.name === b.name && !seen.has(`${a.id}-${b.id}`)) {
          seen.add(`${a.id}-${b.id}`);
          dups.push({ id: `dup-${a.id}-${b.id}`, handle1: a.handle, handle2: b.handle });
        }
      }
    }
    return dups.slice(0, 3);
  }, [contacts]);

  const hasActiveFilters = filterPlatform.length + filterRelationship.length + filterIntent.length + filterStage.length > 0;

  // Pipeline columns
  const stageColumns = [
    { key: 'discovered', label: 'Discovered', color: 'border-t-[#E8E4DF]' },
    { key: 'engaged', label: 'Engaged', color: 'border-t-[#10B981]' },
    { key: 'interested', label: 'Interested', color: 'border-t-coral' },
    { key: 'converted', label: 'Converted', color: 'border-t-[#059669]' },
  ];

  return (
    <div className="pop-page">
      <PageHeader
        title="Contacts"
        subtitle={`${contacts.length} people in your audience`}
        action={
          <div className="flex items-center gap-2">
            {view === 'table' && (
              <div className="relative hidden sm:block">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..."
                  className="pop-search w-56" />
              </div>
            )}
            <button onClick={() => setShowFilterDrawer(true)}
              className={`p-2.5 rounded-xl border transition-all ${hasActiveFilters ? 'border-chartreuse bg-chartreuse/10 text-[#111111]' : 'border-[#E8E4DF] text-[#6B6B6B] hover:bg-[#FAFAF8]'}`}
              title="Filters">
              <SlidersHorizontal size={16} />
            </button>
            <div className="flex bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
              {([['table', Columns3], ['pipeline', SlidersHorizontal]] as [ViewMode, React.ElementType][]).map(([v, Icon]) => (
                <button key={v} onClick={() => setView(v)}
                  className={`p-2.5 transition-all ${view === v ? 'bg-[#111111] text-white' : 'text-[#6B6B6B] hover:bg-[#FAFAF8]'}`}>
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </div>
        }
      />

      {/* Compact duplicate alert */}
      {potentialDuplicates.length > 0 && !showDuplicates && (
        <div className="mb-4 bg-[#FFF3E0]/60 border border-[#FDE68A]/60 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <AlertTriangle size={14} className="text-[#D97706] flex-shrink-0" />
          <p className="text-[12px] text-[#6B6B6B] flex-1">
            <span className="font-medium text-[#111111]">{potentialDuplicates.length} possible duplicate profiles</span>
          </p>
          <button onClick={() => setShowDuplicates(true)} className="text-[11px] font-medium text-[#D97706] hover:text-[#111111] transition-colors">
            Review
          </button>
        </div>
      )}

      {/* Duplicate review panel */}
      {showDuplicates && (
        <div className="mb-6 pop-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <GitMerge size={16} className="text-[#D97706]" />
              <h3 className="pop-card-title">Review duplicates</h3>
            </div>
            <button onClick={() => setShowDuplicates(false)} className="p-1.5 hover:bg-[#FAFAF8] rounded-lg transition-all">
              <X size={16} className="text-[#6B6B6B]" />
            </button>
          </div>
          <div className="space-y-2">
            {potentialDuplicates.map(dup => (
              <div key={dup.id} className="flex items-center gap-4 border border-[#E8E4DF] rounded-xl p-4">
                <div className="flex-1">
                  <p className="text-[13px] font-medium text-[#111111]">{dup.handle1} ↔ {dup.handle2}</p>
                </div>
                <button onClick={() => {
                  const c1 = contacts.find(c => c.handle === dup.handle1);
                  const c2 = contacts.find(c => c.handle === dup.handle2);
                  if (c1 && c2) { mergeContacts(c1.id, c2.id); showToast('Contacts merged', 'success'); }
                }} className="pop-btn-primary text-[11px] py-1.5 px-3">
                  <GitMerge size={12} />Merge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick views */}
      <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
        {QUICK_VIEWS.map(v => (
          <button key={v.key} onClick={() => setQuickView(v.key)}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-medium whitespace-nowrap transition-all ${quickView === v.key ? 'bg-[#111111] text-white' : 'text-[#6B6B6B] hover:bg-white'}`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Table View */}
      {view === 'table' && (
        <div className="pop-card overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState icon="contacts" title="No contacts found" description="Try adjusting your search or filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr className="border-b border-[#E8E4DF]">
                    {columns.map((col, i) => (
                      <th key={col.key} style={{ width: col.width }} className="relative px-4 py-3 text-left select-none">
                        <button onClick={() => col.sortable && toggleSort(col.key)}
                          className="flex items-center gap-1 text-[11px] font-medium text-[#9B9B8F] tracking-wide hover:text-[#111111] transition-colors whitespace-nowrap">
                          {col.label}
                          {col.sortable && sortField === col.key && <ArrowUpDown size={10} className="text-[#111111]" />}
                        </button>
                        {i < columns.length - 1 && (
                          <div onMouseDown={(e) => handleResizeStart(i, e)}
                            className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-6 cursor-col-resize flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity z-10">
                            <GripVertical size={10} className="text-[#D4CFC8]" />
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(contact => (
                    <tr key={contact.id} onClick={() => openContactDrawer(contact.id, 'contacts')}
                      className="border-b border-[#F0EEEA] last:border-0 hover:bg-[#FAFAF8] transition-colors cursor-pointer group">

                      {/* Contact: avatar + handle + name + platform dot */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <img src={contact.avatar} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-[13px] font-semibold text-[#111111] truncate">{contact.handle}</p>
                              <PlatformDot platform={contact.platform} size={6} />
                            </div>
                            <p className="text-[11px] text-[#9B9B8F] truncate">{contact.name}</p>
                          </div>
                        </div>
                      </td>

                      {/* Intent: strongest badge */}
                      <td className="px-4 py-3.5">
                        <StatusPill status={contact.intent === 'conversion' ? 'strong offer intent' : contact.intent} />
                      </td>

                      {/* Stage */}
                      <td className="px-4 py-3.5">
                        <StatusPill status={contact.stage} />
                      </td>

                      {/* Relationship: soft */}
                      <td className="px-4 py-3.5">
                        <StatusPill status={contact.relationship === 'warm' ? 'warm fan' : contact.relationship === 'ready' ? 'ready to convert' : contact.relationship} />
                      </td>

                      {/* Active campaign */}
                      <td className="px-4 py-3.5">
                        {contact.campaigns.length > 0 ? (
                          <span className="text-[12px] text-[#111111]">{contact.campaigns[0].name}</span>
                        ) : (
                          <span className="text-[12px] text-[#9B9B8F]">—</span>
                        )}
                      </td>

                      {/* Last activity */}
                      <td className="px-4 py-3.5 text-[12px] text-[#9B9B8F]">
                        {contact.recentActions[0]?.time || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pipeline View */}
      {view === 'pipeline' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stageColumns.map(col => {
            const stageContacts = filtered.filter(c => c.stage === col.key);
            return (
              <div key={col.key} className={`pop-card ${col.color} border-t-[3px]`}>
                <div className="px-4 py-3 border-b border-[#E8E4DF] flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[#111111]">{col.label}</span>
                  <span className="text-[11px] text-[#9B9B8F] font-geist-mono">{stageContacts.length}</span>
                </div>
                <div className="p-3 space-y-2 min-h-[100px]">
                  {stageContacts.map(contact => (
                    <button key={contact.id} onClick={() => openContactDrawer(contact.id, 'pipeline')}
                      className="w-full bg-[#FAFAF8] rounded-xl p-3 border border-[#E8E4DF] hover:border-[#D4CFC8] transition-all text-left">
                      <div className="flex items-center gap-2">
                        <img src={contact.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                        <div className="flex-1 min-w-0"><p className="text-[12px] font-semibold text-[#111111] truncate">{contact.handle}</p></div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <PlatformDot platform={contact.platform} size={6} />
                        <StatusPill status={contact.intent === 'conversion' ? 'strong offer intent' : contact.intent} className="text-[9px]" />
                      </div>
                    </button>
                  ))}
                  {stageContacts.length === 0 && <p className="text-[11px] text-[#9B9B8F] text-center py-4">No contacts</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filter Drawer */}
      {showFilterDrawer && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-[rgba(17,17,17,0.2)]" onClick={() => setShowFilterDrawer(false)} />
          <div className="relative w-[360px] max-w-full bg-white h-full shadow-drawer z-10 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E4DF]">
              <h3 className="pop-card-title">Filters</h3>
              <button onClick={() => setShowFilterDrawer(false)} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all">
                <X size={18} className="text-[#6B6B6B]" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Platform */}
              <div>
                <p className="text-[12px] font-semibold text-[#111111] mb-2">Platform</p>
                <div className="flex flex-wrap gap-2">
                  {['instagram', 'tiktok', 'youtube', 'twitter'].map(p => (
                    <button key={p} onClick={() => setFilterPlatform(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium capitalize transition-all ${filterPlatform.includes(p) ? 'bg-[#111111] text-white' : 'bg-[#FAFAF8] text-[#6B6B6B] hover:bg-[#E8E4DF]'}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              {/* Intent */}
              <div>
                <p className="text-[12px] font-semibold text-[#111111] mb-2">Intent</p>
                <div className="flex flex-wrap gap-2">
                  {['conversion', 'pricing', 'collaboration', 'support', 'engagement', 'casual'].map(i => (
                    <button key={i} onClick={() => setFilterIntent(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium capitalize transition-all ${filterIntent.includes(i) ? 'bg-[#111111] text-white' : 'bg-[#FAFAF8] text-[#6B6B6B] hover:bg-[#E8E4DF]'}`}>
                      {i}
                    </button>
                  ))}
                </div>
              </div>
              {/* Relationship */}
              <div>
                <p className="text-[12px] font-semibold text-[#111111] mb-2">Relationship</p>
                <div className="flex flex-wrap gap-2">
                  {['warm', 'ready', 'engaged', 'new', 'subscriber', 'at-risk'].map(r => (
                    <button key={r} onClick={() => setFilterRelationship(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium capitalize transition-all ${filterRelationship.includes(r) ? 'bg-[#111111] text-white' : 'bg-[#FAFAF8] text-[#6B6B6B] hover:bg-[#E8E4DF]'}`}>
                      {r === 'warm' ? 'warm fan' : r === 'ready' ? 'ready to convert' : r}
                    </button>
                  ))}
                </div>
              </div>
              {/* Stage */}
              <div>
                <p className="text-[12px] font-semibold text-[#111111] mb-2">Campaign stage</p>
                <div className="flex flex-wrap gap-2">
                  {['discovered', 'engaged', 'interested', 'converted'].map(s => (
                    <button key={s} onClick={() => setFilterStage(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium capitalize transition-all ${filterStage.includes(s) ? 'bg-[#111111] text-white' : 'bg-[#FAFAF8] text-[#6B6B6B] hover:bg-[#E8E4DF]'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#E8E4DF] flex gap-2">
              <button onClick={() => { setFilterPlatform([]); setFilterRelationship([]); setFilterIntent([]); setFilterStage([]); }}
                className="pop-btn-tertiary flex-1">
                Clear all
              </button>
              <button onClick={() => setShowFilterDrawer(false)} className="pop-btn-primary flex-1">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
