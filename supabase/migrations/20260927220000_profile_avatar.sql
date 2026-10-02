-- Profile photo, stored as a small data URL (the app resizes it to 256px before saving).
alter table profiles add column if not exists avatar text not null default ''
  check (avatar = '' or (avatar ~ '^data:image/(jpeg|png|webp);base64,' and length(avatar) < 300000));
