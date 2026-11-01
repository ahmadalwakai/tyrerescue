import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api, getApiContextRevision } from '@/lib/api';
import { getAdminSessionRevision } from '@/hooks/useAdminSession';
import type { AdminCustomer, CustomerAccountAction, CustomerActionResult } from '@/types/admin-customers';
import { AppButton, FieldLabel, Input } from './ui';
import { colors, fontSize, radius, space } from './theme';

export type CustomerActionChoice = CustomerAccountAction['action'] | null;

interface Props {
  customer: AdminCustomer;
  choice: CustomerActionChoice;
  busy: boolean;
  disabled: boolean;
  error: string | null;
  onChoose: (choice: CustomerActionChoice) => void;
  onAction: (input: CustomerAccountAction) => Promise<CustomerActionResult | null>;
  onReload: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}

const COPY = {
  suspend: { title: 'Suspend account', submit: 'Suspend account' },
  reactivate: { title: 'Reactivate account', submit: 'Reactivate account' },
  revoke_sessions: { title: 'Sign out all devices', submit: 'Sign out all devices' },
  delete: { title: 'Delete customer account', submit: 'Delete account permanently' },
  email_change: { title: 'Change sign-in email', submit: 'Send verification link' },
  password_reset: { title: 'Send password reset', submit: 'Send reset link' },
} as const;

function ActionConfirmation({ customer, choice, busy, error, onChoose, onAction, onReload, onUpdated, onDeleted }: Props & { choice: NonNullable<CustomerActionChoice> }) {
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [email, setEmail] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  const submitted = useRef(false);
  const apiRevision = getApiContextRevision();
  const sessionRevision = getAdminSessionRevision();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const current = () => mounted.current && api.hasAdminToken
    && getApiContextRevision() === apiRevision && getAdminSessionRevision() === sessionRevision;
  const destructive = choice === 'delete' || choice === 'suspend' || choice === 'revoke_sessions';

  const submit = async () => {
    if (!current() || busy || message || submitted.current) return;
    const version = { expectedUpdatedAt: customer.updatedAt };
    let input: CustomerAccountAction;
    if (choice === 'suspend') {
      if (reason.trim().length < 3 || reason.trim().length > 500) { setValidation('Enter a reason between 3 and 500 characters.'); return; }
      input = { action: choice, reason: reason.trim(), ...version };
    } else if (choice === 'delete') {
      if (confirmation !== 'DELETE') { setValidation('Type DELETE exactly to confirm deletion.'); return; }
      input = { action: choice, confirmation: 'DELETE', ...version };
    } else if (choice === 'email_change') {
      const nextEmail = email.trim().toLowerCase();
      if (nextEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) { setValidation('Enter a valid new email address.'); return; }
      if (nextEmail === customer.email.trim().toLowerCase()) { setValidation('Enter a different email address.'); return; }
      input = { action: choice, email: nextEmail, ...version };
    } else input = { action: choice, ...version };
    setValidation(null);
    submitted.current = true;
    const result = await onAction(input);
    if (!current()) return;
    if (!result) { submitted.current = false; return; }
    if (result.deleted) { onDeleted(); return; }
    setMessage(result.message);
    onUpdated();
  };

  return <View style={[styles.confirmation, destructive && styles.destructive]} testID={`customer-confirm-${choice}`}>
    <Text style={styles.heading}>{COPY[choice].title}</Text>
    <View style={styles.identity}><Text style={styles.name}>{customer.name}</Text><Text style={styles.body} selectable>{customer.email}</Text></View>
    {message ? <>
      <Text style={styles.success} accessibilityRole="alert" testID="customer-action-success">{message}</Text>
      <AppButton label="Done" variant="secondary" onPress={() => { if (current()) onChoose(null); }} testID="customer-action-done" />
    </> : <>
      {choice === 'suspend' ? <>
        <Text style={styles.body}>This customer will be signed out and unable to sign in until you reactivate their account.</Text>
        <View><FieldLabel>Reason for suspension</FieldLabel><Input value={reason} onChangeText={setReason} editable={!busy} accessibilityLabel="Reason for suspending customer" testID="customer-suspension-reason" multiline maxLength={500} placeholder="Explain why this account is being suspended" /></View>
      </> : null}
      {choice === 'reactivate' ? <Text style={styles.body}>Restore this customer’s access. They will need to sign in again.</Text> : null}
      {choice === 'revoke_sessions' ? <Text style={styles.body}>Sign this customer out on every device. Their account stays {customer.status}, and they must sign in again to regain access.</Text> : null}
      {choice === 'delete' ? <>
        <Text style={styles.warning}>Permanently remove this customer’s account and sign-in access. Service and financial records are retained. This cannot be undone.</Text>
        <View><FieldLabel>Type DELETE to confirm</FieldLabel><Input value={confirmation} onChangeText={setConfirmation} editable={!busy} autoCapitalize="characters" autoCorrect={false} maxLength={6} accessibilityLabel="Type DELETE to permanently delete customer" testID="customer-delete-confirmation" /></View>
      </> : null}
      {choice === 'email_change' ? <>
        <View><FieldLabel>New email address</FieldLabel><Input value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={255} accessibilityLabel="New customer email address" testID="customer-new-email" placeholder="new@example.com" /></View>
        <Text style={styles.body}>A verification link will be sent to the new address. The current sign-in email stays unchanged until the customer confirms it.</Text>
        <Text style={styles.warning}>After confirmation, all devices are signed out and previous social sign-in links are removed. The customer must use Forgot password with the new verified email to set a password.</Text>
        {customer.pendingEmail ? <Text style={styles.caption}>A new request replaces the pending change to {customer.pendingEmail}.</Text> : null}
      </> : null}
      {choice === 'password_reset' ? <Text style={styles.body}>Send a password reset link to {customer.email}. The customer chooses their own new password.</Text> : null}
      {validation || error ? <Text style={styles.error} accessibilityRole="alert">{validation || error}</Text> : null}
      {error ? <AppButton label="Reload account" variant="secondary" disabled={busy} onPress={() => { if (current() && !busy) onReload(); }} testID="customer-action-reload" /> : null}
      <View style={styles.buttons}>
        <AppButton label="Cancel" variant="secondary" disabled={busy} onPress={() => { if (current() && !busy) onChoose(null); }} testID="customer-action-cancel" />
        <AppButton label={COPY[choice].submit} variant={destructive ? 'danger' : 'primary'} loading={busy}
          disabled={choice === 'delete' && confirmation !== 'DELETE'} onPress={() => { void submit(); }} testID="customer-action-submit" />
      </View>
    </>}
  </View>;
}

export function CustomerAccountActions(props: Props) {
  const { customer, choice, busy, disabled, onChoose } = props;
  if (choice) return <ActionConfirmation key={`${customer.id}:${choice}`} {...props} choice={choice} />;
  return <View style={styles.actions}>
    <Text style={styles.heading}>Account management</Text>
    <AppButton label="Change email address" variant="secondary" disabled={disabled || busy || customer.status !== 'active'} onPress={() => onChoose('email_change')} testID="customer-change-email" />
    <AppButton label="Send password reset" variant="secondary" disabled={disabled || busy || customer.status !== 'active'} onPress={() => onChoose('password_reset')} testID="customer-reset-password" />
    {customer.status !== 'active' ? <Text style={styles.caption}>Reactivate this account before changing its email or sending a password reset.</Text> : null}
    <AppButton label="Sign out all devices" variant="secondary" disabled={disabled || busy} onPress={() => onChoose('revoke_sessions')} testID="customer-revoke-sessions" />
    <AppButton label={customer.status === 'suspended' ? 'Reactivate account' : 'Suspend account'} variant={customer.status === 'suspended' ? 'secondary' : 'danger'} disabled={disabled || busy} onPress={() => onChoose(customer.status === 'suspended' ? 'reactivate' : 'suspend')} testID="customer-change-status" />
    <AppButton label="Delete account" variant="danger" disabled={disabled || busy} onPress={() => onChoose('delete')} testID="customer-delete" />
  </View>;
}

const styles = StyleSheet.create({
  actions: { gap: space.sm },
  confirmation: { padding: space.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.cardMuted, gap: space.md },
  destructive: { borderColor: colors.dangerBorder },
  heading: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  identity: { padding: space.sm, gap: space.xs, backgroundColor: colors.panel, borderRadius: radius.md },
  name: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  body: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
  caption: { color: colors.subtle, fontSize: fontSize.xs, lineHeight: 18 },
  warning: { color: colors.warning, fontSize: fontSize.sm, lineHeight: 20 },
  error: { color: colors.danger, fontSize: fontSize.sm, lineHeight: 20 },
  success: { color: colors.success, fontSize: fontSize.sm, lineHeight: 20 },
  buttons: { gap: space.sm },
});
