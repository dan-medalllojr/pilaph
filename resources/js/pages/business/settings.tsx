import { Form, Head } from '@inertiajs/react';
import BusinessSettingsController from '@/actions/App/Http/Controllers/Owner/BusinessSettingsController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import ShopPhotoField from '@/components/shop-photo-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { edit } from '@/routes/business';
import type { BusinessSettings } from '@/types';

type Props = {
    business: BusinessSettings;
    joinUrl: string;
    photoUrl: string | null;
};

export default function ShopSettings({ business, joinUrl, photoUrl }: Props) {
    return (
        <>
            <Head title="Shop settings" />

            <div className="flex w-full max-w-2xl flex-col gap-8 p-4">
                <Heading
                    title="Shop settings"
                    description="How your queue behaves for customers"
                />

                {/* Its own uploads, outside the settings form below. */}
                <ShopPhotoField photoUrl={photoUrl} />

                <Form
                    {...BusinessSettingsController.update.form()}
                    options={{ preserveScroll: true }}
                    className="flex flex-col gap-8"
                >
                    {({ processing, errors }) => (
                        <>
                            <section className="grid gap-6">
                                <Heading
                                    variant="small"
                                    title="Shop"
                                    description="Shown to customers on the join page and TV display"
                                />

                                <div className="grid gap-2">
                                    <Label htmlFor="name">Shop name</Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        required
                                        maxLength={80}
                                        defaultValue={business.name}
                                    />
                                    <InputError message={errors.name} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="join-url">
                                        Customer link
                                    </Label>
                                    <Input
                                        id="join-url"
                                        value={joinUrl}
                                        readOnly
                                        className="font-mono text-sm text-muted-foreground"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Customers join through the QR code for
                                        this link. It stays the same so printed
                                        QR posters keep working.
                                    </p>
                                </div>
                            </section>

                            <Separator />

                            <section className="grid gap-6">
                                <Heading variant="small" title="Queue rules" />

                                <div className="grid gap-2">
                                    <Label htmlFor="near_threshold">
                                        Near-turn text at position
                                    </Label>
                                    <Input
                                        id="near_threshold"
                                        name="near_threshold"
                                        type="number"
                                        min={1}
                                        max={20}
                                        required
                                        defaultValue={business.near_threshold}
                                        className="w-32"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Customers who gave a phone number get an
                                        &ldquo;almost your turn&rdquo; SMS when
                                        they reach this place in line.
                                    </p>
                                    <InputError
                                        message={errors.near_threshold}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="max_waiting">
                                        Queue limit
                                    </Label>
                                    <Input
                                        id="max_waiting"
                                        name="max_waiting"
                                        type="number"
                                        min={1}
                                        max={1000}
                                        placeholder="No limit"
                                        defaultValue={
                                            business.max_waiting ?? undefined
                                        }
                                        className="w-32"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        New customers see &ldquo;Queue is
                                        full&rdquo; once this many are waiting.
                                        Leave empty for no limit.
                                    </p>
                                    <InputError message={errors.max_waiting} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="join_cutoff_time">
                                        Join cutoff
                                    </Label>
                                    <Input
                                        id="join_cutoff_time"
                                        name="join_cutoff_time"
                                        type="time"
                                        defaultValue={
                                            business.join_cutoff_time ??
                                            undefined
                                        }
                                        className="w-40"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        No new customers can join after this
                                        time each day ({business.timezone}).
                                        Leave empty to accept customers until
                                        you pause the queue.
                                    </p>
                                    <InputError
                                        message={errors.join_cutoff_time}
                                    />
                                </div>
                            </section>

                            <Separator />

                            <section className="grid gap-4">
                                <Heading
                                    variant="small"
                                    title="QR code security"
                                />

                                <div className="flex items-start gap-3">
                                    <Checkbox
                                        id="rotate_qr_daily"
                                        name="rotate_qr_daily"
                                        value="1"
                                        defaultChecked={
                                            business.rotate_qr_daily
                                        }
                                        className="mt-0.5"
                                    />
                                    <div className="grid gap-1">
                                        <Label htmlFor="rotate_qr_daily">
                                            Change the QR code every night
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            Stops people from joining remotely
                                            with yesterday&apos;s code. Only
                                            turn this on if you show the QR code
                                            on the TV display; a printed poster
                                            would stop working each morning.
                                        </p>
                                    </div>
                                </div>
                                <InputError message={errors.rotate_qr_daily} />
                            </section>

                            <div>
                                <Button disabled={processing}>
                                    Save settings
                                </Button>
                            </div>
                        </>
                    )}
                </Form>
            </div>
        </>
    );
}

ShopSettings.layout = {
    breadcrumbs: [
        {
            title: 'Shop settings',
            href: edit(),
        },
    ],
};
