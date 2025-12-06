import { describe, it, expect } from 'vitest';

// Helper function tests for common utilities
describe('Email Validation', () => {
  const isValidEmail = (email: string): boolean => {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  it('should validate correct email addresses', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('user.name@company.co.uk')).toBe(true);
    expect(isValidEmail('test+tag@example.com')).toBe(true);
  });

  it('should reject invalid email addresses', () => {
    expect(isValidEmail('invalid.email')).toBe(false);
    expect(isValidEmail('missing@domain')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('test@')).toBe(false);
  });

  it('should reject null/undefined/empty emails', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null as any)).toBe(false);
    expect(isValidEmail(undefined as any)).toBe(false);
  });

  it('should trim whitespace before validation', () => {
    expect(isValidEmail('  test@example.com  ')).toBe(true);
  });
});

describe('File Name Extraction', () => {
  const getFileName = (url: string): string => {
    try {
      return url.split('/').pop()?.split('?')[0] || 'file';
    } catch {
      return 'file';
    }
  };

  it('should extract filename from URL', () => {
    expect(getFileName('https://example.com/files/document.pdf')).toBe('document.pdf');
    expect(getFileName('/path/to/image.png')).toBe('image.png');
  });

  it('should remove query parameters from filename', () => {
    expect(getFileName('https://example.com/file.jpg?size=large&v=2')).toBe('file.jpg');
  });

  it('should return default "file" for invalid URLs', () => {
    expect(getFileName('')).toBe('file');
    expect(getFileName('not-a-url')).toBe('not-a-url');
  });
});

describe('Number Conversion', () => {
  const toNumber = (val: any) => {
    if (val === null || val === undefined || val === '') return 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  };

  it('should convert valid numbers', () => {
    expect(toNumber(100)).toBe(100);
    expect(toNumber('250')).toBe(250);
    expect(toNumber('100.50')).toBe(100.50);
  });

  it('should return 0 for null, undefined, empty string', () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber('')).toBe(0);
  });

  it('should return 0 for invalid numbers', () => {
    expect(toNumber('abc')).toBe(0);
    expect(toNumber('12abc')).toBe(0);
    expect(toNumber(NaN)).toBe(0);
  });
});

describe('Case Conversion', () => {
  const toSnakeCase = (str: string): string => {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  };

  it('should convert camelCase to snake_case', () => {
    expect(toSnakeCase('orderAmount')).toBe('order_amount');
    expect(toSnakeCase('customerName')).toBe('customer_name');
    expect(toSnakeCase('mockupUrls')).toBe('mockup_urls');
  });

  it('should handle multiple capital letters', () => {
    expect(toSnakeCase('HTTPResponse')).toBe('_h_t_t_p_response');
  });

  it('should handle already snake_case strings', () => {
    expect(toSnakeCase('already_snake_case')).toBe('already_snake_case');
  });
});

describe('Order Status Transitions', () => {
  const isValidStatusTransition = (current: string, next: string): boolean => {
    const validTransitions: Record<string, string[]> = {
      'NEW_ORDER': ['DESIGN', 'CANCELLED'],
      'DESIGN': ['QUOTED', 'REVISION_REQUESTED', 'CANCELLED'],
      'QUOTED': ['APPROVED', 'REVISION_REQUESTED', 'CANCELLED'],
      'APPROVED': ['IN_PRODUCTION', 'CANCELLED'],
      'IN_PRODUCTION': ['QUALITY_ASSURANCE', 'CANCELLED'],
      'QUALITY_ASSURANCE': ['SHIPPED', 'REVISION_REQUESTED', 'CANCELLED'],
      'SHIPPED': ['DELIVERED', 'CANCELLED'],
      'DELIVERED': ['FEEDBACK', 'CANCELLED'],
      'FEEDBACK': [],
      'CANCELLED': [],
    };
    return validTransitions[current]?.includes(next) ?? false;
  };

  it('should allow valid status transitions', () => {
    expect(isValidStatusTransition('NEW_ORDER', 'DESIGN')).toBe(true);
    expect(isValidStatusTransition('DESIGN', 'QUOTED')).toBe(true);
    expect(isValidStatusTransition('SHIPPED', 'DELIVERED')).toBe(true);
  });

  it('should reject invalid status transitions', () => {
    expect(isValidStatusTransition('NEW_ORDER', 'SHIPPED')).toBe(false);
    expect(isValidStatusTransition('DELIVERED', 'NEW_ORDER')).toBe(false);
    expect(isValidStatusTransition('FEEDBACK', 'DELIVERED')).toBe(false);
  });

  it('should allow cancellation from any status except final states', () => {
    expect(isValidStatusTransition('NEW_ORDER', 'CANCELLED')).toBe(true);
    expect(isValidStatusTransition('IN_PRODUCTION', 'CANCELLED')).toBe(true);
    expect(isValidStatusTransition('FEEDBACK', 'CANCELLED')).toBe(false);
  });
});
