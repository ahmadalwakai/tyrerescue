export type SoundEvent =
  | 'new_job'
  | 'reassignment'
  | 'upcoming_v2'
  | 'job_accepted'
  | 'job_completed'
  | 'new_message'
  | 'payment_received'
  | 'route_rerouting'
  | 'route_warning'
  | 'near_customer'
  | 'arrived_zone';

interface SoundEventConfig {
  soundFile: string;
  enabled: boolean;
  volume: number;
  vibrationEnabled: boolean;
}

export async function loadSoundConfig(
  _apiFn: () => Promise<Record<string, SoundEventConfig>>,
): Promise<void> {
  // Native app sounds are disabled on web.
}

export async function stopAlertSound(): Promise<void> {
  // Native app sounds are disabled on web.
}

export async function playSound(_event: SoundEvent): Promise<void> {
  // Native app sounds are disabled on web.
}

export async function preloadSounds(): Promise<void> {
  // Native app sounds are disabled on web.
}
