import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import CalendarHeatmap from '../charts/CalendarHeatmap';
import GapChart from '../charts/GapChart';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n: number, hour = 10) => {
  const d = new Date(now - n * DAY);
  d.setHours(hour, 0, 0, 0);
  return { timestamp: d.getTime() };
};

// ~5 months of a habit that thins out: daily at first, then every few days.
const habitEvents = [
  ...Array.from({ length: 60 }, (_, i) => daysAgo(150 - i)),
  ...Array.from({ length: 12 }, (_, i) => daysAgo(80 - i * 7)),
];
const doseEvents = Array.from({ length: 30 }, (_, i) => daysAgo(i * 2, 8));

describe('CalendarHeatmap', () => {
  it('renders the grid, toggles span and source without crashing', () => {
    const { getByText, queryByText } = render(
      <CalendarHeatmap habitEvents={habitEvents} doseEvents={doseEvents} habitColor="46, 204, 113" />
    );
    expect(getByText('Calendar')).toBeTruthy();
    expect(getByText(/active days/)).toBeTruthy();
    fireEvent.press(getByText('1Y'));
    fireEvent.press(getByText('Doses'));
    expect(getByText(/Doses per day/)).toBeTruthy();
    expect(queryByText('No activity in this span')).toBeNull();
  });

  it('shows an empty state instead of a blank grid', () => {
    const { getByText, queryByText } = render(
      <CalendarHeatmap habitEvents={[]} doseEvents={[]} habitColor="46, 204, 113" />
    );
    expect(getByText('No activity in this span')).toBeTruthy();
    expect(queryByText('Doses')).toBeNull(); // no dose toggle without doses
  });
});

describe('GapChart', () => {
  it('renders histogram and step chart, and flips source', () => {
    const { getByText } = render(
      <GapChart
        habitEvents={habitEvents}
        doseEvents={doseEvents}
        habitColor="231, 76, 60"
        habitType="decrease"
      />
    );
    expect(getByText('Longest gap so far')).toBeTruthy();
    expect(getByText('15+d')).toBeTruthy();
    expect(getByText(/Longer gaps are longer stretches without it/)).toBeTruthy();
    expect(getByText(/Current gap:/)).toBeTruthy();
    fireEvent.press(getByText('Doses'));
    expect(getByText(/days without a dose/)).toBeTruthy();
  });

  it('needs three active days before drawing anything', () => {
    const { getByText } = render(
      <GapChart
        habitEvents={[daysAgo(3), daysAgo(1)]}
        doseEvents={[]}
        habitColor="46, 204, 113"
        habitType="increase"
      />
    );
    expect(getByText('Needs at least 3 active days')).toBeTruthy();
  });
});
