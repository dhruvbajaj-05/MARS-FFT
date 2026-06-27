import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './Text';

// ---------------------------------------------------------------------------
// Lightweight, dependency-free form controls shared by every MVP form. They are
// plain controlled components (value + onChange) so they work with local state on
// React Native and Expo web alike — no extra picker libraries required.
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  error?: string | null;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
}

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  error,
  multiline,
  autoCapitalize,
  secureTextEntry,
}: FieldProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ marginBottom: spacing(3) }}>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
      <TextInput
        style={{
          backgroundColor: colors.surfaceAlt,
          borderColor: error ? colors.status.danger.fg : colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.md,
          color: colors.text,
          padding: spacing(3),
          marginTop: 4,
          minHeight: multiline ? 72 : undefined,
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
      />
      {error ? (
        <AppText variant="caption" style={{ color: colors.status.danger.fg, marginTop: 4 }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

export interface SelectOption {
  label: string;
  value: string;
  hint?: string;
}

interface SelectProps {
  label: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string, option: SelectOption) => void;
  placeholder?: string;
  error?: string | null;
  emptyHint?: string;
}

// Inline expandable dropdown (tap to reveal options). Avoids native Modal/picker
// dependencies so it behaves identically on device and web.
export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  error,
  emptyHint = 'No options available',
}: SelectProps) {
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) || null;

  return (
    <View style={{ marginBottom: spacing(3) }}>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{
          backgroundColor: colors.surfaceAlt,
          borderColor: error ? colors.status.danger.fg : colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.md,
          padding: spacing(3),
          marginTop: 4,
        }}
      >
        <AppText tone={selected ? 'default' : 'muted'}>
          {selected ? selected.label : placeholder}
        </AppText>
      </Pressable>

      {open ? (
        <View
          style={{
            borderColor: colors.border,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: radius.md,
            marginTop: 4,
            overflow: 'hidden',
          }}
        >
          {options.length === 0 ? (
            <View style={{ padding: spacing(3) }}>
              <AppText tone="muted" variant="caption">
                {emptyHint}
              </AppText>
            </View>
          ) : (
            options.map((o) => (
              <Pressable
                key={o.value}
                onPress={() => {
                  onChange(o.value, o);
                  setOpen(false);
                }}
                style={{
                  padding: spacing(3),
                  backgroundColor: o.value === value ? colors.surfaceAlt : colors.surface,
                  borderTopColor: colors.border,
                  borderTopWidth: StyleSheet.hairlineWidth,
                }}
              >
                <AppText>{o.label}</AppText>
                {o.hint ? (
                  <AppText variant="caption" tone="muted">
                    {o.hint}
                  </AppText>
                ) : null}
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      {error ? (
        <AppText variant="caption" style={{ color: colors.status.danger.fg, marginTop: 4 }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

// Multi-select checkbox list for defect/reason selection (req #3).
// Renders a scrollable list of labelled checkboxes. The selected set is an array of
// string values; toggle adds/removes a value. A text field for new entries appears
// at the bottom so engineers can add defects that are not in the list.
interface MultiCheckboxProps {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  newEntryValue?: string;
  onNewEntryChange?: (v: string) => void;
  onAddNewEntry?: () => void;
  newEntryPlaceholder?: string;
}

export function MultiCheckbox({
  label,
  options,
  selected,
  onToggle,
  newEntryValue,
  onNewEntryChange,
  onAddNewEntry,
  newEntryPlaceholder = 'Add a new defect…',
}: MultiCheckboxProps) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ marginBottom: spacing(3) }}>
      <AppText variant="caption" tone="muted" style={{ marginBottom: spacing(1) }}>
        {label}
      </AppText>
      {options.map((opt) => {
        const checked = selected.includes(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => onToggle(opt)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: spacing(2),
              paddingHorizontal: spacing(2),
              borderRadius: radius.sm,
              backgroundColor: checked ? colors.status.info.bg : 'transparent',
              marginBottom: 2,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                borderWidth: 2,
                borderColor: checked ? colors.primary : colors.border,
                backgroundColor: checked ? colors.primary : 'transparent',
                marginRight: spacing(2),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {checked ? (
                <AppText style={{ color: colors.primaryText, fontSize: 11, fontWeight: '700' }}>✓</AppText>
              ) : null}
            </View>
            <AppText style={{ color: checked ? colors.status.info.fg : colors.text }}>{opt}</AppText>
          </Pressable>
        );
      })}
      {onNewEntryChange ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing(1) }}>
          <TextInput
            style={{
              flex: 1,
              backgroundColor: colors.surfaceAlt,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.md,
              color: colors.text,
              padding: spacing(2),
              marginRight: spacing(2),
            }}
            value={newEntryValue}
            onChangeText={onNewEntryChange}
            placeholder={newEntryPlaceholder}
            placeholderTextColor={colors.textMuted}
          />
          <Pressable
            onPress={onAddNewEntry}
            style={{
              backgroundColor: colors.primary,
              borderRadius: radius.md,
              paddingVertical: spacing(2),
              paddingHorizontal: spacing(3),
            }}
          >
            <AppText style={{ color: colors.primaryText, fontWeight: '600' }}>Add</AppText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// Inline result banner (used instead of Alert so it shows on web too).
export function Banner({ tone, message }: { tone: 'success' | 'danger' | 'info'; message: string }) {
  const { colors, radius, spacing } = useTheme();
  const c = colors.status[tone];
  return (
    <View
      style={{
        backgroundColor: c.bg,
        borderRadius: radius.md,
        padding: spacing(3),
        marginBottom: spacing(3),
      }}
    >
      <AppText style={{ color: c.fg }} weight="600">
        {message}
      </AppText>
    </View>
  );
}
