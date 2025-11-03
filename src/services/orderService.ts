// src/services/ordersService.ts

import { supabase } from './supabaseClient';
import { Database } from '../types/supabase';
import { deleteFile } from './storageService';
import {
  Order,
  OrderStatus,
  OrderSummary,
  OrderHistoryEntry,
  SalesReport,
} from '../types/index';
import { 
  N8N_WEBHOOK_URL,
  N8N_APPROVAL_WEBHOOK_URL,
  CRM_BASE_URL,
} from '../constants';

// -----------------------------------------------------------------------------
// Constants & Config
// -----------------------------------------------------------------------------
const SUPABASE_TIMEOUT = 60000; // 60 seconds

const ORDER_SUMMARY_SELECT_QUERY =
  'id, status, created_by, orderNumber:order_number, customerName:customer_name, designName:design_name, patchesQuantity:patches_quantity, salesAgent:sales_agent, orderAmount:order_amount, amountRemaining:amount_remaining, createdAt:created_at, updatedAt:updated_at, is_urgent, is_urgent_approved';

const ORDER_DETAILS_SELECT_QUERY =
  'id, status, instructions, packing, courier, created_by, orderNumber:order_number, customerName:customer_name, customerEmail:customer_email, customerPhone:customer_phone, shippingAddress:shipping_address, designName:design_name, designSize:design_size, designBacking:design_backing, patchesType:patches_type, patchesQuantity:patches_quantity, revisionNotes:revision_notes, customerAttachmentURLs:customer_attachment_urls, mockupURLs:mockup_urls, redoNotes:redo_notes, redoAttachments:redo_attachments, trackingNumber:tracking_number, orderAmount:order_amount, amountPaid:amount_paid, amountRemaining:amount_remaining, salesAgent:sales_agent, createdAt:created_at, updatedAt:updated_at, is_urgent, is_urgent_approved';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const createTimeoutSignal = (timeoutMs: number = SUPABASE_TIMEOUT) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
};

const withTimeout = async <T>(
  query: (signal: AbortSignal) => Promise<{ data: T | null; error: any }>
): Promise<T> => {
  const { signal, cleanup } = createTimeoutSignal();
  try {
    const { data, error } = await query(signal);
    if (error) {
      if (error.message?.includes('AbortError')) {
        throw new Error('Request timed out. Please check your connection.');
      }
      throw error;
    }
    // Allow null data to pass through, as an empty array is valid.
    if (data === null) return [] as T;
    return data;
  } finally {
    cleanup();
  }
};

// -----------------------------------------------------------------------------
// Orders CRUD
// -----------------------------------------------------------------------------
export type CreateOrderData = Omit<
  Order,
  | 'id'
  | 'orderNumber'
  | 'createdAt'
  | 'updatedAt'
  | 'status'
  | 'amountRemaining'
  | 'created_by'
>;

// Define a type for the database 'orders' table for type-safe payloads
type OrderDatabasePayload = Database['public']['Tables']['orders']['Row'];

export const getOrders = async (): Promise<OrderSummary[]> => {
  const query = supabase
      .from('orders')
      .select(ORDER_SUMMARY_SELECT_QUERY)
      .order('updated_at', { ascending: false });

  const data = await withTimeout<any[]>(async (signal) => query);
  return data as OrderSummary[];
};

export const searchOrders = async (query: string): Promise<OrderSummary[]> => {
  const searchString = `%${query}%`;
  
  const queryBuilder = supabase
      .from('orders')
      .select(ORDER_SUMMARY_SELECT_QUERY)
      .or(
        `order_number.ilike.${searchString},` +
        `customer_name.ilike.${searchString},` +
        `customer_email.ilike.${searchString},` +
        `customer_phone.ilike.${searchString}`
      )
      .order('created_at', { ascending: false });

  // We fetch as `any[]` and then cast to `OrderSummary[]`.
  // This is a safe and common pattern when the database schema (snake_case)
  // is mapped to a different application schema (camelCase) via the select query.
  const data = await withTimeout<any[]>(async (signal) => queryBuilder);
  return data as OrderSummary[];
};

export const getOrdersByCustomer = async (email: string, phone: string): Promise<OrderSummary[]> => {
  // Only search if at least one identifier is present and valid.
  const hasEmail = email && email.includes('@');
  const hasPhone = phone && phone.length > 5; // Basic validation for phone number length
  if (!hasEmail && !hasPhone) return [];

  const filters = [];
  if (hasEmail) filters.push(`customer_email.eq.${email}`);
  if (hasPhone) filters.push(`customer_phone.eq.${phone}`);

  const query = supabase
    .from('orders')
    .select(ORDER_SUMMARY_SELECT_QUERY)
    .or(filters.join(','))
    .order('created_at', { ascending: false });

  const data = await withTimeout<any[]>(async (signal) => query);
  return data as OrderSummary[];
};

export const getOrder = async (orderNumber: string): Promise<Order | undefined> => {
  try {
    return await withTimeout<Order>(async (signal) =>
      supabase
        .from('orders')
        .select(ORDER_DETAILS_SELECT_QUERY)
        .eq('order_number', orderNumber)
        .single()
    );
  } catch (error: any) {
    if (error.message.includes('not found')) return undefined;
    console.error(`Error fetching order ${orderNumber}:`, error);
    throw error;
  }
};

export const createOrder = async (formData: CreateOrderData): Promise<Order> => {
  const newOrderNumber = `PP-${Date.now()}`;

  const newOrder: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'created_by'> = {
    ...formData,
    orderNumber: newOrderNumber,
    status: OrderStatus.NEW_ORDER,
    amountRemaining: formData.orderAmount - formData.amountPaid,
    customerAttachmentURLs: formData.customerAttachmentURLs ?? [],
    mockupURLs: formData.mockupURLs ?? [],
    redoAttachments: formData.redoAttachments ?? [],
  };

  const dbPayload: Omit<OrderDatabasePayload, 'id' | 'created_at' | 'updated_at' | 'amount_remaining' | 'created_by'> = {
    order_number: newOrder.orderNumber,
    customer_name: newOrder.customerName,
    customer_email: newOrder.customerEmail,
    customer_phone: newOrder.customerPhone ?? null,
    customer_profile_url: newOrder.customerProfileUrl ?? null,
    is_urgent: newOrder.is_urgent,
    is_urgent_approved: false, // Always default to false on creation
    lead_source: newOrder.leadSource ?? null,
    shipping_address: newOrder.shippingAddress ?? null,
    design_name: newOrder.designName,
    design_size: newOrder.designSize ?? null,
    design_backing: newOrder.designBacking ?? null,
    patches_type: newOrder.patchesType ?? null,
    patches_quantity: newOrder.patchesQuantity,
    revision_notes: newOrder.revisionNotes ?? null,
    customer_attachment_urls: newOrder.customerAttachmentURLs ?? null,
    mockup_urls: newOrder.mockupURLs ?? null,
    redo_notes: newOrder.redoNotes ?? null,
    redo_attachments: newOrder.redoAttachments ?? null,
    instructions: newOrder.instructions ?? null,
    packing: newOrder.packing ?? null,
    tracking_number: newOrder.trackingNumber ?? null,
    courier: newOrder.courier ?? null,
    order_amount: newOrder.orderAmount,
    amount_paid: newOrder.amountPaid,
    sales_agent: newOrder.salesAgent,
    status: newOrder.status as string,
  };

  const createdOrder = await withTimeout<Order>(async (signal) =>
    supabase
      .from('orders')
      .insert(dbPayload)
      .select(ORDER_DETAILS_SELECT_QUERY)
      .single()
  );

  try {
    await triggerNotificationWorkflow(createdOrder);
  } catch (e: any) {
    console.warn('Webhook trigger failed but order saved:', e);
  }

  return createdOrder;
};

export const updateOrder = async (updatedOrder: Order): Promise<Order> => {
  const orderDataToUpdate = {
    ...updatedOrder,
    amountRemaining: updatedOrder.orderAmount - updatedOrder.amountPaid,
  };

  // Destructure created_by as well to exclude it from the update payload
  const { id, createdAt, updatedAt, created_by, ...updatePayload } = orderDataToUpdate;

  // Explicitly type the payload to match the database schema
  const dbPayload: Omit<OrderDatabasePayload, 'id' | 'created_at' | 'updated_at' | 'amount_remaining' | 'created_by'> = {
    order_number: updatePayload.orderNumber,
    customer_name: updatePayload.customerName,
    customer_email: updatePayload.customerEmail,
    customer_phone: updatePayload.customerPhone ?? null,
    customer_profile_url: updatePayload.customerProfileUrl ?? null,
    is_urgent: updatePayload.is_urgent,
    is_urgent_approved: updatePayload.is_urgent_approved,
    lead_source: updatePayload.leadSource ?? null,
    shipping_address: updatePayload.shippingAddress ?? null,
    design_name: updatePayload.designName,
    design_size: updatePayload.designSize ?? null,
    design_backing: updatePayload.designBacking ?? null,
    patches_type: updatePayload.patchesType ?? null,
    patches_quantity: updatePayload.patchesQuantity,
    revision_notes: updatePayload.revisionNotes ?? null,
    customer_attachment_urls: updatePayload.customerAttachmentURLs ?? null,
    mockup_urls: updatePayload.mockupURLs ?? null,
    redo_notes: updatePayload.redoNotes ?? null,
    redo_attachments: updatePayload.redoAttachments ?? null,
    instructions: updatePayload.instructions ?? null,
    packing: updatePayload.packing ?? null,
    tracking_number: updatePayload.trackingNumber ?? null,
    courier: updatePayload.courier ?? null,
    order_amount: updatePayload.orderAmount,
    amount_paid: updatePayload.amountPaid,
    sales_agent: updatePayload.salesAgent,
    status: updatePayload.status as string,
  };

  return withTimeout<Order>(async (signal) =>
    supabase
      .from('orders')
      .update(dbPayload)
      .eq('id', id)
      .select(ORDER_DETAILS_SELECT_QUERY)
      .single()
  );
};

export const deleteOrder = async (orderId: number): Promise<void> => {
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('customer_attachment_urls, mockup_urls, redo_attachments')
    .eq('id', orderId)
    .single();

  if (fetchError) {
    // If the order doesn't exist, there's nothing to clean up or delete.
    if (fetchError.code === 'PGRST116') { // PGRST116: "Not found"
      console.warn(`Order ${orderId} not found for deletion. Nothing to do.`);
      return;
    }
    throw new Error('Could not retrieve order details for cleanup.');
  }

  const filesToDelete = [
    ...(order.customer_attachment_urls || []),
    ...(order.mockup_urls || []),
    ...(order.redo_attachments || []),
  ];

  if (filesToDelete.length > 0) {
    const results = await Promise.allSettled(filesToDelete.map(deleteFile));
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.warn(`File delete failed: ${filesToDelete[i]}`);
    });
  }

  const { data: deleted, error: delError } = await supabase
    .from('orders')
    .delete()
    .eq('id', orderId)
    .select();

  if (delError) throw delError;
  if (!deleted || deleted.length === 0)
    throw new Error(
      'Delete failed due to Supabase RLS policy. Please add a DELETE policy in Supabase.'
    );

  console.log(`Order ${orderId} deleted successfully.`);
};

// -----------------------------------------------------------------------------
// Notification Workflow (n8n)
// -----------------------------------------------------------------------------
const getTrackingLink = (courier?: string, trackingNumber?: string): string => {
  if (!courier || !trackingNumber) return '';
  const tn = encodeURIComponent(trackingNumber);
  switch (courier.toLowerCase()) {
    case 'fedex':
      return `https://www.fedex.com/fedextrack/?trknbr=${tn}`;
    case 'dhl':
      return `https://www.dhl.com/en/express/tracking.html?AWB=${tn}`;
    case 'ups':
      return `https://www.ups.com/track?tracknum=${tn}`;
    default:
      return `https://www.google.com/search?q=${encodeURIComponent(courier)}+tracking+${tn}`;
  }
};

export const triggerNotificationWorkflow = async (order: Order): Promise<void> => {
  if (!N8N_WEBHOOK_URL || N8N_WEBHOOK_URL === 'YOUR_N8N_WEBHOOK_URL_HERE') {
    console.warn('n8n webhook URL not configured.');
    throw new Error('Webhook URL not configured.');
  }

  const orderLink = `${CRM_BASE_URL}/#/order/${order.orderNumber}`;

  const customerImageHtml = (order.customerAttachmentURLs || [])
    .map(
      (url) =>
        `<img src="${url}" style="max-width:100%;max-height:300px;border:1px solid #ccc;border-radius:5px;margin-bottom:10px;"/>`
    )
    .join('');

  const mockupImageHtml = (order.mockupURLs || [])
    .map(
      (url) =>
        `<img src="${url}" style="max-width:100%;max-height:400px;border:1px solid #ccc;border-radius:5px;margin-bottom:10px;"/>`
    )
    .join('');

  const { status, ...rest } = order;
  const payload: any = {
    ...rest,
    Status: status,
    orderLink,
    imageHtmlBlock: customerImageHtml,
    mockupImageHtmlBlock: mockupImageHtml,
  };

  if (status === OrderStatus.AWAITING_CUSTOMER_APPROVAL) {
    const approvalBase = (N8N_APPROVAL_WEBHOOK_URL || '').split('?')[0];
    payload.approveUrl = `${approvalBase}?action=approve&orderNumber=${order.orderNumber}`;
    payload.requestRevisionUrl = `${approvalBase}?action=revise&orderNumber=${order.orderNumber}`;
  }

  if (order.courier && order.trackingNumber)
    payload.trackingLink = getTrackingLink(order.courier, order.trackingNumber);

  const response = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`n8n webhook failed: ${response.status} - ${text}`);
  }

  console.log('n8n notification sent for order:', order.orderNumber);
};

// -----------------------------------------------------------------------------
// History & Reports
// -----------------------------------------------------------------------------
export const getOrderHistory = async (orderId: number): Promise<OrderHistoryEntry[]> => {
    try {
    return withTimeout<OrderHistoryEntry[]>(async (signal) =>
      supabase
        .from('order_history')
        .select('*')
        .eq('order_id', orderId)
        .order('changed_at', { ascending: false })
    );
    } catch (e: any) {
    if (e.message.includes('not found')) return [];
    throw e;
  }
};

export const getSalesReport = async (
  startDate: string,
  endDate: string
): Promise<SalesReport> => {
  const { data, error } = await supabase.rpc('get_sales_report', {
    start_date: startDate,
    end_date: endDate,
  });

  if (error) throw error;
  return data[0] as SalesReport;
};
