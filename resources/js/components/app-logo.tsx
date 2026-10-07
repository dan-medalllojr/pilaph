import { usePage } from '@inertiajs/react';

import AppLogoIcon from '@/components/app-logo-icon';

export default function AppLogo() {
    const { name, business } = usePage().props;

    return (
        <>
            {/* Brand tile: emerald ticket on navy, like the app icon. */}
            <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-slate-900 dark:bg-slate-800">
                <AppLogoIcon className="size-6 fill-current text-emerald-500" />
            </div>
            <div className="ml-1 grid flex-1 text-left text-sm">
                <span className="truncate leading-tight font-semibold">
                    {name}
                </span>
                {business && (
                    <span className="truncate text-xs leading-tight text-muted-foreground">
                        {business.name}
                    </span>
                )}
            </div>
        </>
    );
}
