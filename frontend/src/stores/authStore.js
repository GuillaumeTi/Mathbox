import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../lib/api';

export const useAuthStore = create(
    persist(
        (set, get) => ({
            user: null,
            token: null,
            loading: false,
            error: null,

            login: async (credentials) => {
                set({ loading: true, error: null });
                try {
                    const data = await api.post('/auth/login', credentials);
                    set({ user: data.user, token: data.token, loading: false });
                    return data;
                } catch (err) {
                    set({ loading: false, error: err.message });
                    throw err;
                }
            },

            register: async (userData) => {
                set({ loading: true, error: null });
                try {
                    const data = await api.post('/auth/register', userData);
                    set({ user: data.user, token: data.token, loading: false });
                    return data;
                } catch (err) {
                    set({ loading: false, error: err.message });
                    throw err;
                }
            },

            loginWithMagicLink: async (token) => {
                set({ loading: true, error: null });
                try {
                    const data = await api.post('/auth/magic-login', { token });
                    set({ user: data.user, token: data.token, loading: false });
                    return data;
                } catch (err) {
                    set({ loading: false, error: err.message });
                    throw err;
                }
            },

            setPassword: async (password) => {
                const data = await api.post('/auth/set-password', { password });
                set({ user: { ...get().user, needsPasswordSetup: false } });
                return data;
            },

            addChild: async (childName) => {
                const data = await api.post('/auth/add-child', { childName });
                return data;
            },

            fetchMe: async () => {
                try {
                    const data = await api.get('/auth/me');
                    set({ user: data.user });
                } catch (err) {
                    set({ user: null, token: null });
                }
            },

            updateProfile: async (profileData) => {
                const data = await api.put('/auth/profile', profileData);
                set({ user: data.user });
                return data;
            },

            logout: () => {
                set({ user: null, token: null, error: null });
            },

            clearError: () => set({ error: null }),
        }),
        {
            name: 'mathbox-auth',
            partialize: (state) => ({ user: state.user, token: state.token }),
        }
    )
);
