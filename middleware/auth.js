// Authentication middleware - checks if admin is logged in
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Please login.' });
}

// Page authentication middleware - redirects to login if not authenticated
function requirePageAuth(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  return res.redirect('/');
}

module.exports = { requireAuth, requirePageAuth };
