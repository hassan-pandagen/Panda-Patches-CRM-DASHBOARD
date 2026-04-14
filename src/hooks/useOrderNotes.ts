import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { OrderNote, NoteType } from '../types';
import { logger } from '../services/logger';
import { queryKeys } from '../constants/queryKeys';

// --- Fetch notes for a specific order ---
const fetchOrderNotes = async (orderId: number): Promise<OrderNote[]> => {
  if (!orderId) return [];

  const { data, error } = await supabase
    .from('order_notes')
    .select('id, order_id, user_id, user_email, user_name, note_type, content, rating, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Error fetching order notes:', { orderId, error });
    throw new Error(error.message);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    orderId: row.order_id,
    userId: row.user_id,
    userEmail: row.user_email,
    userName: row.user_name,
    noteType: row.note_type as NoteType,
    content: row.content,
    rating: row.rating,
    createdAt: row.created_at,
  }));
};

export const useOrderNotes = (orderId: number) => {
  return useQuery({
    queryKey: queryKeys.orderNotes.byOrderId(orderId),
    queryFn: () => fetchOrderNotes(orderId),
    enabled: !!orderId,
  });
};

// --- Create a new note ---
interface CreateNoteInput {
  orderId: number;
  userId: string;
  userEmail: string;
  userName: string;
  noteType: NoteType;
  content: string;
  rating: number | null;
}

export const useCreateOrderNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateNoteInput) => {
      const { data, error } = await supabase
        .from('order_notes')
        .insert({
          order_id: input.orderId,
          user_id: input.userId,
          user_email: input.userEmail,
          user_name: input.userName,
          note_type: input.noteType,
          content: input.content,
          rating: input.rating,
        })
        .select()
        .single();

      if (error) {
        logger.error('Error creating order note:', { input, error });
        throw new Error(error.message);
      }
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orderNotes.byOrderId(variables.orderId) });
    },
  });
};

// --- Delete a note ---
export const useDeleteOrderNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, orderId }: { noteId: number; orderId: number }) => {
      const { error } = await supabase
        .from('order_notes')
        .delete()
        .eq('id', noteId);

      if (error) {
        logger.error('Error deleting order note:', { noteId, error });
        throw new Error(error.message);
      }
      return { noteId, orderId };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orderNotes.byOrderId(variables.orderId) });
    },
  });
};

// --- Fetch all notes for reporting (with date range) ---
export const fetchNotesForReport = async (startDate: string, endDate: string): Promise<(OrderNote & { orderNumber?: string; customerName?: string })[]> => {
  // Join with orders to get order number and customer name
  const { data, error } = await supabase
    .from('order_notes')
    .select(`
      id, order_id, user_id, user_email, user_name, note_type, content, rating, created_at,
      orders!inner(order_number, customer_name)
    `)
    .gte('created_at', startDate)
    .lt('created_at', endDate)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Error fetching notes for report:', { error });
    throw new Error(error.message);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    orderId: row.order_id,
    userId: row.user_id,
    userEmail: row.user_email,
    userName: row.user_name,
    noteType: row.note_type as NoteType,
    content: row.content,
    rating: row.rating,
    createdAt: row.created_at,
    orderNumber: row.orders?.order_number,
    customerName: row.orders?.customer_name,
  }));
};
