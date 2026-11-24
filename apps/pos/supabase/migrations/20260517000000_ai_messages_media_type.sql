-- Add media_type column to ai_messages for tracking and filtering media messages
ALTER TABLE public.ai_messages
  ADD COLUMN IF NOT EXISTS media_type text
    CHECK (media_type IN ('audio', 'image', 'document', 'video'));
