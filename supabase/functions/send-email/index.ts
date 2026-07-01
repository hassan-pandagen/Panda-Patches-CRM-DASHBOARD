// ✅ MIGRATED FROM AWS SES TO ZEPTOMAIL REST API
// Date: 2026-01-17
// Migration Reason: AWS SES stuck in sandbox, moving to ZeptoMail (10K free emails/month)
// Note: Using simplified approach with plain text fallback due to HTML size limits

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const ALLOWED_ORIGINS = [
  'https://portal.pandapatches.com',                // CRM (staff)
  'https://panda-patches-crm-dashboard.vercel.app', // CRM (vercel)
  'https://pandapatches.com',                       // marketing website
  'https://www.pandapatches.com',                   // marketing website (www)
];

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost:');
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ✅ BACKEND VALIDATION: Zod schema for email requests
const sendEmailSchema = z.object({
  to: z.string()
    .email("Invalid recipient email format")
    .max(255, "Email too long"),

  template_id: z.string()
    .min(1, "Template ID is required")
    .max(100, "Template ID too long"),

  dynamic_data: z.record(z.any()),

  cc: z.string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const emails = val.split(',').map(e => e.trim());
        return emails.every(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
      },
      { message: "CC contains invalid email format" }
    ),

  from_email: z.string().email().optional(),
});

// 1. Helper: Get Clean Filename — strip timestamp/UUID prefix, preserve original name
const getFileName = (url: string) => {
  try {
      const raw = decodeURIComponent(url.split('/').pop() || 'file').split('?')[0];
      return raw.replace(/^(mockup_)?\d{10,}_/, '').replace(/^[a-f0-9-]{36}\./, '') || raw;
  } catch { return 'file'; }
};

// 2. Helper: Get Email Subject based on Template ID
const getEmailSubject = (templateId: string, data: any): string => {
  const orderNumber = data.order_number || data.quote_number || 'N/A';

  const subjects: Record<string, string> = {
    // Quote templates
    'd-fcd19c2e3d2d42a4b0e1bf3087179c7d': `Your Custom Patch Quote - ${orderNumber}`,
    'd-c74e2abd9bb54b79b994aa53b654c374': `[INTERNAL] New Quote Request - ${orderNumber}`,

    // Order flow templates
    'CUSTOMER_NEW_ORDER': `Order Confirmation - ${orderNumber}`,
    'CUSTOMER_MOCKUP_READY': `Your Mockup is Ready! - ${orderNumber}`,
    'CUSTOMER_REVISION_IN_PROGRESS': `Revision in Progress - ${orderNumber}`,
    'CUSTOMER_PRODUCTION_STARTED': `Production Started - ${orderNumber}`,
    'CUSTOMER_SHIPPED': `Your Order Has Shipped! - ${orderNumber}`,
    'CUSTOMER_DELIVERED': `Order Delivered - ${orderNumber}`,
    'CUSTOMER_FEEDBACK_REQUEST': `How Was Your Experience? - ${orderNumber}`,
    'CUSTOMER_REFUND_ISSUED': `Refund Processed - ${orderNumber}`,

    // Internal templates
    'INTERNAL_NEW_ORDER': `[INTERNAL] New Order - ${orderNumber}`,
    'INTERNAL_START_PRODUCTION': `[INTERNAL] Start Production - ${orderNumber}`,
    'PRODUCTION_TEAM_REVISION': `[INTERNAL] Revision Requested - ${orderNumber}`,
    'QUALITY_ASSURANCE': `[INTERNAL] QA Check - ${orderNumber}`,

    // Remake templates
    'CUSTOMER_REMAKE': `We're Making It Right - ${orderNumber}${data.remake_reason ? ` (${data.remake_reason})` : ''}`,
    'INTERNAL_REMAKE': `[URGENT] Remake Required - ${orderNumber}${data.remake_reason ? ` — ${data.remake_reason}` : ''}`,

    // Payment templates
    'CUSTOMER_PAYMENT_CONFIRMATION': `Payment Received - ${orderNumber}`,
    'INTERNAL_PAYMENT_NOTIFICATION': `[INTERNAL] Payment Received - ${orderNumber}`,

    // Customer portal invite templates
    'CUSTOMER_WELCOME_INVITE': `Welcome to Panda Patches — Set Up Your Account`,
    'CUSTOMER_RETURNING_LOGIN': `Track Your New Order - ${orderNumber}`,
    'CUSTOMER_PASSWORD_RESET': `Reset Your Panda Patches Portal Password`,

    // Website auth templates (pandapatches.com customer portal)
    'WEBSITE_AUTH_SIGNUP_CONFIRM':  'Confirm your Panda Patches account',
    'WEBSITE_AUTH_MAGIC_LINK':      'Your sign-in link for Panda Patches',
    'WEBSITE_AUTH_PASSWORD_RESET':  'Reset your Panda Patches password',
    'WEBSITE_AUTH_EMAIL_CHANGE':    'Confirm your new Panda Patches email',
    'WEBSITE_AUTH_ORDER_ACCOUNT':   'Your Panda Patches account is ready',

    // Order message thread templates
    'AGENT_NEW_CUSTOMER_MESSAGE': `[Customer Message] ${data.customer_name || 'A customer'} replied on order ${orderNumber}`,
    'CUSTOMER_NEW_AGENT_MESSAGE': `New message on your order ${orderNumber}`,

    // Square payment link sent by agent
    'CUSTOMER_PAYMENT_LINK': `Payment link for your Panda Patches order ${orderNumber}`,
  };

  return subjects[templateId] || `Update from Panda Patches - ${orderNumber}`;
};

// 3. Helper: Get Template Message based on Template ID
const getTemplateMessage = (templateId: string, data?: any): string => {
  const remakeReason = data?.remake_reason || '';
  const customerRemakeMessages: Record<string, string> = {
    'Package Lost': 'We are sorry to inform you that your package was lost during shipping. This is not the experience we want for our customers. We are remaking your custom patches at absolutely no extra cost to you and will ensure secure delivery this time.',
    'Quality Issues': 'We sincerely apologize — our production team did not meet the quality standards you deserved. This is entirely our fault, and we take full responsibility. We are remaking your custom patches at absolutely no extra cost to you.',
    'Handling Issues': 'We apologize for the handling issues with your order. Your patches were damaged and did not arrive in the condition we intended. We are remaking your custom patches at absolutely no extra cost to you.',
    'Force Majeure': 'Due to unforeseen circumstances beyond our control, your order was affected. We sincerely apologize for the inconvenience. We are remaking your custom patches at absolutely no extra cost to you.',
  };
  const internalRemakeMessages: Record<string, string> = {
    'Package Lost': 'URGENT REMAKE REQUIRED — PACKAGE LOST: The customer\'s package was lost in transit. This order needs to be remade and shipped immediately with tracking confirmation.',
    'Quality Issues': 'URGENT REMAKE REQUIRED — QUALITY ISSUES: The patches did not meet quality standards. Remake immediately. Review all specs carefully and double-check quality before shipping.',
    'Handling Issues': 'URGENT REMAKE REQUIRED — HANDLING ISSUES: The patches were damaged due to handling. Remake immediately and ensure proper packaging for shipment.',
    'Force Majeure': 'URGENT REMAKE REQUIRED — FORCE MAJEURE: The order was affected by circumstances beyond control. Remake immediately and prioritize this order.',
  };

  const messages: Record<string, string> = {
    // Quote templates
    'd-fcd19c2e3d2d42a4b0e1bf3087179c7d': 'Here\'s the quote you requested for your custom patches! Please review the details below. If you have any questions, would like to discuss the details, or are ready to move forward, simply reply to this email and our team will be happy to assist you.',
    'd-c74e2abd9bb54b79b994aa53b654c374': 'Internal: New quote request received. Please review the specifications and prepare the mockup.',

    // Order flow templates
    'CUSTOMER_NEW_ORDER': 'Thank you for your order! We\'re excited to bring your custom patch design to life. Our team has received your order and will begin working on it shortly.',
    'CUSTOMER_MOCKUP_READY': 'Exciting news! Your custom patch mockup is ready for review. Please take a look at the design and let us know if you\'d like any changes.',
    'CUSTOMER_REVISION_IN_PROGRESS': 'We\'re working on the revisions you requested. Our design team is making the changes to ensure your custom patches are exactly what you envisioned.',
    'CUSTOMER_PRODUCTION_STARTED': 'Great news! Your custom patches have moved into production. Our team is now creating your patches with care and attention to detail.',
    'CUSTOMER_SHIPPED': 'Your order is on its way! Your custom patches have been shipped and should arrive soon. Below you\'ll find your tracking information.',
    'CUSTOMER_DELIVERED': 'Your custom patches have been delivered! We hope you love them. If you have any feedback or need anything else, please let us know.',
    'CUSTOMER_FEEDBACK_REQUEST': 'We\'d love to hear your thoughts! How did we do? Your feedback helps us improve and serve you better.',
    'CUSTOMER_REFUND_ISSUED': 'A refund has been processed for your order. The funds should appear in your account within 5-7 business days.',

    // Internal templates
    'INTERNAL_NEW_ORDER': 'Internal: New customer order received. Please review and begin mockup creation.',
    'INTERNAL_START_PRODUCTION': 'Internal: Order approved by customer. Begin production immediately.',
    'PRODUCTION_TEAM_REVISION': 'Production Team: Customer has requested revisions. Please review the feedback and update the mockup.',
    'QUALITY_ASSURANCE': 'Quality Assurance: Order ready for final QA check before shipping.',

    // Remake templates (dynamic based on reason, with fallback)
    'CUSTOMER_REMAKE': customerRemakeMessages[remakeReason] || 'We sincerely apologize for the inconvenience with your order. Our production team did not meet the quality standards you deserved. This is entirely our fault, and we take full responsibility. We are remaking your custom patches at absolutely no extra cost to you. Your satisfaction is our top priority, and we will make this right.',
    'INTERNAL_REMAKE': internalRemakeMessages[remakeReason] || 'URGENT REMAKE REQUIRED: The customer was not satisfied with the patches we produced. This order needs to be remade immediately. Please contact the sales agent to get full details about what the customer wants changed. Review all specifications carefully and ask questions if anything is unclear. This is our second chance to get it right - quality check everything before shipping.',

    // Payment templates
    'CUSTOMER_PAYMENT_CONFIRMATION': 'We have received your payment — thank you! Your order is confirmed. Here\'s what happens next: our design team will send your mockup within 24 hours for approval, and once you approve it your order moves straight into production. Track every step below.',
    'INTERNAL_PAYMENT_NOTIFICATION': 'A payment has been recorded for this order. Please review the payment details below and update records accordingly.',

    // Customer portal invite templates
    'CUSTOMER_WELCOME_INVITE': 'Thank you for your order! We\'ve created a Customer Portal account for you so you can track your order in real time, view your mockups, and see every step of your patch journey. Tap the button below to set your password — takes less than 30 seconds.',
    'CUSTOMER_RETURNING_LOGIN': 'Thank you for your new order! Your Customer Portal is ready — tap the button below to log in and track this order along with your previous ones. The link expires in 1 hour; after that, just sign in with your email and password.',
    'CUSTOMER_PASSWORD_RESET': 'A password reset was requested for your Panda Patches Customer Portal. Tap the button below to choose a new password. The link expires in 1 hour. If you didn\'t request this, you can safely ignore this email.',

    // Website auth templates (pandapatches.com customer portal)
    'WEBSITE_AUTH_SIGNUP_CONFIRM':
      'Thanks for creating a Panda Patches account! To finish setting up your account, please confirm your email address by clicking the button below. Once confirmed you can track every order in real time, view your mockups, and reorder past designs in one click.',
    'WEBSITE_AUTH_MAGIC_LINK':
      'Use the button below to sign in to your Panda Patches account. This link signs you in instantly — no password needed. The link is good for the next 60 minutes and can only be used once.',
    'WEBSITE_AUTH_PASSWORD_RESET':
      'We received a request to reset the password for your Panda Patches account. Click the button below to set a new password. The link is good for the next 60 minutes and can only be used once. If you did not request this, you can ignore this email — your password will stay the same.',
    'WEBSITE_AUTH_EMAIL_CHANGE':
      `We received a request to change the email address on your Panda Patches account to ${data?.new_email || 'a new address'}. Confirm the change by clicking the button below. The change does not take effect until you click the link. If you did not request this, you can ignore this email.`,
    'WEBSITE_AUTH_ORDER_ACCOUNT':
      `Thanks for your order${data?.order_number && data.order_number !== 'N/A' ? ` (${data.order_number})` : ''}! We've set up a Panda Patches account for you so you can track this order in real time, view your mockups, and reorder past designs in one click. Tap the button below to set your password — it takes less than 30 seconds. The link is valid for 24 hours; if it expires, just use “Forgot password” on the site and we'll send you a fresh one.`,

    // Order message thread templates
    'AGENT_NEW_CUSTOMER_MESSAGE': `${data?.customer_name || 'A customer'} just sent a message on order ${data?.order_number || ''}.\n\nMessage: "${(data?.message_content || '').substring(0, 1000)}"\n\nReply through the order in the CRM to keep the conversation in one place.`,
    'CUSTOMER_NEW_AGENT_MESSAGE': `Your account manager just replied on order ${data?.order_number || ''}.\n\n"${(data?.message_content || '').substring(0, 1000)}"\n\nView the full conversation and reply in your portal.`,

    // Square payment link
    'CUSTOMER_PAYMENT_LINK': `Hi ${data?.customer_name || 'there'}, here's your secure payment link for order ${data?.order_number || ''} (${data?.payment_kind || 'payment'} — ${data?.amount || ''}). Tap the button below to pay securely with Square. Once paid, your order moves to the next stage automatically. Thank you!`,
  };

  return messages[templateId] || 'Thank you for your order! Our team is working on your custom patches.';
};

// 3b. Helper: Get Closing Message based on Template ID
const getClosingMessage = (templateId: string, data: any): string => {
  // Internal emails - no closing message needed
  if (templateId.includes('INTERNAL')) {
    return '';
  }

  // Quote templates get special message
  if (data.quote_number) {
    return 'Once you approve this quote, we will proceed with your order immediately.';
  }

  const closingMessages: Record<string, string> = {
    // Delivered - celebratory & feedback request
    'CUSTOMER_DELIVERED': 'We hope we did justice to your vision! We\'d love to hear your feedback.',

    // Shipped - excitement about delivery
    'CUSTOMER_SHIPPED': 'We can\'t wait for you to receive your patches! Let us know if you have any questions.',

    // Feedback request
    'CUSTOMER_FEEDBACK_REQUEST': 'Your feedback helps us improve and serve you better.',

    // Refund - apologetic tone
    'CUSTOMER_REFUND_ISSUED': 'We apologize for any inconvenience. Please let us know if you need anything else.',

    // Remake - apologetic and reassuring
    'CUSTOMER_REMAKE': 'We truly appreciate your patience and understanding. We promise the new patches will be exactly what you envisioned. We will keep you updated throughout the remake process.',
  };

  return closingMessages[templateId] || 'We\'re working on your order and will keep you updated on its progress.';
};

// 3c. Helper: Get Section Header based on Template ID
const getSectionHeader = (templateId: string, data: any): string => {
  if (data.quote_number) {
    return 'Quote Details';
  }

  const headers: Record<string, string> = {
    'CUSTOMER_SHIPPED': 'Shipping Details',
    'CUSTOMER_DELIVERED': 'Delivery Confirmation',
    'CUSTOMER_REFUND_ISSUED': 'Refund Details',
    'CUSTOMER_FEEDBACK_REQUEST': 'Your Order',
  };

  return headers[templateId] || 'Order Information';
};

// 3d. Helper: Get Sign-off based on Template ID
const getSignOff = (templateId: string): { greeting: string; team: string } => {
  // Internal emails - more casual
  if (templateId.includes('INTERNAL')) {
    return {
      greeting: 'Best,',
      team: 'CRM System'
    };
  }

  // Refund emails - apologetic
  if (templateId === 'CUSTOMER_REFUND_ISSUED') {
    return {
      greeting: 'We appreciate your understanding,',
      team: 'Panda Patches Team'
    };
  }

  // Remake emails - very apologetic
  if (templateId === 'CUSTOMER_REMAKE') {
    return {
      greeting: 'Our sincerest apologies,',
      team: 'Panda Patches Team'
    };
  }

  // Default
  return {
    greeting: 'Thank you,',
    team: 'Panda Patches Team'
  };
};

// 3e. Helper: Should show full order details?
const shouldShowFullDetails = (templateId: string): boolean => {
  // These templates don't need full order specs
  const minimalDetailsTemplates = [
    'CUSTOMER_SHIPPED',
    'CUSTOMER_DELIVERED',
    'CUSTOMER_FEEDBACK_REQUEST',
    'CUSTOMER_REFUND_ISSUED',
    'CUSTOMER_PAYMENT_CONFIRMATION',
    'INTERNAL_PAYMENT_NOTIFICATION',
    'CUSTOMER_WELCOME_INVITE',
    'CUSTOMER_RETURNING_LOGIN',
    'CUSTOMER_PASSWORD_RESET',
    'AGENT_NEW_CUSTOMER_MESSAGE',
    'CUSTOMER_NEW_AGENT_MESSAGE',
    'CUSTOMER_PAYMENT_LINK',
    // Website auth templates (pandapatches.com customer portal)
    'WEBSITE_AUTH_SIGNUP_CONFIRM',
    'WEBSITE_AUTH_MAGIC_LINK',
    'WEBSITE_AUTH_PASSWORD_RESET',
    'WEBSITE_AUTH_EMAIL_CHANGE',
    'WEBSITE_AUTH_ORDER_ACCOUNT',
  ];

  return !minimalDetailsTemplates.includes(templateId);
};

// 3f. Helper: Should show Instagram promo?
const shouldShowInstagramPromo = (templateId: string): boolean => {
  // Hide for internal emails only
  return !templateId.includes('INTERNAL');
};

// 4. Helper: Build Email HTML from Template ID and Data
const buildEmailHTML = (templateId: string, data: any): string => {
  // Get template-specific message if not provided in data
  const emailMessage = escapeHtml(data.message || getTemplateMessage(templateId, data));

  // Use professional SendGrid-style template adapted for AWS SES
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html data-editor-version="2" class="sg-campaigns" xmlns="http://www.w3.org/1999/xhtml">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1">
      <meta http-equiv="X-UA-Compatible" content="IE=Edge">
      <link href="https://fonts.googleapis.com/css?family=Lato:300&display=swap" rel="stylesheet">
      <style type="text/css">
    body, p, div {
      font-family: 'Lato', sans-serif;
      font-size: 14px;
    }
    body {
      color: #000000;
    }
    body a {
      color: #1188E6;
      text-decoration: none;
    }
    p { margin: 0; padding: 0; }
    table.wrapper {
      width:100% !important;
      table-layout: fixed;
      -webkit-font-smoothing: antialiased;
      -webkit-text-size-adjust: 100%;
      -moz-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    img.max-width {
      max-width: 100% !important;
    }
    .column.of-2 {
      width: 50%;
    }
    @media screen and (max-width:480px) {
      img.max-width {
        height: auto !important;
        max-width: 100% !important;
      }
      .columns {
        width: 100% !important;
      }
      .column {
        display: block !important;
        width: 100% !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
      }
    }
  </style>
    </head>
    <body>
      <center class="wrapper" data-link-color="#1188E6" data-body-style="font-size:14px; font-family:inherit; color:#000000; background-color:#f3f3f3;">
        <div class="webkit">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" class="wrapper" bgcolor="#f3f3f3">
            <tr>
              <td valign="top" bgcolor="#f3f3f3" width="100%">
                <table width="100%" role="content-container" class="outer" align="center" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="100%">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td>
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px;" align="center">
                                      <tr>
                                        <td role="modules-container" style="padding:0px 0px 0px 0px; color:#000000; text-align:left;" bgcolor="#FFFFFF" width="100%" align="left">

  <!-- LOGO HEADER (Black Background) -->
  <table border="0" cellpadding="0" cellspacing="0" align="center" width="100%" role="module" data-type="columns" style="padding:30px 0px 30px 0px;" bgcolor="#0b0b0b">
    <tbody>
      <tr role="module-content">
        <td height="100%" valign="top">
          <table width="600" style="width:600px; border-spacing:0; border-collapse:collapse; margin:0px 0px 0px 0px;" cellpadding="0" cellspacing="0" align="left" border="0" bgcolor="" class="column column-0">
            <tbody>
              <tr>
                <td style="padding:0px;margin:0px;border-spacing:0;">
                  <table class="wrapper" role="module" data-type="image" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
                    <tbody>
                      <tr>
                        <td style="font-size:6px; line-height:10px; padding:0px 0px 0px 0px;" valign="top" align="center">
                          <img class="max-width" border="0" style="display:block; color:#000000; text-decoration:none; font-family:Helvetica, arial, sans-serif; font-size:16px;" width="208" alt="Panda Patches" src="http://cdn.mcauto-images-production.sendgrid.net/cbe49576e8597a6a/213c03ef-699b-4ff5-b568-76cbe38d40d7/1190x571.png" height="100">
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- SPACER -->
  <table class="module" role="module" data-type="spacer" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:0px 0px 30px 0px;" role="module-content" bgcolor=""></td>
      </tr>
    </tbody>
  </table>

  <!-- ORDER/QUOTE NUMBER -->
  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:0px 20px 10px 20px; line-height:22px; text-align:inherit;" height="100%" valign="top" bgcolor="" role="module-content">
          <div>
            <div style="font-family: inherit; text-align: center">
              ${data.quote_number ? `<span style="font-size: 16px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">Quote Number: &nbsp;</span><span style="font-size: 16px; color: #fb6e1d; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">${escapeHtml(data.quote_number)}</span>` : `<span style="font-size: 16px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">Order Number: &nbsp;</span><span style="font-size: 16px; color: #fb6e1d; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">${escapeHtml(data.order_number || 'N/A')}</span>`}
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- GREETING & MESSAGE -->
  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:20px 20px 10px 20px; line-height:22px; text-align:inherit;" height="100%" valign="top" bgcolor="" role="module-content">
          <div>
            <div style="font-family: inherit; text-align: inherit">
              ${templateId.includes('INTERNAL') ?
                `<span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">Hi </span><span style="font-size: 18px; color: #fb6e1d; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">Team</span><span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">,&nbsp;</span>` :
                `<span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">Hi </span><span style="font-size: 18px; color: #fb6e1d; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">${escapeHtml(data.customer_name || 'Customer')}</span><span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">,&nbsp;</span>`
              }
            </div>
            <div style="font-family: inherit; text-align: inherit"><br></div>
            <div style="font-family: inherit; text-align: inherit">
              <span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">${emailMessage}</span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  ${templateId.includes('INTERNAL') && data.sales_agent_name ? `
  <!-- SALES AGENT INFO (Internal Emails Only) -->
  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:15px 20px 15px 20px; line-height:22px; text-align:center; background-color:#fff3e6; border-left: 4px solid #fb6e1d;" height="100%" valign="top" bgcolor="#fff3e6" role="module-content">
          <div>
            <div style="font-family: inherit; text-align: center">
              <span style="font-size: 15px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #666;">📞 Contact Sales Agent: </span>
              <span style="font-size: 17px; color: #fb6e1d; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-weight: bold">${escapeHtml(data.sales_agent_name)}</span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  ${templateId.includes('INTERNAL') && data.is_urgent && data.rush_date ? `
  <!-- URGENT RUSH DATE BANNER (Internal Emails Only) -->
  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:20px; line-height:26px; text-align:center; background-color:#fff0f0; border-left: 5px solid #e53e3e;" height="100%" valign="top" bgcolor="#fff0f0" role="module-content">
          <div>
            <div style="font-family: inherit; text-align: center; margin-bottom: 10px;">
              <span style="font-size: 22px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #c53030; font-weight: bold;">🚨 URGENT ORDER — RUSH REQUIRED 🚨</span>
            </div>
            <div style="font-family: inherit; text-align: center; background-color: #ffffff; padding: 14px 24px; border-radius: 6px; border: 2px solid #e53e3e;">
              <span style="font-size: 16px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #666;">Must Ship By: </span>
              <span style="font-size: 22px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #c53030; font-weight: bold;">${escapeHtml(data.rush_date)}</span>
            </div>
            <div style="font-family: inherit; text-align: center; margin-top: 10px;">
              <span style="font-size: 14px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #c53030; font-style: italic;">⚠️ Please prioritize this order and ensure it ships on time!</span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  ${(templateId === 'CUSTOMER_REMAKE' || templateId === 'INTERNAL_REMAKE') && data.remake_reason ? `
  <!-- REMAKE REASON BOX -->
  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:20px; line-height:26px; text-align:center; background-color:#fff3e0; border-left: 5px solid #ff9800; border-radius: 8px; margin: 10px 0;" height="100%" valign="top" bgcolor="#fff3e0" role="module-content">
          <div>
            <div style="font-family: inherit; text-align: center; margin-bottom: 12px;">
              <span style="font-size: 20px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #e65100; font-weight: bold;">🔄 Remake Reason</span>
            </div>
            <div style="font-family: inherit; text-align: center; background-color: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #ffe0b2;">
              <span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #e65100; font-weight: bold;">${escapeHtml(data.remake_reason)}</span>
              ${data.remake_details ? `<br/><span style="font-size: 14px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #555; margin-top: 8px; display: inline-block;">${escapeHtml(data.remake_details)}</span>` : ''}
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  ${templateId === 'INTERNAL_REMAKE' && data.instructions ? `
  <!-- REMAKE INSTRUCTIONS (INTERNAL_REMAKE Only) -->
  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:20px; line-height:26px; text-align:left; background-color:#fff8e1; border-left: 5px solid #ff9800; border-radius: 4px; margin: 10px 0;" height="100%" valign="top" bgcolor="#fff8e1" role="module-content">
          <div>
            <div style="font-family: inherit; text-align: center; margin-bottom: 10px;">
              <span style="font-size: 20px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #e65100; font-weight: bold;">⚠️ REMAKE INSTRUCTIONS FROM SALES AGENT ⚠️</span>
            </div>
            <div style="font-family: inherit; text-align: center; background-color: #ffffff; padding: 15px; border-radius: 4px; border: 2px solid #ff9800;">
              <span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #000; font-weight: bold; line-height: 1.6;">${escapeHtml(data.instructions)}</span>
            </div>
            <div style="font-family: inherit; text-align: center; margin-top: 10px;">
              <span style="font-size: 14px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #d84315; font-style: italic;">Contact the sales agent if you need clarification on these requirements.</span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  <!-- SPACER -->
  <table class="module" role="module" data-type="spacer" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:0px 0px 30px 0px;" role="module-content" bgcolor=""></td>
      </tr>
    </tbody>
  </table>

  ${templateId === 'CUSTOMER_SHIPPED' && data.tracking_number ? `
  <!-- TRACKING INFORMATION (Shipped Emails Only) -->
  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:25px 20px 25px 20px; line-height:26px; text-align:center; background-color:#fff8e1; border-left: 5px solid #fb6e1d; border-radius: 8px; margin: 20px 0;" height="100%" valign="top" bgcolor="#fff8e1" role="module-content">
          <div>
            <div style="font-family: inherit; text-align: center; margin-bottom: 15px;">
              <span style="font-size: 22px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #000; font-weight: bold;">📦 Tracking Information</span>
            </div>
            ${data.carrier ? `
              <div style="font-family: inherit; text-align: center; margin-bottom: 10px;">
                <span style="font-size: 16px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #666;">Carrier: </span>
                <span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #000; font-weight: bold;">${escapeHtml(data.carrier)}</span>
              </div>
            ` : ''}
            <div style="font-family: inherit; text-align: center; margin-bottom: 15px;">
              <span style="font-size: 16px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #666;">Tracking Number: </span>
              <span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #fb6e1d; font-weight: bold;">${escapeHtml(data.tracking_number)}</span>
            </div>
            ${data.tracking_link && data.tracking_link !== '#' ? `
              <div style="font-family: inherit; text-align: center; margin-top: 20px;">
                <a href="${escapeHtml(data.tracking_link)}" target="_blank" style="display: inline-block; background-color: #fb6e1d; color: #ffffff; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: bold; font-family: 'lucida sans unicode', 'lucida grande', sans-serif;">
                  Track Your Package →
                </a>
              </div>
            ` : ''}
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- SPACER AFTER TRACKING -->
  <table class="module" role="module" data-type="spacer" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:0px 0px 20px 0px;" role="module-content" bgcolor=""></td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  ${templateId === 'CUSTOMER_SHIPPED' && data.shipping_address ? `
  <!-- SHIPPING ADDRESS (Shipped Emails Only) -->
  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:25px 20px 25px 20px; line-height:26px; text-align:center; background-color:#e8f5e9; border-left: 5px solid #4caf50; border-radius: 8px; margin: 20px 0;" height="100%" valign="top" bgcolor="#e8f5e9" role="module-content">
          <div>
            <div style="font-family: inherit; text-align: center; margin-bottom: 15px;">
              <span style="font-size: 22px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #000; font-weight: bold;">📍 Shipping To</span>
            </div>
            <div style="font-family: inherit; text-align: center; background-color: #ffffff; padding: 15px; border-radius: 6px; margin: 10px 20px;">
              <span style="font-size: 16px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #000; white-space: pre-line; line-height: 1.6;">${escapeHtml(data.shipping_address)}</span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- SPACER AFTER SHIPPING ADDRESS -->
  <table class="module" role="module" data-type="spacer" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:0px 0px 20px 0px;" role="module-content" bgcolor=""></td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  ${templateId === 'CUSTOMER_SHIPPED' && data.has_shipping_photos && Array.isArray(data.shipping_photos) && data.shipping_photos.length ? `
  <!-- SHIPPING CONFIRMATION PHOTOS / LABELS (Shipped Emails Only) -->
  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:25px 20px 25px 20px; line-height:26px; text-align:center; background-color:#f3f4f6; border-left: 5px solid #fb6e1d; border-radius: 8px;" height="100%" valign="top" bgcolor="#f3f4f6" role="module-content">
          <div>
            <div style="font-family: inherit; text-align: center; margin-bottom: 15px;">
              <span style="font-size: 22px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #000; font-weight: bold;">📸 Shipping Confirmation</span>
            </div>
            ${data.shipping_photos.map((p: any) => {
              const u = String(p?.url || '');
              const isImg = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(u);
              return isImg
                ? `<div style="margin:10px 0;"><img src="${escapeHtml(u)}" alt="Shipping photo" width="100%" style="max-width:520px; width:100%; height:auto; border-radius:8px; border:1px solid #e0e0e0;" /></div>`
                : `<div style="margin:10px 0;"><a href="${escapeHtml(u)}" target="_blank" style="display:inline-block; background:#ffffff; border:1px solid #fb6e1d; color:#fb6e1d; padding:10px 22px; border-radius:6px; text-decoration:none; font-size:15px; font-weight:bold; font-family: 'lucida sans unicode', 'lucida grande', sans-serif;">📄 ${escapeHtml(p?.file_name || 'Shipping Label')}</a></div>`;
            }).join('')}
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- SPACER AFTER SHIPPING PHOTOS -->
  <table class="module" role="module" data-type="spacer" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:0px 0px 20px 0px;" role="module-content" bgcolor=""></td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  ${(templateId === 'CUSTOMER_PAYMENT_CONFIRMATION' || templateId === 'INTERNAL_PAYMENT_NOTIFICATION') && data.amount_paid ? `
  <!-- PAYMENT SUMMARY BOX -->
  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:25px 20px 25px 20px; line-height:26px; text-align:center; background-color:#e8f5e9; border-left: 5px solid #4caf50; border-radius: 8px; margin: 20px 0;" height="100%" valign="top" bgcolor="#e8f5e9" role="module-content">
          <div>
            <div style="font-family: inherit; text-align: center; margin-bottom: 20px;">
              <span style="font-size: 22px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #000; font-weight: bold;">💳 Payment Summary</span>
            </div>
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:400px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0;">
              <tr>
                <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0;">
                  <span style="font-size: 15px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #555;">Total Amount</span>
                  <span style="font-size: 16px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #000; font-weight: bold; float: right;">${escapeHtml(String(data.total_amount || 'N/A'))}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; background-color: #f0fff4;">
                  <span style="font-size: 15px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #2e7d32;">✅ Amount Paid</span>
                  <span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #2e7d32; font-weight: bold; float: right;">${escapeHtml(String(data.amount_paid))}</span>
                </td>
              </tr>
              ${templateId !== 'CUSTOMER_PAYMENT_CONFIRMATION' && data.amount_remaining && data.amount_remaining !== '$0' ? `
              <tr>
                <td style="padding: 12px 20px; background-color: #fffde7;">
                  <span style="font-size: 15px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #f57f17;">⏳ Remaining Balance</span>
                  <span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #f57f17; font-weight: bold; float: right;">${escapeHtml(String(data.amount_remaining))}</span>
                </td>
              </tr>
              ` : `
              <tr>
                <td style="padding: 12px 20px; background-color: #e8f5e9; text-align: center;">
                  <span style="font-size: 15px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #2e7d32; font-weight: bold;">🎉 Paid in Full — Thank you!</span>
                </td>
              </tr>
              `}
              ${templateId === 'INTERNAL_PAYMENT_NOTIFICATION' && data.customer_email ? `
              <tr>
                <td style="padding: 12px 20px; border-top: 1px solid #f0f0f0;">
                  <span style="font-size: 14px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #555;">Customer Email</span>
                  <span style="font-size: 14px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif; color: #000; float: right;">${escapeHtml(String(data.customer_email))}</span>
                </td>
              </tr>
              ` : ''}
            </table>
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- SPACER AFTER PAYMENT -->
  <table class="module" role="module" data-type="spacer" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody><tr><td style="padding:0px 0px 20px 0px;" role="module-content" bgcolor=""></td></tr></tbody>
  </table>
  ` : ''}

  ${shouldShowFullDetails(templateId) ? `
  <!-- ORDER INFORMATION HEADER (Yellow on Black) -->
  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:40px 0px 40px 40px; line-height:22px; text-align:inherit; background-color:#080808;" height="100%" valign="top" bgcolor="#080808" role="module-content">
          <div>
            <div style="font-family: inherit; text-align: center">
              <span style="font-size: 28px; color: #dcff70; font-family: 'lucida sans unicode', 'lucida grande', sans-serif"><strong>${getSectionHeader(templateId, data)}</strong></span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- TWO COLUMN LAYOUT: Winner Image + Order Details -->
  <table border="0" cellpadding="0" cellspacing="0" align="center" width="100%" role="module" data-type="columns" style="padding:0px 0px 0px 0px;" bgcolor="#FFFFFF">
    <tbody>
      <tr role="module-content">
        <td height="100%" valign="top">

          <!-- LEFT COLUMN: Winner Image -->
          <table width="290" style="width:290px; border-spacing:0; border-collapse:collapse; margin:0px 10px 0px 0px;" cellpadding="0" cellspacing="0" align="left" border="0" bgcolor="" class="column column-0">
            <tbody>
              <tr>
                <td style="padding:0px;margin:0px;border-spacing:0;">
                  <table class="module" role="module" data-type="code" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
                    <tbody>
                      <tr>
                        <td height="100%" valign="top" role="module-content">
                          <div style="width: 100%;">
                            ${data.winner_file?.preview && data.winner_file?.is_image ? `
                              <!-- Winner Image (Lightbox Compatible) -->
                              <div style="margin-bottom: 15px; text-align: left;">
                                <img src="${data.winner_file.preview}" alt="Main Design" style="width: 100%; max-width: 100%; height: auto; border-radius: 6px; border: 1px solid #e0e0e0; cursor: pointer; display: block; margin: 0;">
                              </div>
                            ` : `
                              <!-- Fallback for PDF or No Image -->
                              <div style="background: #f8f9fa; padding: 10px 15px; border: 1px dashed #ccc; border-radius: 6px; display: inline-block; text-align: left;">
                                <table border="0" cellpadding="0" cellspacing="0">
                                  <tr>
                                    <td valign="middle" style="padding-right: 10px;">
                                      <img src="https://cdn-icons-png.flaticon.com/512/337/337946.png" alt="File" style="width: 32px; height: 32px; display: block;">
                                    </td>
                                    <td valign="middle">
                                      <div style="font-size: 12px; font-weight: bold; color: #555;">File Attached</div>
                                      <div style="font-size: 10px; color: #888;">See bottom of email 📎</div>
                                    </td>
                                  </tr>
                                </table>
                              </div>
                            `}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- RIGHT COLUMN: Order Details -->
          <table width="290" style="width:290px; border-spacing:0; border-collapse:collapse; margin:0px 0px 0px 10px;" cellpadding="0" cellspacing="0" align="left" border="0" bgcolor="" class="column column-1">
            <tbody>
              <tr>
                <td style="padding:0px;margin:0px;border-spacing:0;">
                  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
                    <tbody>
                      <tr>
                        <td style="padding:18px 0px 18px 0px; line-height:22px; text-align:inherit;" height="100%" valign="top" bgcolor="" role="module-content">
                          <div>
                            <div style="font-family: inherit; text-align: center">
                              <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 18px;">${data.quote_number ? 'Quote' : 'Order'} Number: ${escapeHtml(data.quote_number || data.order_number || 'N/A')}</span>
                            </div>
                            <div style="font-family: inherit; text-align: center"><br></div>
                            ${data.design_name ? `
                              <div style="font-family: inherit; text-align: center">
                                <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 18px;">Design Name: ${escapeHtml(data.design_name)}</span>
                              </div>
                              <div style="font-family: inherit; text-align: center"><br></div>
                            ` : ''}
                            ${data.patches_quantity || data.quantity ? `
                              <div style="font-family: inherit; text-align: center">
                                <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 18px;">Quantity: ${escapeHtml(data.patches_quantity || data.quantity)}</span>
                              </div>
                              <div style="font-family: inherit; text-align: center"><br></div>
                            ` : ''}
                            ${data.patches_type || data.patch_type ? `
                              <div style="font-family: inherit; text-align: center">
                                <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 18px;">Patch Type: ${escapeHtml(data.patches_type || data.patch_type)}</span>
                              </div>
                              <div style="font-family: inherit; text-align: center"><br></div>
                            ` : ''}
                            ${data.design_backing || data.backing ? `
                              <div style="font-family: inherit; text-align: center">
                                <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 18px;">Backing: ${escapeHtml(data.design_backing || data.backing)}</span>
                              </div>
                              <div style="font-family: inherit; text-align: center"><br></div>
                            ` : ''}
                            ${data.size || data.design_size ? `
                              <div style="font-family: inherit; text-align: center">
                                <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 18px;">Size: ${escapeHtml(data.size || data.design_size)}</span>
                              </div>
                              <div style="font-family: inherit; text-align: center"><br></div>
                            ` : ''}
                            ${data.border_type ? `
                              <div style="font-family: inherit; text-align: center">
                                <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 18px;">Border Type: ${escapeHtml(data.border_type)}</span>
                              </div>
                              <div style="font-family: inherit; text-align: center"><br></div>
                            ` : ''}
                            ${data.estimated_amount ? `
                              <div style="font-family: inherit; text-align: center">
                                <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 20px; font-weight: bold; color: #fb6e1d;">Estimated Price: ${escapeHtml(String(data.estimated_amount))}</span>
                              </div>
                              <div style="font-family: inherit; text-align: center"><br></div>
                            ` : ''}
                            ${templateId.includes('INTERNAL') && data.instructions ? `
                              <div style="font-family: inherit; text-align: center">
                                <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 18px;">Special Instruction: ${escapeHtml(data.instructions)}</span>
                              </div>
                            ` : ''}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

        </td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  ${shouldShowInstagramPromo(templateId) ? `
  <!-- INSTAGRAM GALLERY IMAGE -->
  <table class="wrapper" role="module" data-type="image" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="font-size:6px; line-height:10px; padding:0px 0px 0px 0px;" valign="top" align="center">
          <a href="https://www.instagram.com/pandapatchesofficial/">
            <img class="max-width" border="0" style="display:block; color:#000000; text-decoration:none; font-family:Helvetica, arial, sans-serif; font-size:16px; max-width:100% !important; width:100%; height:auto !important;" width="600" alt="Follow us on Instagram" src="http://cdn.mcauto-images-production.sendgrid.net/cbe49576e8597a6a/4f0fe337-478e-473c-b6aa-baa8b6c94def/1600x406.jpg">
          </a>
        </td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  ${(templateId === 'CUSTOMER_WELCOME_INVITE' || templateId === 'CUSTOMER_RETURNING_LOGIN' || templateId === 'CUSTOMER_PASSWORD_RESET' || templateId === 'CUSTOMER_PAYMENT_LINK' || templateId === 'CUSTOMER_PAYMENT_CONFIRMATION' || templateId === 'WEBSITE_AUTH_SIGNUP_CONFIRM' || templateId === 'WEBSITE_AUTH_MAGIC_LINK' || templateId === 'WEBSITE_AUTH_PASSWORD_RESET' || templateId === 'WEBSITE_AUTH_EMAIL_CHANGE' || templateId === 'WEBSITE_AUTH_ORDER_ACCOUNT') && data.portal_action_url ? `
  <!-- CUSTOMER PORTAL CTA BUTTON (mobile-optimized) -->
  <table border="0" cellpadding="0" cellspacing="0" class="module" data-type="button" role="module" style="table-layout: fixed;" width="100%">
    <tbody>
      <tr>
        <td align="center" bgcolor="" class="outer-td" style="padding:10px 20px 30px 20px;">
          <table border="0" cellpadding="0" cellspacing="0" class="wrapper-mobile" style="text-align:center; width: 100%; max-width: 420px;">
            <tbody>
              <tr>
                <td align="center" bgcolor="#FB6E1D" class="inner-td" style="border-radius:8px; font-size:18px; text-align:center; background-color:#FB6E1D;">
                  <a href="${escapeHtml(data.portal_action_url)}" style="background-color:#FB6E1D; border:1px solid #FB6E1D; border-radius:8px; color:#ffffff; display:block; font-size:18px; font-weight:bold; line-height:1.3; padding:18px 24px; text-align:center; text-decoration:none; font-family: 'lucida sans unicode', 'lucida grande', sans-serif;" target="_blank">
                    ${templateId === 'CUSTOMER_WELCOME_INVITE' ? 'Set Your Password &rarr;' : templateId === 'CUSTOMER_PASSWORD_RESET' ? 'Reset Password &rarr;' : templateId === 'CUSTOMER_PAYMENT_LINK' ? 'Pay Now &rarr;' : templateId === 'WEBSITE_AUTH_SIGNUP_CONFIRM' ? 'Confirm My Email &rarr;' : templateId === 'WEBSITE_AUTH_MAGIC_LINK' ? 'Sign In To My Account &rarr;' : templateId === 'WEBSITE_AUTH_PASSWORD_RESET' ? 'Reset My Password &rarr;' : templateId === 'WEBSITE_AUTH_EMAIL_CHANGE' ? 'Confirm Email Change &rarr;' : templateId === 'WEBSITE_AUTH_ORDER_ACCOUNT' ? 'Set Your Password &rarr;' : 'Log In &amp; Track Order &rarr;'}
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
  ${data.portal_login_url ? `
  <!-- PORTAL LOGIN FALLBACK LINK -->
  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:0px 20px 20px 20px; line-height:20px; text-align:center;" height="100%" valign="top" bgcolor="" role="module-content">
          <div style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 13px; color: #666;">
            Button not working? Copy and paste this link: <br/>
            <a href="${escapeHtml(data.portal_action_url)}" style="color: #fb6e1d; word-break: break-all;">${escapeHtml(data.portal_action_url)}</a>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
  ` : ''}
  ` : ''}

  ${(templateId.includes('INTERNAL') || templateId === 'AGENT_NEW_CUSTOMER_MESSAGE' || templateId === 'CUSTOMER_NEW_AGENT_MESSAGE') && data.order_link ? `
  <!-- VIEW CRM / VIEW PORTAL BUTTON -->
  <table border="0" cellpadding="0" cellspacing="0" class="module" data-type="button" role="module" style="table-layout: fixed;" width="100%">
    <tbody>
      <tr>
        <td align="center" bgcolor="" class="outer-td" style="padding:20px 0px 20px 0px;">
          <table border="0" cellpadding="0" cellspacing="0" class="wrapper-mobile" style="text-align:center;">
            <tbody>
              <tr>
                <td align="center" bgcolor="#FB6E1D" class="inner-td" style="border-radius:6px; font-size:16px; text-align:center; background-color:inherit;">
                  <a href="${escapeHtml(data.order_link)}" style="background-color:#FB6E1D; border:1px solid #FB6E1D; border-color:#FB6E1D; border-radius:6px; border-width:1px; color:#ffffff; display:inline-block; font-size:16px; font-weight:bold; letter-spacing:0px; line-height:normal; padding:16px 40px 16px 40px; text-align:center; text-decoration:none; border-style:solid; font-family: 'lucida sans unicode', 'lucida grande', sans-serif;" target="_blank">
                    ${templateId === 'AGENT_NEW_CUSTOMER_MESSAGE' ? 'REPLY IN CRM →' : templateId === 'CUSTOMER_NEW_AGENT_MESSAGE' ? 'VIEW MESSAGE →' : 'VIEW IN CRM PORTAL →'}
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  ${getClosingMessage(templateId, data) ? `
  <!-- CLOSING MESSAGE -->
  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:18px 0px 18px 0px; line-height:22px; text-align:inherit;" height="100%" valign="top" bgcolor="" role="module-content">
          <div>
            <div style="font-family: inherit; text-align: left">
              <span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">&nbsp;${getClosingMessage(templateId, data)}</span>
            </div>
            <div style="font-family: inherit; text-align: left"><br></div>
            <div style="font-family: inherit; text-align: left">
              <span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">&nbsp;${getSignOff(templateId).greeting}&nbsp;</span>
            </div>
            <div style="font-family: inherit; text-align: left">
              <span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif"><strong>&nbsp;${getSignOff(templateId).team}</strong></span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  <!-- SPACER -->
  <table class="module" role="module" data-type="spacer" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:0px 0px 30px 0px;" role="module-content" bgcolor=""></td>
      </tr>
    </tbody>
  </table>

  <!-- FOOTER (Black with Gold Divider) -->
  <table class="module" role="module" data-type="code" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td height="100%" valign="top" role="module-content">
          <div style="background-color: #000000; color: #ffffff; padding: 35px 20px; text-align: center; margin-top: 40px; border-radius: 4px 4px 0 0;">
            <h2 style="margin: 0 0 15px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 22px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;">
              PANDA PATCHES
            </h2>
            <div style="width: 50px; height: 3px; background-color: #FFD700; margin: 0 auto 20px auto;"></div>
            <p style="margin: 0 0 10px 0; font-size: 13px; color: #cccccc; line-height: 1.6; font-family: Arial, sans-serif;">
              1914 Quail Feather Ct, Missouri City, TX 77489<br>
              <a href="tel:3022504340" style="color: #ffffff; text-decoration: none; font-weight: bold;">(302) 250-4340</a>
            </p>
            <p style="margin: 15px 0 0 0;">
              <a href="https://pandapatches.com/" style="color: #FFD700; text-decoration: none; font-weight: bold; font-size: 14px; letter-spacing: 0.5px;">
                PANDA PATCHES &rarr;
              </a>
            </p>
            <p style="margin-top: 25px; font-size: 11px; color: #555555; font-family: Arial, sans-serif;">
              © 2026 Panda Patches LLC. All rights reserved. <br>
              This is a transactional email regarding your order.
            </p>
          </div>
        </td>
      </tr>
    </tbody>
  </table>

                                        </td>
                                      </tr>
                                    </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      </center>
    </body>
  </html>`;
};

// 5. Helper: Download & Detect Type (STRICT MODE)
const fetchFile = async (url: string) => {
  try {
    // A. Extension Check (Filter out DST/EMB immediately)
    const cleanUrl = url.split('?')[0].toLowerCase();
    let type = '';
    let isImage = false;

    // ONLY allow these types
    if (cleanUrl.match(/\.(jpg|jpeg)$/)) { type = 'image/jpeg'; isImage = true; }
    else if (cleanUrl.match(/\.png$/)) { type = 'image/png'; isImage = true; }
    else if (cleanUrl.match(/\.pdf$/)) { type = 'application/pdf'; isImage = false; }
    else {
        // Skip .dst, .emb, .ai, etc.
        console.log(`Skipping unsupported file type: ${cleanUrl}`);
        return null;
    }

    // Add timeout to file download (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      // B. Download with timeout
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) return null;

      // C. Size Check (Limit to 10MB)
      const size = Number(response.headers.get('content-length'));
      if (size && size > 10 * 1024 * 1024) {
          console.warn(`Skipping large file (>10MB): ${url}`);
          return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64 = encode(new Uint8Array(arrayBuffer));

      return { content: base64, type, isImage, filename: getFileName(url) };
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
        console.warn(`File download timeout (30s): ${url}`);
      } else {
        console.error(`File download error: ${url}`, fetchErr);
      }
      return null;
    }
  } catch (e) { return null; }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });

  try {
    // ✅ CHECK: Verify ZeptoMail API credentials are configured
    const ZEPTOMAIL_API_KEY = Deno.env.get('ZEPTOMAIL_API_KEY');
    const ZEPTOMAIL_BOUNCE_ADDRESS = Deno.env.get('ZEPTOMAIL_BOUNCE_ADDRESS'); // Optional
    const SMTP_FROM_EMAIL = Deno.env.get('SMTP_FROM_EMAIL') || 'hello@pandapatches.com';
    const SMTP_FROM_NAME = Deno.env.get('SMTP_FROM_NAME') || 'Panda Patches';
    const SMTP_REPLY_TO = Deno.env.get('SMTP_REPLY_TO') || 'hello@pandapatches.com';

    if (!ZEPTOMAIL_API_KEY) {
      console.error('❌ CRITICAL: ZEPTOMAIL_API_KEY not set in Supabase secrets');
      throw new Error('ZEPTOMAIL_API_KEY not configured. Run: supabase secrets set ZEPTOMAIL_API_KEY=your_key');
    }

    // Parse and validate request body
    const body = await req.json();
    const validatedData = sendEmailSchema.parse(body);

    const { to, template_id, dynamic_data, cc, from_email } = validatedData;
    const attachments = [];
    const inlineAttachments = [];

    // Deep copy data so we can modify it for the template
    const processedData = JSON.parse(JSON.stringify(dynamic_data));

    console.log(`📧 Processing email for: ${to} using template: ${template_id}`);
    console.log(`📧 Sales Agent Name: ${processedData.sales_agent_name || 'NOT FOUND'}`);
    console.log(`📧 Available data fields:`, Object.keys(processedData));

    // --- A. PROCESS WINNER (The Lightbox Image) ---
    // Total budget across winner + gallery = 6MB to stay under ZeptoMail's limit
    const MAX_WINNER_SIZE_MB = 4;
    const TOTAL_BUDGET_MB = 6;
    let usedBudgetMB = 0;

    if (processedData.winner_file && processedData.winner_file.url) {
        const file = await fetchFile(processedData.winner_file.url);

        if (processedData.winner_file && /\.(jpg|jpeg|png|gif|webp)$/i.test((processedData.winner_file.url || '').split('?')[0])) {
            // Images live in a PUBLIC bucket — reference the URL directly so email
            // clients load it. Avoids the flaky download/base64 embed that caused
            // intermittent "File Attached" placeholders when emails fire concurrently.
            processedData.winner_file.preview = processedData.winner_file.url;
            processedData.winner_file.is_image = true;
        }
        else if (file && !file.isImage) {
            // PDF -> ATTACHMENT (Never Inline)
            attachments.push({
                "Content-type": file.type,
                "Filename": file.filename,
                "Base64Content": file.content
            });
            processedData.winner_file.preview = "https://cdn-icons-png.flaticon.com/512/337/337946.png";
            processedData.winner_file.is_image = false;
        }
    }

    // --- B. PROCESS GALLERY ---
    // Remaining budget after winner — max 1 gallery image to keep total under 6MB
    const MAX_GALLERY_ATTACHMENTS = 1;
    let totalAttachmentSize = 0;

    if (processedData.gallery_files && Array.isArray(processedData.gallery_files)) {
        for (const item of processedData.gallery_files) {
            if (attachments.length >= MAX_GALLERY_ATTACHMENTS) {
                console.log(`📎 Gallery limit reached (${MAX_GALLERY_ATTACHMENTS} file max)`);
                break;
            }

            const file = await fetchFile(item.url);

            if (file) {
                const fileSizeMB = (file.content.length * 0.75) / (1024 * 1024);
                const remainingBudget = TOTAL_BUDGET_MB - usedBudgetMB;
                if (fileSizeMB > remainingBudget) {
                    console.log(`📎 Skipping gallery file (${fileSizeMB.toFixed(1)}MB) — would exceed total budget (${remainingBudget.toFixed(1)}MB remaining)`);
                    continue;
                }

                totalAttachmentSize += fileSizeMB;
                usedBudgetMB += fileSizeMB;
                attachments.push({
                    "Content-type": file.type,
                    "Filename": file.filename,
                    "Base64Content": file.content
                });
            }
        }
        console.log(`📎 Gallery: ${attachments.length} files, ~${totalAttachmentSize.toFixed(1)}MB | Total payload: ~${usedBudgetMB.toFixed(1)}MB`);
        processedData.gallery_files = [];
        processedData.has_gallery = false;
    }

    // --- D. PROCESS SHIPPING PHOTOS / LABELS (Shipped email) ---
    // Uploaded by the shipping team. Image files live in a PUBLIC bucket and are referenced
    // by URL directly in the HTML above (reliable, no size budget). PDF shipping labels can't
    // be inlined as <img>, so download + attach them as real downloadable files.
    if (Array.isArray(processedData.shipping_photos)) {
        for (const item of processedData.shipping_photos) {
            const cleanUrl = String(item?.url || '').split('?')[0].toLowerCase();
            if (!cleanUrl.endsWith('.pdf')) continue;
            const file = await fetchFile(item.url);
            if (file) {
                attachments.push({
                    "Content-type": file.type,
                    "Filename": file.filename,
                    "Base64Content": file.content,
                });
                console.log(`📎 Attached shipping label: ${file.filename}`);
            }
        }
    }

    // --- C. SEND VIA ZEPTOMAIL REST API ---
    // Build recipient list
    // For internal emails, use "Team" as the recipient name, not customer name
    const recipientName = template_id.includes('INTERNAL') ? 'Team' : (processedData.customer_name || 'Customer');
    const toAddresses = [{ email_address: { address: to, name: recipientName } }];

    // ✅ ALWAYS add hello@pandapatches.com to CC for record-keeping
    const ccAddresses = ['hello@pandapatches.com'];

    // Add any additional CC emails from the request
    if (cc) {
      const additionalCC = cc.split(',')
        .map((email: string) => email.trim())
        .filter(Boolean)
        .filter((email: string) => !email.includes('\n') && !email.includes('\r')); // Prevent header injection
      ccAddresses.push(...additionalCC);
    }

    // Remove duplicates and filter out only the recipient email from CC
    const uniqueCC = [...new Set(ccAddresses)].filter(email => email !== to);

    const ccFormatted = uniqueCC.length > 0
      ? uniqueCC.map(email => ({ email_address: { address: email } }))
      : undefined;

    // Build HTML content
    const htmlContent = buildEmailHTML(template_id, processedData);

    console.log(`📤 Sending email via ZeptoMail API to: ${to}, CC: ${uniqueCC.join(', ')}`);

    // Prepare attachments for ZeptoMail API format
    // Separate inline images from regular attachments (ZeptoMail requires this)
    const emailInlineImages = [];
    const emailAttachments = [];

    // Add inline images (winner file) with Content-ID - goes to inline_images
    for (const inline of inlineAttachments) {
      emailInlineImages.push({
        name: inline.Filename,
        content: inline.Base64Content,
        mime_type: inline["Content-type"],
        cid: inline.ContentID,
      });
    }

    // Add regular attachments (gallery files) - goes to attachments
    for (const attachment of attachments) {
      emailAttachments.push({
        name: attachment.Filename,
        content: attachment.Base64Content,
        mime_type: attachment["Content-type"],
      });
    }

    // Build ZeptoMail API payload
    const emailSubject = getEmailSubject(template_id, processedData);

    const zeptomailPayload: any = {
      from: {
        address: from_email || SMTP_FROM_EMAIL,
        name: SMTP_FROM_NAME,
      },
      to: toAddresses,
      reply_to: {
        address: SMTP_REPLY_TO,
        name: SMTP_FROM_NAME,
      },
      subject: emailSubject,
      htmlbody: htmlContent,
    };

    // Add bounce_address only if configured
    if (ZEPTOMAIL_BOUNCE_ADDRESS) {
      zeptomailPayload.bounce_address = ZEPTOMAIL_BOUNCE_ADDRESS;
    }

    // Add CC only if there are valid CC recipients
    if (ccFormatted && ccFormatted.length > 0) {
      zeptomailPayload.cc = ccFormatted;
    }

    // Add inline images (for embedded images like the main design)
    if (emailInlineImages.length > 0) {
      zeptomailPayload.inline_images = emailInlineImages;
    }

    // Add regular attachments (downloadable files)
    if (emailAttachments.length > 0) {
      zeptomailPayload.attachments = emailAttachments;
    }

    // Send email via ZeptoMail REST API
    // Check if API key already has prefix (user might have included it)
    const authHeader = ZEPTOMAIL_API_KEY.startsWith('Zoho-enczapikey')
      ? ZEPTOMAIL_API_KEY
      : `Zoho-enczapikey ${ZEPTOMAIL_API_KEY}`;

    const zeptomailResponse = await fetch('https://api.zeptomail.com/v1.1/email', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(zeptomailPayload),
    });

    const responseText = await zeptomailResponse.text();

    if (!zeptomailResponse.ok) {
      let errorData;
      try {
        errorData = responseText ? JSON.parse(responseText) : { message: 'No response body' };
      } catch {
        errorData = { message: responseText || 'Unknown error' };
      }
      console.error('❌ ZeptoMail API Error:', errorData);
      throw new Error(`ZeptoMail API error (${zeptomailResponse.status}): ${JSON.stringify(errorData)}`);
    }

    console.log(`✅ Email sent successfully via ZeptoMail to: ${to}`);

    return new Response(JSON.stringify({ success: true }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 });

  } catch (error: any) {
    // Handle Zod validation errors with proper 400 status
    if (error.name === 'ZodError') {
      const validationErrors = error.errors.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message
      }));
      console.error("Validation Error:", validationErrors);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          details: validationErrors
        }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Return 200 even on other errors so Frontend doesn't spin, but log it.
    console.error("Edge Function Error:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 });
  }
});