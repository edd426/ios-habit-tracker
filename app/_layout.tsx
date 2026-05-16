import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { AuthProvider } from '@/contexts/AuthContext';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

SplashScreen.preventAutoHideAsync();

async function requestNotificationPermissions() {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('Notification permissions not granted');
    }
  } catch (e) {
    // Don't let a permissions glitch take down the app.
    console.warn('Notification permission request failed:', e);
  }
}

// Hard ceiling on how long we wait for fonts to load before rendering anyway.
// If useFonts() ever fails to resolve or reject (rare but observed in the wild
// with corrupted font caches / stuck Metro connections), the app would otherwise
// sit on a blank screen forever.
const FONT_LOAD_WATCHDOG_MS = 4_000;

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });
  const [watchdogFired, setWatchdogFired] = useState(false);

  useEffect(() => {
    if (error) {
      // Log but do NOT throw — a missing/corrupt font asset shouldn't take down the entire app.
      // The system will fall back to its default font and the rest of the UI renders.
      console.error('Font load failed:', error);
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(() => {});
      requestNotificationPermissions();
    }
  }, [loaded]);

  // Failsafe: render the app even if fonts never finish loading.
  useEffect(() => {
    const watchdog = setTimeout(() => {
      if (!loaded && !error) {
        console.warn(`Font load watchdog fired after ${FONT_LOAD_WATCHDOG_MS}ms — rendering with system font fallback`);
        setWatchdogFired(true);
        SplashScreen.hideAsync().catch(() => {});
      }
    }, FONT_LOAD_WATCHDOG_MS);
    return () => clearTimeout(watchdog);
  }, [loaded, error]);

  // Render the app once fonts are loaded, OR if font loading errored,
  // OR if the watchdog fired. System font fallback is fine.
  if (!loaded && !error && !watchdogFired) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  return (
    <AuthProvider>
      <ThemeProvider value={DarkTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </AuthProvider>
  );
}
