// src/services/authService.ts - FINAL SECURE VERSION

import { supabase } from './supabaseClient'; // We ONLY import the public client now
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { UserRole } from '../types';

// ------------------- AUTH BASICS -------------------
// These functions are safe and do not need to change.

export const signInUser = async (email: string, password: string) => {
  return supabase.auth.signInWithPassword({ email: email.trim(), password });
};

export const signOutUser = async () => {
  return supabase.auth.signOut();
};

// Add this function to allow users to change their own password
export const updateMyPassword = async (newPassword: string) => {
  const { data, error } = await supabase.auth.updateUser({ 
    password: newPassword 
  });
  
  return { data, error };
};

// ... (other non-admin functions like getSession, onAuthStateChange, etc. can stay)


// ------------------- ADMIN ACTIONS -------------------

// --- THIS IS THE NEW, SECURE VERSION OF THE FUNCTION ---
export const createUserWithRole = async (
  email: string,
  role: UserRole,
  access: Record<string, boolean>,
  fullName: string,
  password: string // <--- Add this argument
): Promise<{ user?: User; temporaryPassword?: string; error?: string }> => {
  try {
    // Securely call the 'create-user' Edge Function
    const { data, error: invokeError } = await supabase.functions.invoke('create-user', {
      // Send password to the edge function
      body: { email, role, fullName, access, password },
    });

    if (invokeError) throw new Error(invokeError.message);
    if (data.error) throw new Error(data.error);

    return data;
  } catch (err: any) {
    console.error('Error invoking create-user function:', err);
    return { error: err.message };
  }
};

// --- The following admin functions are now commented out. ---
// --- They will be re-enabled one-by-one as you create Edge Functions for them. ---

export const getAllUsers = async () => {
  const { data, error } = await supabase.functions.invoke('get-users');
  if (error) throw new Error(error.message);
  // The function returns { users: [...] }
  return data.users; 
};

export const deleteUser = async (userId: string) => {
  const { data, error } = await supabase.functions.invoke('delete-user', {
    body: { user_id: userId }
  });
  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);
  return data;
};

export const updateUserProfile = async (userId: string, updates: any) => {
  const { data, error } = await supabase.functions.invoke('update-user', {
    body: { user_id: userId, ...updates }
  });
  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);
  return data;
};
/*
export const updateUserPasswordById = async (userId: string, newPassword: string) => {
  // TODO: Create an 'update-user-password' Edge Function
};
*/