import { Inbox, Users, FileText, Megaphone, Zap, BarChart3, Link2, MessageSquare, AlertTriangle, Search } from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  inbox: Inbox, contacts: Users, content: FileText, campaigns: Megaphone,
  automations: Zap, analytics: BarChart3, integrations: Link2,
  conversations: MessageSquare, search: Search, alert: AlertTriangle,
};

/**
 * A page with nothing in it yet, saying so usefully: what this place is
 * for, and the one action that starts filling it. Token-based now
 * (previously the Astryx EmptyState) with the same centered composition —
 * callers own their surrounding layout, so nothing forces this into a
 * giant bordered card.
 */
export default function EmptyState({ icon, title, description, action }: {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const Icon = iconMap[icon] || MessageSquare;
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
        <Icon size={22} className="text-foreground-subtle" />
      </div>
      <div className="max-w-[360px]">
        <h3 className="text-[17px] font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action && <div className="flex flex-wrap items-center justify-center gap-3">{action}</div>}
    </div>
  );
}
