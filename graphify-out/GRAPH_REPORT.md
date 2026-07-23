# Graph Report - Chrome Extension Digital wellbeing  (2026-07-23)

## Corpus Check
- 16 files · ~5,095 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 104 nodes · 110 edges · 12 communities (11 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c4c2cb87`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 17 edges
2. `getLocalDateStr()` - 5 edges
3. `compilerOptions` - 5 edges
4. `scripts` - 4 edges
5. `getFaviconUrl()` - 4 edges
6. `background` - 3 edges
7. `getDomain()` - 3 edges
8. `updateActiveTab()` - 3 edges
9. `incrementTimeSpent()` - 3 edges
10. `migrateOldStorageSchema()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `ActivityDetails()` --calls--> `formatSeconds()`  [EXTRACTED]
  src/ActivityDetails.tsx → src/utils/time.ts
- `ContentApp()` --calls--> `getFaviconUrl()`  [EXTRACTED]
  src/content/index.tsx → src/utils/favicon.ts

## Import Cycles
- None detected.

## Communities (12 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib (+11 more)

### Community 1 - "Community 1"
Cohesion: 0.14
Nodes (12): action, default_popup, background, service_worker, type, content_scripts, description, manifest_version (+4 more)

### Community 2 - "Community 2"
Cohesion: 0.18
Nodes (11): devDependencies, autoprefixer, @crxjs/vite-plugin, postcss, tailwindcss, @types/chrome, @types/react, @types/react-dom (+3 more)

### Community 3 - "Community 3"
Cohesion: 0.16
Nodes (11): ActivityDetails(), DomainMetrics, GlobalSettings, HOURS_LIST, listeners, MINUTES_LIST, SiteSettings, TimerModalState (+3 more)

### Community 4 - "Community 4"
Cohesion: 0.33
Nodes (10): checkAndEnforceLimit(), DomainMetrics, getDomain(), getLocalDateStr(), incrementTimesOpened(), incrementTimeSpent(), initialize(), migrateOldStorageSchema() (+2 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (14): dependencies, clsx, lucide-react, react, react-dom, tailwind-merge, name, private (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.29
Nodes (6): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, include

### Community 8 - "Community 8"
Cohesion: 0.60
Nodes (3): ContentApp(), root, getFaviconUrl()

## Knowledge Gaps
- **66 isolated node(s):** `manifest_version`, `name`, `version`, `description`, `permissions` (+61 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Community 2` to `Community 5`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `manifest_version`, `name`, `version` to the rest of the system?**
  _66 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._