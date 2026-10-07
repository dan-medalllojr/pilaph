import { Form, Head } from '@inertiajs/react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { store } from '@/routes/business';

export default function BusinessSetup() {
    return (
        <>
            <Head title="Set up your shop" />
            <Form
                {...store.form()}
                disableWhileProcessing
                className="flex flex-col gap-6"
            >
                {({ processing, errors }) => (
                    <>
                        <div className="grid gap-2">
                            <Label htmlFor="name">Shop name</Label>
                            <Input
                                id="name"
                                name="name"
                                required
                                autoFocus
                                maxLength={80}
                                placeholder="e.g. Juan's Barbershop"
                            />
                            <p className="text-xs text-muted-foreground">
                                Customers see this name when they join your
                                queue. You can change it later.
                            </p>
                            <InputError message={errors.name} />
                        </div>

                        <Button type="submit" className="w-full">
                            {processing && <Spinner />}
                            Create shop
                        </Button>
                    </>
                )}
            </Form>
        </>
    );
}

BusinessSetup.layout = {
    title: 'Set up your shop',
    description: 'One quick step before you add your services and counters',
};
