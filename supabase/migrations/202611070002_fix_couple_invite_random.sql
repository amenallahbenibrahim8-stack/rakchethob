begin;

alter function public.create_couple(text, text)
  set search_path = public, extensions, pg_temp;

alter function public.get_couple_invitation(uuid)
  set search_path = public, extensions, pg_temp;

commit;
