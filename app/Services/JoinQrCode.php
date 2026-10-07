<?php

namespace App\Services;

use App\Models\Business;
use BaconQrCode\Common\ErrorCorrectionLevel;
use BaconQrCode\Encoder\Encoder;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Illuminate\Support\Facades\Cache;

/**
 * The QR code customers scan to join: the join page plus the shop's current
 * QR token. Only for the owner's poster and the TV display.
 */
class JoinQrCode
{
    /**
     * @return array{url: string, image: string}
     */
    public function forBusiness(Business $business): array
    {
        // On the address the page was opened at, so a QR shown on a phone-
        // reachable address (a LAN IP while testing) opens on phones too.
        $url = route('queue.join', ['business' => $business->slug, 'k' => $business->qr_token]);

        return [
            'url' => $url,
            // The TV refetches on every queue change; draw each code once.
            'image' => Cache::remember('join-qr:'.sha1($url), now()->addDay(), fn () => $this->svgDataUri($url)),
        ];
    }

    private function svgDataUri(string $text): string
    {
        $writer = new Writer(new ImageRenderer(new RendererStyle(512, 2), new SvgImageBackEnd));
        // Medium error correction still scans when a poster gets a little scuffed.
        $svg = $writer->writeString($text, Encoder::DEFAULT_BYTE_MODE_ENCODING, ErrorCorrectionLevel::M());

        return 'data:image/svg+xml;base64,'.base64_encode($svg);
    }
}
