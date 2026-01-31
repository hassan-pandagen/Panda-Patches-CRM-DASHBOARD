// ✅ MIGRATED FROM AWS SES TO ZEPTOMAIL REST API
// Date: 2026-01-17
// Migration Reason: AWS SES stuck in sandbox, moving to ZeptoMail (10K free emails/month)
// Note: Using simplified approach with plain text fallback due to HTML size limits

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Allow all origins (including localhost)
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    )
});

// 1. Helper: Get Clean Filename
const getFileName = (url: string) => {
  try {
      return decodeURIComponent(url.split('/').pop() || 'file').split('?')[0];
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
  };

  return subjects[templateId] || `Update from Panda Patches - ${orderNumber}`;
};

// 3. Helper: Get Template Message based on Template ID
const getTemplateMessage = (templateId: string): string => {
  const messages: Record<string, string> = {
    // Quote templates
    'd-fcd19c2e3d2d42a4b0e1bf3087179c7d': 'Great news! We have received your custom patch request. Our design team has carefully reviewed your specifications and prepared a detailed quote proposal. Below you\'ll find all the information regarding your quote.',
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
  };

  return messages[templateId] || 'Thank you for your order! Our team is working on your custom patches.';
};

// 4. Helper: Build Email HTML from Template ID and Data
const buildEmailHTML = (templateId: string, data: any): string => {
  // Get template-specific message if not provided in data
  const emailMessage = data.message || getTemplateMessage(templateId);

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
              ${data.quote_number ? `<span style="font-size: 16px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">Quote Number: &nbsp;</span><span style="font-size: 16px; color: #fb6e1d; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">${data.quote_number}</span>` : `<span style="font-size: 16px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">Order Number: &nbsp;</span><span style="font-size: 16px; color: #fb6e1d; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">${data.order_number || 'N/A'}</span>`}
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
                `<span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">Hi </span><span style="font-size: 18px; color: #fb6e1d; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">${data.customer_name || 'Customer'}</span><span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">,&nbsp;</span>`
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

  <!-- SPACER -->
  <table class="module" role="module" data-type="spacer" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:0px 0px 30px 0px;" role="module-content" bgcolor=""></td>
      </tr>
    </tbody>
  </table>

  <!-- ORDER INFORMATION HEADER (Yellow on Black) -->
  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:40px 0px 40px 40px; line-height:22px; text-align:inherit; background-color:#080808;" height="100%" valign="top" bgcolor="#080808" role="module-content">
          <div>
            <div style="font-family: inherit; text-align: center">
              <span style="font-size: 28px; color: #dcff70; font-family: 'lucida sans unicode', 'lucida grande', sans-serif"><strong>Order Information</strong></span>
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
                              <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 18px;">${data.quote_number ? 'Quote' : 'Order'} Number: ${data.quote_number || data.order_number || 'N/A'}</span>
                            </div>
                            <div style="font-family: inherit; text-align: center"><br></div>
                            ${data.design_name ? `
                              <div style="font-family: inherit; text-align: center">
                                <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 18px;">Design Name: ${data.design_name}</span>
                              </div>
                              <div style="font-family: inherit; text-align: center"><br></div>
                            ` : ''}
                            ${data.patches_quantity || data.quantity ? `
                              <div style="font-family: inherit; text-align: center">
                                <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 18px;">Quantity: ${data.patches_quantity || data.quantity}</span>
                              </div>
                              <div style="font-family: inherit; text-align: center"><br></div>
                            ` : ''}
                            ${data.patches_type || data.patch_type ? `
                              <div style="font-family: inherit; text-align: center">
                                <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 18px;">Patch Type: ${data.patches_type || data.patch_type}</span>
                              </div>
                              <div style="font-family: inherit; text-align: center"><br></div>
                            ` : ''}
                            ${data.design_backing || data.backing ? `
                              <div style="font-family: inherit; text-align: center">
                                <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 18px;">Backing: ${data.design_backing || data.backing}</span>
                              </div>
                              <div style="font-family: inherit; text-align: center"><br></div>
                            ` : ''}
                            ${data.border_type ? `
                              <div style="font-family: inherit; text-align: center">
                                <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 18px;">Border Type: ${data.border_type}</span>
                              </div>
                              <div style="font-family: inherit; text-align: center"><br></div>
                            ` : ''}
                            ${templateId.includes('INTERNAL') && data.instructions ? `
                              <div style="font-family: inherit; text-align: center">
                                <span style="font-family: 'lucida sans unicode', 'lucida grande', sans-serif; font-size: 18px;">Special Instruction: ${data.instructions}</span>
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

  ${templateId.includes('INTERNAL') && data.order_link ? `
  <!-- VIEW CRM BUTTON (Internal Emails Only) -->
  <table border="0" cellpadding="0" cellspacing="0" class="module" data-type="button" role="module" style="table-layout: fixed;" width="100%">
    <tbody>
      <tr>
        <td align="center" bgcolor="" class="outer-td" style="padding:20px 0px 20px 0px;">
          <table border="0" cellpadding="0" cellspacing="0" class="wrapper-mobile" style="text-align:center;">
            <tbody>
              <tr>
                <td align="center" bgcolor="#FB6E1D" class="inner-td" style="border-radius:6px; font-size:16px; text-align:center; background-color:inherit;">
                  <a href="${data.order_link}" style="background-color:#FB6E1D; border:1px solid #FB6E1D; border-color:#FB6E1D; border-radius:6px; border-width:1px; color:#ffffff; display:inline-block; font-size:16px; font-weight:bold; letter-spacing:0px; line-height:normal; padding:16px 40px 16px 40px; text-align:center; text-decoration:none; border-style:solid; font-family: 'lucida sans unicode', 'lucida grande', sans-serif;" target="_blank">
                    VIEW IN CRM PORTAL →
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

  <!-- CLOSING MESSAGE -->
  <table class="module" role="module" data-type="text" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
    <tbody>
      <tr>
        <td style="padding:18px 0px 18px 0px; line-height:22px; text-align:inherit;" height="100%" valign="top" bgcolor="" role="module-content">
          <div>
            <div style="font-family: inherit; text-align: left">
              <span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">&nbsp;${data.quote_number ? 'Once you approve this quote, we will proceed with your order immediately.' : 'We\'re working on your order and will keep you updated on its progress.'}</span>
            </div>
            <div style="font-family: inherit; text-align: left"><br></div>
            <div style="font-family: inherit; text-align: left">
              <span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif">&nbsp;Thank you,&nbsp;</span>
            </div>
            <div style="font-family: inherit; text-align: left">
              <span style="font-size: 18px; font-family: 'lucida sans unicode', 'lucida grande', sans-serif"><strong>&nbsp;Panda Patches Team</strong></span>
            </div>
          </div>
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ✅ CHECK: Verify ZeptoMail API credentials are configured
    const ZEPTOMAIL_API_KEY = Deno.env.get('ZEPTOMAIL_API_KEY');
    const ZEPTOMAIL_BOUNCE_ADDRESS = Deno.env.get('ZEPTOMAIL_BOUNCE_ADDRESS'); // Optional
    const SMTP_FROM_EMAIL = Deno.env.get('SMTP_FROM_EMAIL') || 'lance@pandapatches.com';
    const SMTP_FROM_NAME = Deno.env.get('SMTP_FROM_NAME') || 'Panda Patches';
    const SMTP_REPLY_TO = Deno.env.get('SMTP_REPLY_TO') || 'hello@pandapatches.com';

    if (!ZEPTOMAIL_API_KEY) {
      console.error('❌ CRITICAL: ZEPTOMAIL_API_KEY not set in Supabase secrets');
      throw new Error('ZEPTOMAIL_API_KEY not configured. Run: supabase secrets set ZEPTOMAIL_API_KEY=your_key');
    }

    // Parse and validate request body
    const body = await req.json();
    const validatedData = sendEmailSchema.parse(body);

    const { to, template_id, dynamic_data, cc } = validatedData;
    const attachments = [];
    const inlineAttachments = [];

    // Deep copy data so we can modify it for the template
    const processedData = JSON.parse(JSON.stringify(dynamic_data));

    console.log(`📧 Processing email for: ${to} using template: ${template_id}`);

    // --- A. PROCESS WINNER (The Lightbox Image) ---
    if (processedData.winner_file && processedData.winner_file.url) {
        const file = await fetchFile(processedData.winner_file.url);

        if (file && file.isImage) {
            // IMAGE -> INLINE (Use Content-ID for Lightbox)
            const cid = 'winner_img';
            inlineAttachments.push({
                "Content-type": file.type,
                "Filename": `Preview-${file.filename}`,
                "ContentID": cid,
                "Base64Content": file.content
            });
            processedData.winner_file.preview = `cid:${cid}`;
            processedData.winner_file.is_image = true;
        }
        else if (file && !file.isImage) {
            // PDF -> ATTACHMENT (Never Inline)
            attachments.push({
                "Content-type": file.type,
                "Filename": file.filename,
                "Base64Content": file.content
            });
            // Give it a generic icon in the email body so it's not broken
            processedData.winner_file.preview = "https://cdn-icons-png.flaticon.com/512/337/337946.png";
            processedData.winner_file.is_image = false;
        }
    }

    // --- B. PROCESS GALLERY (Limited to prevent memory issues) ---
    // Limit: Max 2 gallery attachments, max 4MB total to prevent Edge Function memory limit
    const MAX_GALLERY_ATTACHMENTS = 2;
    const MAX_TOTAL_SIZE_MB = 4;
    let totalAttachmentSize = 0;

    if (processedData.gallery_files && Array.isArray(processedData.gallery_files)) {
        for (const item of processedData.gallery_files) {
            // Stop if we hit the attachment limit
            if (attachments.length >= MAX_GALLERY_ATTACHMENTS) {
                console.log(`📎 Gallery limit reached (${MAX_GALLERY_ATTACHMENTS} files max)`);
                break;
            }

            const file = await fetchFile(item.url);

            if (file) {
                // Check size (base64 is ~33% larger than original)
                const fileSizeMB = (file.content.length * 0.75) / (1024 * 1024);
                if (totalAttachmentSize + fileSizeMB > MAX_TOTAL_SIZE_MB) {
                    console.log(`📎 Skipping file, would exceed ${MAX_TOTAL_SIZE_MB}MB limit`);
                    continue;
                }

                totalAttachmentSize += fileSizeMB;
                attachments.push({
                    "Content-type": file.type,
                    "Filename": file.filename,
                    "Base64Content": file.content
                });
            }
        }
        console.log(`📎 Gallery: ${attachments.length} files, ~${totalAttachmentSize.toFixed(1)}MB total`);
        // CLEANUP: Empty the gallery list so the template doesn't try to render text
        processedData.gallery_files = [];
        processedData.has_gallery = false;
    }

    // --- C. SEND VIA ZEPTOMAIL REST API ---
    // Build recipient list
    const toAddresses = [{ email_address: { address: to, name: processedData.customer_name || 'Customer' } }];

    // ✅ ALWAYS add hello@pandapatches.com to CC for record-keeping
    const ccAddresses = ['hello@pandapatches.com'];

    // Add any additional CC emails from the request
    if (cc) {
      const additionalCC = cc.split(',').map((email: string) => email.trim()).filter(Boolean);
      ccAddresses.push(...additionalCC);
    }

    // Remove duplicates and filter out recipient email and sender email from CC
    const uniqueCC = [...new Set(ccAddresses)].filter(email =>
      email !== to && email !== SMTP_FROM_EMAIL
    );

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
        address: SMTP_FROM_EMAIL,
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

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

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
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Return 200 even on other errors so Frontend doesn't spin, but log it.
    console.error("Edge Function Error:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  }
});