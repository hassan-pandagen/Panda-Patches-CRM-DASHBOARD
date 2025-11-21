import { supabase } from './supabaseClient';
import { Order, OrderStatus } from '../types';

// --- 1. TEMPLATE CONFIGURATION ---
const SENDGRID_TEMPLATES = {
  CUSTOMER_NEW_ORDER: 'd-fcd19c2e3d242a4b0e1bf3087179c7d', // Your ID
  INTERNAL_NEW_ORDER: '', // Add ID
  CUSTOMER_MOCKUP_READY: '', // Add ID
  CUSTOMER_PAYMENT_NEEDED: '', // Add ID
  CUSTOMER_PRODUCTION_START: '', // Add ID
  INTERNAL_PRODUCTION_START: '', // Add ID
  CUSTOMER_SHIPPED: '', // Add ID
};

const PRODUCTION_MANAGER_EMAIL = 'hello@pandapatches.com';

// --- 2. DATA PREPARATION ---
const prepareEmailData = (order: Order) => {
  let mainImage = "https://via.placeholder.com/600x400?text=Panda+Patches+Order"; 

  // Image Priority: Mockup > Customer Ref > Placeholder
  if (order.mockupUrls && order.mockupUrls.length > 0) {
    mainImage = order.mockupUrls[0]; 
  } else if (order.customerAttachmentUrls && order.customerAttachmentUrls.length > 0) {
    mainImage = order.customerAttachmentUrls[0]; 
  }

  const adminLink = `${window.location.origin}/order/${order.orderNumber}`;

  return {
    customer_name: order.customerName,
    email: order.customerEmail,
    phone: order.customerPhone || 'N/A',
    shipping_address: order.shippingAddress || 'N/A',
    order_number: order.orderNumber,
    order_date: new Date(order.createdAt).toLocaleDateString(),
    design_name: order.designName || 'Custom Design',
    patch_type: order.patchesType || 'N/A',
    quantity: order.patchesQuantity,
    size: order.designSize || 'N/A',
    backing: order.designBacking || 'N/A',
    total_price: `$${order.orderAmount?.toLocaleString()}`,
    amount_paid: `$${order.amountPaid?.toLocaleString()}`,
    amount_remaining: `$${order.amountRemaining?.toLocaleString()}`,
    design_image_url: mainImage,
    order_link: adminLink, 
    tracking_number: order.shippingTrackingNumber || "Pending",
    carrier: order.shippingCarrier || "Carrier",
    sales_agent_name: order.salesAgent,
    instructions: order.instructions || "None"
  };
};

// --- 3. EMAIL TRIGGER ---
export const triggerStatusEmail = async (order: Order, statusToCheck: string) => {
  const emailData = prepareEmailData(order);
  const requests = [];

  console.log(`[Email Trigger] Checking triggers for status: ${statusToCheck}`);

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

    case OrderStatus.IN_PRODUCTION:
    case OrderStatus.APPROVED:
      if (order.amountRemaining > 0 && SENDGRID_TEMPLATES.CUSTOMER_PAYMENT_NEEDED) {
           requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_PAYMENT_NEEDED });
      } else if (SENDGRID_TEMPLATES.CUSTOMER_PRODUCTION_START) {
           requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_PRODUCTION_START });
      }
      break;

    case OrderStatus.SHIPPED:
      if (SENDGRID_TEMPLATES.CUSTOMER_SHIPPED) 
        requests.push({ to: order.customerEmail, template_id: SENDGRID_TEMPLATES.CUSTOMER_SHIPPED });
      break;
  }

  if (requests.length === 0) return;

  await Promise.all(requests.map(async (req) => {
    try {
      const { error } = await supabase.functions.invoke('send-email', {
        body: { to: req.to, template_id: req.template_id, dynamic_data: emailData }
      });
      if (error) throw error;

      await supabase.from('order_communications').insert({
        order_id: order.id,
        recipient_email: req.to,
        template_id: req.template_id,
        subject: `Auto-Trigger: ${statusToCheck}`,
        body: `Template: ${req.template_id}`,
        visibility: 'internal'
      });
    } catch (err) {
      console.error(`Failed to send email to ${req.to}:`, err);
    }
  }));
};

// --- 4. CREATE ORDER (Handles "New Order" Email) ---
export const createOrder = async (orderData: any, userEmail: string) => {
  // 1. Insert into DB
  const { data, error } = await supabase
    .from('orders')
    .insert([{ ...orderData, created_by: undefined }]) // Ensure we don't pass undefined fields if they conflict
    .select()
    .single();

  if (error) throw error;

  // 2. Log History
  await supabase.from('order_history').insert({
    order_id: data.id,
    user_email: userEmail,
    field_changed: 'ORDER_CREATED',
    new_value: 'Order Created'
  });

  // 3. Trigger "New Order" Emails
  // We cast data to Order to ensure Typescript is happy
  triggerStatusEmail(data as Order, OrderStatus.NEW_ORDER);

  return data;
};

// --- 5. UPDATE ORDER (Handles Status Change Emails) ---
export const updateOrderDetails = async (orderId: number, updates: any, oldOrder: Order, userEmail: string) => {
  // 1. Update DB
  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw error;

  const newOrder = data as Order;

  // 2. Check for Status Change & Trigger Email
  if (updates.status && updates.status !== oldOrder.status) {
    // Log Status Change
    await supabase.from('order_history').insert({
      order_id: orderId,
      user_email: userEmail,
      field_changed: 'status',
      old_value: oldOrder.status,
      new_value: updates.status
    });

    // FIRE EMAIL TRIGGER
    triggerStatusEmail(newOrder, updates.status);
  }

  return newOrder;
};