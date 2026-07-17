import { useRoute, type RouteProp } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { qcReportsApi } from '@/api/endpoints/qcReports';
import { queryKeys } from '@/api/queryKeys';
import type { QCReport, QCStatusValue } from '@/api/types';
import { AppText, QueryBoundary, Screen } from '@/components';
import { SectionCard } from '@/components/premium';
import { CommentThread, FullscreenImageViewer, StatusPicker, formatDateTime } from '@/components/qc';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { useTheme } from '@/theme/ThemeProvider';
import type { QCStackParamList } from './navTypes';

// A QC case, simplified: images (until the case is closed), an Open/Closed control, and
// the comment thread. Closing a case permanently deletes its images from storage — the
// record and comments are kept for audit.
export function QCReportDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { params } = useRoute<RouteProp<QCStackParamList, 'QCReportDetail'>>();
  const { reportId } = params;
  const qc = useQueryClient();

  const [viewerAt, setViewerAt] = useState<number | null>(null);

  const query = useQuery({
    queryKey: queryKeys.qc.report(reportId),
    queryFn: () => qcReportsApi.get(reportId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.qc.report(reportId) });
    qc.invalidateQueries({ queryKey: ['qc', 'reports'] });
    qc.invalidateQueries({ queryKey: ['qc', 'order-context'] });
  };

  const statusMut = useMutation({
    mutationFn: (status: QCStatusValue) => qcReportsApi.setStatus(reportId, status),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.qc.report(reportId), updated);
      invalidate();
    },
  });
  const commentMut = useMutation({
    mutationFn: (text: string) => qcReportsApi.addComment(reportId, text),
    onSuccess: (updated) => qc.setQueryData(queryKeys.qc.report(reportId), updated),
  });

  // Closing deletes images — confirm first. Re-opening needs no confirmation.
  const changeStatus = (next: QCStatusValue) => {
    if (next === 'closed') {
      Alert.alert(
        'Close this QC case?',
        'Closing permanently deletes the uploaded images to free storage. The case and all comments are kept.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Close case', style: 'destructive', onPress: () => statusMut.mutate('closed') },
        ]
      );
      return;
    }
    statusMut.mutate(next);
  };

  return (
    <Screen
      scroll
      contentStyle={{ paddingBottom: 160 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
    >
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        data={query.data}
        onRetry={query.refetch}
      >
        {(r: QCReport) => {
          const uris = r.photos.map((p) => resolveMediaUrl(p.url)).filter(Boolean) as string[];
          const isClosed = r.status === 'closed';
          return (
            <View>
              {/* Images — viewable until the case is closed */}
              {r.photos.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing(2), marginBottom: spacing(4) }}
                >
                  {r.photos.map((p, i) => (
                    <Pressable key={p.id} onPress={() => setViewerAt(i)}>
                      <Image
                        source={{ uri: resolveMediaUrl(p.url) }}
                        style={{ width: 220, height: 220, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt }}
                        contentFit="cover"
                        transition={150}
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              ) : isClosed ? (
                <View
                  style={{
                    backgroundColor: colors.surfaceAlt,
                    borderRadius: radius.lg,
                    padding: spacing(4),
                    marginBottom: spacing(4),
                    alignItems: 'center',
                  }}
                >
                  <AppText style={{ fontSize: 28, marginBottom: spacing(1) }}>🗑️</AppText>
                  <AppText tone="muted" variant="caption" style={{ textAlign: 'center' }}>
                    Images were removed when this case was closed.
                  </AppText>
                </View>
              ) : null}

              <AppText variant="h2" style={{ marginBottom: spacing(1) }}>
                {r.defects.length ? r.defects.join(', ') : 'Defect report'}
              </AppText>
              <AppText tone="muted" style={{ marginBottom: spacing(4) }}>
                {r.submittedByName ?? 'Engineer'} · {formatDateTime(r.createdAt)}
              </AppText>

              {/* Status: Open / Closed */}
              <SectionCard icon="🚦" title="QC Status">
                <StatusPicker value={r.status} onChange={changeStatus} disabled={statusMut.isPending} />
              </SectionCard>

              {/* Comments */}
              <SectionCard icon="💬" title={`Comments (${r.comments.length})`}>
                <CommentThread
                  comments={r.comments}
                  onAdd={(text) => commentMut.mutate(text)}
                  submitting={commentMut.isPending}
                />
              </SectionCard>

              <FullscreenImageViewer
                visible={viewerAt !== null}
                uris={uris}
                initialIndex={viewerAt ?? 0}
                onClose={() => setViewerAt(null)}
              />
            </View>
          );
        }}
      </QueryBoundary>
    </Screen>
  );
}
