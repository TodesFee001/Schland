drop policy if exists "profiles read own or managed" on public.profiles;
create policy "profiles read own or managed"
on public.profiles for select
using (id = (select auth.uid()) or public.has_permission('users.manage'));

drop policy if exists "profiles manage" on public.profiles;
create policy "profiles insert by managers"
on public.profiles for insert
with check (public.has_permission('users.manage'));
create policy "profiles update by managers"
on public.profiles for update
using (public.has_permission('users.manage'))
with check (public.has_permission('users.manage'));
create policy "profiles delete by managers"
on public.profiles for delete
using (public.has_permission('users.manage'));

drop policy if exists "roles managed by managers" on public.roles;
create policy "roles insert by managers"
on public.roles for insert
with check (public.has_permission('roles.manage'));
create policy "roles update by managers"
on public.roles for update
using (public.has_permission('roles.manage'))
with check (public.has_permission('roles.manage'));
create policy "roles delete by managers"
on public.roles for delete
using (public.has_permission('roles.manage'));

drop policy if exists "categories managed" on public.file_categories;
create policy "categories insert by managers"
on public.file_categories for insert
with check (public.has_permission('files.manage'));
create policy "categories update by managers"
on public.file_categories for update
using (public.has_permission('files.manage'))
with check (public.has_permission('files.manage'));
create policy "categories delete by managers"
on public.file_categories for delete
using (public.has_permission('files.manage'));

drop policy if exists "folders managed" on public.folders;
create policy "folders insert by managers"
on public.folders for insert
with check (public.has_permission('folders.manage'));
create policy "folders update by managers"
on public.folders for update
using (public.has_permission('folders.manage'))
with check (public.has_permission('folders.manage'));
create policy "folders delete by managers"
on public.folders for delete
using (public.has_permission('folders.manage'));

drop policy if exists "folder permissions managed" on public.folder_permissions;
create policy "folder permissions insert by managers"
on public.folder_permissions for insert
with check (public.has_permission('folders.manage'));
create policy "folder permissions update by managers"
on public.folder_permissions for update
using (public.has_permission('folders.manage'))
with check (public.has_permission('folders.manage'));
create policy "folder permissions delete by managers"
on public.folder_permissions for delete
using (public.has_permission('folders.manage'));

drop policy if exists "member files managed by editors" on public.member_files;
create policy "member files insert by editors"
on public.member_files for insert
with check (public.has_permission('members.edit') and public.has_mfa_level2());
create policy "member files update by editors"
on public.member_files for update
using (public.has_permission('members.edit') and public.has_mfa_level2())
with check (public.has_permission('members.edit') and public.has_mfa_level2());
create policy "member files delete by editors"
on public.member_files for delete
using (public.has_permission('members.edit') and public.has_mfa_level2());
