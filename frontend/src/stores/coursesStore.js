import { create } from 'zustand';
import { api } from '../lib/api';

export const useCoursesStore = create((set, get) => ({
    courses: [],
    loading: false,
    roomStatuses: {},

    fetchCourses: async () => {
        set({ loading: true });
        try {
            const data = await api.get('/courses');
            set({ courses: data.courses, loading: false });
        } catch (err) {
            set({ loading: false });
            console.error('Failed to fetch courses:', err);
        }
    },

    createCourse: async (courseData) => {
        const data = await api.post('/courses', courseData);
        set((s) => ({ courses: [data.course, ...s.courses] }));
        return data;
    },

    joinCourse: async (code) => {
        const data = await api.post('/courses/join', { code });
        set((s) => ({ courses: [data.course, ...s.courses] }));
        return data;
    },

    deleteCourse: async (id) => {
        await api.delete(`/courses/${id}`);
        set((s) => ({ courses: s.courses.filter((c) => c.id !== id) }));
    },

    fetchRoomStatuses: async () => {
        try {
            const data = await api.get('/room/status');
            const statuses = {};
            data.rooms.forEach((r) => {
                statuses[r.courseId] = r;
            });
            set({ roomStatuses: statuses });
        } catch (err) {
            console.error('Failed to fetch room statuses:', err);
        }
    },

    updateRoomStatus: (courseId, status) => {
        set((s) => ({
            roomStatuses: {
                ...s.roomStatuses,
                [courseId]: { ...s.roomStatuses[courseId], status },
            },
        }));
    },
}));
