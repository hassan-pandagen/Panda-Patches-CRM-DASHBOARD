
import { supabase } from './supabaseClient';
import { UserProfile, UserRole } from '../types';

/**
 * Fetches the profile for a single user.
 */
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
    const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, role')
        .eq('id', userId)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found, which is ok
        console.error('Error fetching user profile:', error);
        return null;
    }
    return data as UserProfile;
};

/**
 * Fetches all user profiles. (Admin only)
 */
export const getAllUserProfiles = async (): Promise<UserProfile[]> => {
    const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, role');

    if (error) {
        console.error('Error fetching all user profiles:', error);
        throw new Error(error.message);
    }
    return data as UserProfile[];
};

/**
 * Updates the role for a specific user. (Admin only)
 */
export const updateUserProfileRole = async (userId: string, role: UserRole): Promise<UserProfile> => {
    const { data, error } = await supabase
        .from('user_profiles')
        .update({ role })
        .eq('id', userId)
        .select('id, email, role')
        .single();
    
    if (error) {
        console.error('Error updating user role:', error);
        throw new Error(error.message);
    }
    return data as UserProfile;
};
