import { useRef, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { resolveIdentity, initialsFrom } from '../lib/identity';
import {
  X, Megaphone, ChevronDown, ChevronUp, Tag, Plus, Check, XCircle,
  MessageSquare, GitMerge, FileText, Clock, Sparkles, User,
  Bookmark, Zap, ArrowRight, Loader2, Search as SearchIcon,
} from 'lucide-react';
import { intentLabels, suggestedActionByIntent } from '../data';
import type { TimelineEvent } from '../data';
import PlatformDot from './PlatformDot';
import StatusPill from './StatusPill';
import gsap from 'gsap';

const ALL_TAGS = ['warm-fan', 'style-guide', 'collaboration', 'pricing', 'ready-to-convert', 'subscriber', 'engaged', 'new', 'newsletter', 'high-intent', 'at-risk', 'dormant'];

export default function ContactProfileDrawer() {
  const {
    selectedContactId, closeContactDrawer, contactDrawerContext, contacts,
    addContactNote, addContactToCampaign, updateContactTags, mergeContacts,
    showToast, campaigns, accounts,
  } = useApp();
  const { user } = useAuth();
  const identity = resolveIdentity(user, accounts);

  const contact = contacts.find(c => c.id === selectedContactId);
  const drawerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // UI state
  const [showEvidence, setShowEvidence] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [noteText, setNoteText] = useState('');
  const [showAddToCampaign, setShowAddToCampaign] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState('');
  const [selectedCampaignStage, setSelectedCampaignStage] = useState('Interested');
  const [addingCampaign, setAddingCampaign] = useState(false);
  const [showMergePanel, setShowMergePanel] = useState(false);
  const [showCollectedInfo, setShowCollectedInfo] = useState(true);

  const stageOptions = ['Discovered', 'Engaged', 'Interested', 'Converted'];

  useEffect(() => {
    if (drawerRef.current && backdropRef.current) {
      gsap.to(backdropRef.current, { opacity: 1, duration: 0.25 });
      gsap.to(drawerRef.current, { x: '0%', duration: 0.35, ease: 'power3.out' });
    }
    return () => {
      if (drawerRef.current) gsap.to(drawerRef.current, { x: '100%', duration: 0.25, ease: 'power3.in' });
    };
  }, []);

  const handleClose = () => {
    if (drawerRef.current) gsap.to(drawerRef.current, { x: '100%', duration: 0.25, ease: 'power3.in' });
    if (backdropRef.current) gsap.to(backdropRef.current, { opacity: 0, duration: 0.2, onComplete: closeContactDrawer });
    else closeContactDrawer();
  };

  if (!contact) return null;

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addContactNote(contact.id, {
      text: noteText.trim(),
      author: identity.name,
      authorAvatar: identity.avatarUrl ?? '',
      createdAt: 'Just now',
    });
    setNoteText('');
    showToast('Note saved', 'success');
  };

  const handleToggleTag = (tag: string) => {
    const current = contact.tags || [];
    const updated = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag];
    updateContactTags(contact.id, updated);
  };

  const handleAddToCampaign = (campaignName: string) => {
    setAddingCampaign(true);
    setTimeout(() => {
      addContactToCampaign(contact.id, campaignName, selectedCampaignStage);
      setAddingCampaign(false);
      setShowAddToCampaign(false);
      setCampaignSearch('');
      showToast(`${contact.handle} added to ${campaignName}`, 'success');
    }, 600);
  };

  const availableCampaigns = campaigns.filter(c =>
    !contact.campaigns.some(cc => cc.name === c.name) &&
    (campaignSearch === '' || c.name.toLowerCase().includes(campaignSearch.toLowerCase()))
  );

  const filteredTags = ALL_TAGS.filter(t =>
    !contact.tags?.includes(t) && (tagSearch === '' || t.includes(tagSearch.toLowerCase()))
  );

  const suggestedAction = contact.suggestedAction || suggestedActionByIntent[contact.intent] || 'Review their profile and follow up';

  // Determine contextual primary action
  const isFromInbox = contactDrawerContext === 'inbox';
  const primaryActionLabel = isFromInbox ? 'Start message' : 'Open conversation';

  const timelineEvents: TimelineEvent[] = contact.timeline || [];

  const timelineIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'action': return <Zap size={12} className="text-chartreuse" />;
      case 'note': return <FileText size={12} className="text-[#7C3AED]" />;
      case 'campaign': return <Megaphone size={12} className="text-[#D97706]" />;
      case 'intent': return <Sparkles size={12} className="text-[#059669]" />;
      case 'merge': return <GitMerge size={12} className="text-[#6B6B6B]" />;
      default: return <Clock size={12} className="text-[#9B9B8F]" />;
    }
  };

  return (
    <>
      <div ref={backdropRef} onClick={handleClose} className="fixed inset-0 bg-[rgba(17,17,17,0.3)] z-[60] opacity-0" />
      <div ref={drawerRef} className="fixed right-0 top-0 h-screen w-[520px] max-w-full bg-white z-[70] shadow-drawer flex flex-col overflow-hidden" style={{ transform: 'translateX(100%)' }}>

        {/* ─── HEADER ─── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E4DF] flex-shrink-0">
          <div className="flex items-center gap-3">
            <img src={contact.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
            <div>
              <p className="text-[13px] font-semibold text-[#111111]">{contact.name}</p>
              <p className="text-[11px] text-[#6B6B6B]">{contact.handle}</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all">
            <X size={18} className="text-[#6B6B6B]" />
          </button>
        </div>

        {/* ─── SCROLLABLE CONTENT ─── */}
        <div className="flex-1 overflow-y-auto">

          {/* Hero */}
          <div className="px-6 py-5 text-center border-b border-[#E8E4DF]">
            <img src={contact.avatar} alt="" className="w-20 h-20 rounded-full object-cover mx-auto" />
            <p className="font-geist font-bold text-lg text-[#111111] mt-3">{contact.name}</p>
            <p className="text-sm text-[#6B6B6B]">{contact.handle}</p>
            {contact.bio && <p className="text-xs text-[#9B9B8F] mt-1">{contact.bio}</p>}
            <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
              <span className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#FAFAF8]">
                <PlatformDot platform={contact.platform} size={8} />{contact.platform}
              </span>
              {contact.connectedPlatforms?.map(p => (
                <span key={p} className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#FAFAF8] text-[#6B6B6B]">
                  <PlatformDot platform={p} size={6} />{p}
                </span>
              ))}
              {contact.assignedTo && (
                <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#E0F5E9] text-[#059669]">
                  <User size={10} />{contact.assignedTo}
                </span>
              )}
            </div>
          </div>

          {/* Intent with Evidence */}
          <div className="px-6 py-4 border-b border-[#E8E4DF]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-[#059669]" />
                <span className="text-[12px] font-semibold text-[#111111]">Intent</span>
              </div>
              <button onClick={() => setShowEvidence(!showEvidence)} className="flex items-center gap-1 text-[11px] text-[#6B6B6B] hover:text-[#111111] transition-colors">
                {showEvidence ? <><ChevronUp size={12} />Hide evidence</> : <><ChevronDown size={12} />Explain this</>}
              </button>
            </div>
            <StatusPill status={contact.intent === 'conversion' ? 'strong offer intent' : contact.intent} className="mb-1" />
            <p className="text-[11px] text-[#6B6B6B] mt-1">{intentLabels[contact.intent]}</p>

            {showEvidence && contact.intentEvidence && (
              <div className="mt-3 bg-[#FAFAF8] rounded-xl p-4 space-y-2 animate-fade-in">
                <p className="text-[11px] font-medium text-[#111111] mb-2">Why this intent was assigned:</p>
                {contact.intentEvidence.signals.map((signal, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-chartreuse flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check size={12} className="text-[#111111]" />
                    </div>
                    <p className="text-[12px] text-[#6B6B6B]">{signal}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Campaign Participation */}
          <div className="px-6 py-4 border-b border-[#E8E4DF]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Megaphone size={14} className="text-[#D97706]" />
                <span className="text-[12px] font-semibold text-[#111111]">Campaigns</span>
              </div>
              <button onClick={() => setShowAddToCampaign(true)} className="text-[11px] font-medium text-[#7C3AED] hover:text-[#111111] transition-colors flex items-center gap-1">
                <Plus size={12} />Add
              </button>
            </div>
            {contact.campaigns.length > 0 ? (
              <div className="space-y-2">
                {contact.campaigns.map((camp, i) => (
                  <div key={i} className="flex items-center justify-between bg-[#FAFAF8] rounded-lg px-3 py-2.5">
                    <span className="text-[12px] text-[#111111] font-medium">{camp.name}</span>
                    <StatusPill status={camp.stage.toLowerCase()} className="text-[10px]" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-[#9B9B8F]">Not in any campaigns yet</p>
            )}
          </div>

          {/* Tags */}
          <div className="px-6 py-4 border-b border-[#E8E4DF]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Tag size={14} className="text-[#7C3AED]" />
                <span className="text-[12px] font-semibold text-[#111111]">Tags</span>
              </div>
              <button onClick={() => { setEditingTags(!editingTags); setTagSearch(''); }} className="text-[11px] font-medium text-[#7C3AED] hover:text-[#111111] transition-colors">
                {editingTags ? 'Done' : 'Edit'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(contact.tags || []).map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full bg-[#FAFAF8] text-[#6B6B6B] capitalize">
                  {tag.replace(/-/g, ' ')}
                  {editingTags && (
                    <button onClick={() => handleToggleTag(tag)} className="hover:text-[#DC2626] transition-colors">
                      <XCircle size={10} />
                    </button>
                  )}
                </span>
              ))}
              {editingTags && (
                <div className="w-full mt-2">
                  <input
                    type="text" value={tagSearch} onChange={e => setTagSearch(e.target.value)}
                    placeholder="Search tags..."
                    className="w-full border border-[#E8E4DF] rounded-lg px-3 py-2 text-[11px] placeholder:text-[#9B9B8F] focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all mb-2"
                  />
                  {filteredTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {filteredTags.map(tag => (
                        <button key={tag} onClick={() => handleToggleTag(tag)}
                          className="text-[10px] font-medium px-2 py-1 rounded-full border border-dashed border-[#D4CFC8] text-[#6B6B6B] hover:border-chartreuse hover:text-[#111111] transition-all capitalize">
                          + {tag.replace(/-/g, ' ')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Suggested Next Action */}
          <div className="px-6 py-4 border-b border-[#E8E4DF] bg-[#FFFDF5]">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-chartreuse flex items-center justify-center flex-shrink-0">
                <ArrowRight size={14} className="text-[#111111]" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-[#111111] uppercase tracking-wider mb-1">Suggested next action</p>
                <p className="text-[13px] text-[#111111]">{suggestedAction}</p>
              </div>
            </div>
          </div>

          {/* Interaction Timeline */}
          {timelineEvents.length > 0 && (
            <div className="px-6 py-5 border-b border-[#E8E4DF]">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={14} className="text-[#6B6B6B]" />
                <span className="text-[12px] font-semibold text-[#111111]">Interaction history</span>
              </div>
              <div className="relative pl-4 space-y-4">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#E8E4DF]" />
                {timelineEvents.map(event => (
                  <div key={event.id} className="relative flex items-start gap-3">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white bg-[#FAFAF8] flex items-center justify-center flex-shrink-0 mt-0.5 z-10">
                      {timelineIcon(event.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-medium text-[#111111]">{event.title}</p>
                        <span className="text-[10px] text-[#9B9B8F]">{event.time}</span>
                      </div>
                      <p className="text-[11px] text-[#6B6B6B] mt-0.5">{event.description}</p>
                      {event.author && (
                        <div className="flex items-center gap-1.5 mt-1">
                          {event.authorAvatar ? (
                            <img src={event.authorAvatar} alt="" className="w-4 h-4 rounded-full" />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-[#E8E4DF] flex items-center justify-center text-[7px] font-semibold text-[#6B6B6B]">
                              {initialsFrom(event.author)}
                            </div>
                          )}
                          <span className="text-[10px] text-[#9B9B8F]">{event.author}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Collected Information */}
          {contact.collectedInfo && contact.collectedInfo.length > 0 && (
            <div className="px-6 py-4 border-b border-[#E8E4DF]">
              <button onClick={() => setShowCollectedInfo(!showCollectedInfo)} className="flex items-center justify-between w-full mb-3">
                <div className="flex items-center gap-2">
                  <Bookmark size={14} className="text-[#3B82F6]" />
                  <span className="text-[12px] font-semibold text-[#111111]">Collected information</span>
                </div>
                {showCollectedInfo ? <ChevronUp size={14} className="text-[#6B6B6B]" /> : <ChevronDown size={14} className="text-[#6B6B6B]" />}
              </button>
              {showCollectedInfo && (
                <div className="space-y-2 animate-fade-in">
                  {contact.collectedInfo.map((info, i) => (
                    <div key={i} className="flex items-center justify-between bg-[#FAFAF8] rounded-lg px-3 py-2.5">
                      <div>
                        <p className="text-[11px] font-medium text-[#111111]">{info.field}</p>
                        <p className="text-[11px] text-[#6B6B6B]">{info.value}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-[#9B9B8F]">From {info.source}</p>
                        <p className="text-[9px] text-[#9B9B8F]">{info.collectedAt}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Internal Notes */}
          <div className="px-6 py-5">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={14} className="text-[#6B6B6B]" />
              <span className="text-[12px] font-semibold text-[#111111]">Internal notes</span>
              <span className="text-[10px] text-[#9B9B8F]">Visible to your team only</span>
            </div>

            {/* Existing notes */}
            <div className="space-y-3 mb-4">
              {contact.notes.map(note => (
                <div key={note.id} className="bg-[#FAFAF8] rounded-xl p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    {note.authorAvatar ? (
                      <img src={note.authorAvatar} alt="" className="w-5 h-5 rounded-full" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-[#E8E4DF] flex items-center justify-center text-[8px] font-semibold text-[#6B6B6B]">
                        {initialsFrom(note.author)}
                      </div>
                    )}
                    <span className="text-[11px] font-medium text-[#111111]">{note.author}</span>
                    <span className="text-[10px] text-[#9B9B8F]">{note.createdAt}</span>
                  </div>
                  <p className="text-[12px] text-[#6B6B6B] leading-relaxed">{note.text}</p>
                </div>
              ))}
              {contact.notes.length === 0 && (
                <p className="text-[11px] text-[#9B9B8F] italic">No notes yet. Add one below.</p>
              )}
            </div>

            {/* Add note */}
            <div className="flex gap-2">
              <input
                type="text" value={noteText} onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddNote(); }}
                placeholder="Add a note..."
                className="flex-1 border border-[#E8E4DF] rounded-xl px-3 py-2.5 text-[12px] placeholder:text-[#9B9B8F] focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all"
              />
              <button onClick={handleAddNote} disabled={!noteText.trim()}
                className={`px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-all ${noteText.trim() ? 'bg-chartreuse text-[#111111] hover:bg-chartreuse-hover' : 'bg-[#E8E4DF] text-[#9B9B8F] cursor-not-allowed'}`}>
                Add
              </button>
            </div>
          </div>
        </div>

        {/* ─── FOOTER ACTIONS ─── */}
        <div className="px-6 py-4 border-t border-[#E8E4DF] bg-white flex gap-2 flex-shrink-0">
          <button className="flex-1 flex items-center justify-center gap-2 bg-[#111111] text-white rounded-[10px] py-3 text-[13px] font-semibold hover:bg-[#333] transition-all">
            <MessageSquare size={14} />{primaryActionLabel}
          </button>
          <button onClick={() => setShowAddToCampaign(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-chartreuse text-[#111111] rounded-[10px] py-3 text-[13px] font-semibold hover:bg-chartreuse-hover transition-all">
            <Megaphone size={14} />Add to campaign
          </button>
          <button onClick={() => setShowMergePanel(!showMergePanel)}
            className="p-3 border border-[#E8E4DF] rounded-[10px] text-[#6B6B6B] hover:text-[#111111] hover:bg-[#FAFAF8] transition-all"
            title="Merge contact">
            <GitMerge size={14} />
          </button>
        </div>

        {/* ─── ADD TO CAMPAIGN MODAL ─── */}
        {showAddToCampaign && (
          <div className="absolute inset-0 bg-white z-20 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E4DF]">
              <h3 className="font-geist font-bold text-base text-[#111111]">Add to campaign</h3>
              <button onClick={() => { setShowAddToCampaign(false); setCampaignSearch(''); }} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all">
                <X size={18} className="text-[#6B6B6B]" />
              </button>
            </div>
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              {/* Search campaigns */}
              <div className="relative">
                <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
                <input type="text" value={campaignSearch} onChange={e => setCampaignSearch(e.target.value)}
                  placeholder="Search campaigns..."
                  className="w-full border border-[#E8E4DF] rounded-xl pl-10 pr-4 py-3 text-[13px] placeholder:text-[#9B9B8F] focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all" />
              </div>

              {/* Stage selector */}
              <div>
                <label className="text-[12px] font-medium text-[#111111] mb-2 block">Set initial stage</label>
                <div className="flex gap-2">
                  {stageOptions.map(s => (
                    <button key={s} onClick={() => setSelectedCampaignStage(s)}
                      className={`px-3 py-2 rounded-lg text-[12px] font-medium transition-all ${selectedCampaignStage === s ? 'bg-[#111111] text-white' : 'bg-[#FAFAF8] text-[#6B6B6B] hover:bg-[#E8E4DF]'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Available campaigns */}
              <div className="space-y-2">
                <p className="text-[11px] font-medium text-[#9B9B8F] uppercase tracking-wider">
                  {availableCampaigns.length} available
                </p>
                {availableCampaigns.length > 0 ? availableCampaigns.map(camp => (
                  <button key={camp.id} onClick={() => handleAddToCampaign(camp.name)}
                    disabled={addingCampaign}
                    className="w-full flex items-center gap-3 border border-[#E8E4DF] rounded-xl p-4 text-left hover:border-chartreuse hover:bg-[#FAFAF8] transition-all">
                    <div className="w-9 h-9 rounded-lg bg-[#FAFAF8] flex items-center justify-center">
                      <Megaphone size={16} className="text-[#6B6B6B]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold text-[#111111]">{camp.name}</p>
                      <p className="text-[11px] text-[#6B6B6B]">{camp.goal} · {camp.platform}</p>
                    </div>
                    {addingCampaign ? <Loader2 size={16} className="text-[#D97706] animate-spin" /> : <Plus size={16} className="text-[#9B9B8F]" />}
                  </button>
                )) : (
                  <div className="text-center py-8">
                    <p className="text-[13px] text-[#6B6B6B]">No matching campaigns</p>
                    <p className="text-[11px] text-[#9B9B8F] mt-1">{contact.handle} is already in all your campaigns</p>
                  </div>
                )}
              </div>

              {/* Create new campaign link */}
              <button className="w-full flex items-center justify-center gap-2 border border-dashed border-[#D4CFC8] rounded-xl py-3 text-[13px] font-medium text-[#6B6B6B] hover:border-chartreuse hover:text-[#111111] transition-all">
                <Plus size={16} />Create a new campaign
              </button>
            </div>
          </div>
        )}

        {/* ─── MERGE PANEL ─── */}
        {showMergePanel && (
          <div className="absolute inset-0 bg-white z-20 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E4DF]">
              <h3 className="font-geist font-bold text-base text-[#111111]">Merge contact</h3>
              <button onClick={() => setShowMergePanel(false)} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all">
                <X size={18} className="text-[#6B6B6B]" />
              </button>
            </div>
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              <p className="text-[13px] text-[#6B6B6B]">Select another contact to merge with {contact.handle}. All tags, notes, and campaigns will be combined.</p>
              <div className="space-y-2">
                {contacts.filter(c => c.id !== contact.id).map(other => (
                  <button key={other.id}
                    onClick={() => { mergeContacts(contact.id, other.id); setShowMergePanel(false); showToast(`Merged with ${other.handle}`, 'success'); }}
                    className="w-full flex items-center gap-3 border border-[#E8E4DF] rounded-xl p-3 text-left hover:border-[#D97706] hover:bg-[#FFFDF5] transition-all">
                    <img src={other.avatar} alt="" className="w-10 h-10 rounded-full" />
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold text-[#111111]">{other.name}</p>
                      <p className="text-[11px] text-[#6B6B6B]">{other.handle} · {other.platform}</p>
                    </div>
                    <GitMerge size={16} className="text-[#D97706]" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
