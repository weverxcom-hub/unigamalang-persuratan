# Backup Strategy

## Database (Neon Postgres)

### Automatic Backups (Neon Built-in)
- **Point-in-time recovery**: Neon retains WAL history (7 days on free plan, 30 days on paid)
- **Branch snapshots**: Each Neon branch has its own history
- **No configuration needed**: This is enabled by default

### Recommended: Periodic Logical Backups

Set up a weekly `pg_dump` exported to cloud storage for disaster recovery independent of Neon:

```bash
#!/bin/bash
# scripts/backup-db.sh — run weekly via cron or CI schedule
set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="unigamalang-persuratan-${DATE}.sql.gz"

pg_dump "$DIRECT_URL" --no-owner --no-privileges | gzip > "/tmp/${FILENAME}"

# Upload to Google Cloud Storage / S3 / Azure Blob
# gsutil cp "/tmp/${FILENAME}" "gs://unigamalang-backups/db/${FILENAME}"
# aws s3 cp "/tmp/${FILENAME}" "s3://unigamalang-backups/db/${FILENAME}"

rm "/tmp/${FILENAME}"
echo "Backup complete: ${FILENAME}"
```

### Environment Variables for Backup

```env
# .env.backup (DO NOT commit — add to .gitignore)
DIRECT_URL=postgresql://user:pass@host/db    # Direct (non-pooled) connection
BACKUP_BUCKET=gs://unigamalang-backups       # Cloud storage target
```

## File Storage

### Google Drive
- Files uploaded to Google Drive are retained by Google's built-in redundancy
- Ensure the service account has sufficient Drive storage quota
- Periodically audit orphaned files (files in Drive not referenced by any Archive)

### Vercel Blob
- Vercel Blob storage is durable by default
- No separate backup needed unless migrating off Vercel

## Audit Log Retention

The `/api/cron/cleanup-audit` cron job (runs weekly on Sunday at 03:00 UTC):
- Deletes audit logs older than **2 years**
- Deletes webhook deliveries older than **90 days**

For regulatory compliance, consider exporting audit logs to cold storage before deletion.

## Recovery Procedures

### Database Recovery (Neon)
1. Go to Neon Console → Project → Branches
2. Create a new branch from a point-in-time before the incident
3. Update `DATABASE_URL` to point to the recovered branch
4. Verify data integrity
5. Switch production to the recovered branch

### Database Recovery (pg_dump)
1. Provision a new Neon database (or local Postgres)
2. `gunzip < backup.sql.gz | psql $NEW_DATABASE_URL`
3. Run `prisma migrate deploy` to ensure schema is current
4. Update environment variables and redeploy

## Recommended Schedule

| Item | Frequency | Retention |
|------|-----------|-----------|
| Neon auto-backup | Continuous (WAL) | 7-30 days |
| pg_dump export | Weekly | 90 days |
| Audit log cleanup | Weekly | 2 years |
| Webhook delivery cleanup | Weekly | 90 days |
| Drive orphan audit | Monthly | — |
