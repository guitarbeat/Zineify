import * as THREE from 'three';

export const MINI_ZINE_STACKS = [
  { index: 0, x: -1.5, topPage: 5, bottomPage: 6, bookletDepth: -1.5 },
  { index: 1, x: -0.5, topPage: 4, bottomPage: 7, bookletDepth: -0.5 },
  { index: 2, x: 0.5, topPage: 3, bottomPage: 8, bookletDepth: 0.5 },
  { index: 3, x: 1.5, topPage: 2, bottomPage: 1, bookletDepth: 1.5 }
];

const CONNECTIONS = [
  { from: 5, to: 4, orientation: 'horizontal' },
  { from: 4, to: 3, orientation: 'horizontal' },
  { from: 3, to: 2, orientation: 'horizontal' },
  { from: 6, to: 7, orientation: 'horizontal' },
  { from: 7, to: 8, orientation: 'horizontal' },
  { from: 8, to: 1, orientation: 'horizontal' },
  { from: 5, to: 6, orientation: 'vertical' },
  { from: 2, to: 1, orientation: 'vertical' }
];

const TMP_VEC_A = new THREE.Vector3();
const TMP_QUAT_A = new THREE.Quaternion();
const TMP_QUAT_B = new THREE.Quaternion();
const TMP_EULER = new THREE.Euler(0, 0, 0, 'XYZ');
const TMP_VEC_B = new THREE.Vector3();

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - (2 * t));
}

function poseToQuaternion(rotation) {
  TMP_EULER.set(rotation.x, rotation.y, rotation.z, 'XYZ');
  return TMP_QUAT_A.setFromEuler(TMP_EULER).clone();
}

function getRotatedHorizontalOffset(angle, offsetX) {
  return TMP_VEC_B.set(offsetX, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).clone();
}

function computeChainRawOrigins(stackAngles, w) {
  const origins = [
    { x: 0, z: 0 }
  ];

  for (let index = 1; index < MINI_ZINE_STACKS.length; index += 1) {
    const prevOrigin = origins[index - 1];
    const prevRight = getRotatedHorizontalOffset(stackAngles[index - 1], w / 2);
    const nextLeft = getRotatedHorizontalOffset(stackAngles[index], -w / 2);

    origins.push({
      x: prevOrigin.x + prevRight.x - nextLeft.x,
      z: prevOrigin.z + prevRight.z - nextLeft.z
    });
  }

  // Anchor the chain at the midpoint between the left stop point (0-1 hinge) and right stop point (2-3 hinge)
  const stopLeftOffset = getRotatedHorizontalOffset(stackAngles[0], w / 2);
  const stopRightOffset = getRotatedHorizontalOffset(stackAngles[2], w / 2);
  const stopLeft = {
    x: origins[0].x + stopLeftOffset.x,
    z: origins[0].z + stopLeftOffset.z
  };
  const stopRight = {
    x: origins[2].x + stopRightOffset.x,
    z: origins[2].z + stopRightOffset.z
  };
  const midX = (stopLeft.x + stopRight.x) / 2;
  const midZ = (stopLeft.z + stopRight.z) / 2;

  return origins.map((origin) => ({
    x: origin.x - midX,
    z: origin.z - midZ
  }));
}

function buildPageState(args) {
  const pageId = args.pageId;
  const stackIndex = args.stackIndex;
  const stackPose = args.stackPose;
  const localCenter = args.localCenter;
  const localRotationX = args.localRotationX;
  const stackQuaternion = poseToQuaternion(stackPose.rotation);
  const localQuaternion = TMP_QUAT_B.setFromAxisAngle(new THREE.Vector3(1, 0, 0), localRotationX).clone();
  const worldQuaternion = stackQuaternion.clone().multiply(localQuaternion);
  const worldCenter = TMP_VEC_A.copy(localCenter).applyQuaternion(worldQuaternion).add(new THREE.Vector3(
    stackPose.position.x,
    stackPose.position.y,
    stackPose.position.z
  ));
  const worldEuler = new THREE.Euler().setFromQuaternion(worldQuaternion, 'XYZ');

  return {
    id: pageId,
    stackIndex,
    stackPose,
    position: {
      x: worldCenter.x,
      y: worldCenter.y,
      z: worldCenter.z
    },
    rotation: {
      x: worldEuler.x,
      y: worldEuler.y,
      z: worldEuler.z
    },
    quaternion: {
      x: worldQuaternion.x,
      y: worldQuaternion.y,
      z: worldQuaternion.z,
      w: worldQuaternion.w
    }
  };
}

function getEdgePoint(pageState, edge, dimensions) {
  const w = dimensions.w;
  const h = dimensions.h;
  const localPoint = new THREE.Vector3(
    edge === 'left' ? -w / 2 : edge === 'right' ? w / 2 : 0,
    edge === 'top' ? h / 2 : edge === 'bottom' ? -h / 2 : 0,
    0
  );
  const worldQuaternion = new THREE.Quaternion(
    pageState.quaternion.x,
    pageState.quaternion.y,
    pageState.quaternion.z,
    pageState.quaternion.w
  );

  return localPoint.applyQuaternion(worldQuaternion).add(new THREE.Vector3(
    pageState.position.x,
    pageState.position.y,
    pageState.position.z
  ));
}

function computeBounds(pageStates, dimensions) {
  const w = dimensions.w;
  const h = dimensions.h;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };

  Object.values(pageStates).forEach((pageState) => {
    const corners = [
      new THREE.Vector3(-w / 2, -h / 2, 0),
      new THREE.Vector3(w / 2, -h / 2, 0),
      new THREE.Vector3(w / 2, h / 2, 0),
      new THREE.Vector3(-w / 2, h / 2, 0)
    ];
    const quaternion = new THREE.Quaternion(
      pageState.quaternion.x,
      pageState.quaternion.y,
      pageState.quaternion.z,
      pageState.quaternion.w
    );

    corners.forEach((corner) => {
      corner.applyQuaternion(quaternion).add(new THREE.Vector3(
        pageState.position.x,
        pageState.position.y,
        pageState.position.z
      ));

      min.x = Math.min(min.x, corner.x);
      min.y = Math.min(min.y, corner.y);
      min.z = Math.min(min.z, corner.z);
      max.x = Math.max(max.x, corner.x);
      max.y = Math.max(max.y, corner.y);
      max.z = Math.max(max.z, corner.z);
    });
  });

  return { min, max };
}

function computeStackStates(stackOrigins, stackAngles) {
  return MINI_ZINE_STACKS.map((stack, index) => ({
    ...stack,
    pose: {
      position: {
        x: stackOrigins[index].x,
        y: 0,
        z: stackOrigins[index].z
      },
      rotation: {
        x: 0,
        y: stackAngles[index],
        z: 0
      }
    }
  }));
}

function computePages(bottomStacks, topStacks, topFoldAngle, h) {
  const pages = {};

  MINI_ZINE_STACKS.forEach((stackDef, index) => {
    const isInnerStack = index === 1 || index === 2;
    const bottomStackState = bottomStacks[index];
    const topStackState = topStacks[index];
    const bottomRotX = 0;
    const topRotX = topFoldAngle;

    pages[stackDef.bottomPage] = {
      ...buildPageState({
        pageId: stackDef.bottomPage,
        stackIndex: index,
        stackPose: bottomStackState.pose,
        localCenter: new THREE.Vector3(0, -h / 2, 0),
        localRotationX: bottomRotX
      }),
      isInnerPanel: isInnerStack,
      localOffsetY: 0,
      localLiftZ: 0,
      localRotationX: bottomRotX
    };
    pages[stackDef.topPage] = {
      ...buildPageState({
        pageId: stackDef.topPage,
        stackIndex: index,
        stackPose: topStackState.pose,
        localCenter: new THREE.Vector3(0, h / 2, 0),
        localRotationX: topRotX
      }),
      isInnerPanel: isInnerStack,
      localOffsetY: 0,
      localLiftZ: 0,
      localRotationX: topRotX
    };
  });
  return pages;
}

function computeSeamGaps(pages, w, h) {
  return CONNECTIONS.map((connection) => {
    const pageA = pages[connection.from];
    const pageB = pages[connection.to];
    const start = connection.orientation === 'horizontal'
      ? getEdgePoint(pageA, 'right', { w, h })
      : getEdgePoint(pageA, 'bottom', { w, h });
    const end = connection.orientation === 'horizontal'
      ? getEdgePoint(pageB, 'left', { w, h })
      : getEdgePoint(pageB, 'top', { w, h });

    return {
      ...connection,
      gap: start.distanceTo(end),
      start: { x: start.x, y: start.y, z: start.z },
      end: { x: end.x, y: end.y, z: end.z }
    };
  });
}

function tentWindow(value, center, halfSpan) {
  const dist = Math.abs(value - center);
  if (dist >= halfSpan) {
    return 0;
  }
  return smoothstep(1 - (dist / halfSpan));
}

export function computeMiniZineFoldState(progress, dimensions = {}) {
  const w = dimensions.w ?? 1;
  const h = dimensions.h ?? 1.414;
  const stackDepthStep = dimensions.stackDepthStep ?? 0.008;

  // Step 2 (progress = 0.20): Fold in half widthwise, crease, and unfold
  const halfCrease = tentWindow(progress, 0.2, 0.16);

  // Step 3 (progress = 0.40): Fold outer edges to center crease to make 8 panels
  const quarterCrease = tentWindow(progress, 0.4, 0.16);

  // Step 4 (progress = 0.60): Cut along center crease & Step 5 (progress = 0.80): Unfold completely flat
  let cutInspection = 0;
  if (progress > 0.44 && progress < 0.94) {
    if (progress <= 0.6) {
      cutInspection = smoothstep((progress - 0.44) / 0.16) * 0.72;
    } else if (progress <= 0.8) {
      cutInspection = 0.72 + (smoothstep((progress - 0.6) / 0.2) * 0.28);
    } else {
      cutInspection = 1 - smoothstep((progress - 0.8) / 0.14);
    }
  }
  const cutSlitStage = tentWindow(progress, 0.6, 0.15);

  // Combined creaseAmount for legacy stage inspection
  const creaseAmount = Math.max(halfCrease, quarterCrease);

  // Step 6 (progress = 1.00): Fold lengthwise (hotdog style) with printed side facing out
  // Completes by progress = 0.95 while vertical creases are flat, then gentle strip tent opens at 0.95 -> 1.0
  let horizontalFold = 0;
  if (progress > 0.81 && progress < 0.95) {
    horizontalFold = smoothstep((progress - 0.81) / 0.14);
  } else if (progress >= 0.95) {
    horizontalFold = 1;
  }

  // Gentle diamond mouth opening on the Folded Strip (Step 6, matching step-5-fold-strip.png)
  let stripTent = 0;
  if (progress > 0.95 && progress <= 1.0) {
    stripTent = smoothstep((progress - 0.95) / 0.05);
  } else if (progress > 1.0) {
    stripTent = 1;
  }

  // Step 7 (progress = 2.00): Push outer ends inward so center slit opens into a full 90° diamond
  const diamondOpen = smoothstep(clamp01(progress - 1));

  // Step 8 (progress = 3.00): Wrap pages around into 8-page booklet
  const bookletClose = smoothstep(clamp01(progress - 2));

  // Positive rotation folds the top row behind (-Z) the bottom row so front pages stay visible
  const topFoldAngle = Math.PI * horizontalFold;

  const halfFoldAngle = 0.38 * halfCrease + (0.14 * cutSlitStage);
  const outerQuarterAngle = 0.62 * quarterCrease;

  // Inner diamond angle: 0.28 rad (~16°) at Step 6 (Fold Strip) -> π/2 (90°) at Step 7 (Diamond)
  const stripTentRad = 0.28;
  const innerDiamondAngle = (stripTent * stripTentRad) + (diamondOpen * ((Math.PI / 2) - stripTentRad));
  const frontLeafWrap = -Math.PI * bookletClose;

  // Bottom chain (Front row when folded: Pages 6, 7, 8, 1)
  // Pages 7 & 8 bow FORWARD (+Z) in Steps 6 & 7, then wrap around spine (-X -> -Z) in Step 8
  const bottomStackAngles = [
    (-(Math.PI / 2) * bookletClose) + halfFoldAngle - outerQuarterAngle,
    -innerDiamondAngle + frontLeafWrap + halfFoldAngle,
    innerDiamondAngle + frontLeafWrap - halfFoldAngle,
    ((Math.PI / 2) * bookletClose) - halfFoldAngle + outerQuarterAngle
  ];

  // Top chain (Back row when folded: Pages 5, 4, 3, 2)
  // Pages 4 & 3 bow BACKWARD (-Z) in Steps 6 & 7 (opposite to 7 & 8!), forming a true 4-sided diamond
  const topStackAngles = [
    (-(Math.PI / 2) * bookletClose) + halfFoldAngle - outerQuarterAngle,
    innerDiamondAngle + halfFoldAngle,
    -innerDiamondAngle - halfFoldAngle,
    ((Math.PI / 2) * bookletClose) - halfFoldAngle + outerQuarterAngle
  ];

  const rawBottomOrigins = computeChainRawOrigins(bottomStackAngles, w);
  const rawTopOrigins = computeChainRawOrigins(topStackAngles, w);

  // Center the assembly in X and Z, and apply subtle page-order layering in Step 8 (Booklet)
  const allRawX = [...rawBottomOrigins.map((o) => o.x), ...rawTopOrigins.map((o) => o.x)];
  const allRawZ = [...rawBottomOrigins.map((o) => o.z), ...rawTopOrigins.map((o) => o.z)];
  const centerX = (Math.min(...allRawX) + Math.max(...allRawX)) / 2;
  const centerZ = (Math.min(...allRawZ) + Math.max(...allRawZ)) / 2;

  const bottomOrigins = rawBottomOrigins.map((origin, index) => ({
    x: origin.x - centerX,
    z: (origin.z - centerZ) + (MINI_ZINE_STACKS[index].bookletDepth * stackDepthStep * bookletClose)
  }));

  const topOrigins = rawTopOrigins.map((origin, index) => ({
    x: origin.x - centerX,
    z: (origin.z - centerZ) + (MINI_ZINE_STACKS[index].bookletDepth * stackDepthStep * bookletClose)
  }));

  const bottomStacks = computeStackStates(bottomOrigins, bottomStackAngles);
  const topStacks = computeStackStates(topOrigins, topStackAngles);
  const pages = computePages(bottomStacks, topStacks, topFoldAngle, h);
  const seamGaps = computeSeamGaps(pages, w, h);

  return {
    progress,
    stages: {
      halfCrease,
      quarterCrease,
      cutSlitStage,
      creaseAmount,
      stripTent,
      horizontalFold,
      cutInspection,
      diamondOpen,
      bookletClose
    },
    topFoldAngle,
    stacks: bottomStacks,
    bottomStacks,
    topStacks,
    pages,
    seamGaps,
    bounds: computeBounds(pages, { w, h })
  };
}
