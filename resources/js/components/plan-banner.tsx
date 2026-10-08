import { Link, usePage } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { show as planShow } from '@/routes/plan';

/**
 * Shown on owner pages when the shop's plan needs attention: the trial or
 * plan ends soon, or a limit is reached (PlanUsage::notice).
 */
export default function PlanBanner() {
    const page = usePage();
    const { planNotice } = page.props;

    // The Plan & billing page shows it in its own place.
    if (!planNotice || page.url.startsWith(planShow().url)) {
        return null;
    }

    return (
        <div
            role="status"
            className={cn(
                'flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm',
                planNotice.tone === 'warning'
                    ? 'bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100'
                    : 'bg-sky-50 text-sky-950 dark:bg-sky-950/40 dark:text-sky-100',
            )}
        >
            <p className="max-w-3xl">{planNotice.message}</p>
            <Button asChild size="sm" variant="outline">
                <Link href={planShow()}>
                    {planNotice.action === 'pay' ? 'Pay now' : 'See plans'}
                </Link>
            </Button>
        </div>
    );
}
