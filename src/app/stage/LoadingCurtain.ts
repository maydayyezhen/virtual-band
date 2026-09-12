import './fonts.css';
import './loading-curtain.css';

/** One opaque curtain shared by nested loading operations; the dialog blocks input underneath. */
export class LoadingCurtain {
  private readonly dialog = document.createElement('dialog');
  private readonly title: HTMLElement;
  private depth = 0;
  private previousFocus: HTMLElement | null = null;

  constructor() {
    this.dialog.className = 'loading-curtain';
    this.dialog.setAttribute('aria-labelledby', 'loading-curtain-title');
    this.dialog.innerHTML = `<div class="loading-curtain-content">
      <div class="loading-curtain-mark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      <span class="loading-curtain-kicker" aria-hidden="true">BEHIND THE SCENES</span>
      <h2 id="loading-curtain-title" role="status" aria-live="polite"></h2>
      <p>把这一刻，留给开场。</p>
      <button type="button" hidden>重新入场</button>
    </div>`;
    this.title = this.dialog.querySelector('h2')!;
    this.title.tabIndex = -1;
    this.dialog.addEventListener('cancel', event => event.preventDefault());
    this.dialog.addEventListener('keydown', event => {
      if (event.key === 'Tab' && this.dialog.querySelector('button')!.hidden) { event.preventDefault(); this.title.focus(); }
    });
    this.dialog.querySelector('button')!.addEventListener('click', () => location.reload());
    document.body.append(this.dialog);
  }

  async begin(label = '乐队正在就位'): Promise<() => Promise<void>> {
    if (this.depth++ === 0) {
      this.previousFocus = document.activeElement as HTMLElement | null;
      this.title.textContent = label;
      this.dialog.showModal();
      this.title.focus();
    }
    // Paint the curtain before synchronous geometry creation starts.
    await this.paint();
    let ended = false;
    return async () => {
      if (ended) return;
      ended = true;
      // Give the host a rendered frame before uncovering the models.
      await this.paint();
      if (--this.depth === 0) {
        this.dialog.close();
        if (this.previousFocus?.isConnected && !this.previousFocus.closest('[hidden], [inert]')) this.previousFocus.focus();
      }
    };
  }

  fail(): void {
    this.title.textContent = '乐器还在后台迷路';
    this.dialog.querySelector('p')!.textContent = '这次没能准备好，再入场一次吧。';
    const button = this.dialog.querySelector('button')!;
    button.hidden = false; button.focus();
    this.dialog.classList.add('has-error');
  }

  private paint(): Promise<void> {
    return new Promise(resolve => {
      // Background tabs must not leave loading promises stranded waiting for RAF.
      const timer = window.setTimeout(resolve, 120);
      requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); }));
    });
  }

  dispose(): void { this.dialog.close(); this.dialog.remove(); }
}
