-- ============================================================================
-- Move the Swarg Food and Tattva Silicon project trees into their own companies
-- ============================================================================
--
-- ⚠ ALREADY APPLIED to the live database on 2026-09-29. See "STATUS" below.
--
-- It was written for this live state, which is what it found:
--
--   * companies already held all three rows:
--       COMP-001 AM  Amtariksha
--       COMP-002 SW  Swarg
--       COMP-003 TS  Tattva Silicon
--   * every one of the 53 projects was company_id = 'COMP-001'
--   * user_companies held only COMP-001 rows (21 people)
--
-- STATUS: STEP 2 has run and is committed. Projects are now COMP-001 = 44,
-- COMP-002 = 4, COMP-003 = 5; 4 tasks moved to COMP-002 and 1 bug to COMP-003;
-- no row is unscoped and no work item disagrees with its project's company.
-- Re-running STEP 2 is a no-op — every UPDATE is guarded by
-- `company_id IS DISTINCT FROM` — but there is no reason to. The rollback at the
-- bottom is the way back.
--
-- WHAT IT DOES
--
--   COMP-002 (Swarg)          <- PRJ-037 Swarg Food and its sub-projects
--   COMP-003 (Tattva Silicon) <- PRJ-051 Tattva Silicon and its sub-projects
--   COMP-001 (Amtariksha)     <- everything else, unchanged
--
-- The sub-projects are resolved RECURSIVELY from those two roots, so a
-- three-level nest (PRJ-051 -> PRJ-049 -> PRJ-050) moves as one unit rather
-- than stranding the deepest row. At the time of writing that means:
--
--   Swarg: PRJ-037, PRJ-045, PRJ-046, PRJ-047                  (4 projects)
--   TS:    PRJ-051, PRJ-048, PRJ-049, PRJ-050, PRJ-052         (5 projects)
--
-- Tasks, bugs and requirements in those projects move with them, matched on
-- EITHER project_id OR subproject_id — an item filed against a sub-project
-- alone must not be left pointing at the old company.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
--   * It does not touch users or user_companies. Everyone stays in Amtariksha;
--     add people to Swarg and Tattva Silicon from the Company admin page, which
--     records who did it and lets you set a company role at the same time.
--   * It does not touch PRJ-002 "Swarg" or its nine sub-projects. That tree is
--     Amtariksha's software work and stays put.
--   * It does not touch feed topics, feed posts or settings. Those are
--     company-wide rather than project-scoped, so they stay with Amtariksha
--     until you create Swarg's and TS's own from the Company page.
--
-- STEP 1 is read-only. STEP 2 is one transaction. STEP 3 verifies. There is a
-- rollback at the bottom that puts everything back to COMP-001.
-- ============================================================================


-- ============================================================================
-- STEP 1 — PREVIEW (read-only). Run this first and read the output.
-- ============================================================================
WITH RECURSIVE tree AS (
    SELECT project_id, 'COMP-002'::varchar AS target FROM projects WHERE project_id = 'PRJ-037'
    UNION ALL
    SELECT project_id, 'COMP-003'::varchar        FROM projects WHERE project_id = 'PRJ-051'
    UNION
    SELECT c.project_id, t.target
      FROM projects c JOIN tree t ON c.parent_project_id = t.project_id
)
SELECT
    t.target        AS moving_to,
    p.project_id,
    p.project_name,
    p.parent_project_id,
    p.status,
    p.company_id    AS company_now,
    (SELECT count(*) FROM tasks        x WHERE x.project_id = p.project_id OR x.subproject_id = p.project_id) AS tasks,
    (SELECT count(*) FROM bugs         x WHERE x.project_id = p.project_id OR x.subproject_id = p.project_id) AS bugs,
    (SELECT count(*) FROM requirements x WHERE x.project_id = p.project_id OR x.subproject_id = p.project_id) AS requirements,
    (SELECT count(*) FROM project_users x WHERE x.project_id = p.project_id) AS members
FROM tree t
JOIN projects p ON p.project_id = t.project_id
ORDER BY t.target, p.parent_project_id NULLS FIRST, p.project_id;

-- Expect 9 rows: 4 moving to COMP-002 and 5 to COMP-003, all showing
-- company_now = 'COMP-001'. If a project you expected is missing, its
-- parent_project_id is not what you think — fix the hierarchy first.


-- ============================================================================
-- STEP 2 — MOVE. One transaction: either all of it lands or none of it does.
-- ============================================================================
BEGIN;

-- The tree is resolved once and kept, so the project UPDATE below cannot change
-- which rows the work-item UPDATEs then match.
CREATE TEMP TABLE _move (project_id VARCHAR PRIMARY KEY, target VARCHAR NOT NULL) ON COMMIT DROP;

WITH RECURSIVE tree AS (
    SELECT project_id, 'COMP-002'::varchar AS target FROM projects WHERE project_id = 'PRJ-037'
    UNION ALL
    SELECT project_id, 'COMP-003'::varchar        FROM projects WHERE project_id = 'PRJ-051'
    UNION
    SELECT c.project_id, t.target
      FROM projects c JOIN tree t ON c.parent_project_id = t.project_id
)
INSERT INTO _move (project_id, target)
SELECT project_id, target FROM tree;

-- Refuse to run on an unexpected shape rather than moving the wrong things.
DO $$
DECLARE
    swarg_count INTEGER;
    ts_count    INTEGER;
BEGIN
    SELECT count(*) INTO swarg_count FROM _move WHERE target = 'COMP-002';
    SELECT count(*) INTO ts_count    FROM _move WHERE target = 'COMP-003';

    IF swarg_count = 0 THEN
        RAISE EXCEPTION 'PRJ-037 (Swarg Food) not found — nothing to move to COMP-002';
    END IF;
    IF ts_count = 0 THEN
        RAISE EXCEPTION 'PRJ-051 (Tattva Silicon) not found — nothing to move to COMP-003';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM companies WHERE company_id = 'COMP-002') THEN
        RAISE EXCEPTION 'COMP-002 does not exist — create the companies first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM companies WHERE company_id = 'COMP-003') THEN
        RAISE EXCEPTION 'COMP-003 does not exist — create the companies first';
    END IF;

    RAISE NOTICE 'Moving % projects to COMP-002 (Swarg) and % to COMP-003 (Tattva Silicon)',
                 swarg_count, ts_count;
END
$$;

-- Projects
UPDATE projects p
   SET company_id = m.target
  FROM _move m
 WHERE p.project_id = m.project_id
   AND p.company_id IS DISTINCT FROM m.target;

-- Work items. project_id OR subproject_id: an item filed against a sub-project
-- alone still belongs to the company that now owns that sub-project.
UPDATE tasks t
   SET company_id = m.target
  FROM _move m
 WHERE (t.project_id = m.project_id OR t.subproject_id = m.project_id)
   AND t.company_id IS DISTINCT FROM m.target;

UPDATE bugs b
   SET company_id = m.target
  FROM _move m
 WHERE (b.project_id = m.project_id OR b.subproject_id = m.project_id)
   AND b.company_id IS DISTINCT FROM m.target;

UPDATE requirements r
   SET company_id = m.target
  FROM _move m
 WHERE (r.project_id = m.project_id OR r.subproject_id = m.project_id)
   AND r.company_id IS DISTINCT FROM m.target;

COMMIT;


-- ============================================================================
-- STEP 3 — VERIFY (read-only). Run after the commit.
-- ============================================================================

-- 3a. Projects per company. Expect COMP-001 = 44, COMP-002 = 4, COMP-003 = 5.
SELECT c.company_id, c.code, c.name, count(p.project_id) AS projects
  FROM companies c
  LEFT JOIN projects p ON p.company_id = c.company_id
 GROUP BY c.company_id, c.code, c.name
 ORDER BY c.company_id;

-- 3b. Nothing unscoped anywhere. Every count must be 0.
SELECT 'projects'     AS table_name, count(*) AS without_company FROM projects     WHERE company_id IS NULL
UNION ALL SELECT 'tasks',        count(*) FROM tasks        WHERE company_id IS NULL
UNION ALL SELECT 'bugs',         count(*) FROM bugs         WHERE company_id IS NULL
UNION ALL SELECT 'requirements', count(*) FROM requirements WHERE company_id IS NULL;

-- 3c. No work item disagrees with the company of the project it sits in. This is
--     the check that matters: a mismatch means a task is visible to one tenant
--     while its project belongs to another.
SELECT 'tasks' AS table_name, t.task_id AS id, t.project_id, t.company_id AS item_company, p.company_id AS project_company
  FROM tasks t JOIN projects p ON p.project_id = t.project_id
 WHERE t.company_id IS DISTINCT FROM p.company_id
UNION ALL
SELECT 'bugs', b.bug_id, b.project_id, b.company_id, p.company_id
  FROM bugs b JOIN projects p ON p.project_id = b.project_id
 WHERE b.company_id IS DISTINCT FROM p.company_id
UNION ALL
SELECT 'requirements', r.requirement_id, r.project_id, r.company_id, p.company_id
  FROM requirements r JOIN projects p ON p.project_id = r.project_id
 WHERE r.company_id IS DISTINCT FROM p.company_id;
-- Expect 0 rows.

-- 3d. Who can currently see the moved projects. Members stay as they are — the
--     move does not add or remove anyone — but a member who does not belong to
--     the new company will not see the project until you add them to it on the
--     Company page.
SELECT p.company_id, p.project_id, p.project_name, pu.employee_id,
       EXISTS (SELECT 1 FROM user_companies uc
                WHERE uc.employee_id = pu.employee_id AND uc.company_id = p.company_id) AS in_that_company
  FROM projects p
  JOIN project_users pu ON pu.project_id = p.project_id
 WHERE p.company_id IN ('COMP-002', 'COMP-003')
 ORDER BY p.company_id, p.project_id, pu.employee_id;


-- ============================================================================
-- ROLLBACK — put both trees back in Amtariksha
-- ============================================================================
-- Only the rows this script moved are affected: it targets COMP-002 and
-- COMP-003 specifically, so anything that was already elsewhere is untouched.
--
-- BEGIN;
--
-- UPDATE tasks        SET company_id = 'COMP-001' WHERE company_id IN ('COMP-002', 'COMP-003');
-- UPDATE bugs         SET company_id = 'COMP-001' WHERE company_id IN ('COMP-002', 'COMP-003');
-- UPDATE requirements SET company_id = 'COMP-001' WHERE company_id IN ('COMP-002', 'COMP-003');
-- UPDATE projects     SET company_id = 'COMP-001' WHERE company_id IN ('COMP-002', 'COMP-003');
--
-- COMMIT;
--
-- The companies rows themselves are left in place. Deleting them would also
-- need the user_companies rows to go, and there is no reason to: an empty
-- company is harmless.
