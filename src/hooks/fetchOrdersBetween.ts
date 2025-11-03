import { supabase } from "../services/supabaseClient";
import { Order } from "../types";

export const fetchOrdersBetween = async (
  startIso: string,
  endIso: string
): Promise<Order[]> => {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id, status, instructions, packing, courier, created_by,
      orderNumber:order_number, customerName:customer_name, customerEmail:customer_email,
      customerPhone:customer_phone, shippingAddress:shipping_address, designName:design_name,
      designSize:design_size, designBacking:design_backing, patchesType:patches_type,
      patchesQuantity:patches_quantity, revisionNotes:revision_notes, customerAttachmentURLs:customer_attachment_urls,
      mockupURLs:mockup_urls, redoNotes:redo_notes, redoAttachments:redo_attachments,
      trackingNumber:tracking_number, orderAmount:order_amount, amountPaid:amount_paid,
      amountRemaining:amount_remaining, salesAgent:sales_agent, createdAt:created_at, updatedAt:updated_at, is_urgent, is_urgent_approved
    `)
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as Order[]) ?? [];
};