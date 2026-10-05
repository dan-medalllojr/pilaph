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
  const slugParam = params.get('slug') || 'juans-barbershop';
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
      slug: 'juans-barbershop',
      qrToken: kParam,
      ticketId: decodeURIComponent(ticketMatch[1]),
    };
  }

  if (path === '/dashboard/stats') {
    return {
      view: 'dashboard',
      dashboardTab: 'stats',
      slug: 'juans-barbershop',
      qrToken: kParam,
      ticketId: '',
    };
  }

  if (path === '/dashboard/qr') {
    return {
      view: 'dashboard',
      dashboardTab: 'qr',
      slug: 'juans-barbershop',
      qrToken: kParam,
      ticketId: '',
    };
  }

  return {
    view: 'dashboard',
    dashboardTab: 'today',
    slug: 'juans-barbershop',
    qrToken: kParam,
    ticketId: '',
  };
}

export default function App() {
  const [route, setRoute] = useState<RouteState>(() => parseInitialRoute());
  const [demoOverview, setDemoOverview] = useState<{
    slug: string;
    qrToken: string;
    sampleWaitingTicketId: string | null;
    sampleCalledTicketId: string | null;
  }>({
    slug: 'juans-barbershop',
    qrToken: 'juan-makati-2026',
    sampleWaitingTicketId: null,
    sampleCalledTicketId: null,
  });

  useEffect(() => {
    fetch('/api/demo/overview')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setDemoOverview({
            slug: data.slug || 'juans-barbershop',
            qrToken: data.qrToken || 'juan-makati-2026',
            sampleWaitingTicketId: data.sampleWaitingTicketId || null,
            sampleCalledTicketId: data.sampleCalledTicketId || null,
          });
          setRoute((prev) => ({
            ...prev,
            qrToken: prev.qrToken || data.qrToken || 'juan-makati-2026',
            ticketId:
              prev.ticketId ||
              data.sampleWaitingTicketId ||
              data.sampleCalledTicketId ||
              '',
          }));
        }
      })
      .catch(() => {
        // Ignore
      });
  }, []);

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
    const nextUrl = `/q/${encodeURIComponent(slug)}?k=${encodeURIComponent(
      qrToken
    )}`;
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
        {/* Strict 3-Zone Top Bar Contract */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 h-14 border-b border-slate-200 bg-white/95 backdrop-blur-md">
          {/* Zone 1: Single text element wordmark */}
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

          {/* Zone 2: 4-5 clean text navigation links */}
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
              href={`/q/${demoOverview.slug}?k=${demoOverview.qrToken}`}
              onClick={(e) => {
                e.preventDefault();
                navigateToJoin(demoOverview.slug, demoOverview.qrToken);
              }}
              className={`hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap ${
                route.view === 'join'
                  ? 'text-slate-900 font-semibold underline'
                  : ''
              }`}
            >
              Customer Join
            </a>

            <a
              href={`/t/${
                route.ticketId ||
                demoOverview.sampleWaitingTicketId ||
                'demo-ticket'
              }`}
              onClick={(e) => {
                e.preventDefault();
                const targetTicket =
                  localStorage.getItem(
                    `pilaph_active_ticket_${demoOverview.slug}`
                  ) ||
                  route.ticketId ||
                  demoOverview.sampleWaitingTicketId ||
                  demoOverview.sampleCalledTicketId;
                if (targetTicket) {
                  navigateToTicket(targetTicket);
                } else {
                  navigateToJoin(demoOverview.slug, demoOverview.qrToken);
                }
              }}
              className={`hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap ${
                route.view === 'ticket'
                  ? 'text-slate-900 font-semibold underline'
                  : ''
              }`}
            >
              Live Ticket
            </a>

            <a
              href={`/q/${demoOverview.slug}/display`}
              onClick={(e) => {
                e.preventDefault();
                navigateToTv(demoOverview.slug);
              }}
              className={`hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap ${
                route.view === 'tv'
                  ? 'text-slate-900 font-semibold underline'
                  : ''
              }`}
            >
              TV Display
            </a>

            <a
              href="/dashboard/qr"
              onClick={(e) => {
                e.preventDefault();
                navigateToDashboard('qr');
              }}
              className={`hidden md:inline hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap ${
                route.view === 'dashboard' && route.dashboardTab === 'qr'
                  ? 'text-slate-900 font-semibold underline'
                  : ''
              }`}
            >
              QR Poster
            </a>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                navigateToJoin(demoOverview.slug, demoOverview.qrToken)
              }
              className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              Scan QR Demo
            </button>
          </div>
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

          {route.view === 'join' && (
            <CustomerJoinView
              slug={route.slug || demoOverview.slug}
              qrToken={route.qrToken}
              validDemoQrToken={demoOverview.qrToken}
              onNavigateToTicket={(ticketId) => navigateToTicket(ticketId)}
              onSimulateValidQrScan={() =>
                navigateToJoin(
                  route.slug || demoOverview.slug,
                  demoOverview.qrToken
                )
              }
            />
          )}

          {route.view === 'ticket' && (
            <CustomerTicketView
              ticketId={
                route.ticketId ||
                demoOverview.sampleWaitingTicketId ||
                demoOverview.sampleCalledTicketId ||
                ''
              }
              onBackToJoin={(slug) =>
                navigateToJoin(slug, demoOverview.qrToken)
              }
            />
          )}

          {route.view === 'tv' && (
            <TvDisplayView
              slug={route.slug || demoOverview.slug}
              fallbackQrToken={demoOverview.qrToken}
            />
          )}
        </main>

        <OfflineIndicator />
      </div>
    </AuthProvider>
  );
}
