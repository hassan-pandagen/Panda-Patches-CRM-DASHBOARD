# Dashboard Today Filter - Date Fix Context

## File to Fix
`src/pages/Dashboard.tsx` (Lines 103-124)

## Problem
The "today" filter uses `toISOString()` which converts to UTC, causing it to show yesterday's data in Pakistan timezone (UTC+5).

## Quick Fix (Copy-Paste Ready)

**Replace this:**
```javascript
const activeDateRange = useMemo(() => {
  if (dateView === "custom" && customDateRange) {
    return customDateRange;
  }

  const endDate = new Date();
  const startDate = new Date();

  if (dateView === "today") {
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
  } else if (dateView === "week") {
    startDate.setDate(endDate.getDate() - 7);
  } else {
    startDate.setMonth(endDate.getMonth() - 1);
  }

  return {
    startDate: startDate.toISOString().split("T")[0],  // ❌ BUG
    endDate: endDate.toISOString().split("T")[0],      // ❌ BUG
  };
}, [dateView, customDateRange]);
```

**With this:**
```javascript
// Helper function - add before the useMemo
const getLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const activeDateRange = useMemo(() => {
  if (dateView === "custom" && customDateRange) {
    return customDateRange;
  }

  const endDate = new Date();
  const startDate = new Date();

  if (dateView === "today") {
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
  } else if (dateView === "week") {
    startDate.setDate(endDate.getDate() - 7);
  } else {
    startDate.setMonth(endDate.getMonth() - 1);
  }

  return {
    startDate: getLocalDateString(startDate),  // ✅ FIXED
    endDate: getLocalDateString(endDate),      // ✅ FIXED
  };
}, [dateView, customDateRange]);
```

## Why This Works
- `getLocalDateString()` builds date string from local values, not UTC
- Matches ReportsPage's approach (which already works correctly)
- Handles Pakistan timezone (UTC+5) correctly
- Won't affect Clock In/Out or ReportsPage

## Status
✅ Ready to implement next session
