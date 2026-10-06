import { Form, Head } from '@inertiajs/react';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import ServiceController from '@/actions/App/Http/Controllers/Owner/ServiceController';
import ConfirmDeleteDialog from '@/components/confirm-delete-dialog';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
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
import { index } from '@/routes/services';
import type { ServiceItem } from '@/types';

export default function Services({ services }: { services: ServiceItem[] }) {
    return (
        <>
            <Head title="Services" />

            <div className="flex w-full max-w-3xl flex-col gap-8 p-4">
                <Heading
                    title="Services"
                    description="What customers can line up for. Each service gets its own ticket letter, e.g. A-024."
                />

                <AddServiceForm />

                {services.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        No services yet. Add your first one above, e.g.
                        &ldquo;Haircut&rdquo; with letter A.
                    </p>
                ) : (
                    <ul className="divide-y rounded-lg border">
                        {services.map((service) => (
                            <ServiceRow key={service.id} service={service} />
                        ))}
                    </ul>
                )}
            </div>
        </>
    );
}

function AddServiceForm() {
    return (
        <Form
            {...ServiceController.store.form()}
            options={{ preserveScroll: true }}
            resetOnSuccess
            className="grid gap-3 rounded-lg border p-4"
        >
            {({ processing, errors }) => (
                <>
                    <h3 className="text-sm font-medium">Add a service</h3>
                    <div className="grid gap-3 sm:grid-cols-[1fr_6rem_8rem_auto] sm:items-end">
                        <div className="grid gap-2">
                            <Label htmlFor="new-name">Name</Label>
                            <Input
                                id="new-name"
                                name="name"
                                required
                                maxLength={60}
                                placeholder="e.g. Haircut"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="new-prefix">Letter</Label>
                            <Input
                                id="new-prefix"
                                name="prefix"
                                required
                                maxLength={3}
                                placeholder="A"
                                className="font-mono uppercase"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="new-minutes">Minutes each</Label>
                            <Input
                                id="new-minutes"
                                name="default_minutes"
                                type="number"
                                min={1}
                                max={240}
                                required
                                defaultValue={15}
                            />
                        </div>
                        <Button type="submit" disabled={processing}>
                            Add
                        </Button>
                    </div>
                    <InputError message={errors.name} />
                    <InputError message={errors.prefix} />
                    <InputError message={errors.default_minutes} />
                    <p className="text-xs text-muted-foreground">
                        &ldquo;Minutes each&rdquo; is only a starting guess for
                        wait times; estimates switch to your real service times
                        once you&apos;ve served a few customers.
                    </p>
                </>
            )}
        </Form>
    );
}

function ServiceRow({ service }: { service: ServiceItem }) {
    return (
        <li className="flex flex-wrap items-center gap-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-md bg-muted font-mono font-semibold">
                {service.prefix}
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{service.name}</p>
                <p className="text-xs text-muted-foreground">
                    About {service.default_minutes} min per customer
                </p>
            </div>

            <ActiveToggle service={service} />
            <EditServiceDialog service={service} />
            <ConfirmDeleteDialog
                form={ServiceController.destroy.form(service.id)}
                itemName={service.name}
                blockedReason={
                    service.has_tickets
                        ? 'It has ticket history, which your stats rely on. Switch it off instead, so customers can no longer pick it.'
                        : undefined
                }
            />
        </li>
    );
}

function ActiveToggle({ service }: { service: ServiceItem }) {
    return (
        <Form
            {...ServiceController.update.form(service.id)}
            options={{ preserveScroll: true }}
        >
            {({ processing }) => (
                <>
                    <input
                        type="hidden"
                        name="is_active"
                        value={service.is_active ? '0' : '1'}
                    />
                    <button
                        type="submit"
                        disabled={processing}
                        title={
                            service.is_active
                                ? 'Customers can pick this. Click to switch off.'
                                : 'Hidden from customers. Click to switch on.'
                        }
                    >
                        <Badge
                            variant={service.is_active ? 'default' : 'outline'}
                        >
                            {service.is_active ? 'Active' : 'Off'}
                        </Badge>
                    </button>
                </>
            )}
        </Form>
    );
}

function EditServiceDialog({ service }: { service: ServiceItem }) {
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${service.name}`}
                >
                    <Pencil />
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogTitle>Edit service</DialogTitle>
                <DialogDescription>
                    Changing the letter only affects new tickets.
                </DialogDescription>

                <Form
                    {...ServiceController.update.form(service.id)}
                    options={{ preserveScroll: true }}
                    onSuccess={() => setOpen(false)}
                    className="grid gap-4"
                >
                    {({ processing, errors }) => (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor={`name-${service.id}`}>
                                    Name
                                </Label>
                                <Input
                                    id={`name-${service.id}`}
                                    name="name"
                                    required
                                    maxLength={60}
                                    defaultValue={service.name}
                                />
                                <InputError message={errors.name} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor={`prefix-${service.id}`}>
                                        Letter
                                    </Label>
                                    <Input
                                        id={`prefix-${service.id}`}
                                        name="prefix"
                                        required
                                        maxLength={3}
                                        defaultValue={service.prefix}
                                        className="font-mono uppercase"
                                    />
                                    <InputError message={errors.prefix} />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor={`minutes-${service.id}`}>
                                        Minutes each
                                    </Label>
                                    <Input
                                        id={`minutes-${service.id}`}
                                        name="default_minutes"
                                        type="number"
                                        min={1}
                                        max={240}
                                        required
                                        defaultValue={service.default_minutes}
                                    />
                                    <InputError
                                        message={errors.default_minutes}
                                    />
                                </div>
                            </div>
                            <DialogFooter className="gap-2">
                                <DialogClose asChild>
                                    <Button variant="secondary" type="button">
                                        Cancel
                                    </Button>
                                </DialogClose>
                                <Button type="submit" disabled={processing}>
                                    Save
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </Form>
            </DialogContent>
        </Dialog>
    );
}

Services.layout = {
    breadcrumbs: [
        {
            title: 'Services',
            href: index(),
        },
    ],
};
