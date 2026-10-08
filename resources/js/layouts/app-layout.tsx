import { useEffect } from 'react';
import DemoBanner from '@/components/demo-banner';
import PlanBanner from '@/components/plan-banner';
import AppLayoutTemplate from '@/layouts/app/app-sidebar-layout';
import { registerServiceWorker } from '@/lib/push';
import type { BreadcrumbItem } from '@/types';

export default function AppLayout({
    breadcrumbs = [],
    children,
}: {
    breadcrumbs?: BreadcrumbItem[];
    children: React.ReactNode;
}) {
    // Owner pages: the service worker shows push alerts and lets the
    // dashboard be installed as an app.
    useEffect(() => {
        void registerServiceWorker();
    }, []);

    return (
        <AppLayoutTemplate breadcrumbs={breadcrumbs}>
            <DemoBanner />
            <PlanBanner />
            {children}
        </AppLayoutTemplate>
    );
}
