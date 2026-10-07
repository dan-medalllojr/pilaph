/**
 * Shrinks a photo to at most `maxSide` pixels on its longest side and saves
 * it as a JPEG before upload. Phone photos are often 5–12 MB; this makes them
 * a few hundred KB, and drops their metadata (like the GPS location).
 *
 * Drawn through an <img>, which every browser turns the right way up from
 * the photo's EXIF orientation.
 */
export async function shrinkPhoto(file: File, maxSide = 1600): Promise<File> {
    const url = URL.createObjectURL(file);

    try {
        const image = new Image();
        image.src = url;
        await image.decode();

        const scale = Math.min(
            1,
            maxSide / Math.max(image.naturalWidth, image.naturalHeight),
        );
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);

        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Canvas unavailable');
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', 0.85),
        );
        if (!blob) {
            throw new Error('Could not save the photo');
        }

        return new File([blob], 'shop-photo.jpg', { type: 'image/jpeg' });
    } finally {
        URL.revokeObjectURL(url);
    }
}
