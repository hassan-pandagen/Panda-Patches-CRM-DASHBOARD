/**
 * Centralized query keys for TanStack Query.
 * This helps maintain consistency and avoid typos.
 *
 * See: https://tanstack.com/query/v4/docs/react/guides/query-keys
 */
export const queryKeys = {
  // All keys related to orders
  orders: {
    all: () => ['orders'] as const,
    lists: () => [...queryKeys.orders.all(), 'list'] as const,
    list: (filters: string) => [...queryKeys.orders.lists(), { filters }] as const,
    // Server-side paginated list (AllOrdersPage)
    paginated: (params: { page: number; filter: string; search: string; salesAgent?: string; leadSource?: string; date?: string; ids?: string }) =>
      [...queryKeys.orders.all(), 'paginated', params] as const,
    // Lightweight counts for tab badges (filtered by the same params as the paginated list)
    counts: (params?: { salesAgent?: string; leadSource?: string; dateRangeStart?: string; dateRangeEnd?: string }) =>
      [...queryKeys.orders.all(), 'counts', params || {}] as const,
    details: () => [...queryKeys.orders.all(), 'single'] as const, // Renamed from 'detail'
    single: (id: number) => [...queryKeys.orders.details(), id] as const, // Renamed from 'detail'
    history: (id: number) => [...queryKeys.orders.all(), 'history', id] as const,
    urgent: () => [...queryKeys.orders.all(), 'urgent'] as const,
    // Keys for reports
    reports: () => [...queryKeys.orders.all(), 'reports'] as const,
    report: (filters: object) => [...queryKeys.orders.reports(), filters] as const,
  },

  // All keys related to order communications
  communications: {
    all: () => ['communications'] as const,
    byOrderId: (orderId: number) => [...queryKeys.communications.all(), orderId] as const,
  },

  // All keys related to attendance
  attendance: {
    all: () => ['attendance'] as const,
    lists: () => [...queryKeys.attendance.all(), 'list'] as const,
    list: (filters: object) => [...queryKeys.attendance.lists(), filters] as const,
    today: (userId?: string) => [...queryKeys.attendance.lists(), 'today', { userId }] as const,
    active: (userId?: string) => [...queryKeys.attendance.all(), 'active', userId] as const,
  },

  // All keys related to the main dashboard
  dashboard: {
    all: () => ['dashboard'] as const,
    unified: (startDate: string, endDate: string) => 
      [...queryKeys.dashboard.all(), { startDate, endDate }] as const,
    metrics: (startDate: string, endDate: string) =>
      [...queryKeys.dashboard.all(), 'metrics', { startDate, endDate }] as const,
    table: (startDate: string, endDate: string) =>
      [...queryKeys.dashboard.all(), 'table', { startDate, endDate }] as const,
  },

  // All keys related to users/profiles
  users: {
    all: () => ['users'] as const,
    lists: () => [...queryKeys.users.all(), 'list'] as const,
  },

  // All keys related to user profiles (single user)
  user: {
    profile: (userId?: string) => ['profile', userId] as const,
  },

  // All keys related to performance metrics
  performanceMetrics: {
    all: () => ['performance-metrics'] as const,
  },

  // All keys related to search
  search: {
    all: () => ['search'] as const,
    results: (query: string) => [...queryKeys.search.all(), { query }] as const,
  },

  // All keys related to settings
  settings: {
    all: () => ['settings'] as const,
  },

  // All keys related to customers
  customer: {
    history: (customerId: string) => ['customer', 'history', customerId] as const,
  },

  // All keys related to quotes
  quotes: {
    all: () => ['quotes'] as const,
    lists: () => [...queryKeys.quotes.all(), 'list'] as const,
    details: () => [...queryKeys.quotes.all(), 'single'] as const,
    single: (quoteNumber: string) => [...queryKeys.quotes.details(), quoteNumber] as const,
  },

  // All keys related to order notes
  orderNotes: {
    all: () => ['order-notes'] as const,
    byOrderId: (orderId: number) => [...queryKeys.orderNotes.all(), orderId] as const,
    report: (startDate: string, endDate: string) => [...queryKeys.orderNotes.all(), 'report', { startDate, endDate }] as const,
  },

  // All keys related to form feedback (portal quote forms)
  formFeedback: {
    all: () => ['form-feedback'] as const,
    range: (startDate: string, endDate: string) => [...queryKeys.formFeedback.all(), 'range', { startDate, endDate }] as const,
  },

  // All keys related to monthly costs
  monthlyCosts: {
    all: () => ['monthly-costs'] as const,
    month: (monthYear: string) => [...queryKeys.monthlyCosts.all(), monthYear] as const,
    range: (start: string, end: string) => [...queryKeys.monthlyCosts.all(), 'range', { start, end }] as const,
  },
};