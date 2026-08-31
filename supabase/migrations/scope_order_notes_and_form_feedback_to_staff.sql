-- order_notes / form_feedback were readable by ANY authenticated user
-- 2026-09-01 · APPLIED via MCP
--
-- Both had SELECT policies with USING (true) granted to authenticated. That role is not
-- "staff": it covers 583 customer-portal logins, plus anyone who self-registers — in the
-- dashboard "Allow new users to sign up" is ON while "Confirm email" is OFF, so a stranger
-- can create an account with an unverified address and immediately hold an authenticated
-- JWT. 20 users currently have email_confirmed_at IS NULL.
--
-- order_notes holds INTERNAL sales notes, quality feedback, customer-call records and
-- complaints (with 1-5 star ratings) — staff-only by the same reasoning as "production
-- never sees payment info" (PROJECT-KNOWLEDGE 5.1). Only 6 rows today, but the exposure is
-- structural and the table grows.
--
-- form_feedback is quote-form UX ratings (237 rows), surfaced in Reports.
--
-- Safe to scope: read exclusively by staff-only hooks — src/hooks/useOrderNotes.ts
-- (OrderPage internal notes panel) and src/hooks/useFormFeedback.ts (Reports). No
-- customer-facing code touches either.
DROP POLICY IF EXISTS "Users can view order notes" ON public.order_notes;
CREATE POLICY "staff_view_order_notes"
  ON public.order_notes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Dashboard users can view form feedback" ON public.form_feedback;
CREATE POLICY "staff_view_form_feedback"
  ON public.form_feedback FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid()));
