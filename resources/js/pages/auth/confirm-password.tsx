import { Form, Head } from '@inertiajs/react';
import GoogleSignInButton from '@/components/google-sign-in-button';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { store } from '@/routes/password/confirm';
import {
    index as confirmOptions,
    store as confirmStore,
} from '@/actions/Laravel/Passkeys/Http/Controllers/PasskeyConfirmationController';
import PasskeyVerify from '@/components/passkey-verify';

type Props = {
    /** False for owners who signed up with Google and never set a password. */
    hasPassword: boolean;
    canConfirmWithGoogle: boolean;
};

export default function ConfirmPassword({
    hasPassword,
    canConfirmWithGoogle,
}: Props) {
    return (
        <>
            <Head title="Confirm it's you" />

            <PasskeyVerify
                routes={{
                    options: confirmOptions(),
                    submit: confirmStore(),
                }}
                label="Confirm with passkey"
                loadingLabel="Confirming..."
                separator={hasPassword ? 'Or confirm with password' : false}
            >
                {canConfirmWithGoogle && (
                    <GoogleSignInButton label="Confirm with Google" />
                )}
            </PasskeyVerify>

            {hasPassword && (
                <Form {...store.form()} resetOnSuccess={['password']}>
                    {({ processing, errors }) => (
                        <div className="space-y-6">
                            <div className="grid gap-2">
                                <Label htmlFor="password">Password</Label>
                                <PasswordInput
                                    id="password"
                                    name="password"
                                    placeholder="Password"
                                    autoComplete="current-password"
                                    autoFocus
                                />

                                <InputError message={errors.password} />
                            </div>

                            <div className="flex items-center">
                                <Button
                                    className="w-full"
                                    disabled={processing}
                                    data-test="confirm-password-button"
                                >
                                    {processing && <Spinner />}
                                    Confirm password
                                </Button>
                            </div>
                        </div>
                    )}
                </Form>
            )}
        </>
    );
}

ConfirmPassword.layout = {
    title: "Confirm it's you",
    description: 'This is a secure area of the application.',
};
