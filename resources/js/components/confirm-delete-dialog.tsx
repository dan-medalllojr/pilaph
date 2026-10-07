import { Form } from '@inertiajs/react';
import { Trash2 } from 'lucide-react';
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
import type { RouteFormDefinition } from '@/wayfinder';

type Props = {
    /** The destroy route's form props, e.g. ServiceController.destroy.form(id). */
    form: RouteFormDefinition<'post'>;
    itemName: string;
    /** When set, deleting isn't possible; the dialog explains why instead. */
    blockedReason?: string;
};

export default function ConfirmDeleteDialog({
    form,
    itemName,
    blockedReason,
}: Props) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${itemName}`}
                >
                    <Trash2 />
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogTitle>
                    {blockedReason
                        ? `${itemName} can't be deleted`
                        : `Delete ${itemName}?`}
                </DialogTitle>
                <DialogDescription>
                    {blockedReason ?? 'This cannot be undone.'}
                </DialogDescription>

                {blockedReason ? (
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="secondary">OK</Button>
                        </DialogClose>
                    </DialogFooter>
                ) : (
                    <Form {...form} options={{ preserveScroll: true }}>
                        {({ processing }) => (
                            <DialogFooter className="gap-2">
                                <DialogClose asChild>
                                    <Button variant="secondary" type="button">
                                        Cancel
                                    </Button>
                                </DialogClose>
                                <Button
                                    variant="destructive"
                                    type="submit"
                                    disabled={processing}
                                >
                                    Delete
                                </Button>
                            </DialogFooter>
                        )}
                    </Form>
                )}
            </DialogContent>
        </Dialog>
    );
}
