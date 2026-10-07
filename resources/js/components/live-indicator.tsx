/**
 * Shows whether the page is getting live updates or checking periodically.
 */
export default function LiveIndicator({ live }: { live: boolean }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
                className={`size-1.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`}
            />
            {live ? 'Live' : 'Checking every 20 s'}
        </span>
    );
}
