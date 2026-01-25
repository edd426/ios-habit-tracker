# CLAUDE.md

This file provides guidance to Claude Code when working with this codebase.

## Project Overview

**Habit Tracker** is a React Native/Expo app for tracking daily habits and medication doses. The app focuses on:

1. **Medication dose tracking** - Log when medication is taken, with a timer showing elapsed time and 2-hour notification reminders
2. **Custom habit tracking** - Track any behavior (exercise, reading, etc.) with "increase" or "decrease" goals
3. **Historical data** - View and edit past entries, see trends over time
4. **Cloud sync** - iCloud backup and sync across Apple devices

## Tech Stack

- **Framework**: Expo SDK 54 with React Native 0.81
- **Navigation**: expo-router (file-based routing)
- **Storage**: AsyncStorage (local) + iCloud (cloud sync)
- **Identity**: Local UUID (no external auth service)
- **Charts**: react-native-chart-kit with react-native-svg
- **Notifications**: expo-notifications

## Architecture

### Local-First Design

The app prioritizes offline functionality:

1. All data operations write to **AsyncStorage first**
2. iCloud syncs data across user's Apple devices automatically
3. Uses **last-write-wins** merge strategy for conflict resolution
4. Soft deletes (sets `deleted: true`) to handle sync edge cases

### Data Flow

```
User Action → storage.ts (AsyncStorage) → iCloud sync (background)
                    ↓
              UI updates immediately
```

### Key Patterns

- **Background sync helper**: `backgroundSync()` in `lib/storage.ts` wraps sync calls to prevent blocking
- **Soft deletes**: All entities have `deleted?: boolean` field for sync compatibility
- **Timestamps**: All entities track `createdAt` and `updatedAt` for merge resolution
- **Local identity**: UUID generated on first launch, stored in AsyncStorage

## File Structure

```
app/
├── _layout.tsx          # Root layout with notifications setup
├── (tabs)/
│   ├── _layout.tsx      # Tab navigator configuration
│   ├── index.tsx        # Home: Dose timer + habit cards
│   ├── history.tsx      # Day-by-day log viewer/editor
│   ├── stats.tsx        # Charts and weekly comparisons
│   └── settings.tsx     # Habit management + sync status

components/
├── DoseTimer.tsx        # Dose tracking with elapsed time display
├── HabitCard.tsx        # +1/-1 counter cards for habits
├── QuantityModal.tsx    # Bulk logging modal (+2, +3, etc.)
└── SyncStatus.tsx       # iCloud sync indicator

contexts/
└── AuthContext.tsx      # Local user ID provider

lib/
├── types.ts             # TypeScript interfaces (Habit, HabitLog, DoseLog)
├── storage.ts           # AsyncStorage CRUD with background sync
├── sync.ts              # iCloud sync logic and data merging
├── icloud.ts            # iCloud key-value storage wrapper
└── auth.ts              # Local UUID generation and management
```

## Development Commands

```bash
# Start Expo dev server
npm start

# Build and run on iOS device (requires Xcode + Apple Developer account)
npx expo prebuild --platform ios
npx expo run:ios --device

# TypeScript check
npx tsc --noEmit

# Clean rebuild (use after major dependency changes)
rm -rf ios/Pods ios/build node_modules
npm install
cd ios && pod install && cd ..
npx expo run:ios --device
```

## Type Definitions

```typescript
interface Habit {
  id: string;
  name: string;
  type: 'increase' | 'decrease';
  createdAt: number;
  updatedAt?: number;
  deleted?: boolean;
}

interface HabitLog {
  id: string;
  habitId: string;
  timestamp: number;      // When the habit occurred
  createdAt?: number;
  updatedAt?: number;
  deleted?: boolean;
}

interface DoseLog {
  id: string;
  timestamp: number;      // When dose was taken
  createdAt?: number;
  updatedAt?: number;
  deleted?: boolean;
}
```

## UI Conventions

- **Dark theme only**: Background `#0f0f1a`, cards `#1a1a2e` / `#16213e`
- **Accent colors**: Blue `#4a69bd`, Red `#e74c3c` (decrease), Green `#2ecc71` (increase)
- **Text colors**: Primary `#fff`, Secondary `#888`, Muted `#666`
- **Card radius**: 12-16px
- **Spacing**: 16px standard padding

## Implementation Notes

1. **ID Generation**: Uses `Date.now().toString(36) + Math.random().toString(36).substr(2)` for unique IDs that sort chronologically

2. **Date Handling**: All timestamps are Unix milliseconds. Day boundaries use `setHours(0,0,0,0)` for consistency

3. **Notification Scheduling**: 2-hour reminder after dose uses `TIME_INTERVAL` trigger (only for recent doses, not backdated entries)

4. **Tab Navigation**: Uses Expo Router's group-based routing with `(tabs)` directory

5. **iCloud Sync**: Uses `expo-icloud-storage` for NSUbiquitousKeyValueStore. Syncs on app startup and foreground. Shows "Local only" when iCloud unavailable
