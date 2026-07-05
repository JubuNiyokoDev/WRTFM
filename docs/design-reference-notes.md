# WRTFM Design Reference Notes

External reference analyzed during the redesign:

- Flutter theme structure
- quick action card patterns
- status card layout patterns
- shimmer loading patterns
- mobile-first screenshots

Design rules to preserve:

- Dark-first app surface: `#0D0D0D` background, `#1A1A1A` and `#2A2A2A` cards.
- Inter typography with large, readable mobile-style text.
- Primary violet `#6C5CE7`, secondary lavender `#A29BFE`, accent coral `#FF8A80`, success `#00B894`.
- Cards use 16-20px radii, status cards can go to 28px.
- Inputs use filled dark surfaces, 14px radius, violet focus border.
- Icon style should be outline/stroke-rounded; use lucide equivalents in React.
- Main interaction pattern: status cards, quick action gradient cards, icon buttons, bottom nav with coral floating plus.
- Loading states use shimmer blocks, not plain pulse.
