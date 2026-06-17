import React from 'react';

import { EmptyState, Screen } from '@/components';
import { departmentForRole } from '@/features/engineer/department';
import { useCurrentUser } from '@/hooks/useAuth';
import { AssemblyForm } from './forms/AssemblyForm';
import { DispatchForm } from './forms/DispatchForm';
import { MouldingForm } from './forms/MouldingForm';
import { QCForm } from './forms/QCForm';

// Single entry tab for every engineer — renders the form for the user's department.
export function EntryScreen() {
  const user = useCurrentUser();
  const dept = user ? departmentForRole(user.role) : null;

  switch (dept?.key) {
    case 'moulding':
      return <MouldingForm />;
    case 'assembly':
      return <AssemblyForm />;
    case 'qc':
      return <QCForm />;
    case 'dispatch':
      return <DispatchForm />;
    default:
      return (
        <Screen>
          <EmptyState title="No department" message="This account has no engineering department." />
        </Screen>
      );
  }
}
