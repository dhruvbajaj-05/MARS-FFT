import { Image } from 'expo-image';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { Media } from '@/api/types';
import { useTheme } from '@/theme/ThemeProvider';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { AppText } from './Text';

interface Props {
  title?: string;
  media: Media[];
}

// Horizontal, lazy, cached image strip (expo-image handles caching + blurhash-style
// transitions). Used for record photos and the customer photo gallery.
export function ImageGallery({ title, media }: Props) {
  const { colors, radius, spacing } = useTheme();
  if (!media || media.length === 0) return null;

  return (
    <View style={{ gap: spacing(2) }}>
      {title ? (
        <AppText variant="h3">
          {title} ({media.length})
        </AppText>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(2) }}>
        {media.map((m) => (
          <Image
            key={m.id}
            source={{ uri: resolveMediaUrl(m.url) }}
            style={[styles.thumb, { borderRadius: radius.md, backgroundColor: colors.surfaceAlt }]}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ thumb: { width: 120, height: 120 } });
