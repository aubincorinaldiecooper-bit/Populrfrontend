import { useRef, useEffect } from 'react';
import { X, Bell } from 'lucide-react';
import gsap from 'gsap';

export default function NotificationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

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

  return (
    <>
      <div ref={backdropRef} onClick={onClose} className="fixed inset-0 bg-[rgba(17,17,17,0.3)] z-[60] opacity-0 pointer-events-none" style={{ pointerEvents: open ? 'auto' : 'none' }} />
      <div ref={drawerRef} className="fixed right-0 top-0 h-screen w-[400px] max-w-full bg-white z-[70] shadow-drawer flex flex-col" style={{ transform: 'translateX(100%)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E4DF]">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-[#111111]" />
            <span className="font-geist font-semibold text-sm text-[#111111]">Notifications</span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all"><X size={16} className="text-[#6B6B6B]" /></button>
        </div>
        {/* No notifications backend exists yet — showing an honest empty state
            rather than a fabricated feed. */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-2">
          <Bell size={22} className="text-[#9B9B8F]" />
          <p className="text-[13px] font-semibold text-[#111111]">No notifications</p>
          <p className="text-[12px] text-[#6B6B6B]">You&apos;re all caught up.</p>
        </div>
      </div>
    </>
  );
}
