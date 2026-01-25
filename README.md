# Habit Tracker

A minimal iOS app for tracking daily habits and medication doses with iCloud sync.

## Features

- **Dose Timer** - Track medication with elapsed time display and 2-hour reminders
- **Habit Tracking** - Log any habit with +/- counters and "increase" or "decrease" goals
- **History** - View and edit past entries by date
- **Statistics** - Charts showing trends over time
- **iCloud Sync** - Automatic sync across Apple devices

## Requirements

- Node.js 18+
- Xcode 15+
- iOS device with Apple Developer account
- macOS (for iOS builds)

## Installation

```bash
# Clone and install dependencies
git clone https://github.com/edd426/ios-habit-tracker.git
cd ios-habit-tracker
npm install

# Generate iOS project
npx expo prebuild --platform ios

# Build and run on device
npx expo run:ios --device
```

For release builds:
```bash
cd ios
xcodebuild -workspace HabitTracker.xcworkspace -scheme HabitTracker \
  -configuration Release \
  -destination 'platform=iOS,name=YOUR_DEVICE_NAME' \
  DEVELOPMENT_TEAM=YOUR_TEAM_ID \
  -allowProvisioningUpdates build
```

## Tech Stack

- Expo SDK 54 / React Native 0.81
- expo-router (file-based navigation)
- AsyncStorage + iCloud (expo-icloud-storage)
- expo-notifications

## License

MIT
