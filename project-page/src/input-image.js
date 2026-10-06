const asset = (path) => new URL(path, document.baseURI).href;
const crops = new Map();
const requests = new WeakMap();

async function loadImage(url) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  return image;
}

async function cropInput(url, masks) {
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
  const padding = Math.max(1, Math.round(Math.max(cropWidth, cropHeight) * 0.025));
  const fitted = document.createElement('canvas');
  fitted.width = cropWidth + padding * 2; fitted.height = cropHeight + padding * 2;
  const output = fitted.getContext('2d');
  output.fillStyle = '#fff'; output.fillRect(0, 0, fitted.width, fitted.height);
  output.drawImage(canvas, left, top, cropWidth, cropHeight, padding, padding, cropWidth, cropHeight);
  const blob = await new Promise((resolve) => fitted.toBlob(resolve, 'image/png'));
  return blob ? URL.createObjectURL(blob) : null;
}

export function setInputImage(element, path, masks = []) {
  const url = asset(path), maskUrls = masks.map(asset), token = {};
  requests.set(element, token);
  element.dataset.inputSource = url;
  element.dataset.inputFit = 'original';
  element.classList.remove('cropped-input');
  element.classList.toggle('masked-input', masks.length > 0);
  element.style.maskImage = maskUrls.length ? maskUrls.map((mask) => `url("${mask}")`).join(', ') : 'none';
  // Start after the original image loads, preserving lazy gallery loading.
  const fit = async () => {
    element.onload = null;
    const key = JSON.stringify([url, ...maskUrls]);
    if (!crops.has(key)) crops.set(key, cropInput(url, maskUrls).catch(() => null));
    const cropped = await crops.get(key);
    if (requests.get(element) !== token || !cropped) return;
    element.style.maskImage = 'none';
    element.classList.remove('masked-input');
    element.classList.add('cropped-input');
    element.dataset.inputFit = 'cropped';
    element.src = cropped;
  };
  element.onload = fit;
  element.src = url;
  if (element.complete && element.naturalWidth) fit();
}
