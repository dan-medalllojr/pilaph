import { Link, usePage } from '@inertiajs/react';
import AppLogoIcon from '@/components/app-logo-icon';
import { Button } from '@/components/ui/button';
import { dashboard, login, pricing, register } from '@/routes';

/** The header of the public site: the landing page and pricing. */
export default function SiteHeader() {
    const { auth } = usePage().props;

    return (
        <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
                <span className="flex size-8 items-center justify-center rounded-md bg-slate-900">
                    <AppLogoIcon className="size-6 fill-current text-emerald-500" />
                </span>
                PilaPH
            </Link>
            <nav className="flex items-center gap-1 text-sm sm:gap-2">
                <Button asChild size="sm" variant="ghost">
                    <Link href={pricing()}>Pricing</Link>
                </Button>
                {auth.user ? (
                    <Button asChild size="sm">
                        <Link href={dashboard()}>Dashboard</Link>
                    </Button>
                ) : (
                    <>
                        <Button asChild size="sm" variant="ghost">
                            <Link href={login()}>Log in</Link>
                        </Button>
                        <Button asChild size="sm">
                            <Link href={register()}>Sign up</Link>
                        </Button>
                    </>
                )}
            </nav>
        </header>
    );
}

export function SiteFooter() {
    return (
        <footer className="border-t py-6 text-center text-xs text-muted-foreground">
            PilaPH · Made for Philippine small businesses
        </footer>
    );
}
