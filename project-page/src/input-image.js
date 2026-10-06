const asset = (path) => new URL(path, document.baseURI).href;

async function loadImage(url) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  return image;
}

// Used by the asset preparation script; visitors receive the saved crop directly.
export async function createInputCrop(url, masks = [], paddingRatio = 0.035) {
  const [image, ...maskImages] = await Promise.all([url, ...masks].map(loadImage));
  const canvas = document.createElement('canvas');
  const width = canvas.width = image.naturalWidth, height = canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (maskImages.length) {
    context.globalCompositeOperation = 'lighten';
    maskImages.forEach((mask) => context.drawImage(mask, 0, 0, width, height));
    const mask = context.getImageData(0, 0, width, height);
    for (let i = 0; i < mask.data.length; i += 4) {
      mask.data[i + 3] *= Math.max(mask.data[i], mask.data[i + 1], mask.data[i + 2]) / 255;
    }
    context.putImageData(mask, 0, 0);
    context.globalCompositeOperation = 'source-in';
  }
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!pixels[(y * width + x) * 4 + 3]) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < left || (!masks.length && left === 0 && top === 0 && right === width - 1 && bottom === height - 1)) return null;
  const cropWidth = right - left + 1, cropHeight = bottom - top + 1;
  const padding = Math.max(1, Math.round(Math.max(cropWidth, cropHeight) * paddingRatio));
  const fitted = document.createElement('canvas');
  fitted.width = cropWidth + padding * 2; fitted.height = cropHeight + padding * 2;
  const output = fitted.getContext('2d');
  output.fillStyle = '#fff'; output.fillRect(0, 0, fitted.width, fitted.height);
  output.drawImage(canvas, left, top, cropWidth, cropHeight, padding, padding, cropWidth, cropHeight);
  return new Promise((resolve) => fitted.toBlob(resolve, 'image/png'));
}

export function setInputImage(element, path, masks = []) {
  element.dataset.inputSource = asset(path);
  element.dataset.inputFit = 'static';
  element.classList.toggle('masked-input', masks.length > 0);
  element.style.maskImage = masks.length ? masks.map((mask) => `url("${asset(mask)}")`).join(', ') : 'none';
  element.src = asset(path);
}
