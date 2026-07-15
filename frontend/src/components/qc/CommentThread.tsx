import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { AppText } from '@/components/Text';
import type { QCComment } from '@/api/types';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDateTime } from './qcMeta';

// A simple comment thread (Admin + engineers now; customers read-only later).
export function CommentThread({
  comments,
  onAdd,
  submitting,
}: {
  comments: QCComment[];
  onAdd: (text: string) => void;
  submitting?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  const [text, setText] = useState('');

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText('');
  };

  return (
    <View>
      {comments.length === 0 ? (
        <AppText tone="muted" variant="caption" style={{ marginBottom: spacing(2) }}>
          No comments yet. Start the conversation.
        </AppText>
      ) : (
        <View style={{ gap: spacing(2), marginBottom: spacing(3) }}>
          {comments.map((c, i) => (
            <View
              key={c.id ?? i}
              style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing(3) }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <AppText variant="caption" weight="700">
                  {c.authorName || 'User'}
                  {c.authorRole ? (
                    <AppText variant="caption" tone="muted">
                      {'  '}· {c.authorRole.replace(/_/g, ' ')}
                    </AppText>
                  ) : null}
                </AppText>
                <AppText variant="caption" tone="muted">
                  {formatDateTime(c.createdAt)}
                </AppText>
              </View>
              <AppText>{c.text}</AppText>
            </View>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2) }}>
        <TextInput
          style={{
            flex: 1,
            backgroundColor: colors.surfaceAlt,
            borderColor: colors.border,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: radius.md,
            color: colors.text,
            padding: spacing(3),
          }}
          value={text}
          onChangeText={setText}
          placeholder="Write a comment…"
          placeholderTextColor={colors.textMuted}
          multiline
        />
        <Button label="Send" onPress={send} loading={submitting} disabled={!text.trim()} />
      </View>
    </View>
  );
}
