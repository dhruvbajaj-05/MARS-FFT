import { useRoute, type RouteProp } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { Dimensions, Pressable, RefreshControl, View } from 'react-native';

import { qcReportsApi, type QCListParams } from '@/api/endpoints/qcReports';
import { queryKeys } from '@/api/queryKeys';
import { AppText, QueryBoundary, Screen } from '@/components';
import { PressableScale } from '@/components/premium';
import { FullscreenImageViewer, SEVERITY_ORDER, SEVERITY_META } from '@/components/qc';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { useTheme } from '@/theme/ThemeProvider';
import type { QCStackParamList } from './navTypes';

interface GalleryImage {
  uri: string;
  reportId: string;
  defect: string;
  machine: string | null;
  engineer: string | null;
  severity: string;
}

export function QCImageGalleryScreen() {
  const { colors, spacing, radius } = useTheme();
  const { params } = useRoute<RouteProp<QCStackParamList, 'QCImageGallery'>>();
  const { department, orderId } = params;

  const [sevFilter, setSevFilter] = useState<string | null>(null);
  const [viewerAt, setViewerAt] = useState<number | null>(null);

  const listParams: QCListParams = { department, orderId, limit: 100 };
  const query = useQuery({
    queryKey: queryKeys.qc.reports({ ...listParams, gallery: true }),
    queryFn: () => qcReportsApi.list(listParams),
  });

  const images: GalleryImage[] = useMemo(() => {
    const rows = query.data?.data ?? [];
    const out: GalleryImage[] = [];
    for (const r of rows) {
      if (sevFilter && r.severity !== sevFilter) continue;
      for (const p of r.photos) {
        const uri = resolveMediaUrl(p.url);
        if (uri) {
          out.push({
            uri,
            reportId: r.id,
            defect: r.defects[0] ?? 'Defect',
            machine: r.machine,
            engineer: r.submittedByName,
            severity: r.severity,
          });
        }
      }
    }
    return out;
  }, [query.data, sevFilter]);

  const size = (Dimensions.get('window').width - spacing(4) * 2 - spacing(2) * 2) / 3;

  return (
    <Screen
      scroll
      contentStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
    >
      <AppText variant="h1" style={{ marginBottom: spacing(3) }}>
        Image Gallery
      </AppText>

      {/* Severity filter */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(4) }}>
        <FilterChip label="All" active={sevFilter === null} onPress={() => setSevFilter(null)} />
        {SEVERITY_ORDER.map((s) => (
          <FilterChip
            key={s}
            label={SEVERITY_META[s].label}
            active={sevFilter === s}
            onPress={() => setSevFilter(s)}
          />
        ))}
      </View>

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        data={query.data}
        onRetry={query.refetch}
      >
        {() =>
          images.length === 0 ? (
            <AppText tone="muted">No photos match this filter.</AppText>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) }}>
              {images.map((img, i) => (
                <Pressable key={`${img.reportId}-${i}`} onPress={() => setViewerAt(i)}>
                  <Image
                    source={{ uri: img.uri }}
                    style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}
                    contentFit="cover"
                    transition={120}
                  />
                </Pressable>
              ))}
            </View>
          )
        }
      </QueryBoundary>

      <FullscreenImageViewer
        visible={viewerAt !== null}
        uris={images.map((i) => i.uri)}
        initialIndex={viewerAt ?? 0}
        onClose={() => setViewerAt(null)}
      />
    </Screen>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <PressableScale onPress={onPress}>
      <View
        style={{
          backgroundColor: active ? colors.primary : colors.surfaceAlt,
          borderRadius: radius.pill,
          paddingHorizontal: spacing(3),
          paddingVertical: spacing(2),
        }}
      >
        <AppText variant="caption" weight="700" style={{ color: active ? colors.primaryText : colors.textMuted }}>
          {label}
        </AppText>
      </View>
    </PressableScale>
  );
}
