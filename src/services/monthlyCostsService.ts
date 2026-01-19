// src/services/monthlyCostsService.ts

import { supabase } from './supabaseClient';
import { queryClient } from './queryClient';
import { queryKeys } from '../constants/queryKeys';
import { MonthlyCost } from '../types/index';
import { logger } from './logger';

/**
 * Expense categories for monthly operating costs
 */
export const EXPENSE_CATEGORIES = [
  'Rent',
  'Salaries & Commission',
  'Utilities',
  'Other Assets',
  'Petty Cash',
  'Other Expenses'
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

/**
 * Convert database snake_case to frontend camelCase for MonthlyCost
 */
export const mapDbToMonthlyCost = (data: any): MonthlyCost => {
  if (!data) return null as any;

  const toNumber = (val: any) => {
    if (val === null || val === undefined || val === '') return 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  };

  return {
    id: data.id,
    monthYear: data.monthYear ?? data.month_year,
    category: data.category,
    amount: toNumber(data.amount),
    notes: data.notes || null,
    addedBy: data.addedBy ?? data.added_by,
    createdAt: data.createdAt ?? data.created_at,
    updatedAt: data.updatedAt ?? data.updated_at,
  };
};

/**
 * Convert frontend camelCase to database snake_case
 */
const toSnakeCase = (data: any): any => {
  if (!data || typeof data !== 'object') return {};

  const readOnlyFields = new Set(['id', 'createdAt', 'updatedAt']);
  const snakeCaseObject: { [key: string]: any } = {};

  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key) && !readOnlyFields.has(key)) {
      const value = data[key];
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      snakeCaseObject[snakeKey] = value === undefined ? null : value;
    }
  }

  return snakeCaseObject;
};

/**
 * Fetch monthly costs for a specific month
 * @param monthYear Format: "YYYY-MM" (e.g., "2026-01")
 */
export const getMonthlyCosts = async (monthYear: string): Promise<MonthlyCost[]> => {
  try {
    logger.info(`Fetching monthly costs for ${monthYear}`);

    const { data, error } = await supabase
      .from('monthly_costs')
      .select('*')
      .eq('month_year', monthYear)
      .order('category', { ascending: true });

    if (error) {
      logger.error('Error fetching monthly costs:', error);
      throw error;
    }

    return (data || []).map(mapDbToMonthlyCost);
  } catch (error) {
    logger.error('Failed to fetch monthly costs:', error);
    throw error;
  }
};

/**
 * Fetch monthly costs for a date range (multiple months)
 * @param startMonth Format: "YYYY-MM"
 * @param endMonth Format: "YYYY-MM"
 */
export const getMonthlyCostsForRange = async (
  startMonth: string,
  endMonth: string
): Promise<MonthlyCost[]> => {
  try {
    logger.info(`Fetching monthly costs from ${startMonth} to ${endMonth}`);

    const { data, error } = await supabase
      .from('monthly_costs')
      .select('*')
      .gte('month_year', startMonth)
      .lte('month_year', endMonth)
      .order('month_year', { ascending: true })
      .order('category', { ascending: true });

    if (error) {
      logger.error('Error fetching monthly costs for range:', error);
      throw error;
    }

    return (data || []).map(mapDbToMonthlyCost);
  } catch (error) {
    logger.error('Failed to fetch monthly costs for range:', error);
    throw error;
  }
};

/**
 * Upsert (insert or update) a monthly cost entry
 * Uses unique constraint on (month_year, category) to update if exists
 */
export const upsertMonthlyCost = async (
  costData: Partial<MonthlyCost>
): Promise<MonthlyCost> => {
  try {
    logger.info('Upserting monthly cost:', costData);

    // Get current user email
    const { data: { user } } = await supabase.auth.getUser();
    const userEmail = user?.email;

    const payload = {
      ...toSnakeCase(costData),
      added_by: userEmail,
    };

    // Try to update first
    const { data: existing } = await supabase
      .from('monthly_costs')
      .select('id')
      .eq('month_year', costData.monthYear!)
      .eq('category', costData.category!)
      .single();

    if (existing) {
      // Update existing record
      const { data, error } = await supabase
        .from('monthly_costs')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        logger.error('Error updating monthly cost:', error);
        throw error;
      }

      // Invalidate queries
      queryClient.invalidateQueries(queryKeys.monthlyCosts.all());

      return mapDbToMonthlyCost(data);
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from('monthly_costs')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('Error inserting monthly cost:', error);
        throw error;
      }

      // Invalidate queries
      queryClient.invalidateQueries(queryKeys.monthlyCosts.all());

      return mapDbToMonthlyCost(data);
    }
  } catch (error) {
    logger.error('Failed to upsert monthly cost:', error);
    throw error;
  }
};

/**
 * Get total expenses for a specific month
 * @param monthYear Format: "YYYY-MM"
 */
export const getTotalExpensesForMonth = async (monthYear: string): Promise<number> => {
  try {
    const costs = await getMonthlyCosts(monthYear);
    return costs.reduce((sum, cost) => sum + cost.amount, 0);
  } catch (error) {
    logger.error('Failed to calculate total expenses:', error);
    return 0;
  }
};

/**
 * Delete a monthly cost entry
 */
export const deleteMonthlyCost = async (id: number): Promise<void> => {
  try {
    logger.info(`Deleting monthly cost with id ${id}`);

    const { error } = await supabase
      .from('monthly_costs')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting monthly cost:', error);
      throw error;
    }

    // Invalidate queries
    queryClient.invalidateQueries(queryKeys.monthlyCosts.all());
  } catch (error) {
    logger.error('Failed to delete monthly cost:', error);
    throw error;
  }
};
