INSERT INTO "tags" ("name", "description", "kind") VALUES
  ('founder', 'Startup founders, operators, technical co-founders building in or near crypto', 'persona'),
  ('journalist', 'Reporters, writers, editors covering crypto / fintech / security beats', 'persona')
ON CONFLICT ("name") DO NOTHING;
