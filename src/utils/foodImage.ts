export interface ProcessedFoodImage { blob: Blob; width: number; height: number; originalBytes: number }

export async function compressFoodImage(file: File): Promise<ProcessedFoodImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPEG、PNG 或 WebP 图片；HEIC 等格式请先转换');
  if (!file.size) throw new Error('照片为空，请重新选择');
  if (file.size > 20 * 1024 * 1024) throw new Error('照片超过 20 MB，请先缩小或选择其他照片');
  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('图片读取失败，请尝试其他照片'));
      image.src = sourceUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60_000_000) throw new Error('图片尺寸过大，请先缩小照片');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法处理图片，请使用手动添加');
    let scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片压缩失败，请重新选择')), 'image/jpeg', 0.85 - attempt * 0.1));
      if (blob.size <= 1024 * 1024) return { blob, width: canvas.width, height: canvas.height, originalBytes: file.size };
      scale *= 0.8;
    }
    throw new Error('压缩后图片仍过大，请选择其他照片');
  } catch (reason) {
    if (reason instanceof DOMException) throw new Error('图片压缩失败，请尝试其他照片');
    if (reason instanceof Error) throw reason;
    throw new Error('图片处理失败，请重新选择');
  } finally {
    image.onload = null;
    image.onerror = null;
    image.src = '';
    canvas.width = canvas.height = 0;
    URL.revokeObjectURL(sourceUrl);
  }
}
