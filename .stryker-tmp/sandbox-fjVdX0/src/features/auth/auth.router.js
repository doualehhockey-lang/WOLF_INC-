// @ts-nocheck
// src/features/auth/auth.router.js — Express router for auth endpoints.
// Mounts at /auth in src/api/router.js.
// No global middleware — each handler validates its own input.

import { Router }        from 'express';
import { handleIssue, handleRefresh, handleLogout } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/token',   handleIssue);
authRouter.post('/refresh', handleRefresh);
authRouter.post('/logout',  handleLogout);
