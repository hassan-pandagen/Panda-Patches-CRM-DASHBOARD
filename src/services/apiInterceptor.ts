// src/services/apiInterceptor.ts - Centralized API request handling with retry logic

import { logger } from './logger';

export interface RequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
  originalError?: Error;
}

/**
 * Centralized API interceptor with error handling and retry logic
 */
class ApiInterceptor {
  private baseUrl = '';
  private timeout = 30000; // 30 seconds
  private maxRetries = 3;
  private retryDelay = 1000; // 1 second base delay

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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(fullUrl, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: data ? JSON.stringify(data) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle errors based on status code
        if (!response.ok) {
          const error = await this.handleErrorResponse(response);
          throw error;
        }

        const result = (await response.json()) as T;
        logger.info(`[API] ${method} ${url} - Success`, { result });
        return result;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      // Retry logic for transient failures
      if (retries < this.maxRetries && this.isRetryable(error)) {
        const delayMs = this.retryDelay * Math.pow(2, retries); // Exponential backoff
        logger.warn(
          `[API] Retrying ${method} ${url} (attempt ${retries + 1}/${this.maxRetries}) after ${delayMs}ms`
        );
        
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return this.request<T>({ ...config, retries: retries + 1 });
      }

      // Log error and re-throw
      logger.error(`[API] ${method} ${url} - Failed after ${retries} retries`, error);
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

    // Assign error code based on status
    switch (response.status) {
      case 400:
        error.code = 'BAD_REQUEST';
        break;
      case 401:
        error.code = 'UNAUTHORIZED';
        // TODO: Trigger token refresh here
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
    
    // Retry on specific error codes
    const retryableCodes = [
      'REQUEST_TIMEOUT',
      'SERVER_ERROR',
      'SERVICE_UNAVAILABLE',
      'RATE_LIMITED',
    ];

    const isRetryableCode = retryableCodes.includes(apiError.code || '');
    const isNetworkError = error.message.includes('Failed to fetch');
    const isAbortError = error.name === 'AbortError';

    return isRetryableCode || isNetworkError || isAbortError;
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

  /**
   * Set base URL for API calls
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /**
   * Set global timeout
   */
  setTimeout(ms: number): void {
    this.timeout = ms;
  }

  /**
   * Set max retries
   */
  setMaxRetries(count: number): void {
    this.maxRetries = count;
  }
}

export const apiInterceptor = new ApiInterceptor();
