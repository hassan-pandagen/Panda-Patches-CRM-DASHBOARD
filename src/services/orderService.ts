// src/services/orderService.ts - COMPLETE FIXED VERSION
import { supabase } from './supabaseClient';
import { deleteFile, uploadFile } from './storageService';
import { Order, OrderStatus, OrderSummary, EmailTemplate, OrderHistoryEntry, SalesReport } from '../types/index';
import {
  SUPABASE_URL, // Keep this if used elsewhere, otherwise remove
  CRM_BASE_URL
} from '../constants';

// --- NEW: Type definitions added to resolve errors ---
export interface ProfitLossReport {
  total_revenue: number;
  total_costs: number;
  net_profit: number;
  profit_margin: number;
  costs_by_category: Record<string, number>;
}

export interface OrderCommunication {
  id: number;
  order_id: number;
  user_id: string | null;
  user_email: string | null;
  recipient_email: string;
  subject: string | null;
  body: string | null;
  template_id: string | null;
  visibility: 'INTERNAL' | 'PUBLIC';
  sent_at: string;
}

// -----------------------------------------------------------------------------
// Constants - FIXED: Removed problematic relationship
// -----------------------------------------------------------------------------
const ORDER_SUMMARY_SELECT_QUERY =
  'id, status, created_by, orderNumber:order_number, customerName:customer_name, customerEmail:customer_email, customerPhone:customer_phone, designName:design_name, patchesQuantity:patches_quantity, salesAgent:sales_agent, orderAmount:order_amount, amountRemaining:amount_remaining, createdAt:created_at, updatedAt:updated_at, is_urgent, is_urgent_approved';

export const ORDER_DETAILS_SELECT_QUERY =
  'id, status, instructions, packing, courier, orderNumber:order_number, customerName:customer_name, customerEmail:customer_email, customerPhone:customer_phone, shippingAddress:shipping_address, designName:design_name, designSize:design_size, designBacking:design_backing, patchesType:patches_type, patchesQuantity:patches_quantity, revisionNotes:revision_notes, customerAttachmentURLs:customer_attachment_urls, mockupURLs:mockup_urls, redoNotes:redo_notes, redoAttachments:redo_attachments, trackingNumber:tracking_number, orderAmount:order_amount, amountPaid:amount_paid, amountRemaining:amount_remaining, production_cost, shipping_cost, marketing_cost, profit, salesAgent:sales_agent, createdAt:created_at, updatedAt:updated_at, is_urgent, is_urgent_approved, leadSource:lead_source, customerProfileUrl:customer_profile_url, shippingAttachmentURLs:shipping_attachment_urls, production_file_urls, created_by';

// -----------------------------------------------------------------------------
// Orders CRUD
// -----------------------------------------------------------------------------
export type CreateOrderData = Omit<
  Order,
  'id' | 'orderNumber' | 'createdAt' | 'updatedAt' | 'status' | 'amountRemaining' | 'profit' | 'created_by' | 'production_file_urls'
>;

export const getOrders = async (): Promise<OrderSummary[]> => {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SUMMARY_SELECT_QUERY)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data as OrderSummary[]) ?? [];
};

export const fetchOrdersBetween = async (startIso: string, endIso: string): Promise<Order[]> => {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_DETAILS_SELECT_QUERY)
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as Order[]) ?? [];
};

export const searchOrders = async (query: string): Promise<OrderSummary[]> => {
  const searchString = `%${query}%`;
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SUMMARY_SELECT_QUERY)
    .or(
      `order_number.ilike.${searchString},` +
      `customer_name.ilike.${searchString},` +
      `customer_email.ilike.${searchString},` +
      `customer_phone.ilike.${searchString}`
    )
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as OrderSummary[]) ?? [];
};

export const getOrdersByCustomer = async (email: string, phone: string | null): Promise<Order[]> => {
  const hasEmail = email && email.includes('@');
  const hasPhone = phone && phone.length > 5;
  const filters: string[] = [];
  if (hasEmail) filters.push(`customer_email.eq.${email}`);
  if (hasPhone) filters.push(`customer_phone.eq.${phone}`);
  
  // If there are no valid filters, return an empty array without hitting the database.
  if (filters.length === 0) {
    return [];
  }
  
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_DETAILS_SELECT_QUERY) // --- FIX: Fetch full order details ---
    .or(filters.join(','))
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as Order[]) ?? [];
};

export const getOrder = async (orderNumber: string): Promise<Order | undefined> => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_DETAILS_SELECT_QUERY)
      .eq('order_number', orderNumber)
      .single();
    if (error) throw error;
    return (data as Order) ?? undefined;
  } catch (error: any) {
    if (error.message.includes('not found')) return undefined;
    console.error(`Error fetching order ${orderNumber}:`, error);
    throw error;
  }
};

export const createOrder = async (formData: CreateOrderData): Promise<Order> => {
  const newOrderNumber = `PP-${Date.now()}`;
  const newOrder: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'created_by' | 'profit'> & { production_file_urls: string[] } = {
    ...formData,
    orderNumber: newOrderNumber,
    status: OrderStatus.NEW_ORDER,
    amountRemaining: formData.orderAmount - formData.amountPaid,
    customerAttachmentURLs: formData.customerAttachmentURLs ?? [],
    mockupURLs: formData.mockupURLs ?? [],
    redoAttachments: formData.redoAttachments ?? [],
    production_file_urls: [], // Always empty on creation
    shippingAttachmentURLs: formData.shippingAttachmentURLs ?? [],
  };

  const dbPayload = {
    order_number: newOrder.orderNumber,
    customer_name: newOrder.customerName,
    customer_email: newOrder.customerEmail,
    customer_phone: newOrder.customerPhone ?? null,
    is_urgent_approved: false, // Always false on creation
    customer_profile_url: newOrder.customerProfileUrl ?? null,
    is_urgent: newOrder.is_urgent,
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
    production_file_urls: newOrder.production_file_urls, // Will be empty
    redo_attachments: newOrder.redoAttachments ?? null,
    shipping_attachment_urls: newOrder.shippingAttachmentURLs ?? null,
    instructions: newOrder.instructions ?? null,
    packing: newOrder.packing ?? null,
    tracking_number: newOrder.trackingNumber ?? null,
    courier: newOrder.courier ?? null,
    order_amount: newOrder.orderAmount,
    amount_paid: newOrder.amountPaid,
    production_cost: newOrder.production_cost,
    shipping_cost: newOrder.shipping_cost,
    marketing_cost: newOrder.marketing_cost,
    sales_agent: newOrder.salesAgent,
    status: newOrder.status as string,
  };
  
  const { data: createdOrder, error } = await supabase
    .from('orders')
    .insert(dbPayload)
    .select(ORDER_DETAILS_SELECT_QUERY)
    .single();

  if (error) throw error;
  if (!createdOrder) throw new Error('Failed to create order.');

  try {
    await sendNewOrderNotifications(createdOrder as Order, createdOrder.created_by, createdOrder.salesAgent);
  } catch (e: any) {
    console.error('sendNewOrderNotifications failed but order was saved:', e);
  }

  return createdOrder as Order;
};

export const updateOrder = async (updatedOrder: Order): Promise<Order> => {
  const { id, createdAt, updatedAt, created_by, amountRemaining, profit, ...updatePayload } = updatedOrder;

  // Manually map application-level camelCase fields to database snake_case fields.
  const dbPayload = {
    order_number: updatePayload.orderNumber,
    customer_name: updatePayload.customerName,
    customer_email: updatePayload.customerEmail,
    customer_phone: updatePayload.customerPhone ?? null,
    customer_profile_url: updatePayload.customerProfileUrl ?? null,
    is_urgent_approved: updatePayload.is_urgent_approved,
    is_urgent: updatePayload.is_urgent,
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
    production_file_urls: updatePayload.production_file_urls ?? [],
    redo_attachments: updatePayload.redoAttachments ?? null,
    shipping_attachment_urls: updatePayload.shippingAttachmentURLs ?? null,
    instructions: updatePayload.instructions ?? null,
    packing: updatePayload.packing ?? null,
    tracking_number: updatePayload.trackingNumber ?? null,
    courier: updatePayload.courier ?? null,
    order_amount: updatePayload.orderAmount,
    amount_paid: updatePayload.amountPaid,
    production_cost: updatePayload.production_cost,
    shipping_cost: updatePayload.shipping_cost,
    marketing_cost: updatePayload.marketing_cost,
    sales_agent: updatePayload.salesAgent,
    status: updatePayload.status as string,
  };

  const { data, error } = await supabase
    .from('orders')
    .update(dbPayload)
    .eq('id', id)
    .select(ORDER_DETAILS_SELECT_QUERY)
    .single();

  if (error) throw error;

  // After successful update, trigger notification
  try {
    // --- FIX: Get the current user's ID and email for logging ---
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await triggerNotificationWorkflow(data as Order, user.id, user.email);
    }
  } catch (e: any) {
    console.warn('Notification trigger failed but order updated:', e);
  }
  return data as Order;
};

export const deleteOrder = async (orderId: number): Promise<void> => {
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('customer_attachment_urls, mockup_urls, redo_attachments, shipping_attachment_urls')
    .eq('id', orderId)
    .single();

  if (fetchError) {
    // If order is not found, it might have been already deleted.
    // Log a warning but don't throw an error.
    if (fetchError.code === 'PGRST116') {
      console.warn(`Order with ID ${orderId} not found for deletion. It may have already been deleted.`);
      return;
    }
    throw new Error('Could not retrieve order details.');
  }

  // If order data is successfully fetched, proceed to delete associated files.
  if (order) {
    const filesToDelete = [
      ...(order.customer_attachment_urls || []),
      ...(order.mockup_urls || []),
      ...(order.redo_attachments || []),
      ...(order.shipping_attachment_urls || []),
    ];

    if (filesToDelete.length > 0) {
      const results = await Promise.allSettled(filesToDelete.map(deleteFile));
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          console.error(`Failed to delete file: ${filesToDelete[i]}`, result.reason);
        }
      });
    }
  }

  const { error: delError } = await supabase
    .from('orders')
    .delete()
    .eq('id', orderId);

  if (delError) throw delError;
};

// -----------------------------------------------------------------------------
// Notification Workflow
// -----------------------------------------------------------------------------
const getTrackingLink = (courier?: string, trackingNumber?: string): string => {
  if (!courier || !trackingNumber) return '';
  const tn = encodeURIComponent(trackingNumber);
  switch (courier.toLowerCase()) {
    case 'fedex': return `https://www.fedex.com/fedextrack/?trknbr=${tn}`;
    case 'dhl': return `https://www.dhl.com/en/express/tracking.html?AWB=${tn}`;
    case 'ups': return `https://www.ups.com/track?tracknum=${tn}`;
    default: return `https://www.google.com/search?q=${encodeURIComponent(courier)}+tracking+${tn}`;
  }
};

/**
 * Sends the initial "New Order" notifications when an order is first created.
 */
const sendNewOrderNotifications = async (
  order: Order,
  initiatorUserId: string | null,
  initiatorUserEmail: string | null
) => {
  const productionEmail = 'riseandthrive2024@gmail.com';

  try {
    await sendEmailNotification('NEW_ORDER_CUSTOMER', order, order.customerEmail, order.customerName, initiatorUserId, initiatorUserEmail);
  } catch (e) { console.error('Failed to send NEW_ORDER_CUSTOMER email:', e); }
  try {
    await sendEmailNotification('NEW_ORDER_PRODUCTION', order, productionEmail, 'Production Team', initiatorUserId, initiatorUserEmail);
  } catch (e) { console.error('Failed to send NEW_ORDER_PRODUCTION email:', e); }
};

/**
 * Sends an email notification via SendGrid and logs the communication to Supabase.
 */
const sendEmailNotification = async (
  templateStatus: string,
  order: Order,
  recipientEmail: string,
  recipientName: string,
  initiatorUserId: string | null,
  initiatorUserEmail: string | null
) => {
  const { data: templateConfig, error: fetchError } = await supabase
    .from('email_templates')
    .select('*')
    .eq('status', templateStatus)
    .single();

  if (fetchError || !templateConfig) {
    console.warn(`No email template configured in database for status: ${templateStatus}`);
    return;
  } 

  const { template_id, subject } = templateConfig;

  // --- NEW: Conditionally add payment details if there's a remaining balance ---
  let paymentDetailsHtml = '';
  if (order.amountRemaining > 0) {
    paymentDetailsHtml = `
      <p style="font-size: 14px; color: #E5E7EB; background-color: #374151; padding: 12px; border-radius: 8px; border: 1px solid #4B5563;">
        <strong>Outstanding Balance:</strong> $${order.amountRemaining.toFixed(2)}<br>
        Please contact us to complete your payment.
      </p>
    `;
  }

  const dynamicTemplateData = {
    ...order,
    orderLink: `${CRM_BASE_URL}/order/${order.orderNumber}`,
    trackingLink: getTrackingLink(order.courier, order.trackingNumber),
    mockupImageHtmlBlock: (order.mockupURLs || []).map(url => `<img src="${url}" style="max-width:100%;" />`).join(''),
    payment_details_html: paymentDetailsHtml, // Add the new field here
  }; 

  const sendgridPayload = {
    from: {
      email: 'hello@pandapatches.com', // Your verified sender email
      name: 'Panda Patches',
    },
    personalizations: [{
      to: [{ email: recipientEmail, name: recipientName }],
      dynamic_template_data: dynamicTemplateData,
      bcc: [{ email: 'hello@pandapatches.com' }], // Always BCC yourself for records 
    }],
    template_id: template_id,
    subject: subject, // --- FIX: Add the subject line to the payload ---
    reply_to: { email: 'hello@pandapatches.com', name: 'Panda Patches' }, // Ensure replies go to your main inbox 
  };

  // --- Send email via Supabase Edge Function ---
  console.log("ATTEMPTING TO INVOKE FUNCTION WITH PAYLOAD:", sendgridPayload);

  const { data, error: functionError } = await supabase.functions.invoke('send-email', {
    body: { sendgridPayload }, // Wrap the payload as expected by the Edge Function
  });

  if (functionError) {
    console.error(`Supabase function 'send-email' failed for order ${order.orderNumber}, template ${template_id}:`, functionError);
    throw new Error(`Failed to invoke email function: ${functionError.message}`);
  }

  // --- Log communication in Supabase ---
  try {
    const { error: logError } = await supabase.from('order_communications').insert({
      order_id: order.id,
      recipient_email: recipientEmail,
      subject: subject,
      body: JSON.stringify(dynamicTemplateData), // Store dynamic data for context
      template_id: template_id,
      visibility: templateConfig.visibility as 'INTERNAL' | 'PUBLIC', // Use visibility from fetched template
      user_id: initiatorUserId,
      user_email: initiatorUserEmail,
    });

    if (logError) {
      console.error('Failed to log communication to database:', logError);
    }
  } catch (logError: any) {
    console.error('Error logging communication:', logError.message);
  }
};

export const triggerNotificationWorkflow = async (
  order: Order,
  initiatorUserId: string | null = null,
  initiatorUserEmail: string | null = null
): Promise<void> => {
  // Define production and sales rep emails (you can move these to a config file later)
  const productionEmail = 'riseandthrive2024@gmail.com'; // Updated production email
  const salesRepEmail = order.salesAgent;

  switch (order.status) {
    case OrderStatus.NEW_ORDER:
      break;
    case OrderStatus.AWAITING_CUSTOMER_APPROVAL:
      try {
        await sendEmailNotification('AWAITING_CUSTOMER_APPROVAL', order, order.customerEmail, order.customerName, initiatorUserId, initiatorUserEmail);
      } catch (e) { console.error('Failed to send AWAITING_CUSTOMER_APPROVAL email:', e); }
      break;
    case OrderStatus.APPROVED:
      try {
        await sendEmailNotification('APPROVED_CUSTOMER', order, order.customerEmail, order.customerName, initiatorUserId, initiatorUserEmail);
      } catch (e) { console.error('Failed to send APPROVED_CUSTOMER email:', e); }
      try {
        await sendEmailNotification('APPROVED_PRODUCTION', order, productionEmail, 'Production Team', initiatorUserId, initiatorUserEmail);
      } catch (e) { console.error('Failed to send APPROVED_PRODUCTION email:', e); }
      try {
        await sendEmailNotification('APPROVED_SALES_REP', order, salesRepEmail, 'Sales Rep', initiatorUserId, initiatorUserEmail);
      } catch (e) { console.error('Failed to send APPROVED_SALES_REP email:', e); }
      break;
    case OrderStatus.IN_PRODUCTION:
      try {
        await sendEmailNotification('IN_PRODUCTION_CUSTOMER', order, order.customerEmail, order.customerName, initiatorUserId, initiatorUserEmail);
      } catch (e) { console.error('Failed to send IN_PRODUCTION_CUSTOMER email:', e); }
      // This is where you could trigger the "Start Production" email if needed,
      // but it might be better to have a separate status for that.
      break;
    case OrderStatus.COMPLETED:
      try {
        await sendEmailNotification('COMPLETED_SALES_REP', order, salesRepEmail, 'Sales Rep', initiatorUserId, initiatorUserEmail);
      } catch (e) { console.error('Failed to send COMPLETED_SALES_REP email:', e); }
      break;
    case OrderStatus.SHIPPED:
      try {
        await sendEmailNotification('SHIPPED_CUSTOMER', order, order.customerEmail, order.customerName, initiatorUserId, initiatorUserEmail);
      } catch (e) { console.error('Failed to send SHIPPED_CUSTOMER email:', e); }
      break;
    case OrderStatus.DELIVERED:
      await sendEmailNotification('DELIVERED_CUSTOMER', order, order.customerEmail, order.customerName, initiatorUserId, initiatorUserEmail);
      break;
    case OrderStatus.SEND_FEEDBACK_EMAIL:
      // This status is a trigger to send the feedback email.
      // The actual email template is 'SEND_FEEDBACK_EMAIL'.
      try {
        await sendEmailNotification('SEND_FEEDBACK_EMAIL', order, order.customerEmail, order.customerName, initiatorUserId, initiatorUserEmail);
      } catch (e) { console.error('Failed to send SEND_FEEDBACK_EMAIL email:', e); }
      break;
    default:
      console.log(`No specific multi-email workflow for status: ${order.status}`);
      // You can add a default single-email behavior here if needed.
      break;
  }
};

export const getOrderCommunications = async (orderId: number): Promise<OrderCommunication[]> => {
  try {
    const { data, error } = await supabase
      .from('order_communications')
      .select('*')
      .eq('order_id', orderId)
      .order('sent_at', { ascending: false });

    if (error) throw error;

    return data ?? [];
  } catch (e: any) {
    console.error('Error fetching order communications:', e);
    return [];
  }
};

// -----------------------------------------------------------------------------
// History & Reports
// -----------------------------------------------------------------------------
export const getOrderHistory = async (orderId: number): Promise<OrderHistoryEntry[]> => {
  try {
    const { data, error } = await supabase
      .from('order_history')
      .select('*')
      .eq('order_id', orderId)
      .order('changed_at', { ascending: false });

    if (error) throw error;

    return data ?? [];
  } catch (e: any) {
    if (e.message.includes('not found')) return [];
    throw e;
  }
};

export const getSalesReport = async (startDate: string, endDate: string): Promise<SalesReport> => {
  const { data, error } = await supabase.rpc('get_sales_report', {
    start_date: startDate,
    end_date: endDate,
  });

  if (error) throw error;
  return data[0] as SalesReport;
};

export const getProfitLossReport = async (startDate: string, endDate: string): Promise<ProfitLossReport> => {
  const { data, error } = await supabase.rpc('get_profit_loss_report', {
    start_date: startDate,
    end_date: endDate,
  });

  if (error) throw error;
  // RPC returns an array, we expect a single result object
  return data[0] as ProfitLossReport;
};