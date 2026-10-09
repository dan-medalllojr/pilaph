import { usePage } from '@inertiajs/react';
import { HeartHandshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

/**
 * At the bottom of owner pages: a quiet way to support the developer while
 * PilaPH is free. The QR image loads only when the owner opens it.
 */
export default function SupportDeveloper() {
    const { support } = usePage().props;

    if (!support) {
        return null;
    }

    return (
        <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 px-4 pt-8 pb-6 text-sm text-muted-foreground">
            <p>
                PilaPH is free while it grows. If it helps your shop, you can
                support the developer.
            </p>
            <Dialog>
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                        <HeartHandshake />
                        Support the developer
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-sm">
                    <DialogTitle>Support the developer</DialogTitle>
                    <DialogDescription>
                        Scan with GCash, Maya or your bank app. Any amount helps
                        keep PilaPH running. Thank you!
                    </DialogDescription>
                    <img
                        src={support.qr_url}
                        alt="QR code to send a tip to the developer"
                        className="mx-auto aspect-square w-full max-w-72 rounded-lg border bg-white object-contain p-2"
                    />
                </DialogContent>
            </Dialog>
        </footer>
    );
}
