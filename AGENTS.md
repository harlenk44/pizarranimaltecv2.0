<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- The lottery board is a client-only app mounted at / (components/LotteryApp.tsx); roles live in user_roles, never on profiles, to prevent privilege escalation.
- Wrap daily and weekly boards in BoardDisplay with DisplayContext for device-local sizing and the Fullscreen API; keep these preferences separate from shared app_settings so one television does not alter others.
- Automatic result ingestion uses a cron-authenticated TanStack server route and server-only provider adapters, not Edge Functions; this preserves the app's server runtime boundary.
- Automatic writes must use sync_automatic_result; its atomic conflict condition preserves manual corrections even during concurrent synchronization.
- Use the shared lottery-date helper for draw-date filters and defaults; Venezuela's calendar date must not switch at UTC midnight or depend on the display device timezone.
