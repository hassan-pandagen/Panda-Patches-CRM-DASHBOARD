// src/services/quoteService.ts - Quote Management Service

import { supabase } from './supabaseClient';
import { queryClient } from './queryClient';
import { queryKeys } from '../constants/queryKeys';
import { Quote, Order, OrderStatus } from '../types/index';
import { logger } from './logger';

const SENDGRID_TEMPLATES = {
  CUSTOMER_QUOTE: 'd-fcd19c2e3d2d42a4b0e1bf3087179c7d',
  INTERNAL_QUOTE: 'd-c74e2abd9bb54b79b994aa53b654c374',
};

const PRODUCTION_EMAIL = 'lilcustomerzdesign@gmail.com';
const DESIGN_TEAM_CC = 'design@pandapatches.com';

const toSnakeCase = (data: any): any => {
  if (!data || typeof data !== 'object') return {};

  const readOnlyFields = new Set([
    'id', 'quoteNumber', 'createdAt', 'updatedAt', 'emailSentAt'
  ]);

  const snakeCaseObject: { [key: string]: any } = {};

  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key) && !readOnlyFields.has(key)) {
      const value = data[key];
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      snakeCaseObject[snakeKey] = value === undefined ? null : value;
    }
  }

  // Ensure arrays are arrays, not null
  const arrayFields = ['mockupUrls', 'customerAttachmentUrls'];
  arrayFields.forEach(field => {
    if (data[field] !== undefined) {
      const snakeKey = field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      snakeCaseObject[snakeKey] = Array.isArray(data[field]) ? data[field] : [];
    }
  });

  return snakeCaseObject;
};

export const mapDbToQuote = (data: any): Quote => {
  if (!data) return null as any;

  const toNumber = (val: any) => {
    if (val === null || val === undefined || val === '') return undefined;
    const num = Number(val);
    return isNaN(num) ? undefined : num;
  };

  return {
    id: data.id,
    quoteNumber: data.quoteNumber ?? data.quote_number,
    customerName: data.customerName ?? data.customer_name,
    customerEmail: data.customerEmail ?? data.customer_email,
    customerPhone: data.customerPhone ?? data.customer_phone,
    customerProfileUrl: data.customerProfileUrl ?? data.customer_profile_url,
    
    designName: data.designName ?? data.design_name,
    patchesType: data.patchesType ?? data.patches_type,
    patchesQuantity: toNumber(data.patchesQuantity ?? data.patches_quantity),
    designSize: data.designSize ?? data.design_size,
    designBacking: data.designBacking ?? data.design_backing,
    instructions: data.instructions,
    
    estimatedAmount: toNumber(data.estimatedAmount ?? data.estimated_amount),
    
    salesAgent: data.salesAgent ?? data.sales_agent,
    leadSource: data.leadSource ?? data.lead_source,
    
    notes: data.notes,
    mockupUrls: Array.isArray(data.mockupUrls ?? data.mockup_urls) ? (data.mockupUrls ?? data.mockup_urls) : [],
    customerAttachmentUrls: Array.isArray(data.customerAttachmentUrls ?? data.customer_attachment_urls) ? (data.customerAttachmentUrls ?? data.customer_attachment_urls) : [],
    
    createdAt: data.createdAt ?? data.created_at,
    updatedAt: data.updatedAt ?? data.updated_at,
    emailSentAt: data.emailSentAt ?? data.email_sent_at ?? null,
  };
};

// Generate QT-series quote number
const generateQuoteNumber = async (): Promise<string> => {
  const { data } = await supabase
    .from('quotes')
    .select('quote_number', { count: 'exact' })
    .order('id', { ascending: false })
    .limit(1);

  const count = (data?.length ?? 0) + 1;
  return `QT-${String(count).padStart(5, '0')}`;
};

// Send quote emails (customer + internal team)
export const sendQuoteEmail = async (quote: Quote): Promise<void> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      logger.warn('No session for email sending');
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    // Prepare mockup files for email (similar to order service)
    const getFileName = (url: string): string => {
      try {
        return url ? url.split('/').pop()?.split('?')[0] || 'file' : 'file';
      } catch {
        return 'file';
      }
    };

    const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(url.toLowerCase());
    const mockupUrls = quote.mockupUrls || [];
    const sortedMockups = [...mockupUrls].reverse();
    const winnerUrl = sortedMockups.find(url => isImage(url)) || sortedMockups[0] || "";
    const galleryUrls = sortedMockups.filter(url => url !== winnerUrl);

    // Email data for both customer and internal
    const emailData = {
      customer_name: quote.customerName,
      quote_number: quote.quoteNumber,
      design_name: quote.designName,
      quantity: quote.patchesQuantity,
      patch_type: quote.patchesType,
      design_backing: quote.designBacking,
      size: quote.designSize,
      instructions: quote.instructions || '',
      estimated_amount: quote.estimatedAmount ? `$${(quote.estimatedAmount).toLocaleString()}` : 'TBD',
      sales_agent: quote.salesAgent,
      // Add mockup files for SendGrid processing
      winner_file: winnerUrl ? { url: winnerUrl, file_name: getFileName(winnerUrl) } : null,
      gallery_files: galleryUrls.map(url => ({ url, file_name: getFileName(url) })),
      has_winner: !!winnerUrl,
      has_gallery: galleryUrls.length > 0,
    };

    // 1. Send to Customer
    const customerResponse = await fetch(
      `${supabaseUrl}/functions/v1/send-email`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: quote.customerEmail,
          template_id: SENDGRID_TEMPLATES.CUSTOMER_QUOTE,
          dynamic_data: emailData,
          cc: 'lance@pandapatches.com',
        }),
      }
    );

    if (!customerResponse.ok) {
      const errorText = await customerResponse.text();
      logger.error('Customer email failed', { error: errorText });
      throw new Error(`Email send failed: ${errorText}`);
    } else {
      logger.info('Customer quote email sent', { quoteNumber: quote.quoteNumber, to: quote.customerEmail });
      // Stamp email_sent_at so the UI can show "Quote Sent" badge
      await supabase
        .from('quotes')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('quote_number', quote.quoteNumber);
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes?.all?.() });
    }

    // 2. Send to Production Team with Design CC
    const internalResponse = await fetch(
      `${supabaseUrl}/functions/v1/send-email`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: PRODUCTION_EMAIL,
          cc: DESIGN_TEAM_CC,
          template_id: SENDGRID_TEMPLATES.INTERNAL_QUOTE,
          dynamic_data: {
            ...emailData,
            customer_phone: quote.customerPhone || 'N/A',
            customer_email: quote.customerEmail,
            mockup_count: quote.mockupUrls?.length || 0,
          },
        }),
      }
    );

    if (!internalResponse.ok) {
      const errorText = await internalResponse.text();
      logger.error('Internal email failed', { error: errorText, to: PRODUCTION_EMAIL });
    } else {
      logger.info('Internal quote email sent', { quoteNumber: quote.quoteNumber, to: PRODUCTION_EMAIL });
    }
  } catch (error) {
    logger.error('Failed to send quote emails', error);
    // Don't throw - email failure shouldn't block quote creation
  }
};

// Create a new quote
export const createQuote = async (quoteData: Omit<Quote, 'id' | 'quoteNumber' | 'createdAt' | 'updatedAt'>): Promise<Quote> => {
  try {
    const quoteNumber = await generateQuoteNumber();

    const snakeCaseData = toSnakeCase({
      ...quoteData,
      quoteNumber,
    });

    const { data, error } = await supabase
      .from('quotes')
      .insert([snakeCaseData])
      .select()
      .single();

    if (error) throw error;

    const quote = mapDbToQuote(data);

    // Invalidate quotes list cache
    queryClient.invalidateQueries({ queryKey: queryKeys.quotes?.all?.() });

    logger.info('Quote created successfully', { quoteNumber });
    
    // Send confirmation email to customer
    await sendQuoteEmail(quote);
    
    return quote;
  } catch (error) {
    logger.error('Failed to create quote', error);
    throw error;
  }
};

// Get all quotes
export const getAllQuotes = async (): Promise<Quote[]> => {
  try {
    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(mapDbToQuote);
  } catch (error) {
    logger.error('Failed to fetch quotes', error);
    throw error;
  }
};

// Get single quote
export const getQuoteByNumber = async (quoteNumber: string): Promise<Quote> => {
  try {
    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('quote_number', quoteNumber)
      .single();

    if (error) throw error;

    return mapDbToQuote(data);
  } catch (error) {
    logger.error('Failed to fetch quote', error);
    throw error;
  }
};

// Update a quote
export const updateQuote = async (quoteNumber: string, updates: Partial<Quote>): Promise<Quote> => {
  try {
    const snakeCaseData = toSnakeCase(updates);

    const { data, error } = await supabase
      .from('quotes')
      .update(snakeCaseData)
      .eq('quote_number', quoteNumber)
      .select()
      .single();

    if (error) throw error;

    const quote = mapDbToQuote(data);

    // Invalidate caches
    queryClient.invalidateQueries({ queryKey: queryKeys.quotes?.all?.() });

    logger.info('Quote updated successfully', { quoteNumber });

    return quote;
  } catch (error) {
    logger.error('Failed to update quote', error);
    throw error;
  }
};

// Convert quote to order
export const convertQuoteToOrder = async (quote: Quote): Promise<Order> => {
  try {
    const { createOrder } = await import('./orderService');
    const { data: { session } } = await supabase.auth.getSession();
    const userEmail = session?.user?.email || 'system@pandapatches.com';

    // Create order from quote data
    const orderData = {
      customerName: quote.customerName,
      customerEmail: quote.customerEmail,
      customerPhone: quote.customerPhone || '',
      customerProfileUrl: quote.customerProfileUrl || '',
      
      designName: quote.designName || '',
      patchesQuantity: quote.patchesQuantity || 0,
      patchesType: quote.patchesType || '',
      designSize: quote.designSize || '',
      designBacking: quote.designBacking || '',
      instructions: quote.instructions || '',
      
      orderAmount: quote.estimatedAmount || 0,
      amountPaid: 0,
      productionCost: 0,
      shippingCost: 0,
      marketingCost: 0,
      
      salesAgent: quote.salesAgent,
      leadSource: quote.leadSource || '',
      
      shippingAddress: '',
      shippingCarrier: '',
      shippingTrackingNumber: '',
      isUrgent: false,
      mockupUrls: quote.mockupUrls || [],
      customerAttachmentUrls: quote.customerAttachmentUrls || [],
      productionFileUrls: [],
      shippingAttachmentUrls: [],
      redoAttachments: [],
    };

    const order = await createOrder(orderData, userEmail);

    // Delete the quote after successful conversion
    await deleteQuote(quote.quoteNumber);
    
    // Invalidate quotes list cache to refresh UI
    queryClient.invalidateQueries({ queryKey: queryKeys.quotes?.all?.() });

    logger.info('Quote converted to order successfully', { quoteNumber: quote.quoteNumber, orderNumber: order.orderNumber });

    return order;
  } catch (error) {
    logger.error('Failed to convert quote to order', error);
    throw error;
  }
};

// Mark quote as sent manually (no email sent — for Instagram/WhatsApp/Tawk.to quotes)
export const markQuoteAsSent = async (quoteNumber: string): Promise<void> => {
  const { error } = await supabase
    .from('quotes')
    .update({ email_sent_at: new Date().toISOString() })
    .eq('quote_number', quoteNumber);

  if (error) throw error;

  queryClient.invalidateQueries({ queryKey: queryKeys.quotes?.all?.() });
  logger.info('Quote marked as sent manually', { quoteNumber });
};

// Delete a quote
export const deleteQuote = async (quoteNumber: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('quotes')
      .delete()
      .eq('quote_number', quoteNumber);

    if (error) throw error;

    // Invalidate quotes list cache
    queryClient.invalidateQueries({ queryKey: queryKeys.quotes?.all?.() });

    logger.info('Quote deleted successfully', { quoteNumber });
  } catch (error) {
    logger.error('Failed to delete quote', error);
    throw error;
  }
};
