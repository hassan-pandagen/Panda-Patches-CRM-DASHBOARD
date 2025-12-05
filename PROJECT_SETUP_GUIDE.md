# Modern Project Setup Guide - Industry Standard Best Practices

A comprehensive guide to start your next project the RIGHT way from day one.

> **⭐ Updated with Performance Upgrades:** See [PERFORMANCE_UPGRADES_ROADMAP.md](./PERFORMANCE_UPGRADES_ROADMAP.md) for 9 incremental performance improvements and [PERFORMANCE_UPGRADE_PROGRESS.md](./PERFORMANCE_UPGRADE_PROGRESS.md) for implementation tracking.

---

## Quick Reference - Essential Setup

**For a new project, implement these 4 things from day 1:**

1. **Performance Monitoring:** Add Vercel Speed Insights (2 lines)
2. **React Query Configuration:** Proper staleTime, gcTime, retry strategy
3. **Code Splitting:** Lazy load non-critical routes with Suspense
4. **Error Boundaries:** Catch unhandled errors in UI

Details below in Performance Optimization section.

---

## Table of Contents
1. [Project Planning Phase](#project-planning-phase)
2. [Initial Setup](#initial-setup)
3. [Project Structure](#project-structure)
4. [Type Safety & TypeScript](#type-safety--typescript)
5. [Code Organization](#code-organization)
6. [State Management](#state-management)
7. [API & Data Handling](#api--data-handling)
8. [Testing Strategy](#testing-strategy)
9. [Performance Optimization](#performance-optimization)
10. [Security Best Practices](#security-best-practices)
11. [Git Workflow](#git-workflow)
12. [Documentation](#documentation)
13. [DO's and DON'Ts](#dos-and-donts)

---

## PROJECT PLANNING PHASE

### Before Writing Code (CRITICAL - Don't Skip This!)

#### 1. Define Project Scope
```
BEFORE coding, document:
- What problem does this solve?
- Who are the users?
- What are the core features? (list 3-5 MAX)
- What's out of scope?
```

**Why?** Scope creep kills projects. Clear boundaries = faster delivery.

#### 2. Create Technical Architecture Document
```
├── Frontend: React/Vue/Svelte + TypeScript
├── Backend: Node.js/Python/Go
├── Database: PostgreSQL/MongoDB
├── Authentication: JWT/OAuth
├── API: REST/GraphQL
└── Hosting: Vercel/AWS/DigitalOcean
```

**Why?** Decisions made early = no rewrites later.

#### 3. Design Database Schema
```sql
-- Example: User table
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  -- Add other fields...
);

-- Document relationships BEFORE building
```

**Why?** Bad schema = painful migrations later.

#### 4. Create Wireframes/Mockups
- Use Figma, Excalidraw, or Miro
- Don't code UI before designing it
- Share with team for feedback

**Why?** Prevents UI rework once coded.

---

## INITIAL SETUP

### Step 1: Choose the Right Boilerplate

**For React (Recommended):**
```bash
# Modern approach - Vite + React + TypeScript
npm create vite@latest my-app -- --template react-ts

# OR use a full-stack template
npm create next-app@latest my-app
```

**Why Vite over Create React App?**
- ✅ Faster (10x faster hot reload)
- ✅ Smaller bundle by default
- ✅ Better DX (developer experience)
- ❌ CRA is now legacy

### Step 2: Install Core Dependencies ONLY

```json
{
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@tanstack/react-query": "^5.0.0",
    "axios": "^1.6.0",
    "zustand": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/react": "^18.0.0",
    "@types/node": "^20.0.0",
    "vite": "^5.0.0",
    "tailwindcss": "^3.0.0"
  }
}
```

**Rules:**
- ❌ Don't install 50 packages on day 1
- ✅ Add packages only when needed
- ✅ Review package.json weekly for unused deps

### Step 3: Configure TypeScript Properly

**tsconfig.json (Strict Mode):**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "moduleResolution": "bundler",
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  }
}
```

**Why strict?** Catches bugs EARLY, not in production.

### Step 4: Set Up Path Aliases

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@/components/*": ["src/components/*"],
      "@/pages/*": ["src/pages/*"],
      "@/hooks/*": ["src/hooks/*"],
      "@/utils/*": ["src/utils/*"],
      "@/types/*": ["src/types/*"],
      "@/services/*": ["src/services/*"]
    }
  }
}
```

**Why?** 
- ❌ Bad: `import Button from '../../../components/Button'`
- ✅ Good: `import Button from '@/components/Button'`

---

## PROJECT STRUCTURE

### Optimal Folder Structure (Scale from Day 1)

```
src/
├── components/              # Reusable UI components
│   ├── common/             # Used everywhere (Button, Input, etc.)
│   ├── layout/             # Layout components (Navbar, Sidebar)
│   ├── forms/              # Form-specific components
│   └── index.ts            # Export all commonly used
│
├── pages/                  # Full page components (route-based)
│   ├── HomePage.tsx
│   ├── Dashboard.tsx
│   └── NotFoundPage.tsx
│
├── hooks/                  # Custom React hooks
│   ├── useAuth.ts          # Authentication logic
│   ├── useFetch.ts         # Data fetching
│   └── useLocalStorage.ts
│
├── services/               # API calls and external services
│   ├── api.ts             # API client setup
│   ├── authService.ts
│   ├── userService.ts
│   └── supabaseClient.ts
│
├── contexts/               # React Context (global state)
│   ├── AuthContext.tsx
│   └── ThemeContext.tsx
│
├── store/                  # Zustand stores (state management)
│   ├── authStore.ts
│   └── uiStore.ts
│
├── types/                  # TypeScript type definitions
│   ├── index.ts           # Export all types here
│   ├── api.ts
│   └── entities.ts
│
├── constants/              # Constants and enums
│   ├── queryKeys.ts       # React Query keys
│   ├── routes.ts          # App routes
│   └── config.ts
│
├── utils/                  # Helper functions
│   ├── formatters.ts      # Date, currency formatting
│   ├── validators.ts      # Form validation
│   └── helpers.ts
│
├── styles/                 # Global styles
│   ├── globals.css
│   └── variables.css
│
├── App.tsx                 # Root component
├── main.tsx                # Entry point
└── env.d.ts               # Environment variable types
```

**Why this structure?**
- ✅ Scales to 100+ files without confusion
- ✅ Clear separation of concerns
- ✅ Easy to find things
- ✅ Follows industry conventions

---

## TYPE SAFETY & TYPESCRIPT

### Rule #1: No `any` Type (EVER)

```typescript
// ❌ DON'T DO THIS
const data: any = fetchUser();

// ✅ DO THIS
const data: User = fetchUser();
```

### Rule #2: Create Comprehensive Type Definitions

**src/types/index.ts:**
```typescript
// User types
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  GUEST = 'GUEST'
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// Component Props types
export interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}
```

**Why?** 
- Prevents runtime errors
- Autocomplete everywhere
- Self-documenting code

### Rule #3: Type Component Props

```typescript
// ❌ BAD
const Button = (props) => {
  return <button>{props.label}</button>;
};

// ✅ GOOD
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

const Button: React.FC<ButtonProps> = ({ label, onClick, variant = 'primary' }) => {
  return <button onClick={onClick}>{label}</button>;
};
```

### Rule #4: Create API Response Types

```typescript
// Instead of:
const response = await fetch('/api/users');

// Do this:
const response = await fetch('/api/users');
const data: ApiResponse<User[]> = await response.json();
```

---

## CODE ORGANIZATION

### 1. Component Structure Best Practice

```typescript
// src/components/UserCard.tsx

import React from 'react';
import { User } from '@/types';
import { formatDate } from '@/utils/formatters';

// Define Props interface
interface UserCardProps {
  user: User;
  onDelete?: (id: string) => void;
}

// Component with proper typing
export const UserCard: React.FC<UserCardProps> = ({ user, onDelete }) => {
  return (
    <div className="card">
      <h3>{user.full_name}</h3>
      <p>{user.email}</p>
      <p>{formatDate(user.created_at)}</p>
      {onDelete && (
        <button onClick={() => onDelete(user.id)}>Delete</button>
      )}
    </div>
  );
};

export default UserCard;
```

### 2. Export Organization

```typescript
// ✅ GOOD: Clear exports
export { UserCard };
export { Button };
export { Input };

// ✅ ALSO GOOD: Index file for easier imports
// src/components/index.ts
export { UserCard } from './UserCard';
export { Button } from './Button';
export { Input } from './Input';

// Then import like:
// import { UserCard, Button, Input } from '@/components';
```

### 3. Naming Conventions

```typescript
// Components: PascalCase
✅ UserProfile.tsx
✅ OrderDetailModal.tsx
❌ userProfile.tsx

// Utilities/Hooks: camelCase
✅ formatDate.ts, useAuth.ts
❌ FormatDate.ts, UseAuth.ts

// Constants: UPPER_SNAKE_CASE
✅ MAX_RETRIES, DEFAULT_TIMEOUT
❌ maxRetries, defaultTimeout

// Booleans: Start with "is" or "has"
✅ isLoading, hasError, isAdmin
❌ loading, error, admin
```

### 4. Function Complexity Rule

```typescript
// ❌ TOO LONG - Hard to understand
function processUserData(user) {
  // 50+ lines of logic
  // Multiple responsibilities
  // Hard to test
}

// ✅ BREAK INTO SMALLER FUNCTIONS
function validateUser(user): boolean { /* ... */ }
function transformUser(user): FormattedUser { /* ... */ }
function saveUser(user): Promise<void> { /* ... */ }

// Then compose them:
async function processUserData(user) {
  if (!validateUser(user)) throw new Error('Invalid user');
  const formatted = transformUser(user);
  await saveUser(formatted);
}
```

**Rule:** If function > 20 lines, break it down.

---

## STATE MANAGEMENT

### When to Use What

```
User is logged in?        → Context (AuthContext)
Theme preference?         → Context or Zustand
Form data being edited?   → Component state (useState)
Server data (users list)? → React Query
UI state (modal open)?    → Component state or Zustand
```

### Proper Pattern: Zustand for Global State

```typescript
// src/store/authStore.ts
import { create } from 'zustand';
import { User } from '@/types';

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  login: async (email, password) => {
    const user = await authService.login(email, password);
    set({ user, isAuthenticated: true });
  },
  logout: () => {
    set({ user: null, isAuthenticated: false });
  },
}));

// Usage in component:
const { user, login } = useAuthStore();
```

### ❌ DON'T DO THIS (Redux in 2025)

```typescript
// Redux is overkill for most projects now
// It adds complexity without benefit
// Use Zustand instead (simpler, smaller, faster)
```

---

## API & DATA HANDLING

### Setup: Centralized API Client

```typescript
// src/services/api.ts
import axios from 'axios';
import { ApiResponse } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors globally
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // User logged out, clear storage
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

### Use React Query for Server Data

**Step 1: Configure QueryClient Properly**

```typescript
// src/App.tsx or src/main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ✅ PRODUCTION CONFIG: Not just defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,              // 5 minutes - keep data fresh
      gcTime: 10 * 60 * 1000,                // 10 minutes - hold in memory
      retry: (failureCount) => failureCount < 3,  // Retry failed requests
      retryDelay: (attemptIndex) => 
        Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
      refetchOnWindowFocus: 'stale',         // Only refetch if stale
      refetchOnReconnect: 'stale',           // Refetch if network restored
    },
    mutations: {
      retry: (failureCount) => failureCount < 2,
      retryDelay: (attemptIndex) => 
        Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Your app */}
    </QueryClientProvider>
  );
}
```

**Step 2: Use React Query in Components**

```typescript
// ✅ GOOD: Data fetching with React Query
function UserList() {
  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await apiClient.get<User[]>('/users');
      return response;
    },
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  
  return (
    <div>
      {users?.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
}
```

**Key Benefits:**
- ✅ Automatic deduplication (requests within staleTime are cached)
- ✅ Smart refetching (only when data is stale)
- ✅ Exponential backoff (prevents overwhelming server on failures)
- ✅ Better offline handling (data available when offline)
- ✅ -20% reduction in API calls compared to basic setup

### Error Handling Pattern

```typescript
interface ApiError {
  message: string;
  code: string;
  details?: Record<string, string>;
}

async function handleApiCall() {
  try {
    const data = await apiClient.get('/users');
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const apiError: ApiError = {
        message: error.response?.data?.message || 'Something went wrong',
        code: error.response?.status?.toString() || 'UNKNOWN',
      };
      throw apiError;
    }
    throw error;
  }
}
```

---

## TESTING STRATEGY

### Start with Unit Tests

```typescript
// src/utils/__tests__/formatters.test.ts
import { describe, it, expect } from 'vitest';
import { formatDate, formatCurrency } from '@/utils/formatters';

describe('Formatters', () => {
  it('should format date correctly', () => {
    const result = formatDate('2024-01-15');
    expect(result).toBe('Jan 15, 2024');
  });

  it('should format currency with 2 decimals', () => {
    const result = formatCurrency(1000);
    expect(result).toBe('$1,000.00');
  });
});
```

### Test Component Logic

```typescript
// src/components/__tests__/Button.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/Button';

describe('Button Component', () => {
  it('should call onClick when clicked', async () => {
    const handleClick = vi.fn();
    render(<Button label="Click me" onClick={handleClick} />);
    
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalled();
  });
});
```

### Setup: package.json Testing Config

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/user-event": "^14.0.0"
  }
}
```

**Testing Pyramid (Priority Order):**
```
        /\
       /  \   E2E Tests (10%)
      /    \  Selenium/Cypress
     /______\
      /    \
     /      \  Integration Tests (30%)
    /________\ API + UI together
     /      \
    /        \ Unit Tests (60%)
   /________\ Functions, components
```

---

## PERFORMANCE OPTIMIZATION

### 0. Performance Monitoring (Vercel Speed Insights) ⭐

**Setup: Enable Real User Monitoring**

```typescript
// src/main.tsx
import { SpeedInsights } from '@vercel/speed-insights/react';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    {/* ✅ Enable performance monitoring for production */}
    <SpeedInsights />
  </React.StrictMode>
);
```

**Installation:**
```bash
npm install @vercel/speed-insights
```

**What it does:**
- Monitors real user metrics: LCP (Largest Contentful Paint), FID (First Input Delay), CLS (Cumulative Layout Shift)
- Sends data to Vercel dashboard (if deployed to Vercel)
- Helps identify slow pages for real users
- FREE - no setup required after adding component

**Metrics to Monitor:**
- 🎯 LCP: < 2.5s (time to show main content)
- 🎯 FID: < 100ms (response to user click)
- 🎯 CLS: < 0.1 (page jumping/instability)
- 🎯 TTFB: < 600ms (time to first byte)

**View Results:**
- Deployed to Vercel? Check dashboard.vercel.com
- Production metrics updated automatically
- Set alerts for metric degradation

---

### 1. Code Splitting from Day 1

```typescript
// src/App.tsx
import { lazy, Suspense } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';

// Lazy load pages
const HomePage = lazy(() => import('@/pages/HomePage'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const AdminPanel = lazy(() => import('@/pages/AdminPanel'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </Suspense>
  );
}
```

### 2. Image Optimization

```typescript
// ❌ DON'T
<img src="huge-image.jpg" alt="User" width={50} height={50} />

// ✅ DO
<img 
  src="optimized.webp" 
  srcSet="small.webp 480w, medium.webp 1024w"
  alt="User" 
  width={50} 
  height={50}
  loading="lazy"
/>
```

### 3. Memoization When Needed

```typescript
// ✅ Use React.memo for expensive re-renders
interface UserListItemProps {
  user: User;
  onClick: (id: string) => void;
}

export const UserListItem = React.memo(
  ({ user, onClick }: UserListItemProps) => {
    return <div onClick={() => onClick(user.id)}>{user.name}</div>;
  },
  (prev, next) => prev.user.id === next.user.id
);
```

### 4. Query Key Constants

```typescript
// src/constants/queryKeys.ts
export const queryKeys = {
  users: {
    all: () => ['users'],
    byId: (id: string) => ['users', id],
    search: (query: string) => ['users', 'search', query],
  },
  orders: {
    all: () => ['orders'],
    byId: (id: string) => ['orders', id],
  },
};

// Usage:
useQuery({
  queryKey: queryKeys.users.byId('123'),
  queryFn: () => fetchUser('123'),
});
```

---

## SECURITY BEST PRACTICES

### 1. Environment Variables

```typescript
// .env.local (NEVER commit this)
VITE_API_URL=https://api.example.com
VITE_PUBLIC_KEY=pk_123  // Public safe to expose

// src/config.ts
export const config = {
  apiUrl: import.meta.env.VITE_API_URL,
  publicKey: import.meta.env.VITE_PUBLIC_KEY,
} as const;

// ❌ DON'T
const token = 'sk_secret_key'; // Never hardcode secrets!

// ✅ DO
// Secrets only on backend/env variables
```

### 2. Authentication Pattern

```typescript
// src/contexts/AuthContext.tsx
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (credentials) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Verify token on mount
    verifyToken();
  }, []);

  const login = async (email: string, password: string) => {
    const { token, user } = await authService.login(email, password);
    localStorage.setItem('auth_token', token); // Store securely
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
```

### 3. Protected Routes

```typescript
// src/ProtectedRoute.tsx
function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <Outlet />;
}

// Usage in router:
<Route element={<ProtectedRoute />}>
  <Route path="/dashboard" element={<Dashboard />} />
</Route>
```

### 4. Input Validation

```typescript
// ✅ Validate all user input
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Min 8 characters'),
});

function LoginForm() {
  const { handleSubmit } = useForm({
    resolver: zodResolver(loginSchema),
  });

  return <form onSubmit={handleSubmit(onSubmit)}>...</form>;
}
```

### 5. XSS Prevention

```typescript
// ❌ DON'T - Vulnerable to XSS
<div dangerHTML={userContent} />

// ✅ DO - Safe
<div>{userContent}</div>

// If HTML needed, sanitize:
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
```

---

## GIT WORKFLOW

### Commit Convention

```
feat: Add user authentication
fix: Resolve login button click issue
docs: Update README
style: Format code with prettier
refactor: Simplify user service
perf: Optimize query performance
test: Add unit tests for formatter
chore: Update dependencies
```

### Branch Strategy

```
main              → Production ready
├── develop       → Staging
├── feature/auth  → Working feature
├── feature/dashboard
└── hotfix/bug-123
```

### Good Commit Message

```bash
# ❌ DON'T
git commit -m "fixes"
git commit -m "updates"

# ✅ DO
git commit -m "feat: Add password reset functionality"
git commit -m "fix: Resolve race condition in clock in/out"
git commit -m "docs: Add API authentication guide"
```

### .gitignore Setup

```
# .gitignore
node_modules/
dist/
build/
.env.local
.env.*.local
.vscode/
.idea/
*.log
.DS_Store
```

---

## DOCUMENTATION

### 1. README.md Structure

```markdown
# Project Name

## Quick Start
```bash
npm install
npm run dev
```

## Project Structure
- `/src` - Source code
- `/tests` - Test files

## Environment Setup
```bash
cp .env.example .env.local
# Edit .env.local with your values
```

## API Documentation
See [API_DOCS.md](./API_DOCS.md)

## Contributing
See [CONTRIBUTING.md](./CONTRIBUTING.md)
```

### 2. Component Documentation

```typescript
/**
 * Reusable button component with multiple variants
 * 
 * @example
 * <Button label="Submit" onClick={handleSubmit} variant="primary" />
 * 
 * @param {ButtonProps} props - Button configuration
 * @returns {React.ReactElement} Rendered button element
 */
export const Button: React.FC<ButtonProps> = (props) => {
  // implementation
};
```

### 3. Architecture Document

```
## Architecture Overview

### Frontend
- React 18 + TypeScript
- Vite for bundling
- Tailwind for styling
- Zustand for state

### API
- REST endpoints
- Axios client with interceptors
- React Query for server state

### Database
- PostgreSQL
- Supabase for auth

### Deployment
- Vercel for frontend
- Supabase for backend
```

---

## DO's AND DON'Ts

### ✅ DO's

```typescript
// 1. Use TypeScript strict mode
// 2. Create types BEFORE building components
// 3. Use React Query for server data
// 4. Keep components small (<200 lines)
// 5. Use path aliases (@/components)
// 6. Document complex functions
// 7. Test utility functions
// 8. Use environment variables for config
// 9. Commit frequently with clear messages
// 10. Review code before merging
// 11. Use loading states
// 12. Handle errors explicitly
// 13. Validate user input
// 14. Use lazy loading for routes
// 15. Monitor bundle size
```

### ❌ DON'Ts

```typescript
// 1. DON'T use `any` type
const data: any = response; // ❌ WRONG

// 2. DON'T prop drill deeply
// Instead use Context or Zustand

// 3. DON'T make components do too much
// Split into smaller components

// 4. DON'T use fetch() without error handling
// Use axios or fetch wrapper

// 5. DON'T hardcode API URLs
// Use environment variables

// 6. DON'T commit .env files
// Add to .gitignore

// 7. DON'T skip TypeScript checks
// Enable strict mode always

// 8. DON'T test everything
// Focus on critical paths

// 9. DON'T ignore TypeScript errors
// Fix them before deploying

// 10. DON'T use Redux for simple state
// Use Zustand instead

// 11. DON'T make API calls in useEffect without cleanup
useEffect(() => {
  // ❌ Can cause race conditions
  fetchData();
}, []);

// ✅ DO use React Query instead
useQuery({ queryKey, queryFn });

// 12. DON'T commit debugging code
// console.logs, debuggers, etc.

// 13. DON'T ignore accessibility
// Use semantic HTML, ARIA labels

// 14. DON'T make long functions
// Break into smaller pieces

// 15. DON'T ignore performance warnings
// Address them early
```

---

## DAY 1 CHECKLIST

```
Project: ____________________

□ Define project scope (document)
□ Create tech architecture decision
□ Design database schema
□ Initialize git repo
□ Setup Vite + React + TypeScript
□ Configure TypeScript (strict mode)
□ Setup path aliases
□ Create folder structure
□ Create core types (User, ApiResponse, etc.)
□ Setup API client (axios with interceptors)
□ Setup React Query
□ Create AuthContext
□ Setup environment variables
□ Create .gitignore
□ Create README.md
□ First commit: "chore: initial project setup"

Status: All ready? ✅
```

---

## SCALING CHECKLIST (When Project Grows)

```
□ Add testing setup (Vitest)
□ Add E2E testing (Playwright)
□ Setup CI/CD (GitHub Actions)
□ Add monitoring (Sentry)
□ Add analytics (PostHog)
□ Code splitting for lazy loading
□ Database migrations setup
□ API documentation (Swagger)
□ Performance monitoring
□ Error tracking
□ Logging system
```

---

## TECH STACK RECOMMENDATION FOR YOUR USE CASE

### Since you built a CRM Dashboard:

```
✅ KEEP DOING
├── React + TypeScript (core)
├── Vite (bundler)
├── Tailwind (styling) - ✅ Good choice
├── React Query (server data) - ✅ Essential
├── Supabase (backend) - ✅ Works well
└── Zustand (state) - ✅ Lightweight

⚡ CONSIDER ADDING
├── Zod (input validation)
├── React Hook Form (forms)
├── Framer Motion (animations) - ✅ You already use
├── Vitest (testing)
└── Sentry (error tracking)

❌ DON'T USE
├── Redux (too complex)
├── GraphQL (not needed yet)
├── MobX (overkill)
└── jQuery (never)
```

---

## FINAL WISDOM

**The biggest mistake you made in Panda Patches CRM was:**
1. Not defining types early ❌
2. Hardcoding query keys ❌
3. Fetching same data multiple times ❌
4. Not consolidating modal states ❌
5. Plaintext password display ❌

**What you did RIGHT:**
1. Used React + TypeScript ✅
2. Used Tailwind for styling ✅
3. Used React Query ✅
4. Used Supabase ✅
5. Structured components properly ✅

**For next project:**
- Start with types first
- Centralize constants
- Plan before coding
- Test early
- Security from day 1

---

## Quick Reference Commands

```bash
# New project
npm create vite@latest my-app -- --template react-ts
cd my-app

# Install essentials
npm install axios @tanstack/react-query zustand
npm install -D typescript @types/react tailwindcss

# Development
npm run dev

# Build
npm run build

# Testing
npm run test

# Type checking
npx tsc --noEmit
```

---

**Good luck with your next project! 🚀**

Remember: **Start small, build right, scale later.**
