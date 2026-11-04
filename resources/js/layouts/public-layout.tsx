import { usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import AppLogoIcon from '@/components/app-logo-icon';

/**
 * Layout for customer pages (join, ticket): phone-first, no login, no sidebar.
 * Shops on a paid plan don't show the PilaPH name.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
    const { branding } = usePage<{ branding?: boolean }>().props;

    return (
        <div className="flex min-h-svh flex-col bg-background">
            <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-6 pb-10">
                {children}
            </main>
            {branding !== false && (
                <footer className="flex items-center justify-center gap-1.5 pb-6 text-xs text-muted-foreground">
                    <span className="flex size-5 items-center justify-center rounded bg-slate-900">
                        <AppLogoIcon className="size-4 fill-current text-emerald-500" />
                    </span>
                    Queue by PilaPH
                </footer>
            )}
        </div>
    );
}
