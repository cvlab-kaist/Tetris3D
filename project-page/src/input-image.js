const asset = (path) => new URL(path, document.baseURI).href;

export function setInputImage(element, path, masks = []) {
  element.src = asset(path);
  element.classList.toggle('masked-input', masks.length > 0);
  element.style.maskImage = masks.length ? masks.map((mask) => `url("${asset(mask)}")`).join(', ') : 'none';
}
