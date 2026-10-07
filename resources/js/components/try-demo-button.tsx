import { Form, usePage } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import { store } from '@/routes/demo';

/** Signs in as the public demo's sample shop owner (only when DEMO_ENABLED). */
export default function TryDemoButton({
    label = 'Try the demo',
    variant = 'outline',
    className,
}: {
    label?: string;
    variant?: 'default' | 'outline';
    className?: string;
}) {
    const { demo } = usePage().props;

    if (!demo.enabled) {
        return null;
    }

    return (
        <Form {...store.form()} className={className}>
            {({ processing }) => (
                <Button
                    type="submit"
                    variant={variant}
                    disabled={processing}
                    className="w-full"
                >
                    {label}
                </Button>
            )}
        </Form>
    );
}
