# JSR Task Management - MySQL Database Migration

## Overview

This directory contains the MySQL database schema and migration scripts for the JSR Task Management System. The application has been migrated from Google Sheets to MySQL for better performance, scalability, and data integrity.

## Database Information

**AWS RDS MySQL Instance:**
- **Host:** ls-2c38665177f03573f3e3e1c02d6c69b301466b75.crq8gq4ka0rw.ap-south-1.rds.amazonaws.com
- **Port:** 3306
- **Database:** task
- **User:** u806435594_swarg
- **SSL:** Enabled

## Files

### 1. `schema.sql`
Complete database schema including:
- **users** - Employee/user information and authentication
- **tasks** - Task management and tracking
- **leave_applications** - Leave requests and approvals
- **wfh_applications** - Work from home requests
- **bugs** - Bug tracking system
- **bug_comments** - Bug discussion threads

### 2. `sample_data.sql`
Sample data extracted from the original Google Sheets for testing and development.

### 3. `README.md`
This file - documentation for the database migration.

## Database Schema

### Tables

#### users
Stores employee information and authentication details.
- Primary Key: `id` (auto-increment)
- Unique Keys: `employee_id`, `email`
- Foreign Keys: `manager_id` references `users(employee_id)`

#### tasks
Manages tasks and assignments.
- Primary Key: `id` (auto-increment)
- Unique Keys: `task_id`, `internal_id`
- Foreign Keys: `assigned_to`, `assigned_by` reference `users(employee_id)`
- JSON Fields: `support`, `daily_hours`, `timer_sessions`

#### leave_applications
Handles leave requests and approvals.
- Primary Key: `id` (auto-increment)
- Unique Key: `application_id`
- Foreign Keys: `employee_id`, `manager_id`, `approved_by` reference `users(employee_id)`

#### wfh_applications
Manages work from home requests.
- Primary Key: `id` (auto-increment)
- Unique Key: `application_id`
- Foreign Keys: `employee_id`, `manager_id`, `approved_by` reference `users(employee_id)`

#### bugs
Bug tracking and management.
- Primary Key: `id` (auto-increment)
- Unique Key: `bug_id`
- Foreign Keys: `assigned_to`, `assigned_by`, `reported_by` reference `users(employee_id)`

#### bug_comments
Comments and discussions on bugs.
- Primary Key: `id` (auto-increment)
- Foreign Keys: `bug_id` references `bugs(bug_id)`, `commented_by` references `users(employee_id)`

## Setup Instructions

### 1. Test Database Connection

```bash
node scripts/init-database.js
```

### 2. Import Schema

```bash
node scripts/init-database.js --schema
```

### 3. Import Sample Data (Optional)

```bash
node scripts/init-database.js --data
```

### 4. Verify Installation

```bash
node scripts/init-database.js --verify
```

### 5. All-in-One Setup

```bash
node scripts/init-database.js --schema --data --verify
```

## Environment Variables

Add these to your `apps/web/.env.local` file (gitignored; never commit real values):

```env
MYSQL_HOST=HOST
MYSQL_PORT=3306
MYSQL_USER=USER
MYSQL_PASSWORD=PASSWORD
MYSQL_DATABASE=task
```

## Migration from Google Sheets

### What Changed

1. **Data Storage:** Moved from Google Sheets API to MySQL database
2. **Service Layer:** Created new `src/lib/db/` directory with MySQL services
3. **Connection Pooling:** Implemented efficient connection management
4. **Data Integrity:** Added foreign keys, constraints, and indexes
5. **Performance:** Significantly faster queries with proper indexing

### Old vs New

| Aspect | Google Sheets | MySQL |
|--------|--------------|-------|
| Storage | Cloud Spreadsheet | Relational Database |
| Performance | Slow (API calls) | Fast (direct queries) |
| Scalability | Limited | High |
| Data Integrity | Manual | Enforced (FK, constraints) |
| Concurrent Access | Limited | Excellent |
| Backup | Manual | Automated |

## Code Migration

### Service Layer Structure

```
src/lib/db/
├── config.ts       # Database configuration and connection pool
├── users.ts        # User CRUD operations
├── tasks.ts        # Task CRUD operations
├── leaves.ts       # Leave application operations
├── wfh.ts          # WFH application operations
├── bugs.ts         # Bug tracking operations
└── index.ts        # Main export file
```

### Usage Example

```typescript
import { getAllUsers, getUserByEmployeeId } from '@/lib/db/users'
import { getAllTasks, createTask } from '@/lib/db/tasks'

// Get all users
const users = await getAllUsers()

// Get specific user
const user = await getUserByEmployeeId('AM-0001')

// Create a task
const newTask = await createTask({
  id: 'unique-id',
  taskId: 'JSR-123456',
  description: 'New task',
  assignedTo: 'AM-0001',
  assignedBy: 'AM-0001',
  // ... other fields
})
```

## Security Features

1. **SSL/TLS:** All connections use SSL encryption
2. **Parameterized Queries:** Protection against SQL injection
3. **Connection Pooling:** Efficient resource management
4. **Foreign Keys:** Data integrity enforcement
5. **Indexes:** Optimized query performance

## Performance Optimizations

1. **Indexes:** Created on frequently queried columns
2. **Connection Pool:** Reuses database connections
3. **Retry Logic:** Automatic retry on transient failures
4. **JSON Fields:** Efficient storage of complex data structures

## Backup and Recovery

### Manual Backup

```bash
mysqldump -h [HOST] -u [USER] -p[PASSWORD] --ssl task > backup.sql
```

### Restore from Backup

```bash
mysql -h [HOST] -u [USER] -p[PASSWORD] --ssl task < backup.sql
```

## Troubleshooting

### Connection Issues

1. Check if the RDS instance is accessible
2. Verify SSL is enabled
3. Check security group rules
4. Verify credentials in `.env.local`

### Foreign Key Errors

- Ensure parent records exist before creating child records
- Check employee IDs match between tables

### Performance Issues

- Check if indexes are created
- Monitor connection pool usage
- Review slow query logs

## Next Steps

1. ✅ Database schema created
2. ✅ MySQL service layer implemented
3. ⏳ Update API routes to use MySQL
4. ⏳ Test all CRUD operations
5. ⏳ Deploy to production

## Support

For issues or questions, contact the development team.

