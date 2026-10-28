import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEmployees } from '@/hooks/useEmployees';
import { colors } from '@/components/theme';

export default function NewEmployeeScreen() {
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
  const router = useRouter();
  const { creating, createError, createEmployee } = useEmployees(companyId);

  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [startDate, setStartDate] = useState('');
  const [reference, setReference] = useState('');
  const [isDirector, setIsDirector] = useState(false);

  const fieldError = (key: string) => createError?.fieldErrors?.[key];

  const onSubmit = useCallback(async () => {
    if (!firstName.trim() || !surname.trim() || !startDate.trim()) {
      Alert.alert('Required fields', 'First name, surname, and start date are required.');
      return;
    }
    const result = await createEmployee({
      legalFirstName: firstName.trim(),
      legalSurname: surname.trim(),
      employmentStartDate: startDate.trim(),
      employeeReference: reference.trim() || null,
      isDirector,
    });
    if (result) {
      router.back();
    }
  }, [firstName, surname, startDate, reference, isDirector, createEmployee, router]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.hint}>
        Enter the employee&apos;s legal name exactly as it appears on their identification documents.
        Tax code and National Insurance information can be added later.
      </Text>

      <Field
        label="Legal First Name *"
        value={firstName}
        onChangeText={setFirstName}
        error={fieldError('legalFirstName')}
        autoCapitalize="words"
      />
      <Field
        label="Legal Surname *"
        value={surname}
        onChangeText={setSurname}
        error={fieldError('legalSurname')}
        autoCapitalize="words"
      />
      <Field
        label="Employment Start Date * (YYYY-MM-DD)"
        value={startDate}
        onChangeText={setStartDate}
        error={fieldError('employmentStartDate')}
        placeholder="2026-04-06"
      />
      <Field
        label="Employee Reference (optional)"
        value={reference}
        onChangeText={setReference}
        error={fieldError('employeeReference')}
        placeholder="e.g. EMP001"
      />

      <Pressable
        style={styles.checkRow}
        onPress={() => setIsDirector((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDirector }}
      >
        <View style={[styles.checkbox, isDirector && styles.checkboxChecked]}>
          {isDirector ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={styles.checkLabel}>Director</Text>
      </Pressable>

      {createError && !createError.fieldErrors ? (
        <Text style={styles.errorText}>{createError.error}</Text>
      ) : null}

      <Pressable
        style={[styles.button, creating && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={creating}
      >
        {creating ? (
          <ActivityIndicator color={colors.accentText} />
        ) : (
          <Text style={styles.buttonText}>Create Employee</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  error,
  placeholder,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  placeholder?: string;
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.subtle}
        autoCapitalize={autoCapitalize}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 48 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  fieldGroup: { gap: 5 },
  fieldLabel: { color: colors.subtle, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  input: { backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
  inputError: { borderColor: colors.dangerBorder },
  fieldError: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  errorText: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.accentText, fontSize: 13, fontWeight: '900' },
  checkLabel: { color: colors.text, fontSize: 15 },
  button: { backgroundColor: colors.accent, borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: colors.accentText, fontSize: 15, fontWeight: '900' },
});
