
import { supabase } from './supabaseClient';
import { UserProfile, UserRole } from '../types';
import { logger } from './logger'; // ✅ UPGRADE 6: Logger service
import { performanceMonitor } from './performanceMonitor'; // ✅ UPGRADE 8: Performance monitoring

/**
 * Fetches the profile for a single user.
 */
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
    const end = performanceMonitor.startMeasure('getUserProfile', 'api');
    try {
        if (!userId) throw new Error('User ID is required');

        const { data, error } = await supabase
            .from('user_profiles')
            .select('id, email, role')
            .eq('id', userId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found, which is ok
            logger.error('[User Service] Error fetching user profile', error);
            end();
            return null;
        }
        end();
        return data as UserProfile;
    } catch (err: any) {
        end();
        logger.error('[User Service] getUserProfile failed', err);
        return null;
    }
};

/**
 * Fetches all user profiles. (Admin only)
 */
export const getAllUserProfiles = async (): Promise<UserProfile[]> => {
    const end = performanceMonitor.startMeasure('getAllUserProfiles', 'api');
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('id, email, role');

        if (error) {
            logger.error('[User Service] Error fetching all user profiles', error);
            end();
            throw new Error(error.message);
        }
        if (!data) throw new Error('No data returned from user profiles query');
        
        logger.info('[User Service] Retrieved all user profiles');
        end();
        return data as UserProfile[];
    } catch (err: any) {
        end();
        logger.error('[User Service] getAllUserProfiles failed', err);
        throw err;
    }
};

/**
 * Updates the role for a specific user. (Admin only)
 */
export const updateUserProfileRole = async (userId: string, role: UserRole): Promise<UserProfile> => {
    const end = performanceMonitor.startMeasure('updateUserProfileRole', 'api');
    try {
        if (!userId) throw new Error('User ID is required');
        if (!role) throw new Error('Role is required');

        const { data, error } = await supabase
            .from('user_profiles')
            .update({ role })
            .eq('id', userId)
            .select('id, email, role')
            .single();
        
        if (error) {
            logger.error('[User Service] Error updating user role', error);
            end();
            throw new Error(error.message);
        }
        if (!data) throw new Error('No data returned from user role update');
        
        logger.info(`[User Service] User role updated: ${userId}`);
        end();
        return data as UserProfile;
    } catch (err: any) {
        end();
        logger.error('[User Service] updateUserProfileRole failed', err);
        throw err;
    }
};
