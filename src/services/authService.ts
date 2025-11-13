// src/services/authService.ts
import { supabaseAdmin } from './supabaseClient';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { UserRole } from '../types';

// ------------------- AUTH BASICS -------------------

// Sign in existing user
export const signInUser = async (email: string, password: string) => {
  // Use the main supabase client for this public action
  const { supabase } = await import('./supabaseClient');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    console.error('Supabase login error:', error.message);
    return { error };
  }

  console.log('Login successful. Session:', !!data.session);
  return { data, error: null };
};

// Sign up self-registration (only for general users)
export const signUpUser = async (email: string, password: string) => {
  const { supabase } = await import('./supabaseClient');
  return supabase.auth.signUp({
    email: email.trim(),
    password,
  });
};

// Sign out
export const signOutUser = async () => {
  const { supabase } = await import('./supabaseClient');
  return supabase.auth.signOut();
};

// Get active session
export const getSession = async (): Promise<Session | null> => {
  const { supabase } = await import('./supabaseClient');
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error getting session:', error.message);
    return null;
  }
  return data.session;
};

// Auth state listener
export const onAuthStateChange = async ( // Mark the function as async
  callback: (event: AuthChangeEvent, session: Session | null) => void | Promise<void>
) => {
  const { supabase } = await import('./supabaseClient');
  return supabase.auth.onAuthStateChange(async (event, session) => await callback(event, session));
};

// ------------------- PASSWORD MANAGEMENT -------------------

export const sendPasswordResetEmail = async (email: string) => {
  const { supabase } = await import('./supabaseClient');
  const resetUrl = `${window.location.origin}/#/update-password`;
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: resetUrl,
  });
};

export const updateUserPassword = async (password: string) => {
  const { supabase } = await import('./supabaseClient');
  return supabase.auth.updateUser({ password });
};

export const updateUserPasswordById = async (
  userId: string,
  newPassword: string
) => {
  if (!supabaseAdmin) {
    throw new Error('Admin client not initialized.');
  }
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) throw new Error(error.message);
  return data;
};
// ------------------- ADMIN ACTIONS -------------------

// Create a new user (admin only)
export const createUserWithRole = async (
  email: string,
  role: UserRole,
  access: Record<string, boolean>,
  fullName: string
): Promise<{ user?: User; temporaryPassword?: string; error?: string }> => {
  if (!supabaseAdmin) {
    return { error: 'Admin client not initialized. Missing service role key.' };
  }

  try {
    const temporaryPassword = crypto.randomUUID();

    // Create user in Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
    });

    if (error) throw error;

    const user = data?.user;

    // FIX: The `handle_new_user` trigger in the database is now responsible
    // for creating the user profile. We only need to set the metadata here
    // which the trigger will use.
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { user_metadata: { role, access, full_name: fullName } }
    );

    if (updateError) throw updateError;

    return { user: updatedUser.user, temporaryPassword };
  } catch (err: any) {
    console.error('Error creating user with role:', err);
    return { error: err.message };
  }
};

// Get all users (admin only)
export const getAllUsers = async () => {
  if (!supabaseAdmin) {
    console.error('Admin client not initialized. Missing service role key.');
    return { data: null, error: 'Admin client not initialized.' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('*');

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (err: any) {
    console.error('Error fetching all users:', err.message);
    return { data: null, error: err.message };
  }
};

// Update a user's profile (admin only)
export const updateUserProfile = async (
  userId: string,
  updates: { role?: UserRole; access?: Record<string, boolean>; full_name?: string }
) => {
  if (!supabaseAdmin) {
    return { error: 'Admin client not initialized.' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (err: any) {
    console.error('Error updating user profile:', err.message);
    return { data: null, error: err.message };
  }
};

// Delete a user (admin only)
export const deleteUser = async (userId: string) => {
  if (!supabaseAdmin) {
    return { error: 'Admin client not initialized.' };
  }

  try {
    // This will also delete the user from user_profiles due to ON DELETE CASCADE
    const { data, error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (err: any) {
    console.error('Error deleting user:', err.message);
    return { data: null, error: err.message };
  }
};
