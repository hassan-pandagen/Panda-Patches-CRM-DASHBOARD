-- Order Notes table for sales team to log customer feedback, quality notes, complaints
CREATE TABLE IF NOT EXISTS order_notes (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    order_id bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id uuid REFERENCES user_profiles(id),
    user_email text NOT NULL,
    user_name text NOT NULL DEFAULT '',
    note_type text NOT NULL DEFAULT 'general', -- 'quality_feedback', 'customer_call', 'complaint', 'general'
    content text NOT NULL,
    rating smallint CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)), -- 1-5 star rating (nullable)
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_order_notes_order_id ON order_notes(order_id);
CREATE INDEX IF NOT EXISTS idx_order_notes_created_at ON order_notes(created_at);
CREATE INDEX IF NOT EXISTS idx_order_notes_note_type ON order_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_order_notes_rating ON order_notes(rating) WHERE rating IS NOT NULL;

-- Enable RLS
ALTER TABLE order_notes ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read notes
CREATE POLICY "Users can view order notes"
    ON order_notes FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Authenticated users can insert their own notes
CREATE POLICY "Users can create order notes"
    ON order_notes FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own notes, admins can delete any
CREATE POLICY "Users can delete own notes"
    ON order_notes FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
