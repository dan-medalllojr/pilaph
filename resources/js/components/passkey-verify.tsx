import type { UrlMethodPair } from '@inertiajs/core';
import { router } from '@inertiajs/react';
import { usePasskeyVerify } from '@laravel/passkeys/react';
import { KeyRound } from 'lucide-react';
import type { ReactNode } from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import TextSeparator from '@/components/text-separator';

type Props = {
    routes?: {
        options: UrlMethodPair;
        submit: UrlMethodPair;
    };
    label?: string;
    loadingLabel?: string;
    /** false hides the divider, when no password form follows. */
    separator?: string | false;
    /** Other sign-in buttons (like Google), shown above the passkey button. */
    children?: ReactNode;
};

export default function PasskeyVerify({
    routes,
    label,
    loadingLabel,
    separator,
    children,
}: Props = {}) {
    const { verify, isLoading, error, isSupported } = usePasskeyVerify({
        ...(routes && {
            routes: {
                options: routes.options.url,
                submit: routes.submit.url,
            },
        }),
        onSuccess: (response) => {
            router.visit(response.redirect ?? '/dashboard');
        },
    });

    if (!isSupported && !children) {
        return null;
    }

    return (
        <>
            <div className="grid gap-2">
                {children}
                {isSupported && (
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={verify}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <Spinner />
                        ) : (
                            <KeyRound className="h-4 w-4" />
                        )}
                        {isLoading
                            ? (loadingLabel ?? 'Authenticating...')
                            : (label ?? 'Sign in with a passkey')}
                    </Button>
                )}
                {error && (
                    <InputError message={error} className="text-center" />
                )}
            </div>

            {separator !== false && (
                <TextSeparator>
                    {separator ?? 'Or continue with email'}
                </TextSeparator>
            )}
        </>
    );
}
