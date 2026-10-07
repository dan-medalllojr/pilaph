import { Form, usePage } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import { destroy } from '@/routes/demo';

/** Shown on owner pages while signed in to the shared demo account. */
export default function DemoBanner() {
    const { demo } = usePage().props;

    if (!demo.active) {
        return null;
    }

    return (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-emerald-50 px-4 py-2 text-sm text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
            <p>
                You&apos;re trying PilaPH with a sample shop. Anyone can use it,
                and it starts fresh every hour.
            </p>
            <Form {...destroy.form()}>
                {({ processing }) => (
                    <Button size="sm" type="submit" disabled={processing}>
                        Set up your own shop
                    </Button>
                )}
            </Form>
        </div>
    );
}
