// "Volver arriba" appears once the page has scrolled past this offset and hides again near the top.
export const BACK_TO_TOP_OFFSET = 350;
export const shouldShowBackToTop = (offsetY: number, threshold = BACK_TO_TOP_OFFSET) => offsetY > threshold;
