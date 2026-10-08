import { Link } from '@inertiajs/react';
import {
    Armchair,
    ChartColumnBig,
    CreditCard,
    LayoutGrid,
    QrCode,
    Scissors,
    Store,
    Tv,
} from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { dashboard } from '@/routes';
import { edit as businessSettings } from '@/routes/business';
import { index as counters } from '@/routes/counters';
import { edit as tvDisplay } from '@/routes/display';
import { show as planShow } from '@/routes/plan';
import { show as qrPoster } from '@/routes/qr';
import { show as stats } from '@/routes/stats';
import { index as services } from '@/routes/services';
import type { NavItem } from '@/types';

const mainNavItems: NavItem[] = [
    {
        title: 'Dashboard',
        href: dashboard(),
        icon: LayoutGrid,
    },
    {
        title: 'Stats',
        href: stats(),
        icon: ChartColumnBig,
    },
    {
        title: 'Services',
        href: services(),
        icon: Scissors,
    },
    {
        title: 'Counters',
        href: counters(),
        icon: Armchair,
    },
    {
        title: 'QR poster',
        href: qrPoster(),
        icon: QrCode,
    },
    {
        title: 'TV display',
        href: tvDisplay(),
        icon: Tv,
    },
    {
        title: 'Shop settings',
        href: businessSettings(),
        icon: Store,
    },
    {
        title: 'Plan & billing',
        href: planShow(),
        icon: CreditCard,
    },
];

export function AppSidebar() {
    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={dashboard()} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={mainNavItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
