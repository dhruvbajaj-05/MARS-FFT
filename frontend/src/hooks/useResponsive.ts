import { useWindowDimensions } from 'react-native';

// Breakpoint-driven responsive helper. Drives phone → tablet layout shifts
// (1-col list vs 2-col master/detail, KPI grid column counts).
export function useResponsive() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const isLargeTablet = width >= 1024;

  return {
    width,
    isPhone: width < 768,
    isTablet,
    isLargeTablet,
    // Sensible column count for KPI/card grids.
    gridColumns: isLargeTablet ? 4 : isTablet ? 3 : 2,
  };
}
