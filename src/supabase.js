import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://extfphzxfbnexosuuqph.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4dGZwaHp4ZmJuZXhvc3V1cXBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5OTY1MDcsImV4cCI6MjA5ODU3MjUwN30.sNRQ3HeoucyLSNa1O9aY0GYysW8DNqF6-7Ity5mWgVw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);