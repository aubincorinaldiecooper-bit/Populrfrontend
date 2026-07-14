import { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { X, Bell, TrendingUp, AlertTriangle, Lightbulb, Settings } from 'lucide-react';
import { notifications } from '../data';
import gsap from 'gsap';

const typeIcons: Record<string, { icon: React.ElementType; color: string }> = {
  opportunity: { icon: TrendingUp, color: 'text-[#059669] bg-[#E0F5E9]' },
  alert: { icon: AlertTriangle, color: 'text-[#DC2626] bg-[#FEE2E2]' },
  insight: { icon: Lightbulb, color: 'text-[#D97706] bg-[#FFF3E0]' },
  system: { icon: Settings, color: 'text-[#6B6B6B] bg-[#FAFAF8]' },
};

export default function NotificationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!drawerRef.current || !backdropRef.current) return;
    if (open) {
      gsap.to(backdropRef.current, { opacity: 1, duration: 0.2 });
      gsap.to(drawerRef.current, { x: 0, duration: 0.3, ease: 'power3.out' });
    } else {
      gsap.to(backdropRef.current, { opacity: 0, duration: 0.2 });
      gsap.to(drawerRef.current, { x: '100%', duration: 0.25, ease: 'power3.in' });
    }
  }, [open]);

  const handleClick = (link?: string) => {
    onClose();
    if (link) navigate(link);
  };

  const unread = notifications.filter(n => !n.read);

  return (
    <>
      <div ref={backdropRef} onClick={onClose} className="fixed inset-0 bg-[rgba(17,17,17,0.3)] z-[60] opacity-0 pointer-events-none" style={{ pointerEvents: open ? 'auto' : 'none' }} />
      <div ref={drawerRef} className="fixed right-0 top-0 h-screen w-[400px] max-w-full bg-white z-[70] shadow-drawer flex flex-col" style={{ transform: 'translateX(100%)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E4DF]">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-[#111111]" />
            <span className="font-geist font-semibold text-sm text-[#111111]">Notifications</span>
            {unread.length > 0 && <span className="bg-coral text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unread.length}</span>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all"><X size={16} className="text-[#6B6B6B]" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notifications.map(n => {
            const t = typeIcons[n.type] || typeIcons.system;
            const Icon = t.icon;
            return (
              <button key={n.id} onClick={() => handleClick(n.link)}
                className={`w-full text-left px-5 py-4 border-b border-[#E8E4DF] hover:bg-[#FAFAF8] transition-all ${!n.read ? 'bg-[rgba(200,255,61,0.03)]' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${t.color}`}><Icon size={14} /></div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] ${!n.read ? 'font-semibold text-[#111111]' : 'font-medium text-[#111111]'}`}>{n.title}</p>
                    <p className="text-[12px] text-[#6B6B6B] mt-0.5">{n.message}</p>
                    <p className="text-[11px] text-[#9B9B8F] mt-1">{n.time}</p>
                  </div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-chartreuse flex-shrink-0 mt-1.5" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
