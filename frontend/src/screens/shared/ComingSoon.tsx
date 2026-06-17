import React from 'react';

import { EmptyState, Screen } from '@/components';

// Placeholder for screens scheduled in the next implementation pass, so the
// navigation graph is complete and every tab is reachable today.
export function ComingSoon({ title }: { title: string }) {
  return (
    <Screen>
      <EmptyState title={title} message="This screen is being implemented in the next pass." />
    </Screen>
  );
}
