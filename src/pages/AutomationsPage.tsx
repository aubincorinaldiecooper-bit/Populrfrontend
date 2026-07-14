import { Link } from 'react-router';
import { Plus, Zap } from 'lucide-react';
import { automations } from '../data';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import StatusPill from '../components/StatusPill';

export default function AutomationsPage() {
  return (
    <div className="pop-page">
      <PageHeader
        title="Automations"
        subtitle="Automated response flows across your platforms."
        action={
          <Link to="/automations/new" className="pop-btn-primary">
            <Plus size={14} strokeWidth={2.5} />Create automation
          </Link>
        }
      />

      {automations.length === 0 ? (
        <EmptyState
          icon="automations"
          title="No automations yet"
          description="Create your first automation to start responding automatically."
          action={<Link to="/automations/new" className="pop-btn-primary">Create automation</Link>}
        />
      ) : (
        <div className="space-y-3">
          {automations.map(a => (
            <div key={a.id} className="pop-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${a.status === 'active' ? 'bg-chartreuse' : 'bg-[#FAFAF8]'}`}>
                    <Zap size={18} className={a.status === 'active' ? 'text-[#111111]' : 'text-[#6B6B6B]'} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-geist font-semibold text-[13px] text-[#111111] truncate">{a.name}</h3>
                      <StatusPill status={a.status} className="text-[10px]" />
                    </div>
                    <p className="text-[11px] text-[#6B6B6B] mt-0.5">{a.trigger} → {a.action}</p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-3 text-[11px] text-[#6B6B6B] flex-shrink-0">
                  <span>{a.contactsReached} reached</span>
                  <span>{a.conversions} conv.</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
