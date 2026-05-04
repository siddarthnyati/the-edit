-- Drop abandoned Prisma tables from an earlier styleMeUp iteration.
-- All tables were empty and never wired to the current Expo app.
-- RLS was disabled on all of them — security advisor was flagging them.

drop table if exists public."WearLog" cascade;
drop table if exists public."SavedOutfit" cascade;
drop table if exists public."OutfitRecommendation" cascade;
drop table if exists public."WardrobeItem" cascade;
drop table if exists public."UserProfile" cascade;
drop table if exists public."User" cascade;
drop table if exists public._prisma_migrations cascade;
