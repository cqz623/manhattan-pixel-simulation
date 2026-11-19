/** Panels overlay the fixed canvas. Toggling them never changes camera or grid layout. */
export class FloatingPanels {
  constructor() {
    for (const id of ['editor', 'inspector']) {
      document.querySelector(`#toggle-${id}`).addEventListener('click', () => this.toggle(id));
      document.querySelector(`[data-close-panel="${id}"]`).addEventListener('click', () => this.close(id));
    }
  }
  toggle(id) { this.setOpen(id, document.querySelector(`#${id}-panel`).hidden); }
  open(id) { this.setOpen(id, true); }
  close(id) { this.setOpen(id, false); document.querySelector(`#toggle-${id}`).focus({ preventScroll: true }); }
  setOpen(id, open) {
    if (open && window.innerWidth <= 700) {
      for (const other of ['editor', 'inspector']) if (other !== id) {
        document.querySelector(`#${other}-panel`).hidden = true;
        document.querySelector(`#toggle-${other}`).setAttribute('aria-expanded', 'false');
      }
    }
    document.querySelector(`#${id}-panel`).hidden = !open;
    document.querySelector(`#toggle-${id}`).setAttribute('aria-expanded', String(open));
  }
}
