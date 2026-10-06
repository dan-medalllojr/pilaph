import React, { useEffect, useState } from 'react';
import { AuthProvider } from './context/AuthContext.tsx';
import { CustomerJoinView } from './components/CustomerJoinView.tsx';
import { CustomerTicketView } from './components/CustomerTicketView.tsx';
import { TvDisplayView } from './components/TvDisplayView.tsx';
import {
  DashboardSubTab,
  OwnerDashboardView,
} from './components/OwnerDashboardView.tsx';
import { OfflineIndicator } from './hooks/usePWAInstall.tsx';

type ActiveRouteView = 'dashboard' | 'join' | 'ticket' | 'tv';

interface RouteState {
  view: ActiveRouteView;
  dashboardTab: DashboardSubTab;
  slug: string;
  qrToken: string;
  ticketId: string;
}

function parseInitialRoute(): RouteState {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  const viewParam = params.get('view');
  const slugParam = params.get('slug') || '';
  const kParam = params.get('k') || '';
  const ticketParam = params.get('ticket') || '';

  if (viewParam === 'join') {
    return {
      view: 'join',
      dashboardTab: 'today',
      slug: slugParam,
      qrToken: kParam,
      ticketId: ticketParam,
    };
  }

  if (viewParam === 'ticket' && ticketParam) {
    return {
      view: 'ticket',
      dashboardTab: 'today',
      slug: slugParam,
      qrToken: kParam,
      ticketId: ticketParam,
    };
  }

  if (viewParam === 'tv') {
    return {
      view: 'tv',
      dashboardTab: 'today',
      slug: slugParam,
      qrToken: kParam,
      ticketId: ticketParam,
    };
  }

  // Path-based routes (`/q/:slug/display`, `/q/:slug`, `/t/:ticket`, `/dashboard`)
  const tvMatch = path.match(/^\/q\/([^/]+)\/display\/?$/);
  if (tvMatch) {
    return {
      view: 'tv',
      dashboardTab: 'today',
      slug: decodeURIComponent(tvMatch[1]),
      qrToken: kParam,
      ticketId: '',
    };
  }

  const joinMatch = path.match(/^\/q\/([^/]+)\/?$/);
  if (joinMatch) {
    return {
      view: 'join',
      dashboardTab: 'today',
      slug: decodeURIComponent(joinMatch[1]),
      qrToken: kParam,
      ticketId: '',
    };
  }

  const ticketMatch = path.match(/^\/t\/([^/]+)\/?$/);
  if (ticketMatch) {
    return {
      view: 'ticket',
      dashboardTab: 'today',
      slug: '',
      qrToken: kParam,
      ticketId: decodeURIComponent(ticketMatch[1]),
    };
  }

  if (path === '/dashboard/stats') {
    return {
      view: 'dashboard',
      dashboardTab: 'stats',
      slug: '',
      qrToken: kParam,
      ticketId: '',
    };
  }

  if (path === '/dashboard/qr') {
    return {
      view: 'dashboard',
      dashboardTab: 'qr',
      slug: '',
      qrToken: kParam,
      ticketId: '',
    };
  }

  return {
    view: 'dashboard',
    dashboardTab: 'today',
    slug: '',
    qrToken: kParam,
    ticketId: '',
  };
}

// Shown for join/TV links that are missing the shop slug.
function ShopNotFound() {
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Shop not found</h2>
        <p className="text-xs text-slate-600">
          Scan the QR code at the shop to open its queue.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState<RouteState>(() => parseInitialRoute());

  const navigateToDashboard = (tab: DashboardSubTab = 'today') => {
    const nextPath =
      tab === 'stats'
        ? '/dashboard/stats'
        : tab === 'qr'
          ? '/dashboard/qr'
          : '/dashboard';
    window.history.pushState({}, '', nextPath);
    setRoute((prev) => ({
      ...prev,
      view: 'dashboard',
      dashboardTab: tab,
    }));
  };

  const navigateToJoin = (slug: string, qrToken: string) => {
    const nextUrl = qrToken
      ? `/q/${encodeURIComponent(slug)}?k=${encodeURIComponent(qrToken)}`
      : `/q/${encodeURIComponent(slug)}`;
    window.history.pushState({}, '', nextUrl);
    setRoute((prev) => ({
      ...prev,
      view: 'join',
      slug,
      qrToken,
    }));
  };

  const navigateToTicket = (ticketId: string) => {
    const nextUrl = `/t/${encodeURIComponent(ticketId)}`;
    window.history.pushState({}, '', nextUrl);
    setRoute((prev) => ({
      ...prev,
      view: 'ticket',
      ticketId,
    }));
  };

  const navigateToTv = (slug: string) => {
    const nextUrl = `/q/${encodeURIComponent(slug)}/display`;
    window.history.pushState({}, '', nextUrl);
    setRoute((prev) => ({
      ...prev,
      view: 'tv',
      slug,
    }));
  };

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseInitialRoute());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col">
        {/* Top Bar: wordmark + owner navigation */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 h-14 border-b border-slate-200 bg-white/95 backdrop-blur-md">
          {/* Wordmark */}
          <a
            href="/dashboard"
            onClick={(e) => {
              e.preventDefault();
              navigateToDashboard('today');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap"
          >
            PilaPH
          </a>

          {/* Owner navigation links */}
          <nav className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-medium text-slate-600 overflow-x-auto">
            <a
              href="/dashboard"
              onClick={(e) => {
                e.preventDefault();
                navigateToDashboard('today');
              }}
              className={`hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap ${
                route.view === 'dashboard' && route.dashboardTab !== 'qr'
                  ? 'text-slate-900 font-semibold underline'
                  : ''
              }`}
            >
              Owner Dashboard
            </a>

            <a
              href="/dashboard/qr"
              onClick={(e) => {
                e.preventDefault();
                navigateToDashboard('qr');
              }}
              className={`hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap ${
                route.view === 'dashboard' && route.dashboardTab === 'qr'
                  ? 'text-slate-900 font-semibold underline'
                  : ''
              }`}
            >
              QR Poster
            </a>
          </nav>
        </header>

        {/* Main Viewport Content */}
        <main className="flex-1">
          {route.view === 'dashboard' && (
            <OwnerDashboardView
              activeSubTab={route.dashboardTab}
              onChangeSubTab={(tab) => navigateToDashboard(tab)}
              onOpenTicketPage={(ticketId) => navigateToTicket(ticketId)}
              onOpenJoinPage={(slug, token) => navigateToJoin(slug, token)}
              onOpenTvDisplay={(slug) => navigateToTv(slug)}
            />
          )}

          {(route.view === 'join' || route.view === 'tv') && !route.slug && (
            <ShopNotFound />
          )}

          {route.view === 'join' && route.slug && (
            <CustomerJoinView
              slug={route.slug}
              qrToken={route.qrToken}
              onNavigateToTicket={(ticketId) => navigateToTicket(ticketId)}
            />
          )}

          {route.view === 'ticket' && (
            <CustomerTicketView
              ticketId={route.ticketId}
              // Rejoining requires scanning the shop QR again, so no token here.
              onBackToJoin={(slug) => navigateToJoin(slug, '')}
            />
          )}

          {route.view === 'tv' && route.slug && (
            <TvDisplayView slug={route.slug} />
          )}
        </main>

        <OfflineIndicator />
      </div>
    </AuthProvider>
  );
}
