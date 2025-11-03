
import { supabase } from './supabaseClient';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// FIX: Add and export the `signUpUser` function to allow new users to register. This was missing and caused a compile error on the sign-up page.
export const signUpUser = (email: string, password: string) => {
  return supabase.auth.signUp({
    email,
    password,
  });
};

export const signInUser = (email: string, password: string) => {
  return supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });
};

export const signOutUser = () => {
  return supabase.auth.signOut();
};

export const getSession = async (): Promise<Session | null> => {
    // getSession is now an async function in supabase-js v2
    const { data, error } = await supabase.auth.getSession();
    if (error) {
        console.error("Error getting session:", error.message);
        return null;
    }
    return data.session;
};

export const onAuthStateChange = (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
  return supabase.auth.onAuthStateChange(callback);
};

export const sendPasswordResetEmail = (email: string) => {
  // The redirectTo URL must point to the page in your app where users can update their password.
  // With HashRouter, we must include the '#' in the path.
  const resetUrl = `${window.location.origin}/#/update-password`;

  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: resetUrl,
  });
};

export const updateUserPassword = (password: string) => {
    // This function can only be called when a user is authenticated.
    // Supabase handles this by creating a temporary session when the user clicks the reset link.
    return supabase.auth.updateUser({ password: password });
};

/**
 * Creates a new user with a temporary password and immediately sends them a password reset link.
 * This serves as a secure, client-side-only invitation flow.
 * @param email The email of the new user to create.
 */
export const createUserAndSendPasswordReset = async (email: string) => {
    // 1. Create the user with a secure, random, temporary password.
    // The user will never use this password.
    const temporaryPassword = uuidv4();
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: temporaryPassword,
    });

    if (signUpError) {
        // If the error is that the user already exists, we can still proceed to send them a reset link.
        // This makes the function idempotent and user-friendly.
        if (signUpError.message.includes('User already registered')) {
            console.log('User already exists. Proceeding to send password reset email.');
        } else {
            // For any other sign-up error, we should stop and throw the error.
            throw signUpError;
        }
    }

    // This check is important because even if signUp reports an existing user,
    // the `user` object might be null.
    const userExists = signUpData.user || signUpError?.message.includes('User already registered');

    if (userExists) {
        // 2. Immediately send a password reset email.
        // This email will act as the user's setup/invitation link.
        const { error: resetError } = await sendPasswordResetEmail(email);
        if (resetError) {
            throw resetError;
        }
    } else {
         throw new Error("Could not create user or verify their existence.");
    }
};
