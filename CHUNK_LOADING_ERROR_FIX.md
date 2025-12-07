# Chunk Loading Error Fix - Sentry Integration

## Problem
A customer faced the error: `Failed to fetch dynamically imported module: https://panda-patches-crm-dashboard.vercel.app/assets/AllOrdersPage-j1wq0Az1.js`

This error was:
1. **Visible to the customer** - Shows on the error boundary UI
2. **NOT appearing in Sentry** - Despite having Sentry setup with Vercel proxy

## Root Causes

1. **Dynamic import errors aren't caught by React Error Boundaries** - These are network/module load errors, not render errors
2. **No global error handlers for chunk loading failures** - JavaScript errors from missing chunks weren't being captured
3. **Unhandled promise rejections from dynamic imports** - Weren't being sent to Sentry

## Solutions Implemented

### 1. Global Error Listeners in main.tsx
Added two global event listeners to catch chunk loading errors:

```typescript
// Catches script loading errors (error event)
window.addEventListener('error', (event) => {
  if (event.filename?.includes('assets/') && event.filename?.includes('.js')) {
    // Send to Sentry with chunk details
  }
});

// Catches unhandled promise rejections (dynamic import failures)
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message?.includes('dynamically imported module')) {
    // Send to Sentry with import details
  }
});
```

### 2. ChunkErrorBoundary Component
Created a specialized error boundary that:
- Only catches dynamic import errors
- Displays a user-friendly message with retry option
- Sends detailed error context to Sentry
- Tracks retry count for debugging

### 3. Improved Sentry Proxy (api/sentry-proxy.ts)
Enhanced with:
- Better logging for debugging proxy issues
- Proper HTTP headers forwarding
- Improved error messages
- Status code tracking

### 4. Enhanced Logger Service
Updated logger.ts to:
- Import Sentry directly
- Send errors to Sentry in production
- Accept optional context object for additional debugging info

### 5. Updated ErrorBoundary
Enhanced with:
- Direct Sentry integration
- React component stack context
- Better error logging

### 6. Vercel Configuration
Added explicit rewrite for Sentry proxy in vercel.json:
```json
{
  "source": "/api/sentry-proxy",
  "destination": "/api/sentry-proxy.ts"
}
```

## How It Works

1. **User loads a lazy route** → Dynamic import of chunk begins
2. **Chunk fails to load** (404, network error, etc.)
3. **Error caught by:**
   - `unhandledrejection` listener (primary method)
   - `error` listener (fallback for script errors)
4. **Error sent to Sentry via tunnel** (/api/sentry-proxy)
5. **Sentry proxy forwards** to Sentry servers
6. **Error appears in Sentry dashboard** with full context

## Testing the Fix

### In Development:
```javascript
// Open browser console and trigger a chunk error
window.location.href = '/orders'; // Navigate to lazy-loaded page
// If chunk fails, watch for console errors
```

### In Production:
- Monitor Sentry dashboard for "Failed to fetch dynamically imported module" errors
- Check browser console for error logs
- Verify Vercel logs show proxy requests: `[Sentry Proxy] Forwarding error event`

## Debugging

### Check if error is being sent to Sentry:
1. Open browser DevTools Network tab
2. Navigate to a lazy route
3. Look for POST request to `/api/sentry-proxy`
4. Response should have `success: true`

### Check Sentry proxy logs:
```bash
# In Vercel dashboard, check function logs for:
[Sentry Proxy] Forwarding error event to Sentry
[Sentry Proxy] Sentry response status: 200
```

## Files Modified

1. **src/main.tsx** - Added global error listeners
2. **src/App.tsx** - Added ChunkErrorBoundary wrapper
3. **src/components/ChunkErrorBoundary.tsx** - New component for chunk errors
4. **src/components/ErrorBoundary.tsx** - Enhanced with Sentry integration
5. **src/services/logger.ts** - Added Sentry integration
6. **api/sentry-proxy.ts** - Improved logging and error handling
7. **vercel.json** - Added proxy rewrite

## Related Configuration

- Sentry DSN: https://panda-patches-crm.sentry.io/
- Tunnel: `/api/sentry-proxy`
- Environment: Detects automatically via `import.meta.env.MODE`
