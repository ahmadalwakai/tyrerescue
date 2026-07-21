import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_BASE_URL, ApiError, api, getAdminToken } from '@/lib/api';
import { colors, fontSize, radius, space } from './theme';
import { AppButton, FieldLabel, Input, StatusBanner } from './ui';
import { AdminChromeBackdrop, AdminModalHeader } from './layout/AdminModalShell';
import { AppIcon } from './icons/AppIcon';

const PIN_LENGTH = 4;

type Phase = 'checking' | 'forbidden' | 'locked' | 'unlocking' | 'unlocked' | 'submitting' | 'success';

interface StatusResponse {
  canAccess: true;
  roles: string[];
  pinConfigured: boolean;
}

interface UnlockResponse {
  success: true;
  unlockToken: string;
  expiresAt: string;
}

interface CreateAdminResponse {
  success: true;
  admin: {
    id: string;
    name: string;
    email: string;
    role: string;
    passwordSetupEmailSent: boolean;
  };
}

interface ApiProblem {
  error?: string;
  code?: string;
  retryAfterSeconds?: number;
  fieldErrors?: Record<string, string[] | undefined>;
}

interface AddAdminModalProps {
  visible: boolean;
  onClose: () => void;
}

function readProblem(error: unknown): ApiProblem {
  if (error instanceof ApiError && error.details && typeof error.details === 'object') {
    return error.details as ApiProblem;
  }
  return {};
}

function firstFieldError(fieldErrors: Record<string, string[] | undefined>, field: string): string | null {
  const value = fieldErrors[field];
  return value?.[0] ?? null;
}

export function AddAdminModal({ visible, onClose }: AddAdminModalProps) {
  const pinRef = useRef('');
  const pinInputRef = useRef<TextInput>(null);
  const unlockTokenRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>('checking');
  const [roles, setRoles] = useState<string[]>([]);
  const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);
  const [pinLength, setPinLength] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('admin');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [createdAdmin, setCreatedAdmin] = useState<CreateAdminResponse['admin'] | null>(null);

  const clearPin = useCallback(() => {
    pinRef.current = '';
    setPinLength(0);
    pinInputRef.current?.clear();
  }, []);

  const resetSensitiveState = useCallback(() => {
    clearPin();
    unlockTokenRef.current = null;
    setFieldErrors({});
  }, [clearPin]);

  const revokeUnlock = useCallback(() => {
    const token = unlockTokenRef.current;
    if (!token) return;
    unlockTokenRef.current = null;
    const adminToken = getAdminToken();
    void fetch(`${API_BASE_URL}/api/mobile/admin/add-admin/unlock`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
      },
      body: JSON.stringify({ unlockToken: token }),
    }).catch(() => {});
  }, []);

  const closeModal = useCallback(() => {
    revokeUnlock();
    resetSensitiveState();
    onClose();
  }, [onClose, resetSensitiveState, revokeUnlock]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      revokeUnlock();
      resetSensitiveState();
      setNotice(null);
      setCooldownSeconds(0);
      return;
    }

    setPhase('checking');
    setNotice(null);
    setCreatedAdmin(null);
    setName('');
    setEmail('');
    setPhone('');
    setSelectedRole('admin');
    resetSensitiveState();

    api
      .get<StatusResponse>('/api/mobile/admin/add-admin')
      .then((status) => {
        if (!mountedRef.current) return;
        setRoles(status.roles);
        setPinConfigured(status.pinConfigured);
        setSelectedRole(status.roles[0] ?? '');
        setPhase('locked');
      })
      .catch((error) => {
        if (!mountedRef.current) return;
        if (error instanceof ApiError && error.status === 403) {
          setPhase('forbidden');
          setNotice('Only the owner-level admin can add another admin.');
          return;
        }
        setPhase('locked');
        setNotice(error instanceof Error ? error.message : 'Could not load Add Admin.');
      });
  }, [resetSensitiveState, revokeUnlock, visible]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const submitPin = useCallback(
    async (pinValue?: string) => {
      const pin = (pinValue ?? pinRef.current).replace(/\D/g, '').slice(0, PIN_LENGTH);
      if (pin.length !== PIN_LENGTH || phase === 'unlocking' || cooldownSeconds > 0) return;

      setPhase('unlocking');
      setNotice(null);
      try {
        const result = await api.post<UnlockResponse>('/api/mobile/admin/add-admin/unlock', { pin });
        unlockTokenRef.current = result.unlockToken;
        setPhase('unlocked');
        setNotice(`Unlocked until ${new Date(result.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
      } catch (error) {
        const problem = readProblem(error);
        const retryAfter = Number(problem.retryAfterSeconds ?? 0);
        if (retryAfter > 0) setCooldownSeconds(retryAfter);
        setPhase('locked');
        setNotice(problem.error || 'Security PIN is incorrect.');
      } finally {
        clearPin();
      }
    },
    [clearPin, cooldownSeconds, phase],
  );

  const handlePinChange = useCallback(
    (value: string) => {
      const next = value.replace(/\D/g, '').slice(0, PIN_LENGTH);
      pinRef.current = next;
      setPinLength(next.length);
      if (next.length === PIN_LENGTH) {
        void submitPin(next);
      }
    },
    [submitPin],
  );

  const submitAdmin = useCallback(async () => {
    if (!unlockTokenRef.current || phase === 'submitting') return;
    setPhase('submitting');
    setNotice(null);
    setFieldErrors({});
    try {
      const result = await api.post<CreateAdminResponse>('/api/mobile/admin/add-admin', {
        unlockToken: unlockTokenRef.current,
        name,
        email,
        phone,
        role: selectedRole,
      });
      setCreatedAdmin(result.admin);
      setName('');
      setEmail('');
      setPhone('');
      resetSensitiveState();
      setPhase('success');
      setNotice(result.admin.passwordSetupEmailSent ? 'Admin created. Password setup email sent.' : 'Admin created. Ask them to use forgot password if the setup email does not arrive.');
    } catch (error) {
      const problem = readProblem(error);
      setFieldErrors(problem.fieldErrors ?? {});
      if (problem.code === 'UNLOCK_EXPIRED') {
        resetSensitiveState();
        setPhase('locked');
      } else {
        setPhase('unlocked');
      }
      setNotice(problem.error || (error instanceof Error ? error.message : 'Failed to create admin.'));
    }
  }, [email, name, phase, phone, resetSensitiveState, selectedRole]);

  const canSubmitForm =
    phase !== 'submitting' &&
    Boolean(unlockTokenRef.current) &&
    roles.length > 0 &&
    name.trim().length >= 2 &&
    email.trim().length > 0 &&
    selectedRole.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={closeModal}>
      <SafeAreaView style={styles.shell} edges={['left', 'right', 'bottom']}>
        <AdminChromeBackdrop />
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <AdminModalHeader
            title="Add Admin"
            subtitle="Owner protected admin creation"
            onClose={closeModal}
          />
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {phase === 'checking' ? (
              <View style={styles.centerState}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.mutedText}>Checking access...</Text>
              </View>
            ) : null}

            {phase === 'forbidden' ? (
              <View style={styles.panel}>
                <View style={styles.lockIcon}>
                  <AppIcon name="lock" size={24} color={colors.warning} />
                </View>
                <Text style={styles.panelTitle}>Restricted</Text>
                <Text style={styles.mutedText}>Only the owner-level admin can unlock this screen.</Text>
              </View>
            ) : null}

            {(phase === 'locked' || phase === 'unlocking') ? (
              <View style={styles.panel}>
                <View style={styles.lockIcon}>
                  <AppIcon name="shield" size={24} color={colors.accent} />
                </View>
                <Text style={styles.panelTitle}>Security PIN required</Text>
                <Text style={styles.mutedText}>
                  {pinConfigured === false
                    ? 'Enter the initial security PIN once to activate protected admin creation.'
                    : 'Enter the protected security PIN to continue.'}
                </Text>
                <View style={styles.pinDots} accessibilityLabel={`${pinLength} of ${PIN_LENGTH} PIN digits entered`}>
                  {Array.from({ length: PIN_LENGTH }).map((_, index) => (
                    <View key={index} style={[styles.pinDot, index < pinLength && styles.pinDotFilled]} />
                  ))}
                </View>
                <TextInput
                  ref={pinInputRef}
                  keyboardType="number-pad"
                  textContentType="none"
                  autoComplete="off"
                  autoCorrect={false}
                  autoCapitalize="none"
                  secureTextEntry
                  maxLength={PIN_LENGTH}
                  editable={phase !== 'unlocking' && cooldownSeconds <= 0}
                  onChangeText={handlePinChange}
                  placeholder="Security PIN"
                  placeholderTextColor={colors.subtle}
                  style={styles.pinInput}
                  accessibilityLabel="Security PIN"
                />
                {cooldownSeconds > 0 ? (
                  <Text style={styles.cooldownText}>Try again in {cooldownSeconds}s.</Text>
                ) : null}
                <AppButton
                  label={phase === 'unlocking' ? 'Checking...' : 'Unlock'}
                  onPress={() => { void submitPin(); }}
                  loading={phase === 'unlocking'}
                  disabled={pinLength !== PIN_LENGTH || cooldownSeconds > 0}
                  fullWidth
                />
              </View>
            ) : null}

            {(phase === 'unlocked' || phase === 'submitting') ? (
              <View style={styles.panel}>
                <View style={styles.formHeader}>
                  <View>
                    <Text style={styles.panelTitle}>New admin</Text>
                    <Text style={styles.mutedText}>Create an admin account and send a password setup email.</Text>
                  </View>
                  <View style={styles.unlockedBadge}>
                    <AppIcon name="unlock" size={14} color={colors.success} />
                    <Text style={styles.unlockedBadgeText}>Unlocked</Text>
                  </View>
                </View>

                {roles.length === 0 ? (
                  <StatusBanner kind="warn" message="No supported admin roles are available." />
                ) : null}

                <FieldLabel>Full name</FieldLabel>
                <Input value={name} onChangeText={setName} placeholder="John Smith" autoCapitalize="words" />
                {firstFieldError(fieldErrors, 'name') ? <Text style={styles.fieldError}>{firstFieldError(fieldErrors, 'name')}</Text> : null}

                <FieldLabel>Email</FieldLabel>
                <Input value={email} onChangeText={setEmail} placeholder="admin@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
                {firstFieldError(fieldErrors, 'email') ? <Text style={styles.fieldError}>{firstFieldError(fieldErrors, 'email')}</Text> : null}

                <FieldLabel>Phone</FieldLabel>
                <Input value={phone} onChangeText={setPhone} placeholder="Optional" keyboardType="phone-pad" />
                {firstFieldError(fieldErrors, 'phone') ? <Text style={styles.fieldError}>{firstFieldError(fieldErrors, 'phone')}</Text> : null}

                <FieldLabel>Role</FieldLabel>
                <View style={styles.roleRow}>
                  {roles.map((role) => {
                    const selected = selectedRole === role;
                    return (
                      <Pressable
                        key={role}
                        onPress={() => setSelectedRole(role)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={({ pressed }) => [
                          styles.roleChip,
                          selected && styles.roleChipSelected,
                          pressed && styles.roleChipPressed,
                        ]}
                      >
                        <Text style={[styles.roleChipText, selected && styles.roleChipTextSelected]}>{role}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {firstFieldError(fieldErrors, 'role') ? <Text style={styles.fieldError}>{firstFieldError(fieldErrors, 'role')}</Text> : null}

                <AppButton
                  label={phase === 'submitting' ? 'Creating...' : 'Create Admin'}
                  onPress={() => { void submitAdmin(); }}
                  loading={phase === 'submitting'}
                  disabled={!canSubmitForm}
                  fullWidth
                  style={styles.submitButton}
                />
              </View>
            ) : null}

            {phase === 'success' && createdAdmin ? (
              <View style={styles.panel}>
                <View style={styles.lockIcon}>
                  <AppIcon name="check" size={24} color={colors.success} />
                </View>
                <Text style={styles.panelTitle}>Admin created</Text>
                <Text style={styles.successName}>{createdAdmin.name}</Text>
                <Text style={styles.mutedText}>{createdAdmin.email}</Text>
                <AppButton label="Close" onPress={closeModal} variant="danger" fullWidth style={styles.submitButton} />
              </View>
            ) : null}

            {notice ? (
              <StatusBanner
                kind={phase === 'success' ? 'ok' : phase === 'forbidden' ? 'warn' : notice.includes('incorrect') ? 'err' : 'info'}
                message={notice}
              />
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  keyboard: {
    flex: 1,
    zIndex: 1,
  },
  content: {
    padding: space.lg,
    gap: space.md,
  },
  centerState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  lockIcon: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  panelTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  mutedText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  pinDots: {
    flexDirection: 'row',
    gap: space.sm,
    justifyContent: 'center',
    paddingVertical: space.sm,
  },
  pinDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
  },
  pinDotFilled: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pinInput: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.inputBg,
    color: colors.text,
    paddingHorizontal: space.md,
    fontSize: fontSize.lg,
    textAlign: 'center',
    letterSpacing: 6,
  },
  cooldownText: {
    color: colors.warning,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  unlockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
    paddingHorizontal: space.sm,
    paddingVertical: 7,
  },
  unlockedBadgeText: {
    color: colors.success,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  roleChip: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  roleChipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  roleChipPressed: {
    opacity: 0.84,
  },
  roleChipText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  roleChipTextSelected: {
    color: colors.accent,
  },
  fieldError: {
    marginTop: -space.sm,
    color: colors.danger,
    fontSize: fontSize.xs,
  },
  submitButton: {
    marginTop: space.sm,
  },
  successName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
});
