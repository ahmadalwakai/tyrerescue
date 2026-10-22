export type PrimaryModal = 'chat' | 'account' | 'driver-chat';
export interface ModalPresentation { owner: PrimaryModal | null; closing: boolean }

/** UIKit dismissal completes after visible=false. Keep ownership until onDismiss. */
export class ModalPresentationController {
  private state: ModalPresentation = { owner: null, closing: false };
  private listeners = new Set<() => void>();
  getState = (): ModalPresentation => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(state: ModalPresentation): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  open(owner: PrimaryModal): boolean {
    if (this.state.owner) return false;
    this.publish({ owner, closing: false });
    return true;
  }
  close(owner: PrimaryModal, waitForDismissal: boolean): boolean {
    if (this.state.owner !== owner || this.state.closing) return false;
    this.publish(waitForDismissal ? { owner, closing: true } : { owner: null, closing: false });
    return true;
  }
  didDismiss(owner: PrimaryModal): void {
    if (this.state.owner === owner && this.state.closing) this.publish({ owner: null, closing: false });
  }
}
