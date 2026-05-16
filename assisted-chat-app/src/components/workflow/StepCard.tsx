import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, space } from '../theme';
import type { OperatorWorkflowStepStatus } from '@/types/operator-workflow';

export interface StepCardProps {
  title: string;
  description?: string;
  status: OperatorWorkflowStepStatus;
  children: ReactNode;
  /** Compact summary rendered when the card is collapsed. */
  summary?: ReactNode;
  defaultExpanded?: boolean;
  collapsible?: boolean;
  /**
   * Called when the header is tapped. When omitted, the card manages its
   * own expanded state internally (only meaningful if `collapsible`).
   */
  onHeaderPress?: () => void;
}

interface PillPalette {
  bg: string;
  border: string;
  text: string;
  label: string;
}

function pillForStatus(status: OperatorWorkflowStepStatus): PillPalette {
  switch (status) {
    case 'active':
      return {
        bg: 'rgba(249,115,22,0.14)',
        border: colors.accent,
        text: colors.accent,
        label: 'Active',
      };
    case 'waiting':
      return {
        bg: colors.infoBg,
        border: colors.infoBorder,
        text: colors.info,
        label: 'Waiting',
      };
    case 'complete':
      return {
        bg: colors.successBg,
        border: colors.successBorder,
        text: colors.success,
        label: 'Done',
      };
    case 'blocked':
      return {
        bg: colors.warningBg,
        border: colors.warningBorder,
        text: colors.warning,
        label: 'Needs attention',
      };
    case 'error':
      return {
        bg: colors.dangerBg,
        border: colors.dangerBorder,
        text: colors.danger,
        label: 'Error',
      };
    default:
      return {
        bg: colors.card,
        border: colors.border,
        text: colors.muted,
        label: 'Not started',
      };
  }
}

export function StepCard({
  title,
  description,
  status,
  children,
  summary,
  defaultExpanded,
  collapsible = false,
  onHeaderPress,
}: StepCardProps) {
  // Auto-collapse completed steps by default, unless caller overrides.
  const initialExpanded = defaultExpanded ?? status !== 'complete';
  const [expanded, setExpanded] = useState(initialExpanded);
  const pill = pillForStatus(status);

  const handlePress = () => {
    if (onHeaderPress) {
      onHeaderPress();
      return;
    }
    if (collapsible) setExpanded((value) => !value);
  };

  const headerInteractive = collapsible || Boolean(onHeaderPress);
  const headerContent = (
    <View style={styles.headerInner}>
      <View style={styles.headerText}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {description ? (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.pill,
          { backgroundColor: pill.bg, borderColor: pill.border },
        ]}
      >
        <Text style={[styles.pillText, { color: pill.text }]}>{pill.label}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.card}>
      {headerInteractive ? (
        <Pressable
          onPress={handlePress}
          android_ripple={{ color: colors.ripple }}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${title}. ${pill.label}. ${expanded ? 'Tap to collapse.' : 'Tap to expand.'}`}
          style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        >
          {headerContent}
        </Pressable>
      ) : (
        <View style={styles.header}>{headerContent}</View>
      )}

      {expanded ? (
        <View style={styles.body}>{children}</View>
      ) : summary ? (
        <View style={styles.summary}>{summary}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: space.md,
    paddingVertical: 12,
    borderBottomWidth: 0,
  },
  headerPressed: {
    backgroundColor: colors.card,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  description: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  pill: {
    minHeight: 26,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  body: {
    paddingHorizontal: space.md,
    paddingTop: 0,
    paddingBottom: space.md,
  },
  summary: {
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
});
