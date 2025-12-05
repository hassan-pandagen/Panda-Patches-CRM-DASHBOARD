/**
 * Centralized React Query Keys
 * This file defines all query keys used throughout the application
 * Using this pattern ensures consistency and makes refactoring easier
 */

export const queryKeys = {
  // Dashboard queries
  dashboard: {
    metrics: (startDate: string, endDate: string) => [
      'dashboard-metrics',
      startDate,
      endDate,
    ],
    table: (startDate: string, endDate: string) => [
      'dashboard-table',
      startDate,
      endDate,
    ],
  },

  // Orders queries
  orders: {
    all: () => ['allOrders'],
    urgent: () => ['orders', 'urgent'],
    single: (orderNumber: string) => ['order', orderNumber],
    report: (startDate: string, endDate: string) => [
      'allOrdersReport',
      startDate,
      endDate,
    ],
    communications: (orderId: string) => ['orderCommunications', orderId],
  },

  // Users queries
  users: {
    all: () => ['allUsers'],
  },

  // Settings queries
  settings: {
    all: () => ['app_settings'],
  },

  // User profile/auth queries
  user: {
    profile: () => ['user'],
  },

  // Search queries
  search: {
    results: (query: string) => ['searchResults', query],
  },

  // Attendance/Clock In-Out queries
  attendance: {
    today: (userId?: string) => ['todayAttendance', userId],
    all: (dateRange?: { startDate: string; endDate: string }, userId?: string) => [
      'allAttendance',
      dateRange,
      userId,
    ],
  },

  // Customer queries
  customer: {
    history: (customerId: string) => ['customer_history', customerId],
  },
};
