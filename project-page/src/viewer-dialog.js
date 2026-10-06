import { setInputImage } from './input-image.js';

export class ViewerDialog {
  constructor(root, openImage) {
    this.root = root;
    this.openImage = openImage;
  }

  open({ sample, method, view, controls = [], resize, opener }) {
    this.close();
    const dialog = document.createElement('dialog');
    dialog.className = 'viewer-dialog';
    dialog.setAttribute('aria-label', `${sample.title} — ${method.label} 3D view`);
    dialog.innerHTML = `<header class="expanded-bar"><div><span class="expanded-method"></span><h3></h3></div><button class="expanded-close" type="button" aria-label="Close expanded 3D view" autofocus>Close ×</button></header>
      <div class="expanded-content"><aside class="expanded-reference"><h4>Input image</h4><button class="expanded-input" type="button" aria-label="Enlarge input image"><img/><span>Expand ↗</span></button></aside>
        <section class="expanded-result"><h4>3D viewer</h4><div class="expanded-stage"></div></section></div>
      <footer class="expanded-footer"><span class="expanded-hint">Drag to orbit · Scroll to zoom · Right-drag to pan</span><div class="expanded-options"></div></footer>`;
    dialog.querySelector('h3').textContent = sample.title;
    dialog.querySelector('.expanded-method').textContent = method.label;
    const input = dialog.querySelector('.expanded-input img');
    setInputImage(input, sample.image, sample.imageMasks);
    input.alt = `${sample.title} — input image`;
    dialog.querySelector('.expanded-input').addEventListener('click', () => this.openImage(sample.image, input.alt, sample.imageMasks));
    dialog.querySelector('.expanded-close').addEventListener('click', () => this.close());
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); this.close(); });
    dialog.addEventListener('close', () => { if (this.dialog === dialog) this.close(); });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) this.close();
    });
    this.root.append(dialog);
    this.dialog = dialog;
    this.view = view;
    this.resize = resize;
    this.opener = opener;
    this.moves = [];
    const move = (node, destination) => {
      const marker = document.createComment('Expanded viewer return position');
      node.before(marker);
      this.moves.push({ node, marker });
      destination.append(node);
    };
    // Reuse the live canvas and controls, retaining the camera and loaded mesh.
    move(view, dialog.querySelector('.expanded-stage'));
    controls.forEach((node) => move(node, dialog.querySelector('.expanded-options')));
    dialog.showModal();
    document.body.classList.add('dialog-open');
    resize();
  }

  close(view) {
    if (!this.dialog || (view && view !== this.view)) return;
    const dialog = this.dialog;
    this.dialog = null;
    dialog.close();
    this.moves.forEach(({ node, marker }) => marker.replaceWith(node));
    this.moves = [];
    dialog.remove();
    document.body.classList.toggle('dialog-open', Boolean(document.querySelector('dialog[open]')));
    this.resize();
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    this.view = null;
  }
}
