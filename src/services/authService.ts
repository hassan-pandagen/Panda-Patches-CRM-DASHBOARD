// src/services/authService.ts - FINAL SECURE VERSION WITH ERROR HANDLING

import { supabase } from './supabaseClient';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { UserRole } from '../types';
import { logger } from './logger';
import { performanceMonitor } from './performanceMonitor';

// ------------------- AUTH BASICS -------------------

export const signInUser = async (email: string, password: string) => {
  try {
    return await supabase.auth.signInWithPassword({ email: email.trim(), password });
  } catch (err: any) {
    logger.error('[Auth Service] Sign in failed', err);
    throw err;
  }
};

export const signOutUser = async () => {
  const end = performanceMonitor.startMeasure('signOutUser', 'api');
  try {
    const result = await supabase.auth.signOut();
    end();
    return result;
  } catch (err: any) {
    end();
    logger.error('[Auth Service] Sign out failed', err);
    throw err;
  }
};

export const updateMyPassword = async (newPassword: string) => {
  try {
    const { data, error } = await supabase.auth.updateUser({ 
      password: newPassword 
    });
    
    if (error) throw error;
    return { data, error: null };
  } catch (err: any) {
    logger.error('[Auth Service] Password update failed', err);
    return { data: null, error: err };
  }
};

// ------------------- ADMIN ACTIONS -------------------

export const createUserWithRole = async (
  email: string,
  roles: UserRole | UserRole[],
  access: Record<string, boolean | undefined>,
  fullName: string,
  password: string
): Promise<{ user?: User; temporaryPassword?: string; error?: string }> => {
  try {
    // An account can hold several roles. Send the set; the edge function writes `roles`
    // and the DB trigger derives the primary `role` from it.
    const roleSet = Array.isArray(roles) ? roles : [roles];
    const { data, error: invokeError } = await supabase.functions.invoke('create-user', {
      body: { email, roles: roleSet, fullName, access, password },
    });

    if (invokeError) {
      // supabase.functions.invoke turns any non-2xx into "Edge Function returned a
      // non-2xx status code" and drops the body — which is what made a broken
      // handle_new_user trigger look like an unexplained failure for three attempts.
      // Read the real reason out of the response, the same way updateUserProfile does.
      let message = invokeError.message;
      try {
        const body = await (invokeError as any)?.context?.json?.();
        if (body?.error) message = body.error;
        else if (Array.isArray(body?.details) && body.details[0]?.message) {
          message = body.details.map((d: any) => d.message).join('. ');
        }
      } catch { /* keep the generic message */ }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);

    logger.info(`[Auth Service] User created: ${email}`);
    return data;
  } catch (err: any) {
    logger.error('[Auth Service] Error invoking create-user function', err);
    return { error: err.message };
  }
};

export const getAllUsers = async () => {
  const end = performanceMonitor.startMeasure('getAllUsers', 'api');
  try {
    const { data, error } = await supabase.functions.invoke('get-users');
    
    if (error) throw new Error(error.message);
    if (!data?.users) throw new Error('Invalid response from get-users function');
    
    logger.info('[Auth Service] Retrieved all users');
    end();
    return data.users;
  } catch (err: any) {
    end();
    logger.error('[Auth Service] Error fetching all users', err);
    throw err;
  }
};

export const deleteUser = async (userId: string) => {
  const end = performanceMonitor.startMeasure('deleteUser', 'api');
  try {
    if (!userId) throw new Error('User ID is required');

    // Use supabase.functions.invoke - it properly handles auth
    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: { user_id: userId },
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);

    logger.info(`[Auth Service] User deleted: ${userId}`);
    end();
    return data;
  } catch (err: any) {
    end();
    logger.error('[Auth Service] Error deleting user', err);
    throw err;
  }
};

export const updateUserProfile = async (userId: string, updates: any) => {
  const end = performanceMonitor.startMeasure('updateUserProfile', 'api');
  try {
    if (!userId) throw new Error('User ID is required');
    if (!updates || Object.keys(updates).length === 0) throw new Error('No updates provided');
    
    const { data, error } = await supabase.functions.invoke('update-user', {
      body: { user_id: userId, ...updates }
    });

    if (error) {
      // supabase.functions.invoke surfaces a non-2xx as a generic "Edge Function returned a
      // non-2xx status code". Read the response body so the REAL reason reaches the admin —
      // e.g. GoTrue's "Password is known to be weak and easy to guess…" / "Password should be
      // at least N characters", instead of a cryptic failure.
      let message = error.message;
      try {
        const body = await (error as any)?.context?.json?.();
        if (body?.error) message = body.error;
        else if (Array.isArray(body?.details) && body.details[0]?.message) message = body.details[0].message;
      } catch { /* fall back to the generic message */ }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    
    logger.info(`[Auth Service] User profile updated: ${userId}`);
    end();
    return data;
  } catch (err: any) {
    end();
    logger.error('[Auth Service] Error updating user profile', err);
    throw err;
  }
};
