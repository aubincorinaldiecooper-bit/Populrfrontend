import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Avatar from '../inbox/Avatar';
import { displayName } from '../../lib/people';
import { queryKeys } from '../../lib/queryKeys';
import { announcePresence, fetchCollaborators, isBackendConfigured } from '../../lib/api';

/**
 * Who else has this automation open.
 *
 * Two people can build on one canvas — that has been true since canvas
 * invites shipped — and until now neither could tell. The cost is not
 * theoretical: autosave means the last write wins, so two people improving
 * the same message take turns overwriting each other while both believe they
 * are alone.
 *
 * This is a facepile, not a lock. Nothing here stops anyone editing; it just
 * ends the part where you couldn't know. Faces are the people who are HERE —
 * the wider "who could open this" list lives on the Team page, and putting
 * both in the header would make neither legible.
 *
 * The heartbeat is the price of presence without a socket: the builder says
 * hello on a timer and says goodbye on the way out, and the server ages out
 * anyone who stops. Arrivals and departures come back over the live feed, so
 * the pile updates when somebody joins rather than at the next beat.
 */

/** Comfortably inside the server's window (see presenceRepo), so one dropped
 *  request doesn't blink this creator off everyone else's canvas. */
const HEARTBEAT_MS = 20_000;

/** Beyond this, the pile becomes a number — five faces in a header is a
 *  crowd, and the sixth would push the automation's name off screen. */
const VISIBLE_FACES = 3;

export default function CollaboratorFacepile({ flowId }: { flowId: string | null }) {
  const enabled = Boolean(flowId) && isBackendConfigured();

  // Read through the cache like every other live surface: an arrival or a
  // departure is published on the feed, useLiveFeed marks this key stale,
  // and only a mounted facepile refetches. The slow refetch under it is the
  // same fallback the feed was built on top of rather than in place of.
  const { data: collaborators } = useQuery({
    queryKey: queryKeys.collaborators(flowId ?? ''),
    queryFn: () => fetchCollaborators(flowId!),
    enabled,
    refetchInterval: HEARTBEAT_MS * 3,
  });

  useEffect(() => {
    if (!enabled || !flowId) return;
    const beat = () => { void announcePresence(flowId).catch(() => {}); };
    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    return () => {
      window.clearInterval(timer);
      // Say goodbye rather than letting the window age out: the others should
      // see someone leave when they leave, not forty seconds later.
      void announcePresence(flowId, { leaving: true }).catch(() => {});
    };
  }, [enabled, flowId]);

  // Yourself excluded. A creator alone on a canvas seeing their own face in
  // the header would read as somebody else being there.
  const here = (collaborators ?? []).filter(c => c.here && !c.you);
  if (here.length === 0) return null;

  const shown = here.slice(0, VISIBLE_FACES);
  const extra = here.length - shown.length;
  const names = here.map(c => displayName(c.person));

  return (
    <div
      className="hidden md:flex items-center"
      // One label for the group. Three separate images each announcing a
      // name would be read out as three unrelated things.
      role="group"
      aria-label={
        here.length === 1
          ? `${names[0]} is also here`
          : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are also here`
      }
    >
      {shown.map((c, i) => (
        <span
          key={`${c.person.email ?? 'person'}-${i}`}
          title={displayName(c.person)}
          // Overlapped, with a ring in the header's own colour so the stack
          // reads as a stack rather than as touching circles.
          className={i === 0 ? 'ring-2 ring-white rounded-full' : '-ml-2 ring-2 ring-white rounded-full'}
        >
          <Avatar
            handle={c.person.email}
            name={c.person.name}
            avatarUrl={c.person.avatarUrl}
            size="sm"
          />
        </span>
      ))}
      {extra > 0 && (
        <span
          aria-hidden
          className="-ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#F0EDE8]
            text-[11px] font-semibold text-[#6B6B6B] ring-2 ring-white"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
