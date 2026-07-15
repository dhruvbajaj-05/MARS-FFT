import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { PressableScale, shadow } from '@/components/premium';
import { AppText } from '@/components/Text';
import type { PickedFile } from '@/services/mediaUpload';
import { useTheme } from '@/theme/ThemeProvider';
import { FullscreenImageViewer } from './FullscreenImageViewer';

const MAX = 50;
// Compress on capture/pick — keeps uploads fast over factory Wi-Fi (spec §Photo Upload).
const QUALITY = 0.6;

function mimeFromAsset(a: ImagePicker.ImagePickerAsset): string {
  if (a.mimeType) return a.mimeType;
  const ext = (a.uri.split('.').pop() || '').toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function toPicked(a: ImagePicker.ImagePickerAsset): PickedFile {
  return {
    uri: a.uri,
    name: a.fileName || `qc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`,
    mimeType: mimeFromAsset(a),
    sizeBytes: a.fileSize,
  };
}

// A Google-Photos-style photo grid: Take Photo + Choose From Gallery, thumbnails with
// delete, tap-to-zoom fullscreen, up to `max` images per report, compressed on pick.
export function PhotoPickerGrid({
  photos,
  onChange,
  max = MAX,
}: {
  photos: PickedFile[];
  onChange: (next: PickedFile[]) => void;
  max?: number;
}) {
  const { colors, radius, spacing } = useTheme();
  const [viewerAt, setViewerAt] = useState<number | null>(null);

  const remaining = max - photos.length;

  const add = (assets: ImagePicker.ImagePickerAsset[]) => {
    const picked = assets.slice(0, remaining).map(toPicked);
    onChange([...photos, ...picked]);
  };

  const takePhoto = async () => {
    if (remaining <= 0) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera permission needed', 'Enable camera access to capture defect photos.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: QUALITY, mediaTypes: ['images'] });
    if (!res.canceled) add(res.assets);
  };

  const chooseFromGallery = async () => {
    if (remaining <= 0) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos permission needed', 'Enable photo access to attach defect images.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: QUALITY,
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (!res.canceled) add(res.assets);
  };

  const removeAt = (i: number) => onChange(photos.filter((_, idx) => idx !== i));

  const tile = 96;

  return (
    <View style={{ marginBottom: spacing(3) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(2) }}>
        <AppText variant="caption" tone="muted">
          Photos
        </AppText>
        <AppText variant="caption" tone="muted">
          {photos.length} / {max}
        </AppText>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) }}>
        {photos.map((p, i) => (
          <View key={`${p.uri}-${i}`} style={{ width: tile, height: tile }}>
            <Pressable onPress={() => setViewerAt(i)} style={{ flex: 1 }}>
              <Image
                source={{ uri: p.uri }}
                style={{ width: '100%', height: '100%', borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}
                contentFit="cover"
              />
            </Pressable>
            <Pressable
              onPress={() => removeAt(i)}
              hitSlop={8}
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: colors.status.danger.fg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText weight="700" style={{ color: '#fff', fontSize: 13 }}>
                ✕
              </AppText>
            </Pressable>
          </View>
        ))}

        {remaining > 0 ? (
          <>
            <PressableScale onPress={takePhoto}>
              <View
                style={[
                  {
                    width: tile,
                    height: tile,
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                  shadow('sm'),
                ]}
              >
                <AppText style={{ fontSize: 24 }}>📷</AppText>
                <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  Camera
                </AppText>
              </View>
            </PressableScale>
            <PressableScale onPress={chooseFromGallery}>
              <View
                style={[
                  {
                    width: tile,
                    height: tile,
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                  shadow('sm'),
                ]}
              >
                <AppText style={{ fontSize: 24 }}>🖼️</AppText>
                <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  Gallery
                </AppText>
              </View>
            </PressableScale>
          </>
        ) : null}
      </View>

      <FullscreenImageViewer
        visible={viewerAt !== null}
        uris={photos.map((p) => p.uri)}
        initialIndex={viewerAt ?? 0}
        onClose={() => setViewerAt(null)}
      />
    </View>
  );
}
