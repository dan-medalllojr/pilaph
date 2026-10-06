import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  ImagePlus,
  LogIn,
  LogOut,
  Megaphone,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext.tsx';
import { AnalyticsStats, DashboardState } from '../types/queue.ts';
import { useQueueChannel } from '../hooks/useQueueChannel.ts';
import { PWAInstallButton } from '../hooks/usePWAInstall.tsx';
import { formatPhoneForDisplay } from '../actions/PhoneNormalizer.ts';
import { SmsSimulatorCard } from './SmsSimulatorCard.tsx';

// "Maria Santos" -> "MS", "maria" -> "MA"
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2);
  return initials.toUpperCase();
}

// Shrinks phone photos before upload and re-encodes them as JPEG, which also
// drops hidden metadata such as GPS location.
async function resizeShopPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');
  // JPEG has no transparency; paint white so transparent PNGs don't turn black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode photo.'))),
      'image/jpeg',
      0.85
    )
  );
}

export type DashboardSubTab = 'today' | 'sms' | 'setup' | 'stats' | 'qr';

interface OwnerDashboardViewProps {
  activeSubTab: DashboardSubTab;
  onChangeSubTab: (tab: DashboardSubTab) => void;
  onOpenTicketPage: (ticketId: string) => void;
  onOpenJoinPage: (slug: string, qrToken: string) => void;
  onOpenTvDisplay: (slug: string) => void;
}

export const OwnerDashboardView: React.FC<OwnerDashboardViewProps> = ({
  activeSubTab,
  onChangeSubTab,
  onOpenTicketPage,
  onOpenJoinPage,
  onOpenTvDisplay,
}) => {
  const {
    user,
    token,
    initializing: authInitializing,
    loading: authLoading,
    error: authError,
    notice: authNotice,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
  } = useAuth();

  // Sign-in form
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBanner, setActionBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Per-counter processing state to prevent double-taps
  const [busyCounterIds, setBusyCounterIds] = useState<Record<number, boolean>>(
    {}
  );
  const [busyTicketIds, setBusyTicketIds] = useState<Record<string, boolean>>(
    {}
  );
  const [togglingQueue, setTogglingQueue] = useState(false);

  // Waiting queue filters & bulk selection
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState<number | 'all'>('all');
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(
    new Set()
  );
  const [bulkRemoving, setBulkRemoving] = useState(false);

  // Push notification state
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [subscribingPush, setSubscribingPush] = useState(false);

  // Setup forms state
  const [bizName, setBizName] = useState('');
  const [nearThreshold, setNearThreshold] = useState(3);
  const [maxWaiting, setMaxWaiting] = useState<string>('25');
  const [joinCutoffTime, setJoinCutoffTime] = useState<string>('21:30');
  const [rotateQrDaily, setRotateQrDaily] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [newSvcName, setNewSvcName] = useState('');
  const [newSvcPrefix, setNewSvcPrefix] = useState('');
  const [newSvcMinutes, setNewSvcMinutes] = useState('20');
  const [addingService, setAddingService] = useState(false);

  const [newCounterName, setNewCounterName] = useState('');
  const [addingCounter, setAddingCounter] = useState(false);

  const [copiedJoinUrl, setCopiedJoinUrl] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const showFeedback = (
    type: 'success' | 'warning' | 'error',
    text: string
  ) => {
    setActionBanner({ type, text });
    window.setTimeout(() => {
      setActionBanner((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const authHeaders = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }, [token]);

  const fetchDashboardState = useCallback(async () => {
    if (!user || !token) return;
    try {
      const res = await fetch('/api/dashboard/state', {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data: DashboardState = await res.json();
        setDashboard(data);
        setBizName(data.business.name);
        setNearThreshold(data.business.nearThreshold);
        setMaxWaiting(
          data.business.maxWaiting !== null
            ? String(data.business.maxWaiting)
            : ''
        );
        setJoinCutoffTime(data.business.joinCutoffTime || '');
        setRotateQrDaily(data.business.rotateQrDaily);
      }
    } catch {
      // Ignore transient errors
    } finally {
      setLoading(false);
    }
  }, [user, token, authHeaders]);

  const fetchAnalytics = useCallback(async () => {
    if (!user || !token) return;
    try {
      const res = await fetch('/api/dashboard/stats', {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data: AnalyticsStats = await res.json();
        setStats(data);
      }
    } catch {
      // Ignore
    }
  }, [user, token, authHeaders]);

  useEffect(() => {
    if (user && token) {
      fetchDashboardState();
      fetchAnalytics();
    } else {
      setLoading(false);
    }
  }, [user, token, fetchDashboardState, fetchAnalytics]);

  // Real-time rule: Only the owner dashboard refetches its full state (with names)
  // from an authenticated endpoint on each public broadcast event.
  useQueueChannel({
    businessId: dashboard?.business.id ?? null,
    onQueueEvent: () => {
      fetchDashboardState();
      if (activeSubTab === 'stats') {
        fetchAnalytics();
      }
    },
    onReconnectOrVisible: fetchDashboardState,
  });

  // ============================================================================
  // OWNER QUEUE ACTIONS
  // ============================================================================

  const handleCallNext = async (
    counterId: number,
    expectedCurrentTicketId: string | null
  ) => {
    if (busyCounterIds[counterId]) return;
    setBusyCounterIds((prev) => ({ ...prev, [counterId]: true }));

    try {
      const res = await fetch(
        `/api/dashboard/counters/${counterId}/call-next`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            expected_current_ticket_id: expectedCurrentTicketId,
          }),
        }
      );
      const data = await res.json();
      if (data.dashboard) {
        setDashboard(data.dashboard);
      }
      if (!res.ok) {
        showFeedback('warning', data.message || data.error || 'Could not call next.');
      } else if (data.emptyQueue) {
        showFeedback('warning', data.message || 'Queue is empty.');
      } else {
        showFeedback('success', data.message || 'Called next customer.');
      }
    } catch {
      showFeedback('error', 'Network error while calling next customer.');
    } finally {
      setBusyCounterIds((prev) => ({ ...prev, [counterId]: false }));
    }
  };

  const handleTicketAction = async (
    ticketId: string,
    action: 'done' | 'no-show' | 'recall'
  ) => {
    if (busyTicketIds[ticketId]) return;
    setBusyTicketIds((prev) => ({ ...prev, [ticketId]: true }));

    try {
      const res = await fetch(`/api/dashboard/tickets/${ticketId}/${action}`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.dashboard) {
        setDashboard(data.dashboard);
      }
      if (res.ok) {
        showFeedback(
          'success',
          data.message ||
            (action === 'done'
              ? 'Ticket marked as completed.'
              : action === 'no-show'
                ? 'Ticket marked as no-show.'
                : 'Ticket re-announced on TV & phone.')
        );
      }
    } catch {
      showFeedback('error', `Failed to perform ${action} on ticket.`);
    } finally {
      setBusyTicketIds((prev) => ({ ...prev, [ticketId]: false }));
    }
  };

  const handleToggleQueue = async () => {
    if (togglingQueue || !dashboard) return;
    setTogglingQueue(true);
    try {
      const res = await fetch('/api/dashboard/queue/toggle', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ isOpen: !dashboard.business.isOpen }),
      });
      const data = await res.json();
      if (data.dashboard) {
        setDashboard(data.dashboard);
        showFeedback(
          'success',
          data.isOpen
            ? 'Queue is now OPEN for walk-in joins.'
            : 'Queue is now PAUSED. New joins are temporarily blocked.'
        );
      }
    } finally {
      setTogglingQueue(false);
    }
  };

  const handleBulkRemove = async () => {
    if (bulkRemoving || selectedTicketIds.size === 0) return;
    setBulkRemoving(true);
    try {
      const res = await fetch('/api/dashboard/tickets/bulk-remove', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ticketIds: Array.from(selectedTicketIds),
        }),
      });
      const data = await res.json();
      if (data.dashboard) {
        setDashboard(data.dashboard);
        setSelectedTicketIds(new Set());
        showFeedback(
          'success',
          `Removed ${data.removedCount || 0} ticket(s) from the waiting queue.`
        );
      }
    } finally {
      setBulkRemoving(false);
    }
  };

  const handleEnablePushAlerts = async () => {
    if (subscribingPush) return;
    setSubscribingPush(true);
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      const res = await fetch('/api/push-subscriptions', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          endpoint: `webpush://${user?.uid || 'owner'}-${window.location.host}`,
          keys: {
            p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
            auth: 'tBHItJI5svbpez7KI4CCXg',
          },
        }),
      });
      if (res.ok) {
        setPushSubscribed(true);
        showFeedback(
          'success',
          'Owner Web Push subscription saved for new customer alerts.'
        );
      }
    } finally {
      setSubscribingPush(false);
    }
  };

  const handleSaveBusinessSettings = async (
    e: React.FormEvent,
    regenerateQrToken = false
  ) => {
    e.preventDefault();
    if (savingSettings) return;
    setSavingSettings(true);
    try {
      const res = await fetch('/api/dashboard/business', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          name: bizName,
          nearThreshold: Number(nearThreshold),
          maxWaiting: maxWaiting.trim() === '' ? null : Number(maxWaiting),
          joinCutoffTime:
            joinCutoffTime.trim() === '' ? null : joinCutoffTime.trim(),
          rotateQrDaily,
          regenerateQrToken,
        }),
      });
      const data = await res.json();
      if (data.dashboard) {
        setDashboard(data.dashboard);
        showFeedback(
          'success',
          regenerateQrToken
            ? 'QR token rotated and settings saved.'
            : 'Business settings saved.'
        );
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so picking the same file again still triggers a change
    if (!file || photoBusy) return;
    setPhotoBusy(true);
    try {
      let photo: Blob;
      try {
        photo = await resizeShopPhoto(file);
      } catch {
        showFeedback(
          'error',
          'That file could not be read as a photo. Use a JPG, PNG or WebP image.'
        );
        return;
      }
      const res = await fetch('/api/dashboard/business/photo', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'image/jpeg',
        },
        body: photo,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.dashboard) {
        setDashboard(data.dashboard);
        showFeedback('success', 'Shop photo updated.');
      } else {
        showFeedback(
          'error',
          res.status === 413
            ? 'That photo is too large. Try a smaller one.'
            : data.error || 'Could not upload the photo.'
        );
      }
    } catch {
      showFeedback('error', 'Network error while uploading the photo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (photoBusy || !window.confirm('Remove the shop photo?')) return;
    setPhotoBusy(true);
    try {
      const res = await fetch('/api/dashboard/business/photo', {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.dashboard) {
        setDashboard(data.dashboard);
        showFeedback('success', 'Shop photo removed.');
      } else {
        showFeedback('error', data.error || 'Could not remove the photo.');
      }
    } catch {
      showFeedback('error', 'Network error while removing the photo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addingService || !newSvcName.trim() || !newSvcPrefix.trim()) return;
    setAddingService(true);
    try {
      const res = await fetch('/api/dashboard/services', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: newSvcName.trim(),
          prefix: newSvcPrefix.trim().toUpperCase(),
          defaultMinutes: Number(newSvcMinutes || 15),
        }),
      });
      const data = await res.json();
      if (res.ok && data.dashboard) {
        setDashboard(data.dashboard);
        setNewSvcName('');
        setNewSvcPrefix('');
        showFeedback('success', 'New service added.');
      } else {
        showFeedback('error', data.error || 'Could not add service.');
      }
    } finally {
      setAddingService(false);
    }
  };

  const handleToggleService = async (id: number, currentActive: boolean) => {
    const res = await fetch(`/api/dashboard/services/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ isActive: !currentActive }),
    });
    const data = await res.json();
    if (data.dashboard) setDashboard(data.dashboard);
  };

  const handleAddCounter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addingCounter || !newCounterName.trim()) return;
    setAddingCounter(true);
    try {
      const res = await fetch('/api/dashboard/counters', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: newCounterName.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.dashboard) {
        setDashboard(data.dashboard);
        setNewCounterName('');
        showFeedback('success', 'New counter/chair added.');
      }
    } finally {
      setAddingCounter(false);
    }
  };

  const handleToggleCounter = async (id: number, currentActive: boolean) => {
    const res = await fetch(`/api/dashboard/counters/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ isActive: !currentActive }),
    });
    const data = await res.json();
    if (data.dashboard) setDashboard(data.dashboard);
  };

  const handleDelete = async (
    kind: 'services' | 'counters',
    id: number,
    name: string
  ) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/dashboard/${kind}/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await res.json();
    if (res.ok && data.dashboard) {
      setDashboard(data.dashboard);
      showFeedback('success', `Deleted ${name}.`);
    } else {
      showFeedback('error', data.error || `Could not delete ${name}.`);
    }
  };

  const handleEndOfDayCleanup = async () => {
    const res = await fetch('/api/dashboard/end-of-day-cleanup', {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = await res.json();
    if (data.dashboard) {
      setDashboard(data.dashboard);
      fetchAnalytics();
      showFeedback('success', data.message || 'Operation completed.');
    }
  };

  // ============================================================================
  // AUTH GATE (Supabase: Google or email + password)
  // ============================================================================
  if (!user) {
    if (authInitializing) {
      return (
        <div className="max-w-md mx-auto px-4 py-14">
          <div className="h-72 rounded-2xl bg-slate-200 animate-pulse" />
        </div>
      );
    }

    const isSignUp = authMode === 'signup';
    const handleAuthSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const email = authEmail.trim();
      if (isSignUp) {
        signUp(email, authPassword);
      } else {
        signIn(email, authPassword);
      }
    };

    return (
      <div className="max-w-md mx-auto px-4 py-14">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-slate-900">
              Owner Queue Dashboard
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Sign in to call customers, manage services and chairs, print your
              shop QR poster, and review daily analytics.
            </p>
          </div>

          {authError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {authError}
            </div>
          )}

          {authNotice && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              {authNotice}
            </div>
          )}

          <button
            type="button"
            disabled={authLoading}
            onClick={signInWithGoogle}
            className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="h-px flex-1 bg-slate-200" />
            <span>or use email</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="owner-email"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Email
              </label>
              <input
                id="owner-email"
                type="email"
                required
                autoComplete="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="owner-password"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Password
              </label>
              <input
                id="owner-password"
                type="password"
                required
                minLength={6}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full min-h-[48px] rounded-xl bg-slate-900 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" />
              <span>
                {authLoading
                  ? isSignUp
                    ? 'Creating account...'
                    : 'Signing in...'
                  : isSignUp
                    ? 'Create Owner Account'
                    : 'Sign In'}
              </span>
            </button>
          </form>

          <p className="text-xs text-slate-600 text-center">
            {isSignUp ? 'Already have an account?' : 'New shop owner?'}{' '}
            <button
              type="button"
              onClick={() => setAuthMode(isSignUp ? 'signin' : 'signup')}
              className="font-semibold text-slate-900 underline underline-offset-4 cursor-pointer"
            >
              {isSignUp ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (loading || !dashboard) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="h-20 rounded-2xl bg-slate-200 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-48 rounded-2xl bg-slate-200 animate-pulse" />
          <div className="h-48 rounded-2xl bg-slate-200 animate-pulse" />
          <div className="h-48 rounded-2xl bg-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  const { business, counters, services, waitingTickets, smsLogs, statsSummary } =
    dashboard;

  const filteredWaiting = waitingTickets.filter((t) => {
    const matchesService =
      serviceFilter === 'all' || t.serviceId === serviceFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      t.code.toLowerCase().includes(q) ||
      t.customerName.toLowerCase().includes(q) ||
      (t.phone && t.phone.includes(q));
    return matchesService && matchesSearch;
  });

  const joinQrUrl = `${window.location.origin}/?view=join&slug=${encodeURIComponent(
    business.slug
  )}&k=${encodeURIComponent(business.qrToken)}`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20 space-y-6">
      {/* Owner Workspace Header & Sub-Navigation */}
      <div className="no-print rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          {user.avatarUrl && !avatarError ? (
            <img
              src={user.avatarUrl}
              alt={user.displayName}
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
              className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-slate-900 text-white font-bold text-sm flex items-center justify-center shrink-0">
              {getInitials(user.displayName)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 truncate">
              {business.name}
            </h1>
            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
              <span>{user.displayName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {dashboard.manilaDate} {dashboard.manilaTime} PHT
              </span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  business.isOpen
                    ? 'text-emerald-700 font-semibold'
                    : 'text-amber-700 font-semibold'
                }
              >
                {business.isOpen ? 'Queue Open' : 'Queue Paused'}
              </span>
            </div>
          </div>
        </div>

        {/* Sub-Nav Tabs + Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
            {(
              [
                { id: 'today', label: 'Today Queue' },
                { id: 'sms', label: 'SMS Simulator' },
                { id: 'setup', label: 'Services & Chairs' },
                { id: 'stats', label: 'Stats' },
                { id: 'qr', label: 'QR Poster' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChangeSubTab(tab.id)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap min-h-[38px] ${
                  activeSubTab === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <PWAInstallButton />

          <button
            type="button"
            onClick={signOut}
            title="Sign Out"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 min-h-[40px]"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast Banner */}
      {actionBanner && (
        <div
          className={`no-print rounded-xl border px-4 py-3 text-xs font-semibold flex items-center justify-between ${
            actionBanner.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : actionBanner.type === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <span>{actionBanner.text}</span>
          <button
            type="button"
            onClick={() => setActionBanner(null)}
            className="text-xs underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================
          TAB 1: TODAY QUEUE OPERATIONS
         ======================================================================== */}
      {activeSubTab === 'today' && (
        <div className="space-y-6">
          {/* Install App / Web Push Alert Bar */}
          {!pushSubscribed && (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs text-slate-700">
                <Bell className="w-4 h-4 text-slate-900 shrink-0" />
                <span>
                  <strong>Install the app to get alerts:</strong> Enable Web
                  Push notifications when new customers join (on iPhone, works
                  after Add to Home Screen).
                </span>
              </div>
              <button
                type="button"
                disabled={subscribingPush}
                onClick={handleEnablePushAlerts}
                className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 whitespace-nowrap min-h-[38px]"
              >
                {subscribingPush ? 'Enabling...' : 'Enable Owner Push Alerts'}
              </button>
            </div>
          )}

          {/* Top Summary Metrics + Open/Pause Queue Toggle */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Waiting in Queue</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {statsSummary.waitingNow}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {business.maxWaiting
                  ? `Capacity ${business.maxWaiting}`
                  : 'Unlimited capacity'}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Served Today</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-700">
                {statsSummary.servedToday}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
                {statsSummary.noShowsToday} no-shows ·{' '}
                {statsSummary.cancelledToday} cancelled
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Average Wait Today</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {statsSummary.avgWaitMinutesToday}m
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                Join to call time
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Avg Service Time</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {statsSummary.avgServiceMinutesToday}m
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                Across {counters.filter((c) => c.isActive).length} active chairs
              </div>
            </div>

            <div className="col-span-2 lg:col-span-1 rounded-2xl border border-slate-200 bg-white p-4 flex flex-col justify-between">
              <div className="text-xs text-slate-500">Queue Status</div>
              <button
                type="button"
                disabled={togglingQueue}
                onClick={handleToggleQueue}
                className={`mt-2 w-full min-h-[44px] rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  business.isOpen
                    ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                    : 'bg-emerald-700 text-white hover:bg-emerald-800'
                }`}
              >
                {business.isOpen ? (
                  <>
                    <PauseCircle className="w-4 h-4" />
                    <span>Pause New Joins</span>
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-4 h-4" />
                    <span>Open Queue Now</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Active Counters / Chairs — Call Next, Recall, Done, No-Show */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Active Counters &amp; Chairs
              </h2>
              <span className="text-xs text-slate-500">
                Tap &ldquo;Call Next&rdquo; to complete current ticket and call
                the oldest waiting customer
              </span>
            </div>

            {/* New shops start empty: customers can't join without a service, and nobody can be called without a chair */}
            {(counters.filter((c) => c.isActive).length === 0 ||
              services.filter((s) => s.isActive).length === 0) && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 space-y-3">
                <h3 className="text-sm font-semibold text-amber-950">
                  Finish setting up your shop
                </h3>
                <p className="text-xs text-amber-900">
                  Add at least one service and one chair before customers can
                  join the queue and you can call them.
                </p>
                <button
                  type="button"
                  onClick={() => onChangeSubTab('setup')}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-900 text-white text-xs font-semibold hover:bg-amber-950"
                >
                  Open Services &amp; Chairs
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {counters
                .filter((c) => c.isActive)
                .map((counter) => {
                  const current = counter.currentTicket || null;
                  const isBusy = Boolean(busyCounterIds[counter.id]);
                  const isTicketBusy = current
                    ? Boolean(busyTicketIds[current.id])
                    : false;

                  return (
                    <div
                      key={counter.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between space-y-5"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <span className="text-sm font-bold text-slate-900">
                            {counter.name}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              current ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          >
                            {current ? 'Now Serving' : 'Idle / Ready'}
                          </span>
                        </div>

                        {current ? (
                          <div className="space-y-1.5">
                            <div className="flex items-baseline justify-between">
                              <span className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                                {current.code}
                              </span>
                              <span className="text-xs text-slate-500">
                                {current.serviceName}
                              </span>
                            </div>
                            <div className="text-sm font-semibold text-slate-800">
                              {current.customerName}
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-1.5 font-mono tabular-nums">
                              <span>
                                {formatPhoneForDisplay(current.phone)}
                              </span>
                              {current.calledSmsSentAt && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-sans text-emerald-700">
                                    SMS Sent
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="py-5 text-center text-xs text-slate-400">
                            No ticket currently assigned to this chair.
                          </div>
                        )}
                      </div>

                      <div className="space-y-2.5 pt-2">
                        {/* Primary Large Tap Target: Call Next Customer */}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handleCallNext(
                              counter.id,
                              current ? current.id : null
                            )
                          }
                          className="w-full min-h-[48px] rounded-xl bg-slate-900 text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <Megaphone className="w-4 h-4 text-emerald-400" />
                          <span>
                            {isBusy
                              ? 'Calling...'
                              : waitingTickets.length > 0
                                ? `Call Next (${waitingTickets[0].code})`
                                : current
                                  ? 'Finish & Clear Chair'
                                  : 'Call Next (Queue Empty)'}
                          </span>
                        </button>

                        {/* Secondary Controls for Current Called Ticket: Recall / Done / No-Show */}
                        {current && (
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              disabled={isTicketBusy}
                              onClick={() =>
                                handleTicketAction(current.id, 'recall')
                              }
                              className="min-h-[44px] rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Recall</span>
                            </button>

                            <button
                              type="button"
                              disabled={isTicketBusy}
                              onClick={() =>
                                handleTicketAction(current.id, 'done')
                              }
                              className="min-h-[44px] rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Done</span>
                            </button>

                            <button
                              type="button"
                              disabled={isTicketBusy}
                              onClick={() =>
                                handleTicketAction(current.id, 'no-show')
                              }
                              className="min-h-[44px] rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-red-100 disabled:opacity-50"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>No-Show</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Waiting Queue List + Bulk Remove Spam Tickets */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Waiting Queue ({waitingTickets.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Ordered by arrival time · Near-turn SMS triggers at position
                    #{business.nearThreshold}
                  </p>
                </div>

                {selectedTicketIds.size > 0 && (
                  <button
                    type="button"
                    disabled={bulkRemoving}
                    onClick={handleBulkRemove}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {bulkRemoving
                        ? 'Removing...'
                        : `Bulk Remove (${selectedTicketIds.size})`}
                    </span>
                  </button>
                )}
              </div>

              {/* Search & Service Filter Bar */}
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filter by ticket code, name, or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setServiceFilter('all')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      serviceFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All
                  </button>
                  {services.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setServiceFilter(s.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap font-mono ${
                        serviceFilter === s.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {s.prefix}
                    </button>
                  ))}
                </div>
              </div>

              {filteredWaiting.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <p className="text-sm font-medium text-slate-700">
                    No waiting customers match your current filter.
                  </p>
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenJoinPage(business.slug, business.qrToken)
                      }
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                    >
                      Add Walk-In Customer
                    </button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredWaiting.map((ticket) => {
                    const isChecked = selectedTicketIds.has(ticket.id);
                    return (
                      <div
                        key={ticket.id}
                        className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <input
                            type="checkbox"
                            aria-label={`Select ticket ${ticket.code}`}
                            checked={isChecked}
                            onChange={() => {
                              setSelectedTicketIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(ticket.id)) {
                                  next.delete(ticket.id);
                                } else {
                                  next.add(ticket.id);
                                }
                                return next;
                              });
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                          />

                          <span className="w-7 text-xs font-mono tabular-nums text-slate-400">
                            #{ticket.position}
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                                {ticket.code}
                              </span>
                              <span className="text-sm font-semibold text-slate-800 truncate">
                                {ticket.customerName}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                              <span>{ticket.serviceName}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {formatPhoneForDisplay(ticket.phone)}
                              </span>
                              {ticket.nearSmsSentAt && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-emerald-700 font-medium">
                                    Near SMS Sent
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right hidden sm:block">
                            <div className="text-xs font-mono tabular-nums font-semibold text-slate-800">
                              {ticket.etaRange || '5–10 min'}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Est. wait
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onOpenTicketPage(ticket.id)}
                            title="Preview customer's live mobile ticket"
                            className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                          >
                            <span>View Ticket</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Semaphore SMS Log Feed */}
            <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-slate-900" />
                  <h2 className="text-sm font-bold text-slate-900">
                    Semaphore SMS Logs
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onChangeSubTab('sms')}
                  className="text-xs font-semibold text-slate-900 hover:underline"
                >
                  Open Simulator
                </button>
              </div>

              {smsLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  SMS dispatches for &ldquo;almost your turn&rdquo; and
                  &ldquo;called&rdquo; tickets appear here automatically.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
                  {smsLogs.map((log) => (
                    <div key={log.id} className="p-4 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-500">
                        <div className="flex items-center gap-1.5 font-mono tabular-nums">
                          <strong className="text-slate-900">
                            {log.ticketCode}
                          </strong>
                          <span aria-hidden="true">·</span>
                          <span>{log.type === 'called' ? 'Called' : 'Near Turn'}</span>
                        </div>
                        <span className="text-emerald-700 font-medium">
                          {log.driver === 'semaphore' ? 'Semaphore' : 'Logged'}
                        </span>
                      </div>
                      <p className="text-slate-700 leading-relaxed">
                        {log.message}
                      </p>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                        To: {formatPhoneForDisplay(log.phone)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Inline SMS Simulator Card on Today Queue View */}
          <SmsSimulatorCard
            business={business}
            counters={counters}
            tickets={[
              ...waitingTickets,
              ...dashboard.calledTickets,
              ...dashboard.recentCompletedTickets,
            ]}
            authHeaders={authHeaders}
            onDashboardUpdated={(next) => setDashboard(next)}
          />
        </div>
      )}

      {/* ========================================================================
          TAB 1B: DEDICATED SEMAPHORE SMS SIMULATOR & LOGS VIEW
         ======================================================================== */}
      {activeSubTab === 'sms' && (
        <div className="space-y-6">
          <SmsSimulatorCard
            business={business}
            counters={counters}
            tickets={[
              ...waitingTickets,
              ...dashboard.calledTickets,
              ...dashboard.recentCompletedTickets,
            ]}
            authHeaders={authHeaders}
            onDashboardUpdated={(next) => setDashboard(next)}
          />

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-900" />
                <h2 className="text-base font-bold text-slate-900">
                  Semaphore SMS Audit Log ({smsLogs.length})
                </h2>
              </div>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                Table: sms_logs
              </span>
            </div>

            {smsLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No SMS notifications logged yet today. Trigger a test SMS above.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {smsLogs.map((log) => (
                  <div
                    key={log.id}
                    className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-mono tabular-nums text-slate-600">
                        <strong className="text-slate-900 text-sm">
                          {log.ticketCode}
                        </strong>
                        <span aria-hidden="true">·</span>
                        <span>
                          {log.type === 'called'
                            ? 'Called to Counter'
                            : 'Near-Turn Alert'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatPhoneForDisplay(log.phone)}</span>
                      </div>
                      <p className="text-slate-800">{log.message}</p>
                    </div>
                    <div className="sm:text-right font-mono tabular-nums text-slate-500 shrink-0">
                      <div className="text-emerald-700 font-semibold">
                        {log.status.toUpperCase()} ({log.driver})
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(log.createdAt).toLocaleTimeString('en-PH', {
                          timeZone: 'Asia/Manila',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================
          TAB 2: SERVICES, COUNTERS & BUSINESS SETTINGS
         ======================================================================== */}
      {activeSubTab === 'setup' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Shop Photo, Business Rules & Queue Capacity */}
          <div className="lg:col-span-5 space-y-6">
            {/* Shop photo shown at the top of the customer join page */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <ImageIcon className="w-4 h-4 text-slate-900" />
                <h2 className="text-base font-bold text-slate-900">
                  Shop Photo
                </h2>
              </div>
              <p className="text-xs text-slate-500">
                Shown at the top of your customer join page. Without a photo,
                customers see your shop name on a plain background.
              </p>

              {business.photoUrl ? (
                <img
                  src={business.photoUrl}
                  alt={`${business.name} photo`}
                  className="w-full h-40 rounded-xl object-cover border border-slate-200"
                />
              ) : (
                <div className="w-full h-40 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 flex items-end p-4">
                  <span className="text-lg font-bold text-white truncate">
                    {business.name}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <label
                  className={`min-h-[42px] px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-slate-800 cursor-pointer focus-within:ring-2 focus-within:ring-slate-400 ${
                    photoBusy ? 'opacity-60 pointer-events-none' : ''
                  }`}
                >
                  <ImagePlus className="w-4 h-4" />
                  <span>
                    {photoBusy
                      ? 'Saving...'
                      : business.photoUrl
                        ? 'Change Photo'
                        : 'Upload Photo'}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={photoBusy}
                    onChange={handleUploadPhoto}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  disabled={!business.photoUrl || photoBusy}
                  className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-slate-800 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  Remove Photo
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => handleSaveBusinessSettings(e, false)}
              className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Settings className="w-4 h-4 text-slate-900" />
                <h2 className="text-base font-bold text-slate-900">
                  Business &amp; Queue Rules
                </h2>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Shop Name
                </label>
                <input
                  type="text"
                  required
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Near-Turn SMS Position
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={nearThreshold}
                    onChange={(e) => setNearThreshold(Number(e.target.value))}
                    className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Max Waiting Capacity
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    placeholder="Unlimited"
                    value={maxWaiting}
                    onChange={(e) => setMaxWaiting(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Daily Join Cutoff Time (Asia/Manila 24h)
                </label>
                <input
                  type="time"
                  value={joinCutoffTime}
                  onChange={(e) => setJoinCutoffTime(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900"
                />
              </div>

              <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rotateQrDaily}
                  onChange={(e) => setRotateQrDaily(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-slate-900"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  <strong>Rotate QR token every night:</strong> Prevents people
                  from reusing yesterday&apos;s QR link from home. When enabled,
                  the TV display shows today&apos;s live QR code.
                </span>
              </label>

              <button
                type="submit"
                disabled={savingSettings}
                className="w-full min-h-[44px] rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                {savingSettings ? 'Saving...' : 'Save Business Settings'}
              </button>
            </form>

            {/* Nightly Scheduler Action */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Queue Maintenance
              </h3>
              <p className="text-xs text-slate-500">
                Run the nightly cleanup now: cancels leftover waiting tickets,
                marks leftover called tickets as no-show, and rotates the QR
                token if daily rotation is on.
              </p>
              <button
                type="button"
                onClick={handleEndOfDayCleanup}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold hover:bg-amber-100"
              >
                Run Nightly Cleanup Now
              </button>
            </div>
          </div>

          {/* Right: Services CRUD + Counters CRUD */}
          <div className="lg:col-span-7 space-y-6">
            {/* Services CRUD */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Services &amp; Ticket Prefixes
                </h2>
                <p className="text-xs text-slate-500">
                  Each service has a unique letter prefix (e.g. A-001, B-001)
                  and a fallback duration for wait estimates.
                </p>
              </div>

              <div className="divide-y divide-slate-100">
                {services.map((svc) => (
                  <div
                    key={svc.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-lg bg-slate-100 font-mono font-bold text-sm flex items-center justify-center text-slate-900">
                        {svc.prefix}
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {svc.name}
                        </div>
                        <div className="text-xs text-slate-500 font-mono tabular-nums">
                          Default {svc.defaultMinutes} min · {svc.waitingCount || 0}{' '}
                          waiting now
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleService(svc.id, svc.isActive)}
                        className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                          svc.isActive
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-100 text-slate-500'
                        }`}
                      >
                        {svc.isActive ? 'Active' : 'Inactive'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete('services', svc.id, svc.name)}
                        title="Delete service"
                        aria-label={`Delete ${svc.name}`}
                        className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-red-700 hover:border-red-300 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleAddService}
                className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-12 gap-2.5"
              >
                <input
                  type="text"
                  required
                  placeholder="New service name (e.g. Hair Coloring)"
                  value={newSvcName}
                  onChange={(e) => setNewSvcName(e.target.value)}
                  className="sm:col-span-6 min-h-[40px] rounded-xl border border-slate-300 px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  required
                  maxLength={2}
                  placeholder="Prefix (D)"
                  value={newSvcPrefix}
                  onChange={(e) =>
                    setNewSvcPrefix(e.target.value.toUpperCase())
                  }
                  className="sm:col-span-2 min-h-[40px] rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono uppercase"
                />
                <input
                  type="number"
                  min={5}
                  max={180}
                  placeholder="Mins"
                  value={newSvcMinutes}
                  onChange={(e) => setNewSvcMinutes(e.target.value)}
                  className="sm:col-span-2 min-h-[40px] rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
                />
                <button
                  type="submit"
                  disabled={addingService}
                  className="sm:col-span-2 min-h-[40px] rounded-xl bg-slate-900 text-white text-xs font-semibold flex items-center justify-center gap-1 hover:bg-slate-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </form>
            </div>

            {/* Counters / Chairs CRUD */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Counters &amp; Chairs
                </h2>
                <p className="text-xs text-slate-500">
                  Active counters divide the total estimated wait time and
                  appear on the TV display.
                </p>
              </div>

              <div className="divide-y divide-slate-100">
                {counters.map((ctr) => (
                  <div
                    key={ctr.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {ctr.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {ctr.currentTicket
                          ? `Currently serving ${ctr.currentTicket.code}`
                          : 'Available'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleCounter(ctr.id, ctr.isActive)}
                        className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                          ctr.isActive
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-100 text-slate-500'
                        }`}
                      >
                        {ctr.isActive ? 'Active' : 'Offline'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete('counters', ctr.id, ctr.name)}
                        title="Delete chair"
                        aria-label={`Delete ${ctr.name}`}
                        className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-red-700 hover:border-red-300 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleAddCounter}
                className="pt-3 border-t border-slate-100 flex items-center gap-2.5"
              >
                <input
                  type="text"
                  required
                  placeholder="New chair or counter name (e.g. Chair 4 — Rico)"
                  value={newCounterName}
                  onChange={(e) => setNewCounterName(e.target.value)}
                  className="flex-1 min-h-[40px] rounded-xl border border-slate-300 px-3 py-2 text-xs"
                />
                <button
                  type="submit"
                  disabled={addingCounter}
                  className="min-h-[40px] px-4 rounded-xl bg-slate-900 text-white text-xs font-semibold flex items-center gap-1 hover:bg-slate-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Counter</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          TAB 3: ANALYTICS & STATS (`/dashboard/stats`)
         ======================================================================== */}
      {activeSubTab === 'stats' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs text-slate-500">Served Today / Week</div>
              <div className="mt-1 text-3xl font-bold font-mono tabular-nums text-slate-900">
                {stats.servedToday}{' '}
                <span className="text-base font-normal text-slate-400">
                  / {stats.servedWeek}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Completed customer visits
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs text-slate-500">Average Wait Time</div>
              <div className="mt-1 text-3xl font-bold font-mono tabular-nums text-emerald-700">
                {stats.avgWaitMinutes} min
              </div>
              <div className="mt-1 text-xs text-slate-500">
                From QR join to chair call
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs text-slate-500">
                Average Service Duration
              </div>
              <div className="mt-1 text-3xl font-bold font-mono tabular-nums text-slate-900">
                {stats.avgServiceMinutes} min
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Rolling mean of completed tickets
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs text-slate-500">SMS Alerts Dispatched</div>
              <div className="mt-1 text-3xl font-bold font-mono tabular-nums text-slate-900">
                {stats.smsSentToday}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Near-turn &amp; called notifications
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Busiest Hours Distribution */}
            <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Busiest Hours (Asia/Manila)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Walk-in ticket join volume by hour of day
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 pt-2">
                {stats.hourlyDistribution.map((item) => {
                  const maxCount = Math.max(
                    1,
                    ...stats.hourlyDistribution.map((h) => h.count)
                  );
                  const widthPct = Math.round((item.count / maxCount) * 100);
                  return (
                    <div
                      key={item.hour}
                      className="grid grid-cols-12 items-center gap-3 text-xs"
                    >
                      <span className="col-span-2 font-mono tabular-nums text-slate-500">
                        {item.hourLabel}
                      </span>
                      <div className="col-span-8 h-5 rounded-md bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-slate-900 rounded-md transition-all"
                          style={{ width: `${Math.max(item.count > 0 ? 8 : 0, widthPct)}%` }}
                        />
                      </div>
                      <span className="col-span-2 text-right font-mono tabular-nums font-semibold text-slate-800">
                        {item.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Service Breakdown Table */}
            <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Service Performance Breakdown
                </h2>
                <p className="text-xs text-slate-500">
                  Completed count and rolling average duration per service
                </p>
              </div>

              <div className="divide-y divide-slate-100">
                {stats.serviceBreakdown.map((svc) => (
                  <div
                    key={svc.serviceId}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        <span className="font-mono font-bold mr-1.5">
                          [{svc.prefix}]
                        </span>
                        {svc.name}
                      </div>
                      <div className="text-xs text-slate-500 font-mono tabular-nums">
                        Avg duration: {svc.avgServiceMinutes} min
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-sm font-bold text-slate-900">
                        {svc.servedCount} served
                      </div>
                      <div className="text-xs text-slate-500">
                        {svc.waitingCount} waiting
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          TAB 4: PRINTABLE QR POSTER (`/dashboard/qr`)
         ======================================================================== */}
      {activeSubTab === 'qr' && (
        <div className="max-w-xl mx-auto space-y-6">
          {/* Action Controls (Hidden when printing) */}
          <div className="no-print rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <QrCode className="w-4 h-4 text-slate-900" />
              <span>
                Token: <strong className="font-mono">{business.qrToken}</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(joinQrUrl);
                  setCopiedJoinUrl(true);
                  setTimeout(() => setCopiedJoinUrl(false), 2000);
                }}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50"
              >
                {copiedJoinUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied Join Link</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Join Link</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={(e) => handleSaveBusinessSettings(e, true)}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Rotate Token</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-800"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print QR Poster</span>
              </button>
            </div>
          </div>

          {/* Printable Shop Poster Card */}
          <div className="rounded-3xl border-2 border-slate-900 bg-white p-8 sm:p-12 text-center space-y-6">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-500">
                Virtual Walk-In Queue
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 text-balance">
                {business.name}
              </h2>
              <p className="text-sm text-slate-600">
                Scan with your phone camera to get your queue ticket number
              </p>
            </div>

            <div className="inline-block p-6 rounded-3xl border-2 border-slate-900 bg-white">
              <QRCodeSVG value={joinQrUrl} size={220} level="H" />
            </div>

            <div className="grid grid-cols-3 gap-4 text-left pt-2 border-t border-slate-200">
              <div className="space-y-1">
                <div className="text-xs font-bold font-mono text-slate-900">
                  01. Scan Code
                </div>
                <p className="text-xs text-slate-600">
                  Open your phone camera and point it at the QR code above.
                </p>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-bold font-mono text-slate-900">
                  02. Get Ticket
                </div>
                <p className="text-xs text-slate-600">
                  Pick your service and enter your name. No app install needed.
                </p>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-bold font-mono text-slate-900">
                  03. SMS Alert
                </div>
                <p className="text-xs text-slate-600">
                  Watch your live position or get an SMS when your turn is near.
                </p>
              </div>
            </div>

            <div className="pt-2 text-xs text-slate-400 font-mono break-all">
              {joinQrUrl}
            </div>
          </div>

          <div className="no-print flex justify-center gap-3">
            <button
              type="button"
              onClick={() => onOpenJoinPage(business.slug, business.qrToken)}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Test Customer Scan Experience</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenTvDisplay(business.slug)}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open Shop TV Display</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
