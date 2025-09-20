# Google OAuth Setup Guide

This guide will walk you through setting up Google OAuth for the OpenChat application.

## Prerequisites

- A Google account
- Access to Google Cloud Console
- OpenChat project running locally

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API (Legacy) or Google Identity API

## Step 2: Create OAuth 2.0 Credentials

1. Navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Configure the OAuth consent screen if prompted
4. Choose "Web application" as the application type
5. Add authorized redirect URIs:
   - `http://localhost:5174/auth/callback` (for development)
   - Your production callback URL (for production)

## Step 3: Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Update `.env.local` with your Google OAuth credentials:
   ```env
   VITE_GOOGLE_CLIENT_ID=your_actual_client_id_here
   VITE_GOOGLE_CLIENT_SECRET=your_actual_client_secret_here
   ```

## Step 4: Update Supabase Configuration

If using Supabase for authentication:

1. Go to your Supabase project dashboard
2. Navigate to Authentication > Settings
3. Add Google as an OAuth provider
4. Enter your Google Client ID and Secret
5. Add the callback URL: `https://your-supabase-project.supabase.co/auth/v1/callback`

## Step 5: Test the Setup

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to the login page
3. Click "Sign in with Google"
4. Verify the OAuth flow works correctly

## Security Notes

- **Never commit `.env.local` to version control**
- Keep your Client Secret secure and rotate it regularly
- Use different credentials for development and production
- Regularly review your OAuth consent screen and permissions

## Troubleshooting

### Common Issues:

1. **Redirect URI mismatch**: Ensure the callback URL in Google Cloud Console matches your app
2. **Invalid client**: Double-check your Client ID and Secret
3. **OAuth consent screen**: Make sure it's properly configured for your app

### Error Messages:

- `redirect_uri_mismatch`: Add the correct callback URL to your Google OAuth settings
- `invalid_client`: Verify your credentials are correct and the project is active

## Production Deployment

For production:

1. Create separate OAuth credentials for your production domain
2. Update redirect URIs to match your production URL
3. Set environment variables in your hosting platform
4. Test thoroughly before going live

## Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [OpenChat Project Documentation](./README.md)