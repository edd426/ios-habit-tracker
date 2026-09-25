import React from 'react';
import { Modal } from 'react-native';
import { act, render } from '@testing-library/react-native';
import PickerSheet, { NO_MAX_DATE } from '../PickerSheet';

// Record the props each render hands to the native picker.
const pickerProps: any[] = [];
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return (props: any) => {
    pickerProps.push(props);
    return <View testID="native-picker" />;
  };
});

function openSheet(maximumDate?: Date, mode: 'date' | 'time' = 'time') {
  const utils = render(
    <PickerSheet
      visible
      title="Select Time"
      value={new Date(2026, 8, 5, 14, 30)}
      mode={mode}
      maximumDate={maximumDate}
      onChange={() => {}}
      onDone={() => {}}
      onCancel={() => {}}
    />
  );
  // The native picker mounts only once the modal reports it has presented.
  act(() => {
    utils.UNSAFE_getByType(Modal).props.onShow();
  });
  return utils;
}

beforeEach(() => {
  pickerProps.length = 0;
});

describe('PickerSheet maximumDate', () => {
  // Regression: an absent maximumDate reached the recycled native view as 0,
  // which datetimepicker <= 8.5.0 applied as maximumDate = epoch. The time
  // wheels then clamped to 1:00 AM and snapped back on every spin.
  it('never sends an absent maximumDate to the native picker', () => {
    const { getByTestId } = openSheet(undefined);
    getByTestId('native-picker');
    expect(pickerProps.length).toBeGreaterThan(0);
    for (const props of pickerProps) {
      expect(props.maximumDate).toBeInstanceOf(Date);
      expect(props.maximumDate.getTime()).toBeGreaterThan(0);
    }
  });

  it('uses the no-bound sentinel when the caller gives no max', () => {
    openSheet(undefined);
    expect(pickerProps.at(-1).maximumDate).toBe(NO_MAX_DATE);
  });

  it('passes a caller-supplied max through unchanged', () => {
    const max = new Date(2026, 8, 5, 18, 0);
    openSheet(max, 'date');
    expect(pickerProps.at(-1).maximumDate).toBe(max);
  });

  it('keeps the sentinel far enough out that it never clamps a real entry', () => {
    // Guard against someone "tidying" the sentinel to now-ish.
    expect(NO_MAX_DATE.getFullYear()).toBeGreaterThanOrEqual(2100);
  });
});

describe('installed @react-native-community/datetimepicker', () => {
  // The JS guard above covers the maximumDate path. Recycling also let a reused
  // view open on the previous sheet's wheel position, which only the native
  // fix (8.5.1: shouldBeRecycled -> NO) addresses. Fail loudly on a downgrade,
  // e.g. `expo install --fix` pulling it back to SDK 54's pinned 8.4.4.
  it('opts its native view out of Fabric recycling', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(
        path.dirname(require.resolve('@react-native-community/datetimepicker/package.json')),
        'ios/fabric/RNDateTimePickerComponentView.mm'
      ),
      'utf8'
    );
    expect(src).toMatch(/\+\s*\(BOOL\)shouldBeRecycled\s*\{\s*return NO;/);
  });
});
