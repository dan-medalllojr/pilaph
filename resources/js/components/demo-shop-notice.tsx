import { cn } from '@/lib/utils';

/**
 * On the demo shop's public pages. Anyone trying PilaPH can rename the sample
 * shop and its services, so its pages must not pass for a real business's.
 */
export default function DemoShopNotice({ tv = false }: { tv?: boolean }) {
    return (
        <p
            role="note"
            className={cn(
                tv
                    ? 'rounded-[1.5vmin] bg-amber-400/15 px-[2vmin] py-[1vmin] text-[2.4vmin] text-amber-100'
                    : 'rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100',
            )}
        >
            <span className="font-semibold">
                Demo shop, not a real business.
            </span>{' '}
            Anyone trying PilaPH can edit it, so don&apos;t pay anyone or share
            personal details because of what it says.
        </p>
    );
}
