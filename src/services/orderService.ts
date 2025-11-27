import { supabase } from './supabaseClient';
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
  
  // --- PRODUCTION KICKOFF ---
  CUSTOMER_PAYMENT_NEEDED: '', 
  CUSTOMER_PRODUCTION_START: 'd-0dcf24e7ef3b4195b24ab4dfdf53cde8',
  INTERNAL_PRODUCTION_START: 'd-0a3e1e4cc4a74b49baf0de6b03823cef',
  
  // --- FULFILLMENT & CLOSING ---
  CUSTOMER_SHIPPED: 'd-30f79e97452342a7a2a42a3237a47479',
  CUSTOMER_DELIVERED: 'd-d0ab08ed143e4a62900c257d63167630', // ✅ Only Delivered ID
  CUSTOMER_FEEDBACK: 'd-563b0533e1d94a1bb830129a440c254b',  // ✅ Only Feedback ID
  CUSTOMER_REFUNDED: 'd-8da31b3c8aca485cb82203af044e6ba7',
};

const PRODUCTION_MANAGER_EMAIL = 'peacefulvibes2024@gmail.com';

// =====================================================================
// 2. HELPER FUNCTIONS
// =====================================================================

const mapDbToOrder = (data: any): Order => {
  return {
    id: data.id,
    orderNumber: data.order_number,
    customerName: data.customer_name,
    customerEmail: data.customer_email,
    customerPhone: data.customer_phone,
    customerProfileUrl: data.customer_profile_url,
    
    shippingAddress: data.shipping_address,
    shippingTrackingNumber: data.shipping_tracking_number,
    shippingCarrier: data.shipping_carrier,
    
    designName: data.design_name,
    patchesType: data.patches_type,
    patchesQuantity: data.patches_quantity,
    designSize: data.design_size,
    designBacking: data.design_backing,
    instructions: data.instructions,
    
    orderAmount: data.order_amount,
    amountPaid: data.amount_paid,
    productionCost: data.production_cost,
    shippingCost: data.shipping_cost,
    marketingCost: data.marketing_cost,
    profit: (data.order_amount || 0) - (data.production_cost || 0) - (data.shipping_cost || 0) - (data.marketing_cost || 0),
    amountRemaining: (data.order_amount || 0) - (data.amount_paid || 0),

    status: data.status,
    
    reasonCategory: data.reason_category,
    reasonDetails: data.reason_details,
    isUrgent: data.is_urgent,
    isUrgentApproved: data.is_urgent_approved,
    leadSource: data.lead_source,
    salesAgent: data.sales_agent,
    createdAt: data.created_at,
    updatedAt: data.updated_at,

    mockupUrls: data.mockup_urls || [],
    productionFileUrls: data.production_file_urls || [],
    shippingAttachmentUrls: data.shipping_attachment_urls || [],
    customerAttachmentUrls: data.customer_attachment_urls || [],
    
    revisionNotes: data.revision_notes,
    redoNotes: data.redo_notes
  } as Order;
};

// ✅ FIXED: Now this function is actually used
const getTrackingLink = (carrier: string, trackingNumber: string) => {
  if (!trackingNumber) return "#";
  const c = (carrier || "").toLowerCase().trim();
  const n = trackingNumber.trim();

  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
  if (c.includes('dhl')) return `https://www.dhl.com/en/express/tracking.html?AWB=${n}`;
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${n}`;
  if (c.includes('usps')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
  
  return `https://www.google.com/search?q=${n}`;
};

// =====================================================================
// 3. PREPARE EMAIL DATA - FIXED TRACKING LINK
// =====================================================================

const prepareEmailData = (order: Order, triggerStatus: string) => {
  
  // 1. SELECT FILES BASED ON STATUS
  let rawFiles: string[] = [];

  if (triggerStatus === 'NEW_ORDER') {
      rawFiles = order.customerAttachmentUrls || [];
  } else if (['SHIPPED', 'DELIVERED', 'FEEDBACK'].includes(triggerStatus)) {
      // For final stages, show Production files first, then Mockups
      rawFiles = [...(order.productionFileUrls || []), ...(order.mockupUrls || [])];
  } else {
      // For Approvals/Production, show Mockups
      rawFiles = order.mockupUrls || [];
      if (rawFiles.length === 0) rawFiles = order.customerAttachmentUrls || [];
  }

  // 2. ICONS
  const ICONS = {
    PDF: "https://cdn-icons-png.flaticon.com/512/4726/4726010.png",
    VECTOR: "https://cdn-icons-png.flaticon.com/512/136/136549.png", 
  };

  // 3. BUILD SMART LIST
  const processedFiles = rawFiles.map((url, index) => {
    // Clean the URL to find the extension correctly
    const cleanUrl = url.split('?')[0].toLowerCase(); 
    const filename = url.split('/').pop()?.split('?')[0] || `File-${index + 1}`;
    
    // ✅ ROBUST IMAGE DETECTION
    const isImage = cleanUrl.endsWith('.jpg') || 
                    cleanUrl.endsWith('.jpeg') || 
                    cleanUrl.endsWith('.png') || 
                    cleanUrl.endsWith('.gif') || 
                    cleanUrl.endsWith('.webp');

    let previewUrl = url;
    
    // If it is NOT an image, assign an icon
    if (!isImage) {
        if (cleanUrl.endsWith('.pdf')) previewUrl = ICONS.PDF;
        else previewUrl = ICONS.VECTOR;
    }

    return {
      name: filename,
      preview: previewUrl,
      url: url,
      is_image: isImage
    };
  });

  const safeOrderNumber = order.orderNumber || order.id || "Pending";

  // ✅ FIXED: Now includes tracking_link
  return {
    customer_name: order.customerName || "Valued Customer",
    email: order.customerEmail,
    phone: order.customerPhone || 'N/A',
    order_number: safeOrderNumber, 
    order_id: order.id, 
    design_name: order.designName || 'Custom Design',
    quantity: order.patchesQuantity || 'N/A',
    patch_type: order.patchesType || 'N/A',
    backing: order.designBacking || 'N/A',
    size: order.designSize || 'N/A',
    
    // ✅ The Smart List
    files_list: processedFiles,
    has_files: processedFiles.length > 0,
    
    total_price: `$${order.orderAmount?.toLocaleString()}`,
    amount_paid: `$${order.amountPaid?.toLocaleString()}`,
    amount_remaining: `$${order.amountRemaining?.toLocaleString()}`,
    
    order_link: `${window.location.origin}/order/${safeOrderNumber}`, 
    
    // ✅ FIXED: Add tracking link
    tracking_number: order.shippingTrackingNumber || "",
    carrier: order.shippingCarrier || "Carrier",
    tracking_link: getTrackingLink(order.shippingCarrier || "", order.shippingTrackingNumber || ""),
    
    revision_notes: order.revisionNotes || "Check Dashboard."
  };
};

// =====================================================================
// 4. TRIGGER LOGIC - FIXED: SEPARATED DELIVERED AND FEEDBACK
// =====================================================================

export const triggerStatusEmail = async (order: Order, statusToCheck: string) => {
  
  const emailData = prepareEmailData(order, statusToCheck);
  const requests: { to: string; template_id: string }[] = [];

  console.log(`📧 [Email Service] Triggering for Status: ${statusToCheck}`);
  
  switch (statusToCheck) {
    case OrderStatus.NEW_ORDER: 
      if (SENDGRID_TEMPLATES.CUSTOMER_NEW_ORDER) 
        requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_NEW_ORDER });
      if (SENDGRID_TEMPLATES.INTERNAL_NEW_ORDER) 
        requests.push({ to: PRODUCTION_MANAGER_EMAIL, template_id: SENDGRID_TEMPLATES.INTERNAL_NEW_ORDER });
      break;

    case OrderStatus.AWAITING_APPROVAL: 
      if (SENDGRID_TEMPLATES.CUSTOMER_MOCKUP_READY) 
        requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_MOCKUP_READY });
      break;

    case OrderStatus.REVISION_REQUESTED: 
      if (SENDGRID_TEMPLATES.CUSTOMER_REVISION_IN_PROGRESS) 
        requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_REVISION_IN_PROGRESS });
      if (SENDGRID_TEMPLATES.INTERNAL_REVISION_REQUESTED) 
        requests.push({ to: PRODUCTION_MANAGER_EMAIL, template_id: SENDGRID_TEMPLATES.INTERNAL_REVISION_REQUESTED });
      break;

    case OrderStatus.IN_PRODUCTION: 
    case OrderStatus.APPROVED: 
      if (order.amountRemaining > 0 && SENDGRID_TEMPLATES.CUSTOMER_PAYMENT_NEEDED) {
         requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_PAYMENT_NEEDED });
      } else {
         if (SENDGRID_TEMPLATES.CUSTOMER_PRODUCTION_START)
           requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_PRODUCTION_START });
         if (SENDGRID_TEMPLATES.INTERNAL_PRODUCTION_START)
           requests.push({ to: PRODUCTION_MANAGER_EMAIL, template_id: SENDGRID_TEMPLATES.INTERNAL_PRODUCTION_START });
      }
      break;

    case OrderStatus.SHIPPED: 
      if (SENDGRID_TEMPLATES.CUSTOMER_SHIPPED) 
        requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_SHIPPED });
      break;
      
    case OrderStatus.DELIVERED: 
      if (SENDGRID_TEMPLATES.CUSTOMER_DELIVERED)
        requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_DELIVERED });
      break;

    // ✅ FIXED: Now uses the standard Enum
    case OrderStatus.FEEDBACK: 
      if (SENDGRID_TEMPLATES.CUSTOMER_FEEDBACK)
        requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_FEEDBACK });
      break;

    case OrderStatus.REFUNDED: 
      if (SENDGRID_TEMPLATES.CUSTOMER_REFUNDED)
        requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_REFUNDED });
      break;
  }

  if (requests.length === 0) return;

  await Promise.all(requests.map(async (req) => {
    if (!req.to) {
        console.warn("⚠️ Skipping email: Recipient address is missing.");
        return;
    }
    
    try {
      const { error } = await supabase.functions.invoke('send-email', {
        body: { 
          to: req.to, 
          template_id: req.template_id, 
          dynamic_data: emailData 
        }
      });
      
      if (error) throw error;

      await supabase.from('order_communications').insert({
        order_id: order.id,
        recipient_email: req.to,
        template_id: req.template_id,
        subject: `Auto-Trigger: ${statusToCheck}`,
        body: `Template Sent: ${req.template_id}`,
        visibility: 'internal'
      });

      console.log(`✅ Email sent to ${req.to}`);

    } catch (err: any) {
      console.error(`❌ Failed to send email to ${req.to}:`, err);
    }
  }));
};

// =====================================================================
// 5. EXPORTED ACTIONS
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
  triggerStatusEmail(mappedOrder, OrderStatus.NEW_ORDER);
  
  return mappedOrder;
};

export const updateOrderDetails = async (orderId: number, updates: any, oldOrder: Order, userEmail: string) => {
  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw error;

  const newOrder = mapDbToOrder(data);

  if (updates.status && updates.status !== oldOrder.status) {
    await supabase.from('order_history').insert({
      order_id: orderId,
      user_email: userEmail,
      field_changed: 'status',
      old_value: oldOrder.status,
      new_value: updates.status
    });

    await triggerStatusEmail(newOrder, updates.status);
  }
  
  return newOrder;
};