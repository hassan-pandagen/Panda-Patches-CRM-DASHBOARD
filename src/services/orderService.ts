// src/services/orderService.ts

import { supabase } from './supabaseClient';
import { queryClient } from './queryClient';
import { queryKeys } from '../constants/queryKeys';
import { Order, OrderStatus } from '../types/index';
import { logger } from './logger';
import { performanceMonitor } from './performanceMonitor';
import { validateData, orderSchema } from './validation';

/**
 * Safely converts an object key from camelCase to snake_case.
 * Handles null/undefined values without crashing.
 */

/**
 * A generic, automated adapter to convert a camelCase object to a snake_case object
 * suitable for a Supabase database payload.
 * @param data The camelCase object from the frontend.
 * @returns A new object with snake_case keys.
 */
const toSnakeCase = (data: any): any => {
  // These fields are computed or managed by the database and should never be sent in an update.
  if (!data || typeof data !== 'object') return {};

  const readOnlyFields = new Set([
    'id', 'orderNumber', 'createdAt', 'updatedAt', 'createdBy', 'profit', 'amountRemaining', 'changes'
  ]);

  const snakeCaseObject: { [key: string]: any } = {};

  for (const key in data) { // Ensure the key belongs to the object and is not a read-only field.
    if (Object.prototype.hasOwnProperty.call(data, key) && !readOnlyFields.has(key)) {
      const value = data[key];
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      // ✅ FIX: Ensure undefined values are converted to null for the DB
      snakeCaseObject[snakeKey] = value === undefined ? null : value;
    }
  }

  // Ensure arrays are arrays, not null
  const arrayFields = ['mockupUrls', 'productionFileUrls', 'shippingAttachmentUrls', 'customerAttachmentUrls', 'redoAttachments'];
  arrayFields.forEach(field => {
    // Only process if the frontend actually sent this field
    if (data[field] !== undefined) {
      const snakeKey = field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      snakeCaseObject[snakeKey] = Array.isArray(data[field]) ? data[field] : [];
    }
  });

  return snakeCaseObject;
};

// ... (KEEP YOUR SENDGRID_TEMPLATES AND EMAIL CONSTANTS EXACTLY AS THEY ARE) ...
const SENDGRID_TEMPLATES = {
  // --- NEW ORDERS ---
  CUSTOMER_NEW_ORDER: 'd-fcd19c2e3d2d42a4b0e1bf3087179c7d',
  INTERNAL_NEW_ORDER: 'd-c74e2abd9bb54b79b994aa53b654c374',

  // --- DESIGN PROCESS ---
  CUSTOMER_MOCKUP_READY: 'd-cd4d1a58a70d457ebd254d93e09ded5b',
  CUSTOMER_REVISION_IN_PROGRESS: 'd-4c34e0002d9a43b091798fde84d36c59',
  INTERNAL_REVISION_REQUESTED: 'd-27bef8642f23433ea5ee8471887c8d61',
  
  // --- PRODUCTION ---
  CUSTOMER_PRODUCTION_START: 'd-0dcf24e7ef3b4195b24ab4dfdf53cde8',
  INTERNAL_QUALITY_ASSURANCE: 'd-70206008ac7c47fbb87585bcc60e59ce',
  INTERNAL_PRODUCTION_START: 'd-0a3e1e4cc4a74b49baf0de6b03823cef',
  
  // --- FULFILLMENT ---
  CUSTOMER_SHIPPED: 'd-30f79e97452342a7a2a42a3237a47479',
  CUSTOMER_DELIVERED: 'd-d0ab08ed143e4a62900c257d63167630', 
  CUSTOMER_FEEDBACK: 'd-563b0533e1d94a1bb830129a440c254b',  
  CUSTOMER_REFUNDED: 'd-8da31b3c8aca485cb82103af044e6ba7',
};

const PRODUCTION_MANAGER_EMAILS = [
  'lilcustomerzdesign@gmail.com',
  'lilcustomize550@gmail.com',
  'pandaproductionoffice@gmail.com'
];


const getFileName = (url: string): string => {
  try {
    return url ? url.split('/').pop()?.split('?')[0] || 'file' : 'file';
  } catch {
    return 'file';
  }
};

const isValidEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

export const mapDbToOrder = (data: any): Order => {
  // If no data is provided, return null to avoid errors downstream.
  if (!data) return null as any;

  // Helper to safely convert values to numbers, defaulting to 0.
  const toNumber = (val: any) => {
    if (val === null || val === undefined || val === '') return 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  };

  // Mapping: Try camelCase (from View) first, fall back to snake_case (from Table).
  // This makes the mapper compatible with BOTH query types.
  const orderAmount = toNumber(data.orderAmount ?? data.order_amount);
  const amountPaid = toNumber(data.amountPaid ?? data.amount_paid);
  const productionCost = toNumber(data.productionCost ?? data.production_cost);
  const shippingCost = toNumber(data.shippingCost ?? data.shipping_cost);
  const marketingCost = toNumber(data.marketingCost ?? data.marketing_cost);
  const patchesQuantity = toNumber(data.patchesQuantity ?? data.patches_quantity);

  return {
    id: data.id,
    orderNumber: data.orderNumber ?? data.order_number,
    customerName: data.customerName ?? data.customer_name,
    customerEmail: data.customerEmail ?? data.customer_email,
    customerPhone: data.customerPhone ?? data.customer_phone,
    customerProfileUrl: data.customerProfileUrl ?? data.customer_profile_url,
    
    shippingAddress: data.shippingAddress ?? data.shipping_address,
    shippingTrackingNumber: data.shippingTrackingNumber ?? data.shipping_tracking_number,
    shippingCarrier: data.shippingCarrier ?? data.shipping_carrier,
    
    designName: data.designName ?? data.design_name,
    patchesType: data.patchesType ?? data.patches_type,
    patchesQuantity: patchesQuantity,
    designSize: data.designSize ?? data.design_size,
    designBacking: data.designBacking ?? data.design_backing,
    instructions: data.instructions,
    
    orderAmount, amountPaid, productionCost, shippingCost, marketingCost,
    profit: orderAmount - productionCost - shippingCost - marketingCost,
    amountRemaining: orderAmount - amountPaid,

    status: data.status,
    reasonCategory: data.reasonCategory ?? data.reason_category,
    reasonDetails: data.reasonDetails ?? data.reason_details,
    isUrgent: data.isUrgent ?? data.is_urgent,
    isUrgentApproved: data.isUrgentApproved ?? data.is_urgent_approved,
    leadSource: data.leadSource ?? data.lead_source,
    salesAgent: data.salesAgent ?? data.sales_agent,
    createdAt: data.createdAt ?? data.created_at,
    updatedAt: data.updatedAt ?? data.updated_at,

    mockupUrls: data.mockupUrls ?? data.mockup_urls ?? [],
    productionFileUrls: data.productionFileUrls ?? data.production_file_urls ?? [],
    shippingAttachmentUrls: data.shippingAttachmentUrls ?? data.shipping_attachment_urls ?? [],
    customerAttachmentUrls: data.customerAttachmentUrls ?? data.customer_attachment_urls ?? [],
    
    revisionNotes: data.revisionNotes ?? data.revision_notes,
    redoNotes: data.redoNotes ?? data.redo_notes
  } as Order;
};

// ... (KEEP prepareEmailData AND triggerStatusEmail EXACTLY AS THEY ARE) ...

export const prepareEmailData = (order: Order, triggerStatus: string) => {
  let allFiles: string[] = [];
  if (triggerStatus === OrderStatus.NEW_ORDER) {
      allFiles = order.customerAttachmentUrls || [];
  } else if (triggerStatus === OrderStatus.REVISION_REQUESTED) {
      allFiles = order.mockupUrls || [];
  } else {
      allFiles = order.mockupUrls || [];
      if (allFiles.length === 0 && order.customerAttachmentUrls?.length > 0) {
          allFiles = order.customerAttachmentUrls;
      }
  }

  const sortedFiles = [...allFiles].reverse();
  const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(url.toLowerCase());
  const winnerUrl = sortedFiles.find(url => isImage(url)) || sortedFiles[0] || "";
  const galleryUrls = sortedFiles.filter(url => url !== winnerUrl);

  const carrier = (order.shippingCarrier || "").toLowerCase();
  const trackingNum = (order.shippingTrackingNumber || "").trim();
  
  let trackingUrl = "#";
  if (trackingNum) {
      if (carrier.includes('fedex')) {
          trackingUrl = `https://www.fedex.com/fedextrack/?trknbr=${trackingNum}`;
      } else if (carrier.includes('dhl')) {
          trackingUrl = `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNum}`;
      } else if (carrier.includes('ups')) {
          trackingUrl = `https://www.ups.com/track?tracknum=${trackingNum}`;
      } else if (carrier.includes('usps')) {
          trackingUrl = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNum}`;
      } else {
          trackingUrl = `https://www.google.com/search?q=${trackingNum}`;
      }
  }

  return {
    winner_file: winnerUrl ? { url: winnerUrl, file_name: getFileName(winnerUrl) } : null,
    gallery_files: galleryUrls.map(url => ({ url, file_name: getFileName(url) })), 
    has_winner: !!winnerUrl,
    has_gallery: galleryUrls.length > 0,

    customer_name: order.customerName || "Valued Customer",
    order_number: order.orderNumber,
    order_date: new Date(order.createdAt).toLocaleDateString(),
    
    design_name: order.designName,
    quantity: order.patchesQuantity,
    patch_type: order.patchesType,
    backing: order.designBacking,
    size: order.designSize,
    instructions: order.instructions || '',
    
    total_price: `$${(order.orderAmount || 0).toLocaleString()}`,
    amount_paid: `$${(order.amountPaid || 0).toLocaleString()}`,
    amount_remaining: `$${((order.orderAmount || 0) - (order.amountPaid || 0)).toLocaleString()}`,
    
    shipping_address: order.shippingAddress,
    carrier: order.shippingCarrier,
    tracking_number: order.shippingTrackingNumber,
    tracking_link: trackingUrl,
    
    order_link: `${window.location.origin}/order/${order.orderNumber}`,
    sales_agent_name: order.salesAgent || "Panda Team"
  };
};

export const triggerStatusEmail = async (order: Order, statusToCheck: string) => {
  console.log(`📧 [Email Service] triggerStatusEmail called with status: ${statusToCheck}, customer: ${order.customerEmail}`);
  
  if (!order.customerEmail || !isValidEmail(order.customerEmail)) {
    console.warn(`❌ [Email Service] Invalid email: ${order.customerEmail}`);
    logger.warn(`[Email Service] Skipping email trigger - invalid customer email: ${order.customerEmail}`);
    return;
  }

  const emailData = prepareEmailData(order, statusToCheck);
  const requests: { to: string; template_id: string }[] = [];

  console.log(`📧 [Email Service] Triggering emails for status: ${statusToCheck}`);
  logger.info(`[Email Service] Triggering emails for status: ${statusToCheck}`);
  
  switch (statusToCheck) {
    case OrderStatus.NEW_ORDER:
      if (SENDGRID_TEMPLATES.CUSTOMER_NEW_ORDER) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_NEW_ORDER });
      if (SENDGRID_TEMPLATES.INTERNAL_NEW_ORDER) PRODUCTION_MANAGER_EMAILS.forEach(email => requests.push({ to: email, template_id: SENDGRID_TEMPLATES.INTERNAL_NEW_ORDER }));
      break;
    case OrderStatus.AWAITING_APPROVAL:
      if (SENDGRID_TEMPLATES.CUSTOMER_MOCKUP_READY) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_MOCKUP_READY });
      break;
    case OrderStatus.REVISION_REQUESTED:
      if (SENDGRID_TEMPLATES.CUSTOMER_REVISION_IN_PROGRESS) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_REVISION_IN_PROGRESS });
      if (SENDGRID_TEMPLATES.INTERNAL_REVISION_REQUESTED) PRODUCTION_MANAGER_EMAILS.forEach(email => requests.push({ to: email, template_id: SENDGRID_TEMPLATES.INTERNAL_REVISION_REQUESTED }));
      break;
    case OrderStatus.IN_PRODUCTION:
    case OrderStatus.APPROVED:
      if (SENDGRID_TEMPLATES.CUSTOMER_PRODUCTION_START) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_PRODUCTION_START });
      if (SENDGRID_TEMPLATES.INTERNAL_PRODUCTION_START) PRODUCTION_MANAGER_EMAILS.forEach(email => requests.push({ to: email, template_id: SENDGRID_TEMPLATES.INTERNAL_PRODUCTION_START }));
      break;
    case OrderStatus.QUALITY_ASSURANCE:
      if (SENDGRID_TEMPLATES.INTERNAL_QUALITY_ASSURANCE) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.INTERNAL_QUALITY_ASSURANCE });
      break;
    case OrderStatus.SHIPPED:
      if (SENDGRID_TEMPLATES.CUSTOMER_SHIPPED) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_SHIPPED });
      break;
    case OrderStatus.DELIVERED:
      if (SENDGRID_TEMPLATES.CUSTOMER_DELIVERED) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_DELIVERED });
      break;
    case OrderStatus.FEEDBACK:
      if (SENDGRID_TEMPLATES.CUSTOMER_FEEDBACK) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_FEEDBACK });
      break;
    case OrderStatus.REFUNDED:
      if (SENDGRID_TEMPLATES.CUSTOMER_REFUNDED) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_REFUNDED });
      break;
  }

  if (requests.length === 0) {
    console.warn(`⚠️ [Email Service] No email templates configured for status: ${statusToCheck}`);
    logger.warn('[Email Service] No email templates configured for this status');
    return;
  }

  const validRequests = requests.filter(req => req.to && req.template_id && isValidEmail(req.to));
  console.log(`📧 [Email Service] Prepared ${validRequests.length} email(s) to send:`, validRequests.map(r => r.to));

  // Send emails in parallel
  const emailPromises = validRequests.map(async (req) => {
    try {
      const response = await supabase.functions.invoke('send-email', {
        body: { to: req.to, template_id: req.template_id, dynamic_data: emailData }
      });
      
      console.log('[Email Service] Function response:', response);
      
      if (response.error) {
        logger.error(`[Email Service] Function returned error:`, response.error);
        throw response.error;
      }
      // Return data for batch insert
      return {
        order_id: order.id,
        recipient_email: req.to,
        template_id: req.template_id,
        subject: `Auto-Trigger: ${statusToCheck}`,
        body: `Template Sent: ${req.template_id}`,
        visibility: 'internal'
      };
    } catch (err) {
      logger.error(`[Email Service] Failed to send email to ${req.to}`, err);
      return null;
    }
  });

  // Execute email sends in parallel
  const emailResults = await Promise.all(emailPromises);
  const successfulEmails = emailResults.filter(Boolean);

  if (successfulEmails.length > 0) {
    try {
      await supabase.from('order_communications').insert(successfulEmails);
    } catch (err) {
      logger.warn(`[Email Service] Skipping communication logging`, err);
    }
  }
};

// ---------------------------------------------------------------------
// 7. CRUD OPERATIONS
// ---------------------------------------------------------------------

export const createOrder = async (orderData: any, userEmail: string) => {
  const end = performanceMonitor.startMeasure('createOrder', 'api');
  try {
    // ✅ LAYER 3: Service Sanitization
    
    // Step 1: Basic checks
    if (!orderData) throw new Error('Order data is required');
    if (!userEmail) throw new Error('User email is required');

    // Step 2: Validate data integrity
    try {
      // ✅ Validate against schema (soft validation - warns but continues)
      await validateData(orderSchema, orderData);
      logger.info('[Order Service] Data validation passed');
    } catch (validationError: any) {
      // Log the warning but don't throw - allows minor issues to pass
      logger.warn('[Order Service] Data validation warning:', validationError.errors || validationError);
      // Continue anyway - service layer has fallback protection
    }

    // Step 3: Create safe copy with fallback values ONLY for critical fields
    // ✅ CRITICAL: This ensures status is NEVER undefined
    const safeData = {
      ...orderData,
      // ✅ ONLY fallback status - preserve all user data
      status: orderData.status || OrderStatus.NEW_ORDER,
    };

    // Step 4: Convert to database format
    const payload = toSnakeCase({ ...safeData, salesAgent: userEmail });

    // Step 5: Insert into database
    const { data, error } = await supabase
      .from('orders')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('Failed to create order: no data returned');

    logger.info(`[Order Service] Order created: ${data.order_number}`);

    // Step 6: Log order creation
    await supabase.from('order_history').insert({
      order_id: data.id,
      user_email: userEmail,
      field_changed: 'ORDER_CREATED',
      new_value: 'Order Created'
    });

    // Step 7: Map to frontend format
    const mappedOrder = mapDbToOrder(data);

    // Step 8: Trigger welcome email
    triggerStatusEmail(mappedOrder, OrderStatus.NEW_ORDER).catch(err => {
      logger.error("[Email Service] Email trigger failed (background)", err);
    });

    end();
    return mappedOrder;
  } catch (err: any) {
    end();
    logger.error('[Order Service] Create order failed', err);
    throw err;
  }
};

export const updateOrderDetails = async (
  orderId: number, 
  updates: any, 
  oldOrder: Order, 
  userEmail: string
) => {
  const endMeasure = performanceMonitor.startMeasure('updateOrderDetails', 'api');
  
  const dbPayload = toSnakeCase(updates);

  const { data, error } = await supabase
    .from('orders')
    .update(dbPayload)
    .eq('id', orderId)
    .select()
    .single();

  if (error) {
    logger.error('[Order Service] Database error', error);
    throw error;
  }

  const newOrder = mapDbToOrder(data);

  const historyRecords = [];
  for (const key in updates) {
    // ✅ FIX: Safe access to oldOrder properties
    const oldOrderKey = Object.keys(oldOrder).find(
      (k) => k.toLowerCase() === key.replace(/_/g, "").toLowerCase()
    ) as keyof Order;

    if (oldOrderKey) {
      const oldValue = oldOrder[oldOrderKey];
      const newValue = updates[key];
      
      // ✅ FIX: Safe string conversion that handles undefined/null
      const safeOld = oldValue === null || oldValue === undefined ? "N/A" : String(oldValue);
      const safeNew = newValue === null || newValue === undefined ? "N/A" : String(newValue);

      if (safeOld !== safeNew) {
        historyRecords.push({
          order_id: orderId,
          user_email: userEmail,
          field_changed: key,
          old_value: safeOld,
          new_value: safeNew,
        });
      }
    }
  }
  
  if (historyRecords.length > 0) {
    await supabase.from('order_history').insert(historyRecords);
  }

  // ✅ AFTER database update and mapping, compare OLD vs NEW
  const statusChanged = oldOrder.status !== newOrder.status;

  console.log(`🔍 Status: ${oldOrder.status} → ${newOrder.status} | Changed: ${statusChanged}`);

  if (statusChanged) {
    console.log(`📧 Triggering email for status: ${newOrder.status}`);
    triggerStatusEmail(newOrder, newOrder.status).catch(err => {
      console.error("❌ Email failed:", err);
      logger.error("⚠️ Email trigger failed (background):", err);
    });
  }

  await queryClient.invalidateQueries({ queryKey: queryKeys.orders.report('', '') });

  endMeasure();
  
  return newOrder;
};