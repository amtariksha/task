# JSR Task Management - Deployment Guide

**Version:** 1.0  
**Last Updated:** 2026-09-17  
**Document Owner:** JSR Development Team

---

## Changelog
- **2026-09-17**: Added Push Notifications (Expo / FCM) section — optional `EXPO_ACCESS_TOKEN`, enhanced push security, FCM V1 service-account key
- **2025-11-12**: Initial Deployment Guide creation - Complete deployment instructions for web app, mobile app, database, S3, email, and monitoring

---

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Web App Deployment (Vercel)](#web-app-deployment-vercel)
4. [Mobile App Deployment (Android)](#mobile-app-deployment-android)
5. [Database Setup (Supabase)](#database-setup-supabase)
6. [File Storage (AWS S3)](#file-storage-aws-s3)
7. [Email Service (Gmail SMTP)](#email-service-gmail-smtp)
8. [Push Notifications (Expo / FCM)](#push-notifications-expo--fcm)
9. [Environment Variables](#environment-variables)
10. [CI/CD Pipeline](#cicd-pipeline)
11. [Monitoring and Logging](#monitoring-and-logging)
12. [Rollback Procedures](#rollback-procedures)
13. [Troubleshooting](#troubleshooting)

---

## Overview

**Last Updated:** 2025-11-12

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Production Environment                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────┐ │
│  │   Vercel     │      │   Supabase   │      │  AWS S3   │ │
│  │  (Web App)   │─────▶│ (PostgreSQL) │      │  (Files)  │ │
│  │              │      │              │      │           │ │
│  └──────────────┘      └──────────────┘      └───────────┘ │
│         │                                                    │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Gmail SMTP   │                                           │
│  │ (Email)      │                                           │
│  └──────────────┘                                           │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Mobile App (Android APK)                 │  │
│  │         Connects to Vercel GraphQL Endpoint          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Deployment Checklist

- [ ] Vercel account created
- [ ] Supabase project created
- [ ] AWS account with S3 bucket configured
- [ ] Gmail account with app password
- [ ] Domain configured (task.amtariksha.com)
- [ ] SSL certificates configured
- [ ] Environment variables set
- [ ] Database migrations run
- [ ] Initial data seeded
- [ ] Monitoring configured

---

## Prerequisites

**Last Updated:** 2025-11-12

### Required Accounts

1. **Vercel Account**
   - Sign up at https://vercel.com
   - Free tier available (sufficient for small teams)
   - Connect GitHub repository

2. **Supabase Account**
   - Sign up at https://supabase.com
   - Free tier: 500MB database, 1GB file storage
   - Paid tier: $25/month for production

3. **AWS Account**
   - Sign up at https://aws.amazon.com
   - S3 pricing: ~$0.023/GB/month
   - Free tier: 5GB for 12 months

4. **Gmail Account**
   - Existing Gmail account
   - Enable 2-factor authentication
   - Generate app password

### Required Tools

- **Node.js**: 18.x or later
- **npm**: 9.x or later
- **Git**: Latest version
- **Vercel CLI**: `npm install -g vercel`
- **Android Studio**: For mobile app builds (optional)

---

## Web App Deployment (Vercel)

**Last Updated:** 2025-11-12

### Step 1: Connect Repository to Vercel

1. **Login to Vercel**
   ```bash
   vercel login
   ```

2. **Import Project**
   - Go to https://vercel.com/dashboard
   - Click "Add New" → "Project"
   - Import from GitHub: `cpradeepk/task`
   - Select `apps/web` as root directory

3. **Configure Build Settings**
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
   - **Install Command**: `npm install`

### Step 2: Configure Environment Variables

In Vercel dashboard, go to **Settings** → **Environment Variables** and add:

```bash
# Database
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres

# JWT Secret
JWT_SECRET=your-secret-key-minimum-32-characters-long

# Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=amtariksha@gmail.com
SMTP_PASS=your-gmail-app-password

# AWS S3
AWS_ACCESS_KEY_ID=AKIA2JGJ2OTO4M3JH6MR
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=ap-south-1
AWS_S3_BUCKET=amtariksha

# Optional: Redis (for caching)
REDIS_URL=redis://default:[password]@[host]:6379

# Optional: Expo push access token (REQUIRED once enhanced push security is on)
EXPO_ACCESS_TOKEN=
```

**Important:**
- Set environment variables for **Production**, **Preview**, and **Development**
- Never commit `.env.local` to Git
- Use different values for production and development

### Step 3: Configure Domain

1. **Add Custom Domain**
   - Go to **Settings** → **Domains**
   - Add domain: `task.amtariksha.com`
   - Configure DNS records:
     ```
     Type: A
     Name: task
     Value: 76.76.21.21 (Vercel IP)
     
     Type: CNAME
     Name: task
     Value: cname.vercel-dns.com
     ```

2. **SSL Certificate**
   - Vercel automatically provisions SSL certificates
   - Wait for DNS propagation (up to 48 hours)
   - Verify HTTPS works: https://task.amtariksha.com

### Step 4: Deploy

1. **Automatic Deployment**
   ```bash
   # Push to main branch triggers automatic deployment
   git push origin main
   ```

2. **Manual Deployment**
   ```bash
   cd apps/web
   vercel --prod
   ```

3. **Monitor Deployment**
   - Go to Vercel dashboard
   - Check deployment logs
   - Verify build succeeds
   - Test deployed app

### Step 5: Verify Deployment

1. **Test GraphQL Endpoint**
   ```bash
   curl -X POST https://task.amtariksha.com/api/graphql \
     -H "Content-Type: application/json" \
     -d '{"query": "{ __typename }"}'
   ```

2. **Test Login**
   - Navigate to https://task.amtariksha.com
   - Login with test credentials
   - Verify dashboard loads

3. **Check Logs**
   - Vercel dashboard → Deployments → Logs
   - Look for errors or warnings

---

## Mobile App Deployment (Android)

**Last Updated:** 2025-11-12

### Step 1: Prepare for Build

1. **Update API Endpoint**

   Edit `apps/mobile/.env`:
   ```bash
   EXPO_PUBLIC_API_URL=https://task.amtariksha.com/api/graphql
   ```

2. **Update App Version**

   Edit `apps/mobile/app.json`:
   ```json
   {
     "expo": {
       "version": "1.0.0",
       "android": {
         "versionCode": 1,
         "package": "com.amtariksha.jsr"
       }
     }
   }
   ```

3. **Clean Build Cache**
   ```bash
   cd apps/mobile
   rm -rf android/app/build
   rm -rf android/app/src/main/assets/index.android.bundle
   ```

### Step 2: Build Debug APK (for testing)

```bash
cd apps/mobile/android
./gradlew assembleDebug --no-daemon
```

**Output:** `android/app/build/outputs/apk/debug/app-debug.apk`

### Step 3: Build Release APK (for production)

#### 3.1 Generate Keystore (one-time)

```bash
cd apps/mobile/android/app
keytool -genkeypair -v -storetype PKCS12 \
  -keystore jsr-release-key.keystore \
  -alias jsr-key-alias \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

**Prompts:**
- Enter keystore password: (choose strong password)
- Re-enter password
- Enter your name, organization, etc.

**Important:** Store keystore file and password securely!

#### 3.2 Configure Gradle Signing

Edit `apps/mobile/android/app/build.gradle`:

```gradle
android {
    ...
    signingConfigs {
        release {
            if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
                storeFile file(MYAPP_RELEASE_STORE_FILE)
                storePassword MYAPP_RELEASE_STORE_PASSWORD
                keyAlias MYAPP_RELEASE_KEY_ALIAS
                keyPassword MYAPP_RELEASE_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            ...
            signingConfig signingConfigs.release
        }
    }
}
```

Create `apps/mobile/android/gradle.properties`:

```properties
MYAPP_RELEASE_STORE_FILE=jsr-release-key.keystore
MYAPP_RELEASE_KEY_ALIAS=jsr-key-alias
MYAPP_RELEASE_STORE_PASSWORD=your-keystore-password
MYAPP_RELEASE_KEY_PASSWORD=your-key-password
```

**Important:** Add `gradle.properties` to `.gitignore`!

#### 3.3 Build Release APK

```bash
cd apps/mobile/android
./gradlew assembleRelease --no-daemon
```

**Output:** `android/app/build/outputs/apk/release/app-release.apk`

### Step 4: Test APK

1. **Install on Device**
   ```bash
   adb install -r app/build/outputs/apk/release/app-release.apk
   ```

2. **Test All Features**
   - Login with production credentials
   - Create/update tasks and bugs
   - Test file uploads (S3)
   - Test email notifications
   - Test timer functionality
   - Test feed features

3. **Check Logs**
   ```bash
   adb logcat | grep -E "ReactNativeJS|JSR"
   ```

### Step 5: Distribute APK

#### Option 1: Direct Distribution (Current)

1. **Upload to File Server**
   - Upload APK to secure file server
   - Share download link with users

2. **Installation Instructions**
   - Enable "Install from Unknown Sources" on Android
   - Download APK
   - Install APK
   - Open app and login

#### Option 2: Google Play Store (Future)

1. **Create Google Play Developer Account**
   - Cost: $25 one-time fee
   - Sign up at https://play.google.com/console

2. **Create App Listing**
   - App name: JSR Task Management
   - Category: Productivity
   - Content rating: Everyone
   - Privacy policy URL

3. **Upload APK**
   - Go to Release → Production
   - Upload signed APK
   - Fill in release notes
   - Submit for review

4. **Review Process**
   - Google reviews app (1-7 days)
   - Fix any issues
   - App goes live after approval

---

## Database Setup (Supabase)

**Last Updated:** 2025-11-12

### Step 1: Create Supabase Project

1. **Sign up/Login**
   - Go to https://supabase.com
   - Create account or login

2. **Create New Project**
   - Click "New Project"
   - Organization: Create or select
   - Project name: JSR Task Management
   - Database password: (strong password)
   - Region: **ap-south-1** (AWS Mumbai)
   - Pricing plan: Free or Pro ($25/month)

3. **Wait for Provisioning**
   - Takes 2-5 minutes
   - Note down project details:
     - Project ID: `rbckjkdohzbclomrufrx`
     - API URL: `https://rbckjkdohzbclomrufrx.supabase.co`
     - Database URL: `postgresql://postgres:[password]@[host]:5432/postgres`

### Step 2: Configure Database

1. **Get Connection String**
   - Go to Project Settings → Database
   - Copy connection string (URI format)
   - Replace `[YOUR-PASSWORD]` with your database password

2. **Test Connection**
   ```bash
   cd scripts
   node test-supabase-connection.js
   ```

### Step 3: Run Migrations

1. **Prepare Migration Scripts**

   All migration scripts are in `scripts/migrations/`:
   - `001_initial_schema.sql`
   - `002_add_indexes.sql`
   - `003_add_feed_system.sql`
   - ... (20+ migrations)

2. **Run Migrations**
   ```bash
   cd scripts
   node run-migrations.js
   ```

3. **Verify Tables**
   - Go to Supabase dashboard → Table Editor
   - Verify all tables exist:
     - users
     - tasks
     - bugs
     - projects
     - feed_posts
     - feed_topics
     - activity_log
     - ... (20+ tables)

### Step 4: Seed Initial Data

1. **Create Admin User**
   ```sql
   INSERT INTO users (
     employee_id, name, email, password, role, status, created_at
   ) VALUES (
     'AM-0001',
     'Admin User',
     'admin@amtariksha.com',
     '$2b$10$hashed_password_here',
     'admin',
     'active',
     NOW()
   );
   ```

2. **Create Default Settings**
   ```sql
   INSERT INTO settings (key, value, type, is_active) VALUES
   ('collapse_threshold_characters', '300', 'number', 1),
   ('collapse_threshold_lines', '5', 'number', 1),
   ('default_page_size', '20', 'number', 1);
   ```

3. **Create Default Projects**
   ```sql
   INSERT INTO projects (project_id, project_name, description, created_at) VALUES
   ('PROJ-001', 'General', 'General tasks and bugs', NOW());
   ```

### Step 5: Configure Connection Pool

1. **Increase Pool Size**
   - Go to Project Settings → Database → Connection Pooling
   - Pool Mode: Transaction
   - Pool Size: 50 (increased from default 20)

2. **Enable Connection Pooling**
   - Use pooled connection string in production
   - Format: `postgresql://postgres:[password]@[host]:6543/postgres`
   - Port 6543 for pooled connections (vs 5432 for direct)

### Step 6: Backup Configuration

1. **Enable Point-in-Time Recovery (PITR)**
   - Go to Database → Backups
   - Enable PITR (Pro plan only)
   - Retention: 7 days

2. **Manual Backups**
   ```bash
   # Export database
   pg_dump -h [host] -U postgres -d postgres > backup.sql

   # Restore database
   psql -h [host] -U postgres -d postgres < backup.sql
   ```

---

## File Storage (AWS S3)

**Last Updated:** 2025-11-12

### Step 1: Create S3 Bucket

1. **Login to AWS Console**
   - Go to https://console.aws.amazon.com
   - Navigate to S3 service

2. **Create Bucket**
   - Click "Create bucket"
   - Bucket name: `amtariksha`
   - Region: **ap-south-1** (Asia Pacific Mumbai)
   - Block all public access: **Uncheck** (we need public read)
   - Versioning: Disabled
   - Encryption: Disabled (optional)
   - Click "Create bucket"

### Step 2: Configure Bucket Policy

1. **Set Bucket Policy**

   Go to bucket → Permissions → Bucket Policy:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::amtariksha/*"
       }
     ]
   }
   ```

2. **Configure CORS**

   Go to bucket → Permissions → CORS:

   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
       "AllowedOrigins": [
         "https://task.amtariksha.com",
         "http://localhost:3000"
       ],
       "ExposeHeaders": ["ETag"]
     }
   ]
   ```

### Step 3: Create IAM User

1. **Create User**
   - Go to IAM → Users → Add User
   - User name: `jsr-s3-user`
   - Access type: Programmatic access
   - Click "Next"

2. **Attach Policy**
   - Attach existing policy: `AmazonS3FullAccess`
   - Or create custom policy with limited permissions:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:GetObject",
           "s3:DeleteObject"
         ],
         "Resource": "arn:aws:s3:::amtariksha/*"
       }
     ]
   }
   ```

3. **Save Credentials**
   - Access Key ID: `AKIA2JGJ2OTO4M3JH6MR`
   - Secret Access Key: (save securely!)
   - Add to environment variables

### Step 4: Test Upload

```bash
# Test S3 upload
node scripts/test-s3-upload.js
```

---

## Email Service (Gmail SMTP)

**Last Updated:** 2025-11-12

### Step 1: Enable 2-Factor Authentication

1. **Go to Google Account Settings**
   - https://myaccount.google.com/security
   - Enable 2-Step Verification

### Step 2: Generate App Password

1. **Create App Password**
   - Go to https://myaccount.google.com/apppasswords
   - Select app: Mail
   - Select device: Other (Custom name)
   - Name: JSR Task Management
   - Click "Generate"

2. **Save Password**
   - Copy 16-character password
   - Add to environment variables as `SMTP_PASS`

### Step 3: Configure SMTP Settings

Environment variables:
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=amtariksha@gmail.com
SMTP_PASS=your-16-char-app-password
```

### Step 4: Test Email

```bash
# Test email sending
node scripts/test-email.js
```

### Step 5: Email Templates

Email templates are in `apps/web/public/`:
- `task-assignment-email.html`
- `leave-approval-email.html`
- `bug-assignment-email.html`

**Customize templates** with your branding and styling.

---

## Push Notifications (Expo / FCM)

**Last Updated:** 2026-09-17

The web app sends pushes through the Expo Push API
(`https://exp.host/--/api/v2/push/send`, see `apps/web/src/lib/push-notification-service.ts`).
Expo forwards them to FCM (Android) and APNs (iOS). Device tokens are stored in
the `push_tokens` table. Server logs only show a masked prefix
(`ExponentPushToken[abcdef…]`), never the full token.

### Step 1: Expo access token (`EXPO_ACCESS_TOKEN`) — optional

- When `EXPO_ACCESS_TOKEN` is set, every push request sends
  `Authorization: Bearer <EXPO_ACCESS_TOKEN>`. When it is unset or blank, no
  header is sent, which was the behaviour before this setting existed.
- Create the token in the Expo account that owns the project (currently
  `whokevalshah`, see `owner` in `apps/mobile/app.json`): **expo.dev → Account
  settings → Access tokens**. A robot-user token is best, so the token does not
  depend on one person's login.
- Add it in Vercel (**Settings → Environment Variables**) for Production and
  Preview, then redeploy. `scripts/test-remote-push.js` reads the same variable
  from `apps/web/.env.local`.

> **Enhanced Security for Push Notifications.** The same Expo settings page can
> make the push API accept only requests that carry a valid access token. Once
> it is on, requests without the token fail with `UNAUTHORIZED`, so every push
> from the app stops until the token is set. Order of operations:
> 1. Set `EXPO_ACCESS_TOKEN` in Vercel.
> 2. Redeploy.
> 3. Send a test push and confirm it arrives.
> 4. Only then turn on enhanced security.
>
> Before you revoke or rotate the token, deploy the new value first.

### Step 2: Android credentials (FCM V1 service-account key)

Android delivery needs an FCM V1 service-account key uploaded to Expo for the
application identifier `com.karmayog`. It must come from the same Firebase
project as `apps/mobile/android/app/google-services.json` (`karmayog-task`,
project number `242622641703`). Without it, Expo returns credential errors such
as `Unable to retrieve the FCM server key for the recipient's app`.

1. Firebase console → project `karmayog-task` → **Project settings → Service
   accounts** → **Generate new private key**. Keep the JSON file out of git.
2. Upload it with **either** of these:
   - `cd apps/mobile && eas credentials` → Android → production →
     Google Service Account → *Manage your Google Service Account Key for Push
     Notifications (FCM V1)* → *Upload a new service account key*
   - expo.dev → project → **Credentials** → Android → `com.karmayog` →
     **Service Credentials → FCM V1 service account key** → upload
3. If you use an existing service account instead, give it the **Firebase Cloud
   Messaging API Admin** role in Google Cloud IAM.

See [docs/PUSH_NOTIFICATIONS_SETUP.md](docs/PUSH_NOTIFICATIONS_SETUP.md) for
the full checklist and the 2026-09-17 push test findings.

### Step 3: Expo push errors

The server reads the push tickets Expo returns with each send. It does not poll
push receipts, so errors that Expo reports only in receipts are not logged.

| `details.error` | Meaning | What the server does |
|---|---|---|
| `DeviceNotRegistered` | The device can no longer receive pushes (Expo documents this as permanent) | Marks the token inactive |
| `InvalidCredentials`, `MismatchSenderId` | FCM/APNs credentials problem in the Expo project | Logs the error. The token stays active and works again once the credentials are fixed |
| `MessageTooBig`, `MessageRateExceeded` | Payload too large, or too many pushes to one device | Logs the error only |

---

## Environment Variables

**Last Updated:** 2025-11-12

### Production Environment Variables

```bash
# Database
DATABASE_URL=postgresql://postgres:[password]@db.rbckjkdohzbclomrufrx.supabase.co:5432/postgres

# JWT Secret (minimum 32 characters)
JWT_SECRET=your-production-secret-key-minimum-32-characters-long

# Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=amtariksha@gmail.com
SMTP_PASS=your-gmail-app-password-16-chars

# AWS S3
AWS_ACCESS_KEY_ID=AKIA2JGJ2OTO4M3JH6MR
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=ap-south-1
AWS_S3_BUCKET=amtariksha

# Optional: Redis (for caching)
REDIS_URL=redis://default:[password]@redis-12345.c1.ap-south-1-1.ec2.cloud.redislabs.com:6379

# Optional: Expo push access token (REQUIRED once enhanced push security is on)
EXPO_ACCESS_TOKEN=
```

### Development Environment Variables

```bash
# Database (use local or dev Supabase)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jsr_dev

# JWT Secret (different from production)
JWT_SECRET=dev-secret-key-for-local-development-only

# Email (use Mailtrap or similar for testing)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your-mailtrap-user
SMTP_PASS=your-mailtrap-pass

# AWS S3 (use same bucket or separate dev bucket)
AWS_ACCESS_KEY_ID=AKIA2JGJ2OTO4M3JH6MR
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=ap-south-1
AWS_S3_BUCKET=amtariksha-dev

# Optional: Expo push access token (also read by scripts/test-remote-push.js)
EXPO_ACCESS_TOKEN=
```

### Security Best Practices

1. **Never Commit Secrets**
   - Add `.env.local` to `.gitignore`
   - Use environment variables in CI/CD

2. **Rotate Secrets Regularly**
   - Change JWT secret every 6 months
   - Rotate AWS keys annually
   - Update database passwords periodically

3. **Use Different Values per Environment**
   - Production, staging, development should have different secrets
   - Never use production credentials in development

---

## CI/CD Pipeline

**Last Updated:** 2025-11-12

### Current Setup: Vercel Auto-Deploy

**Automatic Deployment** is configured via Vercel GitHub integration:

1. **Push to Main Branch**
   ```bash
   git push origin main
   ```

2. **Vercel Automatically:**
   - Detects push
   - Runs build
   - Deploys to production
   - Updates https://task.amtariksha.com

3. **Preview Deployments**
   - Every pull request gets a preview URL
   - Test changes before merging
   - Preview URL: `https://task-pr-123.vercel.app`

### GitHub Actions (Optional Enhancement)

Create `.github/workflows/ci.yml`:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run tests
        run: npm test

      - name: Run linter
        run: npm run lint

  build-mobile:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd apps/mobile
          npm install

      - name: Build Android APK
        run: |
          cd apps/mobile/android
          ./gradlew assembleRelease --no-daemon

      - name: Upload APK
        uses: actions/upload-artifact@v3
        with:
          name: app-release
          path: apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

### Deployment Workflow

```
┌─────────────────────────────────────────────────────────┐
│                   Development Workflow                   │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  1. Developer commits code                               │
│     ↓                                                     │
│  2. Push to feature branch                               │
│     ↓                                                     │
│  3. Create pull request                                  │
│     ↓                                                     │
│  4. Vercel creates preview deployment                    │
│     ↓                                                     │
│  5. Review code + test preview                           │
│     ↓                                                     │
│  6. Merge to main branch                                 │
│     ↓                                                     │
│  7. Vercel auto-deploys to production                    │
│     ↓                                                     │
│  8. Verify production deployment                         │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## Monitoring and Logging

**Last Updated:** 2025-11-12

### Vercel Monitoring

1. **Real-time Logs**
   - Go to Vercel dashboard → Deployments
   - Click on deployment → Logs
   - View real-time logs during deployment

2. **Runtime Logs**
   - Go to Vercel dashboard → Logs
   - Filter by:
     - Time range
     - Log level (info, warn, error)
     - Search text

3. **Analytics**
   - Go to Vercel dashboard → Analytics
   - View:
     - Page views
     - Unique visitors
     - Top pages
     - Performance metrics

### Supabase Monitoring

1. **Database Metrics**
   - Go to Supabase dashboard → Database
   - View:
     - Connection count
     - Database size
     - Query performance
     - Slow queries

2. **API Logs**
   - Go to Supabase dashboard → Logs
   - View API requests and responses

### Application Logging

**GraphQL Resolver Logging** (already implemented):

```typescript
// apps/web/src/lib/graphql-logger.ts
export function logResolverStart(resolverName: string, args: any) {
  console.log(`[GraphQL] ${resolverName} started`, args);
}

export function logResolverSuccess(resolverName: string, result: any) {
  console.log(`[GraphQL] ${resolverName} succeeded`);
}

export function logResolverError(resolverName: string, error: any) {
  console.error(`[GraphQL] ${resolverName} failed`, error);
}
```

### Error Tracking (Future Enhancement)

**Recommended Tools:**

1. **Sentry**
   - Error tracking and monitoring
   - Free tier: 5,000 events/month
   - Setup:
     ```bash
     npm install @sentry/nextjs
     npx @sentry/wizard -i nextjs
     ```

2. **LogRocket**
   - Session replay and error tracking
   - Free tier: 1,000 sessions/month

3. **Datadog**
   - Full-stack monitoring
   - Paid service

### Health Checks

Create health check endpoint:

```typescript
// apps/web/src/app/api/health/route.ts
export async function GET() {
  try {
    // Check database connection
    await db.query('SELECT 1');

    return Response.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'up',
        api: 'up'
      }
    });
  } catch (error) {
    return Response.json({
      status: 'unhealthy',
      error: error.message
    }, { status: 500 });
  }
}
```

**Monitor health endpoint:**
```bash
curl https://task.amtariksha.com/api/health
```

---

## Rollback Procedures

**Last Updated:** 2025-11-12

### Web App Rollback (Vercel)

#### Option 1: Instant Rollback (Recommended)

1. **Go to Vercel Dashboard**
   - Navigate to Deployments
   - Find previous working deployment
   - Click "..." menu → "Promote to Production"
   - Confirm rollback

**Time to rollback:** < 1 minute

#### Option 2: Git Revert

1. **Revert Commit**
   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Vercel Auto-Deploys**
   - Vercel detects push
   - Deploys reverted code
   - Production updated

**Time to rollback:** 2-5 minutes

### Database Rollback

#### Option 1: Point-in-Time Recovery (PITR)

**Requirements:** Supabase Pro plan with PITR enabled

1. **Go to Supabase Dashboard**
   - Navigate to Database → Backups
   - Select point in time to restore
   - Click "Restore"

2. **Wait for Restore**
   - Takes 5-15 minutes
   - Database restored to selected time

#### Option 2: Manual Backup Restore

1. **Restore from Backup**
   ```bash
   psql -h [host] -U postgres -d postgres < backup-2025-11-12.sql
   ```

2. **Verify Data**
   - Check critical tables
   - Verify data integrity

### Mobile App Rollback

1. **Distribute Previous APK**
   - Find previous working APK
   - Upload to distribution server
   - Notify users to download and install

2. **Google Play Store** (if using)
   - Go to Play Console → Release Management
   - Select previous release
   - Promote to production

---

## Troubleshooting

**Last Updated:** 2025-11-12

### Web App Issues

#### Issue: Build Fails on Vercel

**Symptoms:**
- Deployment fails with build error
- Error in Vercel logs

**Solutions:**

1. **Check Build Logs**
   ```
   Vercel dashboard → Deployments → Failed deployment → Logs
   ```

2. **Common Causes:**
   - Missing environment variables
   - TypeScript errors
   - Dependency issues
   - Out of memory

3. **Fix Steps:**
   ```bash
   # Test build locally
   cd apps/web
   npm run build

   # Fix errors
   # Push fix
   git push origin main
   ```

#### Issue: Database Connection Fails

**Symptoms:**
- GraphQL queries fail
- Error: "Connection refused" or "Too many connections"

**Solutions:**

1. **Check Connection String**
   - Verify DATABASE_URL in Vercel environment variables
   - Ensure password is correct
   - Use pooled connection (port 6543)

2. **Increase Connection Pool**
   - Supabase dashboard → Database → Connection Pooling
   - Increase pool size to 50

3. **Check Supabase Status**
   - https://status.supabase.com
   - Verify no outages

#### Issue: Email Not Sending

**Symptoms:**
- Email notifications not received
- Error in logs: "SMTP connection failed"

**Solutions:**

1. **Verify SMTP Credentials**
   - Check SMTP_USER and SMTP_PASS in environment variables
   - Regenerate Gmail app password if needed

2. **Check Gmail Settings**
   - Ensure 2FA is enabled
   - Verify app password is correct

3. **Test Email**
   ```bash
   node scripts/test-email.js
   ```

### Mobile App Issues

#### Issue: APK Build Fails

**Symptoms:**
- Gradle build fails
- Error during `./gradlew assembleDebug`

**Solutions:**

1. **Clean Build**
   ```bash
   cd apps/mobile/android
   ./gradlew clean
   ./gradlew assembleDebug --no-daemon
   ```

2. **Check Java Version**
   ```bash
   java -version
   # Should be Java 11 or 17
   ```

3. **Clear Gradle Cache**
   ```bash
   rm -rf ~/.gradle/caches
   ```

#### Issue: App Crashes on Launch

**Symptoms:**
- App opens then immediately closes
- Error in logcat

**Solutions:**

1. **Check Logs**
   ```bash
   adb logcat | grep -E "ReactNativeJS|AndroidRuntime"
   ```

2. **Common Causes:**
   - Missing API endpoint configuration
   - Network permission not granted
   - Incompatible Android version

3. **Fix Steps:**
   - Verify EXPO_PUBLIC_API_URL in .env
   - Check AndroidManifest.xml permissions
   - Test on different Android version

#### Issue: GraphQL Queries Fail

**Symptoms:**
- "Network request failed" error
- "useQuery is not a function" error

**Solutions:**

1. **Verify API Endpoint**
   ```typescript
   // apps/mobile/.env
   EXPO_PUBLIC_API_URL=https://task.amtariksha.com/api/graphql
   ```

2. **Check Apollo Client Imports**
   ```typescript
   // ✅ CORRECT
   import { useQuery, useMutation } from '@apollo/client/react';

   // ❌ WRONG
   import { useQuery, useMutation } from '@apollo/client';
   ```

3. **Test API Endpoint**
   ```bash
   curl -X POST https://task.amtariksha.com/api/graphql \
     -H "Content-Type: application/json" \
     -d '{"query": "{ __typename }"}'
   ```

### Database Issues

#### Issue: Slow Queries

**Symptoms:**
- GraphQL queries take > 1 second
- Database CPU usage high

**Solutions:**

1. **Check Slow Queries**
   - Supabase dashboard → Database → Query Performance
   - Identify slow queries

2. **Add Indexes**
   ```sql
   CREATE INDEX idx_tasks_assigned_to_gin ON tasks USING GIN (assigned_to);
   CREATE INDEX idx_tasks_status ON tasks(status);
   ```

3. **Optimize Queries**
   - Use DataLoader for batching
   - Add pagination (limit/offset)
   - Avoid N+1 queries

#### Issue: Database Full

**Symptoms:**
- Error: "Disk quota exceeded"
- Cannot insert new records

**Solutions:**

1. **Check Database Size**
   - Supabase dashboard → Database → Database Size

2. **Clean Up Data**
   ```sql
   -- Delete old soft-deleted records
   DELETE FROM tasks WHERE deleted_at < NOW() - INTERVAL '90 days';
   DELETE FROM bugs WHERE deleted_at < NOW() - INTERVAL '90 days';
   ```

3. **Upgrade Plan**
   - Free tier: 500MB
   - Pro tier: 8GB
   - Upgrade if needed

---

**For system requirements, see SRS.md**
**For architecture details, see ARCHITECTURE.md**
**For API reference, see API_REFERENCE.md**
**For development guide, see DEVELOPER_GUIDE.md**
**For quick reference, see QUICK_REFERENCE.md**


