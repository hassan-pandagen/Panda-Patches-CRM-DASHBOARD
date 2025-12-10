# React Import Standard

## Overview
All React imports across this project must use a single, unified import pattern to prevent "Cannot read properties of null (reading 'useState')" errors caused by multiple React instances.

## Standard Pattern

### ✅ CORRECT
```typescript
import * as React from 'react';

const MyComponent: React.FC = () => {
  const [state, setState] = React.useState(null);
  
  React.useEffect(() => {
    // effect
  }, []);
  
  const memoValue = React.useMemo(() => {}, []);
  
  return <div>{state}</div>;
};
```

### ❌ INCORRECT
```typescript
// OLD PATTERN 1: Default + Named
import React, { useState, useEffect } from 'react';

// OLD PATTERN 2: Only Named
import { useState, useEffect } from 'react';

// OLD PATTERN 3: Default Only
import React from 'react';
```

## Hook Usage Rules

After changing imports, update all hook calls:

| Old Code | New Code |
|----------|----------|
| `useState(value)` | `React.useState(value)` |
| `useEffect(() => {}, [])` | `React.useEffect(() => {}, [])` |
| `useCallback(fn, [])` | `React.useCallback(fn, [])` |
| `useMemo(() => {}, [])` | `React.useMemo(() => {}, [])` |
| `useRef(null)` | `React.useRef(null)` |
| `useContext(MyContext)` | `React.useContext(MyContext)` |
| `createContext()` | `React.createContext()` |
| `lazy(() => import(...))` | `React.lazy(() => import(...))` |
| `Suspense` | `React.Suspense` |
| `memo(Component)` | `React.memo(Component)` |
| `forwardRef(Component)` | `React.forwardRef(Component)` |

## Component Type Annotation

Use React.FC for function components:
```typescript
const MyComponent: React.FC = () => {
  // component code
};

const MyComponentWithProps: React.FC<{ prop: string }> = ({ prop }) => {
  // component code
};
```

## Files Already Compliant
- ✅ src/main.tsx
- ✅ src/App.tsx
- ✅ src/contexts/AuthContext.tsx
- ✅ src/AdminRoute.tsx
- ✅ src/ProtectedRoute.tsx
- ✅ src/components/ErrorBoundary.tsx
- ✅ src/pages/SettingsPage.tsx
- ✅ src/pages/ClockInOutPage.tsx
- ✅ src/pages/EditOrderPage.tsx
- ✅ src/pages/NewOrderPage.tsx
- ✅ src/pages/OrderPage.tsx
- ✅ src/pages/PerformanceMetricsPage.tsx
- ✅ src/pages/ReportsPage.tsx

## Files Recently Updated
- [Date]: AllOrdersPage.tsx
- [Date]: CustomerHistoryPage.tsx
- [Date]: Dashboard.tsx
- [Date]: EmailTemplatesPage.tsx
- [Date]: LoginPage.tsx
- [Date]: NotFoundPage.tsx
- [Date]: RecentOrdersTable.tsx
- [Date]: SearchResultsPage.tsx

## Why This Pattern?

This pattern ensures:
1. **Single React Instance**: All code uses the same React namespace
2. **No Hook Conflicts**: Prevents issues with multiple React versions
3. **Type Safety**: React.FC and React.* calls are fully typed
4. **Consistency**: Uniform pattern across entire codebase
5. **Refactoring Safety**: Easy to find and update all React API calls

## Checking for Violations

Run this grep to find old patterns:
```bash
grep -r "import React[,\s]" src/ | grep -v "import \* as React"
grep -r "import {" src/ | grep "from 'react'" | grep -v "@/"
```

## Adding New Code

When creating new components, always use:
```typescript
import * as React from 'react';
```

And prefix all React hooks/APIs with `React.`
