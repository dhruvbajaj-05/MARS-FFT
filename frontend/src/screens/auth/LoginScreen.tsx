import { zodResolver } from '@hookform/resolvers/zod';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { z } from 'zod';

import { AppText, Button, Card, Screen } from '@/components';
import { useLogin } from '@/hooks/useAuth';
import { ApiError, friendlyMessage } from '@/services/apiError';
import { useTheme } from '@/theme/ThemeProvider';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

export function LoginScreen() {
  const { colors, radius, spacing } = useTheme();
  const login = useLogin();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const onSubmit = (values: FormValues) => {
    login.mutate(values);
    // On success the auth store flips to 'authed' and RootNavigator swaps stacks.
  };

  const serverError = login.error instanceof ApiError ? friendlyMessage(login.error) : null;

  const inputStyle = {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing(3),
  };

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ marginTop: spacing(12), marginBottom: spacing(6) }}>
          <AppText variant="h1">FFT Manufacturing</AppText>
          <AppText tone="muted">Sign in to continue</AppText>
        </View>

        <Card>
          <AppText variant="caption" tone="muted">
            Email
          </AppText>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[inputStyle, { marginTop: 4 }]}
                placeholder="you@company.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />
          {errors.email ? (
            <AppText variant="caption" style={{ color: colors.status.danger.fg, marginTop: 4 }}>
              {errors.email.message}
            </AppText>
          ) : null}

          <AppText variant="caption" tone="muted" style={{ marginTop: spacing(3) }}>
            Password
          </AppText>
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[inputStyle, { marginTop: 4 }]}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />
          {errors.password ? (
            <AppText variant="caption" style={{ color: colors.status.danger.fg, marginTop: 4 }}>
              {errors.password.message}
            </AppText>
          ) : null}

          {serverError ? (
            <AppText style={{ color: colors.status.danger.fg, marginTop: spacing(3) }}>
              {serverError}
            </AppText>
          ) : null}

          <Button
            label="Sign In"
            onPress={handleSubmit(onSubmit)}
            loading={login.isPending}
            style={{ marginTop: spacing(4) }}
          />
        </Card>
      </KeyboardAvoidingView>
    </Screen>
  );
}
