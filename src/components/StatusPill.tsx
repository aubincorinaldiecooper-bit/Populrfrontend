const statusStyles: Record<string, string> = {
  // ─── General Status ───
  active: 'bg-[#E0F5E9] text-[#059669]',
  paused: 'bg-[#FFF3E0] text-[#D97706]',
  draft: 'bg-[#F3F4F6] text-[#6B7280]',
  completed: 'bg-[#E0F5E9] text-[#059669]',
  sent: 'bg-[#E0F5E9] text-[#059669]',
  scheduled: 'bg-[#FFF3E0] text-[#D97706]',
  'coming-soon': 'bg-[#FFF3E0] text-[#D97706]',
  connected: 'bg-[#E0F5E9] text-[#059669]',
  available: 'bg-[#F3F4F6] text-[#6B7280]',
  disconnected: 'bg-[#FEE2E2] text-[#DC2626]',
  syncing: 'bg-[#FFF3E0] text-[#D97706]',

  // ─── Intent (strongest signal) ───
  'strong offer intent': 'bg-[#FEE2E2] text-[#DC2626]',
  'intent-conversion': 'bg-[#FEE2E2] text-[#DC2626]',
  'pricing question': 'bg-[#FFF3E0] text-[#D97706]',
  'intent-pricing': 'bg-[#FFF3E0] text-[#D97706]',
  'collaboration request': 'bg-[#EFF6FF] text-[#3B82F6]',
  'intent-collaboration': 'bg-[#EFF6FF] text-[#3B82F6]',
  'support request': 'bg-[#F3F4F6] text-[#6B7280]',
  'reply recommended': 'bg-[#E0F5E9] text-[#059669]',
  'human-review': 'bg-[#FEE2E2] text-[#DC2626]',
  'intent-alert': 'bg-[#FFF3E0] text-[#D97706]',

  // ─── Relationship (soft) ───
  'warm fan': 'bg-[#E0F5E9] text-[#059669]',
  'ready to convert': 'bg-[#FFF3E0] text-[#D97706]',
  engaged: 'bg-[#EFF6FF] text-[#3B82F6]',
  subscriber: 'bg-[#E0F5E9] text-[#059669]',
  new: 'bg-[#F3F4F6] text-[#6B7280]',

  // ─── Stage ───
  discovered: 'bg-[#F3F4F6] text-[#6B7280]',
  interested: 'bg-[#FFF3E0] text-[#D97706]',
  converted: 'bg-[#E0F5E9] text-[#059669]',

  // ─── Special ───
  'needs-attention': 'bg-[#FEE2E2] text-[#DC2626]',
};

export default function StatusPill({ status, className = '' }: { status: string; className?: string }) {
  const style = statusStyles[status.toLowerCase()] || 'bg-[#F3F4F6] text-[#6B7280]';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap ${style} ${className}`}>
      {status}
    </span>
  );
}
