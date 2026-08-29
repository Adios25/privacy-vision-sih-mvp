// YOLO Visual Perception Unit Tests for Privvy
const assert = require('assert').strict;

// Mock classes/functions from popup.js to run in Node.js
function intersectionOverUnion(boxA, boxB) {
  const xA = Math.max(boxA[0], boxB[0]);
  const yA = Math.max(boxA[1], boxB[1]);
  const xB = Math.min(boxA[0] + boxA[2], boxB[0] + boxB[2]);
  const yB = Math.min(boxA[1] + boxA[3], boxB[1] + boxB[3]);

  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const boxAArea = boxA[2] * boxA[3];
  const boxBArea = boxB[2] * boxB[3];

  const unionArea = boxAArea + boxBArea - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
}

function nonMaximumSuppression(candidates, iouThreshold = 0.45) {
  candidates.sort((a, b) => b.confidence - a.confidence);
  const selected = [];
  for (const cand of candidates) {
    let keep = true;
    for (const sel of selected) {
      if (intersectionOverUnion(cand.bbox, sel.bbox) > iouThreshold) {
        keep = false;
        break;
      }
    }
    if (keep) {
      selected.push(cand);
    }
  }
  return selected;
}

const PRIVACY_POLICY = {
  "person": { category: "FACE", action: "REDACT" },
  "face": { category: "FACE", action: "REDACT" },
  "signature": { category: "SIGNATURE", action: "REDACT" },
  "id card": { category: "IDENTITY_DOCUMENT", action: "REDACT" },
  "passport": { category: "IDENTITY_DOCUMENT", action: "REDACT" },
  "qr code": { category: "QR_BARCODE", action: "REDACT" }
};

// Tests
function testIoU() {
  console.log("Running Test: Intersection Over Union (IoU) Calculation...");
  
  // No overlap
  const box1 = [0, 0, 10, 10];
  const box2 = [20, 20, 10, 10];
  assert.equal(intersectionOverUnion(box1, box2), 0);

  // Exact overlap
  assert.equal(intersectionOverUnion(box1, box1), 1.0);

  // Partial overlap (50% area)
  const box3 = [0, 0, 10, 10];
  const box4 = [5, 0, 10, 10]; // Intersection is 5x10 = 50. Union is 100 + 100 - 50 = 150. IoU = 50/150 = 0.3333
  assert.ok(Math.abs(intersectionOverUnion(box3, box4) - 0.3333) < 0.001);
  
  console.log("  ✓ IoU Test Passed.");
}

function testNMS() {
  console.log("Running Test: Non-Maximum Suppression (NMS)...");
  
  const candidates = [
    { classId: 0, confidence: 0.9, bbox: [100, 100, 50, 50] },
    { classId: 0, confidence: 0.8, bbox: [102, 102, 48, 48] }, // Highly overlapping box
    { classId: 0, confidence: 0.4, bbox: [300, 300, 50, 50] }  // Distinct box
  ];

  const filtered = nonMaximumSuppression(candidates, 0.45);
  
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].confidence, 0.9);
  assert.equal(filtered[1].confidence, 0.4);
  
  console.log("  ✓ NMS Test Passed.");
}

function testCoordinateConversion() {
  console.log("Running Test: Bounding Box Coordinate Conversion & Aspect Ratio Preservation...");
  
  // Viewport: 1920x1080 screenshot
  const imgWidth = 1920;
  const imgHeight = 1080;
  
  // YOLO input is 640x640.
  // Preprocessing scale/letterbox logic:
  const scale = Math.min(640 / imgWidth, 640 / imgHeight); // 640/1920 = 0.3333
  const newWidth = Math.round(imgWidth * scale); // 640
  const newHeight = Math.round(imgHeight * scale); // 360
  const padX = Math.floor((640 - newWidth) / 2); // 0
  const padY = Math.floor((640 - newHeight) / 2); // 140
  
  // A simulated detection of a person box in YOLO 640x640:
  // Let's say a face is at center in the resized 360px height.
  // In 640x640, it is at x=200, y=140+180=320, width=100, height=100
  const yoloBox = [200, 320, 100, 100];
  
  // Conversion back to original viewport:
  const [x, y, w, h] = yoloBox;
  const origX = (x - padX) / scale;
  const origY = (y - padY) / scale;
  const origW = w / scale;
  const origH = h / scale;
  
  assert.equal(Math.round(origX), 600); // 200 / 0.3333 = 600
  assert.equal(Math.round(origY), 540); // (320 - 140) / 0.3333 = 540
  assert.equal(Math.round(origW), 300); // 100 / 0.3333 = 300
  assert.equal(Math.round(origH), 300); // 100 / 0.3333 = 300
  
  console.log("  ✓ Bounding Box Coordinate Conversion Test Passed.");
}

function testPrivacyPolicyMapping() {
  console.log("Running Test: Privacy Policy Mapping...");
  
  const yoloDetections = [
    { class: "person", confidence: 0.95, bbox: { x: 100, y: 100, width: 50, height: 50 } },
    { class: "laptop", confidence: 0.88, bbox: { x: 200, y: 200, width: 80, height: 80 } }
  ];

  const redactions = [];
  for (const det of yoloDetections) {
    const policy = PRIVACY_POLICY[det.class];
    if (policy && policy.action === 'REDACT') {
      redactions.push({
        category: policy.category,
        source: 'YOLO11n',
        confidence: det.confidence,
        rect: det.bbox
      });
    }
  }

  // Expect only "person" to be mapped to "FACE" category for redaction, while "laptop" is skipped.
  assert.equal(redactions.length, 1);
  assert.equal(redactions[0].category, "FACE");
  assert.equal(redactions[0].source, "YOLO11n");
  assert.equal(redactions[0].confidence, 0.95);
  
  console.log("  ✓ Privacy Policy Mapping Test Passed.");
}

function runAll() {
  console.log("=== PRIVVY YOLO INTEGRATION TEST SUITE ===\n");
  testIoU();
  testNMS();
  testCoordinateConversion();
  testPrivacyPolicyMapping();
  console.log("\nAll visual perception unit tests passed successfully!");
}

runAll();
