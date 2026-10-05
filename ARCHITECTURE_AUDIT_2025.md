# 🏗️ JSR Task Management - Architecture Audit 2025

**Date**: November 11, 2025  
**Purpose**: Comprehensive comparison of Web App vs Mobile App architecture  
**Status**: ✅ **ALIGNED** - Both apps use same backend

---

## 📊 Current Architecture Overview

### **Backend Infrastructure**

| Component | Technology | Details |
|-----------|-----------|---------|
| **Database** | PostgreSQL (Supabase) | IPv4-compatible pooler for Vercel |
| **API** | GraphQL (Apollo Server) | Single endpoint for all operations |
| **Authentication** | JWT (7-day expiration) | HTTP-only cookies (web) + Bearer tokens (mobile) |
| **File Storage** | AWS S3 | Bucket: amtariksha, Region: ap-south-1 |
| **Email** | Gmail SMTP | amtariksha@gmail.com |
| **Caching** | Redis Cloud | ap-south-1 region (AWS Mumbai) |

---

## 🌐 Web App Architecture

### **Technology Stack**
- **Framework**: Next.js 16 (App Router)
- **Database**: Supabase PostgreSQL
- **ORM**: Direct SQL with `pg` (node-postgres)
- **GraphQL**: Apollo Server 4.x
- **Authentication**: JWT + HTTP-only cookies
- **Deployment**: Vercel (serverless)

### **Database Connection**
```typescript
// apps/web/src/lib/db/config.ts
// Real value: apps/web/.env.local (local) or the Vercel project's environment variables. Never commit it.
DATABASE_URL=postgresql://USER:PASSWORD@HOST:6543/postgres

Pool Config:
- max: 10 connections per serverless instance
- idleTimeoutMillis: 30000 (30 seconds)
- connectionTimeoutMillis: 15000 (15 seconds)
```

### **GraphQL Endpoint**
```
Production: https://task.amtariksha.com/api/graphql
Local Dev: http://localhost:3000/api/graphql
```

### **Authentication Flow**
1. User submits credentials to `/api/auth/login`
2. Server validates against PostgreSQL `users` table
3. JWT token generated and set as HTTP-only cookie
4. User data stored in localStorage for client-side access
5. All API requests include cookie automatically

---

## 📱 Mobile App Architecture

### **Technology Stack**
- **Framework**: React Native 0.81.5 + Expo SDK 54
- **React Version**: 19.1.0 (upgraded from 18.3.1)
- **GraphQL**: Apollo Client 4.0.9
- **Authentication**: JWT + SecureStore
- **Platform**: Android (APK builds)

### **API Configuration**
```typescript
// apps/mobile/src/config/apollo.ts
const API_URL = 'https://task.amtariksha.com/api/graphql'

// Same endpoint as web app ✅
```

### **Authentication Flow**
1. User submits credentials via `LOGIN_MUTATION`
2. Server validates against same PostgreSQL database
3. JWT token returned in response
4. Token stored in Expo SecureStore (encrypted)
5. Token sent as `Authorization: Bearer <token>` header

### **Cache Persistence**
- Uses `apollo3-cache-persist` for offline support
- Stores cache in AsyncStorage (max 10 MB)
- Restores cache on app launch

---

## ✅ Alignment Status

### **✅ ALIGNED - Same Backend**

| Feature | Web App | Mobile App | Status |
|---------|---------|------------|--------|
| **Database** | Supabase PostgreSQL | Supabase PostgreSQL | ✅ Same |
| **GraphQL Endpoint** | task.amtariksha.com/api/graphql | task.amtariksha.com/api/graphql | ✅ Same |
| **Authentication** | JWT (cookies) | JWT (Bearer token) | ✅ Compatible |
| **User Table** | PostgreSQL `users` | PostgreSQL `users` | ✅ Same |
| **Task Queries** | GraphQL | GraphQL | ✅ Same schema |
| **Bug Queries** | GraphQL | GraphQL | ✅ Same schema |
| **Feed System** | GraphQL | GraphQL | ✅ Same schema |
| **File Upload** | AWS S3 | AWS S3 | ✅ Same bucket |

---

## 🔍 Key Differences (By Design)

### **1. Authentication Storage**
- **Web**: HTTP-only cookies (more secure, auto-sent)
- **Mobile**: SecureStore + Bearer token (required for mobile)
- **Why**: Cookies don't work well in mobile apps

### **2. Cache Strategy**
- **Web**: No persistent cache (server-side rendering)
- **Mobile**: Persistent cache in AsyncStorage (offline support)
- **Why**: Mobile users expect offline functionality

### **3. React Version**
- **Web**: React 18.x (Next.js 16 compatible)
- **Mobile**: React 19.1.0 (React Native 0.81.5 requirement)
- **Why**: React Native 0.81.5 requires React ^19.1.0

### **4. Apollo Client Import**
- **Web**: `import { ApolloProvider } from '@apollo/client'` (works in v3.x)
- **Mobile**: `import { ApolloProvider } from '@apollo/client/react'` (required in v4.x)
- **Why**: Apollo Client 4.x reorganized exports

---

## 📋 GraphQL Schema Comparison

### **Tasks**
```graphql
# Both apps use identical Task type
type Task {
  id: ID!
  taskId: String!
  name: String
  description: String!
  assignedTo: [String!]!
  assignedBy: String!
  support: [String!]!
  startDate: String!
  endDate: String!
  priority: String!
  estimatedHours: Float!
  actualHours: Float
  dailyHours: String
  status: String!
  remarks: String
  difficulties: String
  relatedTasks: String
  projectId: String
  subprojectId: String
  parentTaskId: String
  department: String
  timerState: String
  createdAt: String!
  updatedAt: String!
  subtasks: [SubTask!]!
}
```

### **Bugs**
```graphql
# Both apps use identical Bug type
type Bug {
  id: ID!
  bugId: String!
  title: String
  description: String!
  category: String!
  severity: String!
  priority: String
  status: String!
  assignedTo: String
  assignedBy: String
  reportedBy: String
  reportedDate: String
  resolvedDate: String
  startDate: String
  endDate: String
  estimatedHours: Float
  actualHours: Float
  remarks: String
  attachments: [String!]
  projectId: String
  subprojectId: String
  relatedBugs: String
  bugType: String
  criticality: String
  parentDevId: String
  environment: String
  type: String
  feature: String
  platform: String
  timerState: String
  timerStartTime: String
  timerPausedTime: String
  timerTotalTime: String
  createdAt: String!
  updatedAt: String!
  subtasks: [BugSubTask!]!
}
```

---

## 🎯 Conclusion

### **Current State: ✅ FULLY ALIGNED**

Both web and mobile apps:
1. ✅ Connect to same Supabase PostgreSQL database
2. ✅ Use same GraphQL API endpoint
3. ✅ Share same authentication system (JWT)
4. ✅ Query same data with identical schemas
5. ✅ Use same file storage (AWS S3)
6. ✅ Support all features (Tasks, Bugs, Feed, Leave, WFH)

### **Migration Complete**

The system has successfully migrated from:
- ❌ MySQL on AWS RDS → ✅ PostgreSQL on Supabase
- ❌ REST API → ✅ GraphQL API
- ❌ Separate backends → ✅ Unified GraphQL backend

### **No Action Required**

Mobile app is already configured correctly and working with the current Supabase/PostgreSQL backend. No changes needed.

---

**Last Updated**: November 11, 2025  
**Verified By**: Architecture Audit  
**Next Review**: When adding new features or changing infrastructure

