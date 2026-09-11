import { GENERAL_MIDI_FAMILIES, GENERAL_MIDI_TONES } from '../../audio/GeneralMidiTones';
import type { KeyboardTier } from '../../instruments/keyboard/legacyKeyboardAsset';
import type { KeyboardInstrument, KeyboardStatus, KeyboardTierStatus } from '../../instruments/keyboard/KeyboardInstrument';

/**
 * A small control surface for the keyboard: what each tier is playing, and a way to change it.
 *
 * It exists because the instrument's own panel controls — roughly twenty knobs, thirteen faders,
 * eight backlit buttons and two screens per tier — are drawn but not wired to anything, and a
 * 128-entry list is not something to walk with arrow keys while listening. The model's controls
 * remain a separate, later piece of work; this is the readable version of the same idea.
 *
 * The panel is plain DOM in the page corner, shown only while the keyboard close-up is active, so
 * it never appears in the instrument library's landing view.
 */
export class AtelierKeyboardPanel {
  private readonly root: HTMLDivElement;
  private readonly selects: Record<KeyboardTier, HTMLSelectElement>;
  private readonly readouts: Record<KeyboardTier, HTMLSpanElement>;
  private readonly statusLine: HTMLDivElement;
  private readonly keyboard: KeyboardInstrument;
  private readonly host: HTMLElement;
  private lastSignature = '';
  private visible = false;

  constructor(keyboard: KeyboardInstrument, host: HTMLElement) {
    this.keyboard = keyboard;
    this.host = host;

    this.root = document.createElement('div');
    this.root.className = 'kb-panel';
    this.root.hidden = true;

    const title = document.createElement('div');
    title.className = 'kb-panel__title';
    title.textContent = '电子琴';
    this.root.append(title);

    const lower = this.buildRow('lower', '下层');
    const upper = this.buildRow('upper', '上层');
    this.selects = { lower: lower.select, upper: upper.select };
    this.readouts = { lower: lower.readout, upper: upper.readout };

    this.statusLine = document.createElement('div');
    this.statusLine.className = 'kb-panel__status';
    this.root.append(this.statusLine);

    host.append(this.root);
    this.refresh(true);
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.root.hidden = !visible;
    if (visible) this.refresh(true);
  }

  /** Cheap to call every frame: only touches the DOM when something actually changed. */
  update(): void {
    if (!this.visible) return;
    this.refresh(false);
  }

  dispose(): void {
    this.root.remove();
  }

  private buildRow(
    tier: KeyboardTier,
    label: string,
  ): { select: HTMLSelectElement; readout: HTMLSpanElement } {
    const row = document.createElement('div');
    row.className = 'kb-panel__row';

    const name = document.createElement('span');
    name.className = 'kb-panel__label';
    name.textContent = label;

    const select = document.createElement('select');
    select.className = 'kb-panel__select';
    for (const family of GENERAL_MIDI_FAMILIES) {
      const group = document.createElement('optgroup');
      group.label = family.name;
      for (let program = family.from; program <= family.to; program += 1) {
        const option = document.createElement('option');
        option.value = String(program);
        option.textContent = `${program} · ${GENERAL_MIDI_TONES[program]}`;
        group.append(option);
      }
      select.append(group);
    }
    select.addEventListener('change', () => {
      this.keyboard.setProgram(tier, Number(select.value));
      this.refresh(true);
    });

    const readout = document.createElement('span');
    readout.className = 'kb-panel__readout';

    row.append(name, select, readout);
    this.root.append(row);
    return { select, readout };
  }

  private refresh(force: boolean): void {
    const status = this.keyboard.status();
    const signature = signatureOf(status);
    if (!force && signature === this.lastSignature) return;
    this.lastSignature = signature;

    for (const tier of ['lower', 'upper'] as const) {
      const tierStatus = status[tier];
      const select = this.selects[tier];
      if (tierStatus.program !== null && select.value !== String(tierStatus.program)) {
        select.value = String(tierStatus.program);
      }
      select.disabled = tierStatus.program === null;
      this.readouts[tier].textContent = tierStatus.program === null ? '无音源' : `#${tierStatus.program}`;
    }

    this.statusLine.textContent = describe(status);
  }
}

function describe(status: KeyboardStatus): string {
  const parts = [
    `按下 ${status.lower.pressedNotes + status.upper.pressedNotes}`,
    `延音 ${status.pedals.sustain ? '●' : '○'}`,
    `持音 ${status.pedals.sostenuto ? '●' : '○'}`,
    `弱音 ${status.pedals.soft ? '●' : '○'}`,
    `弯音 ${status.lower.pitchWheel.toFixed(2)}`,
    `调制 ${status.lower.modWheel.toFixed(2)}`,
  ];
  return parts.join('   ');
}

function signatureOf(status: KeyboardStatus): string {
  const tier = (value: KeyboardTierStatus): string =>
    `${value.program}|${value.pressedNotes}|${value.pitchWheel.toFixed(2)}|${value.modWheel.toFixed(2)}`;
  return [
    tier(status.lower),
    tier(status.upper),
    status.pedals.soft ? 1 : 0,
    status.pedals.sostenuto ? 1 : 0,
    status.pedals.sustain ? 1 : 0,
  ].join('|');
}

/** Injected once; keeps the panel self-contained rather than adding a stylesheet to the app. */
export function installKeyboardPanelStyles(doc: Document = document): void {
  if (doc.getElementById('kb-panel-styles')) return;
  const style = doc.createElement('style');
  style.id = 'kb-panel-styles';
  style.textContent = `
.kb-panel {
  position: fixed; left: 16px; bottom: 16px; z-index: 20;
  min-width: 340px; padding: 10px 12px 8px;
  background: rgba(12, 16, 22, .88); border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 8px; color: #dfe6ef;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  backdrop-filter: blur(6px); user-select: none;
}
.kb-panel__title { font-weight: 600; letter-spacing: .08em; opacity: .7; margin-bottom: 6px; }
.kb-panel__row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.kb-panel__label { width: 28px; opacity: .75; }
.kb-panel__select {
  flex: 1; min-width: 0; background: #1a212b; color: #dfe6ef;
  border: 1px solid rgba(255, 255, 255, .18); border-radius: 5px;
  padding: 3px 6px; font: inherit;
}
.kb-panel__readout { width: 34px; text-align: right; opacity: .6; }
.kb-panel__status { margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,.12); opacity: .7; }
`;
  doc.head.append(style);
}
