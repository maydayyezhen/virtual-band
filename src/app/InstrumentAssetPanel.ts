import { INSTRUMENT_ASSETS } from '../instruments/InstrumentAssets';
import './instrument-assets.css';

/** Asset navigation only; the existing showcase owns visibility, camera and playing. */
export class InstrumentAssetPanel {
  private readonly root = document.createElement('section');
  private readonly select = document.createElement('select');
  private readonly status = document.createElement('p');
  private readonly stageLink = document.createElement('a');
  constructor(actions: { select: (id: string) => void; next: (direction: number) => void }) {
    this.root.className = 'instrument-assets';
    this.root.setAttribute('aria-label', '乐器资产库');
    const heading = document.createElement('strong'); heading.textContent = '乐器资产库';
    const label = document.createElement('label'); label.textContent = '选择乐器与款式';
    this.select.id = 'instrument-asset-choice'; label.htmlFor = this.select.id;
    for (const asset of INSTRUMENT_ASSETS) this.select.add(new Option(asset.label, asset.id));
    this.select.addEventListener('change', () => { actions.select(this.select.value); this.select.blur(); });
    const row = document.createElement('div'); row.className = 'instrument-assets__actions';
    for (const [text, direction] of [['上一款', -1], ['下一款', 1]] as const) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.addEventListener('click', () => actions.next(direction)); row.append(button);
    }
    this.stageLink.href = '/studio/band/'; this.stageLink.textContent = '在乐队舞台查看';
    this.status.setAttribute('role', 'status');
    this.root.append(heading, label, this.select, row, this.status, this.stageLink);
    document.body.append(this.root);
  }
  update(id: string): void {
    this.select.value = id;
    const index = INSTRUMENT_ASSETS.findIndex(asset => asset.id === id);
    const asset = INSTRUMENT_ASSETS[index];
    this.stageLink.href = asset?.variant ? `/studio/band/?${asset.type}=${asset.variant}` : '/studio/band/';
    this.status.textContent = `${index + 1} / ${INSTRUMENT_ASSETS.length} · 可旋转查看、自由弹奏`;
  }
  dispose(): void { this.root.remove(); }
}
