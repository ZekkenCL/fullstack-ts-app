-- Create tsvector column for full-text search and index
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS content_tsv tsvector;

-- Populate existing rows
UPDATE "Message" SET content_tsv = to_tsvector('spanish', coalesce(content,''));

-- Create GIN index
CREATE INDEX IF NOT EXISTS message_content_tsv_idx ON "Message" USING GIN (content_tsv);

-- Trigger to keep it updated
CREATE OR REPLACE FUNCTION message_tsvector_update() RETURNS trigger AS $$
BEGIN
  NEW.content_tsv := to_tsvector('spanish', coalesce(NEW.content,''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS message_tsvector_update ON "Message";
CREATE TRIGGER message_tsvector_update BEFORE INSERT OR UPDATE OF content ON "Message"
FOR EACH ROW EXECUTE FUNCTION message_tsvector_update();
