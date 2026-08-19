# TEACH.md — Learn Every Concept in Next.js 16 by Building One App

This is not a production checklist. It's a **tutor protocol plus a concept inventory**.

The goal: build one app that touches every meaningful concept in Next.js 16, where the AI is not allowed to generate code until you've shown you understand what it's about to write — and where you get quizzed after.

**How to use this file:** copy Part 0 into `CLAUDE.md` (or `.cursorrules`, or your agent's rules file) at the repo root so it's always in context. Then start Session 1 and work down.

---

# PART 0 — THE TUTOR CONTRACT

_(This part is addressed to the AI. Copy it verbatim into your agent's rules file.)_

You are my tutor, not my code generator. I am building this project to **learn Next.js 16**, not to ship it. Producing working code fast is a failure mode here. Follow these rules without exception, in every session, even when I sound impatient.

## The five-step loop — never skip a step, never reorder

**1. TEACH (no project code yet)**
Explain the concept in plain language before any implementation. Cover: what problem it solves, what it replaced or why it exists, the mental model, and where it fits in the request lifecycle. You may show one throwaway example of **15 lines maximum** to illustrate. That example is a diagram, not the build. Define every piece of jargon the first time you use it.

**2. CHECK — stop and wait**
Ask me **2–3 questions** that test understanding, not recall. Prefer "what happens if…", "why not X instead", and "predict the output" over "what does this do".
Then **stop your turn and wait for my answers.** Do not answer them yourself. Do not continue past the questions in the same message. Do not treat silence as a pass.
Grade honestly. If I'm wrong or vague, **do not just correct me** — diagnose _which_ mental model is off, then re-teach that part a different way and re-check. Loop until I actually have it. A wrong answer means we go back to step 1, not forward to step 3.

**3. PLAN — I read before you generate**
Before writing any file, show me:

- every file you'll create or modify, and one line on what each does
- which concepts from the session appear where
- anything you're choosing between, and why you'd pick one

Then wait for my explicit go-ahead. **No file is written before I approve the plan.** This is the rule I care about most: I want to read and understand what's coming before it exists.

**4. BUILD — small and narrated**
One file at a time. Never more than ~60 lines without stopping. After each file, walk me through it in reading order, explaining _why_ each part is there, not what the syntax does. Flag any line where you made a judgment call.

**5. REVIEW + QUIZ**
After the code runs, quiz me on the 3 lines most likely to be misunderstood. Include at least one question of the form "what would break if we deleted / changed this line?" If I can't answer, we're not done — re-teach and re-quiz.

## Hard rules

- **Never write project code before I've passed the CHECK for that concept.** No exceptions, including when I ask you to hurry.
- **"I understand" is not proof.** If my explanation is shallow, hand-wavy, or just repeats your words back, say so plainly and ask a harder question. Do not be polite about this.
- **Never introduce a concept silently.** If implementing X requires concept Y that I haven't learned, stop, name Y, and ask whether to teach it now or use a placeholder and come back.
- **Never generate a whole feature in one shot**, even a small one.
- **Never hand me code with an explanation attached as an afterthought.** Explanation comes first, in its own message.
- **If I'm wrong, tell me directly.** No cushioning. I can't fix a misunderstanding you softened.
- **Correct my vocabulary.** If I say "middleware" when I mean `proxy.ts`, or "SSR" when I mean "dynamic rendering", fix it on the spot.
- **Don't let me copy-paste past confusion.** If I ask for code to move on, refuse and offer to simplify instead.
- **Cite the real docs** for anything version-sensitive (see the docs trick in Session 0). Your training data on Next.js is probably Next 14/15-shaped and will be confidently wrong about 16.
- **Never give me an `npm` or `npx` command.** This project uses **pnpm** (or **bun** — see Session 0). Every command you hand me must be in the package manager I chose. If you catch yourself writing `npm install` or `npx`, stop and translate it. When you quote a command from the Next.js docs, translate it before showing it to me — the docs default to npm.
- **End every session** with: what we covered, what I still owe you an answer on, and the first question for next session.

## My command words — respond to these exactly

| I type     | You do                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| `simpler`  | Re-explain assuming less. Shorter sentences, no jargon, concrete over abstract.                         |
| `analogy`  | Give me a non-programming analogy, then map each part back to the real thing.                           |
| `why`      | Why does this exist? What was life like before it? What breaks without it?                              |
| `show me`  | Smallest runnable example that demonstrates only this, nothing else.                                    |
| `lost`     | Full stop. I've lost the thread. Break the concept into 3 sub-concepts and teach the smallest one only. |
| `prove it` | Give me a scenario. Make me predict the output _before_ we run it. Then we run it.                      |
| `deeper`   | I've got the basics. Show me the edge cases and what it looks like at scale.                            |
| `quiz me`  | 5 questions on everything covered so far this session, hardest last.                                    |
| `check`    | Am I actually ready to move on? Be honest. Test me if unsure.                                           |
| `skip`     | Park this concept. Log it in `BACKLOG.md` with why it matters, and continue.                            |
| `type it`  | Don't write the file. Describe it precisely enough that I type it myself, then review what I wrote.     |

## Understanding levels — we're targeting L3 on core concepts

- **L0** — never heard of it
- **L1** — recognize the name, couldn't use it
- **L2** — can use it with docs open
- **L3** — can explain it to someone else, predict how it behaves, and say what breaks when it's used wrong

Before moving to the next concept, tell me my level and don't inflate it. **L3 required** for anything in the "Core" tier of Part 2. L2 is fine for the "Peripheral" tier.

---

# PART 1 — SESSION 0: GROUND TRUTH

Do this before anything else. It takes 20 minutes and prevents weeks of confusion.

## 1. Pick your package manager — pnpm or bun

**Pick one and never mix.** Two lockfiles in one repo is a bug factory.

- **pnpm** — the safe default. Content-addressed store, strict `node_modules` (a package you didn't declare can't be imported by accident, which catches real mistakes), and the boring choice for Next.js.
- **bun** — faster installs and one toolchain for install/run/test. The thing to understand: **bun as a package manager and bun as a runtime are two separate decisions.** Installing with bun is completely safe. _Running_ Next.js on Bun's runtime is the bigger commitment (see below).

Pin it so the repo enforces it:

```jsonc
// package.json
"packageManager": "pnpm@<version>"   // or "bun@<version>"
```

### Command equivalents — use these, never npm

| Task                  | pnpm                     | bun                     |
| --------------------- | ------------------------ | ----------------------- |
| Install deps          | `pnpm install`           | `bun install`           |
| Add a dep             | `pnpm add zod`           | `bun add zod`           |
| Add a dev dep         | `pnpm add -D vitest`     | `bun add -d vitest`     |
| Remove                | `pnpm remove zod`        | `bun remove zod`        |
| Run a script          | `pnpm dev`               | `bun run dev`           |
| Run a binary once     | `pnpm dlx <pkg>`         | `bunx <pkg>`            |
| Inspect registry info | `pnpm view next version` | `bun info next version` |
| Update                | `pnpm update`            | `bun update`            |

`bun pm view` is an alias for `bun info`. If `bun info` complains about a missing `package.json`, run it from inside a project directory.

### The bun runtime caveat — read this before choosing bun

`bun run dev` does **not** mean Next.js is running on Bun. It means Bun launched the script; Next's CLI still runs on Node. To actually use Bun's runtime you need the `--bun` flag:

```bash
bun --bun run dev
```

…or bake it into your scripts:

```jsonc
"scripts": {
  "dev":   "bun --bun next dev",
  "build": "bun --bun next build",
  "start": "bun --bun next start"
}
```

Vercel added native Bun runtime support (set `"bunVersion": "1.x"` in `vercel.json`), and Next.js works with it, though it shipped as a public beta and edge-runtime behavior around request interception is where differences show up first.

**My recommendation while learning:** use **bun or pnpm as your package manager**, but keep **Node as the runtime**. You're here to learn Next.js, and you do not want to spend a session working out whether a bug is yours, Next's, or a runtime compatibility gap. Revisit the runtime question after Session 14.

**Ask your tutor:** _"Explain the difference between using bun to install packages and using bun as the runtime for Next.js. What specifically could break in the second case?"_

## 2. Pin your version

```bash
# pnpm
pnpm view next version         # current stable
pnpm view next dist-tags       # latest / canary / preview / lts lines

# bun
bun info next version
bun info next                  # read dist-tags from the output

node -v                        # must be >= 20.9
```

Write the exact version at the top of your `NOTES.md`, and put it in every prompt you write.

**Context as of this document:** the 16.x line is current. 16.0 shipped Oct 2025, 16.1 Dec 2025, 16.2 Mar 2026, and 16.3 was in public preview as of late June 2026 — check whether it has gone stable, since it changes the navigation story (see Session 14). Next.js now also runs formal LTS lines (an Active LTS and a Maintenance LTS) with scheduled security releases, so "latest" and "what you should build on" aren't always the same thing. Ask your tutor to explain the difference before you choose.

## 3. Feed your AI the real docs

This is the single highest-leverage trick in this document:

- **Append `.md` to any docs URL** — `nextjs.org/docs/app/getting-started/proxy.md` returns clean markdown. Paste that into your chat instead of letting the model recall from memory.
- **`nextjs.org/docs/llms.txt`** is a machine-readable index of the whole documentation set.
- **Next.js DevTools MCP** — an official MCP server that gives your AI live context on your app: routing, caching and rendering behavior, unified browser + server logs, real stack traces, and (since 16.1) a `get_routes` tool that maps your route tree. Set it up now; ask your tutor to walk you through it.

**Standing instruction to your tutor:** _"Before explaining any Next.js 16 API, fetch the current doc page as markdown. If your memory conflicts with the doc, the doc wins and you say so out loud."_

## 4. Create the project

```bash
# pnpm
pnpm create next-app@latest nextlab

# bun
bun create next-app@latest nextlab
```

Read every prompt it asks you. For each option, before answering, ask your tutor: _"what does this choice actually change in the generated project, and what would I have to do by hand if I said no?"_

The scaffolder detects which tool you invoked it with and installs accordingly — confirm it by checking that you have exactly one lockfile (`pnpm-lock.yaml` **or** `bun.lock`, never both). If a stray `package-lock.json` appears, delete it and reinstall.

Then, before writing a single line of your own:

```bash
# pnpm
pnpm dev        # read the terminal output
pnpm build      # read the build output carefully
pnpm start

# bun
bun run dev
bun run build
bun run start
```

**First real exercise:** the build output labels every route with a symbol. Ask your tutor to explain each symbol, then predict what each route in your fresh app will be labeled _before_ looking. This is your first `prove it`.

## 5. What you're building

**NextLab** — a small app with two halves:

- **`/lab/*`** — one route per concept, each demonstrating exactly one thing in isolation, with a short note on the page explaining what it shows. This is your textbook, and later, your reference boilerplate.
- **`/app`** — a tiny real feature (notes with sign-in) that forces the concepts to work together, because concepts in isolation always look easier than they are.

Everything below builds one or the other.

---

# PART 2 — THE CONCEPT INVENTORY

Every concept worth knowing in Next.js 16. Tick these off as you hit L2/L3. **Core** = you must reach L3. **Peripheral** = L2 is fine.

### A. Rendering model — Core

- [ ] Server Components (the default) — what "runs on the server" actually means
- [ ] Client Components and `"use client"` as a **boundary marker**, not a file label
- [ ] What can and cannot cross the boundary (serialization; why functions fail)
- [ ] Passing Server Components as `children` into Client Components (the composition escape hatch)
- [ ] Hydration — and what a hydration mismatch is
- [ ] Static vs dynamic rendering, and how Next decides
- [ ] Streaming and Partial Prerendering (static shell + dynamic holes)

### B. Routing — Core

- [ ] File conventions: `page` · `layout` · `template` · `loading` · `error` · `not-found` · `default` · `route`
- [ ] Nested layouts and why layouts don't re-render on navigation
- [ ] `layout` vs `template` (state preservation vs reset)
- [ ] Dynamic segments `[id]`, catch-all `[...slug]`, optional catch-all `[[...slug]]`
- [ ] Route groups `(marketing)` — organization without URL impact
- [ ] Private folders `_components`, colocation rules
- [ ] Parallel routes `@slot` — **and the 16 change: every slot now requires an explicit `default.js` or the build fails**
- [ ] Intercepting routes `(.)` `(..)` `(...)` — the modal-on-navigation pattern
- [ ] Route handlers (`route.ts`), `NextRequest` / `NextResponse`
- [ ] `generateStaticParams` for pre-rendering dynamic routes

### C. Navigation — Core

- [ ] `<Link>` and prefetching behavior
- [ ] `useRouter`, `usePathname`, `useSearchParams`
- [ ] `redirect()` vs `permanentRedirect()` vs `router.push()`
- [ ] `notFound()`
- [ ] **Layout deduplication** — shared layouts downloaded once, not once per link (new in 16)
- [ ] **Incremental prefetching** — only uncached parts fetched; viewport-exit cancels requests

### D. Data fetching — Core

- [ ] `async` Server Components — `await` directly in a component
- [ ] **Async request APIs (breaking in 15/16):** `await params`, `await searchParams`, `await cookies()`, `await headers()`, `await draftMode()`
- [ ] Request memoization — same fetch, same render pass, one request
- [ ] Sequential vs parallel data fetching, and the waterfall you'll accidentally create
- [ ] Fetching in layouts vs pages (and why layouts can't read `searchParams`)
- [ ] Where a Client Component gets data from (props, route handler, or `use()`)

### E. Caching — Core _(the hardest module; budget two sessions)_

- [ ] **Dynamic by default** — 16 inverted the old implicit-caching model
- [ ] `cacheComponents: true` in `next.config.ts`
- [ ] The `"use cache"` directive on a function, component, or page
- [ ] How cache keys are derived — and how personalized data leaks if you get this wrong
- [ ] `cacheLife` profiles (`max`, `hours`, `days`, custom)
- [ ] `cacheTag` for tagging cached entries
- [ ] `revalidateTag(tag, profile)` — **second argument now required** for stale-while-revalidate
- [ ] `updateTag(tag)` — Server Actions only; read-your-writes (user sees their change immediately)
- [ ] `refresh()` — Server Actions only; refreshes **uncached** data without touching the cache
- [ ] `router.refresh()` on the client, and how it differs from `refresh()`
- [ ] `revalidatePath()`
- [ ] ISR via `generateStaticParams` + revalidation
- [ ] Dead API you'll see in old tutorials: `unstable_cache`, `experimental.ppr`, `export const experimental_ppr`, bare `revalidateTag(tag)`

### F. Mutations — Core

- [ ] Server Actions (`"use server"`) — what they compile to, and why they're POST-only
- [ ] Actions in forms vs called from event handlers
- [ ] `useActionState` for pending/error/result state
- [ ] `useFormStatus`
- [ ] `useOptimistic`
- [ ] Progressive enhancement (form works with JS disabled)
- [ ] Validating input server-side even when the client validated it
- [ ] Invalidating the right cache after a write (`updateTag` vs `revalidateTag` vs `refresh`)
- [ ] Redirecting from inside an action

### G. `proxy.ts` — Core

- [ ] `proxy.ts` replaces `middleware.ts`; the exported function is `proxy` (`middleware.ts` still exists for Edge but is deprecated)
- [ ] It runs on the **Node.js runtime** — a single predictable runtime
- [ ] Matchers, and why a bad matcher runs your proxy on every static asset
- [ ] Redirects, rewrites, setting request/response headers
- [ ] **Why this is not your security boundary** — the real check belongs where the data is read
- [ ] Reading and setting cookies here vs in a Server Action

### H. UI states — Core

- [ ] `loading.tsx` and what it's sugar for
- [ ] Manual `<Suspense>` for granular streaming
- [ ] Suspense boundary placement — the difference between one spinner and a page that fills in
- [ ] `error.tsx` — must be a Client Component; the `reset()` function
- [ ] `global-error.tsx`
- [ ] `not-found.tsx` and `notFound()`
- [ ] Skeletons that don't cause layout shift

### I. Styling — Peripheral

- [ ] Global CSS and where it's allowed
- [ ] CSS Modules
- [ ] Tailwind (included in the default template)
- [ ] `next/font` — self-hosting, zero layout shift, subsetting
- [ ] Dark mode without a flash on first paint
- [ ] Sass (now on the modern API via sass-loader v16)

### J. Assets & metadata — Core-ish

- [ ] `next/image` — and **the 16 default changes**: `remotePatterns` (not `domains`), `minimumCacheTTL` now 4h, `qualities` now `[75]`, `16` dropped from `imageSizes`, local IP optimization blocked by default, redirects capped at 3, local `src` with query strings needs `localPatterns`
- [ ] `sizes`, `fill`, `priority`, and what LCP means
- [ ] `next/script` and loading strategies
- [ ] Static `metadata` export
- [ ] `generateMetadata` (dynamic, async)
- [ ] File conventions: `opengraph-image`, `icon`, `apple-icon`, `sitemap.ts`, `robots.ts`, `manifest.ts`
- [ ] `generateImageMetadata` — note `params` and `id` are now async/`Promise`

### K. React 19.2 features — Peripheral but fun

- [ ] `use()` for unwrapping promises and context in components
- [ ] **View Transitions** — animating elements across navigation
- [ ] **`useEffectEvent`** — pulling non-reactive logic out of Effects
- [ ] **`<Activity>`** — hiding UI while preserving state
- [ ] **React Compiler** — stable in 16, opt-in via `reactCompiler: true`; automatic memoization, slower builds
- [ ] `useTransition`, `startTransition`

### L. Configuration & environment — Core

- [ ] `next.config.ts` (TypeScript config, plus native TS stripping behind a flag)
- [ ] `turbopack` config now **top-level**, no longer under `experimental`
- [ ] `.env` files, env precedence, `NEXT_PUBLIC_` inlining at build time
- [ ] **Gone in 16:** `serverRuntimeConfig` / `publicRuntimeConfig` — use env vars
- [ ] `serverExternalPackages`
- [ ] Path aliases

### M. TypeScript — Core

- [ ] Typing `params` and `searchParams` as promises
- [ ] Typed route params and generated types in `.next/types`
- [ ] Typing Server Action returns as discriminated unions instead of throwing
- [ ] Minimum TypeScript 5.1

### N. Tooling & DX — Peripheral

- [ ] Your package manager: lockfile, `packageManager` field, why mixing tools corrupts a tree
- [ ] pnpm's strict `node_modules` vs a flat/hoisted layout — what phantom dependencies are
- [ ] bun as package manager vs bun as runtime, and the `--bun` flag that separates them
- [ ] **Turbopack is the default bundler** — `--webpack` to opt out
- [ ] Turbopack filesystem caching (persistent dev cache since 16.1)
- [ ] **`next lint` is removed** — run ESLint (flat config) or Biome directly; `next build` no longer lints
- [ ] `next dev --inspect` (16.1) and `next start --inspect` (16.2) for the Node debugger
- [ ] Bundle Analyzer for Turbopack (experimental, 16.1)
- [ ] Reading dev request logs: Compile time vs Render time
- [ ] Reading the build output: per-step timings and route symbols
- [ ] The error overlay (redesigned in 16.2)
- [ ] DevTools MCP for AI-assisted debugging
- [ ] Build Adapters API (alpha) — awareness only

### O. Deploy — Peripheral

- [ ] `next build` vs `next start` vs `output: 'standalone'`
- [ ] Vercel vs self-hosted Node vs Docker — what changes
- [ ] Node 20.9+ requirement; browser targets (Chrome/Edge/Firefox 111+, Safari 16.4+)

### P. Removed in 16 — know these so old tutorials don't confuse you

- [ ] AMP support — gone
- [ ] `next lint` — gone
- [ ] `serverRuntimeConfig` / `publicRuntimeConfig` — gone
- [ ] `experimental.dynamicIO` → renamed `cacheComponents`
- [ ] `experimental.ppr` and route-level `experimental_ppr` — gone, folded into Cache Components
- [ ] Sync `params` / `searchParams` / `cookies()` / `headers()` / `draftMode()` — gone
- [ ] Automatic `scroll-behavior: smooth` — now opt-in via `data-scroll-behavior="smooth"`
- [ ] `next/legacy/image`, `images.domains` — deprecated

---

# PART 3 — THE SESSIONS

Each session: paste the **start prompt**, work the five-step loop for each concept, run the **experiment**, then answer the **mastery check** before moving on.

---

## Session 1 — The shape of the thing

**Concepts:** project structure · dev/build/start · Turbopack · route symbols in build output · reading dev logs (compile vs render) · Node/TS requirements

**Build:** nothing yet. Explore and predict.

**Start prompt:**

> Session 1. Before any code: explain what `next dev`, `next build`, and `next start` each actually do, and how Turbopack fits in. Then teach me how to read the build output — every symbol and every timing line. Then quiz me, and make me predict the labels for my current routes before we run it.

**Experiment (`prove it`):** predict each route's symbol, then run `pnpm build` (or `bun run build`).

**Mastery check:** Why can `next dev` and `next build` now run at the same time? What does a route being marked dynamic actually cost at request time?

---

## Session 2 — Server vs Client

**Concepts:** Server Components · `"use client"` as a boundary · serialization · composition pattern · hydration

**Build:** `/lab/boundary` — a server page rendering a client counter, with a deliberate serialization error you fix.

**Start prompt:**

> Session 2. Teach me the server/client boundary in Next.js 16 App Router. I want to understand `"use client"` as a boundary marker rather than a per-file label, what can cross it, and the pattern for putting a Server Component inside a Client Component. Break the serialization rule on purpose so I see the error. Check my understanding before we build anything.

**Experiment:** try passing a function as a prop across the boundary. Read the error. Then fix it two different ways.

**Mastery check:** If `"use client"` is on a component that imports three others, which of them are client components? Why does putting `"use client"` in a root layout defeat the whole architecture?

---

## Session 3 — Routing fundamentals

**Concepts:** `page` / `layout` / `template` · nested layouts · route groups · dynamic + catch-all segments · `Link` · `usePathname`

**Build:** `/lab` index, a `(marketing)` group, `/lab/dynamic/[id]`, `/lab/catchall/[...slug]`.

**Start prompt:**

> Session 3. Teach me App Router file conventions: `page`, `layout`, `template`, and how nesting works. Explain `layout` vs `template` with a case where the difference is visible. Then route groups and dynamic segments. Check me, then plan the files before writing.

**Experiment:** put a counter in a layout, navigate between sibling routes. Does it reset? Now move it to `template`. Predict first.

**Mastery check:** Why doesn't a layout re-render on navigation between its children? When would that be a bug rather than a feature?

---

## Session 4 — Advanced routing

**Concepts:** parallel routes + required `default.js` · intercepting routes · route handlers

**Build:** `/lab/parallel` with two slots; `/lab/photos` with an intercepted modal; `/api/ping` route handler.

**Start prompt:**

> Session 4. Teach me parallel routes and intercepting routes. Note that Next.js 16 requires an explicit `default.js` for every parallel slot or the build fails — explain what `default.js` is for and what "unmatched slot" means. Then intercepting-route conventions and the modal pattern. Check me before we build.

**Experiment:** delete a `default.js` and run `next build`. Read the failure. That error message is the lesson.

**Mastery check:** What does the URL look like when a modal is open via interception, and what happens on hard refresh? Why is that the desired behavior?

---

## Session 5 — Data fetching

**Concepts:** async Server Components · `await params` / `searchParams` / `cookies()` / `headers()` · request memoization · waterfalls

**Build:** `/lab/fetch` (sequential vs parallel, side by side with timings).

**Start prompt:**

> Session 5. Teach me data fetching in Server Components, including the async request APIs that became breaking changes — `await params`, `await searchParams`, `await cookies()`, `await headers()`. Explain request memoization, and show me how a waterfall forms. Quiz me on why these APIs became async before we build.

**Experiment:** fetch two things sequentially, time it. Refactor to `Promise.all`. Predict the delta before measuring.

**Mastery check:** Why did `params` become a promise? What does that have to do with streaming?

---

## Session 6 — Loading, streaming, errors

**Concepts:** `loading.tsx` · Suspense placement · `error.tsx` + `reset` · `global-error` · `not-found`

**Build:** `/lab/streaming` with staggered Suspense boundaries; `/lab/error` with a deliberate throw.

**Start prompt:**

> Session 6. Teach me the loading and error surface: `loading.tsx`, manual Suspense, `error.tsx` (and why it must be a Client Component), `global-error.tsx`, and `not-found`. I want to see how Suspense boundary placement changes what the user sees. Check me first.

**Experiment:** one Suspense around everything vs. three nested boundaries with different artificial delays. Watch the difference in the browser.

**Mastery check:** Why must `error.tsx` be a Client Component? What does `reset()` actually retry?

---

## Session 7 — Caching I: the new model

**Concepts:** dynamic by default · `cacheComponents` · `"use cache"` · cache keys · `cacheLife` · `cacheTag` · PPR

**This is the session where old tutorials will actively hurt you.** Make your tutor fetch the current docs as markdown.

**Build:** `/lab/cache` — same data rendered cached and uncached, side by side, with visible timestamps.

**Start prompt:**

> Session 7. Teach me Cache Components in Next.js 16 from scratch — assume everything I've read about Next.js caching is from version 14 and now wrong. Cover: why 16 is dynamic by default, the `cacheComponents` flag, the `"use cache"` directive, how cache keys are generated, `cacheLife` profiles, and `cacheTag`. Fetch the current docs as markdown first. Then explain Partial Prerendering: what's the static shell, what's a dynamic hole. Quiz me hard before we write anything.

**Experiment (`prove it`):** render a timestamp in a cached component and an uncached one. Predict what each shows on reload — in dev, and then in a production build. They differ. Understand why before moving on.

**Mastery check:** If a cached function takes a user ID, what makes it safe or unsafe? Describe exactly how one user could see another user's data.

---

## Session 8 — Caching II: invalidation

**Concepts:** `revalidateTag(tag, profile)` · `updateTag` · `refresh` · `router.refresh` · `revalidatePath` · ISR · `generateStaticParams`

**Build:** `/lab/invalidate` with three buttons, one per invalidation API, and an observable difference between them.

**Start prompt:**

> Session 8. Teach me invalidation in Next.js 16: `revalidateTag` (now requiring a `cacheLife` profile as a second argument), `updateTag` for read-your-writes in Server Actions, `refresh` for uncached data, `router.refresh` on the client, and `revalidatePath`. I want a decision table: given a situation, which one do I reach for and why. Check me, then plan the lab route.

**Experiment:** mutate data, then invalidate with each API in turn. Predict whether the user sees the change immediately, eventually, or not at all.

**Mastery check:** A user updates their profile and expects to see it instantly. Which API, and what goes wrong with each of the others?

---

## Session 9 — Mutations

**Concepts:** Server Actions · validation · `useActionState` · `useFormStatus` · `useOptimistic` · progressive enhancement · post-write invalidation

**Build:** the notes feature in `/app` — create, edit, delete.

**Start prompt:**

> Session 9. Teach me Server Actions: what `"use server"` actually does, what gets sent over the wire, why they're POST-only, and how they differ from route handlers. Then `useActionState`, `useFormStatus`, and `useOptimistic`. Explain progressive enhancement and why validation must happen server-side even when the client validated. Check me, then plan the notes feature before writing any of it.

**Experiment:** disable JavaScript in devtools and submit the form. It should still work. Then re-enable and add optimistic UI.

**Mastery check:** What stops someone from calling your Server Action directly with a hand-crafted request? What must your action do about that?

---

## Session 10 — `proxy.ts` and sessions

**Concepts:** `proxy.ts` · matchers · redirects/rewrites/headers · cookies · why proxy isn't the security boundary

**Build:** cookie-based sign-in (deliberately simple — you're learning the mechanism, not shipping auth), plus a protected route.

**Start prompt:**

> Session 10. Teach me `proxy.ts`: what replaced `middleware.ts` and why, that it runs on the Node.js runtime, how matchers work, and what it's good and bad at. Then explain clearly why route protection in the proxy alone is a vulnerability, and where the real check belongs. Keep the auth implementation minimal — I'm learning the mechanism, not shipping a product. Check me before we build.

**Experiment:** protect a route in `proxy.ts` only, then reach the underlying data another way — a Server Action, or the route handler behind it. Feel the hole.

**Mastery check:** Why is `proxy.ts` the wrong place for a database lookup? What's the correct division of labor?

---

## Session 11 — Optimization and metadata

**Concepts:** `next/image` (new 16 defaults) · `next/font` · `next/script` · `metadata` / `generateMetadata` · `opengraph-image` · `sitemap.ts` · `robots.ts` · bundle analyzer

**Build:** `/lab/images` gallery, dynamic OG image, sitemap, per-route metadata.

**Start prompt:**

> Session 11. Teach me `next/image`, and be explicit about what changed in Next.js 16: `remotePatterns` replacing `domains`, `minimumCacheTTL` defaulting to 4 hours, `qualities` defaulting to `[75]`, `imageSizes` dropping 16, local IP optimization blocked, redirect cap, and `localPatterns` for local images with query strings. Explain `sizes` and `fill` properly — that's where I'll get it wrong. Then `next/font`, the Metadata API, and the file conventions for OG images, sitemap, and robots. Check me between each.

**Experiment:** load a page with a raw `<img>`, measure. Swap to `next/image` with correct `sizes`, measure again.

**Mastery check:** What does `sizes` actually control, and what happens if it's wrong? Why did `qualities` default to a single value in 16?

---

## Session 12 — React 19.2 and client-side depth

**Concepts:** `use()` · View Transitions · `useEffectEvent` · `<Activity>` · React Compiler · context providers in the App Router

**Build:** `/lab/react19` — one demo per feature.

**Start prompt:**

> Session 12. Teach me the React 19.2 features Next.js 16 ships: View Transitions, `useEffectEvent`, and `<Activity>`, plus `use()`. Then the React Compiler — it's stable in 16 but opt-in; explain what it does, why it isn't on by default, and what it costs in build time. Show me how to put a context provider in the App Router without turning the whole tree into client components. Check me between each concept.

**Experiment:** install the compiler plugin (`pnpm add -D babel-plugin-react-compiler` / `bun add -d babel-plugin-react-compiler`), turn on `reactCompiler: true`, and time the build before and after. Find a component where manual memoization is now unnecessary.

**Mastery check:** What problem does `useEffectEvent` solve that `useCallback` doesn't? What does `<Activity>` preserve that unmounting destroys?

---

## Session 13 — Config, types, and a little testing

**Concepts:** `next.config.ts` · top-level `turbopack` config · env vars and `NEXT_PUBLIC_` · `serverExternalPackages` · typing async params · basic tests

**Build:** typed env module, a couple of tests over your notes logic.

**Start prompt:**

> Session 13. Walk me through `next.config.ts` option by option for the options I'm actually using, noting that the `turbopack` key moved out of `experimental` and that `serverRuntimeConfig`/`publicRuntimeConfig` were removed. Explain how `NEXT_PUBLIC_` values get inlined at build time and why that matters for secrets. Then help me type my async `params` and `searchParams` properly. Check me on the build-time inlining specifically — I suspect I don't really get it.

**Experiment:** put a fake secret in `NEXT_PUBLIC_TEST`, build, then grep the `.next` output for it. Watch it show up in a client bundle.

**Mastery check:** When is an env var read — build time or request time — and how does that change your answer for a Docker image?

---

## Session 14 — Build, deploy, and what's next

**Concepts:** `next build` output · `output: 'standalone'` · deploy targets · Instant Navigations (16.3)

**Start prompt:**

> Session 14. Teach me what `next build` actually produces, what `output: 'standalone'` changes, and what differs between deploying to Vercel, a plain Node server, and Docker — including how my lockfile and `packageManager` field affect the install step in each. If I want to revisit running on the Bun runtime, now's the time: explain `"bunVersion"` on Vercel and what to test first. Then check whether Next.js 16.3 is stable yet — if so, teach me Instant Navigations: the Stream / Cache / Block choice per route, `export const instant = false`, Partial Prefetching, and the Instant Insights dev panel. Fetch current docs before explaining.

**Mastery check:** For each route in your app, say which of Stream / Cache / Block is right, and defend it.

---

## Capstone — Teach it back

Two exercises, both harder than they sound:

1. **Write `CONCEPTS.md` yourself, without AI.** One paragraph per concept in Part 2, in your own words, including one thing that breaks when it's used wrong. Then have the tutor grade it and mark every place you're actually fuzzy.
2. **Predict, then verify.** For every route in NextLab, write down: static or dynamic, what's cached, what invalidates it, and what streams. Then run the build and check. Every wrong prediction is a concept to revisit.

---

# PART 4 — WHERE YOUR AI WILL BE WRONG

Version drift is the main failure mode. Models have absorbed far more Next 13–15 content than Next 16 content. Keep this table next to you:

| Model will likely produce                        | Correct for 16.x                                                |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `middleware.ts` / `export function middleware()` | `proxy.ts` / `export default function proxy()`                  |
| Implicit `fetch` caching; cached by default      | Dynamic by default; caching opt-in via `"use cache"`            |
| `unstable_cache`                                 | `"use cache"` + `cacheLife` + `cacheTag`                        |
| `revalidateTag('tag')`                           | `revalidateTag('tag', 'max')`, or `updateTag('tag')` in actions |
| `experimental.ppr` / `experimental_ppr`          | `cacheComponents: true`                                         |
| `experimental.dynamicIO`                         | `cacheComponents`                                               |
| `const { id } = params`                          | `const { id } = await params`                                   |
| `cookies()` / `headers()` used synchronously     | `await cookies()` / `await headers()`                           |
| `next lint` in scripts or CI                     | `eslint .` (flat config) or `biome check .`                     |
| `images.domains`                                 | `images.remotePatterns`                                         |
| webpack config assumptions                       | Turbopack is the default                                        |
| `serverRuntimeConfig`                            | env vars                                                        |
| Parallel route without `default.js`              | `default.js` is now mandatory                                   |

**When output looks off, say:** _"That looks like Next 14/15. Fetch the current doc page as markdown and correct yourself."_

---

# PART 5 — TRACKER

```
Session  0  ☐  Ground truth: version pinned, docs-as-markdown, MCP, project created
Session  1  ☐  Build output and route symbols
Session  2  ☐  Server/client boundary
Session  3  ☐  Routing fundamentals
Session  4  ☐  Parallel + intercepting routes
Session  5  ☐  Data fetching + async request APIs
Session  6  ☐  Streaming, loading, errors
Session  7  ☐  Cache Components
Session  8  ☐  Invalidation
Session  9  ☐  Server Actions + notes feature
Session 10  ☐  proxy.ts + sessions
Session 11  ☐  Images, fonts, metadata
Session 12  ☐  React 19.2 + Compiler
Session 13  ☐  Config, env, types
Session 14  ☐  Build, deploy, Instant Navigations
Capstone    ☐  CONCEPTS.md written unaided + predictions verified
```

**Files to keep alongside this one:**

- `NOTES.md` — your own words, written after each session, before you close the laptop
- `BACKLOG.md` — everything you said `skip` to
- `CONCEPTS.md` — the capstone

**Later, when you want to turn this into something real,** the production concerns you deliberately skipped are: env validation, real auth, authorization at the data layer, rate limiting, structured logging, error tracking, security headers and CSP, a real test suite, CI, and migrations. Ask your tutor for that checklist when you get there — not before. Learning the framework and hardening an app are different jobs, and doing both at once is how people stall.

---

_Rule zero: if you can't explain it tomorrow, you didn't learn it today._
