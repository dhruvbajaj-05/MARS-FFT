import { useRoute, type RouteProp } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { qcReportsApi } from '@/api/endpoints/qcReports';
import { queryKeys } from '@/api/queryKeys';
import type { QCReport, QCStatusValue } from '@/api/types';
import { AppText, QueryBoundary, Screen, StatusPill } from '@/components';
import { SectionCard } from '@/components/premium';
import {
  CommentThread,
  FullscreenImageViewer,
  SEVERITY_META,
  StatusPicker,
  formatDateTime,
} from '@/components/qc';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { useTheme } from '@/theme/ThemeProvider';
import type { QCStackParamList } from './navTypes';
import { useQCCapabilities } from './useQCCapabilities';

// A QC case, simplified: images (until the case is closed), an Open/Closed control, and
// the comment thread. Closing a case permanently deletes its images from storage — the
// record and comments are kept for audit.
export function QCReportDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { params } = useRoute<RouteProp<QCStackParamList, 'QCReportDetail'>>();
  const { reportId } = params;
  const qc = useQueryClient();
  const caps = useQCCapabilities();

  const [viewerAt, setViewerAt] = useState<number | null>(null);

  const query = useQuery({
    queryKey: queryKeys.qc.report(reportId),
    queryFn: () => qcReportsApi.get(reportId),
  });

  // A status change moves a case in/out of the "open" count. Refresh every QC surface that
  // shows that count: the report itself, the report lists + start-page badge, the order
  // context, and the per-PO / per-order open counts in both departments' QC tabs.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.qc.report(reportId) });
    qc.invalidateQueries({ queryKey: ['qc', 'reports'] });
    qc.invalidateQueries({ queryKey: ['qc', 'order-context'] });
    qc.invalidateQueries({ queryKey: ['qc', 'active-pos'] });
    qc.invalidateQueries({ queryKey: ['qc', 'archived-pos'] });
    qc.invalidateQueries({ queryKey: ['qc', 'active-orders'] });
    qc.invalidateQueries({ queryKey: ['qc', 'archived-orders'] });
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

              {/* Report details — everything the reporter selected, shown plainly so anyone
                  (QC / Assembly / Moulding / Admin) sees the exact data. Machine/Mould only
                  apply to Moulding QC; Assembly reports simply omit them. */}
              <SectionCard icon="🔍" title="Details">
                <DetailRow label="Department" value={r.department === 'assembly' ? 'Assembly QC' : 'Moulding QC'} />
                <DetailRow label="Severity">
                  <StatusPill label={SEVERITY_META[r.severity].label} tone={SEVERITY_META[r.severity].tone} />
                </DetailRow>
                <DetailRow label="Defects" value={r.defects.length ? r.defects.join(', ') : '—'} />
                {r.department !== 'assembly' ? (
                  <>
                    <DetailRow label="Machine" value={r.machine || '—'} />
                    <DetailRow label="Mould" value={r.mould || '—'} />
                    <DetailRow label="Part" value={r.part || '—'} />
                  </>
                ) : null}
                {r.shift ? <DetailRow label="Shift" value={`Shift ${r.shift}`} /> : null}
                {r.tags.length ? <DetailRow label="Tags" value={r.tags.join(', ')} /> : null}
                {r.description ? <DetailRow label="Notes" value={r.description} last /> : null}
              </SectionCard>

              {/* Status: Open / Closed — QC engineer + admin can change; others read-only. */}
              <SectionCard icon="🚦" title="QC Status">
                <StatusPicker
                  value={r.status}
                  onChange={changeStatus}
                  disabled={!caps.canChangeStatus || statusMut.isPending}
                />
              </SectionCard>

              {/* Comments — composer only for QC engineer + admin. */}
              <SectionCard icon="💬" title={`Comments (${r.comments.length})`}>
                <CommentThread
                  comments={r.comments}
                  onAdd={(text) => commentMut.mutate(text)}
                  submitting={commentMut.isPending}
                  readOnly={!caps.canComment}
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

// One label/value row inside the Details card. Pass `children` for rich values (e.g. a pill).
function DetailRow({
  label,
  value,
  children,
  last,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  last?: boolean;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing(3),
        paddingVertical: spacing(2),
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <AppText tone="muted" style={{ flexShrink: 0 }}>{label}</AppText>
      {children ?? (
        <AppText weight="600" style={{ flex: 1, textAlign: 'right' }}>
          {value}
        </AppText>
      )}
    </View>
  );
}
