import { useRoute, type RouteProp } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { qcReportsApi } from '@/api/endpoints/qcReports';
import { queryKeys } from '@/api/queryKeys';
import type { QCReport, QCStatusValue } from '@/api/types';
import { AppText, QueryBoundary, Screen } from '@/components';
import { SectionCard, StatusPill } from '@/components/premium';
import {
  CommentThread,
  FullscreenImageViewer,
  SEVERITY_META,
  STATUS_META,
  StatusPicker,
  formatDateTime,
  shiftLabel,
} from '@/components/qc';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { useTheme } from '@/theme/ThemeProvider';
import type { QCStackParamList } from './navTypes';

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
          const sev = SEVERITY_META[r.severity];
          const uris = r.photos.map((p) => resolveMediaUrl(p.url)).filter(Boolean) as string[];
          return (
            <View>
              {/* Image gallery */}
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
              ) : null}

              <View style={{ flexDirection: 'row', gap: spacing(2), marginBottom: spacing(2) }}>
                <StatusPill label={sev.label} tone={sev.tone} />
                <StatusPill label={STATUS_META[r.status].label} tone={STATUS_META[r.status].tone} />
              </View>
              <AppText variant="h2" style={{ marginBottom: spacing(1) }}>
                {r.defects.length ? r.defects.join(', ') : 'Defect report'}
              </AppText>
              <AppText tone="muted" style={{ marginBottom: spacing(4) }}>
                {r.submittedByName ?? 'Engineer'} · {formatDateTime(r.createdAt)}
              </AppText>

              {/* Details */}
              <SectionCard icon="📋" title="Details">
                <Detail label="Machine" value={r.machine} />
                <Detail label="Mould" value={r.mould} />
                <Detail label="Part" value={r.part} />
                <Detail label="Shift" value={shiftLabel(r.shift)} />
                <Detail label="Department" value={r.department === 'assembly' ? 'Assembly QC' : 'Moulding QC'} last />
              </SectionCard>

              {r.description ? (
                <SectionCard icon="📝" title="Description">
                  <AppText style={{ lineHeight: 21 }}>{r.description}</AppText>
                </SectionCard>
              ) : null}

              {r.tags.length > 0 ? (
                <SectionCard icon="🏷️" title="Tags">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) }}>
                    {r.tags.map((t) => (
                      <View
                        key={t}
                        style={{
                          backgroundColor: colors.surfaceAlt,
                          borderRadius: radius.pill,
                          paddingHorizontal: spacing(3),
                          paddingVertical: spacing(1),
                        }}
                      >
                        <AppText variant="caption" weight="600">
                          {t}
                        </AppText>
                      </View>
                    ))}
                  </View>
                </SectionCard>
              ) : null}

              {/* Status control */}
              <SectionCard icon="🚦" title="Status">
                <StatusPicker
                  value={r.status}
                  onChange={(s) => statusMut.mutate(s)}
                  disabled={statusMut.isPending}
                />
                {r.statusHistory.length > 0 ? (
                  <View style={{ marginTop: spacing(3), gap: spacing(1) }}>
                    {r.statusHistory
                      .slice()
                      .reverse()
                      .map((h, i) => (
                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <AppText variant="caption" tone="muted">
                            {STATUS_META[h.status]?.label ?? h.status}
                            {h.byName ? ` · ${h.byName}` : ''}
                          </AppText>
                          <AppText variant="caption" tone="muted">
                            {formatDateTime(h.at)}
                          </AppText>
                        </View>
                      ))}
                  </View>
                ) : null}
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

function Detail({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing(2),
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <AppText tone="muted">{label}</AppText>
      <AppText weight="600">{value || '—'}</AppText>
    </View>
  );
}
