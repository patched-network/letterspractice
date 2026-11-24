# Juggling Animation - Known Issues

## Physics and Timing Issues

### 1. Inconsistent Juggling Speed Across Patterns

**Status**: 🔴 Critical Bug - Likely same root cause

**Symptoms**:
- Pattern `1`: Throws high, but gravity appears faster than realistic
- Pattern `3`: Normal speed renders realistically ✓ (this is our baseline)
- Pattern `5`: Renders well, but appears slowed (gravity weakened)
- Pattern `7`: Even slower appearance
- **All patterns (`1`, `3`, `5`, `7`, etc.) throw to the same height**

**Expected Behavior**:
- Higher siteswap values should throw higher
- Gravity should remain constant across all patterns
- Time in air should scale with throw height

**Observations**:
- Pattern `3` works correctly at normal speed
- Higher values (`5`, `7`) appear to have weakened gravity
- Lower values (`1`) appear to have strengthened gravity
- Same throw height for all patterns is incorrect

**Possible Root Causes**:
1. `beatDuration` scaling not accounting for throw height differences
2. Gravity constant being modified based on pattern value
3. Air time calculation incorrect for different throw heights
4. Velocity calculation not properly scaling with siteswap value

**Investigation Path**:
- Check `prepare.ts` throw height calculation (line 238)
- Verify `airTime` calculation for different toss values (line 194)
- Compare with sani.js reference implementation
- Check if `beatDuration` should scale with `siteswap.greatestValue`

### 2. Speed Toggle Behaves Like Fast-Forward

**Status**: 🟡 Medium Priority

**Symptoms**:
- Slow/Normal/Fast toggles change animation speed uniformly
- Acts like video fast-forward/slow-motion
- Does NOT adjust throw heights like sani.js demo

**Expected Behavior** (from sani.js):
- Slow: Higher throws, longer air time, same gravity
- Normal: Standard throws
- Fast: Lower throws, shorter air time, same gravity
- Gravity remains constant, throw velocities change

**Current Implementation**:
```typescript
const beatDurationMap = { slow: 500, normal: 300, fast: 150 };
```

**Should Be**:
- Adjust throw velocities (initial upward velocity)
- Keep gravity constant
- Recalculate trajectories for different heights

### 3. Pattern `030` - Hand/Ball Desynchronization

**Status**: 🔴 Critical Bug

**Symptoms**:
- Right hand "throws" as ball bottoms out on the left side
- Left hand "throws" as ball bottoms out on the right side
- Hand animation and ball trajectory are out of phase

**Expected Behavior**:
- Hands should catch when ball arrives
- Hands should throw at start of ball trajectory
- Catch animation should align with ball position

**Possible Root Causes**:
1. Zero-value tosses (the `0` in `030`) breaking timing
2. Hand path extraction misaligned for patterns with holds
3. Wait animation timing incorrect
4. Ball initial delays not matching hand timing

**Investigation Path**:
- Check how `toss.value === 0` is handled in `prepare.ts` (line 182)
- Verify `wait` animation timing
- Compare ball initial delays with hand path timings
- Test other patterns with zeros: `40`, `50`, `330`

## Coordinate Mapping Issues

### 4. Shoulder Gap Affects Vertical Coordinates

**Status**: 🟡 Medium Priority

**Symptoms**:
- Letter shoulder width dramatically affects calculated paths
- Vertical coordinates change when only horizontal should be affected
- Different letters (different shoulder gaps) show different throw heights

**Expected Behavior**:
- Shoulder gap should only affect horizontal stage width
- Vertical dimensions should remain independent
- Throw heights should be consistent regardless of letter shape

**Current Implementation** (`coordinate-mapping.ts`):
```typescript
const shoulderDistance = Math.abs(rightShoulder.x - leftShoulder.x);
const stageWidth = shoulderDistance * 1.5;
const stageHeight = letterHeight * 1.2;
```

**Issue**:
- Mapping likely couples width and height scaling
- Need to verify `mapSaniToLetter()` keeps axes independent

**Investigation Path**:
- Review coordinate mapping in `coordinate-mapping.ts`
- Ensure X and Y scaling are independent
- Test with wide letter (W, M) vs narrow letter (I, l)

## Testing Checklist

To verify fixes, test these patterns with these letters:

**Patterns**:
- `1` - Single ball, low throw
- `3` - 3-ball cascade (baseline reference)
- `5` - 5-ball cascade, higher throws
- `7` - 7-ball cascade, very high throws
- `030` - Pattern with holds/zeros
- `441` - Pattern with synchronized throws

**Letters**:
- `A` - No descender, triangular
- `W` - Wide shoulders
- `I` - Narrow shoulders
- `M` - Very wide shoulders

**Speed Settings**:
- Slow (should increase throw height)
- Normal (reference)
- Fast (should decrease throw height)

## Priority Order

1. **Fix pattern speed inconsistency** (Issue #1) - Critical, affects all patterns
2. **Fix `030` desynchronization** (Issue #3) - Critical, breaks specific patterns
3. **Fix shoulder gap vertical coupling** (Issue #4) - Medium, affects different letter widths
4. **Implement proper speed control** (Issue #2) - Enhancement, improves UX

## Notes

- Issue #1 is likely the root cause of several symptoms
- Once #1 is fixed, #2 may become easier to implement correctly
- Issue #4 is a coordinate mapping problem, separate from physics
- Pattern `3` at normal speed is the reference "correct" implementation
