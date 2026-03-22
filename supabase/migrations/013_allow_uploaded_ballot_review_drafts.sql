alter table public.ballot_review_drafts
  drop constraint if exists ballot_review_drafts_source_check;

alter table public.ballot_review_drafts
  add constraint ballot_review_drafts_source_check
  check (source in ('pasted_text', 'uploaded_file'));
