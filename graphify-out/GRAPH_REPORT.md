# Graph Report - Chrome Extension Digital wellbeing  (2026-06-14)

## Corpus Check
- 14 files · ~3,578 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 93 nodes · 95 edges · 11 communities (10 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2b714832`
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
2. `compilerOptions` - 5 edges
3. `scripts` - 4 edges
4. `getLocalDateStr()` - 4 edges
5. `background` - 3 edges
6. `getDomain()` - 3 edges
7. `updateActiveTab()` - 3 edges
8. `incrementTimeSpent()` - 3 edges
9. `migrateOldStorageSchema()` - 3 edges
10. `initialize()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `ActivityDetails()` --calls--> `formatSeconds()`  [EXTRACTED]
  src/ActivityDetails.tsx → src/utils/time.ts

## Import Cycles
- None detected.

## Communities (11 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib (+11 more)

### Community 1 - "Community 1"
Cohesion: 0.15
Nodes (11): action, default_popup, background, service_worker, type, content_scripts, description, manifest_version (+3 more)

### Community 2 - "Community 2"
Cohesion: 0.18
Nodes (11): devDependencies, autoprefixer, @crxjs/vite-plugin, postcss, tailwindcss, @types/chrome, @types/react, @types/react-dom (+3 more)

### Community 3 - "Community 3"
Cohesion: 0.23
Nodes (8): ActivityDetails(), DomainMetrics, GlobalSettings, listeners, SiteSettings, App(), formatSeconds(), getLast7Days()

### Community 4 - "Community 4"
Cohesion: 0.36
Nodes (9): DomainMetrics, getDomain(), getLocalDateStr(), incrementTimesOpened(), incrementTimeSpent(), initialize(), migrateOldStorageSchema(), SiteSettings (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, preview, type, version

### Community 6 - "Community 6"
Cohesion: 0.29
Nodes (6): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, include

### Community 7 - "Community 7"
Cohesion: 0.33
Nodes (6): dependencies, clsx, lucide-react, react, react-dom, tailwind-merge

## Knowledge Gaps
- **61 isolated node(s):** `manifest_version`, `name`, `version`, `description`, `permissions` (+56 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Community 2` to `Community 5`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 7` to `Community 5`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `manifest_version`, `name`, `version` to the rest of the system?**
  _61 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._