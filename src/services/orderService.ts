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
  // Leave empty string if you don't want to send an email for a specific step
  CUSTOMER_PAYMENT_NEEDED: '', 
  CUSTOMER_PRODUCTION_START: 'd-0dcf24e7ef3b4195b24ab4dfdf53cde8',
  INTERNAL_PRODUCTION_START: 'd-0a3e1e4cc4a74b49baf0de6b03823cef',
  
  // --- FULFILLMENT & CLOSING ---
  CUSTOMER_SHIPPED: 'd-30f79e97452342a7a2a42a3237a47479',
  CUSTOMER_DELIVERED: 'd-d0ab08ed143e4a62900c257d63167630',
  CUSTOMER_FEEDBACK: 'd-563b0533e1d94a1bb830129a440c254b',
  CUSTOMER_REFUNDED: 'd-8da31b3c8aca485cb82203af044e6ba7',
};

const PRODUCTION_MANAGER_EMAIL = 'peacefulvibes2024@gmail.com';

// =====================================================================
// 2. HELPER FUNCTIONS
// =====================================================================

/**
 * Converts Supabase DB response (snake_case) to App Model (camelCase).
 * CRITICAL: This ensures fields like 'customer_email' become 'customerEmail'
 * so the email logic doesn't crash on undefined values.
 */
const mapDbToOrder = (data: any): Order => {
  return {
    id: data.id,
    orderNumber: data.order_number,
    customerName: data.customer_name,
    customerEmail: data.customer_email, // ✅ Crucial Fix
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
    
    // ✅ ADD THESE
    reasonCategory: data.reason_category,
    reasonDetails: data.reason_details,
    isUrgent: data.is_urgent,
    isUrgentApproved: data.is_urgent_approved,
    leadSource: data.lead_source,
    salesAgent: data.sales_agent,
    createdAt: data.created_at,
    updatedAt: data.updated_at,

    // Arrays - Handle Nulls safely
    mockupUrls: data.mockup_urls || [],
    productionFileUrls: data.production_file_urls || [],
    shippingAttachmentUrls: data.shipping_attachment_urls || [],
    customerAttachmentUrls: data.customer_attachment_urls || [],
    
    revisionNotes: data.revision_notes,
    redoNotes: data.redo_notes
  } as Order;
};

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

const prepareEmailData = (order: Order) => {
  // Image Fallback Logic
  let mainImage = "https://via.placeholder.com/600x400?text=Panda+Patches+Order"; 
  let rawImages: string[] = [];

  if (order.mockupUrls && order.mockupUrls.length > 0) {
    rawImages = order.mockupUrls;
    mainImage = order.mockupUrls[0]; 
  } else if (order.customerAttachmentUrls && order.customerAttachmentUrls.length > 0) {
    rawImages = order.customerAttachmentUrls;
    mainImage = order.customerAttachmentUrls[0]; 
  }

  const imageGallery = rawImages.map(url => ({ src: url }));
  const carrier = order.shippingCarrier || "Carrier";
  const trackingNum = order.shippingTrackingNumber || "";
  const trackingLink = getTrackingLink(carrier, trackingNum);
  const adminLink = `${window.location.origin}/order/${order.orderNumber}`;

  return {
    // CUSTOMER INFO
    customer_name: order.customerName || "Valued Customer",
    email: order.customerEmail,
    phone: order.customerPhone || 'N/A',
    shipping_address: order.shippingAddress || 'N/A',
    
    // ORDER INFO
    order_number: order.orderNumber,
    order_date: new Date(order.createdAt).toLocaleDateString(),
    design_name: order.designName || 'Custom Design',
    patch_type: order.patchesType || 'N/A',
    quantity: order.patchesQuantity,
    size: order.designSize || 'N/A',
    backing: order.designBacking || 'N/A',
    
    // FINANCIALS
    total_price: `$${order.orderAmount?.toLocaleString()}`,
    amount_paid: `$${order.amountPaid?.toLocaleString()}`,
    amount_remaining: `$${order.amountRemaining?.toLocaleString()}`,
    
    // VISUALS
    design_image_url: mainImage,
    image_gallery: imageGallery,
    order_link: adminLink, 
    
    // SHIPPING (🟢 Sending ALL variations to prevent errors)
    tracking_number: trackingNum,
    carrier: carrier,
    tracking_link: trackingLink, 
    tracking_url: trackingLink,   // Just in case template uses this
    url: trackingLink,            // Just in case
    
    // INTERNAL
    sales_agent_name: order.salesAgent || "Panda Team",
    instructions: order.instructions || "None",
    revision_notes: order.revisionNotes || "Check Dashboard for details."
  };
};

// =====================================================================
// 3. THE TRIGGER LOGIC
// =====================================================================

export const triggerStatusEmail = async (order: Order, statusToCheck: string) => {
  const emailData = prepareEmailData(order);
  
  // Define requests array to handle multiple emails (Customer + Internal)
  const requests: { to: string; template_id: string }[] = [];

  console.log(`📧 [Email Service] Triggering for Status: ${statusToCheck}`);

  switch (statusToCheck) {
    case OrderStatus.NEW_ORDER: // 'NEW_ORDER'
      if (SENDGRID_TEMPLATES.CUSTOMER_NEW_ORDER) 
        requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_NEW_ORDER });
      if (SENDGRID_TEMPLATES.INTERNAL_NEW_ORDER) 
        requests.push({ to: PRODUCTION_MANAGER_EMAIL, template_id: SENDGRID_TEMPLATES.INTERNAL_NEW_ORDER });
      break;

    case OrderStatus.AWAITING_APPROVAL: // 'AWAITING_CUSTOMER_APPROVAL'
      if (SENDGRID_TEMPLATES.CUSTOMER_MOCKUP_READY) 
        requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_MOCKUP_READY });
      break;

    case OrderStatus.REVISION_REQUESTED: // 'REVISION_REQUESTED'
      if (SENDGRID_TEMPLATES.CUSTOMER_REVISION_IN_PROGRESS) 
        requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_REVISION_IN_PROGRESS });
      if (SENDGRID_TEMPLATES.INTERNAL_REVISION_REQUESTED) 
        requests.push({ to: PRODUCTION_MANAGER_EMAIL, template_id: SENDGRID_TEMPLATES.INTERNAL_REVISION_REQUESTED });
      break;

    case OrderStatus.IN_PRODUCTION: // 'IN_PRODUCTION'
    case OrderStatus.APPROVED: // 'APPROVED'
      if (order.amountRemaining > 0 && SENDGRID_TEMPLATES.CUSTOMER_PAYMENT_NEEDED) {
         requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_PAYMENT_NEEDED });
      } else {
         if (SENDGRID_TEMPLATES.CUSTOMER_PRODUCTION_START)
           requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_PRODUCTION_START });
         if (SENDGRID_TEMPLATES.INTERNAL_PRODUCTION_START)
           requests.push({ to: PRODUCTION_MANAGER_EMAIL, template_id: SENDGRID_TEMPLATES.INTERNAL_PRODUCTION_START });
      }
      break;

    case OrderStatus.SHIPPED: // 'SHIPPED'
      if (SENDGRID_TEMPLATES.CUSTOMER_SHIPPED) 
        requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_SHIPPED });
      break;
      
    case OrderStatus.DELIVERED: // 'DELIVERED'
      if (SENDGRID_TEMPLATES.CUSTOMER_DELIVERED)
        requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_DELIVERED });
      if (SENDGRID_TEMPLATES.CUSTOMER_FEEDBACK)
        requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_FEEDBACK });
      break;

    case OrderStatus.REFUNDED: // 'REFUNDED'
      if (SENDGRID_TEMPLATES.CUSTOMER_REFUNDED)
        requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_REFUNDED });
      break;
  }

  if (requests.length === 0) return;

  // Execute all email requests in parallel
  await Promise.all(requests.map(async (req) => {
    if (!req.to) {
        console.warn("⚠️ Skipping email: Recipient address is missing.");
        return;
    }
    
    try {
      // Calls Supabase Edge Function 'send-email'
      const { error } = await supabase.functions.invoke('send-email', {
        body: { 
          to: req.to, 
          template_id: req.template_id, 
          dynamic_data: emailData 
        }
      });
      
      if (error) {
         // Edge function returned a 400 or 500
         throw error;
      }

      // Log success in DB
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
// 4. EXPORTED ACTIONS (Service Methods)
// =====================================================================

export const createOrder = async (orderData: any, userEmail: string) => {
  // Ensure sales_agent is attached
  const payload = { ...orderData, sales_agent: userEmail };

  const { data, error } = await supabase
    .from('orders')
    .insert([payload])
    .select()
    .single();

  if (error) throw error;

  // Log Creation
  await supabase.from('order_history').insert({
    order_id: data.id,
    user_email: userEmail,
    field_changed: 'ORDER_CREATED',
    new_value: 'Order Created'
  });

  // Convert DB Snake_Case -> App CamelCase
  const mappedOrder = mapDbToOrder(data);
  
  // Trigger Welcome Emails
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

  // ✅ CRITICAL FIX: Convert snake_case (DB) to CamelCase (App/Email)
  const newOrder = mapDbToOrder(data);

  // If status changed, log it and check for email triggers
  if (updates.status && updates.status !== oldOrder.status) {
    await supabase.from('order_history').insert({
      order_id: orderId,
      user_email: userEmail,
      field_changed: 'status',
      old_value: oldOrder.status,
      new_value: updates.status
    });

    // Pass the CLEAN 'newOrder' object, not the raw 'data'
    await triggerStatusEmail(newOrder, updates.status);
  }
  
  return newOrder;
};