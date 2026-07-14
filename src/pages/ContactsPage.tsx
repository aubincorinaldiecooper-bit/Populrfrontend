import { useState } from 'react';
import { Search } from 'lucide-react';
import { contacts } from '../data';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import PlatformDot from '../components/PlatformDot';
import StatusPill from '../components/StatusPill';

export default function ContactsPage() {
  const { openContactDrawer } = useApp();
  const [search, setSearch] = useState('');

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q);
  });

  return (
    <div className="pop-page">
      <PageHeader
        title="Contacts"
        subtitle="Everyone Populr has identified across your platforms."
      />

      <div className="relative w-full sm:max-w-[280px] mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..."
          className="pop-search w-full" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="contacts" title="No contacts found" description="Try a different search." />
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <div key={c.id} className="pop-card p-4 pop-card-hover cursor-pointer" onClick={() => openContactDrawer(c.id, 'contacts')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img src={c.avatar} alt={c.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-geist font-semibold text-[13px] text-[#111111] truncate">{c.name}</h3>
                      <PlatformDot platform={c.platform} />
                    </div>
                    <p className="text-[11px] text-[#6B6B6B] mt-0.5">{c.handle}</p>
                  </div>
                </div>
                <StatusPill status={c.relationship} className="text-[10px] flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
