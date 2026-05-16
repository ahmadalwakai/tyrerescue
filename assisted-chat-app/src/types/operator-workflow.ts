// Operator workflow types — shared by OperatorStepProgress, NextBestActionCard,
// StepCard, and the AssistedChatScreen derivation logic. Keeping the type
// surface small so the screen can derive workflow state from the existing
// `useAssistedChatDraft` shape without inventing new server-side fields.

export type OperatorWorkflowStepId =
  | 'customer'
  | 'location'
  | 'tyre'
  | 'lockingNut'
  | 'quote'
  | 'payment'
  | 'dispatch';

// Status semantics:
// - not_started: nothing has been done for this step yet.
// - active:      the operator is currently working in this step.
// - waiting:     a backend / customer action is in progress (link sent,
//                price calculating, polling for share, payment pending,
//                etc.). The system is doing work — the operator should
//                not feel the screen is frozen.
// - complete:    step has all the data we need and is safe to collapse.
// - blocked:     a previous step must be finished first.
// - error:       the last action failed; show a recovery path.
export type OperatorWorkflowStepStatus =
  | 'not_started'
  | 'active'
  | 'waiting'
  | 'complete'
  | 'blocked'
  | 'error';

export interface OperatorWorkflowStep {
  id: OperatorWorkflowStepId;
  label: string;
  status: OperatorWorkflowStepStatus;
  /** Optional one-line hint shown below the label in the progress strip. */
  hint?: string;
}

export type NextBestActionStatus = 'info' | 'waiting' | 'success' | 'warning' | 'error';

export interface NextBestAction {
  id: OperatorWorkflowStepId | 'idle';
  title: string;
  body: string;
  status: NextBestActionStatus;
  /** Optional primary CTA label — when present the card renders a button. */
  primaryLabel?: string;
  /** Optional primary CTA handler — called only when not loading and not disabled. */
  onPrimaryPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
}
