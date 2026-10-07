import type { ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';

/** A horizontal rule with a short label in the middle, like "Or continue with email". */
export default function TextSeparator({ children }: { children: ReactNode }) {
    return (
        <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                    {children}
                </span>
            </div>
        </div>
    );
}
