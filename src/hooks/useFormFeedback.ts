import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { FormFeedback } from '../types';
import { logger } from '../services/logger';
import { queryKeys } from '../constants/queryKeys';

const fetchFormFeedback = async (startDate: string, endDate: string): Promise<FormFeedback[]> => {
  const { data, error } = await supabase
    .from('form_feedback')
    .select('*')
    .gte('created_at', startDate)
    .lt('created_at', endDate)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Error fetching form feedback:', { error });
    throw new Error(error.message);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    formType: row.form_type,
    rating: row.rating,
    comment: row.comment,
    pageUrl: row.page_url,
    createdAt: row.created_at,
  }));
};

export const useFormFeedback = (startDate: string, endDate: string) => {
  return useQuery({
    queryKey: queryKeys.formFeedback.range(startDate, endDate),
    queryFn: () => fetchFormFeedback(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
};
