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

- Drop-reason visuals must use the shared deterministic `reasonColor` helper so colours stay stable across filtered views.
- Keep the initial Campaign Overview date range in the pure `overview-date-range` helper, used only by the overview route; this isolates its default from other pages and makes inclusive date boundaries testable.
- Retire features by removing their route files and all UI callers rather than adding wildcard-role exceptions; retain request-only server modules when backend removal is out of scope.
- Keep launch eligibility and initial selection in the wizard-only launch-program module so changing launch choices cannot restrict global program browsing.
