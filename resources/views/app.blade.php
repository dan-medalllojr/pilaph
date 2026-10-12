<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" @class(['dark' => ($appearance ?? 'system') == 'dark'])>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        {{-- Inline script to detect system dark mode preference and apply it immediately --}}
        <script>
            (function() {
                const appearance = '{{ $appearance ?? "system" }}';

                if (appearance === 'system') {
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

                    if (prefersDark) {
                        document.documentElement.classList.add('dark');
                    }
                }
            })();
        </script>

        {{-- Inline style to set the HTML background color based on our theme in app.css --}}
        <style>
            html {
                background-color: oklch(1 0 0);
            }

            html.dark {
                background-color: oklch(0.145 0 0);
            }
        </style>

        <link rel="icon" href="/favicon.ico" sizes="any">
        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">

        {{-- The preview card when a link is shared on Facebook, Messenger, Viber
             and the like. The address is without its query, so a join link's
             daily QR key never ends up in a preview. --}}
        <meta name="description" content="A virtual queue for barbershops, clinics, repair shops and any business with a daily line. Customers scan a QR code, get a number on their phone and come back when it's their turn.">
        <meta property="og:type" content="website">
        <meta property="og:site_name" content="PilaPH">
        <meta property="og:title" content="PilaPH: no more crowded waiting areas">
        <meta property="og:description" content="Customers scan a QR code, get a number on their phone and see their place in line live. Their phone rings when it's their turn.">
        <meta property="og:url" content="{{ url()->current() }}">
        <meta property="og:image" content="{{ asset('images/og-image.jpg') }}">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        <meta property="og:image:alt" content="PilaPH: a customer's ticket number and place in line, and the 'It's your turn!' screen">
        <meta name="twitter:card" content="summary_large_image">

        {{-- The owner app is installable (start page: dashboard). Customer pages
             and the TV display aren't, so customers aren't offered to install it. --}}
        @unless (request()->is('q/*', 't/*', 'tv/*'))
            <link rel="manifest" href="/manifest.webmanifest">
            <meta name="theme-color" content="#0F172A">
            <meta name="mobile-web-app-capable" content="yes">
            <meta name="apple-mobile-web-app-capable" content="yes">
            <meta name="apple-mobile-web-app-title" content="PilaPH">
        @endunless

        @fonts

        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
        <x-inertia::head>
            <title>{{ config('app.name', 'Laravel') }}</title>
        </x-inertia::head>
    </head>
    <body class="font-sans antialiased">
        <x-inertia::app />
    </body>
</html>
