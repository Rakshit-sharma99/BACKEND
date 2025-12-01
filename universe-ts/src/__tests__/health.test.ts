import request from 'supertest';
import app from '../app'; // ✅ Import your Express app
import { describe, it, expect } from '@jest/globals';

describe('API Tests', () => {
  // ✅ Health Check
  it('should return API health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  // ✅ Test Invalid Route
  it('should return 404 for an unknown route', async () => {
    const res = await request(app).get('/unknown');
    expect(res.status).toBe(404);
  });
});
