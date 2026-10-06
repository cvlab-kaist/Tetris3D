export class GalleryMotion {
  constructor(root) {
    this.active = new Map();
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion.addEventListener('change', () => {
      if (this.reducedMotion.matches) this.cancel();
    });
    root.addEventListener('focusin', (event) => {
      this.active.forEach((animation, element) => {
        if (element.contains(event.target)) animation.cancel();
      });
    });
  }

  enter(elements, direction, stagger = 0) {
    this.cancel();
    if (!direction || this.reducedMotion.matches || !Element.prototype.animate) return;
    const distance = Math.min(stagger ? 80 : 48, innerWidth * .09) * Math.sign(direction);
    elements.forEach((element, index) => {
      if (!element || element.contains(document.activeElement)) return;
      const order = direction > 0 ? index : elements.length - index - 1;
      const animation = element.animate([
        { opacity: 0, translate: `${distance}px 0` },
        { opacity: 1, translate: '0 0' },
      ], { duration: 440, delay: order * stagger, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
      animation.id = 'gallery-slide';
      this.active.set(element, animation);
      const clear = () => {
        if (this.active.get(element) === animation) this.active.delete(element);
      };
      animation.finished.then(clear, clear);
    });
  }

  cancel() {
    this.active.forEach((animation) => animation.cancel());
    this.active.clear();
  }
}
