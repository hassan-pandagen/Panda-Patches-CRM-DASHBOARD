# React Imports Reversion Guide

**Purpose:** Convert all 71 files from namespace imports back to standard industry-standard imports  
**Status:** Ready to execute  
**Duration:** ~20 minutes  
**Risk:** Low (clean install ensures rollback safety)

---

## Pre-Reversion Checklist

- [ ] Read `REACT_MIGRATION_DECISION_LOG.md` to understand context
- [ ] Commit current state to git (backup)
- [ ] Close dev server (`npm run dev`)
- [ ] Have admin/terminal access

---

## Step 1: Verify Current State

```bash
# Check React version
npm ls react
# Expected: react@18.3.1 only (should show deduped entries)

npm ls react-dom
# Expected: react-dom@18.3.1 only
```

---

## Step 2: Clean Install (Critical)

```bash
# Windows PowerShell (admin)
rmdir -r node_modules
rmdir -r .vite
del package-lock.json

# Then reinstall
npm install
```

**Why:** Ensures fresh state, removes any cached issues

---

## Step 3: Revert All Imports (Batch)

### Option A: Manual (if batch fails)

For each of the 71 files, apply these patterns:

#### Pattern 1: Import Statement
```typescript
// FIND:
import * as React from 'react';

// REPLACE WITH:
import React from 'react';
```

#### Pattern 2: useState calls
```typescript
// FIND:
const [state, setState] = React.useState(initial);

// REPLACE WITH:
const [state, setState] = useState(initial);
```

#### Pattern 3: useEffect calls
```typescript
// FIND:
React.useEffect(() => { /* ... */ }, [deps]);

// REPLACE WITH:
useEffect(() => { /* ... */ }, [deps]);
```

#### Pattern 4: useMemo calls
```typescript
// FIND:
const memoized = React.useMemo(() => { /* ... */ }, [deps]);

// REPLACE WITH:
const memoized = useMemo(() => { /* ... */ }, [deps]);
```

#### Pattern 5: useCallback calls
```typescript
// FIND:
const callback = React.useCallback(() => { /* ... */ }, [deps]);

// REPLACE WITH:
const callback = useCallback(() => { /* ... */ }, [deps]);
```

#### Pattern 6: useRef calls
```typescript
// FIND:
const ref = React.useRef(initial);

// REPLACE WITH:
const ref = useRef(initial);
```

#### Pattern 7: useContext calls
```typescript
// FIND:
const value = React.useContext(Context);

// REPLACE WITH:
const value = useContext(Context);
```

#### Pattern 8: Type annotations
```typescript
// FIND:
component: React.FC<Props>

// REPLACE WITH:
component: FC<Props>
// (add FC to import: import React, { FC, useState } from 'react')
```

---

### Option B: Automated (Using Find & Replace in VS Code)

**Find & Replace in VS Code:**

1. Press `Ctrl+H` (Find & Replace)
2. Enable Regex mode (click `.*` button)
3. Execute replacements in order:

#### Replace 1: Import statement
```
Find:    import \* as React from 'react';
Replace: import React from 'react';
```

#### Replace 2: useState
```
Find:    React\.useState\(
Replace: useState(
```

#### Replace 3: useEffect
```
Find:    React\.useEffect\(
Replace: useEffect(
```

#### Replace 4: useMemo
```
Find:    React\.useMemo\(
Replace: useMemo(
```

#### Replace 5: useCallback
```
Find:    React\.useCallback\(
Replace: useCallback(
```

#### Replace 6: useRef
```
Find:    React\.useRef\(
Replace: useRef(
```

#### Replace 7: useContext
```
Find:    React\.useContext\(
Replace: useContext(
```

---

## Step 4: Add Hook Imports

Each file now needs hook imports. Update the import line:

### Current (After Step 3):
```typescript
import React from 'react';
```

### Add hooks you use in that file:
```typescript
import React, { 
  useState, 
  useEffect, 
  useMemo, 
  useCallback, 
  useRef, 
  useContext,
  FC, // if used
} from 'react';
```

**Quick way:** Use VS Code search to find which hooks each file uses, then manually add.

---

## Step 5: TypeScript Compilation Check

```bash
# Run TypeScript check
npm run type-check

# Or just try building
npm run build
```

**Expected:** Zero errors

---

## Step 6: Full Build Test

```bash
npm run build
```

**Expected:**
- ✅ "✓ built in X.XXs"
- ✅ No errors
- ✅ Production bundle created

---

## Step 7: Dev Server Test

```bash
npm run dev
```

**Expected:**
- ✅ Server starts on http://localhost:5173
- ✅ No console errors
- ✅ All pages load
- ✅ Hooks work (state updates, effects run)

---

## Step 8: Verification Checklist

- [ ] Build passes: `npm run build`
- [ ] Dev server runs: `npm run dev`
- [ ] No TypeScript errors
- [ ] No "is not defined" errors in console
- [ ] Pages load and interact correctly
- [ ] useState/useEffect/useMemo work
- [ ] No React instance warnings

---

## Rollback Plan (If Issues)

If reversion causes problems:

```bash
# Revert from git
git checkout src/

# Or reinstall from backup
git reset --hard HEAD
npm install
npm run dev
```

---

## Files Affected (71 Total)

### Pages (15 files)
```
src/pages/Dashboard.tsx
src/pages/AllOrdersPage.tsx
src/pages/OrderPage.tsx
src/pages/NewOrderPage.tsx
src/pages/EditOrderPage.tsx
src/pages/CustomersPage.tsx
src/pages/CustomerHistoryPage.tsx
src/pages/ReportsPage.tsx
src/pages/SettingsPage.tsx
src/pages/UserManagementPage.tsx
src/pages/SearchResultsPage.tsx
src/pages/ClockInOutPage.tsx
src/pages/PerformanceMetricsPage.tsx
src/pages/ProfilePage.tsx
src/pages/LoginPage.tsx
```

### Contexts (1 file)
```
src/contexts/AuthContext.tsx
```

### Hooks (12 files)
```
src/hooks/useToast.tsx
src/hooks/useClockInOut.tsx
src/hooks/usePresence.tsx
src/hooks/useIsMobile.tsx
src/hooks/useMutation.tsx
+ 7 others
```

### Components (43 files)
```
src/components/dashboard/ (5)
src/components/ui/ (23)
src/components/layouts/ (5)
src/components/orders/ (6)
src/components/settings/ (1)
src/components/Reports/ (2)
src/components/invoices/ (2)
src/components/filters/ (1)
```

---

## Expected Time Breakdown

| Task | Time |
|------|------|
| Clean install | 3 min |
| Find & Replace (7 patterns) | 5 min |
| Add hook imports | 5 min |
| TypeScript check | 2 min |
| Build test | 3 min |
| Dev server test | 2 min |
| **Total** | **~20 min** |

---

## Success Criteria

✅ All checks pass:
- No "useState is not defined" errors
- No "useEffect is not defined" errors
- No import errors
- Build completes successfully
- Dev server runs without errors
- Pages load and function normally
- All interactive features work

---

## Support

If issues arise during reversion:

1. **Error: Hook is not defined**
   - Add that hook to the import statement
   - Example: `import React, { useState, useEffect } from 'react';`

2. **Error: FC is not defined**
   - Add FC to imports: `import React, { FC } from 'react';`

3. **Error: Build fails**
   - Run `npm install` again
   - Clear `.vite` cache folder
   - Try `npm run build` again

4. **Still broken?**
   - Rollback: `git checkout src/`
   - `npm install`
   - Check if `.vite` cache needs clearing

---

## Documentation Updates After Reversion

After successful reversion, update:

1. **REACT_COMPLETION_CHECKLIST.md**
   - Add "Reverted to Standard Imports" section
   - Mark completion date

2. **REACT_MIGRATION_DECISION_LOG.md**
   - Add "Reversion Completed" section
   - Mark date and status

3. **README.md** (if exists)
   - Note: "React imports follow industry standard pattern"

---

## Commit Message Template

```
feat: revert React imports to industry standard

- Reverted 71 files from namespace imports to standard destructured imports
- Pattern: import React, { useState, ... } from 'react'
- Reason: Namespace imports were a workaround; root cause (vite dedupe) is fixed
- Verified: Single React version, npm ls confirms, build passes
- Testing: Full build + dev server tested successfully

References:
- REACT_MIGRATION_DECISION_LOG.md (decision context)
- REVERT_IMPORTS.md (implementation guide)
```

---

**Status:** Ready to Execute  
**Last Updated:** December 10, 2025  
**Next Step:** Run through the guide step-by-step in next session
