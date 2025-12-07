-- Migration: Create order_communications table for email tracking
-- This table logs all emails sent related to orders

CREATE TABLE IF NOT EXISTS public.order_communications (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  template_id VARCHAR(100) NOT NULL,
  subject TEXT,
  body TEXT,
  visibility VARCHAR(50) DEFAULT 'internal', -- 'internal' or 'customer'
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX idx_order_communications_order_id ON public.order_communications(order_id);
CREATE INDEX idx_order_communications_recipient_email ON public.order_communications(recipient_email);
CREATE INDEX idx_order_communications_sent_at ON public.order_communications(sent_at);

-- Enable RLS
ALTER TABLE public.order_communications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view communications for their own orders
CREATE POLICY "Users can view order communications"
  ON public.order_communications
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_communications.order_id
      AND (orders.created_by = auth.uid()::text OR auth.jwt() ->> 'role' = 'admin')
    )
  );

-- RLS Policy: Allow insert from backend/functions
CREATE POLICY "Allow insert from functions"
  ON public.order_communications
  FOR INSERT
  WITH CHECK (true);

-- Grant access
GRANT SELECT, INSERT ON public.order_communications TO authenticated;
