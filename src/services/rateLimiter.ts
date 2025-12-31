// src/services/rateLimiter.ts - Rate limiting to prevent spam and double-submit

import { logger } from './logger';

/**
 * Rate limiter to prevent API spam and duplicate submissions
 */
export class RateLimiter {
  private lastCallTime = 0;
  private minInterval: number;
  private callCount = 0;
  private resetTime = 0;

  /**
   * @param minIntervalMs - Minimum milliseconds between calls
   */
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
   * Get milliseconds until next call is allowed
   */
  getWaitTime(): number {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    return Math.max(0, this.minInterval - elapsed);
  }

  /**
   * Reset the timer
   */
  reset(): void {
    this.lastCallTime = 0;
  }

  /**
   * Try to call a function with rate limiting
   */
  async call<T>(fn: () => T | Promise<T>): Promise<T | null> {
    if (!this.canCall()) {
      logger.warn(`Rate limit exceeded. Wait ${this.getWaitTime()}ms`);
      return null;
    }
    return fn();
  }

  /**
   * Get current state
   */
  getState() {
    return {
      lastCallTime: this.lastCallTime,
      minInterval: this.minInterval,
      waitTime: this.getWaitTime(),
    };
  }
}

/**
 * Sliding window rate limiter (X calls per Y milliseconds)
 */
export class SlidingWindowRateLimiter {
  private calls: number[] = [];
  private maxCalls: number;
  private windowMs: number;

  /**
   * @param maxCalls - Maximum number of calls allowed
   * @param windowMs - Time window in milliseconds
   */
  constructor(maxCalls: number = 5, windowMs: number = 60000) {
    this.maxCalls = maxCalls;
    this.windowMs = windowMs;
  }

  /**
   * Check if call is allowed
   */
  canCall(): boolean {
    const now = Date.now();
    
    // Remove old calls outside the window
    this.calls = this.calls.filter(time => now - time < this.windowMs);

    // Check if we can make a call
    if (this.calls.length < this.maxCalls) {
      this.calls.push(now);
      return true;
    }

    return false;
  }

  /**
   * Get remaining calls
   */
  getRemainingCalls(): number {
    const now = Date.now();
    this.calls = this.calls.filter(time => now - time < this.windowMs);
    return Math.max(0, this.maxCalls - this.calls.length);
  }

  /**
   * Get milliseconds until next call is allowed
   */
  getWaitTime(): number {
    if (this.calls.length < this.maxCalls) {
      return 0;
    }

    const oldestCall = this.calls[0];
    const waitTime = this.windowMs - (Date.now() - oldestCall);
    return Math.max(0, waitTime);
  }

  /**
   * Reset all calls
   */
  reset(): void {
    this.calls = [];
  }

  /**
   * Get current state
   */
  getState() {
    return {
      calls: this.calls.length,
      maxCalls: this.maxCalls,
      windowMs: this.windowMs,
      remainingCalls: this.getRemainingCalls(),
      waitTime: this.getWaitTime(),
    };
  }
}

// NOTE: debounce and throttle are provided by src/utils/debounce.ts
// Use: import { debounce, throttle } from '../utils/debounce';

// Common rate limiters (singleton instances)
export const formSubmitLimiter = new RateLimiter(1000); // 1 submission per second
export const apiCallLimiter = new SlidingWindowRateLimiter(10, 60000); // 10 calls per minute
export const searchLimiter = new RateLimiter(500); // Debounce search
