import { useAuthStore } from '../stores/authStore';

const BASE_URL = '/api';

class ApiClient {
    async request(method, path, body = null) {
        const token = useAuthStore.getState().token;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const opts = { method, headers };
        if (body && method !== 'GET') {
            opts.body = JSON.stringify(body);
        }

        const res = await fetch(`${BASE_URL}${path}`, opts);
        const data = await res.json();

        if (!res.ok) {
            if (res.status === 401) {
                useAuthStore.getState().logout();
            }
            throw new Error(data.error || 'Request failed');
        }

        return data;
    }

    get(path) { return this.request('GET', path); }
    post(path, body) { return this.request('POST', path, body); }
    put(path, body) { return this.request('PUT', path, body); }
    delete(path) { return this.request('DELETE', path); }

    async upload(path, formData) {
        const token = useAuthStore.getState().token;
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${BASE_URL}${path}`, {
            method: 'POST',
            headers,
            body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        return data;
    }
}

export const api = new ApiClient();
