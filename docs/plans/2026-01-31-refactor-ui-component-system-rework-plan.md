---
title: "refactor: UI Component System Rework"
type: refactor
date: 2026-01-31
deepened: 2026-01-31
---

# refactor: UI Component System Rework

## Enhancement Summary

**Deepened on:** 2026-01-31
**Sections enhanced:** 8
**Research agents used:** best-practices-researcher, kieran-typescript-reviewer, performance-oracle, code-simplicity-reviewer, architecture-strategist, pattern-recognition-specialist, julik-frontend-races-reviewer

### Key Improvements

1. **Performance-optimised `n()` implementation** - Cache density ratio at module load instead of recalculating per call
2. **Simplified scope** - Removed YAGNI violations (5 unused components, 4 unused props, 2 unused plugins)
3. **Critical TypeScript fix** - Remove `as any` cast in CustomScrollView.tsx:103

### Critical Decisions Made

- **DO NOT** port new components (SelectorButton, SearchInput, CenteredMessage, Separator, ListItem) - no current usage
- **DO NOT** add onLongPress, icon props, ref forwarding, scrollability callback - no current usage
- **DO NOT** port Android plugins - no documented need
- **DO** focus solely on adding `n()` scaling to existing 12 components

---

## Overview

Rework the Spotify/Echo app's UI components to adopt the `n(x)` density normalization system used across the light-template, weather, passes, and beeper projects. This ensures consistent sizing across different screen densities.

## Problem Statement / Motivation

The current Echo app uses hardcoded style values throughout components, leading to:
- Inconsistent sizing across devices with different pixel densities
- Components that diverge from the established light-template patterns
- No density normalization system

## Proposed Solution (Simplified)

1. Add the `n(x)` scaling utility with performance-optimised caching
2. Update all 12 existing components to use `n()` for numeric style values
3. Update shared styles to use `n()`

**Removed from scope (YAGNI):**
- ~~Port 5 new components~~ - No current usage in codebase
- ~~Add onLongPress/icon/ref forwarding props~~ - No current usage
- ~~Port Android plugins~~ - No documented issue they solve

---

## Technical Approach

### Phase 1: Foundation - Add n(x) Scaling System

### Research Insights

**Performance Critical:** The original implementation recalculates on every call. `PixelRatio.get()` never changes during app lifecycle - cache it once.

**Best Practice:** Pre-compute the ratio at module load time for O(1) operation.

### shared/utils/scaling.ts

```typescript
import { PixelRatio } from "react-native";

/**
 * Target density based on design specifications (Light Phone III).
 * All designs are created at this density; we normalize to match the device.
 */
const TARGET_DENSITY = 2.55;

/**
 * Cached density normalization factor.
 * Computed ONCE at module load - PixelRatio never changes during app lifecycle.
 */
const DENSITY_NORMALIZATION = TARGET_DENSITY / PixelRatio.get();

/**
 * Normalizes a design-system size value to the current device density.
 * Use this for all hardcoded dimension values (fontSize, padding, margins, etc.)
 *
 * @param size - The size in design-system units (assumes 2.55 density baseline)
 * @returns Normalized size for the current device
 *
 * @example
 * fontSize: n(16),
 * padding: n(12),
 */
export const n = (size: number): number => size * DENSITY_NORMALIZATION;

/**
 * Exposed for debugging/testing only.
 */
export const getDensityNormalization = (): number => DENSITY_NORMALIZATION;
```

**Why this matters:**
- Eliminates ~500-750 redundant `PixelRatio.get()` calls at startup
- Reduces each `n()` call from ~3-5 operations to 1 multiplication

### shared/utils/index.ts

Add: `export { n, getDensityNormalization } from "./scaling";`

---

### Phase 2: Update Existing Components

Update all components in `shared/components/` to use `n()`:

| Component | Changes Required |
|-----------|------------------|
| `StyledText.tsx` | Add `n()` to fontSize, add `flexShrink: 1` |
| `StyledButton.tsx` | Add `n()` to all dimensions |
| `HapticPressable.tsx` | No changes needed (no numeric styles) |
| `Header.tsx` | Add `n()` to all dimensions, extract inline styles to StyleSheet |
| `ContentContainer.tsx` | Add `n()` to padding/gaps |
| `CustomScrollView.tsx` | Add `n()` to scroll indicator dimensions, **fix `as any` cast on line 103** |
| `Navbar.tsx` | Add `n()` to all dimensions |
| `ToggleSwitch.tsx` | Add `n()` to all dimensions |
| `MediaListItem.tsx` | Add `n()` to all dimensions |
| `TrackListItem.tsx` | Add `n()` to all dimensions |
| `FallbackImage.tsx` | Add `n()` to dimensions |
| `ListFooter.tsx` | Add `n()` to dimensions |

### Research Insights

**TypeScript Critical Fix:** `/Users/vandam/Developer/spotify/shared/components/CustomScrollView.tsx` line 103 has:
```typescript
transform: [{ translateY: scrollIndicatorPosition as any }],
```

This `as any` must be removed. The `Animated.Value` or `Animated.AnimatedInterpolation` is correctly typed for transforms - no cast needed.

**Performance:** Extract inline styles from Header.tsx (4 repeated blocks at lines 47-52, 64-70, 88-94, 105-111) to StyleSheet:
```typescript
const styles = StyleSheet.create({
  iconContainer: {
    width: n(32),
    height: n(32),
    alignItems: "center",
    paddingTop: n(6),
  },
});
```

---

### Phase 3: Update Shared Styles

Update `/Users/vandam/Developer/spotify/shared/styles/detailScreen.ts` to use `n()` for all values.

---

## Acceptance Criteria

### Functional Requirements

- [x] All 12 components use `n()` for numeric style values
- [x] `as any` cast removed from CustomScrollView.tsx
- [x] Inline styles extracted to StyleSheet in Header.tsx
- [x] Shared styles updated

### Non-Functional Requirements

- [ ] No visual regression on existing screens
- [ ] Consistent sizing across different device densities
- [ ] All existing functionality preserved

### Quality Gates

- [ ] App builds successfully with `bunx expo run:android`
- [ ] All screens render without errors
- [x] TypeScript compiles without errors (no `any` casts)

---

## MVP Implementation Checklist

### 1. shared/utils/scaling.ts (NEW)

```typescript
import { PixelRatio } from "react-native";

const TARGET_DENSITY = 2.55;
const DENSITY_NORMALIZATION = TARGET_DENSITY / PixelRatio.get();

export const n = (size: number): number => size * DENSITY_NORMALIZATION;
export const getDensityNormalization = (): number => DENSITY_NORMALIZATION;
```

### 2. shared/utils/index.ts

Add: `export { n, getDensityNormalization } from "./scaling";`

### 3. shared/components/StyledText.tsx

- Add `import { n } from "@/shared/utils";`
- Update fontSize to use `n()`
- Add `flexShrink: 1` to base text style

### 4. shared/components/StyledButton.tsx

- Add `import { n } from "@/shared/utils";`
- Update fontSize: `n(30)`

### 5. shared/components/Header.tsx

- Add `import { n } from "@/shared/utils";`
- Extract 4 repeated inline style blocks to StyleSheet
- Update all dimensions:
  - Icon sizes: `n(28)`
  - Button areas: `n(32)` x `n(32)`
  - Padding: `n(22)`, `n(23)`
  - Title fontSize: `n(20)`

### 6. shared/components/ContentContainer.tsx

- Add `import { n } from "@/shared/utils";`
- Update padding/gaps:
  - `paddingHorizontal: n(37)`
  - `paddingTop: n(14)`
  - `gap: n(47)`

### 7. shared/components/CustomScrollView.tsx

- Add `import { n } from "@/shared/utils";`
- **Remove `as any` cast on line 103**
- Update scroll indicator dimensions to use `n()`

### 8. shared/components/Navbar.tsx

- Add `import { n } from "@/shared/utils";`
- Update dimensions:
  - Icon sizes: `n(48)`
  - Padding: `n(11)` vertical, `n(20)` horizontal

### 9. shared/components/ToggleSwitch.tsx

- Add `import { n } from "@/shared/utils";`
- Update all dimensions to use `n()`

### 10. shared/components/MediaListItem.tsx

- Add `import { n } from "@/shared/utils";`
- Update all dimensions to use `n()`

### 11. shared/components/TrackListItem.tsx

- Add `import { n } from "@/shared/utils";`
- Update all dimensions to use `n()`

### 12. shared/components/FallbackImage.tsx

- Add `import { n } from "@/shared/utils";`
- Update dimensions to use `n()`

### 13. shared/components/ListFooter.tsx

- Add `import { n } from "@/shared/utils";`
- Update dimensions to use `n()`

### 14. shared/styles/detailScreen.ts

- Add `import { n } from "@/shared/utils";`
- Update all values to use `n()`

---

## Removed from Scope (YAGNI Analysis)

The following items were removed based on code simplicity review:

| Item | Reason | Lines Avoided |
|------|--------|---------------|
| SelectorButton.tsx | No usage in codebase | ~50 |
| SearchInput.tsx | No usage (inline in search.tsx is sufficient) | ~40 |
| CenteredMessage.tsx | No usage in codebase | ~30 |
| Separator.tsx | Inline `<View style={{ height: 8 }} />` is simpler | ~20 |
| ListItem.tsx | Redundant with MediaListItem/TrackListItem | ~60 |
| onLongPress prop | 0 usages in codebase | ~15 |
| icon prop on StyledButton | 0 usages in codebase | ~20 |
| ref forwarding on CustomScrollView | 0 usages in codebase | ~20 |
| scrollability callback | 0 usages in codebase | ~15 |
| withAndroidTheme.js | No documented issue it solves | ~50 |
| withAndroidConfigChanges.js | No documented issue it solves | ~30 |

**Total lines avoided: ~350**

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Visual regression | Medium | Medium | Test each component after update |
| TypeScript errors | Low | Low | Fix incrementally |
| Performance regression | Low | Low | Density ratio is cached at module load |

---

## Future Considerations (Not in Scope)

These improvements were identified but deferred for future work:

1. **Theme Token System** - Replace 40+ inline `invertColors ? X : Y` ternaries with centralised theme tokens
2. **Split SettingsContext** - The 295-line context violates SRP; consider splitting into ThemeContext, HapticContext, UIPreferencesContext
3. **Dependency Inversion** - shared/components imports from features/settings; consider inverting this dependency

---

## References & Research

### Internal References

- Current components: `/Users/vandam/Developer/spotify/shared/components/`
- Light template: `/Users/vandam/Developer/light-template/`
- Weather project: `/Users/vandam/Developer/weather/`
- Passes project: `/Users/vandam/Developer/passes/`
- Beeper project: `/Users/vandam/Developer/beeper/`

### Key Source Files

- Scaling utility pattern: `/Users/vandam/Developer/weather/utils/scaling.ts`

### External References

- [React Native PixelRatio Docs](https://reactnative.dev/docs/pixelratio)
- [react-native-size-matters](https://github.com/nirsky/react-native-size-matters) - Alternative library (not needed for this use case)
