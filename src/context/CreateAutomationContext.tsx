import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { X } from 'lucide-react';
import { useApp } from './AppContext';
import { createFlow } from '../lib/api';
import PlatformDot from '../components/PlatformDot';
import { platformMeta } from '../lib/platformMeta';

/**
 * One creation experience, many entry points.
 *
 * Home's "Create an automation", the sidebar's "+ Create", and the
 * Automations page all call the same beginCreateAutomation(). What happens
 * next depends on the workspace's accounts:
 *
 *   - several connected accounts → a small "Run this automation from"
 *     chooser first, because two accounts on the same platform are two
 *     different audiences and Populr never silently picks one;
 *   - exactly one → it's chosen for them, no ceremony;
 *   - none yet → the automation is created unbound and the builder guides
 *     the connect.
 *
 * Either way the creator lands directly in the builder, where the AI panel
 * opens on "What should happen?" — never on a list page first. The chosen
 * account is stored on the automation itself, so the composer knows its
 * channel from the first prompt without being told.
 */

interface CreateAutomationValue {
  beginCreateAutomation: () => void;
  creatingAutomation: boolean;
}

const CreateAutomationContext = createContext<CreateAutomationValue | null>(null);

// Hook and provider belong together, same as AppContext/AuthContext. Unlike
// those two (which predate the rule and carry the error as baseline), this
// file opts out explicitly so the lint baseline stays where it is.
// eslint-disable-next-line react-refresh/only-export-components
export function useCreateAutomation(): CreateAutomationValue {
  const value = useContext(CreateAutomationContext);
  if (!value) throw new Error('useCreateAutomation must be used within CreateAutomationProvider');
  return value;
}

export function CreateAutomationProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { accounts, showToast } = useApp();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const connected = useMemo(() => accounts.filter(a => a.is_connected), [accounts]);

  const create = useCallback(async (accountId?: string) => {
    if (creating) return;
    setCreating(true);
    try {
      const flow = await createFlow({ name: 'New automation', ...(accountId ? { accountId } : {}) });
      setPickerOpen(false);
      navigate(`/automations/${flow.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not start a new automation.', 'error');
    } finally {
      setCreating(false);
    }
  }, [creating, navigate, showToast]);

  const beginCreateAutomation = useCallback(() => {
    if (creating) return;
    if (connected.length > 1) setPickerOpen(true);
    else void create(connected[0]?.id);
  }, [connected, create, creating]);

  const value = useMemo(
    () => ({ beginCreateAutomation, creatingAutomation: creating }),
    [beginCreateAutomation, creating]
  );

  return (
    <CreateAutomationContext.Provider value={value}>
      {children}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Create an automation"
          onClick={() => !creating && setPickerOpen(false)}
          onKeyDown={e => { if (e.key === 'Escape' && !creating) setPickerOpen(false); }}
        >
          <div
            className="pop-card w-full max-w-sm bg-white p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[16px] font-bold text-[#111111]">Create an automation</h2>
                <p className="text-[12.5px] text-[#6B6B6B] mt-1">Run this automation from</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={creating}
                onClick={() => setPickerOpen(false)}
                className="rounded-lg p-1.5 text-[#6B6B6B] hover:bg-[#F7F5F2] hover:text-[#111111]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {connected.map(account => (
                <button
                  key={account.id}
                  type="button"
                  disabled={creating}
                  onClick={() => void create(account.id)}
                  className="w-full flex items-center gap-3 rounded-xl border border-[#E8E4DF] bg-white px-3.5 py-3 text-left transition hover:border-[#C5FF3D] disabled:opacity-50"
                >
                  <PlatformDot platform={account.platform} size={8} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-[#111111]">
                      {platformMeta(account.platform).name}
                    </span>
                    <span className="block truncate text-[12px] text-[#6B6B6B]">
                      {account.username ? `@${account.username}` : account.display_name ?? 'Connected account'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-[#9B9B8F]">
              You can change this later in the automation&apos;s first step.
            </p>
          </div>
        </div>
      )}
    </CreateAutomationContext.Provider>
  );
}
