import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { StatusTone } from '@/theme/tokens';
import { clampPct } from '@/utils/format';
import { AppText } from './Text';

// ---------------------------------------------------------------------------
// Premium component kit — used by the Customer Portal. Built on the shared theme
// so it stays light/dark aware, but with larger radii, soft elevation and smooth
// micro-animations for a polished, OEM-grade feel. No new dependencies.
// ---------------------------------------------------------------------------

// Soft, layered elevation (iOS shadow + Android elevation).
export function shadow(level: 'sm' | 'md' | 'lg' = 'md'): ViewStyle {
  const map = {
    sm: { radius: 6, y: 2, opacity: 0.06, elevation: 2 },
    md: { radius: 14, y: 6, opacity: 0.1, elevation: 5 },
    lg: { radius: 24, y: 12, opacity: 0.14, elevation: 10 },
  }[level];
  return {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: map.y },
    shadowOpacity: map.opacity,
    shadowRadius: map.radius,
    elevation: map.elevation,
  };
}

// Map a human status string to a semantic tone.
export function statusTone(status?: string | null): StatusTone {
  const s = (status || '').toLowerCase();
  if (/(complete|dispatched|shipped)/.test(s)) return 'success';
  if (/delay|fail|reject/.test(s)) return 'danger';
  if (/(dispatch|qc|assembly|moulding|progress|in )/.test(s)) return 'progress';
  if (/(placed|created|pending|not started)/.test(s)) return 'neutral';
  return 'info';
}

// ---- Press micro-interaction ------------------------------------------------
// Wraps content with a smooth scale/opacity press-in animation.
export function PressableScale({
  children,
  onPress,
  disabled,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      onPressIn={() => to(0.97)}
      onPressOut={() => to(1)}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

// ---- Status pill ------------------------------------------------------------
export function StatusPill({ label, tone }: { label: string; tone?: StatusTone }) {
  const { colors, radius, spacing } = useTheme();
  const t = colors.status[tone ?? statusTone(label)];
  return (
    <View
      style={{
        backgroundColor: t.bg,
        borderRadius: radius.pill,
        paddingHorizontal: spacing(2.5),
        paddingVertical: spacing(1),
        alignSelf: 'flex-start',
      }}
    >
      <AppText variant="caption" weight="700" style={{ color: t.fg, letterSpacing: 0.3 }}>
        {label}
      </AppText>
    </View>
  );
}

// ---- Animated gauge (thick rounded progress bar) ----------------------------
export function GaugeBar({
  pct,
  tone,
  height = 10,
  showLabel = false,
}: {
  pct: number;
  tone?: StatusTone;
  height?: number;
  showLabel?: boolean;
}) {
  const { colors, radius } = useTheme();
  const value = clampPct(pct);
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: value,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value, width]);
  const fill = tone ? colors.status[tone].fg : colors.primary;
  return (
    <View>
      {showLabel ? (
        <View style={styles.rowBetween}>
          <AppText variant="caption" tone="muted">Progress</AppText>
          <AppText variant="caption" weight="700" style={{ color: fill }}>{value}%</AppText>
        </View>
      ) : null}
      <View style={{ height, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, overflow: 'hidden' }}>
        <Animated.View
          style={{
            height,
            borderRadius: radius.pill,
            backgroundColor: fill,
            width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          }}
        />
      </View>
    </View>
  );
}

// ---- Circular progress badge (big % inside a tinted ring) --------------------
export function ProgressBadge({ pct, size = 64, tone }: { pct: number; size?: number; tone?: StatusTone }) {
  const { colors } = useTheme();
  const value = clampPct(pct);
  const t = colors.status[tone ?? (value >= 100 ? 'success' : 'progress')];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: Math.max(4, size * 0.09),
        borderColor: t.fg,
        backgroundColor: t.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText weight="700" style={{ color: t.fg, fontSize: size * 0.28 }}>
        {value}
        <AppText weight="700" style={{ color: t.fg, fontSize: size * 0.16 }}>%</AppText>
      </AppText>
    </View>
  );
}

// ---- Section card (large, headed container) ---------------------------------
export function SectionCard({
  icon,
  title,
  statusLabel,
  statusTone: tone,
  progressPct,
  children,
  style,
}: {
  icon?: string;
  title: string;
  statusLabel?: string;
  statusTone?: StatusTone;
  progressPct?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing(4),
          marginBottom: spacing(4),
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        shadow('sm'),
        style,
      ]}
    >
      <View style={[styles.rowBetween, { marginBottom: spacing(3) }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          {icon ? (
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: spacing(3),
              }}
            >
              <AppText style={{ fontSize: 20 }}>{icon}</AppText>
            </View>
          ) : null}
          <AppText variant="h3" style={{ flex: 1 }}>{title}</AppText>
        </View>
        {statusLabel ? <StatusPill label={statusLabel} tone={tone} /> : null}
      </View>
      {progressPct !== undefined ? (
        <View style={{ marginBottom: spacing(3) }}>
          <GaugeBar pct={progressPct} tone={tone} showLabel />
        </View>
      ) : null}
      {children}
    </View>
  );
}

// ---- Stat tile + grid -------------------------------------------------------
export function StatTile({
  label,
  value,
  tone,
  emphasize,
}: {
  label: string;
  value: string | number;
  tone?: StatusTone;
  emphasize?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  const fg = tone ? colors.status[tone].fg : colors.text;
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '30%',
        backgroundColor: emphasize && tone ? colors.status[tone].bg : colors.surfaceAlt,
        borderRadius: radius.md,
        paddingVertical: spacing(3),
        paddingHorizontal: spacing(3),
      }}
    >
      <AppText variant="caption" tone="muted" numberOfLines={1}>{label}</AppText>
      <AppText weight="700" style={{ color: fg, fontSize: 19, marginTop: 2 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </AppText>
    </View>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  const { spacing } = useTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) }}>{children}</View>;
}

// A labelled metric row with an inline value (used inside expandable mould cards).
export function MetricRow({ label, value, tone }: { label: string; value: string | number; tone?: StatusTone }) {
  const { colors, spacing } = useTheme();
  const fg = tone ? colors.status[tone].fg : colors.text;
  return (
    <View style={[styles.rowBetween, { paddingVertical: spacing(1) }]}>
      <AppText variant="caption" tone="muted">{label}</AppText>
      <AppText variant="caption" weight="700" style={{ color: fg }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </AppText>
    </View>
  );
}

// ---- Vertical timeline ------------------------------------------------------
export function Timeline({ steps }: { steps: { label: string; at: string | null; done: boolean }[] }) {
  const { colors, spacing } = useTheme();
  return (
    <View>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const done = s.done;
        const color = done ? colors.status.success.fg : colors.textMuted;
        return (
          <View key={s.label} style={{ flexDirection: 'row' }}>
            <View style={{ alignItems: 'center', width: 28 }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: done ? colors.status.success.bg : colors.surfaceAlt,
                  borderWidth: 2,
                  borderColor: color,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {done ? (
                  <AppText style={{ color: colors.status.success.fg, fontSize: 12, fontWeight: '800' }}>✓</AppText>
                ) : (
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted }} />
                )}
              </View>
              {!last ? (
                <View style={{ width: 2, flex: 1, minHeight: 26, backgroundColor: done ? colors.status.success.fg : colors.border }} />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : spacing(3), paddingLeft: spacing(2) }}>
              <AppText weight={done ? '700' : '500'} style={{ color: done ? colors.text : colors.textMuted }}>
                {s.label}
              </AppText>
              {s.at ? (
                <AppText variant="caption" tone="muted">
                  {new Date(s.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </AppText>
              ) : (
                <AppText variant="caption" tone="muted">Pending</AppText>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ---- Skeleton loaders (shimmer via opacity pulse) ---------------------------
export function Skeleton({ width, height, radius: r, style }: { width?: number | string; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { colors, radius } = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[
        {
          width: (width as number) ?? '100%',
          height: height ?? 16,
          borderRadius: r ?? radius.sm,
          backgroundColor: colors.surfaceAlt,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

// A skeleton shaped like the product/order cards, used while data loads.
export function SkeletonCard() {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing(4),
          marginBottom: spacing(3),
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        shadow('sm'),
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing(3) }}>
        <Skeleton width={52} height={52} radius={radius.md} />
        <View style={{ flex: 1, marginLeft: spacing(3), gap: spacing(2) }}>
          <Skeleton width="70%" height={16} />
          <Skeleton width="40%" height={12} />
        </View>
      </View>
      <Skeleton width="100%" height={10} radius={999} />
      <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) }}>
        <Skeleton width="30%" height={40} radius={radius.md} />
        <Skeleton width="30%" height={40} radius={radius.md} />
        <Skeleton width="30%" height={40} radius={radius.md} />
      </View>
    </View>
  );
}

// ---- Professional empty state ----------------------------------------------
export function PremiumEmpty({ icon = '📦', title, message }: { icon?: string; title: string; message?: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing(12), paddingHorizontal: spacing(6) }}>
      <View
        style={{
          width: 76,
          height: 76,
          borderRadius: 38,
          backgroundColor: colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing(4),
        }}
      >
        <AppText style={{ fontSize: 34 }}>{icon}</AppText>
      </View>
      <AppText variant="h3" style={{ textAlign: 'center' }}>{title}</AppText>
      {message ? (
        <AppText tone="muted" style={{ textAlign: 'center', marginTop: spacing(2), lineHeight: 20 }}>
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

// Brand tile placeholder for a product with no image (initial on a tinted square).
export function BrandTile({ name, size = 52 }: { name: string; size?: number }) {
  const { colors, radius } = useTheme();
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        backgroundColor: colors.status.info.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText weight="700" style={{ color: colors.status.info.fg, fontSize: size * 0.42 }}>
        {initial}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
