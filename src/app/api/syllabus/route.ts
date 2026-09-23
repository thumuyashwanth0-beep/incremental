import { handler, json } from "@/lib/http";
import { syllabus } from "@/lib/syllabus";

// Public, static content. Per-user mastery comes from /api/me/analytics.
export const GET = handler(async () => json({ syllabusVersion: syllabus.syllabusVersion, subjects: syllabus.subjects }));
