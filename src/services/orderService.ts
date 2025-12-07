// src/services/orderService.ts

import { supabase } from './supabaseClient';
import { queryClient } from '../App';
import { queryKeys } from '../constants/queryKeys';
import { Order, OrderStatus } from '../types/index';
import { logger } from './logger'; // ✅ UPGRADE 6: Logger service
import { performanceMonitor } from './performanceMonitor'; // ✅ UPGRADE 8: Performance monitoring

/**
 * A generic, automated adapter to convert a camelCase object to a snake_case object
 * suitable for a Supabase database payload.
 * @param data The camelCase object from the frontend.
 * @returns A new object with snake_case keys.
 */
const toSnakeCase = (data: any): any => {
  // These fields are computed or managed by the database and should never be sent in an update.
  const readOnlyFields = new Set([
    'id', 'orderNumber', 'createdAt', 'updatedAt', 'createdBy', 'profit', 'amountRemaining'
  ]);

  const snakeCaseObject: { [key: string]: any } = {};

  for (const key in data) {
    // Ensure the key belongs to the object and is not a read-only field.
    if (Object.prototype.hasOwnProperty.call(data, key) && !readOnlyFields.has(key)) {
      // Convert camelCase to snake_case using a regular expression.
      // e.g., 'orderAmount' becomes 'order_amount'
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      snakeCaseObject[snakeKey] = data[key];
    }
  }

  // Special handling for array fields that might be null/undefined
  // Ensure we send an empty array `[]` instead of `null` if they are cleared.
  const arrayFields = ['mockupUrls', 'productionFileUrls', 'shippingAttachmentUrls', 'customerAttachmentUrls', 'redoAttachments'];
  arrayFields.forEach(field => {
    if (data[field] !== undefined) {
      const snakeKey = field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      snakeCaseObject[snakeKey] = data[field] || [];
    }
  });

  return snakeCaseObject;
};

// =====================================================================
// 2. TEMPLATE CONFIGURATION (SendGrid IDs)
// =====================================================================
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

// =====================================================================
// 3. HELPER FUNCTIONS
// =====================================================================

const getFileName = (url: string): string => {
  try {
    return url.split('/').pop()?.split('?')[0] || 'file';
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

// =====================================================================
// 4. EMAIL DATA PREPARATION
// =====================================================================

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

// =====================================================================
// 5. EMAIL TRIGGER LOGIC
// =====================================================================

export const triggerStatusEmail = async (order: Order, statusToCheck: string) => {
  // ✅ VALIDATION: Check if customer email exists
  if (!order.customerEmail || !isValidEmail(order.customerEmail)) {
    logger.warn(`[Email Service] Skipping email trigger - invalid customer email: ${order.customerEmail}`);
    return;
  }

  const emailData = prepareEmailData(order, statusToCheck);
  const requests: { to: string; template_id: string }[] = [];

  logger.info(`[Email Service] Triggering emails for status: ${statusToCheck}`);
  
  switch (statusToCheck) {
    case OrderStatus.NEW_ORDER: 
      if (SENDGRID_TEMPLATES.CUSTOMER_NEW_ORDER) {
        requests.push({ 
          to: order.customerEmail, 
          template_id: SENDGRID_TEMPLATES.CUSTOMER_NEW_ORDER 
        });
      }
      if (SENDGRID_TEMPLATES.INTERNAL_NEW_ORDER) {
        PRODUCTION_MANAGER_EMAILS.forEach(email => {
          requests.push({ 
            to: email, 
            template_id: SENDGRID_TEMPLATES.INTERNAL_NEW_ORDER 
          });
        });
      }
      break;

    case OrderStatus.AWAITING_APPROVAL: 
      if (SENDGRID_TEMPLATES.CUSTOMER_MOCKUP_READY) {
        requests.push({ 
          to: order.customerEmail, 
          template_id: SENDGRID_TEMPLATES.CUSTOMER_MOCKUP_READY 
        });
      }
      break;

    case OrderStatus.REVISION_REQUESTED: 
      if (SENDGRID_TEMPLATES.CUSTOMER_REVISION_IN_PROGRESS) {
        requests.push({ 
          to: order.customerEmail, 
          template_id: SENDGRID_TEMPLATES.CUSTOMER_REVISION_IN_PROGRESS 
        });
      }
      if (SENDGRID_TEMPLATES.INTERNAL_REVISION_REQUESTED) {
        PRODUCTION_MANAGER_EMAILS.forEach(email => {
          requests.push({ 
            to: email, 
            template_id: SENDGRID_TEMPLATES.INTERNAL_REVISION_REQUESTED 
          });
        });
      }
      break;

    case OrderStatus.IN_PRODUCTION: 
    case OrderStatus.APPROVED: 
      if (SENDGRID_TEMPLATES.CUSTOMER_PRODUCTION_START) {
        requests.push({ 
          to: order.customerEmail, 
          template_id: SENDGRID_TEMPLATES.CUSTOMER_PRODUCTION_START 
        });
      }
      if (SENDGRID_TEMPLATES.INTERNAL_PRODUCTION_START) {
        PRODUCTION_MANAGER_EMAILS.forEach(email => {
          requests.push({ to: email, template_id: SENDGRID_TEMPLATES.INTERNAL_PRODUCTION_START });
        });
      }
      break;

    case OrderStatus.QUALITY_ASSURANCE:
      if (SENDGRID_TEMPLATES.INTERNAL_QUALITY_ASSURANCE) {
        requests.push({
          to: order.customerEmail,
          template_id: SENDGRID_TEMPLATES.INTERNAL_QUALITY_ASSURANCE
        });
      }
      break;

    case OrderStatus.SHIPPED: 
      if (SENDGRID_TEMPLATES.CUSTOMER_SHIPPED) {
        requests.push({ 
          to: order.customerEmail, 
          template_id: SENDGRID_TEMPLATES.CUSTOMER_SHIPPED 
        });
      }
      break;

    case OrderStatus.DELIVERED: 
      if (SENDGRID_TEMPLATES.CUSTOMER_DELIVERED) {
        requests.push({ 
          to: order.customerEmail, 
          template_id: SENDGRID_TEMPLATES.CUSTOMER_DELIVERED 
        });
      }
      break;

    case OrderStatus.FEEDBACK: 
      if (SENDGRID_TEMPLATES.CUSTOMER_FEEDBACK) {
        requests.push({ 
          to: order.customerEmail, 
          template_id: SENDGRID_TEMPLATES.CUSTOMER_FEEDBACK 
        });
      }
      break;

    case OrderStatus.REFUNDED: 
      if (SENDGRID_TEMPLATES.CUSTOMER_REFUNDED) {
        requests.push({ 
          to: order.customerEmail, 
          template_id: SENDGRID_TEMPLATES.CUSTOMER_REFUNDED 
        });
      }
      break;
  }

  if (requests.length === 0) {
    logger.warn('[Email Service] No email templates configured for this status');
    return;
  }

  // ✅ OPTIMIZATION: Batch insert communication records instead of individual inserts
  // Reduces database round-trips from N to 1 (where N = number of emails)
  const validRequests = requests.filter(req => {
    if (!req.to || !req.template_id) {
      logger.warn(`[Email Service] Skipping email: Missing ${!req.to ? 'recipient' : 'template'}`);
      return false;
    }
    if (!isValidEmail(req.to)) {
      logger.error(`[Email Service] Invalid email format: ${req.to}`);
      return false;
    }
    return true;
  });

  // Send emails in parallel
  const emailPromises = validRequests.map(async (req) => {
    const end = performanceMonitor.startMeasure(`sendEmail-${req.to}`, 'api');
    try {
      logger.info(`[Email Service] Sending email to: ${req.to}`, { template_id: req.template_id });
      
      const response = await supabase.functions.invoke('send-email', {
        body: { 
          to: req.to, 
          template_id: req.template_id, 
          dynamic_data: emailData 
        }
      });
      
      console.log('[Email Service] Function response:', response);
      
      if (response.error) {
        logger.error(`[Email Service] Function returned error:`, response.error);
        throw response.error;
      }
      
      end();
      logger.info(`[Email Service] Email sent successfully to ${req.to}`, { response: response.data });
      
      // Return data for batch insert
      return {
        order_id: order.id,
        recipient_email: req.to,
        template_id: req.template_id,
        subject: `Auto-Trigger: ${statusToCheck}`,
        body: `Template Sent: ${req.template_id}`,
        visibility: 'internal'
      };
    } catch (err: any) {
      end();
      logger.error(`[Email Service] Failed to send email to ${req.to}`, err);
      return null;
    }
  });

  // Execute email sends in parallel
  const emailResults = await Promise.all(emailPromises);
  const successfulEmails = emailResults.filter(Boolean);

  // ✅ Batch insert all successful communication records in ONE query (not N queries)
  if (successfulEmails.length > 0) {
    try {
      await supabase.from('order_communications').insert(successfulEmails);
      logger.info(`[Email Service] Batch inserted ${successfulEmails.length} communication records`);
    } catch (err: any) {
      // Don't block email sending if communication logging fails
      // This could be due to missing table or RLS policy issues
      logger.warn(`[Email Service] Skipping communication logging (table may not exist)`, err);
    }
  }
};

// =====================================================================
// 6. CRUD OPERATIONS
// =====================================================================

export const createOrder = async (orderData: any, userEmail: string) => {
  const end = performanceMonitor.startMeasure('createOrder', 'api');
  try {
    // Validate input
    if (!orderData) throw new Error('Order data is required');
    if (!userEmail) throw new Error('User email is required');
    if (!isValidEmail(userEmail)) throw new Error('Invalid user email format');

    const payload = toSnakeCase({ ...orderData, salesAgent: userEmail });

    const { data, error } = await supabase
      .from('orders')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('Failed to create order: no data returned');

    logger.info(`[Order Service] Order created: ${data.order_number}`);

    // Log history
    await supabase.from('order_history').insert({
      order_id: data.id,
      user_email: userEmail,
      field_changed: 'ORDER_CREATED',
      new_value: 'Order Created'
    }).then(({ error: historyError }) => {
      if (historyError) logger.warn('[Order Service] Failed to log order creation history', historyError);
    });

    const mappedOrder = mapDbToOrder(data);

    // Trigger email (background, don't block)
    // ✅ FIX: Ensure email errors are logged with context
    triggerStatusEmail(mappedOrder, OrderStatus.NEW_ORDER).catch(err => {
      const errorContext = {
        orderId: data.id,
        orderNumber: data.order_number,
        customerEmail: mappedOrder.customerEmail,
        status: OrderStatus.NEW_ORDER,
        errorMessage: err?.message || String(err)
      };
      logger.error("[Email Service] Email trigger failed (background)", err, errorContext);
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
  // ✅ UPGRADE 8: Start performance measurement
  const endMeasure = performanceMonitor.startMeasure('updateOrderDetails', 'api');
  
  logger.debug('[Order Service] Updates received (camelCase)', updates);
  // ✅ STEP 1: CONVERT DATA (The Fix)
  // ✅ CONVERT TO SNAKE_CASE
  const dbPayload = toSnakeCase(updates);
  logger.debug('[Order Service] Converted to snake_case', dbPayload);

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

  // Log history
  const historyRecords = [];
  for (const key in updates) {
    const oldOrderKey = Object.keys(oldOrder).find(
      (k) => k.toLowerCase() === key.replace(/_/g, "").toLowerCase()
    ) as keyof Order;

    if (oldOrderKey) {
      const oldValue = oldOrder[oldOrderKey];
      const newValue = updates[key];
      if (String(oldValue) !== String(newValue)) {
        historyRecords.push({
          order_id: orderId,
          user_email: userEmail,
          field_changed: key,
          old_value: String(oldValue ?? "N/A"),
          new_value: String(newValue ?? "N/A"),
        });
      }
    }
  }
  
  if (historyRecords.length > 0) {
    await supabase.from('order_history').insert(historyRecords);
  }

  // Trigger emails if status changed
  if (updates.status && updates.status !== oldOrder.status) {
    triggerStatusEmail(newOrder, updates.status).catch(err => 
       logger.error("⚠️ Email trigger failed (background):", err)
    );
  }

  await queryClient.invalidateQueries({ queryKey: queryKeys.orders.report('', '') });

  // ✅ UPGRADE 8: End performance measurement
  endMeasure();
  
  return newOrder;
};