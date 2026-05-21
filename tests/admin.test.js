import request from 'supertest';
import { createApp } from '../src/api/server.js';

describe('Admin routes security', () => {
  it('GET /admin/users returns 401 when not authenticated', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/users');
    expect(res.status).toBe(401);
  });
});
