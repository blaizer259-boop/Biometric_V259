import * as faceapi from "face-api.js";

const DEFAULT_MODELS_URL = "/models";
const MATCH_DISTANCE_THRESHOLD = 0.6;
const DUPLICATE_FACE_THRESHOLD = 0.55;
const DESCRIPTOR_MIN_NORM = 0.01;
const CAPTURE_SAMPLE_COUNT = 3;
const SAMPLE_DELAY_MS = 220;
const MIN_FACE_HEIGHT_RATIO = 0.22;
const MAX_FACE_HEIGHT_RATIO = 0.48;

let supabaseClient = null;
let videoElement = null;
let modelsLoaded = false;

/**
 * Configure the module with your Supabase client and target video element.
 *
 * @param {object} options
 * @param {import("@supabase/supabase-js").SupabaseClient} options.supabase
 * @param {HTMLVideoElement|string} options.video
 * @param {string} [options.modelsUrl="/models"]
 */
export async function initFaceLogin({
  supabase,
  video,
  modelsUrl = DEFAULT_MODELS_URL,
}) {
  if (!supabase) {
    throw new Error("A Supabase client instance is required.");
  }

  supabaseClient = supabase;
  videoElement = resolveVideoElement(video);

  await loadFaceModels(modelsUrl);
  await startWebcam(videoElement);

  return {
    video: videoElement,
    modelsLoaded,
  };
}

export async function loadFaceModels(modelsUrl = DEFAULT_MODELS_URL) {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(modelsUrl),
    faceapi.nets.faceLandmark68Net.loadFromUri(modelsUrl),
    faceapi.nets.faceRecognitionNet.loadFromUri(modelsUrl),
  ]);

  modelsLoaded = true;
}

export async function startWebcam(video = videoElement) {
  const targetVideo = resolveVideoElement(video);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
    },
  });

  targetVideo.srcObject = stream;
  await targetVideo.play();

  return stream;
}

export async function registerFace(userEmail) {
  assertReady();

  if (!userEmail) {
    throw new Error("userEmail is required to register a face.");
  }

  const capture = await captureStableDescriptor();
  const faceDescriptor = descriptorToJson(capture.descriptor);
  const duplicate = await findDuplicateRegisteredFace(faceDescriptor, userEmail);

  if (duplicate) {
    throw new Error(
      `This face is already registered as ${duplicate.label}. Match score: ${duplicate.distance.toFixed(3)}.`,
    );
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .upsert({ email: userEmail, face_descriptor: faceDescriptor }, { onConflict: "email" })
    .select("id,email,face_descriptor")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(`Could not save a profile for email: ${userEmail}`);
  }

  return {
    profile: data,
    faceDescriptor,
  };
}

export async function loginWithFace() {
  assertReady();

  const capture = await captureStableDescriptor();
  const queryDescriptor = capture.descriptor;

  const { data: profiles, error } = await supabaseClient
    .from("profiles")
    .select("id,email,face_descriptor")
    .not("face_descriptor", "is", null);

  if (error) {
    throw error;
  }

  const labeledDescriptors = (profiles ?? [])
    .map(profileToLabeledDescriptor)
    .filter(Boolean);

  if (labeledDescriptors.length === 0) {
    throw new Error("No usable registered face descriptors were found. Register your face first.");
  }

  const matcher = new faceapi.FaceMatcher(labeledDescriptors, MATCH_DISTANCE_THRESHOLD);
  const bestMatch = matcher.findBestMatch(queryDescriptor);

  if (bestMatch.label !== "unknown" && bestMatch.distance < MATCH_DISTANCE_THRESHOLD) {
    window.location.href = "dashboard.html";
    return {
      matched: true,
      label: bestMatch.label,
      distance: bestMatch.distance,
      checkedProfiles: profiles.length,
      usableProfiles: labeledDescriptors.length,
      threshold: MATCH_DISTANCE_THRESHOLD,
    };
  }

  return {
    matched: false,
    label: bestMatch.label,
    distance: bestMatch.distance,
    checkedProfiles: profiles.length,
    usableProfiles: labeledDescriptors.length,
    threshold: MATCH_DISTANCE_THRESHOLD,
  };
}

async function findDuplicateRegisteredFace(faceDescriptor, userEmail) {
  const { data: profiles, error } = await supabaseClient
    .from("profiles")
    .select("id,email,face_descriptor")
    .not("face_descriptor", "is", null);

  if (error) {
    throw error;
  }

  const queryDescriptor = new Float32Array(faceDescriptor);
  let closestMatch = null;

  for (const profile of profiles ?? []) {
    if (profile.email === userEmail) {
      continue;
    }

    const descriptor = jsonToDescriptor(profile.face_descriptor);

    if (!descriptor) {
      continue;
    }

    const distance = faceapi.euclideanDistance(queryDescriptor, descriptor);

    if (!closestMatch || distance < closestMatch.distance) {
      closestMatch = {
        label: profile.email || profile.id,
        distance,
      };
    }
  }

  if (closestMatch && closestMatch.distance < DUPLICATE_FACE_THRESHOLD) {
    return closestMatch;
  }

  return null;
}

async function captureStableDescriptor() {
  const descriptors = [];
  let lastDetection = null;

  for (let index = 0; index < CAPTURE_SAMPLE_COUNT; index += 1) {
    const detection = await detectCurrentFace();
    validateFaceFraming(detection);

    descriptors.push(detection.descriptor);
    lastDetection = detection;

    if (index < CAPTURE_SAMPLE_COUNT - 1) {
      await delay(SAMPLE_DELAY_MS);
    }
  }

  return {
    descriptor: averageDescriptors(descriptors),
    framing: getFaceFraming(lastDetection),
  };
}

async function detectCurrentFace() {
  if (!videoElement || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error("The webcam video is not ready yet.");
  }

  const detection = await faceapi
    .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    throw new Error("No face detected. Look toward the camera and try again.");
  }

  return detection;
}

function validateFaceFraming(detection) {
  const framing = getFaceFraming(detection);

  if (framing.faceHeightRatio < MIN_FACE_HEIGHT_RATIO) {
    throw new Error(
      "Move closer and keep your face centered. Around 50cm from the camera works best.",
    );
  }

  if (framing.faceHeightRatio > MAX_FACE_HEIGHT_RATIO) {
    throw new Error(
      "Move back a little. Keep about 50cm between your face and the camera.",
    );
  }
}

function getFaceFraming(detection) {
  const frameHeight = videoElement.videoHeight || videoElement.clientHeight;
  const faceHeightRatio = detection.detection.box.height / frameHeight;

  return {
    faceHeightRatio,
  };
}

function averageDescriptors(descriptors) {
  const averaged = new Float32Array(128);

  for (const descriptor of descriptors) {
    descriptor.forEach((value, index) => {
      averaged[index] += value / descriptors.length;
    });
  }

  return averaged;
}

function descriptorToJson(descriptor) {
  const values = Array.from(descriptor, Number);

  if (values.length !== 128 || values.some(value => !Number.isFinite(value))) {
    throw new Error("Invalid face descriptor. Expected 128 finite numbers.");
  }

  return values;
}

function profileToLabeledDescriptor(profile) {
  const descriptor = jsonToDescriptor(profile.face_descriptor);

  if (!descriptor) {
    return null;
  }

  return new faceapi.LabeledFaceDescriptors(
    String(profile.email || profile.id),
    [descriptor],
  );
}

function jsonToDescriptor(value) {
  const descriptorArray = typeof value === "string" ? JSON.parse(value) : value;

  if (!Array.isArray(descriptorArray) || descriptorArray.length !== 128) {
    return null;
  }

  const descriptor = new Float32Array(descriptorArray.map(Number));

  if (Array.from(descriptor).some(number => !Number.isFinite(number))) {
    return null;
  }

  const norm = Math.hypot(...descriptor);

  if (norm < DESCRIPTOR_MIN_NORM) {
    return null;
  }

  return descriptor;
}

function resolveVideoElement(video) {
  const element = typeof video === "string" ? document.querySelector(video) : video;

  if (!(element instanceof HTMLVideoElement)) {
    throw new Error("A valid HTML video element or selector is required.");
  }

  return element;
}

function delay(milliseconds) {
  return new Promise(resolve => {
    window.setTimeout(resolve, milliseconds);
  });
}

function assertReady() {
  if (!modelsLoaded) {
    throw new Error("Face models are not loaded. Call initFaceLogin() first.");
  }

  if (!supabaseClient) {
    throw new Error("Supabase is not configured. Call initFaceLogin() first.");
  }

  if (!videoElement) {
    throw new Error("Video element is not configured. Call initFaceLogin() first.");
  }
}
