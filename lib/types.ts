export interface Habit {
  id: string;
  name: string;
  type: 'increase' | 'decrease';
  createdAt: number;
  updatedAt?: number;
  deleted?: boolean;
}

export interface HabitLog {
  id: string;
  habitId: string;
  timestamp: number;
  createdAt?: number;
  updatedAt?: number;
  deleted?: boolean;
}

export interface DoseLog {
  id: string;
  timestamp: number;
  createdAt?: number;
  updatedAt?: number;
  deleted?: boolean;
}
