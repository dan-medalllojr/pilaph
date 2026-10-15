import { Link, router } from '@inertiajs/react';
import { ImagePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { shrinkPhoto } from '@/lib/shrink-photo';
import { destroy, store } from '@/routes/business/photo';
import { show as planShow } from '@/routes/plan';

/**
 * The photo at the top of the customer join page. Part of the paid plans:
 * after a plan ends the photo is kept, but hidden until it's renewed.
 */
export default function ShopPhotoField({
    photoUrl,
    allowed,
}: {
    photoUrl: string | null;
    allowed: boolean;
}) {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>();

    const upload = async (file: File) => {
        setError(undefined);
        setBusy(true);

        let photo: File;
        try {
            photo = await shrinkPhoto(file);
        } catch {
            setError("Couldn't read that photo. Please choose a JPG or PNG.");
            setBusy(false);

            return;
        }

        router.post(
            store.url(),
            { photo },
            {
                forceFormData: true,
                preserveScroll: true,
                onError: (errors) =>
                    setError(errors.photo ?? "Couldn't save the photo."),
                onFinish: () => {
                    setBusy(false);
                    if (input.current) {
                        input.current.value = '';
                    }
                },
            },
        );
    };

    const remove = () =>
        router.delete(destroy.url(), {
            preserveScroll: true,
            onStart: () => setBusy(true),
            onFinish: () => setBusy(false),
        });

    return (
        <section className="grid gap-4">
            <Heading
                variant="small"
                title="Shop photo"
                description={
                    allowed
                        ? 'Shown at the top of the page customers see when they scan your QR code.'
                        : 'Comes with the Basic and Pro plans: shown at the top of the page customers see when they scan your QR code.'
                }
            />

            {photoUrl && (
                <img
                    src={photoUrl}
                    alt="Your shop"
                    className="aspect-video w-full max-w-md rounded-lg border object-cover"
                />
            )}
            {photoUrl && !allowed && (
                <p className="text-sm text-muted-foreground">
                    Hidden from customers on your current plan.
                </p>
            )}
            {!photoUrl && (
                <div className="flex aspect-video w-full max-w-md flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
                    <ImagePlus className="size-6" />
                    No photo yet
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                <input
                    ref={input}
                    id="shop-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                            void upload(file);
                        }
                    }}
                />
                {allowed ? (
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => input.current?.click()}
                    >
                        {busy && <Spinner />}
                        {photoUrl ? 'Change photo' : 'Add a photo'}
                    </Button>
                ) : (
                    <Button asChild variant="outline">
                        <Link href={planShow()}>See plans</Link>
                    </Button>
                )}
                {photoUrl && (
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={remove}
                    >
                        Remove
                    </Button>
                )}
            </div>
            <InputError message={error} />
        </section>
    );
}
