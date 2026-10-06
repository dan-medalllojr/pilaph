import { getSupabaseAdmin } from './supabase-admin.ts';

const BUCKET = 'shop-photos';
export const MAX_SHOP_PHOTO_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
export const SHOP_PHOTO_TYPES = Object.keys(EXTENSIONS);

// Checks the file's leading bytes so a renamed non-image is rejected.
export function isImageOfType(bytes: Buffer, contentType: string): boolean {
  if (contentType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === 'image/png') {
    return bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  }
  if (contentType === 'image/webp') {
    return (
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

// Creates the public bucket on first use so new environments need no manual setup.
let bucketReady: Promise<void> | null = null;
function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const storage = getSupabaseAdmin().storage;
    const { data } = await storage.getBucket(BUCKET);
    if (data) return;
    const { error } = await storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_SHOP_PHOTO_BYTES,
      allowedMimeTypes: SHOP_PHOTO_TYPES,
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  })().catch((err) => {
    bucketReady = null;
    throw err;
  });
  return bucketReady;
}

export async function uploadShopPhoto(
  businessId: number,
  bytes: Buffer,
  contentType: string
): Promise<string> {
  await ensureBucket();
  const bucket = getSupabaseAdmin().storage.from(BUCKET);
  // A new file name per upload, so browsers and the CDN never show a stale photo.
  const objectPath = `${businessId}/${Date.now()}.${EXTENSIONS[contentType]}`;
  const { error } = await bucket.upload(objectPath, bytes, {
    contentType,
    // Kept short: the CDN can keep serving a removed photo until this expires.
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return bucket.getPublicUrl(objectPath).data.publicUrl;
}

// Best effort: a leftover file only costs storage, so failures are logged, not thrown.
export async function removeShopPhoto(publicUrl: string | null): Promise<void> {
  if (!publicUrl) return;
  const marker = `/object/public/${BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return;
  const objectPath = decodeURIComponent(publicUrl.slice(index + marker.length));
  const { error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .remove([objectPath]);
  if (error) console.error('Failed to remove old shop photo:', error);
}
