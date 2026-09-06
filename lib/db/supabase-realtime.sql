-- ============================================================================
-- Supabase Realtime Replication Enablement Script for EchoOps
-- ============================================================================

-- Ensure the supabase_realtime publication exists (default in Supabase)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- 1. Enable REPLICA IDENTITY FULL so all columns are included in UPDATE payloads
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'incidents') THEN
    ALTER TABLE "incidents" REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Incident') THEN
    ALTER TABLE "Incident" REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transcripts') THEN
    ALTER TABLE "transcripts" REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Transcript') THEN
    ALTER TABLE "Transcript" REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'timeline_events') THEN
    ALTER TABLE "timeline_events" REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'TimelineEvent') THEN
    ALTER TABLE "TimelineEvent" REPLICA IDENTITY FULL;
  END IF;
END $$;

-- 2. Add tables to supabase_realtime publication
DO $$
BEGIN
  -- incidents / Incident
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'incidents') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "incidents";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Incident') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Incident";
  END IF;

  -- transcripts / Transcript
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transcripts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "transcripts";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Transcript') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Transcript";
  END IF;

  -- timeline_events / TimelineEvent
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'timeline_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "timeline_events";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'TimelineEvent') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "TimelineEvent";
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- Already added to publication
END $$;
