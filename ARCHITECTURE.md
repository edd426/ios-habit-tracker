# Habit Tracker Architecture

A brief overview of the app's architecture and design decisions.

## Tech Stack

- **Framework**: Expo SDK 54 + React Native 0.81
- **Navigation**: expo-router (file-based routing)
- **Storage**: AsyncStorage (local-first)
- **Sync**: iCloud (planned)
- **Charts**: react-native-chart-kit
- **Notifications**: expo-notifications

## Data Flow

```
User Action → storage.ts (AsyncStorage) → iCloud sync (background)
                    ↓
              UI updates immediately
```

## Storage Architecture

```
┌─────────────────────────────────────────────────────┐
│                    iCloud (planned)                  │
│  (Automatic sync across all user's Apple devices)   │
└─────────────────────────────────────────────────────┘
                         ↑ sync
┌─────────────────────────────────────────────────────┐
│              AsyncStorage (Local)                    │
│  - habits, habit_logs, dose_logs                    │
│  - user_id (generated UUID)                         │
└─────────────────────────────────────────────────────┘
                         ↑ read/write
┌─────────────────────────────────────────────────────┐
│                  React Native App                    │
│  - lib/storage.ts (data access layer)               │
│  - lib/sync.ts (sync coordination)                  │
└─────────────────────────────────────────────────────┘
```

## Design Principles

1. **Local-first** - AsyncStorage is source of truth; UI never waits for network
2. **Background sync** - Sync operations are non-blocking
3. **Last-write-wins** - Simple conflict resolution using timestamps
4. **Soft deletes** - `deleted: true` pattern for sync compatibility

## Key Files

| File | Purpose |
|------|---------|
| `lib/storage.ts` | AsyncStorage CRUD operations |
| `lib/sync.ts` | Sync coordination (placeholder for iCloud) |
| `lib/types.ts` | TypeScript interfaces |
| `lib/auth.ts` | Local UUID management |
| `components/DoseTimer.tsx` | Medication dose tracker |
| `components/HabitCard.tsx` | Habit counter UI |
