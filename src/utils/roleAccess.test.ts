// Regression guard for Task 0.1.
//
// The bug this file exists to prevent: several access checks were written as
// exclusion lists (`role !== 'PRODUCTION' && role !== 'SHIPPING'`), so a role
// that did not exist when the check was written PASSED it. Adding DIGITIZER as
// configuration would have granted an outside freelancer the ability to email
// customers, plus Activity, Inbox and New Order.
//
// The test that matters is the last one: an unknown role must receive nothing.
import { describe, it, expect } from 'vitest';
import { UserRole } from '../types/index';
import {
  roleCan,
  ROLES_CAN_SEND_CUSTOMER_EMAIL,
  ROLES_CAN_CREATE_ORDERS,
  ROLES_CAN_VIEW_ACTIVITY_AND_INBOX,
  ROLES_SEE_ALL_ORDER_ROWS,
  ROLES_SEE_ALL_DASHBOARD_DATA,
  ROLES_SEE_ALL_REPORT_DATA,
  ROLES_CAN_ACCESS_ADMIN_ROUTES,
  ROLES_CAN_MANAGE_USERS,
  ROLES_CAN_VIEW_CUSTOMER_IDENTITY,
  ROLES_CAN_CONFIRM_COLOUR_MATCH,
} from './roleAccess';

const ALL_LISTS = [
  ROLES_CAN_SEND_CUSTOMER_EMAIL,
  ROLES_CAN_CREATE_ORDERS,
  ROLES_CAN_VIEW_ACTIVITY_AND_INBOX,
  ROLES_SEE_ALL_ORDER_ROWS,
  ROLES_SEE_ALL_DASHBOARD_DATA,
  ROLES_SEE_ALL_REPORT_DATA,
  ROLES_CAN_ACCESS_ADMIN_ROUTES,
  ROLES_CAN_MANAGE_USERS,
  ROLES_CAN_VIEW_CUSTOMER_IDENTITY,
  ROLES_CAN_CONFIRM_COLOUR_MATCH,
];

describe('roleCan — default deny', () => {
  it('denies an unknown role every capability', () => {
    // This is the whole point. If someone adds a role to the enum and forgets
    // roleAccess.ts, they get nothing rather than everything.
    for (const list of ALL_LISTS) {
      expect(roleCan('SOME_FUTURE_ROLE', list)).toBe(false);
      expect(roleCan('anything_at_all', list)).toBe(false);
      expect(roleCan('admin', list)).toBe(false);   // case-sensitive on purpose
    }
  });

  it('denies null / undefined / empty role', () => {
    for (const list of ALL_LISTS) {
      expect(roleCan(null, list)).toBe(false);
      expect(roleCan(undefined, list)).toBe(false);
      expect(roleCan('', list)).toBe(false);
    }
  });
});

describe('DIGITIZER is denied everything that reaches a customer', () => {
  // Guardrail 1 made structural. A digitizer has no send path, no Inbox and no
  // Activity feed, so there is no route to a customer at all — rather than a
  // route that happens to have its fields hidden.
  it('cannot send customer email, see Inbox/Activity, or create orders', () => {
    expect(roleCan(UserRole.DIGITIZER, ROLES_CAN_SEND_CUSTOMER_EMAIL)).toBe(false);
    expect(roleCan(UserRole.DIGITIZER, ROLES_CAN_VIEW_ACTIVITY_AND_INBOX)).toBe(false);
    expect(roleCan(UserRole.DIGITIZER, ROLES_CAN_CREATE_ORDERS)).toBe(false);
  });

  it('cannot see all order rows — scope comes from the assignment window, not a flag', () => {
    expect(roleCan(UserRole.DIGITIZER, ROLES_SEE_ALL_ORDER_ROWS)).toBe(false);
    expect(roleCan(UserRole.DIGITIZER, ROLES_SEE_ALL_REPORT_DATA)).toBe(false);
    expect(roleCan(UserRole.DIGITIZER, ROLES_SEE_ALL_DASHBOARD_DATA)).toBe(false);
  });

  it('cannot reach admin routes or user management', () => {
    expect(roleCan(UserRole.DIGITIZER, ROLES_CAN_ACCESS_ADMIN_ROUTES)).toBe(false);
    expect(roleCan(UserRole.DIGITIZER, ROLES_CAN_MANAGE_USERS)).toBe(false);
  });
});

describe('colour-match confirmation is supervisor + admin only', () => {
  // Recording the yarn releases a $150-200 set into production. It is not a
  // security boundary — the DB trigger is — but the control should only appear
  // to the people the brief names.
  it('allows ADMIN and PRODUCTION_SUPERVISOR', () => {
    expect(roleCan(UserRole.ADMIN, ROLES_CAN_CONFIRM_COLOUR_MATCH)).toBe(true);
    expect(roleCan(UserRole.PRODUCTION_SUPERVISOR, ROLES_CAN_CONFIRM_COLOUR_MATCH)).toBe(true);
  });

  it('denies everyone else, including the plain PRODUCTION role and a digitizer', () => {
    expect(roleCan(UserRole.PRODUCTION, ROLES_CAN_CONFIRM_COLOUR_MATCH)).toBe(false);
    expect(roleCan(UserRole.DIGITIZER, ROLES_CAN_CONFIRM_COLOUR_MATCH)).toBe(false);
    expect(roleCan(UserRole.SALES_AGENT, ROLES_CAN_CONFIRM_COLOUR_MATCH)).toBe(false);
    expect(roleCan(UserRole.SHIPPING, ROLES_CAN_CONFIRM_COLOUR_MATCH)).toBe(false);
    expect(roleCan(null, ROLES_CAN_CONFIRM_COLOUR_MATCH)).toBe(false);
  });
});

describe('PRODUCTION_SUPERVISOR', () => {
  it('sends mockups and sees all orders (Task 1.6)', () => {
    expect(roleCan(UserRole.PRODUCTION_SUPERVISOR, ROLES_CAN_SEND_CUSTOMER_EMAIL)).toBe(true);
    expect(roleCan(UserRole.PRODUCTION_SUPERVISOR, ROLES_SEE_ALL_ORDER_ROWS)).toBe(true);
  });

  it('does not get admin, user management, order creation or the Inbox', () => {
    expect(roleCan(UserRole.PRODUCTION_SUPERVISOR, ROLES_CAN_ACCESS_ADMIN_ROUTES)).toBe(false);
    expect(roleCan(UserRole.PRODUCTION_SUPERVISOR, ROLES_CAN_MANAGE_USERS)).toBe(false);
    expect(roleCan(UserRole.PRODUCTION_SUPERVISOR, ROLES_CAN_CREATE_ORDERS)).toBe(false);
    expect(roleCan(UserRole.PRODUCTION_SUPERVISOR, ROLES_CAN_VIEW_ACTIVITY_AND_INBOX)).toBe(false);
  });
});

describe('customer identity is a role boundary, not a permission', () => {
  // PROJECT-KNOWLEDGE §5.1: production sees the product, sales handles the customer.
  // The trap: email/phone/address were gated on `shipping_view`, and BOTH Production
  // accounts hold that flag — so the permission could not express this boundary.
  it('hides the customer from PRODUCTION and DIGITIZER', () => {
    expect(roleCan(UserRole.PRODUCTION, ROLES_CAN_VIEW_CUSTOMER_IDENTITY)).toBe(false);
    expect(roleCan(UserRole.DIGITIZER, ROLES_CAN_VIEW_CUSTOMER_IDENTITY)).toBe(false);
  });

  it('keeps SHIPPING in — they need the name and address to dispatch', () => {
    expect(roleCan(UserRole.SHIPPING, ROLES_CAN_VIEW_CUSTOMER_IDENTITY)).toBe(true);
  });

  it('keeps ADMIN, SALES_AGENT and PRODUCTION_SUPERVISOR in', () => {
    expect(roleCan(UserRole.ADMIN, ROLES_CAN_VIEW_CUSTOMER_IDENTITY)).toBe(true);
    expect(roleCan(UserRole.SALES_AGENT, ROLES_CAN_VIEW_CUSTOMER_IDENTITY)).toBe(true);
    expect(roleCan(UserRole.PRODUCTION_SUPERVISOR, ROLES_CAN_VIEW_CUSTOMER_IDENTITY)).toBe(true);
  });
});

describe('behaviour preserved for the four existing roles', () => {
  // These mirror the exact truth tables of the negative checks that were replaced.
  it('customer email: ADMIN + SALES_AGENT only', () => {
    expect(roleCan(UserRole.ADMIN, ROLES_CAN_SEND_CUSTOMER_EMAIL)).toBe(true);
    expect(roleCan(UserRole.SALES_AGENT, ROLES_CAN_SEND_CUSTOMER_EMAIL)).toBe(true);
    expect(roleCan(UserRole.PRODUCTION, ROLES_CAN_SEND_CUSTOMER_EMAIL)).toBe(false);
    expect(roleCan(UserRole.SHIPPING, ROLES_CAN_SEND_CUSTOMER_EMAIL)).toBe(false);
  });

  it('new order: everyone except PRODUCTION', () => {
    expect(roleCan(UserRole.ADMIN, ROLES_CAN_CREATE_ORDERS)).toBe(true);
    expect(roleCan(UserRole.SALES_AGENT, ROLES_CAN_CREATE_ORDERS)).toBe(true);
    expect(roleCan(UserRole.SHIPPING, ROLES_CAN_CREATE_ORDERS)).toBe(true);
    expect(roleCan(UserRole.PRODUCTION, ROLES_CAN_CREATE_ORDERS)).toBe(false);
  });

  it('activity + inbox: ADMIN + SALES_AGENT only', () => {
    expect(roleCan(UserRole.ADMIN, ROLES_CAN_VIEW_ACTIVITY_AND_INBOX)).toBe(true);
    expect(roleCan(UserRole.SALES_AGENT, ROLES_CAN_VIEW_ACTIVITY_AND_INBOX)).toBe(true);
    expect(roleCan(UserRole.PRODUCTION, ROLES_CAN_VIEW_ACTIVITY_AND_INBOX)).toBe(false);
    expect(roleCan(UserRole.SHIPPING, ROLES_CAN_VIEW_ACTIVITY_AND_INBOX)).toBe(false);
  });

  it('all order rows: everyone except SALES_AGENT, who is scoped to their own', () => {
    expect(roleCan(UserRole.ADMIN, ROLES_SEE_ALL_ORDER_ROWS)).toBe(true);
    expect(roleCan(UserRole.PRODUCTION, ROLES_SEE_ALL_ORDER_ROWS)).toBe(true);
    expect(roleCan(UserRole.SHIPPING, ROLES_SEE_ALL_ORDER_ROWS)).toBe(true);
    expect(roleCan(UserRole.SALES_AGENT, ROLES_SEE_ALL_ORDER_ROWS)).toBe(false);
  });

  it('admin routes and user management: ADMIN only', () => {
    for (const list of [ROLES_CAN_ACCESS_ADMIN_ROUTES, ROLES_CAN_MANAGE_USERS]) {
      expect(roleCan(UserRole.ADMIN, list)).toBe(true);
      expect(roleCan(UserRole.SALES_AGENT, list)).toBe(false);
      expect(roleCan(UserRole.PRODUCTION, list)).toBe(false);
      expect(roleCan(UserRole.SHIPPING, list)).toBe(false);
    }
  });

  it('dashboard / reports scoping', () => {
    expect(roleCan(UserRole.ADMIN, ROLES_SEE_ALL_DASHBOARD_DATA)).toBe(true);
    expect(roleCan(UserRole.PRODUCTION, ROLES_SEE_ALL_DASHBOARD_DATA)).toBe(false);
    expect(roleCan(UserRole.ADMIN, ROLES_SEE_ALL_REPORT_DATA)).toBe(true);
    expect(roleCan(UserRole.PRODUCTION, ROLES_SEE_ALL_REPORT_DATA)).toBe(true);
    expect(roleCan(UserRole.SALES_AGENT, ROLES_SEE_ALL_REPORT_DATA)).toBe(false);
  });
});
