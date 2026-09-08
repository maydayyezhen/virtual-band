import { parseSf2, type Sf2SoundFont } from './Sf2Parser';

export interface LoadedSf2Bank {
  readonly font: Sf2SoundFont;
  readonly byteLength: number;
}

export class Sf2BankLibrary {
  private readonly banks = new Map<string, Promise<LoadedSf2Bank>>();

  load(url = '/soundfonts/FluidR3_GM.sf2'): Promise<LoadedSf2Bank> {
    const existing = this.banks.get(url);
    if (existing) return existing;

    const promise = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`SF2 load failed: HTTP ${response.status} for ${url}`);
      const data = await response.arrayBuffer();
      return {
        font: parseSf2(data),
        byteLength: data.byteLength,
      };
    })().catch((error) => {
      this.banks.delete(url);
      throw error;
    });

    this.banks.set(url, promise);
    return promise;
  }

  dispose(): void {
    this.banks.clear();
  }
}
