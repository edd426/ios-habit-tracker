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

## Build and Install — CRITICAL

**This app is the user's daily medication-tracking tool. It must run standalone on the iPhone with no laptop dependency. ALWAYS install Release builds.**

### The rule

```bash
# ✅ CORRECT — produces a self-contained app that runs without Metro
npx expo run:ios --device <UDID> --configuration Release

# ❌ WRONG — produces a debug build that requires Metro running on the dev Mac
npx expo run:ios --device <UDID>
```

A debug build embeds `http://localhost:8081` as its JS script URL. When Metro isn't running (laptop closed, network changed, terminal closed, Metro killed), the app fails to load JavaScript with:

```
No script URL provided. Make sure the packager is running or you have embedded
a JS bundle in your application bundle.
unsanitizedScriptURLString = (null)
```

This is then followed by a misleading native crash:

```
TurboModuleManager: Timed out waiting for modules to be invalidated
-[RCTTurboModuleManager _invalidateModules]
```

**The TurboModule timeout is a downstream symptom, not the root cause.** When you see it, look *up* in the device log for the "No script URL provided" line — that's the real cause and it means the user is running a debug build.

### Finding the device UDID

`expo run:ios --device` without a value is interactive and won't work when invoked non-interactively (e.g., from Claude Code). Always pass the UDID explicitly:

```bash
xcrun xctrace list devices    # find "Evan DeLord's iPhone (...)" → UDID is in parens
npx expo run:ios --device 00008110-001E1D8114F3801E --configuration Release
```

### Reading the build output

A successful Release install ends with:

```
› Build Succeeded
› Installing /Users/.../HabitTracker.app
✔ Complete 100%
```

If the build ends with `CommandError: Cannot launch HabitTracker on ... device is locked`, **this is not a failure** — the build, sign, and install all succeeded. The user just needs to unlock the phone and tap the app icon. Expo reports the locked-launch as a non-zero exit code, which is misleading.

### Disk space prerequisite

A Release build needs **~8 GB of free disk** on the dev Mac for DerivedData + intermediate artifacts. If the user is on a small SSD, check `df -h ~` before kicking off — sub-8 GB often produces a cryptic `No space left on device` error mid-compile. Quick wins: `rm -rf ~/Library/Developer/Xcode/DerivedData` (regenerates), `rm -rf ~/.npm/_cacache`.

## Development Commands

```bash
# Start Expo dev server (Metro) — only needed for active JS hot-reload development
npm start

# Build and install Release app on iPhone (the daily-use deployment path)
npx expo run:ios --device <UDID> --configuration Release

# Generate native iOS project (only needed after editing app.json / native config)
npx expo prebuild --platform ios

# TypeScript check
npx tsc --noEmit

# Run tests
npm test

# Clean rebuild (use after major dependency changes)
rm -rf ios/Pods ios/build node_modules ~/Library/Developer/Xcode/DerivedData
npm install
cd ios && pod install && cd ..
npx expo run:ios --device <UDID> --configuration Release
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

## Startup Reliability Invariants

The app must launch reliably — it's the user's source of truth for medication doses. Several invariants protect against the New Architecture's "TurboModuleManager: Timed out waiting for modules to be invalidated" crash, which fires when iOS can't get a response from the JS thread within ~10s during teardown:

1. **UI rendering is never gated on sync.** `AuthContext` calls `setIsLoading(false)` immediately after the local user ID loads. iCloud setup and the initial sync run in a fire-and-forget background block. If iCloud is slow or stuck, the user still gets a working app.

2. **Every native bridge call has a timeout.** Use `lib/with-timeout.ts` to wrap any promise that touches the native side (iCloud, dynamic imports, notifications). The current timeouts:
   - iCloud module dynamic import: **3s**
   - Full sync (`syncAllData`): **10s**
   - Font loading watchdog (`_layout.tsx`): **4s**

3. **Sync is mutex'd and throttled.** `syncAllData` coalesces concurrent callers into one in-flight promise. Foreground-triggered syncs are throttled to one per 10s (`FOREGROUND_SYNC_THROTTLE_MS` in `AuthContext`). Rapid background/foreground cycles can no longer pile up native bridge work on the JS thread.

4. **iCloud init is deduplicated.** The first caller to `initializeICloud()` owns the `import('expo-icloud-storage')` promise; later callers share it. Failure resets the cached promise so a future call (e.g., after a foreground transition) can retry.

5. **Notification scheduling is non-fatal.** `Notifications.scheduleNotificationAsync` is wrapped in try/catch wherever it's called. A permissions denial or system glitch must never block dose logging — recording the dose is the primary purpose of the app.

6. **Soft-fail font loading.** If `useFonts()` errors OR doesn't settle within 4s, the app renders with the system font instead of hanging on a blank screen.

When adding new native-bridge work or new startup logic, preserve these invariants. The pattern: **wrap with `withTimeout`, run off the UI-loading critical path, catch errors and continue.**

## Planned Features

- **"Attempted but unsuccessful" state for habits** - For tracking things like intimacy where an attempt was made but didn't succeed. Useful for understanding patterns around medication timing and side effects.
