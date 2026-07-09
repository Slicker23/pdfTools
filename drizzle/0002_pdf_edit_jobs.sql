-- Add pdf_edit_extract and pdf_edit_apply job types
ALTER TYPE "public"."job_type" ADD VALUE IF NOT EXISTS 'pdf_edit_extract';
ALTER TYPE "public"."job_type" ADD VALUE IF NOT EXISTS 'pdf_edit_apply';
