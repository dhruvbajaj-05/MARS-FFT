import { useNavigation } from '@react-navigation/native';
import React from 'react';

import { AppText, Card, Screen } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';

// Admin → Master data hub. Links to the three create-screens.
export function MasterHubScreen() {
  const { spacing } = useTheme();
  const navigation = useNavigation<any>();

  const items = [
    { title: 'Customers', subtitle: 'Create companies', route: 'Customers' },
    { title: 'Products', subtitle: 'Create / delete products per customer', route: 'Products' },
    { title: 'Machines', subtitle: 'Injection & blow molding machines', route: 'Machines' },
    { title: 'Users', subtitle: 'Create engineers & customer logins', route: 'Users' },
  ];

  return (
    <Screen scroll>
      <AppText variant="h2" style={{ marginBottom: spacing(3) }}>
        Master Data
      </AppText>
      <AppText tone="muted" style={{ marginBottom: spacing(4) }}>
        Set up the data the factory workflow runs on.
      </AppText>
      {items.map((it) => (
        <Card
          key={it.route}
          onPress={() => navigation.navigate(it.route)}
          style={{ marginBottom: spacing(3) }}
        >
          <AppText variant="h3">{it.title}</AppText>
          <AppText tone="muted" variant="caption">
            {it.subtitle}
          </AppText>
        </Card>
      ))}
    </Screen>
  );
}
