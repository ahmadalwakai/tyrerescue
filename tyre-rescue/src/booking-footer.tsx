import { createContext, type ComponentProps, type PropsWithChildren, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from './theme';
import type { WizardStep } from './types';
import { PrimaryButton } from './ui';

type ButtonProps = ComponentProps<typeof PrimaryButton>;
interface FooterAction { owner: string; step: WizardStep; props: ButtonProps }
interface FooterController {
  step: WizardStep;
  publish: (action: FooterAction) => void;
  clear: (owner: string) => void;
}
const ControllerContext = createContext<FooterController | null>(null);
const ActionContext = createContext<FooterAction | null>(null);

export function BookingFooterProvider({ step, children }: PropsWithChildren<{ step: WizardStep }>) {
  const [action, setAction] = useState<FooterAction | null>(null);
  const publish = useCallback((next: FooterAction) => setAction(next), []);
  const clear = useCallback((owner: string) => setAction(current => current?.owner === owner ? null : current), []);
  const controller = useMemo(() => ({ step, publish, clear }), [step, publish, clear]);
  return <ControllerContext.Provider value={controller}><ActionContext.Provider value={action}>{children}</ActionContext.Provider></ControllerContext.Provider>;
}

/** Relocate the existing action without copying its validation or submit logic. */
export function BookingContinueButton(props: ButtonProps) {
  const controller = useContext(ControllerContext);
  const owner = useId();
  const latest = useRef(props);
  const mounted = useRef(false);
  useLayoutEffect(() => { latest.current = props; });
  const onPress = useCallback<NonNullable<ButtonProps['onPress']>>(event => {
    const current = latest.current;
    if (mounted.current && !current.disabled && !current.loading) current.onPress?.(event);
  }, []);
  const { children, disabled, loading, icon, variant, accessibilityLabel, accessibilityHint } = props;
  useLayoutEffect(() => {
    if (!controller || controller.step === 'payment' || controller.step === 'done') return;
    mounted.current = true;
    controller.publish({ owner, step: controller.step, props: { children, disabled, loading, icon, variant, accessibilityLabel, accessibilityHint, onPress } });
    return () => { mounted.current = false; controller.clear(owner); };
  }, [controller, owner, children, disabled, loading, icon, variant, accessibilityLabel, accessibilityHint, onPress]);
  // Payment components keep ownership of checkout, recovery and confirmation.
  if (!controller || controller.step === 'payment' || controller.step === 'done') return <PrimaryButton {...props} />;
  return null;
}

export function BookingFooter({ step }: { step: WizardStep }) {
  const action = useContext(ActionContext);
  if (!action || action.step !== step || step === 'payment' || step === 'done') return null;
  return <View testID="booking-continue-footer" style={styles.footer}>
    <PrimaryButton {...action.props} />
  </View>;
}

const styles = StyleSheet.create({
  footer: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.gap,
  },
});
