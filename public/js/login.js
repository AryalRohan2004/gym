
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const errDiv = document.getElementById('loginError');
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  btn.disabled = true;
  document.getElementById('loginText').textContent = 'Signing in...';
  errDiv.style.display = 'none';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok) {
      window.location.href = '/dashboard';
    } else {
      errDiv.textContent = data.error || 'Login failed.';
      errDiv.style.display = 'block';
    }
  } catch (err) {
    errDiv.textContent = 'Connection error. Please try again.';
    errDiv.style.display = 'block';
  } finally {
    btn.disabled = false;
    document.getElementById('loginText').textContent = 'Sign In';
  }
});
