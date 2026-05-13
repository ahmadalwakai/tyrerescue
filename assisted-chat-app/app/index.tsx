import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AssistedChatScreen } from '@/components/AssistedChatScreen';
import { LoginScreen } from '@/components/LoginScreen';
import { useAdminSession } from '@/hooks/useAdminSession';
import { colors } from '@/components/theme';

// Conditional render: LoginScreen when logged out, AssistedChatScreen when
// logged in. No route guard, no router-level protection.
export default function Index() {
  const session = useAdminSession();

  if (session.status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (session.status === 'logged-out') {
    return (
      <LoginScreen
        onLogin={session.login}
        loggingIn={session.loggingIn}
        loginError={session.loginError}
        expiredMessage={session.expiredMessage}
      />
    );
  }

  return <AssistedChatScreen user={session.user} onLogout={session.logout} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
