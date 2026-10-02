-- Duty RP Control System: запись в каталог снабжения из GitHub Pages клиента.
--
-- Применяется вручную к уже настроенному проекту после supabase/rls-policies.sql.
-- Те же политики входят в канонический rls-policies.sql, поэтому повторное
-- применение rls-policies.sql их не теряет. Файл можно выполнять повторно.
-- Пополнять и править каталог могут только пользователи с ролью
-- system_admin или officer (private.is_duty_admin()).

begin;

grant insert, update on public."SupplyCatalogCategory" to authenticated;
grant insert, update, delete on public."SupplyCatalogItem" to authenticated;

drop policy if exists duty_pages_catalog_category_insert on public."SupplyCatalogCategory";
drop policy if exists duty_pages_catalog_category_update on public."SupplyCatalogCategory";
drop policy if exists duty_pages_catalog_item_insert on public."SupplyCatalogItem";
drop policy if exists duty_pages_catalog_item_update on public."SupplyCatalogItem";
drop policy if exists duty_pages_catalog_item_delete on public."SupplyCatalogItem";

create policy duty_pages_catalog_category_insert
on public."SupplyCatalogCategory"
for insert
to authenticated
with check (private.is_duty_admin());

create policy duty_pages_catalog_category_update
on public."SupplyCatalogCategory"
for update
to authenticated
using (private.is_duty_admin())
with check (private.is_duty_admin());

create policy duty_pages_catalog_item_insert
on public."SupplyCatalogItem"
for insert
to authenticated
with check (private.is_duty_admin());

create policy duty_pages_catalog_item_update
on public."SupplyCatalogItem"
for update
to authenticated
using (private.is_duty_admin())
with check (private.is_duty_admin());

create policy duty_pages_catalog_item_delete
on public."SupplyCatalogItem"
for delete
to authenticated
using (private.is_duty_admin());

commit;
