# 🏢 Industry Standard Foundation Guide
## Panda Patches CRM - Complete Architecture & Best Practices

**Document Version:** 1.1  
**Last Updated:** December 13, 2025  
**Status:** Production-Ready Foundation (UI Enhanced)  
**For:** Solo Developers & Development Teams  

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Philosophy](#architecture-philosophy)
3. [Project Structure](#project-structure)
4. [Technology Stack](#technology-stack)
5. [Core Patterns & Standards](#core-patterns--standards)
   - [Authentication & Authorization](#authentication--authorization)
   - [Data Fetching & Caching](#data-fetching--caching)
   - [Component Architecture](#component-architecture)
   - [Custom Hooks](#custom-hooks)
   - [State Management](#state-management)
   - [Error Handling](#error-handling)
6. [Database Design](#database-design)
7. [Performance Optimization](#performance-optimization)
8. [Security Best Practices](#security-best-practices)
9. [Testing Strategy](#testing-strategy)
10. [Accessibility & UX](#accessibility--ux)
11. [Common Pitfalls & Anti-Patterns](#common-pitfalls--anti-patterns)
12. [Deployment & DevOps](#deployment--devops)
13. [Monitoring & Logging](#monitoring--logging)

---

## Project Overview

### What This Project Is
**Panda Patches CRM** is an enterprise-grade Customer Relationship Management dashboard for managing orders, employee attendance, and business metrics with real-time data synchronization.

### Key Characteristics
- **Real-time Collaboration:** Supabase for live data
- **Complex Permission System:** Role-based access control (RBAC) with granular permissions
- **Performance Critical:** Handles large datasets with caching strategies
- **Multi-User Environment:** Concurrent access, conflict resolution
- **Mission-Critical Attendance:** Clock in/out system with audit trails
- **Offline Support:** Service workers for offline functionality

### Who Should Use This Guide
- **Solo Developers:** Starting new CRM/dashboard projects
- **Teams:** Onboarding new team members with consistent standards
- **Contractors:** Understanding architectural decisions and patterns
- **Auditors:** Verifying compliance with industry standards

---

## Architecture Philosophy

### Core Principles

#### 1. **Separation of Concerns**
Each module has a single responsibility:
- **Components:** UI rendering only
- **Hooks:** Business logic & data fetching
- **Services:** External API communication & utilities
- **Contexts:** Global state management

**Example:** Order creation
```
UI Component (OrderForm.tsx)
    ↓ calls
Custom Hook (useCreateOrder)
    ↓ calls
Service (orderService.ts)
    ↓ calls
Supabase Client
```

#### 2. **Dependency Injection Over Coupling**
Never import singletons directly in deep component trees.

❌ **Anti-pattern:**
```typescript
// Bad: Circular dependency risk
import { queryClient } from '../main.tsx';
```

✅ **Pattern:**
```typescript
// Good: Isolated, injectable
// src/services/queryClient.ts
export const queryClient = new QueryClient({...});

// main.tsx
import { queryClient } from './services/queryClient';
initializeSupabaseClient(queryClient);

// Any file can safely import
import { queryClient } from '../services/queryClient';
```

#### 3. **React Query as Single Source of Truth**
- One cache, one source of truth
- No useState for server state
- Automatic cache invalidation

#### 4. **Type Safety First**
- `strict: true` in tsconfig.json
- No `any` types
- Exhaustive TypeScript checking

---

## Project Structure

```
panda-patches-crm/
├── src/
│   ├── main.tsx                    # App entry point (providers here)
│   ├── App.tsx                     # Routing layer
│   ├── vite-env.d.ts              # Vite type definitions
│   ├── index.css                  # Global styles (Tailwind)
│   │
│   ├── assets/                    # Static files & database schema
│   │   └── db_schema.sql          # Supabase SQL schema (single source of truth)
│   │
│   ├── types/                     # TypeScript definitions
│   │   ├── index.ts               # Core app types (Order, User, etc.)
│   │   └── supabase.ts            # Supabase generated types
│   │
│   ├── constants/                 # Application constants
│   │   ├── queryKeys.ts           # TanStack Query key factory
│   │   └── ToastContext.tsx       # Toast notification setup
│   │
│   ├── services/                  # External integrations & utilities
│   │   ├── queryClient.ts         # CRITICAL: Isolated QueryClient instance
│   │   ├── supabaseClient.ts      # Supabase client + initialization
│   │   ├── orderService.ts        # Order CRUD operations
│   │   ├── authService.ts         # Authentication helpers
│   │   ├── userService.ts         # User management
│   │   ├── logger.ts              # Structured logging
│   │   ├── sentryLoader.ts        # Error tracking
│   │   ├── offlineManager.ts      # Offline support
│   │   ├── storageService.ts      # File uploads/downloads
│   │   ├── performanceMonitor.ts  # APM metrics
│   │   └── versionChecker.ts      # App update detection
│   │
│   ├── contexts/                  # React Context providers
│   │   └── AuthContext.tsx        # Auth state + profile fetching
│   │
│   ├── hooks/                     # Custom React hooks
│   │   ├── index.ts               # Barrel export
│   │   ├── useClockInOut.ts       # Attendance logic
│   │   ├── useQueryPrefetch.ts    # Prefetch strategies
│   │   ├── useRealtimeOrders.ts   # Real-time subscriptions
│   │   ├── useOrderCommunications.ts
│   │   ├── useOrderHistory.ts
│   │   ├── useDashboardMetrics.ts
│   │   ├── useDebounce.ts
│   │   ├── useLocalStorage.ts
│   │   ├── useToast.ts
│   │   ├── useWarnIfUnsaved.ts
│   │   └── useRipple.ts
│   │
│   ├── components/                # Reusable UI components
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx      # Main app shell
│   │   │   └── Sidebar.tsx
│   │   ├── ui/                    # Atomic components
│   │   │   ├── Button.tsx
│   │   │   ├── DateRangeFilter.tsx
│   │   │   ├── StatCard.tsx
│   │   │   ├── NotificationBell.tsx
│   │   │   └── ...
│   │   ├── orders/                # Order-specific components
│   │   │   ├── OrderForm.tsx
│   │   │   ├── OrdersTable.tsx
│   │   │   ├── OrderHistory.tsx
│   │   │   ├── ProductionFiles.tsx
│   │   │   └── ...
│   │   ├── dashboard/
│   │   ├── Reports/
│   │   ├── settings/
│   │   ├── ErrorBoundary.tsx      # Error handling
│   │   ├── ChunkErrorBoundary.tsx # Code splitting errors
│   │   └── OfflineIndicator.tsx
│   │
│   ├── pages/                     # Full-page components (route endpoints)
│   │   ├── Dashboard.tsx
│   │   ├── AllOrdersPage.tsx
│   │   ├── OrderPage.tsx
│   │   ├── NewOrderPage.tsx
│   │   ├── EditOrderPage.tsx
│   │   ├── LoginPage.tsx
│   │   ├── ClockInOutPage.tsx
│   │   ├── ReportsPage.tsx
│   │   ├── UserManagementPage.tsx
│   │   └── ...
│   │
│   ├── tests/                     # Unit & integration tests
│   │   ├── setup.ts               # Test configuration
│   │   ├── auth.test.ts
│   │   ├── helpers.test.ts
│   │   └── components.test.tsx
│   │
│   ├── ProtectedRoute.tsx         # Auth guard wrapper
│   ├── AdminRoute.tsx             # Admin-only route guard
│   └── service-worker.ts          # Offline/PWA support
│
├── api/                           # Serverless functions (optional)
├── supabase/                      # Supabase migrations
├── public/                        # Static assets
├── dist/                          # Build output
├── node_modules/                  # Dependencies
│
├── package.json                   # Dependencies & scripts
├── tsconfig.json                  # TypeScript strict mode enabled ✅
├── tailwind.config.cjs            # Styling configuration
├── postcss.config.cjs             # CSS processing
├── vite.config.ts                 # Build configuration
├── .env.example                   # Environment template
├── .gitignore
├── README.md
└── INDUSTRY_STANDARD_FOUNDATION.md # This file
```

### Directory Rules

**🔴 NEVER DO THIS:**
```
src/
├── components/
│   ├── MyComponent.tsx
│   ├── MyComponent.hooks.ts       ❌ Keep hooks separate
│   └── MyComponent.styles.ts
```

**🟢 DO THIS:**
```
src/
├── components/
│   └── MyComponent.tsx            ✅ Component only
├── hooks/
│   └── useMyComponent.ts          ✅ Logic separate
├── styles/
│   └── myComponent.css            ✅ Styles separate
```

---

## Technology Stack

### Core Dependencies

| Package | Version | Purpose | Why This Choice |
|---------|---------|---------|-----------------|
| React | 18.3.1 | UI library | Ecosystem, maturity |
| TypeScript | 5.5.3 | Type safety | Catch errors at compile-time |
| Vite | 5.3.3 | Build tool | Fast HMR, optimized builds |
| React Router | 6.30.2 | Client routing | Modern API, nested routes |
| TanStack Query | 5.90.12 | Data fetching | Caching, background sync |
| Supabase | 2.47.0 | Backend as a service | PostgreSQL + real-time |
| Tailwind CSS | 3.4.18 | Styling | Utility-first, fast dev |
| Framer Motion | 11.3.2 | Animations | Declarative, performance |
| Zod | 3.23.8 | Schema validation | Runtime type checking |
| React Hook Form | 7.52.1 | Form state | Minimal re-renders |
| Sentry | 7.112.2 | Error tracking | Production monitoring |

### Why Not Other Options?

**Redux vs TanStack Query:**
- Redux is great for client state
- TanStack Query handles server state (what we have 90% of the time)
- Combination: TanStack Query + React Context (minimal local state)

**GraphQL vs REST:**
- Supabase doesn't have GraphQL
- REST with TanStack Query is sufficient
- If GraphQL needed: migrate to Apollo Client

**Material-UI vs Tailwind:**
- Tailwind provides more control
- Smaller bundle size
- Framer Motion handles animations (not Material animations)

---

## Core Patterns & Standards

### Authentication & Authorization

#### 1. **Auth Flow (Industry Standard)**

```typescript
// src/contexts/AuthContext.tsx - SINGLE SOURCE OF AUTH TRUTH
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Step 1: Manage session state manually (Supabase auth is real-time)
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const queryClient = useQueryClient();

  // Step 2: Initialize auth on mount
  useEffect(() => {
    let mounted = true;
    
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted) {
        setSession(session);
        setUser(session?.user ?? null);
      }
    };

    initSession();

    // Step 3: Listen to auth changes FOREVER
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (mounted) {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          
          // 🔑 CRITICAL: Clear cache on logout
          if (!newSession) {
            queryClient.clear();
          }
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  // Step 4: Fetch user profile with React Query (not useState!)
  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Step 5: Derive auth state from data
  const value: AuthContextType = {
    user,
    session,
    role: profile?.role ?? null,
    permissions: profile?.permissions ?? null,
    isLoading: authLoading || (!!user && isProfileLoading),
    signOut: async () => {
      await supabase.auth.signOut();
      queryClient.clear();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
```

**Key Points:**
- Auth state is **reactive** (Supabase listeners)
- Profile is **cached** (TanStack Query)
- Cache is **cleared on logout**
- `mounted` flag prevents memory leaks

#### 2. **Row-Level Security (RLS) - Database-Level Auth**

```sql
-- database/schema.sql
-- CRITICAL: Protect all tables with RLS

-- Example: Users can only see their own orders
CREATE POLICY "orders_user_select" ON public.orders 
FOR SELECT USING (
    auth.uid() = created_by 
    OR has_role('ADMIN')
);

-- Admins can do anything
CREATE POLICY "orders_admin_all" ON public.orders
FOR ALL USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'ADMIN'
);
```

**Never trust the frontend for authorization:**
```typescript
// ❌ DON'T DO THIS - Backend will reject it anyway
if (userRole === 'ADMIN') {
  // Delete user
}

// ✅ DO THIS - Database enforces it
const { error } = await supabase
  .from('users')
  .delete()
  .eq('id', userId);
if (error?.code === 'PGRST120') {
  // Handle permission denied
}
```

#### 3. **Permission Checking**

```typescript
// src/hooks/usePermission.ts
export const usePermission = (permission: string): boolean => {
  const { permissions, role } = useAuth();
  
  // Admins have all permissions
  if (role === 'ADMIN') return true;
  
  // Check specific permission
  return permissions?.[permission] ?? false;
};

// Usage
const canDeleteOrder = usePermission('orders_delete');

if (!canDeleteOrder) {
  return <div>You don't have permission</div>;
}
```

---

### Data Fetching & Caching

#### 1. **React Query Setup**

```typescript
// src/services/queryClient.ts - ISOLATED, INJECTABLE
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000,           // 10 minutes
      gcTime: 30 * 60 * 1000,              // Previously cacheTime
      retry: (failureCount) => failureCount < 2,
      retryDelay: (attemptIndex) => 
        Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
      refetchOnWindowFocus: false,          // Don't refetch on tab switch
      refetchOnReconnect: true,             // DO refetch when back online
      refetchOnMount: false,                // Don't refetch on mount
    },
    mutations: {
      retry: (failureCount) => failureCount < 2,
    },
  },
});
```

**Why these settings?**
- `staleTime`: Data is fresh for 10 min (reduces unnecessary requests)
- `gcTime`: Keep data in memory for 30 min (instant navigation)
- `retry: 2`: Transient failures are retried
- `refetchOnWindowFocus: false`: Don't surprise users when they tab back
- `refetchOnReconnect: true`: CRITICAL for offline support

#### 2. **Query Key Factory Pattern**

```typescript
// src/constants/queryKeys.ts - SINGLE SOURCE OF TRUTH FOR KEYS
export const queryKeys = {
  orders: {
    all: () => ['orders'] as const,
    list: (filters: string) => [...queryKeys.orders.all(), 'list', { filters }],
    single: (id: number) => [...queryKeys.orders.all(), 'single', id],
    history: (id: number) => [...queryKeys.orders.all(), 'history', id],
  },
  attendance: {
    all: () => ['attendance'] as const,
    today: (userId?: string) => [...queryKeys.attendance.all(), 'today', { userId }],
  },
};
```

**Benefits:**
- Reusable keys (no typos)
- Hierarchical structure
- Easy to invalidate groups

#### 3. **Fetching Data (The Right Way)**

```typescript
// ❌ ANTI-PATTERN: Using useState for server state
const MyComponent = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    setLoading(true);
    fetch('/api/orders')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);
  
  return loading ? 'Loading...' : JSON.stringify(data);
};
```

**Problems:**
- Manual caching
- Manual loading states
- Manual refetching
- Manual error handling
- No deduplication
- Race conditions

```typescript
// ✅ PATTERN: Using React Query
const MyComponent = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.orders.all(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*');
      if (error) throw error;
      return data;
    },
  });
  
  if (isLoading) return 'Loading...';
  if (error) return `Error: ${error.message}`;
  return <pre>{JSON.stringify(data)}</pre>;
};
```

**Benefits:**
- ✅ Automatic caching
- ✅ Automatic refetching
- ✅ Built-in error handling
- ✅ Request deduplication
- ✅ Offline support
- ✅ Optimistic updates

#### 4. **Mutations (Creating/Updating)**

```typescript
// ✅ PATTERN: useMutation with cache invalidation
const useCreateOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (orderData: CreateOrderInput) => {
      const { data, error } = await supabase
        .from('orders')
        .insert(orderData)
        .select();
      if (error) throw error;
      return data[0];
    },
    onSuccess: (newOrder) => {
      // Automatically update cache
      queryClient.setQueryData(
        queryKeys.orders.single(newOrder.id),
        newOrder
      );
      
      // Refetch list
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.list()
      });
      
      // Show success message
      toast.success('Order created');
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });
};

// Usage
const { mutate: createOrder, isPending } = useCreateOrder();

<button onClick={() => createOrder(formData)} disabled={isPending}>
  Create Order
</button>
```

#### 5. **Handling Real-Time Updates**

```typescript
// src/hooks/useRealtimeOrders.ts
export const useRealtimeOrders = () => {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    // Subscribe to changes
    const channel = supabase
      .channel('public:orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          // Update cache when server data changes
          queryClient.invalidateQueries({
            queryKey: queryKeys.orders.all()
          });
        }
      )
      .subscribe();
    
    return () => {
      channel.unsubscribe();
    };
  }, [queryClient]);
};
```

---

### Component Architecture

#### 1. **Component Hierarchy**

```typescript
// ✅ Proper Component Organization

// Level 1: Page components (full routes)
export default function OrdersPage() {
  const { data: orders } = useQuery({...});
  
  return (
    <div>
      <OrdersHeader />
      <OrdersTable orders={orders} />
    </div>
  );
}

// Level 2: Feature components (logical sections)
function OrdersTable({ orders }: { orders: Order[] }) {
  return (
    <table>
      <tbody>
        {orders.map(order => (
          <OrderRow key={order.id} order={order} />
        ))}
      </tbody>
    </table>
  );
}

// Level 3: UI components (reusable, dumb)
function OrderRow({ order }: { order: Order }) {
  return (
    <tr>
      <td>{order.orderNumber}</td>
      <td>{order.customerName}</td>
    </tr>
  );
}
```

**Rules:**
- Pages: route-level, fetch data, orchestrate
- Features: logical sections, use props & hooks
- UI: pure, no side effects, full props

#### 2. **Props vs State**

```typescript
// ❌ ANTI-PATTERN: Unnecessary state
function UserCard({ user }: { user: User }) {
  const [displayName, setDisplayName] = useState(user.name);
  
  return <div>{displayName}</div>;
}

// ✅ PATTERN: Direct props
function UserCard({ user }: { user: User }) {
  return <div>{user.name}</div>;
}

// ✅ PATTERN: Local state for UI interactions
function UserCard({ user }: { user: User }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div>
      <h2>{user.name}</h2>
      {isExpanded && <UserDetails user={user} />}
      <button onClick={() => setIsExpanded(!isExpanded)}>
        {isExpanded ? 'Collapse' : 'Expand'}
      </button>
    </div>
  );
}
```

#### 3. **Error Boundaries**

```typescript
// src/components/ErrorBoundary.tsx
const ErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, info) => {
        logger.error('Boundary caught error', error);
        captureException(error, { componentStack: info.componentStack });
      }}
      onReset={() => window.location.href = '/'}
    >
      {children}
    </ReactErrorBoundary>
  );
};

// Wrap routes
<ErrorBoundary>
  <Routes>
    <Route path="/" element={<Dashboard />} />
  </Routes>
</ErrorBoundary>
```

---

### Custom Hooks

#### 1. **Hook Naming Convention**

```typescript
// ✅ PATTERN: Named as `use[Feature]`
export const useClockInOut = () => {
  // Business logic here
};

export const useOrderHistory = () => {
  // Business logic here
};

export const useDebounce = (value: string, delay: number) => {
  // Utility hook
};
```

#### 2. **Hook Structure Template**

```typescript
/**
 * useMyFeature - Handles XYZ functionality
 * 
 * @example
 * const { data, loading, error, action } = useMyFeature();
 */
export const useMyFeature = (param: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // 1. Fetch query data
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.myFeature.all(),
    queryFn: async () => {
      // Data fetching
    },
    enabled: !!user, // Only run if user exists
  });

  // 2. Mutation for updates
  const { mutate, isPending } = useMutation({
    mutationFn: async (newData) => {
      // Update logic
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.myFeature.all()
      });
    },
  });

  // 3. Return clean interface
  return {
    data,
    isLoading,
    isPending,
    update: mutate,
  };
};
```

#### 3. **Common Hooks in This Project**

| Hook | Purpose | Usage |
|------|---------|-------|
| `useAuth()` | Get user, role, permissions | On every protected page |
| `useClockInOut()` | Clock in/out operations | ClockInOutPage |
| `useQueryPrefetch()` | Prefetch data for performance | Dashboard |
| `useRealtimeOrders()` | Real-time order updates | Order-related pages |
| `useToast()` | Show notifications | Mutations success/error |
| `useDebounce()` | Debounce input values | Search, filters |
| `useLocalStorage()` | Persist to localStorage | Form drafts |

---

### State Management

#### 1. **State Hierarchy**

```
Global State (React Context)
├── Auth (user, permissions, role)
├── Settings (logo, company info)
└── Toast notifications

Query Cache (TanStack Query)
├── Orders
├── Users
├── Attendance
└── Dashboard metrics

Component State (useState)
├── Modal open/close
├── Form input values (while editing)
├── UI toggles (expand/collapse)
└── Hover states
```

**Rule:** Use the minimal scope needed
- Global: Auth, Settings, Toast
- Query Cache: All server data
- Component: UI interactions

#### 2. **Context vs Query Cache**

```typescript
// ❌ ANTI-PATTERN: Orders in Context
const [orders, setOrders] = useState([]);
useEffect(() => {
  fetchOrders().then(setOrders);
}, []);
<OrdersContext.Provider value={{ orders }}>

// ✅ PATTERN: Orders in Query Cache
const { data: orders } = useQuery({
  queryKey: queryKeys.orders.all(),
  queryFn: fetchOrders,
});
<QueryClientProvider client={queryClient}>
```

**Why?**
- Query Cache handles caching automatically
- Query Cache deduplicates requests
- Query Cache manages staleness
- Context is for truly global state (auth)

---

### Error Handling

#### 1. **Error Boundaries (Render Errors)**

```typescript
// Catches React component errors
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

#### 2. **Query Error Handling (Data Errors)**

```typescript
const { data, error, isError } = useQuery({
  queryKey: ['orders'],
  queryFn: async () => {
    const { data, error } = await supabase.from('orders').select();
    if (error) throw error; // ← Throw to React Query
    return data;
  },
});

if (isError) {
  return <div>Error: {error?.message}</div>;
}
```

#### 3. **Mutation Error Handling**

```typescript
const { mutate } = useMutation({
  mutationFn: updateOrder,
  onError: (error: Error) => {
    if (error.message.includes('permission')) {
      toast.error('You don\'t have permission');
    } else {
      toast.error('Failed to update');
      logger.error('Update failed', error);
    }
  },
});
```

#### 4. **Global Error Tracking (Sentry)**

```typescript
// src/services/sentryLoader.ts
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 1.0,
});

// Auto-captured:
// - Unhandled errors
// - Unhandled promise rejections
// - Console errors

// Manual capture:
Sentry.captureException(error, { tags: { component: 'OrderForm' } });
```

#### 5. **Logging Strategy**

```typescript
// src/services/logger.ts
export const logger = {
  error: (message: string, error?: Error, context?: object) => {
    console.error(`[ERROR] ${message}`, error, context);
    Sentry.captureException(error, { extra: context });
  },
  
  warn: (message: string, context?: object) => {
    console.warn(`[WARN] ${message}`, context);
  },
  
  info: (message: string, context?: object) => {
    console.log(`[INFO] ${message}`, context);
  },
};

// Usage
try {
  await updateOrder(orderId, data);
} catch (error) {
  logger.error('Failed to update order', error, { orderId });
}
```

---

## Database Design

### Schema Philosophy

#### 1. **Separate Storage & Permission Concerns**

```sql
-- Good: Table + RLS policy
CREATE TABLE orders (id, customer_name, sales_agent, ...);

-- Bad: Storing who can see it IN THE TABLE
CREATE TABLE orders (
  id,
  customer_name,
  allowed_viewers TEXT[], -- ❌ Don't do this
);
```

#### 2. **Denormalization for Performance**

```sql
-- ANTI-PATTERN: Every query needs 3 joins
SELECT o.*, u.full_name, a.amount 
FROM orders o
JOIN user_profiles u ON o.created_by = u.id
JOIN financial_records a ON o.id = a.order_id;

-- PATTERN: Denormalize read-heavy data
CREATE TABLE orders (
  id,
  created_by_name TEXT, -- Denormalized
  created_by_email TEXT, -- Denormalized
  total_amount DECIMAL, -- Denormalized
);

-- But update carefully with triggers!
CREATE TRIGGER update_order_denorm
AFTER UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION denormalize_user_data();
```

#### 3. **Audit Trails**

```sql
-- Track all changes
CREATE TABLE order_history (
  id BIGINT,
  order_id BIGINT,
  user_email TEXT,
  field_changed TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ DEFAULT now()
);

-- Triggered automatically
CREATE TRIGGER log_order_changes
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION log_order_changes();
```

#### 4. **Current Schema Overview**

**Core Tables:**
- `user_profiles` - User roles & permissions
- `orders` - Main business entity
- `order_history` - Audit trail
- `order_communications` - Email log
- `attendance_sessions` - Clock in/out records
- `attendance_summary` - Monthly summaries
- `settings` - Global configuration

**Design Highlights:**
- ✅ RLS on all tables
- ✅ Audit trails on orders
- ✅ Timestamps with timezone
- ✅ Proper indexes for queries
- ✅ Soft deletes via status field
- ✅ Generated columns (profit = amount - costs)

---

## Performance Optimization

### 1. **Code Splitting (Lazy Loading)**

```typescript
// src/App.tsx
const AllOrdersPage = lazy(() => import('@/pages/AllOrdersPage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));

<Suspense fallback={<LoadingScreen />}>
  <Routes>
    <Route path="/orders" element={<AllOrdersPage />} />
    <Route path="/reports" element={<ReportsPage />} />
  </Routes>
</Suspense>
```

**Result:** Initial bundle smaller, lazy routes load on demand

### 2. **Query Prefetching**

```typescript
// Prefetch before user navigates
const handleNavigateToReports = () => {
  queryClient.prefetchQuery({
    queryKey: queryKeys.orders.all(),
    queryFn: fetchOrders,
  });
  navigate('/reports');
};
```

**Result:** Report page loads instantly

### 3. **Memoization**

```typescript
// ❌ ANTI-PATTERN: Recalculates on every render
function OrdersList({ orders }) {
  const totalAmount = orders.reduce((sum, o) => sum + o.amount, 0);
  return <div>{totalAmount}</div>;
}

// ✅ PATTERN: Memoizes
function OrdersList({ orders }) {
  const totalAmount = useMemo(
    () => orders.reduce((sum, o) => sum + o.amount, 0),
    [orders]
  );
  return <div>{totalAmount}</div>;
}
```

### 4. **Component Memoization**

```typescript
// ❌ ANTI-PATTERN: Rerenders when parent rerenders
function OrderRow({ order }) {
  return <tr><td>{order.name}</td></tr>;
}

// ✅ PATTERN: Only rerenders if order changes
const OrderRow = memo(({ order }: { order: Order }) => {
  return <tr><td>{order.name}</td></tr>;
});
```

### 5. **Bundle Analysis**

```bash
# Check bundle size
npm run build

# Output: dist/assets/vendor-HASH.js (~450KB)
# Output: dist/assets/main-HASH.js (~120KB)
# Total: ~570KB gzipped
```

### 6. **Core Web Vitals Targets**

| Metric | Target | Current |
|--------|--------|---------|
| LCP (Largest Contentful Paint) | < 2.5s | Monitor |
| FID (First Input Delay) | < 100ms | Monitor |
| CLS (Cumulative Layout Shift) | < 0.1 | Monitor |

**Monitoring:** Use Vercel Speed Insights (already integrated)

---

## Security Best Practices

### 1. **Environment Variables**

```bash
# .env.example
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxxxx

# NEVER commit .env to git!
# NEVER log these values
```

```typescript
// ❌ ANTI-PATTERN
console.log(import.meta.env.VITE_SUPABASE_ANON_KEY);

// ✅ PATTERN
if (!import.meta.env.VITE_SUPABASE_URL) {
  throw new Error('VITE_SUPABASE_URL is required');
}
```

### 2. **Row-Level Security (RLS)**

```sql
-- CRITICAL: Always use RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Only show user's own orders (unless admin)
CREATE POLICY "user_select_own" ON orders
FOR SELECT USING (
  auth.uid() = created_by
  OR (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'ADMIN'
);
```

### 3. **Password Security**

```typescript
// Use Supabase Auth (handles hashing, salting)
const { data, error } = await supabase.auth.signUp({
  email: email,
  password: password, // Supabase handles hashing
});

// ❌ NEVER hash on frontend
// Passwords must be sent only over HTTPS
```

### 4. **Input Validation**

```typescript
// ✅ Validate on frontend for UX
import { z } from 'zod';

const orderSchema = z.object({
  customerName: z.string().min(2, 'Name too short'),
  amount: z.number().min(0, 'Amount must be positive'),
  email: z.string().email(),
});

// ❌ NEVER trust frontend validation alone!
// Database RLS will enforce constraints
```

### 5. **CSRF Protection**

```typescript
// Supabase handles CSRF automatically
// All requests include auth tokens
// Credentials sent over HTTPS only
```

### 6. **Sensitive Data**

```typescript
// ❌ ANTI-PATTERN
localStorage.setItem('userPassword', password);
console.log('Payment:', creditCard);

// ✅ PATTERN
// Passwords: Never store, only in sessionStorage temporarily
// Payment: Never store, use hosted payment forms
// Personal data: Use Supabase encryption at rest
```

---

## Testing Strategy

### Current State
- ✅ Test files created (tests/ directory)
- ⚠️  Some tests skipped (.skip files)
- ⚠️  Coverage: ~10%

### Testing Pyramid

```
           /\
          /  \  E2E Tests (Playwright)
         /    \ 5%
        /______\

         /    \
        /      \  Integration Tests
       /        \ 15%
      /   40%    \
     /____________\

    /              \
   /                \ Unit Tests
  /                  \ 45%
 /____________________\
```

### 1. **Unit Tests (Components & Hooks)**

```typescript
// src/tests/components.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('OrderForm', () => {
  it('submits form with valid data', async () => {
    const { getByRole } = render(<OrderForm onSubmit={vi.fn()} />);
    
    const input = getByRole('textbox', { name: /customer name/i });
    await userEvent.type(input, 'John Doe');
    
    const button = getByRole('button', { name: /create/i });
    await userEvent.click(button);
    
    expect(onSubmit).toHaveBeenCalledWith({
      customerName: 'John Doe',
    });
  });
});
```

### 2. **Integration Tests (Hooks with Supabase)**

```typescript
// src/tests/hooks.test.ts
describe('useClockInOut', () => {
  it('clocks in and records session', async () => {
    const { result } = renderHook(() => useClockInOut(), {
      wrapper: QueryClientProvider,
    });
    
    await act(async () => {
      await result.current.clockIn();
    });
    
    expect(result.current.isClockedIn).toBe(true);
  });
});
```

### 3. **E2E Tests (Full User Flows)**

```typescript
// tests/e2e/order-flow.spec.ts (Playwright)
test('User can create and edit order', async ({ page }) => {
  // 1. Login
  await page.goto('/login');
  await page.fill('input[name="email"]', 'user@example.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button:has-text("Login")');
  
  // 2. Create order
  await page.goto('/new-order');
  await page.fill('input[name="customerName"]', 'Test Customer');
  await page.click('button:has-text("Create")');
  
  // 3. Verify order appears in list
  await page.goto('/orders');
  expect(page.locator('text=Test Customer')).toBeVisible();
});
```

### Best Practices

- ✅ Test user behavior, not implementation
- ✅ Mock Supabase responses
- ✅ Use meaningful test descriptions
- ✅ Test happy path + error cases
- ✅ Don't test library code (React, Supabase)
- ❌ Don't test CSS
- ❌ Don't test external APIs

---

## Accessibility & UX (2025 Standard)

### 1. **Semantic HTML**

```typescript
// ❌ ANTI-PATTERN
<div onClick={() => deleteOrder()}>Delete</div>

// ✅ PATTERN
<button onClick={() => deleteOrder()}>Delete Order</button>

// ✅ PATTERN: With ARIA when needed
<button
  onClick={() => deleteOrder()}
  aria-label="Delete order #123"
>
  Delete
</button>
```

### 2. **Keyboard Navigation (Full Tab Support)**

```typescript
// ✅ Native elements work automatically
<button>Save</button> // ← Tab-accessible, Enter-activatable

// ✅ Table rows with keyboard support
<tr 
  className="focus-ring" 
  tabIndex={0}
  onKeyDown={(e) => {
    if (e.key === 'Enter') openEditModal(user);
  }}
>
  {/* Table cells */}
</tr>

// ✅ Custom components need help
<div
  role="button"
  tabIndex={0}
  className="focus-ring"
  onKeyDown={(e) => e.key === 'Enter' && handleClick()}
  onClick={handleClick}
>
  Custom Button
</div>
```

### 3. **Focus Ring System (Brand-Focused Accessibility)**

**Implementation:**
```css
/* src/index.css - Global focus ring utility */
.focus-ring {
  @apply focus:outline-none focus:ring-2 focus:ring-brand-orange/60 
         focus:ring-offset-2 focus:ring-offset-[#0B1120] transition-all duration-200;
}

/* Auto-applies to all form fields */
input:focus, 
select:focus, 
textarea:focus {
  @apply outline-none ring-1 ring-brand-orange border-brand-orange/50;
}
```

**Usage:**
```typescript
// Auto on all inputs
<input type="email" />  {/* Has .focus-ring automatically */}

// Manual on custom elements
<button className="px-4 py-2 bg-blue-600 focus-ring">
  Click Me
</button>

// Replaces browser's blue outline with brand orange
// Creates visual feedback for keyboard navigation
```

### 4. **Color Contrast**

```css
/* ✅ WCAG AA compliant */
color: #1a1a1a; /* Against white background: 14:1 ratio */

/* ✅ Focus ring uses brand-orange (#FB6E1D) */
/* 3:1 minimum for focus indicators (exceeds WCAG AA) */

/* ❌ WCAG AA non-compliant */
color: #888888; /* Against white background: 4.5:1 ratio */
```

**Tool:** Use Tailwind's built-in accessible colors

### 5. **Focus Management & Visual Feedback**

```typescript
// ✅ Tab navigation with visual indicators
// Browser shows orange focus ring on each element
// No need for custom ref management

// Focus rings automatically visible on:
// - Button clicks
// - Tab navigation
// - Keyboard interaction

// Visual feedback is brand-orange (#FB6E1D)
const modalRef = useRef<HTMLDivElement>(null);

// When modal opens, focus first interactive element
useEffect(() => {
  modalRef.current?.querySelector('button')?.focus();
  // ← Shows orange focus ring automatically
}, [isOpen]);

// When modal closes, return focus to trigger button
useEffect(() => {
  return () => {
    triggerButtonRef.current?.focus();
    // ← Shows orange focus ring on return
  };
}, []);
```

### 6. **Empty States (Professional Feedback)**

```typescript
// ✅ Show professional visual feedback, not blank UI
import EmptyState from '@/components/ui/EmptyState';

{!data || data.length === 0 ? (
  <EmptyState 
    title="No data found"
    description="Get started by creating your first item."
    action={
      <button 
        onClick={openCreateModal}
        className="flex items-center gap-2 focus-ring"
      >
        <Plus className="w-4 h-4" />
        Create Item
      </button>
    }
  />
) : (
  // Render table/list
)}
```

**Features:**
- Animated SVG illustration
- Clear title and description
- Optional call-to-action button
- Brand-orange accents
- Professional visual feedback

### 7. **Loading & Error States**

```typescript
// ✅ Always show loading state
if (isLoading) return <LoadingSpinner />;

// ✅ Always show error state
if (error) return <ErrorMessage message={error.message} />;

// ✅ Empty state (visual feedback)
if (!data?.length) return <EmptyState title="No data" description="..." />;

// ✅ Success feedback
toast.success("Operation completed"); // Via toast
```

### 8. **Accessibility Standards (A11y)**

**Button Accessibility Pattern** - UserManagementPage example:
```typescript
// ✅ Icon buttons with text labels (accessible)
<div className="flex items-center gap-2">
  <button 
    onClick={() => handleAction(user)}
    className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 focus-ring rounded"
  >
    <Edit className="w-4 h-4" /> Edit  // Icon + descriptive text
  </button>
  <button 
    onClick={() => handleDelete(user)}
    className="text-red-400 hover:text-red-300 flex items-center gap-1 focus-ring rounded"
  >
    <Trash2 className="w-4 h-4" /> Delete // Clear semantic meaning
  </button>
</div>

// ✅ Keyboard navigation
<tr 
  tabIndex={0}
  onKeyDown={(e) => {
    if (e.key === 'Enter') handleAction(user);
  }}
>
  {/* Row content */}
</tr>

// ✅ Modal dialogs with focus management
{modalOpen && (
  <ConfirmationModal
    isOpen={modalOpen}
    onClose={closeModal}
    onConfirm={handleConfirm}
    title="Confirm Action"
    message="Are you sure?"
  />
)}
```

**Key Principles:**
- Icon buttons must have text labels or aria-labels
- Interactive elements must be `<button>`, `<a>`, or have `tabIndex`
- Keyboard navigation (Enter, Space) must work
- Color shouldn't be the only indicator
- Contrast ratio ≥ 4.5:1 (WCAG AA standard)

### 9. **Component Design System**

#### SpotlightCard (The Primitive)
```typescript
// Universal container with spotlight effect
<SpotlightCard className="p-6">
  {/* Any content works here */}
</SpotlightCard>
```

**Features:**
- Mouse-tracking spotlight glow (500px radius)
- Opacity transitions on hover (300ms)
- Works with all content types
- Consistent across entire app

#### StatCard (Metrics)
```typescript
// Purpose-built for displaying metrics
<StatCard
  title="Revenue"
  value={12500}
  icon={<DollarSign />}
  prefix="$"
  trend={{ value: 15.5, isPositive: true }}
/>
```

**Features:**
- Automatic SpotlightCard wrapping
- Animated counter (0 → value in 1.5s)
- Trend indicator with colors (green/red)
- Icon with glow effect

---

## Common Patterns & UI Best Practices

### Modal & Dialog Management

**ConfirmationModal Pattern** (From UserManagementPage):
```typescript
// Centralized modal state management
const [modalMode, setModalMode] = useState<ModalMode>(null);
const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

// Modal open/close handlers
const openDeleteModal = (user: UserProfile) => {
  setSelectedUser(user);
  setModalMode('delete');
};

const closeAllModals = () => {
  setModalMode(null);
  setSelectedUser(null);
  // Reset all form states
  setNewUserEmail('');
  setNewUserName('');
  // ... reset all state
};

// Render modal
<ConfirmationModal
  isOpen={modalMode === 'delete'}
  onClose={closeAllModals}
  onConfirm={handleDeleteUser}
  title="Delete User"
  message={`Are you sure you want to delete ${selectedUser?.email}?`}
  isConfirming={deleteUserMutation.isPending}
/>
```

**Benefits:**
- Single modal state machine
- Prevents multiple modals open
- Clear close/confirm paths
- Proper cleanup on close

---

## Common Pitfalls & Anti-Patterns

### 1. **Circular Dependencies**

```typescript
// ❌ ANTI-PATTERN: Creates circular dependency
// main.tsx imports App.tsx
// App.tsx imports hook
// hook imports queryClient from main.tsx → CIRCLE!

// ✅ SOLUTION: Isolate queryClient
// src/services/queryClient.ts (standalone)
export const queryClient = new QueryClient({...});

// main.tsx
import { queryClient } from './services/queryClient';

// hooks
import { queryClient } from '../services/queryClient';
```

### 2. **Missing Dependency Arrays**

```typescript
// ❌ ANTI-PATTERN: Runs on every render
useEffect(() => {
  fetchData();
});

// ✅ PATTERN: Runs once on mount
useEffect(() => {
  fetchData();
}, []);

// ✅ PATTERN: Runs when `id` changes
useEffect(() => {
  fetchData(id);
}, [id]);
```

### 3. **Fetching in useState Initializer**

```typescript
// ❌ ANTI-PATTERN: Fetches immediately
const [orders] = useState(() => {
  return fetchOrders(); // Blocks render!
});

// ✅ PATTERN: Use useQuery or useEffect
const { data: orders } = useQuery({...});
```

### 4. **Not Handling Unmounted Components**

```typescript
// ❌ ANTI-PATTERN: Memory leak warning
useEffect(() => {
  fetchData().then(setData); // setState after unmount!
}, []);

// ✅ PATTERN: Check mounted flag
useEffect(() => {
  let mounted = true;
  fetchData().then(data => {
    if (mounted) setData(data);
  });
  return () => {
    mounted = false;
  };
}, []);

// ✅ PATTERN: Let React Query handle it
const { data } = useQuery({...}); // Auto-cleanup
```

### 5. **Inline Objects in Dependencies**

```typescript
// ❌ ANTI-PATTERN: New object every render
const filters = { status: 'PENDING' };
const { data } = useQuery({
  queryKey: ['orders', filters], // New filters object = new query!
  queryFn: () => fetchOrders(filters),
});

// ✅ PATTERN: Memoize the object
const filters = useMemo(() => ({ status: 'PENDING' }), []);
const { data } = useQuery({
  queryKey: ['orders', filters],
  queryFn: () => fetchOrders(filters),
});

// ✅ PATTERN: Separate values
const { data } = useQuery({
  queryKey: ['orders', 'PENDING'],
  queryFn: () => fetchOrders({ status: 'PENDING' }),
});
```

### 6. **Props Spreading Without Control**

```typescript
// ❌ ANTI-PATTERN: Unknown props
<Button {...props} /> // What props?

// ✅ PATTERN: Explicit props
function Button({ label, onClick, disabled = false }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return <button onClick={onClick} disabled={disabled}>{label}</button>;
}
```

### 7. **Not Using Keys in Lists**

```typescript
// ❌ ANTI-PATTERN: Uses index as key
{orders.map((order, index) => (
  <OrderRow key={index} order={order} />
))}
// If list reorders: components keep old state!

// ✅ PATTERN: Unique stable ID
{orders.map((order) => (
  <OrderRow key={order.id} order={order} />
))}
```

### 8. **Over-fetching Data**

```typescript
// ❌ ANTI-PATTERN: Fetches all fields
const { data: user } = useQuery({
  queryFn: () => fetchUser(userId), // All fields
});

// ✅ PATTERN: Select only needed fields
const { data: user } = useQuery({
  queryFn: async () => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, full_name') // Only these
      .eq('id', userId)
      .single();
    return data;
  },
});
```

---

## Deployment & DevOps

### Deployment Flow (Vercel)

```
1. Push to main branch
   ↓
2. Vercel auto-builds
   - npm install
   - npm run build
   - Output: dist/
   ↓
3. Deploy to CDN
   - Instant propagation
   - Edge caching
   ↓
4. Auto-generated URL
   - HTTPS enabled
   - Custom domain support
```

### Environment Variables on Vercel

```bash
# Go to Vercel dashboard → Settings → Environment Variables

# Add these:
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# They're automatically available in build
```

### Pre-deployment Checklist

```typescript
// 1. ✅ TypeScript no errors
npm run build

// 2. ✅ Tests pass
npm test

// 3. ✅ No console errors
npm run dev

// 4. ✅ Bundle size okay
npm run build -- --analyze

// 5. ✅ .env.example updated
git add .env.example

// 6. ✅ No secrets in code
git log --all -S "sk_live_" --no-date --name-only
```

---

## Monitoring & Logging

### 1. **Error Tracking (Sentry)**

```typescript
// Already configured in src/services/sentryLoader.ts

// Auto-captured:
// - JavaScript errors
// - Promise rejections
// - React errors

// Manual capture:
Sentry.captureException(new Error('Critical issue'), {
  level: 'error',
  tags: { feature: 'orders' },
  extra: { orderId: 123 },
});
```

### 2. **Performance Monitoring**

```typescript
// src/services/performanceMonitor.ts
export const performanceMonitor = {
  start: (label: string) => {
    performance.mark(`${label}-start`);
  },
  
  end: (label: string, metric: string) => {
    performance.mark(`${label}-end`);
    performance.measure(label, `${label}-start`, `${label}-end`);
    const measure = performance.getEntriesByName(label)[0];
    console.log(`[${metric}] ${label}: ${measure?.duration}ms`);
  },
};

// Usage
performanceMonitor.start('fetch-orders');
const orders = await fetchOrders();
performanceMonitor.end('fetch-orders', 'api');
```

### 3. **Real-time Logs (Vercel Speed Insights)**

```typescript
// Already integrated via:
import { SpeedInsights } from '@vercel/speed-insights/react';

// Automatically tracks:
// - Page load time
// - Core Web Vitals
// - User interactions
```

### 4. **Application Logging**

```typescript
// src/services/logger.ts
logger.error('Order update failed', error, { orderId: 123 });
logger.warn('High memory usage detected', { mb: 450 });
logger.info('User logged in', { email: 'user@example.com' });
```

---

## Quick Reference: Starting a New Project

### 1. **Setup**
```bash
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install
```

### 2. **Install Core Dependencies**
```bash
npm install react-router-dom @tanstack/react-query @supabase/supabase-js zod react-hook-form
npm install -D typescript tailwindcss @types/react
```

### 3. **Project Structure**
Copy the folder structure from [Project Structure](#project-structure)

### 4. **Create Core Files**
```bash
# Services
touch src/services/queryClient.ts
touch src/services/supabaseClient.ts
touch src/services/logger.ts

# Contexts
touch src/contexts/AuthContext.tsx

# Types
touch src/types/index.ts

# Constants
touch src/constants/queryKeys.ts
```

### 5. **Environment Setup**
```bash
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
```

### 6. **First Query**
```typescript
const { data } = useQuery({
  queryKey: queryKeys.orders.all(),
  queryFn: async () => {
    const { data, error } = await supabase.from('orders').select();
    if (error) throw error;
    return data;
  },
});
```

---

## Appendix: Checklist for New Features

### Before Starting Development

- [ ] Design database schema (follow audit trail pattern)
- [ ] Add RLS policies to new tables
- [ ] Create types in src/types/index.ts
- [ ] Add query keys to constants/queryKeys.ts
- [ ] Write service functions in services/
- [ ] Create custom hook for the feature
- [ ] Build components (bottom-up)
- [ ] Write tests (unit + integration)
- [ ] Add to routes in App.tsx
- [ ] Test with role-based permissions
- [ ] Load test with large datasets
- [ ] Check accessibility (a11y)
- [ ] Mobile responsiveness test
- [ ] Error state testing
- [ ] Offline behavior testing

---

## Final Reminders

### ✅ DO's
- Use React Query for server state
- Use Context only for auth/theme
- Isolate services and dependencies
- Type everything (strict mode)
- Test error paths
- Log meaningful messages
- Cache aggressively
- Validate on both frontend and database
- Use RLS for authorization
- Memoize expensive computations

### ❌ DON'Ts
- Don't use useState for server data
- Don't mix concerns in components
- Don't create circular dependencies
- Don't log sensitive data
- Don't trust frontend validation alone
- Don't forget dependency arrays
- Don't fetch in render
- Don't hardcode API URLs
- Don't store passwords anywhere
- Don't ignore TypeScript errors

---

**Version History**
- v1.1 (Dec 13, 2025) - Added accessibility standards, modal patterns, UI improvements
- v1.0 (Dec 12, 2025) - Initial comprehensive guide

**Maintainer Notes**
This document should be updated when:
- New patterns are adopted
- Anti-patterns are discovered
- Dependencies are upgraded
- New team members add improvements

---

*End of Document*
