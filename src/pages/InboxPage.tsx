import { useState } from 'react';
import {
  Search, Users, Zap, Send, Pause, RotateCcw, Plus, MessageSquare,
} from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { contacts, conversations } from '../data';
import { useApp } from '../context/AppContext';
import PlatformDot from '../components/PlatformDot';
import StatusPill from '../components/StatusPill';

type FilterStatus = 'all' | 'unread' | 'needs-attention' | 'automated' | 'resolved';

const STATUS_FILTERS: { key: FilterStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'needs-attention', label: 'Needs attention' },
  { key: 'automated', label: 'Automated' },
  { key: 'resolved', label: 'Resolved' },
];

export default function InboxPage() {
  const { openContactDrawer, showToast } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [pausedAutomations, setPausedAutomations] = useState<Set<string>>(new Set());

  const filtered = conversations.filter(conv => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const contact = contacts.find(c => c.id === conv.contactId);
      if (!contact) return false;
      if (!contact.handle.toLowerCase().includes(q) && !conv.lastMessage.toLowerCase().includes(q)) return false;
    }
    if (statusFilter === 'unread') return conv.unread;
    if (statusFilter === 'needs-attention') return conv.needsAttention;
    if (statusFilter === 'automated') return conv.isAutomated;
    if (statusFilter === 'resolved') return !conv.unread && !conv.needsAttention;
    return true;
  });

  const activeConv = conversations.find(c => c.id === selectedConv);
  const activeContact = activeConv ? contacts.find(c => c.id === activeConv.contactId) : null;

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedConv) return;
    if (activeConv?.isAutomated && !pausedAutomations.has(selectedConv)) {
      setPausedAutomations(prev => new Set(prev).add(selectedConv));
    }
    showToast('Reply sent', 'success');
    setReplyText('');
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    showToast('Note added', 'success');
    setNoteText('');
    setShowNoteInput(false);
  };

  return (
    <div className="pop-page h-full flex flex-col max-w-[1400px]">
      {/* Sticky Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 pb-4 border-b border-[#E8E4DF]">
        <TextInput
          label="Search conversations" isLabelHidden value={searchQuery} onChange={setSearchQuery}
          placeholder="Search conversations..." startIcon={<Search size={16} />}
          className="w-full sm:max-w-[320px]"
        />
        <div className="overflow-x-auto w-full sm:w-auto">
          <TabList value={statusFilter} onChange={v => setStatusFilter(v as FilterStatus)}>
            {STATUS_FILTERS.map(f => (
              <Tab key={f.key} value={f.key} label={f.label} />
            ))}
          </TabList>
        </div>
      </div>

      {/* Three-column layout */}
      <div className="flex-1 flex gap-0 -mx-6 lg:-mx-8 min-h-0">
        {/* Conversation List */}
        <div className="w-[340px] flex-shrink-0 border-r border-[#E8E4DF] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare size={32} className="text-[#E8E4DF] mx-auto mb-3" />
              <p className="text-sm text-[#6B6B6B]">No conversations match.</p>
            </div>
          ) : (
            filtered.map(conv => {
              const contact = contacts.find(c => c.id === conv.contactId);
              if (!contact) return null;
              return (
                <button key={conv.id} onClick={() => setSelectedConv(conv.id)}
                  className={`w-full flex items-start gap-3 p-4 text-left transition-all border-b border-[#E8E4DF] hover:bg-[#FAFAF8] ${selectedConv === conv.id ? 'bg-[#FAFAF8] border-l-[3px] border-l-chartreuse' : ''}`}>
                  <div className="relative flex-shrink-0 self-start">
                    <img src={contact.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                    {conv.unread && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-coral rounded-full border-2 border-cream" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[13px] truncate ${conv.unread ? 'font-semibold text-[#111111]' : 'text-[#111111]'}`}>{contact.handle}</span>
                      <span className="text-[11px] text-[#9B9B8F] flex-shrink-0">{conv.time}</span>
                    </div>
                    <p className={`text-[12px] truncate mt-0.5 ${conv.unread ? 'text-[#111111] font-medium' : 'text-[#6B6B6B]'}`}>{conv.lastMessage}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <PlatformDot platform={contact.platform} size={6} />
                      {conv.needsAttention && <StatusPill status="needs-attention" className="text-[9px]" />}
                      {conv.isAutomated && <span className="text-[9px] text-[#059669] bg-[#E0F5E9] px-1.5 py-0.5 rounded-full">Auto</span>}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Active Conversation */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-[#E8E4DF]">
          {activeConv && activeContact ? (
            <>
              <div className="px-5 py-3 border-b border-[#E8E4DF] bg-white flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button onClick={() => openContactDrawer(activeContact.id, 'inbox')} className="hover:ring-2 hover:ring-chartreuse rounded-full transition-all">
                      <img src={activeContact.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-[#111111]">{activeContact.handle}</span>
                        <PlatformDot platform={activeContact.platform} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <StatusPill status={activeConv.intent} className="text-[9px]" />
                        {activeConv.isAutomated && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${pausedAutomations.has(activeConv.id) ? 'bg-[#FFF3E0] text-[#D97706]' : 'bg-[#E0F5E9] text-[#059669]'}`}>
                            {pausedAutomations.has(activeConv.id) ? 'Automation paused' : 'Automated'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {activeContact.campaigns.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[#E8E4DF] flex items-center gap-2 text-[11px] text-[#6B6B6B]">
                    <Zap size={10} className="text-[#D97706]" />
                    <span>{activeContact.campaigns[0].name} · {activeContact.campaigns[0].stage}</span>
                    <span className="text-[#9B9B8F]">· {activeContact.stage}</span>
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-cream">
                {activeConv.messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.from === 'contact' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed ${msg.from === 'contact'
                      ? 'bg-[#111111] text-white rounded-br-sm'
                      : 'bg-white text-[#111111] border border-[#E8E4DF] rounded-bl-sm'}`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {pausedAutomations.has(activeConv.id) && (
                  <div className="flex justify-center">
                    <span className="text-[10px] text-[#D97706] bg-[#FFF3E0] px-3 py-1 rounded-full">
                      Automation paused while you reply
                    </span>
                  </div>
                )}
              </div>

              {/* Reply area */}
              <div className="px-4 py-3 border-t border-[#E8E4DF] bg-white flex-shrink-0">
                {showNoteInput ? (
                  <div className="space-y-2">
                    <TextArea
                      label="Internal note" isLabelHidden value={noteText} onChange={setNoteText}
                      placeholder="Add an internal note..." rows={3}
                    />
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" label="Add note" onClick={handleAddNote} />
                      <Button variant="secondary" size="sm" label="Cancel" onClick={() => setShowNoteInput(false)} />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <TextInput
                      label="Reply" isLabelHidden value={replyText} onChange={setReplyText}
                      onKeyDown={e => { if (e.key === 'Enter') handleSendReply(); }}
                      placeholder="Type your reply..." className="flex-1"
                    />
                    <Button variant="ghost" isIconOnly icon={<Plus size={18} />} label="Add note" onClick={() => setShowNoteInput(true)} />
                    <Button variant="primary" isIconOnly icon={<Send size={16} />} label="Send reply" isDisabled={!replyText.trim()} onClick={handleSendReply} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare size={40} className="text-[#E8E4DF] mx-auto mb-3" />
                <p className="text-sm text-[#6B6B6B]">Select a conversation to view messages</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Context */}
        <div className="w-[260px] flex-shrink-0 overflow-y-auto hidden lg:block">
          {activeContact && (
            <div className="p-4 space-y-4">
              <div className="text-center">
                <button onClick={() => openContactDrawer(activeContact.id, 'inbox')} className="hover:ring-2 hover:ring-chartreuse rounded-full transition-all inline-block">
                  <img src={activeContact.avatar} alt="" className="w-16 h-16 rounded-full object-cover mx-auto" />
                </button>
                <p className="font-geist font-bold text-sm text-[#111111] mt-2">{activeContact.handle}</p>
                <p className="text-[11px] text-[#6B6B6B]">{activeContact.name}</p>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <PlatformDot platform={activeContact.platform} />
                  <span className="text-[10px] text-[#6B6B6B] capitalize">{activeContact.platform}</span>
                </div>
              </div>

              <div className="bg-white rounded-xl p-3 border border-[#E8E4DF]">
                <p className="text-[10px] text-[#9B9B8F] uppercase tracking-wider mb-1.5">Intent</p>
                <StatusPill status={activeConv?.intent || 'engagement'} className="text-[10px]" />
                {activeConv?.needsAttention && <p className="text-[11px] text-coral mt-1.5">Reply recommended</p>}
              </div>

              <div className="bg-white rounded-xl p-3 border border-[#E8E4DF]">
                <p className="text-[10px] text-[#9B9B8F] uppercase tracking-wider mb-1.5">Relationship</p>
                <StatusPill status={activeContact.relationship === 'warm' ? 'warm fan' : activeContact.relationship} className="text-[10px]" />
              </div>

              {activeContact.campaigns.length > 0 && (
                <div className="bg-white rounded-xl p-3 border border-[#E8E4DF]">
                  <p className="text-[10px] text-[#9B9B8F] uppercase tracking-wider mb-1.5">Campaign</p>
                  <p className="text-[12px] font-medium text-[#111111]">{activeContact.campaigns[0].name}</p>
                  <p className="text-[11px] text-[#6B6B6B]">{activeContact.campaigns[0].stage}</p>
                </div>
              )}

              <div className="space-y-2">
                {activeConv?.isAutomated && !pausedAutomations.has(activeConv.id) && (
                  <Button
                    variant="secondary" size="sm" label="Pause automation" icon={<Pause size={14} />} width="100%"
                    onClick={() => { if (activeConv) setPausedAutomations(prev => new Set(prev).add(activeConv.id)); showToast('Automation paused', 'info'); }}
                  />
                )}
                {activeConv?.isAutomated && pausedAutomations.has(activeConv.id) && (
                  <Button
                    variant="primary" size="sm" label="Resume automation" icon={<RotateCcw size={14} />} width="100%"
                    onClick={() => { if (activeConv) setPausedAutomations(prev => { const n = new Set(prev); n.delete(activeConv.id); return n; }); showToast('Automation resumed', 'success'); }}
                  />
                )}
                <Button variant="secondary" size="sm" label="View profile" icon={<Users size={14} />} width="100%" onClick={() => openContactDrawer(activeContact.id, 'inbox')} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
