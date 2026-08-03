export const PLINTH_ICON_VIEW_BOX = 64;

export type PlinthIconGeometry = {
  centerX: number;
  top: number;
  capitalWidth: number;
  capitalHeight: number;
  shoulderInset: number;
  shaftTop: number;
  shaftBottom: number;
  shaftWidth: number;
  fluteCount: number;
  fluteGap: number;
  footTop: number;
  baseBottom: number;
  baseWidth: number;
};

// These are the knobs for refining the silhouette. The proportions deliberately
// shorten the reference plinth so it reads clearly inside a square app icon.
export const PLINTH_ICON_GEOMETRY: PlinthIconGeometry = {
  centerX: 32,
  top: 9,
  capitalWidth: 40,
  capitalHeight: 8,
  shoulderInset: 5,
  shaftTop: 22,
  shaftBottom: 44,
  shaftWidth: 23,
  fluteCount: 5,
  fluteGap: 1.8,
  footTop: 44,
  baseBottom: 55,
  baseWidth: 38,
};

const number = (value: number) => Number(value.toFixed(2));

export function createPlinthIconPaths(geometry: PlinthIconGeometry = PLINTH_ICON_GEOMETRY): string[] {
  const {
    centerX,
    top,
    capitalWidth,
    capitalHeight,
    shoulderInset,
    shaftTop,
    shaftBottom,
    shaftWidth,
    fluteCount,
    fluteGap,
    footTop,
    baseBottom,
    baseWidth,
  } = geometry;
  const capitalLeft = centerX - capitalWidth / 2;
  const capitalRight = centerX + capitalWidth / 2;
  const shaftLeft = centerX - shaftWidth / 2;
  const shaftRight = centerX + shaftWidth / 2;
  const baseLeft = centerX - baseWidth / 2;
  const baseRight = centerX + baseWidth / 2;
  const ribWidth = (shaftWidth - fluteGap * (fluteCount - 1)) / fluteCount;
  const paths = [
    `M${capitalLeft + 3} ${top}H${capitalRight - 3}Q${capitalRight} ${top} ${capitalRight} ${top + 3}V${top + capitalHeight - 2}Q${capitalRight} ${top + capitalHeight} ${capitalRight - 3} ${top + capitalHeight}H${capitalLeft + 3}Q${capitalLeft} ${top + capitalHeight} ${capitalLeft} ${top + capitalHeight - 2}V${top + 3}Q${capitalLeft} ${top} ${capitalLeft + 3} ${top}Z`,
    `M${capitalLeft + shoulderInset} ${top + capitalHeight}H${capitalRight - shoulderInset}L${shaftRight} ${shaftTop}H${shaftLeft}Z`,
  ];

  for (let index = 0; index < fluteCount; index += 1) {
    const x = shaftLeft + index * (ribWidth + fluteGap);
    const taper = Math.abs(index - (fluteCount - 1) / 2) * 0.18;
    paths.push(
      `M${number(x)} ${shaftTop}H${number(x + ribWidth)}L${number(x + ribWidth - taper)} ${shaftBottom}H${number(x + taper)}Z`,
    );
  }

  paths.push(
    `M${shaftLeft} ${footTop}H${shaftRight}L${baseRight - 4} ${footTop + 6}H${baseLeft + 4}Z`,
    `M${baseLeft + 3} ${footTop + 6}H${baseRight - 3}Q${baseRight} ${footTop + 6} ${baseRight} ${footTop + 9}V${baseBottom}H${baseLeft}V${footTop + 9}Q${baseLeft} ${footTop + 6} ${baseLeft + 3} ${footTop + 6}Z`,
  );

  return paths;
}
