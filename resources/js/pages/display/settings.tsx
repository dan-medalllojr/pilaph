import { Form, Head } from '@inertiajs/react';
import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import DisplaySettingsController from '@/actions/App/Http/Controllers/Owner/DisplaySettingsController';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { edit } from '@/routes/display';

type Props = {
    displayUrl: string;
};

export default function DisplaySettings({ displayUrl }: Props) {
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(displayUrl);
            toast.success('Link copied.');
        } catch {
            toast.error("Couldn't copy. Select the link and copy it instead.");
        }
    };

    return (
        <>
            <Head title="TV display" />

            <div className="flex w-full max-w-2xl flex-col gap-8 p-4">
                <Heading
                    title="TV display"
                    description="Show the queue on a TV at your shop: who's being served, who's next, and the QR code to join."
                />

                <section className="grid gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="display-url">TV link</Label>
                        <div className="flex gap-2">
                            <Input
                                id="display-url"
                                value={displayUrl}
                                readOnly
                                onFocus={(event) => event.target.select()}
                                className="font-mono text-sm"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void copy()}
                            >
                                <Copy />
                                Copy
                            </Button>
                        </div>
                    </div>
                    <div>
                        <Button asChild>
                            <a
                                href={displayUrl}
                                target="_blank"
                                rel="noreferrer"
                            >
                                <ExternalLink />
                                Open TV display
                            </a>
                        </Button>
                    </div>
                </section>

                <section className="grid gap-3">
                    <Heading variant="small" title="How to set it up" />
                    <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-muted-foreground">
                        <li>
                            On the TV, or a laptop or tablet connected to it,
                            open the web browser.
                        </li>
                        <li>Type the TV link above and open it.</li>
                        <li>
                            Press <strong>Full screen</strong>. Turn{' '}
                            <strong>Sound</strong> on to hear a chime when a
                            number is called.
                        </li>
                    </ol>
                    <p className="text-sm text-muted-foreground">
                        The display shows your QR code, so anyone with this link
                        could join without being at your shop. Only open it on
                        your own screens.
                    </p>
                </section>

                <Separator />

                <section className="grid gap-4">
                    <Heading
                        variant="small"
                        title="Reset the link"
                        description="Shared the link by mistake? Get a new one. Screens on the old link stop showing the queue."
                    />
                    <div>
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="outline">Reset TV link</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogTitle>Reset the TV link?</DialogTitle>
                                <DialogDescription>
                                    Your TV stops showing the queue until you
                                    open the new link on it.
                                </DialogDescription>
                                <Form
                                    {...DisplaySettingsController.reset.form()}
                                    options={{ preserveScroll: true }}
                                >
                                    {({ processing }) => (
                                        <DialogFooter className="gap-2">
                                            <DialogClose asChild>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                >
                                                    Cancel
                                                </Button>
                                            </DialogClose>
                                            <Button
                                                variant="destructive"
                                                disabled={processing}
                                            >
                                                Reset link
                                            </Button>
                                        </DialogFooter>
                                    )}
                                </Form>
                            </DialogContent>
                        </Dialog>
                    </div>
                </section>
            </div>
        </>
    );
}

DisplaySettings.layout = {
    breadcrumbs: [
        {
            title: 'TV display',
            href: edit(),
        },
    ],
};
