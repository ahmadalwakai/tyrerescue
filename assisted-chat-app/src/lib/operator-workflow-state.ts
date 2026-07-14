import type {
  AssistedChatDraft,
  AssistedChatPaymentChoice,
} from '@/types/assisted-chat';
import type { AssistedChatStage } from '@/lib/assisted-chat-workflow';
import { summarizeBookingTyreLines } from '@/lib/assisted-chat-workflow';
import type {
  NextBestAction,
  OperatorWorkflowStep,
  OperatorWorkflowStepId,
} from '@/types/operator-workflow';

export interface OperatorWorkflowDerivationInput {
  draft: AssistedChatDraft;
  activeStage: AssistedChatStage;
  hasLocation: boolean;
  hasTyre: boolean;
  hasPrice: boolean;
  priceLoading: boolean;
  hasSavedQuote: boolean;
  quoteConfirmed: boolean;
  dispatchBusy: boolean;
  locationPolling: boolean;
  hasDispatched: boolean;
  hasPaymentLink: boolean;
}

const STEP_LABELS: Record<OperatorWorkflowStepId, string> = {
  customer: 'Customer',
  location: 'Location',
  tyre: 'Tyre',
  lockingNut: 'Locking Nut',
  quote: 'Quote',
  payment: 'Payment',
  dispatch: 'Dispatch',
};

/** Map an AssistedChatStage onto the operator-workflow step id. */
export function stepIdForStage(stage: AssistedChatStage): OperatorWorkflowStepId {
  switch (stage) {
    case 'CUSTOMER':
      return 'customer';
    case 'LOCATION':
      return 'location';
    case 'TYRE':
      return 'tyre';
    case 'PRICE':
    case 'QUOTE':
    case 'CONFIRMATION':
      return 'quote';
    case 'PAYMENT':
      return 'payment';
    case 'READY_TO_DISPATCH':
    case 'DISPATCHED':
      return 'dispatch';
  }
}

/** Reverse map: which AssistedChatStage to enter when a progress chip is tapped. */
export function stageForStepId(
  stepId: OperatorWorkflowStepId,
  ctx: { quoteConfirmed: boolean; hasPrice: boolean; hasSavedQuote: boolean },
): AssistedChatStage {
  switch (stepId) {
    case 'customer':
      return 'CUSTOMER';
    case 'location':
      return 'LOCATION';
    case 'tyre':
    case 'lockingNut':
      return 'TYRE';
    case 'quote':
      if (ctx.quoteConfirmed) return 'PAYMENT';
      if (ctx.hasSavedQuote) return 'CONFIRMATION';
      return 'PRICE';
    case 'payment':
      return 'PAYMENT';
    case 'dispatch':
      return 'READY_TO_DISPATCH';
  }
}

export function deriveOperatorWorkflowSteps(
  input: OperatorWorkflowDerivationInput,
): OperatorWorkflowStep[] {
  const {
    draft,
    activeStage,
    hasLocation,
    hasTyre,
    hasPrice,
    priceLoading,
    hasSavedQuote,
    quoteConfirmed,
    dispatchBusy,
    locationPolling,
    hasDispatched,
    hasPaymentLink,
  } = input;

  const activeStepId = stepIdForStage(activeStage);

  const customerHasContact = Boolean(
    draft.customer.name.trim() ||
      draft.customer.phone.trim() ||
      draft.customer.email.trim(),
  );

  const lockingAnswered = draft.lockingNut.answer !== 'unknown';

  const steps: OperatorWorkflowStep[] = [
    {
      id: 'customer',
      label: STEP_LABELS.customer,
      status: customerHasContact
        ? 'complete'
        : activeStepId === 'customer'
        ? 'active'
        : 'not_started',
      hint: customerHasContact ? draft.customer.name.trim() || draft.customer.phone.trim() : undefined,
    },
    {
      id: 'location',
      label: STEP_LABELS.location,
      status: hasLocation
        ? 'complete'
        : draft.location.link
        ? 'waiting'
        : activeStepId === 'location'
        ? 'active'
        : 'not_started',
      hint: hasLocation
        ? 'Confirmed'
        : draft.location.link
        ? locationPolling
          ? 'Polling…'
          : 'Link sent'
        : undefined,
    },
    {
      id: 'tyre',
      label: STEP_LABELS.tyre,
      status: hasTyre
        ? 'complete'
        : !hasLocation
        ? 'blocked'
        : activeStepId === 'tyre'
        ? 'active'
        : 'not_started',
      hint: hasTyre ? summarizeBookingTyreLines(draft.tyreLines).join(', ') : undefined,
    },
    {
      id: 'lockingNut',
      label: STEP_LABELS.lockingNut,
      status: lockingAnswered
        ? 'complete'
        : !hasTyre
        ? 'blocked'
        : 'not_started',
      hint: lockingAnswered
        ? draft.lockingNut.answer === 'yes'
          ? 'Has key'
          : 'No key'
        : 'Not asked',
    },
    {
      id: 'quote',
      label: STEP_LABELS.quote,
      status: quoteConfirmed
        ? 'complete'
        : priceLoading
        ? 'waiting'
        : hasSavedQuote
        ? 'active'
        : !hasPrice
        ? !hasTyre || !hasLocation
          ? 'blocked'
          : activeStepId === 'quote'
          ? 'active'
          : 'not_started'
        : 'active',
      hint: hasSavedQuote
        ? quoteConfirmed
          ? 'Confirmed'
          : 'Saved'
        : hasPrice
        ? 'Priced'
        : undefined,
    },
    {
      id: 'payment',
      label: STEP_LABELS.payment,
      status: hasDispatched
        ? 'complete'
        : !quoteConfirmed
        ? 'blocked'
        : draft.paymentChoice
        ? hasPaymentLink
          ? 'waiting'
          : 'complete'
        : activeStepId === 'payment'
        ? 'active'
        : 'not_started',
      hint: draft.paymentChoice ? paymentChoiceShortLabel(draft.paymentChoice) : undefined,
    },
    {
      id: 'dispatch',
      label: STEP_LABELS.dispatch,
      status: hasDispatched
        ? 'complete'
        : dispatchBusy
        ? 'waiting'
        : !quoteConfirmed || !draft.paymentChoice
        ? 'blocked'
        : activeStepId === 'dispatch'
        ? 'active'
        : 'not_started',
      hint: hasDispatched ? draft.dispatchedRefNumber ?? 'Dispatched' : undefined,
    },
  ];

  return steps;
}

function paymentChoiceShortLabel(choice: AssistedChatPaymentChoice): string {
  if (choice === 'deposit') return 'Deposit';
  if (choice === 'cash') return 'Cash';
  return 'Full pay';
}

export interface NextBestActionInput extends OperatorWorkflowDerivationInput {
  primaryActionLabel: string;
  primaryActionDisabled: boolean;
  primaryActionDisabledReason: string | null;
  onPrimaryPress: () => void;
  primaryLoading: boolean;
}

/** Build the human-friendly Next Best Action card content. */
export function deriveNextBestAction(input: NextBestActionInput): NextBestAction {
  const {
    draft,
    hasLocation,
    hasTyre,
    hasPrice,
    hasSavedQuote,
    quoteConfirmed,
    hasDispatched,
    hasPaymentLink,
    locationPolling,
    primaryActionLabel,
    primaryActionDisabled,
    onPrimaryPress,
    primaryLoading,
  } = input;

  const customerHasContact = Boolean(
    draft.customer.name.trim() ||
      draft.customer.phone.trim() ||
      draft.customer.email.trim(),
  );

  if (!customerHasContact) {
    return {
      id: 'customer',
      title: 'Start with customer details',
      body: 'Capture the customer name and phone before anything else.',
      status: 'info',
      primaryLabel: primaryActionLabel,
      onPrimaryPress,
      loading: primaryLoading,
      disabled: primaryActionDisabled,
    };
  }

  if (!hasLocation && !draft.location.link) {
    return {
      id: 'location',
      title: 'Send the location link',
      body: 'Generate a secure location link and send it by WhatsApp, SMS, or email.',
      status: 'info',
      primaryLabel: primaryActionLabel,
      onPrimaryPress,
      loading: primaryLoading,
      disabled: primaryActionDisabled,
    };
  }

  if (!hasLocation && draft.location.link) {
    return {
      id: 'location',
      title: 'Waiting for customer location',
      body: locationPolling
        ? 'The link is active. We are checking in the background every few seconds.'
        : 'The link is active. The customer has not shared their location yet.',
      status: 'waiting',
    };
  }

  if (!hasTyre) {
    return {
      id: 'tyre',
      title: 'Add tyre details',
      body: 'Pick the tyre size and quantity so we can price the job.',
      status: 'info',
    };
  }

  if (draft.lockingNut.answer === 'unknown') {
    return {
      id: 'lockingNut',
      title: 'Confirm the locking wheel nut',
      body: 'Ask if the customer has the locking wheel nut key. This affects price and tools.',
      status: 'warning',
    };
  }

  if (!hasPrice) {
    return {
      id: 'quote',
      title: 'Get the price',
      body: 'Run pricing now that location and tyre details are ready.',
      status: 'info',
      primaryLabel: primaryActionLabel,
      onPrimaryPress,
      loading: primaryLoading,
      disabled: primaryActionDisabled,
    };
  }

  if (!hasSavedQuote) {
    return {
      id: 'quote',
      title: 'Price is ready',
      body: 'Save the quote so we can confirm it with the customer.',
      status: 'success',
      primaryLabel: primaryActionLabel,
      onPrimaryPress,
      loading: primaryLoading,
      disabled: primaryActionDisabled,
    };
  }

  if (!quoteConfirmed) {
    return {
      id: 'quote',
      title: 'Confirm the quote',
      body: 'Confirm by phone before taking payment or dispatching.',
      status: 'info',
      primaryLabel: primaryActionLabel,
      onPrimaryPress,
      loading: primaryLoading,
      disabled: primaryActionDisabled,
    };
  }

  if (!draft.paymentChoice) {
    return {
      id: 'payment',
      title: 'Send payment link',
      body: 'Choose how the customer will pay so we can dispatch the job.',
      status: 'info',
      primaryLabel: primaryActionLabel,
      onPrimaryPress,
      loading: primaryLoading,
      disabled: primaryActionDisabled,
    };
  }

  if (hasDispatched) {
    if (hasPaymentLink) {
      return {
        id: 'payment',
        title: 'Payment link sent',
        body: 'Waiting for customer payment. The driver has the job.',
        status: 'waiting',
      };
    }
    return {
      id: 'dispatch',
      title: 'Booking dispatched',
      body: draft.dispatchedRefNumber
        ? `Booking ${draft.dispatchedRefNumber} is on its way to a driver.`
        : 'Booking is on its way to a driver.',
      status: 'success',
    };
  }

  return {
    id: 'dispatch',
    title: 'Booking ready to dispatch',
    body: 'Review the job and send it to the driver.',
    status: 'info',
    primaryLabel: primaryActionLabel,
    onPrimaryPress,
    loading: primaryLoading,
    disabled: primaryActionDisabled,
  };
}

export function nextBestActionDisabledReason(input: NextBestActionInput): string | null {
  return input.primaryActionDisabledReason;
}
