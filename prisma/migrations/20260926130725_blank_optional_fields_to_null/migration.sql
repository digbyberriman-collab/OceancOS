-- G2.8 / C13: optional fields written as the empty string, from before the
-- application started normalising "" to NULL on the way in
-- (src/lib/validators.ts's `blankToNull` preprocessor). Every one of these
-- columns is nullable; "" is not a real value for any of them, and left in
-- place it defeats a `WHERE x IS NULL` filter or join and, for
-- "linkedChangeOrderId", could never have been written for a real record in
-- the first place (that insert would have failed its foreign key) — this
-- covers the possibility that pre-application-fix seed data or a direct
-- write left one at "".

UPDATE "ChangeOrder"
SET
  "departmentCode" = NULLIF("departmentCode", ''),
  "vesselAreaId" = NULLIF("vesselAreaId", ''),
  "riskImpact" = NULLIF("riskImpact", ''),
  "technicalImpact" = NULLIF("technicalImpact", '')
WHERE
  "departmentCode" = '' OR
  "vesselAreaId" = '' OR
  "riskImpact" = '' OR
  "technicalImpact" = '';

UPDATE "CrewRequest"
SET
  "departmentCode" = NULLIF("departmentCode", ''),
  "vesselAreaId" = NULLIF("vesselAreaId", ''),
  "assignedToId" = NULLIF("assignedToId", ''),
  "safetyImpact" = NULLIF("safetyImpact", ''),
  "linkedChangeOrderId" = NULLIF("linkedChangeOrderId", '')
WHERE
  "departmentCode" = '' OR
  "vesselAreaId" = '' OR
  "assignedToId" = '' OR
  "safetyImpact" = '' OR
  "linkedChangeOrderId" = '';
