import { Loader2 } from 'lucide-react';

export default function LoadingState() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="flex items-center gap-3 text-[#6B6B6B]">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm font-medium">Loading…</span>
      </div>
    </div>
  );
}
