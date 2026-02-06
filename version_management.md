# Version Management System

## Overview

The Family Location Tracker now uses a centralized version management system to prevent version inconsistencies across files. Version is defined once in [package.json](file:///c:/Users/holger.rabbach/.gemini/antigravity/scratch/family-location-tracker/package.json) and automatically propagated to all files.

---

## Quick Start

### Updating the Version

```bash
# Bump patch version (e.g., 2.8.9 → 2.8.10)
npm version patch

# Bump minor version (e.g., 2.8.9 → 2.9.0)
npm version minor

# Bump major version (e.g., 2.8.9 → 3.0.0)
npm version major

# Apply version to all files
npm run update-version
```

---

## How It Works

### Source of Truth

Version is defined in [package.json](file:///c:/Users/holger.rabbach/.gemini/antigravity/scratch/family-location-tracker/package.json):

```json
{
  "version": "2.8.9"
}
```

### Automated Updates

The [update-version.js](file:///c:/Users/holger.rabbach/.gemini/antigravity/scratch/family-location-tracker/update-version.js) script reads this version and updates:

#### [index.html](file:///c:/Users/holger.rabbach/.gemini/antigravity/scratch/family-location-tracker/index.html)
- Cache-busting query strings: `style.css?v=2.8.9`
- Version display tag: `<a>v2.8.9</a>`

#### [sw.js](file:///c:/Users/holger.rabbach/.gemini/antigravity/scratch/family-location-tracker/sw.js)
- Cache name: `family-tracker-v2.8.9`
- Precache asset URLs: `app.js?v=2.8.9`

---

## Version Patterns

The script recognizes these patterns:

| Pattern | Example | Usage |
|---------|---------|-------|
| `v=X.Y.Z` | `style.css?v=2.8.9` | Cache busting |
| `>vX.Y.Z<` | `>v2.8.9<` | Display tag |
| `family-tracker-vX.Y.Z` | `family-tracker-v2.8.9` | Cache name |

---

## Workflow

### Standard Release Process

1. **Make your changes** to the code
2. **Test thoroughly**
3. **Bump version**:
   ```bash
   npm version patch  # or minor/major
   ```
4. **Update files**:
   ```bash
   npm run update-version
   ```
5. **Verify changes**:
   ```bash
   git diff
   ```
6. **Commit and tag**:
   ```bash
   git add .
   git commit -m "Release v2.8.10"
   git push
   ```

---

## Benefits

✅ **Single source of truth** - Version defined once
✅ **No manual updates** - Automated propagation
✅ **Consistency guaranteed** - All files use same version
✅ **Proper cache invalidation** - Service worker cache updates correctly
✅ **Easy releases** - Simple npm commands

---

## Troubleshooting

### Script reports "No changes needed"

This means all files already have the correct version. This is normal if you're running the script multiple times.

### Version not updating in browser

1. Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Clear service worker cache in DevTools → Application → Storage
3. Verify service worker cache name changed in DevTools

### Pattern not recognized

If you add new files with version numbers, update [update-version.js](file:///c:/Users/holger.rabbach/.gemini/antigravity/scratch/family-location-tracker/update-version.js):

```javascript
const updates = [
    // ... existing entries ...
    {
        file: 'newfile.js',
        patterns: [
            { regex: /v=\d+\.\d+\.\d+/g, replacement: `v=${version}` }
        ]
    }
];
```

---

## Implementation Details

**Issue**: [Code Review #14](file:///C:/Users/holger.rabbach/.gemini/antigravity/brain/3693e04b-79d9-47d9-a644-b7b49a4068f9/code_review.md#L479)

**Priority**: Medium

**Files Modified**:
- [package.json](file:///c:/Users/holger.rabbach/.gemini/antigravity/scratch/family-location-tracker/package.json) - Added version and script
- [update-version.js](file:///c:/Users/holger.rabbach/.gemini/antigravity/scratch/family-location-tracker/update-version.js) - Created automation script
- [index.html](file:///c:/Users/holger.rabbach/.gemini/antigravity/scratch/family-location-tracker/index.html) - Updated to v2.8.9
- [sw.js](file:///c:/Users/holger.rabbach/.gemini/antigravity/scratch/family-location-tracker/sw.js) - Updated to v2.8.9

**Impact**: Eliminates version inconsistencies and simplifies release process.
