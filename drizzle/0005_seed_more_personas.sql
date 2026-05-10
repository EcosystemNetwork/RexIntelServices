INSERT INTO "tags" ("name", "description", "kind") VALUES
  ('hacker', 'Hackers, security researchers, smart-contract auditors', 'persona'),
  ('degen', 'Active traders, on-chain degens, MEV / yield operators', 'persona'),
  ('investor', 'Allocators, angels, LPs, family offices', 'persona'),
  ('developer', 'Protocol / app builders, infra engineers', 'persona')
ON CONFLICT ("name") DO NOTHING;
