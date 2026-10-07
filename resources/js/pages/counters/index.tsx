import { Form, Head } from '@inertiajs/react';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import CounterController from '@/actions/App/Http/Controllers/Owner/CounterController';
import ConfirmDeleteDialog from '@/components/confirm-delete-dialog';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { index } from '@/routes/counters';
import type { CounterItem } from '@/types';

export default function Counters({ counters }: { counters: CounterItem[] }) {
    return (
        <>
            <Head title="Counters" />

            <div className="flex w-full max-w-3xl flex-col gap-8 p-4">
                <Heading
                    title="Counters"
                    description="Where customers are served, e.g. a chair, window or doctor's room. Active counters appear on the TV display."
                />

                <Form
                    {...CounterController.store.form()}
                    options={{ preserveScroll: true }}
                    resetOnSuccess
                    className="grid gap-3 rounded-lg border p-4"
                >
                    {({ processing, errors }) => (
                        <>
                            <h3 className="text-sm font-medium">
                                Add a counter
                            </h3>
                            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                                <div className="grid gap-2">
                                    <Label htmlFor="new-name">Name</Label>
                                    <Input
                                        id="new-name"
                                        name="name"
                                        required
                                        maxLength={40}
                                        placeholder="e.g. Chair 1"
                                    />
                                </div>
                                <Button type="submit" disabled={processing}>
                                    Add
                                </Button>
                            </div>
                            <InputError message={errors.name} />
                        </>
                    )}
                </Form>

                {counters.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        No counters yet. Add one for each place customers are
                        served.
                    </p>
                ) : (
                    <ul className="divide-y rounded-lg border">
                        {counters.map((counter) => (
                            <CounterRow key={counter.id} counter={counter} />
                        ))}
                    </ul>
                )}
            </div>
        </>
    );
}

function CounterRow({ counter }: { counter: CounterItem }) {
    return (
        <li className="flex flex-wrap items-center gap-3 p-4">
            <p className="min-w-0 flex-1 truncate font-medium">
                {counter.name}
            </p>

            <Form
                {...CounterController.update.form(counter.id)}
                options={{ preserveScroll: true }}
            >
                {({ processing }) => (
                    <>
                        <input
                            type="hidden"
                            name="is_active"
                            value={counter.is_active ? '0' : '1'}
                        />
                        <button
                            type="submit"
                            disabled={processing}
                            title={
                                counter.is_active
                                    ? 'Serving customers. Click to switch off.'
                                    : 'Not serving. Click to switch on.'
                            }
                        >
                            <Badge
                                variant={
                                    counter.is_active ? 'default' : 'outline'
                                }
                            >
                                {counter.is_active ? 'Active' : 'Off'}
                            </Badge>
                        </button>
                    </>
                )}
            </Form>

            <RenameCounterDialog counter={counter} />
            <ConfirmDeleteDialog
                form={CounterController.destroy.form(counter.id)}
                itemName={counter.name}
                blockedReason={
                    counter.has_tickets
                        ? 'It has served tickets, which your stats rely on. Switch it off instead, so it no longer calls customers.'
                        : undefined
                }
            />
        </li>
    );
}

function RenameCounterDialog({ counter }: { counter: CounterItem }) {
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Rename ${counter.name}`}
                >
                    <Pencil />
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogTitle>Rename counter</DialogTitle>

                <Form
                    {...CounterController.update.form(counter.id)}
                    options={{ preserveScroll: true }}
                    onSuccess={() => setOpen(false)}
                    className="grid gap-4"
                >
                    {({ processing, errors }) => (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor={`name-${counter.id}`}>
                                    Name
                                </Label>
                                <Input
                                    id={`name-${counter.id}`}
                                    name="name"
                                    required
                                    maxLength={40}
                                    defaultValue={counter.name}
                                />
                                <InputError message={errors.name} />
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

Counters.layout = {
    breadcrumbs: [
        {
            title: 'Counters',
            href: index(),
        },
    ],
};
