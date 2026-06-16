# React Enterprise — Pre-Delivery Checklist

Run every item before marking a task complete or opening a PR.

## Architecture
- [ ] No `useState` or event handlers in any `app/*/page.tsx` file
- [ ] No JSX returned from any hook file
- [ ] No `fetch` call outside of `lib/api/client.ts`
- [ ] No backend/server module imported in any frontend file
- [ ] Domain composites receive data as props only — no API calls inside composites

## TypeScript
- [ ] No `any` used anywhere — `unknown` + type guards instead
- [ ] All API responses validated with Zod at the `client.ts` boundary
- [ ] Async state modelled as discriminated union (not boolean flag pairs)
- [ ] All event handlers explicitly typed (`React.ChangeEventHandler<…>` etc.)

## CSS / Styling
- [ ] No hardcoded colour values (hex, rgb, hsl) outside `tokens.css`
- [ ] No hardcoded spacing values (`px`, `rem` literals) outside `tokens.css`
- [ ] No Tailwind colour or typography classes (`text-indigo-500`, `font-semibold`) — use CSS Modules with tokens
- [ ] Every component with non-trivial styles has a co-located `.module.css`
- [ ] Adding a new tenant still requires only one new CSS file and zero component changes

## Components
- [ ] All primitives in `components/ui/` are fully domain-agnostic
- [ ] Shell component owns all state and mutation handling for its domain
- [ ] No component exceeds ~200 lines — split if needed
- [ ] Barrel `index.ts` updated for any new `ui/` primitive

## Error Handling
- [ ] Every Shell mutation wrapped in try/catch with user-visible error state + toast
- [ ] Every route segment / layout wrapped in `<ErrorBoundary>`
- [ ] Loading, error, and success states handled for every async operation

## Accessibility
- [ ] All interactive elements use semantic HTML (`<button>`, `<a>`, `<input>`)
- [ ] Every icon-only button has an `aria-label`
- [ ] Every Modal/Drawer has `role="dialog"` and a focus trap
- [ ] Visible `:focus-visible` ring on all interactive elements
- [ ] All animations wrapped in `@media (prefers-reduced-motion: no-preference)`

## Multi-Tenant / Feature Flags
- [ ] No `if (tenant.slug === '…')` branches anywhere in component code
- [ ] All behavioural variation uses `useFeatureFlags()` — never tenant identity
