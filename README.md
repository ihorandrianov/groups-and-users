# Resource Sharing System

Access control system that allows resources to be shared with individual users, groups, or everyone.

## Run with Docker

```bash
docker compose up --build
```

## Run Locally

```bash
bun install
docker compose up db -d
bun run migrate
bun run dev
```

## API Endpoints

### Core Access Control (Required)
- `GET /resources/:id/access-list` - All users with access to a resource
- `GET /users/:id/resources` - All resources accessible by a user

### Aggregation (Optional)
- `GET /resources/with-user-count` - Resources with count of users who have access
- `GET /users/with-resource-count` - Users with count of accessible resources

### CRUD
- `/users` - User management
- `/groups` - Group management
- `/resources` - Resource management with sharing

See `postman_collection.json` for full API documentation.

---

# Design Decisions & Tradeoffs

## 1. Database Schema

### Single `resource_shares` Table vs Separate Tables

I do not see if we win anything having 3 separate tables. This way its simple and convenient.

### `share_type = 'everyone'` vs `is_public` Flag on Resources

I like having all sharing logic in one place

## 2. Query Strategy for Aggregations

### CTE + UNION for Correctness vs Simple COUNT for Performance

UNION is super slow but correct. If we dont care about duplication i have approach with just counting all accesses in CTEs and then just summing up

**What can be done better:
- Materialized views? (personaly i hate them)
- Caching (pragmatic)
- Approximate counts (viable for previews, not for real count)
- Simplified CQRS with backgroud workers that precalculate aggregates (almost identical to materialized views but could handle better at application layer)

## 3. Access Check Query

Got surprising results from benchmarks 
We should optimize for authorization hits since we expect that hits more often then misses.

`EXISTS` with `UNION ALL` for short-circuit evaluation

```sql
SELECT EXISTS (
  SELECT 1 FROM resource_shares
    WHERE resource_id = ? AND user_id IS NULL AND group_id IS NULL  -- global
  UNION ALL
  SELECT 1 FROM resource_shares
    WHERE resource_id = ? AND user_id = ?                           -- direct
  UNION ALL
  SELECT 1 FROM resource_shares rs
    JOIN user_groups ug ON ug.group_id = rs.group_id
    WHERE rs.resource_id = ? AND ug.user_id = ?                     -- group
) as has_access

- `EXISTS` stops at first match (fast for positive cases)
- `UNION ALL` preserves short-circuit (vs `UNION` which must dedupe)
- Checks global first (often fastest to confirm)

## 4. Architecture Choices

### Fastify over Express

  I am more familiar with Fastify, and i love ergonomics.
  I will use NestJs for production because its mainstream, but still like pure Fastify more.

### Knex over Prisma/Drizzle

- I am more used to raw SQL
- Raw SQL control for complex CTEs
- Lightweight, minimal abstraction
- Easy migration management

  **Bads:**
- No compile-time query validtion
- Manual type definitions

### Service Layer without Repository Pattern

Services directly use Knex, no repository abstraction, absolutely needed for complex services, ok for test task

With more time i would abstract a lot, because i like concept of layers and single responsibility 

## 5. Indexing Strategy

```sql
CREATE INDEX idx_user_groups_group_id ON user_groups(group_id);
CREATE INDEX idx_user_groups_user_id ON user_groups(user_id);
CREATE INDEX idx_resource_shares_resource_id ON resource_shares(resource_id);
CREATE INDEX idx_resource_shares_user_id ON resource_shares(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_resource_shares_group_id ON resource_shares(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_resource_shared_globally ON resource_shares(resource_id) WHERE user_id IS NULL AND group_id IS NULL;
```

Partial indexes for nullable columns gives us smaller index size, faster lookups for non-null values, Postgres optimizes queries with matching where clauses

## 6. Authentication

Simple `X-User-Id` header for auth, sufficient for demonstration, easy to test with curl or postman

With more time we will need to implement sessions, ideally maintain list of organization ids in session so we can avoid additional lookup in our queries.

# Out of scope

1. **Caching** - Redis cache for access checks with invalidation on share changes
2. **Pagination** - Cursor-based pagination for list endpoints
3. **Tests** - Unit tests for access queries, integration tests for endpoints
4. **Type-safe SQL** - Migrate to Kysely or Drizzle for compile-time query validation
5. **Audit logging** - Track who shared/unshared and when
6. **Batch operations** - Share with multiple users/groups in one request
7. **Materialized views** - For aggregation queries in high-traffic scenarios
