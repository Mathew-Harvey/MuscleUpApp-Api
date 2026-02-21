/**
 * MuscleUp API Integration Tests
 * 
 * Tests key functionality:
 * - User registration and authentication
 * - Password management
 * - Progress logging
 * - Level management
 * - Settings (theme, reset progress, unlock levels)
 */

const request = require('supertest');
const { Pool } = require('pg');

// Use the actual database
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://handstand_218u_user:l9EF2XWRhCee94TJsPL96y0qhL3c2VBJ@dpg-d6clrglm5p6s73es47a0-a/handstand_218u',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const API_URL = process.env.API_URL || 'http://localhost:4000';

// Generate unique test email for MuscleUp
const generateTestEmail = () => `muscleup_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}@example.com`;

// Helper to get auth cookie from response
const getAuthCookie = (res) => {
  const cookies = res.headers['set-cookie'];
  return cookies?.find(c => c.startsWith('connect.sid'));
};

describe('MuscleUp API Integration Tests', () => {
  let testEmail;
  let testPassword = 'musclepass123';
  let testDisplayName = 'MuscleUp Test User';

  beforeAll(async () => {
    testEmail = generateTestEmail();
  });

  afterAll(async () => {
    if (testEmail) {
      try {
        // Clean up from muscleup_users table
        await pool.query('DELETE FROM muscleup_users WHERE email = $1', [testEmail]);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    await pool.end();
  });

  describe('Health Check', () => {
    it('should return OK status', async () => {
      const res = await request(API_URL).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('User Registration', () => {
    it('should register a new user successfully', async () => {
      const res = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          confirm_password: testPassword,
          display_name: testDisplayName
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.display_name).toBe(testDisplayName);
      expect(res.body.user.current_level).toBe(1);
    });

    it('should reject registration with missing fields', async () => {
      const res = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('should reject registration with mismatched passwords', async () => {
      const res = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: generateTestEmail(),
          password: testPassword,
          confirm_password: 'differentpassword',
          display_name: 'Test'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('match');
    });

    it('should reject duplicate email registration', async () => {
      const res = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          confirm_password: testPassword,
          display_name: 'Duplicate'
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already registered');
    });

    it('should reject short password', async () => {
      const res = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: generateTestEmail(),
          password: '123',
          confirm_password: '123',
          display_name: 'Test'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('6 characters');
    });
  });

  describe('User Login', () => {
    it('should login successfully with correct credentials', async () => {
      const res = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
    });

    it('should reject login with wrong password', async () => {
      const res = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'wrongpassword'
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid');
    });

    it('should reject login with non-existent email', async () => {
      const res = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'somepassword'
        });

      expect(res.status).toBe(401);
    });
  });

  describe('Get Current User (/auth/me)', () => {
    it('should return authenticated user when logged in', async () => {
      const loginRes = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      const authCookie = getAuthCookie(loginRes);

      const res = await request(API_URL)
        .get('/api/auth/me')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.user.email).toBe(testEmail);
    });

    it('should return not authenticated when not logged in', async () => {
      const res = await request(API_URL)
        .get('/api/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(false);
    });
  });

  describe('Dashboard', () => {
    it('should get dashboard data for authenticated user', async () => {
      const loginRes = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      const authCookie = getAuthCookie(loginRes);

      const res = await request(API_URL)
        .get('/api/dashboard')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.totalSessions).toBeDefined();
      expect(res.body.streak).toBeDefined();
    });

    it('should require authentication for dashboard', async () => {
      const res = await request(API_URL)
        .get('/api/dashboard');

      expect(res.status).toBe(401);
    });
  });

  describe('Progress Logging', () => {
    it('should log progress for an exercise', async () => {
      const loginRes = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      const authCookie = getAuthCookie(loginRes);

      const res = await request(API_URL)
        .post('/api/log')
        .set('Cookie', authCookie)
        .send({
          level: 1,
          exercise_key: 'pull-ups',
          sets_completed: 3,
          reps_or_duration: '10 reps',
          hold_time_seconds: 0,
          notes: 'Good workout'
        });

      expect(res.status).toBe(201);
      expect(res.body.log).toBeDefined();
      expect(res.body.log.level).toBe(1);
      expect(res.body.log.exercise_key).toBe('pull-ups');
    });

    it('should require level and exercise_key', async () => {
      const loginRes = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      const authCookie = getAuthCookie(loginRes);

      const res = await request(API_URL)
        .post('/api/log')
        .set('Cookie', authCookie)
        .send({
          sets_completed: 3
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('should reject invalid level', async () => {
      const loginRes = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      const authCookie = getAuthCookie(loginRes);

      const res = await request(API_URL)
        .post('/api/log')
        .set('Cookie', authCookie)
        .send({
          level: 99,
          exercise_key: 'test'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('level');
    });
  });

  describe('Level Graduation', () => {
    it('should graduate to next level', async () => {
      const loginRes = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      const authCookie = getAuthCookie(loginRes);

      const res = await request(API_URL)
        .post('/api/graduate')
        .set('Cookie', authCookie)
        .send({ level: 1 });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('Change Password', () => {
    const newPassword = 'newmusclepass456';

    it('should change password with correct current password', async () => {
      const loginRes = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      const authCookie = getAuthCookie(loginRes);

      const res = await request(API_URL)
        .post('/api/auth/change-password')
        .set('Cookie', authCookie)
        .send({
          current_password: testPassword,
          new_password: newPassword,
          confirm_password: newPassword
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Verify new password works
      const loginRes2 = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: newPassword
        });
      expect(loginRes2.status).toBe(200);
      
      // Update test password for subsequent tests
      testPassword = newPassword;
    });

    it('should reject change password with wrong current password', async () => {
      const loginRes = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      const authCookie = getAuthCookie(loginRes);

      const res = await request(API_URL)
        .post('/api/auth/change-password')
        .set('Cookie', authCookie)
        .send({
          current_password: 'wrongpassword',
          new_password: 'anotherpassword',
          confirm_password: 'anotherpassword'
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('incorrect');
    });
  });

  describe('Settings', () => {
    it('should update theme setting', async () => {
      const loginRes = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      const authCookie = getAuthCookie(loginRes);

      const res = await request(API_URL)
        .put('/api/auth/settings')
        .set('Cookie', authCookie)
        .send({ theme: 'light' });

      expect(res.status).toBe(200);
      expect(res.body.user.theme).toBe('light');
    });

    it('should update display name', async () => {
      const loginRes = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      const authCookie = getAuthCookie(loginRes);

      const res = await request(API_URL)
        .put('/api/auth/settings')
        .set('Cookie', authCookie)
        .send({ display_name: 'MuscleUp Athlete' });

      expect(res.status).toBe(200);
      expect(res.body.user.display_name).toBe('MuscleUp Athlete');
    });

    it('should reset progress', async () => {
      const loginRes = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      const authCookie = getAuthCookie(loginRes);

      const res = await request(API_URL)
        .post('/api/auth/reset-progress')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should unlock all levels', async () => {
      const loginRes = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      const authCookie = getAuthCookie(loginRes);

      const res = await request(API_URL)
        .post('/api/auth/unlock-all')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('Logout', () => {
    it('should logout successfully', async () => {
      const loginRes = await request(API_URL)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      const authCookie = getAuthCookie(loginRes);

      const res = await request(API_URL)
        .post('/api/auth/logout')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      
      // Verify user is logged out
      const meRes = await request(API_URL)
        .get('/api/auth/me')
        .set('Cookie', authCookie);
      expect(meRes.body.authenticated).toBe(false);
    });
  });
});
