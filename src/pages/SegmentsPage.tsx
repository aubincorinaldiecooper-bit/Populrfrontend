import { useNavigate } from 'react-router';
import { ArrowLeft, Users } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { segments, aiSegments } from '../data';

export default function SegmentsPage() {
  const navigate = useNavigate();
  const allSegments = [...aiSegments, ...segments];

  return (
    <div className="pop-page">
      <PageHeader
        title="Segments"
        subtitle="Groups of contacts based on behavior and intent."
        action={
          <button onClick={() => navigate('/contacts')} className="pop-btn-secondary">
            <ArrowLeft size={14} strokeWidth={2.5} />Back to contacts
          </button>
        }
      />
      {allSegments.length === 0 ? (
        <EmptyState
          icon="contacts"
          title="No segments yet"
          description="Segments will appear here once Populr identifies patterns in your contacts."
        />
      ) : (
        <div className="space-y-3">
          {allSegments.map(s => (
            <div key={s.id} className="pop-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#FAFAF8] flex items-center justify-center flex-shrink-0">
                    <Users size={18} className="text-[#6B6B6B]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-geist font-semibold text-[13px] text-[#111111] truncate">{s.name}</h3>
                    <p className="text-[11px] text-[#6B6B6B] mt-0.5">{s.description}</p>
                  </div>
                </div>
                <span className="text-[11px] text-[#6B6B6B] flex-shrink-0">{s.count} contacts</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
