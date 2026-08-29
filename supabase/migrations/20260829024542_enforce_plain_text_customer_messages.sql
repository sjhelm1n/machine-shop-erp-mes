alter table public.customer_messages
  drop constraint if exists customer_messages_message_check;

alter table public.customer_messages
  add constraint customer_messages_message_check check (
    length(trim(message)) between 1 and 2000
    and message !~* '<[^>]+>'
    and message !~* '(https?://|www[.]|[[:alnum:]][[:alnum:]-]*[.][[:alpha:]]{2,}([/?:#]|[[:space:]]|$))'
    and message !~* '(ftp[[:space:]]*://|javascript[[:space:]]*:|data[[:space:]]*:[[:space:]]*[[:alpha:]][[:alnum:].+-]*/[[:alnum:].+-]+|file[[:space:]]*:[[:space:]]*/{1,3})'
  );

comment on column public.customer_messages.message is
  'Plain-text order Q&A only. HTML, URLs, executable URI schemes, attachments, and rich embeds are not accepted.';
