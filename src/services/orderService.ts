// src/services/orderService.ts

import { supabase } from './supabaseClient';
import { queryClient } from './queryClient';
import { queryKeys } from '../constants/queryKeys';
import { Order, OrderStatus } from '../types/index';
import { logger } from './logger';
import { performanceMonitor } from './performanceMonitor';
import { validateData, orderSchema } from './validation';
import { normalizePatchType, normalizeBacking } from '../utils/patchVocab';

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
    'id', 'orderNumber', 'createdAt', 'updatedAt', 'createdBy', 'profit', 'amountRemaining', 'changes',
    // attributionQuality is a Postgres GENERATED column — read-only by definition.
    // Including it in an UPDATE causes "column can only be updated to DEFAULT" error.
    'attributionQuality',
    // production_completed_* only written via mark_production_done / unmark_production_done RPCs
    'productionCompletedAt', 'productionCompletedBy',
  ]);

  const snakeCaseObject: { [key: string]: any } = {};

  for (const key in data) { // Ensure the key belongs to the object and is not a read-only field.
    if (Object.prototype.hasOwnProperty.call(data, key) && !readOnlyFields.has(key)) {
      const value = data[key];
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      // Normalize empty/undefined to null — Postgres rejects "" for date/numeric columns
      snakeCaseObject[snakeKey] = (value === undefined || value === '') ? null : value;
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

// ✅ UPDATED TO AWS SES TEMPLATE IDS (Migrated from SendGrid)
const SENDGRID_TEMPLATES = {
  // --- NEW ORDERS ---
  CUSTOMER_NEW_ORDER: 'CUSTOMER_NEW_ORDER',
  INTERNAL_NEW_ORDER: 'INTERNAL_NEW_ORDER',

  // --- DESIGN PROCESS ---
  CUSTOMER_MOCKUP_READY: 'CUSTOMER_MOCKUP_READY',
  CUSTOMER_REVISION_IN_PROGRESS: 'CUSTOMER_REVISION_IN_PROGRESS',
  INTERNAL_REVISION_REQUESTED: 'PRODUCTION_TEAM_REVISION',

  // --- PRODUCTION ---
  CUSTOMER_PRODUCTION_START: 'CUSTOMER_PRODUCTION_STARTED',
  INTERNAL_QUALITY_ASSURANCE: 'QUALITY_ASSURANCE',
  INTERNAL_PRODUCTION_START: 'INTERNAL_START_PRODUCTION',

  // --- FULFILLMENT ---
  CUSTOMER_SHIPPED: 'CUSTOMER_SHIPPED',
  CUSTOMER_DELIVERED: 'CUSTOMER_DELIVERED',
  CUSTOMER_FEEDBACK: 'CUSTOMER_FEEDBACK_REQUEST',
  CUSTOMER_REFUNDED: 'CUSTOMER_REFUND_ISSUED',

  // --- REMAKE ---
  CUSTOMER_REMAKE: 'CUSTOMER_REMAKE',
  INTERNAL_REMAKE: 'INTERNAL_REMAKE',
};

const PRODUCTION_MANAGER_EMAILS = [
  'lilcustomerzdesign@gmail.com',
  'lilcustomize550@gmail.com',
  'pandaproductionoffice@gmail.com'
];

// ✅ PVC Vendor Email (separate routing)
const PVC_VENDOR_EMAIL = 'Arsalan.ali.khan.85@gmail.com';

// ✅ Design Team CC (for internal emails only)
const DESIGN_TEAM_CC = 'design@pandapatches.com';


const getFileName = (url: string): string => {
  try {
    const raw = decodeURIComponent(url ? url.split('/').pop()?.split('?')[0] || 'file' : 'file');
    return raw.replace(/^(mockup_)?\d{10,}_/, '').replace(/^[a-f0-9-]{36}\./, '') || raw;
  } catch {
    return 'file';
  }
};

const isValidEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

// Fire a Meta CAPI pipeline-stage event in the background (non-blocking).
// Maps CRM status transitions to Meta's Conversion Leads event taxonomy:
//   AWAITING_APPROVAL → Lead            (mockup sent = qualified lead)
//   IN_PRODUCTION / APPROVED → InitiateCheckout (customer approved = intent)
const fireLeadEvent = (orderId: number, eventName: 'Lead' | 'InitiateCheckout') => {
  supabase.functions.invoke('send-meta-lead-event', {
    body: { order_id: orderId, event_name: eventName },
  }).then(({ error }) => {
    if (error) logger.error(`[CAPI-Lead] ${eventName} invoke failed for order ${orderId}`, error);
  }).catch(err => {
    logger.error(`[CAPI-Lead] ${eventName} network error for order ${orderId}`, err);
  });
};

// ✅ Get internal team emails based on patch type
const getInternalEmails = (patchType?: string): string[] => {
  // PVC orders go only to Arsalan (vendor)
  if (patchType?.toLowerCase() === 'pvc') {
    return [PVC_VENDOR_EMAIL];
  }
  // All other patch types go to production team
  return PRODUCTION_MANAGER_EMAILS;
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
  const status = data.status;

  // Calculate profit: For refunded orders, profit is negative (all costs are losses)
  const totalCosts = productionCost + shippingCost + marketingCost;
  const profit = status === 'REFUNDED' ? -totalCosts : orderAmount - totalCosts;

  return {
    id: data.id,
    orderNumber: data.orderNumber ?? data.order_number,
    customerName: data.customerName ?? data.customer_name,
    customerEmail: data.customerEmail ?? data.customer_email,
    ccEmail: data.ccEmail ?? data.cc_email ?? undefined,
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
    borderType: data.borderType ?? data.border_type,
    instructions: data.instructions,

    orderAmount, amountPaid, productionCost, shippingCost, marketingCost,
    profit,
    amountRemaining: orderAmount - amountPaid,

    status,
    reasonCategory: data.reasonCategory ?? data.reason_category,
    reasonDetails: data.reasonDetails ?? data.reason_details,
    isUrgent: data.isUrgent ?? data.is_urgent,
    isUrgentApproved: data.isUrgentApproved ?? data.is_urgent_approved,
    sampleBox: data.sampleBox ?? data.sample_box ?? false,
    rushDate: data.rushDate ?? data.rush_date ?? undefined,
    productionCompletedAt: data.productionCompletedAt ?? data.production_completed_at ?? null,
    productionCompletedBy: data.productionCompletedBy ?? data.production_completed_by ?? null,
    leadSource: data.leadSource ?? data.lead_source,
    salesAgent: data.salesAgent ?? data.sales_agent,
    assignedBy: data.assignedBy ?? data.assigned_by,
    assignedAt: data.assignedAt ?? data.assigned_at,

    country: data.country ?? null,
    purchaseOrder: data.purchaseOrder ?? data.purchase_order ?? null,

    attribution: data.attribution ?? null,
    attributionQuality: data.attribution_quality ?? null,

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
    border_type: order.borderType || "",
    instructions: order.instructions || '',
    
    total_price: `$${(order.orderAmount || 0).toLocaleString()}`,
    amount_paid: `$${(order.amountPaid || 0).toLocaleString()}`,
    amount_remaining: `$${((order.orderAmount || 0) - (order.amountPaid || 0)).toLocaleString()}`,
    
    shipping_address: order.shippingAddress,
    carrier: order.shippingCarrier,
    tracking_number: order.shippingTrackingNumber,
    tracking_link: trackingUrl,
    // Shipping proof photos for the "Shipped" email (add {{#each shipping_photos}} to the template)
    shipping_photos: (order.shippingAttachmentUrls || []).map(url => ({ url, file_name: getFileName(url) })),
    has_shipping_photos: (order.shippingAttachmentUrls || []).length > 0,

    order_link: `https://login.pandapatches.com/customer/order/${order.orderNumber}`,
    sales_agent_name: order.salesAgent || "Panda Team",

    is_urgent: order.isUrgent || false,
    rush_date: order.rushDate ? new Date(order.rushDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : null,

    remake_reason: order.reasonCategory || null,
    remake_details: order.reasonDetails || null,
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
  const requests: { to: string; template_id: string; isInternal: boolean; cc?: string }[] = [];

  console.log(`📧 [Email Service] Triggering emails for status: ${statusToCheck}`);
  logger.info(`[Email Service] Triggering emails for status: ${statusToCheck}`);
  
  // ✅ Get the right email recipients based on patch type
  const internalEmails = getInternalEmails(order.patchesType);
  // ✅ Generate unique thread ID for internal emails per order
  const internalThreadId = `order-${order.id}-internal@pandapatches.com`;
  // CC email from order (secondary contact for companies with 2 recipients)
  const customerCC = order.ccEmail && isValidEmail(order.ccEmail) ? order.ccEmail : null;

  switch (statusToCheck) {
    case OrderStatus.NEW_ORDER:
      // Customer email with CC to hello@pandapatches.com + secondary email if set
      if (SENDGRID_TEMPLATES.CUSTOMER_NEW_ORDER) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_NEW_ORDER, isInternal: false, cc: [customerCC, 'hello@pandapatches.com'].filter(Boolean).join(',') });
      // Internal email with all production team in CC
      if (SENDGRID_TEMPLATES.INTERNAL_NEW_ORDER && internalEmails.length > 0) {
        const ccEmails = internalEmails.slice(1).join(',');
        requests.push({ to: internalEmails[0], template_id: SENDGRID_TEMPLATES.INTERNAL_NEW_ORDER, isInternal: true, cc: [DESIGN_TEAM_CC, ccEmails, 'hello@pandapatches.com'].filter(Boolean).join(',') });
      }
      break;
    case OrderStatus.AWAITING_APPROVAL:
      // Mockup sent for approval → notify ONLY the customer ("Your Mockup is Ready! Please approve").
      // No separate internal email here: the design/production team is the one that just sent it, and
      // the old INTERNAL_REVISION_REQUESTED template wrongly told them "Customer has requested revisions".
      // (That template correctly fires on the REVISION_REQUESTED case below.) The team is still CC'd on
      // the customer email above.
      if (SENDGRID_TEMPLATES.CUSTOMER_MOCKUP_READY) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_MOCKUP_READY, isInternal: false, cc: [customerCC, DESIGN_TEAM_CC, 'hello@pandapatches.com'].filter(Boolean).join(',') });
      break;
    case OrderStatus.REVISION_REQUESTED:
      if (SENDGRID_TEMPLATES.CUSTOMER_REVISION_IN_PROGRESS) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_REVISION_IN_PROGRESS, isInternal: false, cc: [customerCC, DESIGN_TEAM_CC, 'hello@pandapatches.com'].filter(Boolean).join(',') });
      if (SENDGRID_TEMPLATES.INTERNAL_REVISION_REQUESTED && internalEmails.length > 0) {
        const ccEmails = internalEmails.slice(1).join(',');
        requests.push({ to: internalEmails[0], template_id: SENDGRID_TEMPLATES.INTERNAL_REVISION_REQUESTED, isInternal: true, cc: [DESIGN_TEAM_CC, ccEmails, 'hello@pandapatches.com'].filter(Boolean).join(',') });
      }
      break;
    case OrderStatus.IN_PRODUCTION:
    case OrderStatus.APPROVED:
      if (SENDGRID_TEMPLATES.CUSTOMER_PRODUCTION_START) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_PRODUCTION_START, isInternal: false, cc: [customerCC, DESIGN_TEAM_CC, 'hello@pandapatches.com'].filter(Boolean).join(',') });
      if (SENDGRID_TEMPLATES.INTERNAL_PRODUCTION_START && internalEmails.length > 0) {
        const ccEmails = internalEmails.slice(1).join(',');
        requests.push({ to: internalEmails[0], template_id: SENDGRID_TEMPLATES.INTERNAL_PRODUCTION_START, isInternal: true, cc: [DESIGN_TEAM_CC, ccEmails, 'hello@pandapatches.com'].filter(Boolean).join(',') });
      }
      break;
    case OrderStatus.QUALITY_ASSURANCE:
      if (SENDGRID_TEMPLATES.INTERNAL_QUALITY_ASSURANCE) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.INTERNAL_QUALITY_ASSURANCE, isInternal: false, cc: [customerCC, DESIGN_TEAM_CC, 'hello@pandapatches.com'].filter(Boolean).join(',') });
      break;
    case OrderStatus.SHIPPED:
      if (SENDGRID_TEMPLATES.CUSTOMER_SHIPPED) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_SHIPPED, isInternal: false, cc: [customerCC, DESIGN_TEAM_CC, 'hello@pandapatches.com'].filter(Boolean).join(',') });
      break;
    case OrderStatus.DELIVERED:
      if (SENDGRID_TEMPLATES.CUSTOMER_DELIVERED) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_DELIVERED, isInternal: false, cc: [customerCC, DESIGN_TEAM_CC, 'hello@pandapatches.com'].filter(Boolean).join(',') });
      break;
    case OrderStatus.FEEDBACK:
      if (SENDGRID_TEMPLATES.CUSTOMER_FEEDBACK) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_FEEDBACK, isInternal: false, cc: [customerCC, DESIGN_TEAM_CC, 'hello@pandapatches.com'].filter(Boolean).join(',') });
      break;
    case OrderStatus.REFUNDED:
      if (SENDGRID_TEMPLATES.CUSTOMER_REFUNDED) requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_REFUNDED, isInternal: false, cc: [customerCC, DESIGN_TEAM_CC, 'hello@pandapatches.com'].filter(Boolean).join(',') });
      break;
    case OrderStatus.REMAKE:
      // Customer email: Apologetic, reassuring
      if (SENDGRID_TEMPLATES.CUSTOMER_REMAKE) {
        requests.push({
          to: order.customerEmail,
          template_id: SENDGRID_TEMPLATES.CUSTOMER_REMAKE,
          isInternal: false,
          cc: [customerCC, DESIGN_TEAM_CC, 'hello@pandapatches.com'].filter(Boolean).join(',')
        });
      }
      // Internal email: Urgent alert to production team with all team members in CC
      if (SENDGRID_TEMPLATES.INTERNAL_REMAKE && internalEmails.length > 0) {
        const ccEmails = internalEmails.slice(1).join(',');
        requests.push({
          to: internalEmails[0],
          template_id: SENDGRID_TEMPLATES.INTERNAL_REMAKE,
          isInternal: true,
          cc: [DESIGN_TEAM_CC, ccEmails, 'hello@pandapatches.com', order.salesAgent].filter(Boolean).join(',')
        });
      }
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
      const emailPayload: any = {
        to: req.to,
        template_id: req.template_id,
        dynamic_data: req.isInternal
          ? { ...emailData, order_link: `https://portal.pandapatches.com/order/${order.orderNumber}` }
          : emailData
      };

      // ✅ Add CC for all emails (both customer and internal)
      if (req.cc) {
        emailPayload.cc = req.cc;
      }

      // ✅ Add email threading headers for internal emails only
      if (req.isInternal) {
        emailPayload.headers = {
          'Message-ID': `<${internalThreadId}-${Date.now()}@pandapatches.com>`,
          'In-Reply-To': `<${internalThreadId}@pandapatches.com>`,
          'References': `<${internalThreadId}@pandapatches.com>`
        };
      }

      const response = await supabase.functions.invoke('send-email', {
        body: emailPayload
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
      const errorMsg = (err as any)?.message || String(err) || 'Unknown error';
      logger.error(`[Email Service] Failed to send email to ${req.to}`, err);
      // Log the failed email so it appears in the Email Logs section on the Order page
      try {
        await supabase.from('order_communications').insert({
          order_id: order.id,
          recipient_email: req.to,
          template_id: req.template_id,
          subject: `FAILED: ${statusToCheck}`,
          body: errorMsg,
          visibility: 'internal',
        });
      } catch {
        // ignore secondary log failure
      }
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
      console.log('[DEBUG] Validating order data:', orderData);
      await validateData(orderSchema, orderData);
      logger.info('[Order Service] Data validation passed');
    } catch (validationError: any) {
      // Log the warning but don't throw - allows minor issues to pass
      console.error('[DEBUG] Validation error details:', validationError.message);
      logger.warn('[Order Service] Data validation warning:', validationError.errors || validationError);
      // Continue anyway - service layer has fallback protection
    }

    // Step 3: Create safe copy with fallback values ONLY for critical fields
    // ✅ CRITICAL: This ensures status is NEVER undefined
    const safeData = {
      ...orderData,
      // ✅ ONLY fallback status - preserve all user data
      status: orderData.status || OrderStatus.NEW_ORDER,
      // Marketing attribution (Meta CAPI etc.). Explicit null for manually-created
      // orders so the DB column is NULL rather than absent from the payload.
      attribution: orderData.attribution ?? null,
      // Normalize the two dropdown-constrained fields to canonical CRM values so the
      // order editor's <select>s display them. Covers BOTH the agent New Order form and
      // the quote->order conversion (convertQuoteToOrder funnels through here), where
      // quotes carry messy vocabulary ("3d-embroidered", "pvc", "Iron On", "velcro"…).
      patchesType: normalizePatchType(orderData.patchesType),
      designBacking: normalizeBacking(orderData.designBacking),
    };

    // Step 4: Convert to database format
    const payload = toSnakeCase({ ...safeData, salesAgent: userEmail });

    // Step 4b: Detect "agent bypassed quote" — if this customer already has a quote
    // in the system but the agent didn't use Convert to Order, flag it.
    // This populates had_prior_quote_request even for orders NOT going through convertQuoteToOrder.
    if (safeData.customerEmail && !payload.had_prior_quote_request) {
      try {
        const { count } = await supabase
          .from('quotes')
          .select('id', { count: 'exact', head: true })
          .ilike('customer_email', safeData.customerEmail);
        if (count && count > 0) {
          payload.had_prior_quote_request = true;
        }
      } catch {
        // Non-critical — don't block order creation if this check fails
      }
    }

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

    // Step 8b: Customer portal account provisioning is handled server-side by the
    // provision_customer_account() trigger (AFTER INSERT on orders → invite-customer), so it
    // fires reliably for every order path — not just the ones created through this frontend.
    // (Removed the old client-side invite-customer call to avoid double-provisioning the order.)

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

  // Optimistic locking: only update if the row hasn't been modified since we loaded it
  let query = supabase
    .from('orders')
    .update(dbPayload)
    .eq('id', orderId);

  if (oldOrder.updatedAt) {
    query = query.eq('updated_at', oldOrder.updatedAt);
  }

  const { data, error } = await query.select().single();

  if (error) {
    // PGRST116 = "No rows found" - means updated_at changed (concurrent edit)
    if (error.code === 'PGRST116') {
      throw new Error(
        'This order was modified by another user. Please refresh the page and try again.'
      );
    }
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

    // Meta CAPI pipeline-stage events — fire & forget, never blocks the save
    if (newOrder.status === OrderStatus.AWAITING_APPROVAL) {
      fireLeadEvent(newOrder.id, 'Lead');
    } else if (
      newOrder.status === OrderStatus.IN_PRODUCTION ||
      newOrder.status === OrderStatus.APPROVED
    ) {
      fireLeadEvent(newOrder.id, 'InitiateCheckout');
    }
  }

  await queryClient.invalidateQueries({ queryKey: queryKeys.orders.report('', '') });

  endMeasure();
  
  return newOrder;
};

// ─── RESEND A FAILED EMAIL ────────────────────────────────────────────────────
export const resendFailedEmail = async (
  order: Order,
  communicationId: number,
  triggerStatus: string,
  templateId: string,
  recipientEmail: string
): Promise<void> => {
  const emailData = prepareEmailData(order, triggerStatus);

  const response = await supabase.functions.invoke('send-email', {
    body: { to: recipientEmail, template_id: templateId, dynamic_data: emailData },
  });

  if (response.error) {
    const errorMsg = (response.error as any)?.message || String(response.error) || 'Unknown error';
    // Log the new failure
    await supabase.from('order_communications').insert({
      order_id: order.id,
      recipient_email: recipientEmail,
      template_id: templateId,
      subject: `FAILED: ${triggerStatus}`,
      body: errorMsg,
      visibility: 'internal',
    });
    throw new Error(errorMsg);
  }

  // Success: remove the failed record and log success
  await supabase.from('order_communications').delete().eq('id', communicationId);
  await supabase.from('order_communications').insert({
    order_id: order.id,
    recipient_email: recipientEmail,
    template_id: templateId,
    subject: `Auto-Trigger: ${triggerStatus}`,
    body: `Template Sent: ${templateId}`,
    visibility: 'internal',
  });
};

// ─── MANUAL PAYMENT CONFIRMATION EMAIL ───────────────────────────────────────
export const sendPaymentConfirmationEmail = async (order: Order): Promise<void> => {
  const emailData = {
    customer_name: order.customerName || 'Valued Customer',
    customer_email: order.customerEmail,
    order_number: order.orderNumber,
    order_date: new Date(order.createdAt).toLocaleDateString(),
    total_amount: `$${(order.orderAmount || 0).toLocaleString()}`,
    amount_paid: `$${(order.amountPaid || 0).toLocaleString()}`,
    amount_remaining: `$${(order.amountRemaining || 0).toLocaleString()}`,
    is_paid_in_full: (order.amountRemaining || 0) <= 0,
    design_name: order.designName || '',
    order_link: `https://login.pandapatches.com/customer/order/${order.orderNumber}`,
    sales_agent_name: order.salesAgent || 'Panda Team',
  };

  const requests: Array<{ to: string; template_id: string; isInternal: boolean }> = [];

  // Customer receipt
  if (order.customerEmail && isValidEmail(order.customerEmail)) {
    requests.push({ to: order.customerEmail, template_id: 'CUSTOMER_PAYMENT_CONFIRMATION', isInternal: false });
  }
  // Internal alert → lance@pandapatches.com only
  requests.push({ to: 'lance@pandapatches.com', template_id: 'INTERNAL_PAYMENT_NOTIFICATION', isInternal: true });

  const results = await Promise.allSettled(
    requests.map(req =>
      supabase.functions.invoke('send-email', {
        body: {
          to: req.to,
          template_id: req.template_id,
          dynamic_data: req.isInternal
            ? { ...emailData, order_link: `https://portal.pandapatches.com/order/${order.orderNumber}` }
            : emailData,
        },
      })
    )
  );

  // Log all attempts to order_communications
  const logs = results.map((result, i) => ({
    order_id: order.id,
    recipient_email: requests[i].to,
    template_id: requests[i].template_id,
    subject: result.status === 'fulfilled' && !result.value.error
      ? 'Auto-Trigger: PAYMENT_CONFIRMATION'
      : 'FAILED: PAYMENT_CONFIRMATION',
    body: result.status === 'fulfilled' && !result.value.error
      ? `Template Sent: ${requests[i].template_id}`
      : ((result.status === 'rejected' ? result.reason?.message : result.value?.error?.message) || 'Unknown error'),
    visibility: 'internal' as const,
  }));

  if (logs.length > 0) {
    await supabase.from('order_communications').insert(logs).then();
  }

  // Throw if ALL failed
  const anySuccess = results.some(
    r => r.status === 'fulfilled' && !(r.value as any).error
  );
  if (!anySuccess) {
    throw new Error('Payment confirmation emails failed to send');
  }
};