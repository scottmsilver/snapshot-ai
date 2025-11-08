# Debugging Authentication Issues

## Test Steps

1. **Open Browser Developer Console** (F12 or Cmd+Opt+I)

2. **Clear Storage** (to start fresh):
   - In DevTools, go to Application tab
   - Click "Clear storage" or manually clear:
     - Local Storage
     - Session Storage
     - Cookies

3. **Refresh the page** and watch the console logs

## Expected Log Sequence

### 1. Initial Page Load
```
🔍 Checking for existing session...
📦 Stored session found: No
❌ No valid session found
🏁 Setting isLoading to false
🔍 Auth State Changed: { user: null, isAuthenticated: false, isLoading: false }
🎯 App: Auth context retrieved: { isAuthenticated: false, isLoading: false, user: null }
🎨 App render check: { hasAuthContext: true, isLoading: false, isAuthenticated: false }
🔓 App: Showing login screen
👤 UserMenu: Auth context: { isAuthenticated: false, user: null }
👤 UserMenu render: { isAuthenticated: false, hasUser: false }
```

### 2. Click Login Button
```
🔘 Login button clicked
🚀 Login initiated
[OAuth popup opens]
```

### 3. After OAuth Success
```
🔐 OAuth Success Response: { access_token: "...", token_type: "Bearer", expires_in: 3599 }
✅ Got access token: ya29.a0AeDClZD8Fd4z...
⏰ Token expires in: 3599 seconds
📡 Fetching user info...
👤 User info received: { id: "...", email: "...", name: "...", picture: "..." }
💾 Storing session...
🔄 Setting user state...
✅ User state updated, isAuthenticated should be true now
🔍 Auth State Changed: { user: {...}, isAuthenticated: true, isLoading: false, hasAccessToken: true }
```

### 4. App Should Re-render
```
🎯 App: Auth context retrieved: { isAuthenticated: true, isLoading: false, user: {...} }
🎨 App render check: { hasAuthContext: true, isLoading: false, isAuthenticated: true }
[Main app interface should show]
```

## What to Look For

1. **Is the OAuth popup opening?**
   - If not, check popup blockers

2. **Are you seeing the OAuth Success Response?**
   - If not, the OAuth flow isn't completing

3. **Is the user info being fetched?**
   - Check for CORS errors
   - Check Network tab for failed requests

4. **Is the Auth State Changed log showing isAuthenticated: true?**
   - If not, state update is failing

5. **Is the App re-rendering after auth state changes?**
   - If not, React isn't detecting the state change

## Common Issues

1. **Stuck on loading screen**
   - isLoading is not being set to false
   - Check the checkSession logs

2. **Stuck on login screen after OAuth**
   - User state is not being set
   - App is not re-rendering

3. **CORS errors**
   - Check that your domain is in the OAuth authorized origins

4. **Token validation failing**
   - Token might be expired or invalid
   - Check Network tab for 401 errors

## Share Your Logs
Copy the console output and share it to help diagnose the issue.