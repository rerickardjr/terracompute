# TerraCompute Changelog

## [Unreleased]

### Added
- **Error Handling**: Comprehensive try-catch blocks in all major functions with detailed error logging
- **Accessibility Features**:
  - ARIA labels and roles for interactive elements
  - Live region status indicators for real-time updates
  - Progress bar with proper `aria-valuenow` attributes
  - Focus states for all keyboard-navigable elements
  - Support for reduced motion preferences
  - Semantic HTML structure improvements
  - Color-independent status indicators (text + icons)
- **Security Improvements**:
  - Path traversal prevention in PowerShell server
  - Input validation for file paths
  - HTTP request logging with timestamps
  - Content-type mapping for all file types

### Changed
- **PowerShell Server (`serve.ps1`)**:
  - Removed hardcoded user path; now uses script directory
  - Added `$basePath` parameter for portability
  - Enhanced security with path validation
  - Improved error messaging and request logging
  - Added color-coded console output
  - Support for more file types (JSON, SVG, ICO, etc.)

- **JavaScript (`app.js`)**:
  - Added `logError()` utility function for consistent error reporting
  - All DOM operations wrapped in error handling
  - Added validation checks before accessing DOM elements
  - Documented magic numbers (e.g., carbon intensity thresholds, random walk bias)
  - Fixed cumulative export calculation to use proper time-step conversion (2s → 1/1800 hr)
  - Enhanced Chart.js initialization with error recovery

- **HTML (`index.html`)**:
  - Added meta description
  - Added ARIA labels and roles throughout
  - Added `role="list"` and `role="progressbar"` attributes
  - Added `aria-live="polite"` for status updates
  - Enhanced SVG accessibility with `aria-hidden="true"`
  - Added semantic section and article markers

- **CSS (`style.css`)**:
  - Added focus outlines for keyboard navigation
  - Added support for `prefers-contrast: more` media query
  - Added support for `prefers-reduced-motion: reduce` media query
  - Enhanced button disabled state styling
  - Improved button focus ring visibility

### Documentation
- Added detailed comments explaining energy balance calculations
- Added documentation for carbon intensity thresholds (280, 420 g/kWh)
- Added explanation of 0.48 random walk bias in carbon simulation
- Added time-step documentation for energy export calculations

### Technical Details

#### Error Handling Strategy
- Graceful degradation when DOM elements missing
- Try-catch blocks at function entry/exit points
- Console logging for debugging (development)
- Null checks before DOM element access

#### Accessibility Compliance
- WCAG 2.1 Level AA considerations
- Keyboard navigation support
- Screen reader optimization
- Color-independent status communication
- Motion sensitivity awareness

#### Security Improvements
- Prevents directory traversal attacks
- Validates file paths before serving
- Content-type validation
- Request logging for auditing

---

## Implementation Notes

### Energy Balance Calculation
The `timeStepHours` calculation converts the 2-second simulator tick to hours:
- 2 seconds = 2/3600 hours ≈ 0.00056 hours
- Energy exported = Power (MW) × Time (hours)
- This ensures accurate MWh accumulation over 24-hour periods

### Carbon Intensity Simulation
The grid carbon walk uses a bias of 0.48 instead of 0.5 to create upward pressure:
- Tests the scheduler's ability to handle peak stress scenarios
- Simulates realistic grid demand patterns
- Helps validate job-shedding algorithms

### Priority-Based Scheduling
Three job priority levels with different grid stress responses:
1. **Critical** (280+ g/kWh): Always runs (medical, safety, critical AI)
2. **Standard** (420+ g/kWh): Paused during high stress
3. **Low** (280+ g/kWh): Rescheduled during moderate+ stress
