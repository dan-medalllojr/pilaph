import type { Auth } from '@/types/auth';
import type { CurrentBusiness } from '@/types/business';

declare module 'react' {
    interface InputHTMLAttributes<T> {
        passwordrules?: string;
    }
}

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            name: string;
            auth: Auth;
            business: CurrentBusiness | null;
            sidebarOpen: boolean;
            /** The public demo (config/demo.php). */
            demo: { enabled: boolean; active: boolean };
            /** VAPID public key for push alerts; null for guests. */
            webPushKey: string | null;
            [key: string]: unknown;
        };
    }
}
