// ─────────────────────────────────────────────────────────────────────────────
//  AUTH MIDDLEWARE
//  This is the same middleware used across the whole team project.
//  It reads the JWT token from the Authorization header and attaches
//  the logged-in user to req.user
//
//  Usage:  router.get('/some-route', protect, yourController)
// ─────────────────────────────────────────────────────────────────────────────

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Lazy-load User model so it works even if this file is imported before DB connects
const getUser = () => mongoose.model('User');

const protect = async (req, res, next) => {
  let token;

  // Token must be sent as:  Authorization: Bearer <token>
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Please log in first.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to request — available as req.user in controllers
    req.user = await getUser().findById(decoded.id);

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists.',
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token. Please log in again.',
    });
  }
};

// Optional middleware — does NOT block if no token, just attaches user if present
// Useful for public routes that show extra info when logged in
const optionalAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await getUser().findById(decoded.id);
    } catch {
      req.user = null; // invalid token is fine for optional auth
    }
  }

  next();
};

module.exports = { protect, optionalAuth };
