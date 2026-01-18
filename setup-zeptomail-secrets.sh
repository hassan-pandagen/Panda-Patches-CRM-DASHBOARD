#!/bin/bash
# Setup ZeptoMail REST API Secrets for Supabase Edge Functions
#
# IMPORTANT: You need TWO things from your ZeptoMail Dashboard:
#
# 1. REST API Key (NOT SMTP credentials):
#    - Go to ZeptoMail Dashboard -> Settings -> Send API
#    - Copy the "Zoho-enczapikey" token (starts with something like "PHtE6r0..." NOT "wSsVR...")
#
# 2. Bounce Address (from your Mail Agent):
#    - Go to ZeptoMail Dashboard -> Mail Agents
#    - Click on your mail agent for pandapatches.com
#    - Copy the "Bounce Address" (looks like: bounce@bounce.pandapatches.zohomail.com)

echo "Setting up ZeptoMail secrets..."

# ============================================
# REQUIRED: Update these values from your ZeptoMail Dashboard
# ============================================

# Option 1: Use the REST API Key (RECOMMENDED)
# Get this from: ZeptoMail Dashboard -> Settings -> Send API
supabase secrets set 'ZEPTOMAIL_API_KEY=YOUR_REST_API_KEY_HERE'

# The bounce address from your Mail Agent configuration
# Get this from: ZeptoMail Dashboard -> Mail Agents -> Your Agent -> Bounce Address
supabase secrets set 'ZEPTOMAIL_BOUNCE_ADDRESS=bounce@bounce.pandapatches.zohomail.com'

# From email (must be verified in ZeptoMail)
supabase secrets set SMTP_FROM_EMAIL=hello@pandapatches.com
supabase secrets set 'SMTP_FROM_NAME=Panda Patches'

# ============================================
# LEGACY: SMTP credentials (kept for reference, not used by REST API)
# ============================================
# supabase secrets set SMTP_HOST=smtp.zeptomail.com
# supabase secrets set SMTP_PORT=587
# supabase secrets set SMTP_USERNAME=emailspikey
# supabase secrets set 'SMTP_PASSWORD=wSsVR613+hf5CK15zjCtIewxnQxcAg+jQ0opjACguH6tSqvF/McyxhXIAQD1GvAbFGdoETFBoLl4mxkGhzNW2hekBKBJIMBwAlimGNmEcgl+g=='

echo ""
echo "✅ ZeptoMail secrets configured!"
echo ""
echo "Next steps:"
echo "1. Make sure you updated ZEPTOMAIL_API_KEY with your REST API key"
echo "2. Make sure ZEPTOMAIL_BOUNCE_ADDRESS matches your Mail Agent's bounce address"
echo "3. Deploy the updated edge function: supabase functions deploy send-email"
echo "4. Test by creating a test order or quote"
echo ""
echo "To find your credentials:"
echo "  - REST API Key: ZeptoMail Dashboard -> Settings -> Send API"
echo "  - Bounce Address: ZeptoMail Dashboard -> Mail Agents -> Select Agent -> Bounce Address"
