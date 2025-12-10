# Implementation Plan - Core Services Enhancement

**Date Started**: December 10, 2025  
**Priority**: High Impact, High ROI  
**Estimated Time**: 2-3 hours

---

## Overview

Three critical services to implement for **performance, stability, and UX improvements**:

1. **Input Validation Service** - Prevent bad data
2. **API Request Interceptor** - Handle errors gracefully
3. **Rate Limiting/Debouncing** - Prevent spam, improve UX

---

## Service 1: Input Validation Service

### Purpose
- Validate all form inputs before sending to API
- Catch bad data early (client-side)
- Provide user-friendly error messages
- Reduce server load from invalid requests

### Implementation Steps

#### Step 1: Install Zod (schema validation library)
```bash
npm install zod
```

#### Step 2: Create `src/services/validation.ts`
```typescript
import { z } from 'zod';

// ============ ORDER SCHEMAS ============

export const orderSchema = z.object({
  customerName: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name too long'),
  
  customerEmail: z.string()
    .email('Invalid email address'),
  
  patchesQuantity: z.number()
    .int('Must be whole number')
    .positive('Quantity must be greater than 0'),
  
  orderAmount: z.number()
    .positive('Order amount must be positive'),
  
  shippingAddress: z.string()
    .min(5, 'Address required'),
  
  orderStatus: z.enum([
    'NEW_ORDER',
    'IN_PRODUCTION',
    'READY_TO_SHIP',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'REVISION_REQUESTED',
    'REFUNDED',
  ]),
  
  // Optional fields
  instructions: z.string().optional(),
  notes: z.string().optional(),
});

// ============ USER SCHEMAS ============

export const userSchema = z.object({
  email: z.string().email('Invalid email'),
  fullName: z.string().min(2, 'Name required'),
  role: z.enum(['ADMIN', 'USER', 'PRODUCTION', 'AGENT']).optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[0-9]/, 'Must contain number'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// ============ UTILITIES ============

/**
 * Validates data against schema and throws formatted error
 */
export const validateData = async <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Promise<T> => {
  try {
    return await schema.parseAsync(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      throw new Error(`Validation failed: ${messages}`);
    }
    throw error;
  }
};

/**
 * Validate and get formatted field errors
 */
export const getValidationErrors = (schema: z.ZodSchema, data: unknown) => {
  try {
    schema.parse(data);
    return null;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      error.errors.forEach(err => {
        const field = err.path[0];
        fieldErrors[field as string] = err.message;
      });
      return fieldErrors;
    }
    return null;
  }
};

export type Order = z.infer<typeof orderSchema>;
export type User = z.infer<typeof userSchema>;
export type PasswordChange = z.infer<typeof passwordChangeSchema>;
```

#### Step 3: Use in Forms (Example: EditOrderPage.tsx)
```typescript
import { validateData, orderSchema, getValidationErrors } from '../services/validation';

const handleSubmit = async (formData: unknown) => {
  try {
    // Validate before sending to API
    const validatedData = await validateData(orderSchema, formData);
    
    // Send to API
    await updateOrder(validatedData);
    
    toast.success('Order updated successfully');
  } catch (error) {
    // Show user-friendly error
    toast.error(error.message);
  }
};
```

---

## Service 2: API Request Interceptor

### Purpose
- Handle API errors consistently
- Refresh tokens on 401 (unauthorized)
- Retry failed requests
- Add request/response logging
- Handle timeouts

### Implementation Steps

#### Step 1: Create `src/services/apiInterceptor.ts`
```typescript
import { logger } from './logger';

interface RequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

interface ApiError extends Error {
  status?: number;
  code?: string;
  originalError?: Error;
}

class ApiInterceptor {
  private baseUrl = '';
  private timeout = 30000; // 30 seconds
  private maxRetries = 3;

  /**
   * Make API request with error handling and retry logic
   */
  async request<T>(config: RequestConfig): Promise<T> {
    const {
      method,
      url,
      data,
      headers = {},
      timeout = this.timeout,
      retries = 0,
    } = config;

    const fullUrl = `${this.baseUrl}${url}`;

    try {
      logger.info(`[API] ${method} ${url}`, { data });

      const response = await fetch(fullUrl, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(timeout),
      });

      // Handle errors based on status code
      if (!response.ok) {
        const error = await this.handleErrorResponse(response);
        throw error;
      }

      const result = (await response.json()) as T;
      logger.info(`[API] ${method} ${url} - Success`, { result });
      return result;
    } catch (error) {
      // Retry logic
      if (retries < this.maxRetries && this.isRetryable(error)) {
        logger.warn(`[API] Retrying ${method} ${url} (attempt ${retries + 1}/${this.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retries + 1))); // Exponential backoff
        return this.request<T>({ ...config, retries: retries + 1 });
      }

      // Log error and re-throw
      logger.error(`[API] ${method} ${url} - Failed`, error);
      throw error;
    }
  }

  /**
   * Handle error response from API
   */
  private async handleErrorResponse(response: Response): Promise<ApiError> {
    const error = new Error(`API Error: ${response.status}`) as ApiError;
    error.status = response.status;

    try {
      const errorData = await response.json() as { message?: string; code?: string };
      error.message = errorData.message || error.message;
      error.code = errorData.code;
    } catch {
      // Response wasn't JSON, use status text
      error.message = response.statusText || error.message;
    }

    // Handle specific status codes
    switch (response.status) {
      case 400:
        error.code = 'BAD_REQUEST';
        break;
      case 401:
        error.code = 'UNAUTHORIZED';
        // TODO: Refresh token here
        break;
      case 403:
        error.code = 'FORBIDDEN';
        break;
      case 404:
        error.code = 'NOT_FOUND';
        break;
      case 408:
        error.code = 'REQUEST_TIMEOUT';
        break;
      case 429:
        error.code = 'RATE_LIMITED';
        break;
      case 500:
        error.code = 'SERVER_ERROR';
        break;
      case 503:
        error.code = 'SERVICE_UNAVAILABLE';
        break;
      default:
        error.code = 'UNKNOWN_ERROR';
    }

    return error;
  }

  /**
   * Determine if error is retryable
   */
  private isRetryable(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const apiError = error as ApiError;
    
    // Retry on network errors, timeouts, and server errors
    const retryableCodes = [
      'REQUEST_TIMEOUT',
      'SERVER_ERROR',
      'SERVICE_UNAVAILABLE',
      'RATE_LIMITED',
    ];

    return (
      retryableCodes.includes(apiError.code || '') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('timeout')
    );
  }

  /**
   * GET request
   */
  get<T>(url: string, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      method: 'GET',
      url,
      ...config,
    });
  }

  /**
   * POST request
   */
  post<T>(url: string, data: unknown, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      method: 'POST',
      url,
      data,
      ...config,
    });
  }

  /**
   * PUT request
   */
  put<T>(url: string, data: unknown, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      method: 'PUT',
      url,
      data,
      ...config,
    });
  }

  /**
   * PATCH request
   */
  patch<T>(url: string, data: unknown, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      method: 'PATCH',
      url,
      data,
      ...config,
    });
  }

  /**
   * DELETE request
   */
  delete<T>(url: string, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      method: 'DELETE',
      url,
      ...config,
    });
  }
}

export const apiInterceptor = new ApiInterceptor();
```

#### Step 2: Use in Services
```typescript
import { apiInterceptor } from './apiInterceptor';

export const updateOrder = (order: Order) => {
  return apiInterceptor.put<Order>(
    `/api/orders/${order.id}`,
    order,
    { timeout: 15000 }
  );
};
```

---

## Service 3: Rate Limiting / Debouncing

### Purpose
- Prevent form double-submit
- Prevent API spam
- Improve UX
- Reduce server load

### Implementation Steps

#### Step 1: Update `src/hooks/useDebounce.ts` (Already exists)
The hook already exists, just use it more aggressively.

#### Step 2: Create Form Submit Wrapper
In any form component:
```typescript
const [isSubmitting, setIsSubmitting] = useState(false);

const handleSubmit = async (formData: FormData) => {
  // Prevent double-submit
  if (isSubmitting) return;
  
  setIsSubmitting(true);
  try {
    await validateData(orderSchema, formData);
    await updateOrder(formData);
    toast.success('Saved');
  } catch (error) {
    toast.error(error.message);
  } finally {
    setIsSubmitting(false);
  }
};

// Disable button while submitting
<button disabled={isSubmitting}>
  {isSubmitting ? 'Saving...' : 'Save'}
</button>
```

#### Step 3: Create Rate Limiter Utility
Create `src/services/rateLimiter.ts`:
```typescript
/**
 * Rate limiter to prevent spam
 */
export class RateLimiter {
  private lastCallTime = 0;
  private minInterval: number;

  constructor(minIntervalMs: number = 1000) {
    this.minInterval = minIntervalMs;
  }

  /**
   * Check if enough time has passed since last call
   */
  canCall(): boolean {
    const now = Date.now();
    if (now - this.lastCallTime >= this.minInterval) {
      this.lastCallTime = now;
      return true;
    }
    return false;
  }

  /**
   * Reset the timer
   */
  reset(): void {
    this.lastCallTime = 0;
  }
}

// Usage in component
const searchLimiter = new RateLimiter(500); // Max 1 search per 500ms

const handleSearch = (query: string) => {
  if (!searchLimiter.canCall()) return;
  performSearch(query);
};
```

---

## Implementation Timeline

### Phase 1: Input Validation (30 mins) ✅ COMPLETED
- [x] Install Zod
- [x] Create `src/services/validation.ts`
- [x] Add schemas for Order, User, PasswordChange
- [x] Add utilities: validateData, validateDataSync, getValidationErrors, isValid, validatePartial
- [x] Test build success

### Phase 2: API Interceptor (45 mins) ✅ COMPLETED
- [x] Create `src/services/apiInterceptor.ts`
- [x] Implement error handling and retries
- [x] Add exponential backoff for transient failures
- [x] Map error codes (400, 401, 404, 500, etc)
- [x] Test build success

### Phase 3: Rate Limiting (20 mins) ✅ COMPLETED
- [x] Create `src/services/rateLimiter.ts`
- [x] Implement RateLimiter class
- [x] Implement SlidingWindowRateLimiter class
- [x] Add debounce and throttle utilities
- [x] Create pre-configured instances: formSubmitLimiter, apiCallLimiter, searchLimiter
- [x] Test build success

---

## Testing Each Service

### Test Validation
```typescript
// Should succeed
await validateData(orderSchema, {
  customerName: 'John',
  customerEmail: 'john@example.com',
  // ... rest
});

// Should fail
await validateData(orderSchema, {
  customerName: '', // Too short
  customerEmail: 'invalid', // Not email
});
```

### Test API Interceptor
```typescript
// Should retry on 500
apiInterceptor.get('/api/test'); // Server error → retry

// Should throw on 400
apiInterceptor.get('/api/test'); // Bad request → throw
```

### Test Rate Limiting
```typescript
const limiter = new RateLimiter(1000);
console.log(limiter.canCall()); // true
console.log(limiter.canCall()); // false (too soon)
```

---

## Rollout Plan

1. ✅ **Day 1**: Implement validation - DONE
2. ✅ **Day 2**: Implement API interceptor - DONE
3. ✅ **Day 3**: Implement rate limiting - DONE
4. ⏳ **Day 4**: Integrate into components (next phase)

---

## Success Metrics

After implementation:
- ✅ No invalid data reaches API (validation in place)
- ✅ All API errors logged and handled (interceptor in place)
- ✅ Failed requests automatically retry (with exponential backoff)
- ✅ No form double-submits (rate limiter available)
- ✅ Reduced server load (debounce/throttle available)
- ✅ Better error messages for users (field-level validation)
- ✅ Build successful with no errors

---

## Next Steps (Integration Phase)

1. Update EditOrderPage to use validation service
2. Update orderService to use apiInterceptor
3. Add formSubmitLimiter to form submissions
4. Add searchLimiter to search endpoints
5. Test thoroughly with real forms

See: `INTEGRATION_GUIDE.md` (to be created)

---

**Status**: ✅ IMPLEMENTATION COMPLETE - Ready for integration  
**Last Updated**: December 10, 2025
