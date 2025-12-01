import { supabase } from './supabaseClient';
import { queryClient } from '../App';
import { Order, OrderStatus } from '../types/index';

// =====================================================================
// 1. TEMPLATE CONFIGURATION (SendGrid IDs)
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
  CUSTOMER_PAYMENT_NEEDED: '', 
  CUSTOMER_PRODUCTION_START: 'd-0dcf24e7ef3b4195b24ab4dfdf53cde8',
  INTERNAL_QUALITY_ASSURANCE: 'd-70206008ac7c47fbb87585bcc60e59ce',
  INTERNAL_PRODUCTION_START: 'd-0a3e1e4cc4a74b49baf0de6b03823cef',
  
  // --- FULFILLMENT ---
  CUSTOMER_SHIPPED: 'd-30f79e97452342a7a2a42a3237a47479',
  CUSTOMER_DELIVERED: 'd-d0ab08ed143e4a62900c257d63167630', 
  CUSTOMER_FEEDBACK: 'd-563b0533e1d94a1bb830129a440c254b',  
  CUSTOMER_REFUNDED: 'd-8da31b3c8aca485cb82203af044e6ba7',
};

const PRODUCTION_MANAGER_EMAIL = 'peacefulvibes2024@gmail.com';

// =====================================================================
// 2. HELPER FUNCTIONS
// =====================================================================

export const mapDbToOrder = (data: any): Order => {
  const toNumber = (val: any) => {
    if (val === null || val === undefined || val === '') return 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  };

  const orderAmount = toNumber(data.order_amount ?? data.orderAmount);
  const amountPaid = toNumber(data.amount_paid ?? data.amountPaid);
  const productionCost = toNumber(data.production_cost ?? data.productionCost);
  const shippingCost = toNumber(data.shipping_cost ?? data.shippingCost);
  const marketingCost = toNumber(data.marketing_cost ?? data.marketingCost);
  const patchesQuantity = toNumber(data.patches_quantity ?? data.patchesQuantity);

  return {
    id: data.id,
    orderNumber: data.order_number ?? data.orderNumber,
    customerName: data.customer_name ?? data.customerName,
    customerEmail: data.customer_email ?? data.customerEmail,
    customerPhone: data.customer_phone ?? data.customerPhone,
    customerProfileUrl: data.customer_profile_url ?? data.customerProfileUrl,
    
    shippingAddress: data.shipping_address ?? data.shippingAddress,
    shippingTrackingNumber: data.shipping_tracking_number ?? data.shippingTrackingNumber,
    shippingCarrier: data.shipping_carrier ?? data.shippingCarrier,
    
    designName: data.design_name ?? data.designName,
    patchesType: data.patches_type ?? data.patchesType,
    patchesQuantity: patchesQuantity,
    designSize: data.design_size ?? data.designSize,
    designBacking: data.design_backing ?? data.designBacking,
    instructions: data.instructions,
    
    orderAmount,
    amountPaid,
    productionCost,
    shippingCost,
    marketingCost,
    profit: orderAmount - productionCost - shippingCost - marketingCost,
    amountRemaining: orderAmount - amountPaid,

    status: data.status,
    reasonCategory: data.reason_category ?? data.reasonCategory,
    reasonDetails: data.reason_details ?? data.reasonDetails,
    isUrgent: data.is_urgent ?? data.isUrgent,
    isUrgentApproved: data.is_urgent_approved ?? data.isUrgentApproved,
    leadSource: data.lead_source ?? data.leadSource,
    salesAgent: data.sales_agent ?? data.salesAgent,
    createdAt: data.created_at ?? data.createdAt,
    updatedAt: data.updated_at ?? data.updatedAt,

    mockupUrls: data.mockup_urls || data.mockupUrls || [],
    productionFileUrls: data.production_file_urls || data.productionFileUrls || [],
    shippingAttachmentUrls: data.shipping_attachment_urls || data.shippingAttachmentUrls || [],
    customerAttachmentUrls: data.customer_attachment_urls || data.customerAttachmentUrls || [],
    
    revisionNotes: data.revision_notes ?? data.revisionNotes,
    redoNotes: data.redo_notes ?? data.redoNotes
  } as Order;
};

// =====================================================================
// MASTER EMAIL DATA FUNCTION (With Fixed Tracking Logic)
// =====================================================================

export const prepareEmailData = (order: Order, triggerStatus: string) => {
  // --- 1. FILE GATHERING ---
  let allFiles: string[] = [];
  if (triggerStatus === OrderStatus.NEW_ORDER) {
      allFiles = order.customerAttachmentUrls || [];
  } else {
      allFiles = order.mockupUrls || [];
      if (allFiles.length === 0 && order.customerAttachmentUrls?.length > 0) {
          allFiles = order.customerAttachmentUrls;
      }
  }

  // --- 2. SORT & IDENTIFY WINNER ---
  const sortedFiles = [...allFiles].reverse();
  const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(url.toLowerCase());
  const getFileName = (url: string) => {
      try { return decodeURIComponent(url.split('/').pop() || 'File').substring(0, 25); } 
      catch { return 'File'; }
  };

  // Winner = First Image
  const winnerUrl = sortedFiles.find(url => isImage(url)) || sortedFiles[0] || "";
  // Gallery = Rest
  const galleryUrls = sortedFiles.filter(url => url !== winnerUrl);

  // --- 3. BUILD FILE OBJECTS ---
  const winnerObj = winnerUrl ? {
      url: winnerUrl,
      file_name: getFileName(winnerUrl),
      is_image: isImage(winnerUrl)
  } : null;

  const galleryList = galleryUrls.map(url => ({
      url: url,
      file_name: getFileName(url),
      is_image: isImage(url)
  }));

  // --- 4. SMART TRACKING LOGIC (RESTORED) ---
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
          // Fallback if carrier is unknown
          trackingUrl = `https://www.google.com/search?q=${trackingNum}`;
      }
  }

  // --- 5. RETURN FULL DATA ---
  return {
    // > FILES
    winner_file: winnerObj,
    gallery_files: galleryList,
    has_winner: !!winnerObj,
    has_gallery: galleryList.length > 0,

    // > ORDER VARS
    customer_name: order.customerName || "Valued Customer",
    order_number: order.orderNumber || "Pending",
    order_date: new Date(order.createdAt).toLocaleDateString(),
    
    // > PRODUCT
    design_name: order.designName || "Custom Design",
    quantity: order.patchesQuantity || "0",
    patch_type: order.patchesType || "N/A",
    backing: order.designBacking || "N/A",
    size: order.designSize || "N/A",
    
    // > FINANCIALS
    total_price: `$${(order.orderAmount || 0).toLocaleString()}`,
    amount_paid: `$${(order.amountPaid || 0).toLocaleString()}`,
    amount_remaining: `$${((order.orderAmount || 0) - (order.amountPaid || 0)).toLocaleString()}`,
    
    // > SHIPPING & TRACKING
    shipping_address: order.shippingAddress || "No address provided",
    carrier: order.shippingCarrier || "Carrier",
    tracking_number: trackingNum,
    tracking_link: trackingUrl, // <--- This now has the correct FedEx Link
    
    // > EXTRAS
    instructions: order.instructions,
    order_link: `${window.location.origin}/order/${order.orderNumber}`,
    sales_agent_name: order.salesAgent || "Panda Team"
  };
};

// =====================================================================
// 5. EMAIL TRIGGER LOGIC
// =====================================================================

export const triggerStatusEmail = async (order: Order, statusToCheck: string) => {
  const emailData = prepareEmailData(order, statusToCheck);
  const requests: { to: string; template_id: string }[] = [];

  console.log(`📧 [Email Service] Triggering emails for status: ${statusToCheck}`);
  console.log(`📎 Files: Winner=${emailData.has_winner ? 'Yes' : 'No'}, Gallery=${emailData.gallery_files.length}`);
  
  // ---------------------------------------------------------
  // Status-based Email Routing
  // ---------------------------------------------------------
  switch (statusToCheck) {
    case OrderStatus.NEW_ORDER: 
      if (SENDGRID_TEMPLATES.CUSTOMER_NEW_ORDER) {
        requests.push({ 
          to: order.customerEmail, 
          template_id: SENDGRID_TEMPLATES.CUSTOMER_NEW_ORDER 
        });
      }
      if (SENDGRID_TEMPLATES.INTERNAL_NEW_ORDER) {
        requests.push({ 
          to: PRODUCTION_MANAGER_EMAIL, 
          template_id: SENDGRID_TEMPLATES.INTERNAL_NEW_ORDER 
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
        requests.push({ 
          to: PRODUCTION_MANAGER_EMAIL, 
          template_id: SENDGRID_TEMPLATES.INTERNAL_REVISION_REQUESTED 
        });
      }
      break;

    case OrderStatus.IN_PRODUCTION: 
    case OrderStatus.APPROVED: 
      if (order.amountRemaining > 0 && SENDGRID_TEMPLATES.CUSTOMER_PAYMENT_NEEDED) {
        requests.push({ 
          to: order.customerEmail, 
          template_id: SENDGRID_TEMPLATES.CUSTOMER_PAYMENT_NEEDED 
        });
      } else {
        if (SENDGRID_TEMPLATES.CUSTOMER_PRODUCTION_START) {
          requests.push({ 
            to: order.customerEmail, 
            template_id: SENDGRID_TEMPLATES.CUSTOMER_PRODUCTION_START 
          });
        }
        if (SENDGRID_TEMPLATES.INTERNAL_PRODUCTION_START) {
          requests.push({ 
            to: PRODUCTION_MANAGER_EMAIL, 
            template_id: SENDGRID_TEMPLATES.INTERNAL_PRODUCTION_START 
          });
        }
      }
      break;

    case OrderStatus.QUALITY_ASSURANCE:
      if (SENDGRID_TEMPLATES.INTERNAL_QUALITY_ASSURANCE) {
        requests.push({ 
          to: PRODUCTION_MANAGER_EMAIL, 
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
    console.log('⚠️ No email templates configured for this status');
    return;
  }

  // ---------------------------------------------------------
  // Send Emails
  // ---------------------------------------------------------
  await Promise.all(requests.map(async (req) => {
    if (!req.to) {
      console.warn('⚠️ Skipping email: Recipient address is missing');
      return;
    }
    
    try {
      console.log(`📤 Sending email to: ${req.to} (Template: ${req.template_id})`);
      
      const { error } = await supabase.functions.invoke('send-email', {
        body: { 
          to: req.to, 
          template_id: req.template_id, 
          dynamic_data: emailData 
        }
      });
      
      if (error) throw error;

      // Log to communications table
      await supabase.from('order_communications').insert({
        order_id: order.id,
        recipient_email: req.to,
        template_id: req.template_id,
        subject: `Auto-Trigger: ${statusToCheck}`,
        body: `Template Sent: ${req.template_id}`,
        visibility: 'internal'
      });

      console.log(`✅ Email sent successfully to ${req.to}`);

    } catch (err: any) {
      console.error(`❌ Failed to send email to ${req.to}:`, err.message || err);
    }
  }));
};

// =====================================================================
// 6. CRUD OPERATIONS
// =====================================================================

export const createOrder = async (orderData: any, userEmail: string) => {
  const payload = { ...orderData, sales_agent: userEmail };

  const { data, error } = await supabase
    .from('orders')
    .insert([payload])
    .select()
    .single();

  if (error) throw error;

  await supabase.from('order_history').insert({
    order_id: data.id,
    user_email: userEmail,
    field_changed: 'ORDER_CREATED',
    new_value: 'Order Created'
  });

  const mappedOrder = mapDbToOrder(data);
  await triggerStatusEmail(mappedOrder, OrderStatus.NEW_ORDER);
  
  return mappedOrder;
};

export const updateOrderDetails = async (
  orderId: number, 
  updates: any, 
  oldOrder: Order, 
  userEmail: string
) => {
  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw error;

  const newOrder = mapDbToOrder(data);

  // ---------------------------------------------------------
  // Audit Logging
  // ---------------------------------------------------------
  const historyRecords = [];
  for (const key in updates) {
    const oldOrderKey = Object.keys(oldOrder).find(
      (k) => k.toLowerCase() === key.replace(/_/g, '').toLowerCase()
    ) as keyof Order;

    if (oldOrderKey) {
      const oldValue = oldOrder[oldOrderKey];
      const newValue = updates[key];
      let hasChanged = false;

      if (Array.isArray(oldValue) && Array.isArray(newValue)) {
        if (JSON.stringify(oldValue.sort()) !== JSON.stringify(newValue.sort())) {
          hasChanged = true;
        }
      } else if (oldValue !== newValue) {
        hasChanged = true;
      }

      if (hasChanged) {
        historyRecords.push({
          order_id: orderId,
          user_email: userEmail,
          field_changed: key,
          old_value: String(oldValue ?? 'N/A'),
          new_value: String(newValue ?? 'N/A'),
        });
      }
    }
  }

  // ---------------------------------------------------------
  // Trigger Status Email if Status Changed
  // ---------------------------------------------------------
  if (updates.status && updates.status !== oldOrder.status) {
    await triggerStatusEmail(newOrder, updates.status);
  }
  
  if (historyRecords.length > 0) {
    await supabase.from('order_history').insert(historyRecords);
  }

  await queryClient.invalidateQueries({ queryKey: ['allOrdersReport'] });

  return newOrder;
};