export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', validating: 'Checking', ready: 'Ready', scheduled: 'Scheduled',
  publishing: 'Publishing', partially_published: 'Partially published', published: 'Published',
  failed: 'Failed', cancelled: 'Cancelled',
  pending: 'Preparing', uploading: 'Uploading',
};

export const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-[#F3F4F6] text-[#6B7280]',
  validating: 'bg-[#FFF3E0] text-[#D97706]',
  ready: 'bg-[#EFF6FF] text-[#3B82F6]',
  scheduled: 'bg-[#FFF3E0] text-[#D97706]',
  publishing: 'bg-[#FFF3E0] text-[#D97706]',
  partially_published: 'bg-[#FFF3E0] text-[#D97706]',
  published: 'bg-[#E0F5E9] text-[#059669]',
  failed: 'bg-[#FEE2E2] text-[#DC2626]',
  cancelled: 'bg-[#F3F4F6] text-[#6B7280]',
  pending: 'bg-[#F3F4F6] text-[#6B7280]',
  uploading: 'bg-[#FFF3E0] text-[#D97706]',
};

interface PostTiming {
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
}

export function timeLabel(post: PostTiming): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  if (post.status === 'scheduled' && post.scheduled_at) return `Scheduled for ${new Date(post.scheduled_at).toLocaleString(undefined, opts)}`;
  if (post.published_at) return `Published ${new Date(post.published_at).toLocaleString(undefined, opts)}`;
  return `Created ${new Date(post.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
