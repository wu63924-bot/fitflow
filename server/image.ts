import { ApiError } from './errors.ts';
export const maxImageBytes = 1024 * 1024;
export async function validateImage(image: FormDataEntryValue | null): Promise<Blob> {
  if (!(image instanceof Blob) || !image.size) throw new ApiError('INVALID_IMAGE');
  if (image.size > maxImageBytes) throw new ApiError('IMAGE_TOO_LARGE');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) throw new ApiError('UNSUPPORTED_IMAGE');
  const bytes = Buffer.from(await image.slice(0, 12).arrayBuffer());
  const matches = image.type === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff : image.type === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!matches) throw new ApiError('INVALID_IMAGE');
  return image;
}
