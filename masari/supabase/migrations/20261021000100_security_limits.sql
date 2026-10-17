-- صور الطلاب: الواجهة تصغّرها إلى JPEG صغير قبل الرفع، والخادم يرفض أي ملف آخر أو أكبر من 1MB
-- (حتى لو رُفع مباشرة بالـ API متجاوزًا الواجهة).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    update storage.buckets set file_size_limit = 1048576, allowed_mime_types = array['image/jpeg','image/png','image/webp']
      where id = 'student-photos';
  end if;
end $$;
