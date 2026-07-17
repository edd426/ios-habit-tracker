import React, { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import BugReportModal from '@/components/BugReportModal';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  // Bug capture is reachable from every screen's header so a report is one
  // tap away at the moment a bug is noticed. The screen name rides along.
  const [bugScreen, setBugScreen] = useState<string | null>(null);

  const bugButton = (screen: string) => () => (
    <TouchableOpacity
      onPress={() => setBugScreen(screen)}
      style={{ paddingHorizontal: 16, paddingVertical: 8 }}
      accessibilityLabel="Report a bug"
    >
      <FontAwesome name="bug" size={18} color="#888" />
    </TouchableOpacity>
  );

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
          headerShown: true,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
            headerRight: bugButton('Home'),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'History',
            tabBarIcon: ({ color }) => <TabBarIcon name="calendar" color={color} />,
            headerRight: bugButton('History'),
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: 'Stats',
            tabBarIcon: ({ color }) => <TabBarIcon name="bar-chart" color={color} />,
            headerRight: bugButton('Stats'),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={color} />,
            headerRight: bugButton('Settings'),
          }}
        />
      </Tabs>

      <BugReportModal
        visible={bugScreen !== null}
        screen={bugScreen ?? ''}
        onClose={() => setBugScreen(null)}
      />
    </>
  );
}
