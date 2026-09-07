export type ControlChannel = 'camera' | 'lighting' | 'screen';

export interface ControlLease {
  channel: ControlChannel;
  owner: string;
  priority: number;
}

export class ControlArbiter {
  private readonly leases = new Map<ControlChannel, ControlLease>();

  acquire(channel: ControlChannel, owner: string, priority: number): boolean {
    const current = this.leases.get(channel);
    if (current && current.owner !== owner && current.priority > priority) return false;
    this.leases.set(channel, { channel, owner, priority });
    return true;
  }

  release(channel: ControlChannel, owner: string): void {
    if (this.leases.get(channel)?.owner === owner) this.leases.delete(channel);
  }

  owner(channel: ControlChannel): ControlLease | null {
    return this.leases.get(channel) ?? null;
  }

  clear(): void {
    this.leases.clear();
  }
}
