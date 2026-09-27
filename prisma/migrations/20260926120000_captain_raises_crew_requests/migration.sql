-- Captains can raise crew requests (CR_CREATE), not only triage, assign and
-- complete them. Role grants live in the database and only the seed writes
-- them, so deployed databases need this row. Idempotent, and a no-op on a
-- database that has not been seeded yet.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r, "Permission" p
WHERE r."key" = 'CAPTAIN' AND p."key" = 'crew_request.create'
ON CONFLICT DO NOTHING;
