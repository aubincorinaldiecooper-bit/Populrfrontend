import { Heart, MessageCircle, Send, Bookmark, ThumbsUp, Repeat2, Share2 } from 'lucide-react';
import ProfileImage from '../ProfileImage';
import type { PostMediaItem, PostMediaType } from '../../lib/api';

export interface PreviewIdentity {
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  initials: string;
}

interface Props {
  platform: string;
  identity: PreviewIdentity;
  mediaType: PostMediaType;
  mediaItems: PostMediaItem[];
  caption: string;
}

function Avatar({ identity, size = 36 }: { identity: PreviewIdentity; size?: number }) {
  return (
    <ProfileImage
      src={identity.avatarUrl}
      className="rounded-full object-cover flex-shrink-0"
      style={{ width: size, height: size }}
      fallback={
        <div
          className="rounded-full bg-[#FAFAF8] border border-[#E8E4DF] flex items-center justify-center text-[11px] font-semibold text-[#6B6B6B] flex-shrink-0"
          style={{ width: size, height: size }}
        >
          {identity.initials}
        </div>
      }
    />
  );
}

function MediaArea({ mediaType, mediaItems, aspect }: { mediaType: PostMediaType; mediaItems: PostMediaItem[]; aspect: string }) {
  if (mediaType === 'text' || mediaItems.length === 0) return null;
  const first = mediaItems[0];
  return (
    <div className={`relative w-full overflow-hidden bg-[#111111]/5 ${aspect}`}>
      {first.mediaType === 'video' ? (
        <video src={first.url} className="w-full h-full object-cover" muted playsInline />
      ) : (
        <img src={first.url} alt="" className="w-full h-full object-cover" />
      )}
      {mediaType === 'carousel' && mediaItems.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1">
          {mediaItems.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === 0 ? 'w-3 bg-white' : 'w-1.5 bg-white/50'}`} />
          ))}
        </div>
      )}
      {mediaType === 'carousel' && mediaItems.length > 1 && (
        <span className="absolute top-2 right-2 bg-black/50 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full">1/{mediaItems.length}</span>
      )}
    </div>
  );
}

function InstagramPreview({ identity, mediaType, mediaItems, caption }: Omit<Props, 'platform'>) {
  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DF] overflow-hidden max-w-[380px] mx-auto">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar identity={identity} size={32} />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#111111] truncate">{identity.handle ?? identity.name}</p>
        </div>
        <span className="ml-auto text-[#6B6B6B] text-lg leading-none">···</span>
      </div>
      <MediaArea mediaType={mediaType} mediaItems={mediaItems} aspect="aspect-square" />
      <div className="flex items-center gap-3 px-3 pt-2.5 text-[#111111]">
        <Heart size={22} strokeWidth={1.75} />
        <MessageCircle size={22} strokeWidth={1.75} />
        <Send size={22} strokeWidth={1.75} />
        <Bookmark size={22} strokeWidth={1.75} className="ml-auto" />
      </div>
      <div className="px-3 pt-2 pb-3">
        <p className="text-[13px] text-[#111111] leading-snug">
          <span className="font-semibold">{identity.handle ?? identity.name}</span>{' '}
          {caption ? caption : <span className="text-[#9B9B8F]">Your caption will appear here.</span>}
        </p>
      </div>
    </div>
  );
}

function TikTokPreview({ identity, mediaType, mediaItems, caption }: Omit<Props, 'platform'>) {
  return (
    <div className="relative bg-[#111111] rounded-2xl overflow-hidden max-w-[280px] mx-auto aspect-[9/16]">
      {mediaType !== 'text' && mediaItems[0] ? (
        mediaItems[0].mediaType === 'video' ? (
          <video src={mediaItems[0].url} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        ) : (
          <img src={mediaItems[0].url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a1a1a] to-[#111111]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/10" />
      <div className="absolute right-2.5 bottom-16 flex flex-col items-center gap-4 text-white">
        <Avatar identity={identity} size={34} />
        <div className="flex flex-col items-center gap-0.5">
          <Heart size={26} fill="white" strokeWidth={0} />
          <span className="text-[10px] font-medium">0</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <MessageCircle size={26} fill="white" strokeWidth={0} />
          <span className="text-[10px] font-medium">0</span>
        </div>
        <Share2 size={24} fill="white" strokeWidth={0} />
      </div>
      <div className="absolute left-3 right-14 bottom-3 text-white">
        <p className="text-[13px] font-semibold">{identity.handle ?? identity.name}</p>
        <p className="text-[12px] leading-snug mt-1 line-clamp-3">
          {caption ? caption : <span className="text-white/60">Your caption will appear here.</span>}
        </p>
      </div>
    </div>
  );
}

function LinkedInPreview({ identity, mediaType, mediaItems, caption }: Omit<Props, 'platform'>) {
  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DF] overflow-hidden max-w-[420px] mx-auto">
      <div className="flex items-start gap-2.5 px-4 pt-4">
        <Avatar identity={identity} size={44} />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#111111] truncate">{identity.name}</p>
          {identity.handle && <p className="text-[11px] text-[#6B6B6B] truncate">{identity.handle}</p>}
          <p className="text-[11px] text-[#9B9B8F]">Now · 🌐</p>
        </div>
      </div>
      <div className="px-4 pt-2.5 pb-2">
        <p className="text-[13px] text-[#111111] leading-relaxed whitespace-pre-wrap">
          {caption ? caption : <span className="text-[#9B9B8F]">Your caption will appear here.</span>}
        </p>
      </div>
      <MediaArea mediaType={mediaType} mediaItems={mediaItems} aspect="aspect-[16/9]" />
      <div className="flex items-center gap-4 px-4 py-3 text-[#6B6B6B]">
        <span className="flex items-center gap-1.5 text-[12px] font-medium"><ThumbsUp size={17} strokeWidth={1.75} /> Like</span>
        <span className="flex items-center gap-1.5 text-[12px] font-medium"><MessageCircle size={17} strokeWidth={1.75} /> Comment</span>
        <span className="flex items-center gap-1.5 text-[12px] font-medium"><Repeat2 size={17} strokeWidth={1.75} /> Repost</span>
        <span className="flex items-center gap-1.5 text-[12px] font-medium"><Send size={17} strokeWidth={1.75} /> Send</span>
      </div>
    </div>
  );
}

function FacebookPreview({ identity, mediaType, mediaItems, caption }: Omit<Props, 'platform'>) {
  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DF] overflow-hidden max-w-[420px] mx-auto">
      <div className="flex items-start gap-2.5 px-4 pt-4">
        <Avatar identity={identity} size={40} />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#111111] truncate">{identity.name}</p>
          <p className="text-[11px] text-[#9B9B8F]">Just now · 🌐</p>
        </div>
      </div>
      <div className="px-4 pt-2.5 pb-2">
        <p className="text-[13px] text-[#111111] leading-relaxed whitespace-pre-wrap">
          {caption ? caption : <span className="text-[#9B9B8F]">Your caption will appear here.</span>}
        </p>
      </div>
      <MediaArea mediaType={mediaType} mediaItems={mediaItems} aspect="aspect-[4/3]" />
      <div className="flex items-center justify-around px-4 py-2.5 text-[#6B6B6B] border-t border-[#F0EEEA]">
        <span className="flex items-center gap-1.5 text-[12px] font-medium"><ThumbsUp size={17} strokeWidth={1.75} /> Like</span>
        <span className="flex items-center gap-1.5 text-[12px] font-medium"><MessageCircle size={17} strokeWidth={1.75} /> Comment</span>
        <span className="flex items-center gap-1.5 text-[12px] font-medium"><Share2 size={17} strokeWidth={1.75} /> Share</span>
      </div>
    </div>
  );
}

function XPreview({ identity, mediaType, mediaItems, caption }: Omit<Props, 'platform'>) {
  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DF] overflow-hidden max-w-[420px] mx-auto">
      <div className="flex items-start gap-2.5 px-4 pt-4">
        <Avatar identity={identity} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[13px] font-semibold text-[#111111] truncate">{identity.name}</p>
            {identity.handle && <p className="text-[12px] text-[#6B6B6B] truncate">{identity.handle} · now</p>}
          </div>
          <p className="text-[13px] text-[#111111] leading-relaxed whitespace-pre-wrap mt-0.5">
            {caption ? caption : <span className="text-[#9B9B8F]">Your post text will appear here.</span>}
          </p>
        </div>
      </div>
      {mediaType !== 'text' && mediaItems.length > 0 && (
        <div className="px-4 pt-2.5">
          <div className="rounded-xl overflow-hidden border border-[#F0EEEA]">
            <MediaArea mediaType={mediaType} mediaItems={mediaItems} aspect="aspect-[16/9]" />
          </div>
        </div>
      )}
      <div className="flex items-center gap-8 px-4 py-3 text-[#6B6B6B]">
        <MessageCircle size={16} strokeWidth={1.75} />
        <Repeat2 size={16} strokeWidth={1.75} />
        <Heart size={16} strokeWidth={1.75} />
        <Share2 size={16} strokeWidth={1.75} />
      </div>
    </div>
  );
}

/**
 * Approximate, not pixel-perfect, per-platform rendering — enough to catch
 * obvious formatting/aspect-ratio issues before publishing, not a promise
 * of exactly matching each platform's real layout engine. TikTok and
 * LinkedIn previews are kept although those platforms are hidden during
 * the beta — a pre-beta draft targeting them still previews correctly.
 */
export default function PlatformPreviewCard({ platform, identity, mediaType, mediaItems, caption }: Props) {
  if (platform === 'facebook') return <FacebookPreview identity={identity} mediaType={mediaType} mediaItems={mediaItems} caption={caption} />;
  if (platform === 'twitter') return <XPreview identity={identity} mediaType={mediaType} mediaItems={mediaItems} caption={caption} />;
  if (platform === 'tiktok') return <TikTokPreview identity={identity} mediaType={mediaType} mediaItems={mediaItems} caption={caption} />;
  if (platform === 'linkedin') return <LinkedInPreview identity={identity} mediaType={mediaType} mediaItems={mediaItems} caption={caption} />;
  return <InstagramPreview identity={identity} mediaType={mediaType} mediaItems={mediaItems} caption={caption} />;
}
