# Nexora Design Guidelines

## Design Approach
**System:** Material Design with Linear-inspired refinements for a clean, professional productivity tool aesthetic. This application prioritizes clarity, efficiency, and trust - essential for interview preparation software.

**Key Principles:**
- Professional credibility through structured layouts
- Clear visual hierarchy for complex data (scores, feedback, analytics)
- Calm, focused interface that reduces interview anxiety
- Trust-building through polished, consistent design

## Typography
**Fonts:** Inter (primary), Roboto Mono (code/technical elements)
- Headings: 2xl to 4xl, font-semibold to font-bold
- Body: base to lg, font-normal to font-medium
- Data/Metrics: lg to 2xl, font-semibold (tabular numbers)
- Labels: sm to base, font-medium

## Layout System
**Spacing Units:** Consistent use of 4, 6, 8, 12, 16, 20, 24 (Tailwind units)
- Component padding: p-6 to p-8
- Section spacing: py-12 to py-20
- Card spacing: p-6 with gap-6 between elements
- Form spacing: space-y-4 to space-y-6

**Grid:** max-w-7xl container with responsive breakpoints

## Core Components

### Landing Page
**Hero:** Full-width section (not forced viewport) with professional imagery showing an interview scenario or professional setting. Include headline, subheadline, primary CTA, and trust indicator ("Join 10,000+ interview-ready professionals").

**Sections (6-8 total):**
1. Features grid (3 columns desktop): Real-time feedback, Multilingual support, AI-powered analysis
2. How it works (4-step process with icons)
3. Domain coverage (cards showcasing Software, Marketing, Finance, HR domains)
4. Performance analytics preview (dashboard screenshot/visual)
5. Testimonials (2-column layout with user photos)
6. Pricing/CTA section
7. Footer (comprehensive with links, social, newsletter signup)

### Dashboard
**Layout:** Sidebar navigation (left) + main content area
- Sidebar: User profile card at top, navigation menu, session stats summary
- Main: Welcome header, "Start New Interview" prominent CTA card, session history table/grid with filters
- Session cards: Domain badge, date, overall score (large), "View Report" CTA

### Interview Setup
**Flow:** Multi-step card-based selection
1. Domain selection: Grid of domain cards with icons
2. Difficulty level: Radio button cards (Beginner/Intermediate/Advanced)
3. Language preference: Dropdown with flags
4. Confirmation: Summary card with "Start Interview" CTA

### Interview Session (Critical Interface)
**Layout:** Split-screen design
- Left panel (40%): Video preview window with real-time feedback indicator overlay (circular badge in corner: green/red with pulse animation)
- Right panel (60%): Question card (large, centered), progress indicator (question X of Y), "Next Question" button, timer

**Feedback Indicator:** Floating circular badge on video preview
- Green state: Checkmark icon + "Good posture"
- Red state: Alert icon + "Adjust posture"
- Smooth transitions between states

**Controls:** Bottom bar with pause, end session buttons (ghost style, subtle)

### Performance Report
**Layout:** Full-width report with sections
1. Header: Overall score (large circular progress), date, domain
2. Question-by-question breakdown: Accordion or card list with:
   - Question text
   - Transcript
   - Score badge
   - AI feedback (expandable)
3. Strengths/Weaknesses: Two-column cards with bullet points
4. Behavioral insights: Timeline view of non-verbal cues
5. Recommendations: Numbered list with actionable items
6. Actions: "Practice Again", "Share Report", "Download PDF"

### Forms & Inputs
**Style:** Material Design inputs with floating labels
- Border: border-2 with focus:border state
- Spacing: py-3 px-4
- Validation: Inline error messages below field

### Buttons
**Primary:** Solid background, px-6 py-3, rounded-lg, font-semibold
**Secondary:** Border-2, transparent background
**Ghost:** No border, subtle hover background

### Cards
**Standard:** Rounded-xl, border, p-6, shadow-sm, hover:shadow-md transition
**Elevated:** shadow-lg for important elements (new interview CTA, report summary)

### Data Visualization
**Scores:** Circular progress indicators, horizontal bar charts
**Timeline:** Vertical timeline with icons for behavioral events
**Stats:** Metric cards with icon, number (large), label (small)

### Navigation
**Top Nav:** Logo left, menu items center, user avatar/profile right
**Sidebar:** Vertical menu with icons + labels, active state with accent border-left

## Images
**Hero Image:** Professional interview setting - two people in modern office environment, slight blur/overlay for text readability. Place behind hero content with subtle gradient overlay.

**Feature Section:** 3 smaller images showing: webcam analysis visualization, performance dashboard screenshot, mobile interface (if applicable).

**Dashboard:** No decorative images; focus on data and actionable content.

**Interview Session:** User's webcam feed only; no background images.

## Special Considerations
- **Accessibility:** High contrast ratios, clear focus states, screen reader support for score announcements
- **Real-time Feedback:** Use subtle animations (pulse, fade) for non-verbal indicators - avoid distracting motion during active interview
- **Data Density:** Use progressive disclosure (collapsible sections) in reports to prevent overwhelming users
- **Trust Building:** Show security badges, data privacy indicators, professional imagery throughout

**Color Note:** Color palette will be defined separately. Focus on creating clear hierarchy through spacing, typography weight, and component structure.