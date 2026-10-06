import { useId } from 'react';
import type { SVGAttributes } from 'react';

/**
 * PilaPH mark in one colour (currentColor): a queue ticket with a perforation
 * and three people in line. Same shape as public/favicon.svg
 * (scripts/generate-icons.mjs); the dots are cut out so the background shows.
 */
export default function AppLogoIcon(props: SVGAttributes<SVGElement>) {
    // Unique per instance, so several logos on one page don't share a mask.
    const maskId = `pilaph-logo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

    return (
        <svg
            {...props}
            viewBox="56 56 400 400"
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <mask id={maskId}>
                    <rect width="512" height="512" fill="#fff" />
                    <path
                        d="M168 168V344"
                        stroke="#000"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray="0 25.14"
                    />
                    <circle cx="222" cy="256" r="26" fill="#000" />
                    <circle cx="290" cy="256" r="26" fill="#000" />
                    <circle cx="358" cy="256" r="26" fill="#000" />
                </mask>
            </defs>
            <path
                mask={`url(#${maskId})`}
                d="M104 136H408A40 40 0 0 1 448 176V220A36 36 0 0 0 448 292V336A40 40 0 0 1 408 376H104A40 40 0 0 1 64 336V292A36 36 0 0 0 64 220V176A40 40 0 0 1 104 136Z"
            />
        </svg>
    );
}
